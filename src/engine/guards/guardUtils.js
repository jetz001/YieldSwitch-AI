import { prisma } from '../../lib/db.js';
import { logPhase } from '../aiBase.js';

export function mapSymbolForExchange(symbol, marketType, client) {
  try {
    if (!symbol || !client || !client.markets) {
      return symbol;
    }
    
    if (marketType === 'FUTURES' || marketType === 'MIXED') {
      let baseSymbol = symbol.includes('/') ? symbol.split('/')[0] : symbol;
      const quoteSymbol = symbol.includes('/') ? symbol.split('/')[1] : 'USDT';
      
      if (baseSymbol === 'WBTC') {
        console.log(`[SymbolMapper] Substituting Spot-only WBTC with BTC for Futures.`);
        baseSymbol = 'BTC';
      }

      if (symbol.includes(':')) return symbol;

      if (!client.markets || Object.keys(client.markets).length === 0) {
        return `${baseSymbol}/${quoteSymbol}:${quoteSymbol}`;
      }

      const variations = [
        `${baseSymbol}/${quoteSymbol}:${quoteSymbol}`,
        `${baseSymbol}/${quoteSymbol}:${baseSymbol}`,
      ];

      for (const variation of variations) {
        if (client.markets[variation] && client.markets[variation].type === 'swap') {
          console.log(`[SymbolMapper] Prioritized Futures: ${symbol} -> ${variation}`);
          return variation;
        }
      }

      if (client.markets[symbol] && client.markets[symbol].type === 'swap') {
        return symbol;
      }
      
      const candidates = Object.keys(client.markets).filter(m => 
        m.startsWith(`${baseSymbol}/${quoteSymbol || ''}`) && client.markets[m].type === 'swap'
      );
      
      if (candidates.length > 0) {
        console.log(`[SymbolMapper] Found alternative swap: ${symbol} -> ${candidates[0]}`);
        return candidates[0];
      }
    }
    
    return symbol;
  } catch (error) {
    console.warn('[SymbolMapper] Error mapping symbol:', error.message);
    return symbol;
  }
}

export function mapAISymbolToExchange(aiSymbol, candidates, marketType, client) {
  try {
    if (!aiSymbol || !client || !client.markets) {
      return aiSymbol;
    }
    
    const isFuturesContext = marketType === 'FUTURES' || (client.options && client.options.defaultType === 'swap');

    if (isFuturesContext) {
      const base = aiSymbol.includes('/') ? aiSymbol.split('/')[0] : aiSymbol;
      const quote = aiSymbol.includes('/') ? aiSymbol.split('/')[1] : 'USDT';
      
      const finalBase = base === 'WBTC' ? 'BTC' : base;
      const swapSymbol = `${finalBase}/${quote}:${quote}`;
      
      if (client.markets[swapSymbol]) {
        return swapSymbol;
      }
    }

    if (client.markets[aiSymbol]) {
      if (isFuturesContext && client.markets[aiSymbol].type === 'spot') {
        // Continue to fallback
      } else {
        return aiSymbol;
      }
    }
    
    const candidate = candidates.find(c => 
      (c.originalSymbol === aiSymbol) || (c.symbol === aiSymbol)
    );
    
    if (candidate && candidate.symbol) {
      if (isFuturesContext && !candidate.symbol.includes(':')) {
         // Continue to fallback
      } else {
        console.log(`[SymbolMapper] AI symbol ${aiSymbol} mapped to exchange symbol ${candidate.symbol}`);
        return candidate.symbol;
      }
    }
    
    return mapSymbolForExchange(aiSymbol, marketType, client);
  } catch (error) {
    console.warn('[SymbolMapper] Error mapping AI symbol:', error.message);
    return aiSymbol;
  }
}

export function checkMarketAvailability(client, symbol, marketType) {
  if (!client || !client.markets) return false;
  
  const market = client.markets[symbol];
  if (!market) return false;

  if (marketType === 'FUTURES' && market.type !== 'swap') {
    return false;
  }
  
  return true;
}

export async function checkRiskGuard(client, botConfigId, marketType, _symbol, orderValueUsdt = null) {
  try {
    if (marketType === 'FUTURES') {
      const balance = await client.fetchBalance({ type: 'swap' }).catch(() => client.fetchBalance());
      
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
    return { safe: true };
  }
}

export async function enterTWAPLimit(client, symbol, side, valueUsdt, type, botConfigId, slPrice = null, tpPrice = null, marketType = 'SPOT') {
  const params = {};
  
  const market = client.market(symbol);
  if (!market) throw new Error(`Market ${symbol} not found on exchange.`);

  const isSwapClient = client.options && client.options.defaultType === 'swap';
  const isSwapSymbol = symbol.includes(':');
  const isFuturesOrder = isSwapSymbol || (isSwapClient && market.type === 'swap');

  if (isFuturesOrder) {
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
    params.tradeSide = 'open';
    params.oneWayMode = true; 
  } else {
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
