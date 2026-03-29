import { PrismaClient } from '@prisma/client';
import { calculateMaxLeverage } from './mathGuard.js';
import { calculateSLPrice, calculateTPTiers } from '../utils/priceMath.js';
import { logPhase } from './aiBase.js';

const prisma = new PrismaClient();

/**
 * Map symbol to correct Bitget format
 * Handles futures symbols that need settlement currency suffix
 */
function mapSymbolForExchange(symbol, marketType, client) {
  try {
    if (!symbol || !client || !client.markets) {
      return symbol;
    }
    
    // For futures/swaps, prioritize finding the swap market
    if (marketType === 'FUTURES' || marketType === 'MIXED') {
      let baseSymbol = symbol.includes('/') ? symbol.split('/')[0] : symbol;
      const quoteSymbol = symbol.includes('/') ? symbol.split('/')[1] : 'USDT';
      
      // Smart Substitution for Futures: WBTC -> BTC
      if (baseSymbol === 'WBTC') {
        console.log(`[SymbolMapper] Substituting Spot-only WBTC with BTC for Futures.`);
        baseSymbol = 'BTC';
      }

      // If it's already a swap symbol, return it
      if (symbol.includes(':')) return symbol;

      // Force linear swap format for Bitget V2 if no markets loaded yet
      if (!client.markets || Object.keys(client.markets).length === 0) {
        return `${baseSymbol}/${quoteSymbol}:${quoteSymbol}`;
      }

      // Variations to try (Standard CCXT Futures formats)
      const variations = [
        `${baseSymbol}/${quoteSymbol}:${quoteSymbol}`, // Linear: BTC/USDT:USDT
        `${baseSymbol}/${quoteSymbol}:${baseSymbol}`,   // Inverse: BTC/USD:BTC
      ];

      // 1. Try variations first
      for (const variation of variations) {
        if (client.markets[variation] && client.markets[variation].type === 'swap') {
          console.log(`[SymbolMapper] Prioritized Futures: ${symbol} -> ${variation}`);
          return variation;
        }
      }

      // 2. Check if the exact symbol is already a swap market
      if (client.markets[symbol] && client.markets[symbol].type === 'swap') {
        return symbol;
      }
      
      // 3. Fallback to any market starting with the base/quote but only if it's swap
      const candidates = Object.keys(client.markets).filter(m => 
        m.startsWith(`${baseSymbol}/${quoteSymbol || ''}`) && client.markets[m].type === 'swap'
      );
      
      if (candidates.length > 0) {
        console.log(`[SymbolMapper] Found alternative swap: ${symbol} -> ${candidates[0]}`);
        return candidates[0];
      }

      // If marketType is forced FUTURES, we should probably NOT return a spot symbol
      // but if we can't find anything, we return original as last resort
    }
    
    return symbol;
  } catch (error) {
    console.warn('[SymbolMapper] Error mapping symbol:', error.message);
    return symbol;
  }
}


/**
 * Execution Guard - Master Prompt
 */
/**
 * Map AI-generated symbol back to correct exchange symbol using candidates data
 */
function mapAISymbolToExchange(aiSymbol, candidates, marketType, client) {
  try {
    if (!aiSymbol || !client || !client.markets) {
      return aiSymbol;
    }
    
    const isFuturesContext = marketType === 'FUTURES' || (client.options && client.options.defaultType === 'swap');

    // If we are in a futures context, try to force the swap symbol format first
    if (isFuturesContext) {
      const base = aiSymbol.includes('/') ? aiSymbol.split('/')[0] : aiSymbol;
      const quote = aiSymbol.includes('/') ? aiSymbol.split('/')[1] : 'USDT';
      
      // Substitution for WBTC -> BTC in futures
      const finalBase = base === 'WBTC' ? 'BTC' : base;
      const swapSymbol = `${finalBase}/${quote}:${quote}`;
      
      if (client.markets[swapSymbol]) {
        return swapSymbol;
      }
    }

    // First check if AI symbol exists directly on exchange
    if (client.markets[aiSymbol]) {
      // Even if it exists, if we are in futures and this is a spot symbol, keep looking
      if (isFuturesContext && client.markets[aiSymbol].type === 'spot') {
        // Continue to fallback mapping
      } else {
        return aiSymbol;
      }
    }
    
    // Look for symbol in candidates to find the correct exchange symbol
    const candidate = candidates.find(c => 
      (c.originalSymbol === aiSymbol) || (c.symbol === aiSymbol)
    );
    
    if (candidate && candidate.symbol) {
      // Again, if in futures, check if the candidate is actually a swap
      if (isFuturesContext && !candidate.symbol.includes(':')) {
         // Continue to fallback mapping to get the :USDT version
      } else {
        console.log(`[SymbolMapper] AI symbol ${aiSymbol} mapped to exchange symbol ${candidate.symbol}`);
        return candidate.symbol;
      }
    }
    
    // Fallback to original mapping function
    return mapSymbolForExchange(aiSymbol, marketType, client);
  } catch (error) {
    console.warn('[SymbolMapper] Error mapping AI symbol:', error.message);
    return aiSymbol;
  }
}

/**
 * Check if the symbol exists in the exchange's markets for the given market type.
 */
function checkMarketAvailability(client, symbol, marketType) {
  if (!client || !client.markets) return false;
  
  const market = client.markets[symbol];
  if (!market) return false;

  // Final sanity check: if marketType is FUTURES, the found market MUST be swap
  if (marketType === 'FUTURES' && market.type !== 'swap') {
    return false;
  }
  
  return true;
}

/**
 * Risk Guard: Check if it's safe to open a new position
 * Prevents over-leveraging and liquidation risks
 */
async function checkRiskGuard(client, botConfigId, marketType, _symbol, orderValueUsdt = null) {
  try {
    // Margin Usage Check (only for Futures)
    if (marketType === 'FUTURES') {
      const balance = await client.fetchBalance({ type: 'swap' }).catch(() => client.fetchBalance());
      
      // For Bitget V2 Futures
      const total = parseFloat(balance.total?.USDT || balance.total?.SUSDT || 0);
      const used = parseFloat(balance.used?.USDT || balance.used?.SUSDT || 0);
      
      if (total > 0) {
        const marginUsagePercent = (used / total) * 100;
        const capUsdt = total * 0.5;
        const remainingCapUsdt = capUsdt - used;

        if (typeof orderValueUsdt === 'number' && Number.isFinite(orderValueUsdt)) {
          if (remainingCapUsdt <= 0) {
            return {
              safe: false,
              reason: `🚨 REJECT: ใช้เงินทุน Futures เกิน 50% แล้ว (Used: ${used.toFixed(2)} / Cap: ${capUsdt.toFixed(2)} USDT) — หากมี Position ที่ดีกว่า ให้ปิดของเดิมก่อนครับ`
            };
          }
          if (orderValueUsdt > remainingCapUsdt) {
            return {
              safe: false,
              reason: `🚨 REJECT: วงเงินเปิด Position (Futures) เกิน 50% ของพอร์ต — เปิดเพิ่มได้อีก ${remainingCapUsdt.toFixed(2)} USDT แต่คำสั่งนี้ใช้ ${orderValueUsdt.toFixed(2)} USDT (ถ้าไม้ใหม่ดีกว่าให้ปิดของเดิมก่อน)`
            };
          }
        }
        
        // Safety threshold: 50% of futures equity used is already high for automated systems
        if (marginUsagePercent > 50) {
           return { 
             safe: false, 
             reason: `🚨 REJECT: การใช้เงินทุน Futures สูงเกินไป (${marginUsagePercent.toFixed(1)}%): พอร์ตของคุณมีความเสี่ยงสูงต่อการโดน Liquidation หากเปิด Position เพิ่มในขณะนี้ครับ` 
           };
        }
      }
    }
    
    return { safe: true };
  } catch (error) {
    console.warn('[RiskGuard] Error checking safety:', error.message);
    return { safe: true }; // Proceed if check fails to avoid blocking (failsafe)
  }
}

export async function executeStrategy(engineClientSpot, engineClientFutures, tasks, botConfigId, candidates = []) {
  try {
    const config = await prisma.botConfig.findUnique({ 
      where: { id: botConfigId },
      include: { User: true }
    });
    if (!config) return;

    const extractMarketTypeFromDirectives = (directives) => {
      const text = String(directives || '');
      const marker = text.match(/\[\[\s*MARKET_TYPE\s*=\s*(SPOT|FUTURES|MIXED)\s*\]\]/i);
      if (marker?.[1]) return marker[1].toUpperCase();
      const alt = text.match(/MARKET_TYPE\s*[:=]\s*(SPOT|FUTURES|MIXED)/i);
      if (alt?.[1]) return alt[1].toUpperCase();
      return null;
    };
    const marketType = extractMarketTypeFromDirectives(config.aiDirectives) || config.marketType || 'SPOT';

    // Pre-load markets for both clients
    if (engineClientSpot) await engineClientSpot.loadMarkets().catch(() => {});
    if (engineClientFutures) await engineClientFutures.loadMarkets().catch(() => {});

    const planTrades = Array.isArray(tasks?.trades) ? tasks.trades : [];
    let attemptedTrades = 0;
    let executedTrades = 0;
    let skippedNoMarket = 0;

    for (const task of planTrades) {
      try {
        const { symbol, side, amount: rawAmount, strategy, confidence, stopLossPercent, sector: _sector } = task;
        attemptedTrades += 1;
        const normalizedSideRaw = String(side || '').trim().toLowerCase();
        const normalizedSide =
          normalizedSideRaw === 'long'
            ? 'buy'
            : normalizedSideRaw === 'short'
              ? 'sell'
              : normalizedSideRaw;
        if (normalizedSide !== 'buy' && normalizedSide !== 'sell') {
          await prisma.aILogStream.create({
            data: {
              botConfigId,
              step: 'IMPLEMENT',
              content: `REJECT: side ไม่ถูกต้องสำหรับ ${symbol} (ต้องเป็น buy/sell)`,
              status: 'FAILED'
            }
          });
          continue;
        }

        // Determine client early to check market availability
        const priceClient =
          marketType === 'SPOT'
            ? engineClientSpot
            : marketType === 'FUTURES'
              ? engineClientFutures
              : (normalizedSide === 'sell' && marketType === 'MIXED')
                ? engineClientFutures
                : engineClientFutures || engineClientSpot;

        let finalClient = priceClient;
        if (marketType === 'FUTURES') {
          if (!engineClientFutures) {
            await prisma.aILogStream.create({
              data: {
                botConfigId,
                step: 'IMPLEMENT',
                content: `REJECT: โหมด FUTURE ต้องการ Futures Client แต่ไม่พบการตั้งค่า API Key`,
                status: 'FAILED'
              }
            });
            continue;
          }
          finalClient = engineClientFutures;
        }

        if (!finalClient) {
          await prisma.aILogStream.create({
            data: {
              botConfigId,
              step: 'IMPLEMENT',
              content: `MarketType Guard: ไม่มี client สำหรับ ${marketType} (${symbol})`,
              status: 'FAILED'
            }
          });
          continue;
        }

        // Map AI-generated symbol to correct exchange symbol
        const mappedSymbol = mapAISymbolToExchange(symbol, candidates, marketType, finalClient);
        const effectiveMarketType = finalClient === engineClientFutures ? 'FUTURES' : 'SPOT';

        const amountFromAI = Number(rawAmount);
        const allocatedBudget = Number(config.allocatedPortfolioUsdt);
        const maxSplits = Number(config.maxSplits) > 0 ? Number(config.maxSplits) : 10;
        const defaultUsdt = Number.isFinite(allocatedBudget) && allocatedBudget > 0 ? allocatedBudget / maxSplits : 10;
        const valueUsdt =
          Number.isFinite(amountFromAI) && amountFromAI > 0
            ? amountFromAI
            : Math.max(5, defaultUsdt);

        // [New] Risk Guard Check in IMPLEMENT phase
        const riskCheck = await checkRiskGuard(finalClient, botConfigId, marketType, mappedSymbol, valueUsdt);
        if (!riskCheck.safe) {
           await prisma.aILogStream.create({
             data: {
               botConfigId,
               step: 'IMPLEMENT',
               content: riskCheck.reason,
               status: 'FAILED'
             }
           });
           continue;
        }

        // [New] Market Existence Guard in IMPLEMENT phase
        if (!finalClient.markets || Object.keys(finalClient.markets).length === 0) {
          await finalClient.loadMarkets().catch(() => {});
        }
        if (!checkMarketAvailability(finalClient, mappedSymbol, effectiveMarketType)) {
          const marketLabel = effectiveMarketType;
          if (marketLabel === 'FUTURES') skippedNoMarket += 1;
          await prisma.aILogStream.create({
            data: {
              botConfigId,
              step: 'IMPLEMENT',
              content: `REJECT: เหรียญ ${mappedSymbol} ไม่มีในตลาด ${marketLabel} (ข้ามแผน/ข้าม TASK CHECK)`,
              status: 'FAILED'
            }
          });
          console.log(`[ExecGuard] Market Existence Guard: ${mappedSymbol} not found in ${marketLabel} markets. Skipping.`);
          continue;
        }

        // 1. SPOT Market Guard
        if (marketType === 'SPOT' && normalizedSide === 'sell') {
          await prisma.aILogStream.create({
            data: {
              botConfigId,
              step: 'IMPLEMENT',
              content: 'REJECT SHORT: ตลาด SPOT อนุญาตเฉพาะ Long/Hold เท่านั้น (ข้ามขั้นตอน TASK CHECK)',
              status: 'FAILED'
            }
          });
          continue;
        }


      const user = config.User;
      const hasNativeDemo = config.isPaperTrading && !!user.bitgetDemoApiKey;
      const isShadowMode = confidence < 70 || strategy === 'SHADOW_TRADE' || (config.isPaperTrading && !hasNativeDemo);

      // 2. Pre-trade Balance Guard
      try {
        const balance = await finalClient.fetchBalance();
        
        // Bitget can return balance under USDT, SUSDT, or USDC depending on account type
        const possibleAssets = ['USDT', 'SUSDT', 'USDC'];
        let freeBalance = 0;
        let detectedAsset = 'USDT';

        for (const asset of possibleAssets) {
          // Check both common CCXT formats: balance[asset].free and balance.free[asset]
          const free1 = (balance[asset] && typeof balance[asset] === 'object') ? (balance[asset].free || 0) : 0;
          const free2 = (balance.free && balance.free[asset]) || 0;
          const currentFree = Math.max(parseFloat(free1), parseFloat(free2));
          
          if (currentFree > freeBalance) {
            freeBalance = currentFree;
            detectedAsset = asset;
          }
        }
        
        if (freeBalance < valueUsdt) {
          // Diagnostic: check if funds exist in the "other" account
          try {
            const otherClient = (marketType === 'FUTURES' || marketType === 'MIXED' || (marketType === 'SPOT' && normalizedSide === 'buy')) 
              ? (finalClient === engineClientFutures ? engineClientSpot : engineClientFutures)
              : null;
            
            if (otherClient) {
              const otherBal = await otherClient.fetchBalance();
              const otherType = (otherClient === engineClientSpot) ? 'SPOT' : 'FUTURES';
              
              let otherValue = 0;
              for (const asset of possibleAssets) {
                const f1 = (otherBal[asset] && typeof otherBal[asset] === 'object') ? (otherBal[asset].free || 0) : 0;
                const f2 = (otherBal.free && otherBal.free[asset]) || 0;
                otherValue = Math.max(otherValue, parseFloat(f1), parseFloat(f2));
              }
              
              if (otherValue >= valueUsdt) {
                // AUTO-TRANSFER LOGIC
                // In Bitget V2, 'usdt-margined' is the standard label for USDT-M Futures (Mix)
                const fromType = otherType.toLowerCase() === 'spot' ? 'spot' : 'usdt-margined';
                const toType = (finalClient === engineClientFutures) ? 'usdt-margined' : 'spot';
                
                await logPhase(botConfigId, 'IMPLEMENT', `[Engine] ♻️ Auto-Transfer: กำลังโอนเงิน ${valueUsdt} ${detectedAsset} จาก ${otherType} ไปยัง ${marketType} อัตโนมัติ...`);
                
                try {
                  // Bitget CCXT transfer: (code, amount, from, to, params)
                  await otherClient.transfer(detectedAsset, valueUsdt, fromType, toType);
                } catch (firstTryErr) {
                  // Fallback for Demo/Legacy labels
                  if (firstTryErr.message && String(firstTryErr.message).includes('404')) {
                    const legacyFrom = otherType.toLowerCase() === 'spot' ? 'spot' : 'mix';
                    const legacyTo = (finalClient === engineClientFutures) ? 'mix' : 'spot';
                    try {
                      await otherClient.transfer(detectedAsset, valueUsdt, legacyFrom, legacyTo);
                    } catch (legacyErr) {
                      // Ultra-safe check for sandbox
                      const apiUrls = finalClient.urls || {};
                      const apiUrlString = String(apiUrls.api || '');
                      const isSandbox = apiUrlString.toLowerCase().indexOf('sandbox') !== -1;
                      
                      if (isSandbox) {
                         // Deactivate bot immediately for security
                         await prisma.botConfig.update({
                           where: { id: botConfigId },
                           data: { isActive: false }
                         });
                         
                         throw new Error(`[CRITICAL_BALANCE] ระบบโอนอัตโนมัติไม่รองรับในโหมด Demo — บอทหยุดทำงานชั่วคราวเพื่อให้คุณเติมเงินเข้ากระเป๋า ${marketType} ด้วยตนเองครับ`);
                      }
                      throw legacyErr;
                    }
                  } else {
                    throw firstTryErr;
                  }
                }
                
                await logPhase(botConfigId, 'IMPLEMENT', `[Engine] ✅ Auto-Transfer สำเร็จ: ยอดเงินพร้อมสำหรับการเทรดแล้ว`);
                
                // Refresh balance
                const newBal = await finalClient.fetchBalance();
                const nf1 = (newBal[detectedAsset] && typeof newBal[detectedAsset] === 'object') ? (newBal[detectedAsset].free || 0) : 0;
                const nf2 = (newBal.free && newBal.free[detectedAsset]) || 0;
                freeBalance = Math.max(parseFloat(nf1), parseFloat(nf2));
                
                if (freeBalance < valueUsdt) {
                    throw new Error(`Transfer appeared successful but ${marketType} balance is still ${freeBalance}`);
                }
              } else {
                // Fallback to warning
                let diagnosticMsg = `⚠️ ยอดเงินไม่พอในบัญชี ${marketType}: ต้องการ ${valueUsdt} USDT แต่มีเพียง ${freeBalance.toFixed(2)} ${detectedAsset} (${symbol})`;
                if (otherValue > 0) {
                   diagnosticMsg += `\n💡 พบยอดเงินเพียง ${otherValue.toFixed(2)} USDT ในบัญชี ${otherType} (รวมแล้วก็ยังไม่พอ)`;
                }
                
                await logPhase(botConfigId, 'IMPLEMENT', diagnosticMsg);
                continue;
              }
            }
          } catch (diagErr) {
            console.error('[AutoTransfer] Failure:', diagErr.message);
            
            let finalMsg = `⚠️ ยอดเงินไม่พอและระบบโอนอัตโนมัติขัดข้อง: ${diagErr.message}`;
            
            // If it's paper trading and transfer failed, it's often a demo limit. 
            // Better stop the bot to let the user know they need to intervene.
            if (config.isPaperTrading || diagErr.message.includes('[CRITICAL_BALANCE]')) {
               finalMsg = `🚨 บอทหยุดทำงาน: ระบบโอนเงินอัตโนมัติขัดข้องในโหมด Demo — กรุณาเติมเงินเข้ากระเป๋า ${marketType} ด้วยตนเองครับ`;
               await prisma.botConfig.update({
                 where: { id: botConfigId },
                 data: { isActive: false }
               });
               // Propagate error to main loop for cleanup
               throw new Error(`[CRITICAL_BALANCE] ${finalMsg}`);
            }

            await logPhase(botConfigId, 'IMPLEMENT', finalMsg);
            continue;
          }
        }
      } catch (balErr) {
        console.warn('[ExecGuard] Balance check failed, proceeding with caution:', balErr.message);
      }

      const ticker = await finalClient.fetchTicker(mappedSymbol);
      const safeEntryPrice =
        normalizedSide === 'buy'
          ? (ticker.bid || ticker.last || ticker.close)
          : (ticker.ask || ticker.last || ticker.close);
      const entryPrice = Number(safeEntryPrice);
      if (!Number.isFinite(entryPrice) || entryPrice <= 0) {
        throw new Error(`Invalid entry price for ${mappedSymbol}`);
      }

      const stopLossPrice = calculateSLPrice(entryPrice, normalizedSide, stopLossPercent);
      const tpTiers = calculateTPTiers(entryPrice, normalizedSide, stopLossPercent);

      const amountBaseRaw = valueUsdt / entryPrice;
      const precisionAmountBase = finalClient.amountToPrecision(mappedSymbol, amountBaseRaw);
      const amountBase = parseFloat(precisionAmountBase);
      if (!Number.isFinite(amountBase) || amountBase <= 0) {
        throw new Error(`Invalid amount calculated for ${mappedSymbol}`);
      }

      const trancheSide =
        marketType === 'SPOT'
          ? 'LONG'
          : normalizedSide === 'sell'
            ? 'SHORT'
            : 'LONG';

      const actionLabel = trancheSide;
      const modeLabel = isShadowMode ? 'Shadow (Sim)' : (config.isPaperTrading ? 'Demo (Bitget)' : 'Live (Bitget)');
      await logPhase(botConfigId, 'IMPLEMENT', `Signal ${actionLabel} ${mappedSymbol} (${symbol}): ${modeLabel} (${confidence}%)`);

      if (isShadowMode) {
        await logPhase(botConfigId, 'IMPLEMENT', 'Shadow Mode: ข้ามการส่งคำสั่งไปที่ Bitget');
        executedTrades += 1;
        continue;
      }

      // 4. Execution
      const executionClient = finalClient;
      if (!executionClient) continue;

      const isFuturesExecution = executionClient === engineClientFutures;
      if (isFuturesExecution && stopLossPercent) {
        const maxLev = calculateMaxLeverage(stopLossPercent);
        const safeLeverage = Math.max(1, Math.floor(maxLev));
        try {
          await engineClientFutures.setMarginMode('isolated', mappedSymbol);
          await engineClientFutures.setLeverage(safeLeverage, mappedSymbol);
        } catch (e) {}
      }

      try {
        const tpPrice = tpTiers && tpTiers.tp1 ? tpTiers.tp1.price : null;
        await enterTWAPLimit(executionClient, mappedSymbol, normalizedSide, valueUsdt, 'DIRECTIONAL', botConfigId, stopLossPrice, tpPrice, marketType);
        executedTrades += 1;
        } catch (execErr) {
          if (execErr.name === 'InsufficientFunds' || execErr.message.includes('Insufficient balance') || execErr.message.includes('43012')) {
            await prisma.aILogStream.create({
              data: {
                botConfigId,
                step: 'IMPLEMENT',
                content: `🚨 ยอดเงินในบัญชีไม่เพียงพอสำหรับการเทรด ${mappedSymbol}: กรุณาตรวจสอบกระเป๋าเงินของคุณ`,
                status: 'FAILED'
              }
            });
          } else {
            throw execErr;
          }
        }
      } catch (taskErr) {
        console.error(`[ExecutionGuard] Task Failure for ${task.symbol}:`, taskErr.message);
        if (botConfigId) {
          await prisma.aILogStream.create({
            data: {
              botConfigId,
              step: 'IMPLEMENT',
              content: `❌ การส่งคำสั่ง ${task.symbol} ล้มเหลว: ${taskErr.message}`,
              status: 'FAILED'
            }
          });
        }
        // Continue to next task
        continue;
      }
    }
    if (attemptedTrades > 0 && executedTrades === 0 && skippedNoMarket === attemptedTrades) {
      await logPhase(botConfigId, 'IMPLEMENT', '❌ ยกเลิกแผน: คู่เหรียญทั้งหมดไม่พบในตลาด FUTURES (ข้ามการส่งคำสั่งทั้งหมด)');
    }
  } catch (error) {
    console.error('ExecutionGuard Error:', error);
    throw error;
  }
}

async function enterTWAPLimit(client, symbol, side, valueUsdt, type, botConfigId, slPrice = null, tpPrice = null, marketType = 'SPOT') {
  const params = {}; // Removed timeInForce: 'PO' as it might conflict with attached TP/SL
  
  // Load market details to check limits and precision
  const market = client.market(symbol);
  if (!market) {
    throw new Error(`Market ${symbol} not found on exchange.`);
  }

  // Native TP/SL for Bitget V2 (Mapped by CCXT) - Only supported for Futures (Swap)
  const isSwapClient = client.options && client.options.defaultType === 'swap';
  const isSwapSymbol = symbol.includes(':');
  
  // Strict Futures Order Check: Symbol MUST have colon OR client MUST be swap
  const isFuturesOrder = isSwapSymbol || (isSwapClient && market.type === 'swap');

  if (isFuturesOrder) {
    // CCXT Bitget V2 explicit TP/SL structure
    if (slPrice) {
      params.stopLoss = {
        'triggerPrice': client.priceToPrecision(symbol, slPrice),
        'type': 'market'
      };
    }
    if (tpPrice) {
      params.takeProfit = {
        'triggerPrice': client.priceToPrecision(symbol, tpPrice),
        'type': 'market'
      };
    }
    
    // Bitget V2: When using oneWayMode, omit posSide to avoid 'unilateral position type' mismatch
    params.tradeSide = 'open';
    params.oneWayMode = true; 
  } else {
    // SPOT market does not support native TP/SL in createOrder
    // We will rely on MathGuard to handle TP/SL via separate tick monitoring
    console.log(`[Engine] SPOT order for ${symbol}: Native TP/SL omitted (will be handled by MathGuard)`);
  }
  const ticker = await client.fetchTicker(symbol);
  
  if (ticker.bid && ticker.ask) {
    const spread = ((ticker.ask - ticker.bid) / ticker.bid) * 100;
    if (spread > 1.0) {
      if (botConfigId) {
        await prisma.aILogStream.create({
          data: {
            botConfigId,
            step: 'IMPLEMENT',
            content: `Spread Guard: ${spread.toFixed(2)}% > 1%. Rejected to avoid slippage.`,
            status: 'FAILED'
          }
        });
      }
      return;
    }
  }

  const processOrder = async (orderAmountUsdt, currentTicker) => {
    const safeLimit = side === 'buy' ? currentTicker.bid : currentTicker.ask;
    let amountCoins = orderAmountUsdt / safeLimit;

    // Apply Exchange Precision & Limits
    const precisionAmount = client.amountToPrecision(symbol, amountCoins);
    const precisionPrice = client.priceToPrecision(symbol, safeLimit);
    
    const finalAmount = parseFloat(precisionAmount);
    const minAmount = market.limits?.amount?.min || 0;
    const minCost = market.limits?.cost?.min || 0;
    const currentCost = finalAmount * parseFloat(precisionPrice);

    const amountPrecisionDigits = Number.isFinite(Number(market.precision?.amount)) ? Number(market.precision.amount) : null;
    const minPrecisionStep =
      amountPrecisionDigits !== null
        ? Math.pow(10, -amountPrecisionDigits)
        : 0;
    const effectiveMinAmount = Math.max(minAmount, minPrecisionStep);

    if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
      throw new Error(`จำนวนเหรียญไม่ถูกต้อง (${precisionAmount})`);
    }

    if (effectiveMinAmount > 0 && finalAmount < effectiveMinAmount) {
      const minNotional = effectiveMinAmount * parseFloat(precisionPrice);
      throw new Error(
        `จำนวนเหรียญ ${finalAmount} ต่ำกว่าขั้นต่ำ (${effectiveMinAmount} ${market.base}) — ต้องใช้เงินอย่างน้อยประมาณ ${minNotional.toFixed(2)} USDT`
      );
    }
    
    if (currentCost < minCost) {
       throw new Error(`มูลค่ารวม ${currentCost.toFixed(2)} USDT น้อยกว่าขั้นต่ำที่ตลาดกำหนด (${minCost} USDT)`);
    }

    await client.createLimitOrder(symbol, side, finalAmount, parseFloat(precisionPrice), params);
    
    if (botConfigId) {
      let actionLabel = side === 'buy' ? 'ซื้อ' : 'ขาย';
      if (marketType === 'FUTURES' || marketType === 'MIXED') {
        actionLabel = side === 'buy' ? 'เปิด LONG' : 'เปิด SHORT';
      }
      
      await prisma.aILogStream.create({
        data: {
          botConfigId,
          step: 'IMPLEMENT',
          content: `[Engine] ✅ วางคำสั่ง${actionLabel} ${symbol} เรียบร้อยแล้วที่ราคา ${precisionPrice} (รอการจับคู่ใน Open Orders)`,
          status: 'SUCCESS'
        }
      });
    }
  };

  if (valueUsdt > 5000) {
    const chunkUsdt = 500;
    const slices = Math.floor(valueUsdt / chunkUsdt);
    for (let i = 0; i < slices; i++) {
      const freshTicker = await client.fetchTicker(symbol);
      await processOrder(chunkUsdt, freshTicker);
      await new Promise(r => setTimeout(r, 2000));
    }
  } else {
    await processOrder(valueUsdt, ticker);
  }
}

export async function syncState(client, botConfigId, isPaperMode = false) {
  void client;
  void botConfigId;
  void isPaperMode;
}

/**
 * Force close a position based on AI recommendation
 */
export async function closePositionBySymbol(client, botConfigId, symbol, side = null, reason = '-') {
  try {
    const safeReason =
      typeof reason === 'string' && reason.trim().length > 0
        ? reason.trim()
        : '-';

    const rawSymbol = String(symbol || '').trim();
    if (!rawSymbol) return false;

    const isSwapClient = client?.options?.defaultType === 'swap';
    if (!isSwapClient) return false;

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
      const hedgedFromExchange =
        holdMode === 'hedge_mode' ? true : holdMode === 'one_way_mode' ? false : null;

      const buildCloseRequest = (hedged) => {
        if (hedged) {
          return {
            side: posSide === 'LONG' ? 'buy' : 'sell',
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

    const ticker = await client.fetchTicker(mappedSymbol).catch(() => ({}));
    const exitPrice = Number(ticker.last || ticker.close || 0);
    const entryPrice = Number(matches[0]?.entryPrice || 0);
    const posSide = normalizePosSide(matches[0]?.side || matches[0]?.info?.holdSide || matches[0]?.info?.posSide);
    const pnlPercent = entryPrice > 0 && exitPrice > 0 ? ((exitPrice - entryPrice) / entryPrice) * 100 : 0;
    const adjustedPnl = posSide === 'SHORT' ? -pnlPercent : pnlPercent;
    const sideLabel = desiredSide || posSide;

    await logPhase(botConfigId, 'TRIGGER', `🧠 AI Force Close: ปิดสถานะ ${mappedSymbol} (${sideLabel}) (เหตุผล: ${safeReason}) — PNL ${adjustedPnl.toFixed(2)}%`);
    return true;
  } catch (error) {
    console.error('[ExecGuard] Force close failed:', error.message);
    return false;
  }
}
