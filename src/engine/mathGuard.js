import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Math Guard Phase 2: Dynamic Limits, Exits & Circuit Breakers
 */

export function calculateMaxLeverage(stopLossPercentage) {
  // Max Allowed Leverage = (1 / Stop_Loss_Percent) * 0.8
  const stopLossDecimal = stopLossPercentage / 100;
  return (1 / stopLossDecimal) * 0.8;
}

export async function checkGlobalCircuitBreaker(botConfigId, currentTotalEquityUsdt) {
  const config = await prisma.botConfig.findUnique({ where: { id: botConfigId } });
  if (!config) return false;

  const dropPercent = ((config.allocatedPortfolioUsdt - currentTotalEquityUsdt) / config.allocatedPortfolioUsdt) * 100;

  if (dropPercent > 15) {
    // Math Guard closes ALL positions, halts AI loop
    await prisma.botConfig.update({
      where: { id: botConfigId },
      data: { isActive: false }
    });
    
    await prisma.aILogStream.create({
      data: {
        botConfigId,
        step: 'TRIGGER',
        content: '🚨 พอร์ตลดลงเกิน 15%: ระบบเบรกเกอร์ทำงาน ปิดทุกสถานะและหยุด AI ทันที',
        status: 'FAILED'
      }
    });
    return true; // Breaker triggered
  }
  return false;
}

export async function checkSectorGuard(botConfigId, newAssetCategory) {
  const tranches = await prisma.activeTranche.findMany({ where: { botConfigId } });
  
  // Fake category mapping for demo, in prod we fetch from CCXT/CoinMarketCap
  const holdingsByCategory = tranches.reduce((acc, t) => {
    // naive example: DOGE, SHIB -> MEME
    const category = t.symbol.includes('DOGE') || t.symbol.includes('SHIB') ? 'MEME' : 'DEFI';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});

  if (holdingsByCategory[newAssetCategory] >= 2) {
    return false; // AI MUST NOT open new positions
  }
  return true; // Safe
}

// Rewritten tick loop for TP Scaling
export async function tickMathGuard(exchangeClient, tranche) {
  try {
    const ticker = await exchangeClient.fetchTicker(tranche.symbol);
    const currentPrice = ticker.last;

    // Track Highest/Lowest for Trailing
    let newHighestPrice = tranche.highestPriceReached;
    if (tranche.side === 'LONG' && currentPrice > newHighestPrice) newHighestPrice = currentPrice;
    else if (tranche.side === 'SHORT' && currentPrice < newHighestPrice) newHighestPrice = currentPrice;

    if (newHighestPrice !== tranche.highestPriceReached) {
      await prisma.activeTranche.update({ where: { id: tranche.id }, data: { highestPriceReached: newHighestPrice } });
      tranche.highestPriceReached = newHighestPrice;
    }

    // Dynamic TP Scaling Logic
    // E.g. tranche JSON field for TP planes: { tp1: {price, reached}, tp2: {price, reached} }
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
        return 'TP2_HIT';
      }
    }

    // Standard Hard Exits
    if (tranche.stopLossPrice && checkTrigger(tranche.side === 'LONG' ? 'SHORT' : 'LONG', currentPrice, tranche.stopLossPrice)) {
      await executeStopPhase(exchangeClient, tranche, 'STOP_LOSS');
      return 'STOP_LOSS';
    }

    if (tranche.trailingStopPrice && checkTrigger(tranche.side === 'LONG' ? 'SHORT' : 'LONG', currentPrice, tranche.trailingStopPrice)) {
      await executeStopPhase(exchangeClient, tranche, 'TRAILING_STOP_RUNNER'); // The remaining exit happens here
      return 'TRAILING_STOP';
    }

    return 'NO_ACTION';
  } catch (error) {
    console.error('Math Guard Error:', error);
    return 'ERROR';
  }
}

function checkTrigger(triggerSide, currentPrice, targetPrice) {
  if (triggerSide === 'LONG') return currentPrice >= targetPrice;
  if (triggerSide === 'SHORT') return currentPrice <= targetPrice;
  return false;
}

async function scaleOut(exchangeClient, tranche, percent, tpLayer) {
  const sellAmount = tranche.originalAmount * percent;
  const orderSide = tranche.side === 'LONG' ? 'sell' : 'buy';
  await exchangeClient.createMarketOrder(tranche.symbol, orderSide, sellAmount);
  tranche.remainingAmount = tranche.remainingAmount - sellAmount;
}

async function executeStopPhase(exchangeClient, tranche, type) {
  const orderSide = tranche.side === 'LONG' ? 'sell' : 'buy';
  await exchangeClient.createMarketOrder(tranche.symbol, orderSide, tranche.remainingAmount);
  await prisma.activeTranche.delete({ where: { id: tranche.id } });
}
