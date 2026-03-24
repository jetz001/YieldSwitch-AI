import { PrismaClient } from '@prisma/client';
import { calculateMaxLeverage } from './mathGuard';

const prisma = new PrismaClient();

/**
 * Execution Guard — Master Prompt §5
 * Orchestrates TWAP, Maker-Only, Shadow Mode, Delta-Neutral, 
 * SPOT market guard, Slippage Guard, and Dynamic Leverage.
 */
export async function executeStrategy(engineClientSpot, engineClientFutures, tasks, botConfigId) {
  try {
    const config = await prisma.botConfig.findUnique({ 
      where: { id: botConfigId },
      include: { User: true }
    });
    if (!config) return;

    for (const task of tasks.trades || []) {
      const { symbol, side, amount, strategy, confidence, stopLossPercent, sector } = task;

      // ═══════════════════════════════════════════════════════════
      // §1 CRITICAL: SPOT Market Guard — REJECT SHORT signals
      // ═══════════════════════════════════════════════════════════
      if (config.marketType === 'SPOT' && side?.toLowerCase() === 'sell') {
        await prisma.aILogStream.create({
          data: {
            botConfigId,
            step: 'TRIGGER',
            content: '🚫 ระบบปฏิเสธคำสั่ง SHORT: ตลาด SPOT อนุญาตเฉพาะ LONG/HOLD เท่านั้น (AI อาจ hallucinate คำสั่ง SHORT)',
            status: 'FAILED'
          }
        });
        continue; // Skip this trade entirely
      }

      // ═══════════════════════════════════════════════════════════
      // §3 Sector Correlation Guard
      // ═══════════════════════════════════════════════════════════
      if (sector) {
        const { checkSectorGuard } = await import('./mathGuard');
        const sectorAllowed = await checkSectorGuard(botConfigId, sector);
        if (!sectorAllowed) {
          await prisma.aILogStream.create({
            data: {
              botConfigId,
              step: 'TRIGGER',
              content: 'ยกเลิกคำสั่งซื้อ: พอร์ตถือเหรียญกลุ่มเดียวกันเต็มโควต้าแล้ว ป้องกันความเสี่ยงกระจุกตัว',
              status: 'FAILED'
            }
          });
          continue;
        }
      }

      // ═══════════════════════════════════════════════════════════
      // §5 Shadow Mode Hub (Paper Trading / Low Confidence)
      // ═══════════════════════════════════════════════════════════
      const user = config.User;
      const hasNativeDemo = config.isPaperTrading && !!user.bitgetDemoApiKey;

      if ((config.isPaperTrading && !hasNativeDemo) || confidence < 70 || strategy === 'SHADOW_TRADE') {
        const client = engineClientSpot || engineClientFutures;
        const ticker = await client.fetchTicker(symbol);
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

        const shadowReason = confidence < 70 
          ? 'ความมั่นใจต่ำกว่า 70%: บันทึกคำสั่งซื้อลง Shadow Mode (เทรดกระดาษ) เพื่อเรียนรู้และเก็บสถิติ'
          : `[SHADOW TRADE] บันทึกคำสั่ง ${side.toUpperCase()} ${symbol} ที่ราคา ${entryPrice} (Simulation)`;

        await prisma.aILogStream.create({
          data: {
            botConfigId,
            step: 'IMPLEMENT',
            content: shadowReason,
            status: 'SUCCESS'
          }
        });
        continue;
      }

      // ═══════════════════════════════════════════════════════════
      // §4 Strategy 4: Delta-Neutral Funding Arbitrage (THE HOLY GRAIL)
      // ═══════════════════════════════════════════════════════════
      if (strategy === 'DELTA_NEUTRAL' || strategy === 'ARBITRAGE') {
        const valueUsdt = amount;
        
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
          await enterTWAPLimit(engineClientSpot, symbol, 'buy', valueUsdt, 'SPOT', botConfigId);
        }
        
        // 2. Short FUTURES target (1x Leverage)
        if (engineClientFutures) {
          try { await engineClientFutures.setMarginMode('isolated', symbol); } catch(e){}
          try { await engineClientFutures.setLeverage(1, symbol); } catch(e){}
          await enterTWAPLimit(engineClientFutures, symbol, 'sell', valueUsdt, 'FUTURES', botConfigId);
        }

        continue;
      }

      // ═══════════════════════════════════════════════════════════
      // §3 Dynamic Leverage Check (FUTURES only)
      // ═══════════════════════════════════════════════════════════
      const executionClient = engineClientFutures || engineClientSpot;
      
      if (engineClientFutures && stopLossPercent) {
        const maxLev = calculateMaxLeverage(stopLossPercent);
        const safeLeverage = Math.max(1, Math.floor(maxLev));
        try {
          await engineClientFutures.setMarginMode('isolated', symbol);
          await engineClientFutures.setLeverage(safeLeverage, symbol);
        } catch (e) {
          console.warn(`[ExecGuard] Could not set leverage ${safeLeverage}x for ${symbol}:`, e.message);
        }

        await prisma.aILogStream.create({
          data: {
            botConfigId,
            step: 'IMPLEMENT',
            content: `🔧 ตั้ง Leverage ${safeLeverage}x สำหรับ ${symbol} (SL ${stopLossPercent}% → Max Safe = ${maxLev.toFixed(1)}x)`,
            status: 'SUCCESS'
          }
        });
      }

      // ═══════════════════════════════════════════════════════════
      // Normal Directional Trade — with Slippage Guard
      // ═══════════════════════════════════════════════════════════
      await enterTWAPLimit(executionClient, symbol, side.toLowerCase(), amount, 'DIRECTIONAL', botConfigId);
    }
  } catch (error) {
    console.error('ExecutionGuard Error:', error);
    throw error;
  }
}

/**
 * §5 TWAP Execution Loop for orders > $5000 + Post-Only + Slippage Guard
 */
async function enterTWAPLimit(client, symbol, side, valueUsdt, type, botConfigId) {
  // Post-Only maker limit
  const params = { timeInForce: 'PO' };
  
  // ─── Slippage Guard: reject if spread > 1% ───
  const ticker = await client.fetchTicker(symbol);
  if (ticker.bid && ticker.ask) {
    const spread = ((ticker.ask - ticker.bid) / ticker.bid) * 100;
    if (spread > 1.0) {
      console.warn(`[ExecGuard] Slippage Guard: Spread ${spread.toFixed(2)}% > 1% for ${symbol}. REJECTING trade.`);
      if (botConfigId) {
        await prisma.aILogStream.create({
          data: {
            botConfigId,
            step: 'TRIGGER',
            content: `⛔ Slippage Guard: สเปรด ${spread.toFixed(2)}% เกิน 1% สำหรับ ${symbol} — ปฏิเสธคำสั่งเพื่อป้องกันค่าธรรมเนียมแพง`,
            status: 'FAILED'
          }
        });
      }
      return; // Do NOT execute
    }
  }

  if (valueUsdt > 5000) {
    // §5 TWAP: Split into $500 chunks
    const chunkUsdt = 500;
    const slices = Math.floor(valueUsdt / chunkUsdt);
    
    for (let i = 0; i < slices; i++) {
      const freshTicker = await client.fetchTicker(symbol);
      const safeLimit = side === 'buy' ? freshTicker.bid : freshTicker.ask;
      const amountCoins = chunkUsdt / safeLimit;

      await client.createLimitOrder(symbol, side, amountCoins, safeLimit, params);
      await new Promise(r => setTimeout(r, 2000)); // Delay between TWAP chunks
    }
  } else {
    const safeLimit = side === 'buy' ? ticker.bid : ticker.ask;
    const amountCoins = valueUsdt / safeLimit;

    await client.createLimitOrder(symbol, side, amountCoins, safeLimit, params);
  }
}

/**
 * §5 State Recovery: On app boot, run syncState() via ccxt.fetchPositions()
 * to reconstruct Math Guard memory.
 */
export async function syncState(client, botConfigId) {
  console.log('[ExecGuard] Booting State Recovery...');
  try {
    // Fetch all open positions from exchange
    const positions = await client.fetchPositions();
    const openPositions = positions.filter(p => parseFloat(p.contracts) > 0);
    
    for (const pos of openPositions) {
      // Check if we already track this position
      const existing = await prisma.activeTranche.findFirst({
        where: {
          botConfigId,
          symbol: pos.symbol,
          status: 'OPEN',
          isPaperTrade: false,
        }
      });

      if (!existing) {
        // Reconstruct from exchange data
        await prisma.activeTranche.create({
          data: {
            botConfigId,
            symbol: pos.symbol,
            side: pos.side?.toUpperCase() || 'LONG',
            status: 'OPEN',
            trancheGroupId: `recovered-${Date.now()}`,
            entryPrice: parseFloat(pos.entryPrice) || 0,
            originalAmount: parseFloat(pos.contracts) || 0,
            remainingAmount: parseFloat(pos.contracts) || 0,
            isPaperTrade: false,
          }
        });
        console.log(`[ExecGuard] Recovered position: ${pos.symbol} ${pos.side} @ ${pos.entryPrice}`);
      }
    }

    await prisma.aILogStream.create({
      data: {
        botConfigId,
        step: 'PLAN',
        content: `🔄 State Recovery: ตรวจสอบตลาดพบ ${openPositions.length} สถานะเปิด, sync เข้าฐานข้อมูลเรียบร้อย`,
        status: 'SUCCESS'
      }
    });

    console.log(`[ExecGuard] State Recovery complete. Found ${openPositions.length} open positions.`);
  } catch (error) {
    console.error('[ExecGuard] State Recovery failed:', error.message);
  }
}
