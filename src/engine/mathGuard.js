import { PrismaClient } from '@prisma/client';
import { getSectorForSymbol } from './autoScreener';

const prisma = new PrismaClient();

/**
 * Math Guard — Master Prompt §3
 * Dynamic Limits, TP Scaling, Circuit Breaker, Sector Guard, Zombie Guard
 */

/**
 * §3 Dynamic Leverage: Max Allowed Leverage = (1 / Stop_Loss_Percent) * 0.8
 */
export function calculateMaxLeverage(stopLossPercentage) {
  if (!stopLossPercentage || stopLossPercentage <= 0) return 1;
  const stopLossDecimal = stopLossPercentage / 100;
  return (1 / stopLossDecimal) * 0.8;
}

/**
 * §3 Global Circuit Breaker: If portfolio drops > 15%, close ALL and halt AI
 */
export async function checkGlobalCircuitBreaker(botConfigId, currentTotalEquityUsdt) {
  const config = await prisma.botConfig.findUnique({ where: { id: botConfigId } });
  if (!config) return false;

  const dropPercent = ((config.allocatedPortfolioUsdt - currentTotalEquityUsdt) / config.allocatedPortfolioUsdt) * 100;

  if (dropPercent > 15) {
    await prisma.botConfig.update({
      where: { id: botConfigId },
      data: { 
        isActive: false,
        allocatedPortfolioUsdt: currentTotalEquityUsdt // Sync budget to current reality
      }
    });
    
    await prisma.aILogStream.create({
      data: {
        botConfigId,
        step: 'TRIGGER',
        content: `🚨 พอร์ตลดลง ${dropPercent.toFixed(1)}% (เกิน 15%): ระบบเบรกเกอร์ทำงาน ปิดทุกสถานะและหยุด AI ทันที`,
        status: 'FAILED'
      }
    });
    return true; // Breaker triggered
  }
  return false;
}

/**
 * §3 Sector Correlation Guard: Max 2 assets per sector
 * Uses sector mapping from autoScreener
 */
export async function checkSectorGuard(botConfigId, newAssetCategory) {
  const tranches = await prisma.activeTranche.findMany({ 
    where: { botConfigId, status: 'OPEN' } 
  });
  
  const holdingsByCategory = tranches.reduce((acc, t) => {
    const category = getSectorForSymbol(t.symbol);
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});

  if (holdingsByCategory[newAssetCategory] >= 2) {
    return false; // AI MUST NOT open new positions
  }
  return true; // Safe
}

/**
 * §3 Zombie Guard: If position open > 24h and PNL between -2% and +2%, auto-close
 */
export async function checkZombieGuard(exchangeClient, botConfigId, tickerMap = null) {
  try {
    const tranches = await prisma.activeTranche.findMany({
      where: { botConfigId, status: 'OPEN' }
    });

    const now = Date.now();
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    let closedCount = 0;

    for (const tranche of tranches) {
      const openDuration = now - new Date(tranche.openedAt).getTime();
      
      if (openDuration > TWENTY_FOUR_HOURS) {
        try {
          const ticker = tickerMap?.[tranche.symbol];
          if (!ticker && tickerMap) {
            // If tickerMap was provided but this symbol is missing, skip to avoid 429
            continue;
          }
          const finalTicker = ticker || await exchangeClient.fetchTicker(tranche.symbol);
          const currentPrice = finalTicker.last || finalTicker.close;
          const pnlPercent = ((currentPrice - tranche.entryPrice) / tranche.entryPrice) * 100;
          const adjustedPnl = tranche.side === 'SHORT' ? -pnlPercent : pnlPercent;

          if (adjustedPnl > -2 && adjustedPnl < 2) {
            // Close the zombie position
            if (!tranche.isPaperTrade) {
              const closeSide = tranche.side === 'LONG' ? 'sell' : 'buy';
              const params = {};
              if (exchangeClient.options.defaultType === 'swap') {
                params.tradeSide = 'close';
              }
              const precisionAmount = exchangeClient.amountToPrecision(tranche.symbol, tranche.remainingAmount);
              await exchangeClient.createMarketOrder(tranche.symbol, closeSide, parseFloat(precisionAmount), params);
            }

            await prisma.activeTranche.update({
              where: { id: tranche.id },
              data: { 
                status: 'CLOSED', 
                exitPrice: currentPrice,
                pnlUsdt: adjustedPnl,
                closedAt: new Date()
              }
            });

            const hours = Math.floor(openDuration / (60 * 60 * 1000));
            await prisma.aILogStream.create({
              data: {
                botConfigId,
                step: 'TRIGGER',
                content: `🧟 Zombie Guard: ปิดสถานะ ${tranche.symbol} (เปิดมา ${hours} ชั่วโมง, PNL ${adjustedPnl.toFixed(2)}%) — ปลดปล่อย Bullet กลับคืนมา`,
                status: 'SUCCESS'
              }
            });
            closedCount++;
          }
        } catch (e) {
          console.error(`[MathGuard] Zombie check failed for ${tranche.symbol}:`, e.message);
        }
      }
    }

    if (closedCount > 0) {
      console.log(`[MathGuard] Zombie Guard closed ${closedCount} stale positions`);
    }
    return closedCount;
  } catch (error) {
    console.error('[MathGuard] Zombie Guard error:', error.message);
    return 0;
  }
}

/**
 * §3 Dynamic TP Scaling tick loop
 */
export async function tickMathGuard(exchangeClient, tranche, providedTicker = null, hasTickerMap = false) {
  try {
    const ticker = providedTicker || (hasTickerMap ? null : await exchangeClient.fetchTicker(tranche.symbol));
    if (!ticker) return 'SKIPPED'; // Skip if bulk map provided but symbol missing
    const currentPrice = ticker.last || ticker.close;

    // Track Highest/Lowest for Trailing - defensive checks
    let currentHighest = parseFloat(tranche.highestPriceReached) || 0;
    if (tranche.side === 'LONG' && currentPrice > currentHighest) {
      currentHighest = currentPrice;
    } else if (tranche.side === 'SHORT' && currentPrice < currentHighest) {
      currentHighest = currentPrice;
    }

    // Only update if there's a meaningful change
    if (Math.abs(currentHighest - parseFloat(tranche.highestPriceReached || 0)) > 0.001) {
      await prisma.activeTranche.update({ 
        where: { id: tranche.id }, 
        data: { highestPriceReached: currentHighest } 
      });
      tranche.highestPriceReached = currentHighest;
    }

    // Dynamic TP Scaling Logic
    const tpTiers = tranche.tpTiers ? JSON.parse(tranche.tpTiers) : null;
    
    if (tpTiers) {
      if (!tpTiers.tp1.reached && checkTrigger(tranche.side, currentPrice, tpTiers.tp1.price)) {
        await scaleOut(exchangeClient, tranche, 0.25, 'TP1'); // Sell 25%
        tpTiers.tp1.reached = true;
        
        // Move trailing stop to breakeven automatically
        await prisma.activeTranche.update({
          where: { id: tranche.id },
          data: { tpTiers: JSON.stringify(tpTiers), trailingStopPrice: tranche.entryPrice }
        });
        
        await prisma.aILogStream.create({
          data: { botConfigId: tranche.botConfigId, step: 'TRIGGER', content: 'ชนเป้าหมาย TP1: ทยอยขายล็อกกำไร 25% และเลื่อนจุดตัดขาดทุนมาบังหน้าทุน (Breakeven)', status: 'SUCCESS'}
        });
        return 'TP1_HIT';
      }

      if (tpTiers.tp1.reached && !tpTiers.tp2.reached && checkTrigger(tranche.side, currentPrice, tpTiers.tp2.price)) {
        await scaleOut(exchangeClient, tranche, 0.25, 'TP2'); // Sell another 25%
        tpTiers.tp2.reached = true;
        await prisma.activeTranche.update({
          where: { id: tranche.id },
          data: { tpTiers: JSON.stringify(tpTiers) }
        });

        await prisma.aILogStream.create({
          data: { botConfigId: tranche.botConfigId, step: 'TRIGGER', content: 'ชนเป้าหมาย TP2: ทยอยขายล็อกกำไร 25% เพิ่มเติม — เหลือ 50% เป็น Runner พร้อม Trailing Stop', status: 'SUCCESS'}
        });
        return 'TP2_HIT';
      }
    }

    // Standard Hard Exits
    if (tranche.stopLossPrice && checkTrigger(tranche.side === 'LONG' ? 'SHORT' : 'LONG', currentPrice, tranche.stopLossPrice)) {
      await executeStopPhase(exchangeClient, tranche, 'STOP_LOSS');
      return 'STOP_LOSS';
    }

    if (tranche.trailingStopPrice && checkTrigger(tranche.side === 'LONG' ? 'SHORT' : 'LONG', currentPrice, tranche.trailingStopPrice)) {
      await executeStopPhase(exchangeClient, tranche, 'TRAILING_STOP_RUNNER');
      return 'TRAILING_STOP';
    }

    return 'NO_ACTION';
  } catch (error) {
    // Handle rate limiting specifically
    if (error.message && error.message.includes('429')) {
      console.warn('[MathGuard] Rate limited by Bitget API - backing off');
      return 'RATE_LIMITED';
    }
    
    console.error('Math Guard Error:', error);
    return 'ERROR';
  }
}

function checkTrigger(triggerSide, currentPrice, targetPrice) {
  if (triggerSide === 'LONG') return currentPrice >= targetPrice;
  if (triggerSide === 'SHORT') return currentPrice <= targetPrice;
  return false;
}

async function scaleOut(exchangeClient, tranche, percent, _tpLayer) {
  const sellAmount = tranche.originalAmount * percent;
  const orderSide = tranche.side === 'LONG' ? 'sell' : 'buy';
  
  if (!tranche.isPaperTrade) {
    const params = {};
    if (exchangeClient.options.defaultType === 'swap') {
      params.tradeSide = 'close';
    }
    const precisionAmount = exchangeClient.amountToPrecision(tranche.symbol, sellAmount);
    await exchangeClient.createMarketOrder(tranche.symbol, orderSide, parseFloat(precisionAmount), params);
  }
  
  tranche.remainingAmount = tranche.remainingAmount - sellAmount;
  await prisma.activeTranche.update({
    where: { id: tranche.id },
    data: { remainingAmount: tranche.remainingAmount }
  });
}

async function executeStopPhase(exchangeClient, tranche, type) {
  const orderSide = tranche.side === 'LONG' ? 'sell' : 'buy';
  
  if (!tranche.isPaperTrade) {
    const params = {};
    if (exchangeClient.options.defaultType === 'swap') {
      params.tradeSide = 'close';
    }
    const precisionAmount = exchangeClient.amountToPrecision(tranche.symbol, tranche.remainingAmount);
    await exchangeClient.createMarketOrder(tranche.symbol, orderSide, parseFloat(precisionAmount), params);
  }

  const ticker = await exchangeClient.fetchTicker(tranche.symbol);
  const exitPrice = ticker.last;
  const pnlPercent = ((exitPrice - tranche.entryPrice) / tranche.entryPrice) * 100;
  const adjustedPnl = tranche.side === 'SHORT' ? -pnlPercent : pnlPercent;

  await prisma.activeTranche.update({
    where: { id: tranche.id },
    data: { 
      status: 'CLOSED', 
      exitPrice,
      pnlUsdt: adjustedPnl,
      closedAt: new Date()
    }
  });

  const typeLabel = type === 'STOP_LOSS' ? '🛑 Stop Loss' : '🏃 Trailing Stop (Runner Exit)';
  await prisma.aILogStream.create({
    data: {
      botConfigId: tranche.botConfigId,
      step: 'TRIGGER',
      content: `${typeLabel}: ปิดสถานะ ${tranche.symbol} ที่ราคา ${exitPrice} (PNL ${adjustedPnl.toFixed(2)}%)`,
      status: adjustedPnl >= 0 ? 'SUCCESS' : 'FAILED'
    }
  });
}
