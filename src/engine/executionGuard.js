import { PrismaClient } from '@prisma/client';
import { calculateMaxLeverage } from './mathGuard.js';

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
    
    // For futures/swaps, check if we need to add settlement currency
    if (marketType === 'FUTURES' || marketType === 'MIXED') {
      // Check if the exact symbol exists
      if (client.markets[symbol]) {
        return symbol;
      }
      
      // Try to find the correct futures symbol by adding settlement currency
      const baseSymbol = symbol.split('/')[0];
      const quoteSymbol = symbol.split('/')[1];
      
      // Common patterns to try
      const variations = [
        `${baseSymbol}/${quoteSymbol}:${quoteSymbol}`, // SETH/SUSDT:SUSDT
        `${baseSymbol}/${quoteSymbol}:${baseSymbol}`,   // Some exchanges use base as settlement
      ];
      
      for (const variation of variations) {
        if (client.markets[variation]) {
          console.log(`[SymbolMapper] Mapped ${symbol} -> ${variation}`);
          return variation;
        }
      }
      
      // If no exact match found, try to find any market with this base/quote
      const markets = Object.keys(client.markets).filter(m => 
        m.startsWith(`${baseSymbol}/${quoteSymbol}`)
      );
      
      if (markets.length > 0) {
        console.log(`[SymbolMapper] Found alternative ${symbol} -> ${markets[0]}`);
        return markets[0];
      }
    }
    
    return symbol;
  } catch (error) {
    console.warn('[SymbolMapper] Error mapping symbol:', error.message);
    return symbol;
  }
}

function extractMarketTypeFromDirectives(directives) {
  const text = String(directives || '');
  // Marker written by Dashboard, e.g. [[MARKET_TYPE=SPOT]]
  const marker = text.match(/\[\[\s*MARKET_TYPE\s*=\s*(SPOT|FUTURES|MIXED)\s*\]\]/i);
  if (marker?.[1]) return marker[1].toUpperCase();

  // Fallback: allow "MARKET_TYPE=SPOT" or "MARKET_TYPE: SPOT"
  const alt = text.match(/MARKET_TYPE\s*[:=]\s*(SPOT|FUTURES|MIXED)/i);
  if (alt?.[1]) return alt[1].toUpperCase();

  return null;
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
    
    // First check if AI symbol exists directly on exchange
    if (client.markets[aiSymbol]) {
      return aiSymbol;
    }
    
    // Look for symbol in candidates to find the correct exchange symbol
    const candidate = candidates.find(c => 
      (c.originalSymbol === aiSymbol) || (c.symbol === aiSymbol)
    );
    
    if (candidate && candidate.symbol) {
      console.log(`[SymbolMapper] AI symbol ${aiSymbol} mapped to exchange symbol ${candidate.symbol}`);
      return candidate.symbol;
    }
    
    // Fallback to original mapping function
    return mapSymbolForExchange(aiSymbol, marketType, client);
  } catch (error) {
    console.warn('[SymbolMapper] Error mapping AI symbol:', error.message);
    return aiSymbol;
  }
}

export async function executeStrategy(engineClientSpot, engineClientFutures, tasks, botConfigId, candidates = []) {
  try {
    const config = await prisma.botConfig.findUnique({ 
      where: { id: botConfigId },
      include: { User: true }
    });
    if (!config) return;

    const marketType = extractMarketTypeFromDirectives(config.aiDirectives) || 'MIXED';

    for (const task of tasks.trades || []) {
      const { symbol, side, amount, strategy, confidence, stopLossPercent, sector } = task;

      // 1. SPOT Market Guard
      if (marketType === 'SPOT' && side?.toLowerCase() === 'sell') {
        await prisma.aILogStream.create({
          data: {
            botConfigId,
            step: 'TASK_CHECK',
            content: 'REJECT SHORT: SPOT Market only allows Long/Hold.',
            status: 'FAILED'
          }
        });
        continue;
      }


      // 3. Trade Tracking
      const user = config.User;
      const hasNativeDemo = config.isPaperTrading && !!user.bitgetDemoApiKey;
      const isShadowMode = confidence < 70 || strategy === 'SHADOW_TRADE' || (config.isPaperTrading && !hasNativeDemo);

      const priceClient =
        marketType === 'SPOT'
          ? engineClientSpot
          : marketType === 'FUTURES'
            ? engineClientFutures
            : engineClientFutures || engineClientSpot;

      if (!priceClient) {
        await prisma.aILogStream.create({
          data: {
            botConfigId,
            step: 'TASK_CHECK',
            content: `MarketType Guard: ไม่มี client สำหรับ ${marketType} (${symbol})`,
            status: 'FAILED'
          }
        });
        continue;
      }

      if (priceClient) {
        try { await priceClient.loadMarkets(); } catch (e) {}
      }

      // 2. Pre-trade Balance Guard
      try {
        const balance = await priceClient.fetchBalance();
        // Bitget can return balance under USDT, SUSDT, or USDC depending on account type
        const possibleAssets = ['USDT', 'SUSDT', 'USDC'];
        let freeBalance = 0;
        let detectedAsset = 'USDT';

        for (const asset of possibleAssets) {
          const amount = (balance[asset] && balance[asset].free) || 0;
          if (amount > freeBalance) {
            freeBalance = amount;
            detectedAsset = asset;
          }
        }
        
        if (freeBalance < amount) {
          await prisma.aILogStream.create({
            data: {
              botConfigId,
              step: 'TASK_CHECK',
              content: `⚠️ ยอดเงินไม่พอ: ต้องการ ${amount} USDT แต่มีเพียง ${freeBalance.toFixed(2)} ${detectedAsset} (${symbol})`,
              status: 'FAILED'
            }
          });
          continue;
        }
      } catch (balErr) {
        console.warn('[ExecGuard] Balance check failed, proceeding with caution:', balErr.message);
      }

      // Map AI-generated symbol to correct exchange symbol
      const mappedSymbol = mapAISymbolToExchange(symbol, candidates, marketType, priceClient);
      const ticker = await priceClient.fetchTicker(mappedSymbol);
      const entryPrice = side?.toLowerCase() === 'buy' ? ticker.ask : ticker.bid;

      await prisma.activeTranche.create({
        data: {
          botConfigId,
          symbol: mappedSymbol, // Use mapped symbol for trading
          originalSymbol: symbol, // Keep original symbol for reference
          side: side.toUpperCase(),
          status: 'OPEN',
          trancheGroupId: `${isShadowMode ? 'shadow' : 'trade'}-${Date.now()}`,
          entryPrice,
          originalAmount: amount,
          remainingAmount: amount,
          isPaperTrade: config.isPaperTrading || isShadowMode, 
          sector: sector || 'OTHER'
        }
      });

      const modeLabel = isShadowMode ? 'Shadow (Sim)' : (config.isPaperTrading ? 'Demo (Bitget)' : 'Live (Bitget)');
      await prisma.aILogStream.create({
        data: {
          botConfigId,
          step: 'IMPLEMENT',
          content: `Signal ${side.toUpperCase()} ${mappedSymbol} (${symbol}): ${modeLabel} (${confidence}%)`,
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
      const executionClient = priceClient;
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
        await enterTWAPLimit(executionClient, mappedSymbol, side.toLowerCase(), amount, 'DIRECTIONAL', botConfigId);
      } catch (execErr) {
        if (execErr.name === 'InsufficientFunds' || execErr.message.includes('Insufficient balance') || execErr.message.includes('43012')) {
          await prisma.aILogStream.create({
            data: {
              botConfigId,
              step: 'TASK_CHECK',
              content: `🚨 ยอดเงินในบัญชีไม่เพียงพอสำหรับการเทรด ${mappedSymbol}: กรุณาตรวจสอบกระเป๋าเงินของคุณ`,
              status: 'FAILED'
            }
          });
        } else {
          throw execErr; // Rethrow other errors to the main loop catch
        }
      }
    }
  } catch (error) {
    console.error('ExecutionGuard Error:', error);
    throw error;
  }
}

async function enterTWAPLimit(client, symbol, side, valueUsdt, type, botConfigId) {
  const params = { timeInForce: 'PO' };
  const ticker = await client.fetchTicker(symbol);
  
  if (ticker.bid && ticker.ask) {
    const spread = ((ticker.ask - ticker.bid) / ticker.bid) * 100;
    if (spread > 1.0) {
      if (botConfigId) {
        await prisma.aILogStream.create({
          data: {
            botConfigId,
            step: 'TASK_CHECK',
            content: `Spread Guard: ${spread.toFixed(2)}% > 1%. Rejected to avoid slippage.`,
            status: 'FAILED'
          }
        });
      }
      return;
    }
  }

  if (valueUsdt > 5000) {
    const chunkUsdt = 500;
    const slices = Math.floor(valueUsdt / chunkUsdt);
    for (let i = 0; i < slices; i++) {
      const freshTicker = await client.fetchTicker(symbol);
      const safeLimit = side === 'buy' ? freshTicker.bid : freshTicker.ask;
      const amountCoins = chunkUsdt / safeLimit;
      await client.createLimitOrder(symbol, side, amountCoins, safeLimit, params);
      
      if (botConfigId) {
        await prisma.aILogStream.create({
          data: {
            botConfigId,
            step: 'IMPLEMENT',
            content: `[Engine] ✅ วางคำสั่ง${side === 'buy' ? 'ซื้อ' : 'ขาย'} ${symbol} เรียบร้อยแล้วที่ราคา ${safeLimit.toFixed(6)} (TWAP Chunk)`,
            status: 'SUCCESS'
          }
        });
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  } else {
    const safeLimit = side === 'buy' ? ticker.bid : ticker.ask;
    const amountCoins = valueUsdt / safeLimit;
    await client.createLimitOrder(symbol, side, amountCoins, safeLimit, params);
    
    if (botConfigId) {
      await prisma.aILogStream.create({
        data: {
          botConfigId,
          step: 'IMPLEMENT',
          content: `[Engine] ✅ วางคำสั่ง${side === 'buy' ? 'ซื้อ' : 'ขาย'} ${symbol} เรียบร้อยแล้วที่ราคา ${safeLimit.toFixed(6)}`,
          status: 'SUCCESS'
        }
      });
    }
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
