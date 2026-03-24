import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Execution Guard orchestrates TWAP, Maker-Only orders, Shadow Modes, and Delta-Neutral
 */
export async function executeStrategy(engineClientSpot, engineClientFutures, tasks, botConfigId) {
  try {
    const config = await prisma.botConfig.findUnique({ where: { id: botConfigId } });
    if (!config) return;

    for (const task of tasks.trades || []) {
      const { symbol, side, amount, strategy, confidence } = task;

      // 1. Shadow Mode Hub (Paper Trading)
      if (config.isPaperTrading || confidence < 70 || strategy === 'SHADOW_TRADE') {
        const ticker = await (engineClientSpot || engineClientFutures).fetchTicker(symbol);
        const entryPrice = side === 'buy' ? ticker.ask : ticker.bid;

        await prisma.activeTranche.create({
          data: {
            botConfigId,
            symbol,
            side: side.toUpperCase(),
            status: 'OPEN',
            trancheGroupId: `paper-${Date.now()}`,
            entryPrice,
            originalAmount: amount,
            remainingAmount: amount,
            isPaperTrade: true
          }
        });

        await prisma.aILogStream.create({
          data: {
            botConfigId,
            step: 'IMPLEMENT',
            content: `[PAPER TRADE] บันทึกคำสั่ง ${side.toUpperCase()} ${symbol} ที่ราคา ${entryPrice} (Shadow Mode)`,
            status: 'SUCCESS'
          }
        });
        continue;
      }

      // Delta-Neutral Funding Arbitrage Rule (THE HOLY GRAIL - MIXED MODE)
      if (strategy === 'DELTA_NEUTRAL' || strategy === 'ARBITRAGE') {
        const valueUsdt = amount; // e.g. amount is in USDT
        
        await prisma.aILogStream.create({
          data: {
            botConfigId,
            step: 'IMPLEMENT',
            content: 'ตลาดไร้ทิศทางแต่ดอกเบี้ยสูง: สั่งเปิด Delta-Neutral (ซื้อ Spot / ชอร์ต Futures ค้ำกัน) เพื่อกิน Funding Rate ไร้ความเสี่ยง',
            status: 'SUCCESS'
          }
        });

        // 1. Buy SPOT target
        if (engineClientSpot) {
          await enterTWAPLimit(engineClientSpot, symbol, 'buy', valueUsdt, 'SPOT');
        }
        
        // 2. Short FUTURES target (1x Leverage)
        if (engineClientFutures) {
          // Adjust leverage to 1x programmatically
          try { await engineClientFutures.setMarginMode('isolated', symbol); } catch(e){}
          try { await engineClientFutures.setLeverage(1, symbol); } catch(e){}
          await enterTWAPLimit(engineClientFutures, symbol, 'sell', valueUsdt, 'FUTURES');
        }

        continue;
      }

      // Normal Directional Trade 
      // Maker-Only / Fee Optimization 
      await enterTWAPLimit(engineClientFutures || engineClientSpot, symbol, side.toLowerCase(), amount, 'DIRECTIONAL');
    }
  } catch (error) {
    console.error('ExecutionGuard Error:', error);
    throw error;
  }
}

/**
 * TWAP Execution Loop for orders > $5000 + Post Only
 */
async function enterTWAPLimit(client, symbol, side, valueUsdt, type) {
  // Post-Only maker limit
  const params = { timeInForce: 'PO' };
  
  if (valueUsdt > 5000) {
    const chunkUsdt = 500;
    const slices = Math.floor(valueUsdt / chunkUsdt);
    
    for (let i = 0; i < slices; i++) {
      // Assuming a helper obtains strictly safe limit price matching current order book
      const ticker = await client.fetchTicker(symbol);
      const safeLimit = side === 'buy' ? ticker.bid : ticker.ask;
      const amountCoins = chunkUsdt / safeLimit;

      await client.createLimitOrder(symbol, side, amountCoins, safeLimit, params);
      await new Promise(r => setTimeout(r, 2000)); // Delay between TWAP chunks
    }
  } else {
    const ticker = await client.fetchTicker(symbol);
    const safeLimit = side === 'buy' ? ticker.bid : ticker.ask;
    const amountCoins = valueUsdt / safeLimit;

    await client.createLimitOrder(symbol, side, amountCoins, safeLimit, params);
  }
}

export async function syncState(client) {
  console.log("Booting Execution Guard State Recovery...");
  // Implementation of recovery loop fetching open positions directly from client and syncing PRISMA database.
}
