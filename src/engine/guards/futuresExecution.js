import { prisma } from '../../lib/db.js';
import { logPhase } from '../aiBase.js';
import { calculateSLPrice, calculateTPTiers } from '../../utils/priceMath.js';
import { calculateMaxLeverage } from '../mathGuard.js';
import { 
  mapAISymbolToExchange, 
  mapSymbolForExchange,
  checkMarketAvailability, 
  checkRiskGuard, 
  enterTWAPLimit 
} from './guardUtils.js';

export async function closeFuturesPosition(client, botConfigId, symbol, side = null, safeReason = '-') {
  try {
    const rawSymbol = String(symbol || '').trim();
    if (!rawSymbol) return false;

    await client.loadMarkets().catch(() => {});
    const marketType = 'FUTURES';
    const mappedSymbol = mapSymbolForExchange(rawSymbol, marketType, client);
    const base = rawSymbol.includes('/') ? rawSymbol.split('/')[0] : rawSymbol;
    const candidateSymbols = new Set([String(mappedSymbol || '').trim()].filter(Boolean));
    
    if (String(mappedSymbol || '').includes('/USDT:USDT')) {
      candidateSymbols.add(`${base}/SUSDT:SUSDT`);
    }
    if (String(mappedSymbol || '').includes('/SUSDT:SUSDT')) {
      candidateSymbols.add(`${base}/USDT:USDT`);
    }

    const normalizePosSide = (raw) => {
      const r = String(raw || '').toLowerCase();
      if (r.includes('short')) return 'SHORT';
      if (r.includes('sell')) return 'SHORT';
      return 'LONG';
    };
    const desiredSide = side ? String(side).toUpperCase() : null;

    const positions = await client.fetchPositions().catch(() => []);
    const matches = (positions || []).filter(p => {
      const contracts = Number(p.contracts || 0);
      if (!Number.isFinite(contracts) || contracts <= 0) return false;
      if (!candidateSymbols.has(String(p.symbol))) return false;
      if (desiredSide && normalizePosSide(p.side || p.info?.holdSide || p.info?.posSide) !== desiredSide) return false;
      return true;
    });

    if (matches.length === 0) {
      await logPhase(botConfigId, 'TRIGGER', `⚠️ AI Force Close: ไม่พบสถานะ ${mappedSymbol} บนกระดาน (เหตุผล: ${safeReason})`);
      return false;
    }

    const normalizeErrText = (e) => {
      if (!e) return '';
      if (typeof e === 'string') return e;
      const msg = e?.message ? String(e.message) : '';
      if (msg) return msg;
      try {
        return JSON.stringify(e);
      } catch (_e2) {
        return String(e);
      }
    };

    const looksLikeUnilateralMismatch = (e) => {
      const m = normalizeErrText(e);
      return m.includes('40774') || m.toLowerCase().includes('unilateral position');
    };

    const looksLikeNoPositionToClose = (e) => {
      const m = normalizeErrText(e);
      return m.includes('22002') || m.toLowerCase().includes('no position to close');
    };

    for (const p of matches) {
      const posSide = normalizePosSide(p.side || p.info?.holdSide || p.info?.posSide);
      const contracts = Number(p.contracts || 0);
      const precisionAmount = client.amountToPrecision(p.symbol, contracts);
      const posSideLower = posSide === 'SHORT' ? 'short' : 'long';
      const amountNum = parseFloat(precisionAmount);

      const holdMode = String(p.info?.posMode || p.info?.holdMode || '').toLowerCase();
      const hedgedFromExchange = holdMode === 'hedge_mode' ? true : holdMode === 'one_way_mode' ? false : null;

      const buildCloseRequest = (hedged) => {
        if (hedged) {
          return {
            side: posSide === 'LONG' ? 'sell' : 'buy',
            params: { reduceOnly: true, hedged: true, posSide: posSideLower, holdSide: posSideLower }
          };
        }
        return {
          side: posSide === 'LONG' ? 'sell' : 'buy',
          params: { reduceOnly: true, oneWayMode: true, holdSide: posSide === 'LONG' ? 'buy' : 'sell' }
        };
      };

      const attempts = [];
      if (hedgedFromExchange !== null) attempts.push(buildCloseRequest(hedgedFromExchange));
      attempts.push(buildCloseRequest(true));
      attempts.push(buildCloseRequest(false));

      let lastErr = null;
      for (const a of attempts) {
        try {
          await client.createOrder(p.symbol, 'market', a.side, amountNum, undefined, a.params);
          lastErr = null;
          break;
        } catch (e1) {
          if (looksLikeNoPositionToClose(e1)) {
            lastErr = null;
            break;
          }
          lastErr = e1;
          const isMismatch = looksLikeUnilateralMismatch(e1);
          if (!isMismatch) break;
        }
      }

      if (lastErr) throw lastErr;
    }

    let closedOk = false;
    for (let i = 0; i < 5; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const after = await client.fetchPositions().catch(() => []);
      const stillOpen = (after || []).some(p => {
        const c = Number(p.contracts || 0);
        return c > 0 && candidateSymbols.has(String(p.symbol));
      });
      if (!stillOpen) { closedOk = true; break; }
    }

    const ticker = await client.fetchTicker(mappedSymbol).catch(() => ({}));
    const exitPrice = Number(ticker.last || ticker.close || 0);
    const entryPrice = Number(matches[0]?.entryPrice || 0);
    const posSide = normalizePosSide(matches[0]?.side || matches[0]?.info?.holdSide || matches[0]?.info?.posSide);
    const pnlPercent = entryPrice > 0 && exitPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0;
    const adjustedPnl = posSide === 'SHORT' ? -pnlPercent : pnlPercent;
    const sideLabel = desiredSide || posSide;

    if (closedOk) {
      await logPhase(botConfigId, 'TRIGGER', `🧠 AI Force Close: ปิดสถานะ ${mappedSymbol} (${sideLabel}) สำเร็จ (เหตุผล: ${safeReason}) — PNL ${adjustedPnl.toFixed(2)}%`);
      return true;
    } else {
      await logPhase(botConfigId, 'TRIGGER', `⚠️ AI Force Close: สั่งปิด ${mappedSymbol} แล้วแต่ยังพบคงเหลือบนกระดาน (เหตุผล: ${safeReason})`);
      return false;
    }
  } catch (error) {
    console.error('[FuturesExecution] Force close failed:', error.message);
    return false;
  }
}

export async function executeFuturesStrategy(client, engineClientSpot, config, botConfigId, tasks, candidates = []) {
  try {
    const marketType = 'FUTURES';
    if (!client) {
      await logPhase(botConfigId, 'IMPLEMENT', `REJECT: โหมด FUTURE ต้องการ Futures Client แต่ไม่พบการตั้งค่า API Key`);
      return;
    }

    await client.loadMarkets().catch(() => {});
    if (engineClientSpot) await engineClientSpot.loadMarkets().catch(() => {});

    const planTrades = Array.isArray(tasks?.trades) ? tasks.trades : [];
    let attemptedTrades = 0;
    let executedTrades = 0;
    let skippedNoMarket = 0;

    for (const task of planTrades) {
      try {
        const { symbol, side, amount: rawAmount, strategy, confidence, stopLossPercent } = task;
        attemptedTrades += 1;
        
        const normalizedSideRaw = String(side || '').trim().toLowerCase();
        const normalizedSide = normalizedSideRaw === 'long' ? 'buy' : normalizedSideRaw === 'short' ? 'sell' : normalizedSideRaw;
        
        if (normalizedSide !== 'buy' && normalizedSide !== 'sell') {
          await logPhase(botConfigId, 'IMPLEMENT', `REJECT: side ไม่ถูกต้องสำหรับ ${symbol} (ต้องเป็น buy/sell)`);
          continue;
        }

        const mappedSymbol = mapAISymbolToExchange(symbol, candidates, marketType, client);

        const amountFromAI = Number(rawAmount);
        const allocatedBudget = Number(config.allocatedPortfolioUsdt);
        const maxSplits = Number(config.maxSplits) > 0 ? Number(config.maxSplits) : 10;
        const defaultUsdt = Number.isFinite(allocatedBudget) && allocatedBudget > 0 ? allocatedBudget / maxSplits : 10;
        const valueUsdt = Number.isFinite(amountFromAI) && amountFromAI > 0 ? amountFromAI : Math.max(5, defaultUsdt);

        const riskCheck = await checkRiskGuard(client, botConfigId, marketType, mappedSymbol, valueUsdt);
        if (!riskCheck.safe) {
          await logPhase(botConfigId, 'IMPLEMENT', riskCheck.reason);
          continue;
        }

        if (!checkMarketAvailability(client, mappedSymbol, marketType)) {
          skippedNoMarket += 1;
          await logPhase(botConfigId, 'IMPLEMENT', `REJECT: เหรียญ ${mappedSymbol} ไม่มีในตลาด FUTURES`);
          continue;
        }

        const user = config.User;
        const hasNativeDemo = config.isPaperTrading && !!user.bitgetDemoApiKey;
        const isShadowMode = confidence < 70 || strategy === 'SHADOW_TRADE' || (config.isPaperTrading && !hasNativeDemo);

        // Futures Balance Guard w/ Auto-Transfer Capability
        let freeBalance = 0;
        let detectedAsset = 'USDT';
        try {
          const balance = await client.fetchBalance({ type: 'swap' }).catch(() => client.fetchBalance());
          const possibleAssets = ['USDT', 'SUSDT', 'USDC'];

          for (const asset of possibleAssets) {
            const free1 = (balance[asset] && typeof balance[asset] === 'object') ? (balance[asset].free || 0) : 0;
            const free2 = (balance.free && balance.free[asset]) || 0;
            const currentFree = Math.max(parseFloat(free1), parseFloat(free2));
            if (currentFree > freeBalance) {
              freeBalance = currentFree;
              detectedAsset = asset;
            }
          }

          if (freeBalance < valueUsdt) {
            let diagnosticMsg = `⚠️ ยอดเงินไม่พอในบัญชี FUTURES: ต้องการ ${valueUsdt} USDT แต่มีเพียง ${freeBalance.toFixed(2)} ${detectedAsset}`;
            
            // Auto transfer from spot
            if (engineClientSpot) {
               const spotBal = await engineClientSpot.fetchBalance({ type: 'spot' }).catch(() => engineClientSpot.fetchBalance());
               let spotFree = 0;
               for (const asset of possibleAssets) {
                 const f1 = (spotBal[asset] && typeof spotBal[asset] === 'object') ? (spotBal[asset].free || 0) : 0;
                 const f2 = (spotBal.free && spotBal.free[asset]) || 0;
                 spotFree = Math.max(spotFree, parseFloat(f1), parseFloat(f2));
               }

               if (spotFree >= valueUsdt) {
                 await logPhase(botConfigId, 'IMPLEMENT', `[Engine] ♻️ Auto-Transfer: กำลังโอนเงิน ${valueUsdt} ${detectedAsset} จาก SPOT ไปยัง FUTURES อัตโนมัติ...`);
                 try {
                   await engineClientSpot.transfer(detectedAsset, valueUsdt, 'spot', 'usdt-margined');
                   await logPhase(botConfigId, 'IMPLEMENT', `[Engine] ✅ Auto-Transfer สำเร็จ`);
                   freeBalance += valueUsdt; // Simulate updated balance
                 } catch (firstErr) {
                   try {
                     await engineClientSpot.transfer(detectedAsset, valueUsdt, 'spot', 'mix');
                     await logPhase(botConfigId, 'IMPLEMENT', `[Engine] ✅ Auto-Transfer สำเร็จ`);
                     freeBalance += valueUsdt;
                   } catch (secErr) {
                     diagnosticMsg += `\n❌ โอนเงินกระฟันเฟืองล้มเหลว (รองรับเฉพาะบัญชีแบบ Unified)`;
                   }
                 }
               }
            }

            if (freeBalance < valueUsdt) {
              await logPhase(botConfigId, 'IMPLEMENT', diagnosticMsg);
              continue;
            }
          }
        } catch (balErr) {
          console.warn('[FuturesExec] Balance/Transfer check failed:', balErr.message);
        }

        const ticker = await client.fetchTicker(mappedSymbol);
        const safeEntryPrice = normalizedSide === 'buy' ? (ticker.bid || ticker.last || ticker.close) : (ticker.ask || ticker.last || ticker.close);
        const entryPrice = Number(safeEntryPrice);
        
        if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
          throw new Error(`Invalid entry price for ${mappedSymbol}`);
        }

        const stopLossPrice = calculateSLPrice(entryPrice, normalizedSide, stopLossPercent);
        const tpTiers = calculateTPTiers(entryPrice, normalizedSide, stopLossPercent);

        const trancheSide = normalizedSide === 'sell' ? 'SHORT' : 'LONG';
        const modeLabel = isShadowMode ? 'Shadow (Sim)' : (config.isPaperTrading ? 'Demo (Bitget)' : 'Live (Bitget)');
        
        await logPhase(botConfigId, 'IMPLEMENT', `Signal ${trancheSide} ${mappedSymbol} (${symbol}): ${modeLabel} (${confidence}%)`);

        if (isShadowMode) {
          await logPhase(botConfigId, 'IMPLEMENT', 'Shadow Mode: ข้ามการส่งคำสั่งไปที่กระดานจริง');
          executedTrades += 1;
          continue;
        }

        if (stopLossPercent) {
          const maxLev = calculateMaxLeverage(stopLossPercent);
          const safeLeverage = Math.max(1, Math.floor(maxLev));
          try {
            await client.setMarginMode('isolated', mappedSymbol);
            await client.setLeverage(safeLeverage, mappedSymbol);
          } catch (e) {}
        }

        const tpPrice = tpTiers && tpTiers.tp1 ? tpTiers.tp1.price : null;
        await enterTWAPLimit(client, mappedSymbol, normalizedSide, valueUsdt, 'DIRECTIONAL', botConfigId, stopLossPrice, tpPrice, marketType);
        executedTrades += 1;

      } catch (taskErr) {
        console.error(`[FuturesExec] Task Failure for ${task.symbol}:`, taskErr.message);
        await logPhase(botConfigId, 'IMPLEMENT', `❌ การส่งคำสั่ง ${task.symbol} ล้มเหลว: ${taskErr.message}`);
      }
    }

    if (attemptedTrades > 0 && executedTrades === 0 && skippedNoMarket === attemptedTrades) {
      await logPhase(botConfigId, 'IMPLEMENT', '❌ ยกเลิกแผน: คู่เหรียญทั้งหมดไม่พบในตลาด FUTURES (ข้ามการส่งคำสั่งทั้งหมด)');
    }
  } catch (error) {
    console.error('FuturesExecution Error:', error);
    throw error;
  }
}
