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
async function checkRiskGuard(client, botConfigId, marketType, _symbol) {
  try {
    // Margin Usage Check (only for Futures)
    if (marketType === 'FUTURES') {
      const balance = await client.fetchBalance();
      
      // For Bitget V2 Futures
      const total = parseFloat(balance.total?.USDT || balance.total?.SUSDT || 0);
      const used = parseFloat(balance.used?.USDT || balance.used?.SUSDT || 0);
      
      if (total > 0) {
        const marginUsagePercent = (used / total) * 100;
        
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

    const marketType = config.marketType || 'SPOT';

    // Pre-load markets for both clients
    if (engineClientSpot) await engineClientSpot.loadMarkets().catch(() => {});
    if (engineClientFutures) await engineClientFutures.loadMarkets().catch(() => {});

    for (const task of tasks.trades || []) {
      try {
        const { symbol, side, amount, strategy, confidence, stopLossPercent, sector } = task;

        // Determine client early to check market availability
        const priceClient =
          marketType === 'SPOT'
            ? engineClientSpot
            : marketType === 'FUTURES'
              ? engineClientFutures
              : (side?.toLowerCase() === 'sell' && marketType === 'MIXED')
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

        // [New] Risk Guard Check in IMPLEMENT phase
        const riskCheck = await checkRiskGuard(finalClient, botConfigId, marketType, mappedSymbol);
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
        if (!checkMarketAvailability(finalClient, mappedSymbol, marketType)) {
          const marketLabel = (finalClient === engineClientFutures) ? 'FUTURES' : 'SPOT';
          await prisma.aILogStream.create({
            data: {
              botConfigId,
              step: 'IMPLEMENT',
              content: `REJECT: เหรียญ ${mappedSymbol} ไม่มีในตลาด ${marketLabel} (ข้ามขั้นตอน TASK CHECK)`,
              status: 'FAILED'
            }
          });
          console.log(`[ExecGuard] Market Existence Guard: ${mappedSymbol} not found in ${marketLabel} markets. Skipping.`);
          continue;
        }

        // 1. SPOT Market Guard
        if (marketType === 'SPOT' && side?.toLowerCase() === 'sell') {
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


      // 3. Trade Tracking
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
        
        if (freeBalance < amount) {
          // Diagnostic: check if funds exist in the "other" account
          try {
            const otherClient = (marketType === 'FUTURES' || marketType === 'MIXED' || (marketType === 'SPOT' && side?.toLowerCase() === 'buy')) 
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
              
              if (otherValue >= amount) {
                // AUTO-TRANSFER LOGIC
                // In Bitget V2, 'usdt-margined' is the standard label for USDT-M Futures (Mix)
                const fromType = otherType.toLowerCase() === 'spot' ? 'spot' : 'usdt-margined';
                const toType = (finalClient === engineClientFutures) ? 'usdt-margined' : 'spot';
                
                await logPhase(botConfigId, 'IMPLEMENT', `[Engine] ♻️ Auto-Transfer: กำลังโอนเงิน ${amount} ${detectedAsset} จาก ${otherType} ไปยัง ${marketType} อัตโนมัติ...`);
                
                try {
                  // Bitget CCXT transfer: (code, amount, from, to, params)
                  await otherClient.transfer(detectedAsset, amount, fromType, toType);
                } catch (firstTryErr) {
                  // Fallback for Demo/Legacy labels
                  if (firstTryErr.message && String(firstTryErr.message).includes('404')) {
                    const legacyFrom = otherType.toLowerCase() === 'spot' ? 'spot' : 'mix';
                    const legacyTo = (finalClient === engineClientFutures) ? 'mix' : 'spot';
                    try {
                      await otherClient.transfer(detectedAsset, amount, legacyFrom, legacyTo);
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
                
                if (freeBalance < amount) {
                    throw new Error(`Transfer appeared successful but ${marketType} balance is still ${freeBalance}`);
                }
              } else {
                // Fallback to warning
                let diagnosticMsg = `⚠️ ยอดเงินไม่พอในบัญชี ${marketType}: ต้องการ ${amount} USDT แต่มีเพียง ${freeBalance.toFixed(2)} ${detectedAsset} (${symbol})`;
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
      const entryPrice = side?.toLowerCase() === 'buy' ? ticker.ask : ticker.bid;

      const stopLossPrice = calculateSLPrice(entryPrice, side, stopLossPercent);
      const tpTiers = calculateTPTiers(entryPrice, side, stopLossPercent);

      await prisma.activeTranche.create({
        data: {
          botConfigId,
          symbol: mappedSymbol, // Use mapped symbol for trading
          side: side.toUpperCase(),
          status: 'OPEN',
          trancheGroupId: `${isShadowMode ? 'shadow' : 'trade'}-${Date.now()}`,
          entryPrice,
          originalAmount: amount,
          remainingAmount: amount,
          isPaperTrade: config.isPaperTrading || isShadowMode, 
          sector: sector || 'OTHER',
          stopLossPrice,
          tpTiers: tpTiers ? JSON.stringify(tpTiers) : null
        }
      });

      let actionLabel = side.toUpperCase();
      if (marketType === 'FUTURES' || marketType === 'MIXED') {
        actionLabel = actionLabel === 'SELL' ? 'SHORT' : 'LONG';
      }

      const modeLabel = isShadowMode ? 'Shadow (Sim)' : (config.isPaperTrading ? 'Demo (Bitget)' : 'Live (Bitget)');
      await prisma.aILogStream.create({
        data: {
          botConfigId,
          step: 'IMPLEMENT',
          content: `Signal ${actionLabel} ${mappedSymbol} (${symbol}): ${modeLabel} (${confidence}%)`,
          status: 'SUCCESS'
        }
      });

      if (isShadowMode) {
        await prisma.aILogStream.create({
          data: { botConfigId, step: 'IMPLEMENT', content: 'Saved to Shadow Mode.', status: 'SUCCESS' }
        });
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
        await enterTWAPLimit(executionClient, mappedSymbol, side.toLowerCase(), amount, 'DIRECTIONAL', botConfigId, stopLossPrice, tpPrice, marketType);
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

    if (finalAmount < minAmount) {
       throw new Error(`จำนวนเหรียญ ${finalAmount} น้อยกว่าขั้นต่ำที่ตลาดกำหนด (${minAmount} ${market.base})`);
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
  try {
    const positions = await client.fetchPositions();
    const openPositions = positions.filter(p => parseFloat(p.contracts) > 0);
    for (const pos of openPositions) {
      const existing = await prisma.activeTranche.findFirst({
        where: { botConfigId, symbol: pos.symbol, status: 'OPEN', isPaperTrade: isPaperMode }
      });
      if (!existing) {
        await prisma.activeTranche.create({
          data: {
            botConfigId,
            symbol: pos.symbol,
            side: pos.side?.toUpperCase() || 'LONG',
            status: 'OPEN',
            trancheGroupId: `sync-${Date.now()}`,
            entryPrice: parseFloat(pos.entryPrice) || 0,
            originalAmount: parseFloat(pos.contracts) || 0,
            remainingAmount: parseFloat(pos.contracts) || 0,
            isPaperTrade: isPaperMode,
          }
        });
      }
    }
  } catch (error) {
    console.error('[ExecGuard] Sync failed:', error.message);
  }
}

/**
 * Force close a position based on AI recommendation
 */
export async function forceClosePosition(client, positionId, reason) {
  try {
    const tranche = await prisma.activeTranche.findUnique({
      where: { id: positionId },
      include: { BotConfig: true }
    });

    if (!tranche || tranche.status !== 'OPEN') return;

    const orderSide = tranche.side === 'LONG' ? 'sell' : 'buy';
    const ticker = await client.fetchTicker(tranche.symbol);
    const exitPrice = ticker.last;

    if (!tranche.isPaperTrade) {
      const params = {};
      if (client.options.defaultType === 'swap') {
        params.tradeSide = 'close';
      }
      const precisionAmount = client.amountToPrecision(tranche.symbol, tranche.remainingAmount);
      await client.createMarketOrder(tranche.symbol, orderSide, parseFloat(precisionAmount), params);
    }

    const pnlPercent = ((exitPrice - tranche.entryPrice) / tranche.entryPrice) * 100;
    const adjustedPnl = tranche.side === 'SHORT' ? -pnlPercent : pnlPercent;

    await prisma.activeTranche.update({
      where: { id: positionId },
      data: {
        status: 'CLOSED',
        exitPrice,
        pnlUsdt: adjustedPnl,
        closedAt: new Date()
      }
    });

    await logPhase(tranche.botConfigId, 'TRIGGER', `🧠 AI Force Close: ปิดสถานะ ${tranche.symbol} (เหตุผล: ${reason}) — PNL ${adjustedPnl.toFixed(2)}%`);
    
    return true;
  } catch (error) {
    console.error('[ExecGuard] Force close failed:', error.message);
    return false;
  }
}
