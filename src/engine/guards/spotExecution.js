import { prisma } from '../../lib/db.js';
import { logPhase } from '../aiBase.js';
import { calculateSLPrice, calculateTPTiers } from '../../utils/priceMath.js';
import { 
  mapAISymbolToExchange, 
  checkMarketAvailability, 
  checkRiskGuard, 
  enterTWAPLimit 
} from './guardUtils.js';

export async function closeSpotAsset(client, botConfigId, symbol, safeReason = '-') {
  try {
    const rawSymbol = String(symbol || '').trim();
    if (!rawSymbol) return false;

    // Base symbol extraction
    const base = rawSymbol.includes('/') ? rawSymbol.split('/')[0] : rawSymbol;
    const mappedSymbol = `${base}/USDT`;

    await client.loadMarkets().catch(() => {});
    if (!client.markets || !client.markets[mappedSymbol]) {
      return false;
    }

    const balance = await client.fetchBalance({ type: 'spot' }).catch(() => ({}));
    const coinBalanceRaw = (balance[base] && typeof balance[base] === 'object') ? balance[base].free : (balance.free && balance.free[base]);
    const coinBalance = parseFloat(coinBalanceRaw || 0);

    if (!Number.isFinite(coinBalance) || coinBalance <= 0) {
      return false;
    }

    const ticker = await client.fetchTicker(mappedSymbol).catch(() => ({}));
    const currentPrice = Number(ticker.last || ticker.close || ticker.bid || 0);
    const valueUsdt = (coinBalance * currentPrice);

    if (valueUsdt < 2) {
      return false;
    }

    const precisionAmountStr = client.amountToPrecision(mappedSymbol, coinBalance);
    const finalAmount = parseFloat(precisionAmountStr);

    try {
      await client.createMarketSellOrder(mappedSymbol, finalAmount);
      await logPhase(botConfigId, 'TRIGGER', `🧠 AI Force Close: ขายทำกำไร ${base} จำนวน ${finalAmount} คืนเป็น USDT สำเร็จ (เหตุผล: ${safeReason})`);
      return true;
    } catch (err) {
      if (err.message && err.message.includes('Minimum amount') || err.message.includes('Minimum notional')) {
          await logPhase(botConfigId, 'TRIGGER', `⚠️ AI Force Close: สั่งขาย ${base} ไม่สำเร็จเนื่องจากมูลค่าน้อยกว่าขั้นต่ำของตลาด`);
          return false;
      }
      throw err;
    }
  } catch (error) {
    console.error('[SpotExecution] Force close failed:', error.message);
    return false;
  }
}

export async function executeSpotStrategy(client, config, botConfigId, tasks, candidates = []) {
  try {
    const marketType = 'SPOT';
    await client.loadMarkets().catch(() => {});

    const planTrades = Array.isArray(tasks?.trades) ? tasks.trades : [];
    
    for (const task of planTrades) {
      try {
        const { symbol, side, amount: rawAmount, strategy, confidence, stopLossPercent } = task;
        const normalizedSide = String(side || '').trim().toLowerCase();
        
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
          await logPhase(botConfigId, 'IMPLEMENT', `REJECT: เหรียญ ${mappedSymbol} ไม่มีในตลาด SPOT`);
          continue;
        }

        if (normalizedSide === 'sell') {
           await closeSpotAsset(client, botConfigId, symbol, 'AI Spot Sell Intercept');
           continue;
        }

        const user = config.User;
        const exchangeId = config.exchangeId || user?.activeExchange || 'bitget';
        const hasNativeDemo = config.isPaperTrading && (user.bitgetDemoApiKey || user.binanceDemoApiKey);
        const isShadowMode = confidence < 70 || strategy === 'SHADOW_TRADE' || (config.isPaperTrading && !hasNativeDemo);

        let freeBalanceUsdt = 0;
        try {
          const balance = await client.fetchBalance();
          const p1 = (balance['USDT'] && typeof balance['USDT'] === 'object') ? (balance['USDT'].free || 0) : 0;
          const p2 = (balance.free && balance.free['USDT']) || 0;
          freeBalanceUsdt = Math.max(parseFloat(p1), parseFloat(p2));

          if (freeBalanceUsdt < valueUsdt) {
            await logPhase(botConfigId, 'IMPLEMENT', `⚠️ ยอดเงินไม่พอในบัญชี SPOT: ต้องการ ${valueUsdt.toFixed(2)} USDT แต่มีเพียง ${freeBalanceUsdt.toFixed(2)} USDT`);
            continue;
          }
        } catch (balErr) {
          console.warn('[SpotExec] Balance check failed:', balErr.message);
        }

        const ticker = await client.fetchTicker(mappedSymbol);
        const safeEntryPrice = normalizedSide === 'buy' ? (ticker.bid || ticker.last || ticker.close) : (ticker.ask || ticker.last || ticker.close);
        const entryPrice = Number(safeEntryPrice);
        
        if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
          throw new Error(`Invalid entry price for ${mappedSymbol}`);
        }

        const stopLossPrice = calculateSLPrice(entryPrice, normalizedSide, stopLossPercent);
        const tpTiers = calculateTPTiers(entryPrice, normalizedSide, stopLossPercent);

        const modeLabel = isShadowMode ? 'Shadow (Sim)' : (config.isPaperTrading ? `Demo (${exchangeId.toUpperCase()})` : `Live (${exchangeId.toUpperCase()})`);
        await logPhase(botConfigId, 'IMPLEMENT', `Signal LONG (Spot) ${mappedSymbol} (${symbol}): ${modeLabel} (${confidence}%)`);

        if (isShadowMode) {
          await logPhase(botConfigId, 'IMPLEMENT', 'Shadow Mode: ข้ามการส่งคำสั่งไปที่กระดานจริง');
          continue;
        }

        const tpPrice = tpTiers && tpTiers.tp1 ? tpTiers.tp1.price : null;
        await enterTWAPLimit(client, mappedSymbol, normalizedSide, valueUsdt, 'DIRECTIONAL', botConfigId, stopLossPrice, tpPrice, marketType);

      } catch (taskErr) {
        console.error(`[SpotExec] Task Failure for ${task.symbol}:`, taskErr.message);
        await logPhase(botConfigId, 'IMPLEMENT', `❌ การส่งคำสั่ง ${task.symbol} ล้มเหลว: ${taskErr.message}`);
      }
    }
  } catch (error) {
    console.error('SpotExecution Error:', error);
    throw error;
  }
}
