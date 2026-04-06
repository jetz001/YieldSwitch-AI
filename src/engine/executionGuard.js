import { prisma } from '../lib/db.js';
import { executeSpotStrategy, closeSpotAsset } from './guards/spotExecution.js';
import { executeFuturesStrategy, closeFuturesPosition } from './guards/futuresExecution.js';

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

    if (marketType === 'SPOT') {
      if (engineClientSpot) {
        await executeSpotStrategy(engineClientSpot, config, botConfigId, tasks, candidates);
      }
    } else if (marketType === 'FUTURES') {
      if (engineClientFutures) {
        await executeFuturesStrategy(engineClientFutures, engineClientSpot, config, botConfigId, tasks, candidates);
      }
    } else {
      // MIXED Mode
      if (engineClientFutures) {
        await executeFuturesStrategy(engineClientFutures, engineClientSpot, config, botConfigId, tasks, candidates);
      }
      if (engineClientSpot) {
        await executeSpotStrategy(engineClientSpot, config, botConfigId, tasks, candidates);
      }
    }
  } catch (error) {
    console.error('ExecutionGuard Router Error:', error);
    throw error;
  }
}

export async function syncState(client, botConfigId, isPaperMode = false) {
  void client;
  void botConfigId;
  void isPaperMode;
}

export async function closePositionBySymbol(client, botConfigId, symbol, side = null, reason = '-') {
  try {
    const isSwapClient = client?.options?.defaultType === 'swap';

    if (!isSwapClient) {
      return await closeSpotAsset(client, botConfigId, symbol, reason);
    } else {
      return await closeFuturesPosition(client, botConfigId, symbol, side, reason);
    }
  } catch (error) {
    console.error('[ExecutionGuard] Force close failed:', error.message);
    return false;
  }
}
