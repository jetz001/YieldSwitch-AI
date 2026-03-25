import { PrismaClient } from '@prisma/client';
import { calculateMaxLeverage } from './mathGuard';

const prisma = new PrismaClient();

/**
 * Execution Guard - Master Prompt
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

      // 1. SPOT Market Guard
      if (config.marketType === 'SPOT' && side?.toLowerCase() === 'sell') {
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

      const client = engineClientSpot || engineClientFutures; 
      const ticker = await client.fetchTicker(symbol);
      const entryPrice = side?.toLowerCase() === 'buy' ? ticker.ask : ticker.bid;

      await prisma.activeTranche.create({
        data: {
          botConfigId,
          symbol,
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
          content: `Signal ${side.toUpperCase()} ${symbol}: ${modeLabel} (${confidence}%)`,
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
      const executionClient = engineClientFutures || engineClientSpot;
      if (engineClientFutures && stopLossPercent) {
        const maxLev = calculateMaxLeverage(stopLossPercent);
        const safeLeverage = Math.max(1, Math.floor(maxLev));
        try {
          await engineClientFutures.setMarginMode('isolated', symbol);
          await engineClientFutures.setLeverage(safeLeverage, symbol);
        } catch (e) {}
      }

      await enterTWAPLimit(executionClient, symbol, side.toLowerCase(), amount, 'DIRECTIONAL', botConfigId);
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
      await new Promise(r => setTimeout(r, 2000));
    }
  } else {
    const safeLimit = side === 'buy' ? ticker.bid : ticker.ask;
    const amountCoins = valueUsdt / safeLimit;
    await client.createLimitOrder(symbol, side, amountCoins, safeLimit, params);
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
