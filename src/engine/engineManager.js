import { runCognitiveLoop } from './aiCognitiveDualLoop.js';
import { checkZeroBalance } from './guards/balanceGuard.js';
import { executeStrategy, forceClosePosition } from './executionGuard.js';
import { syncState } from './executionGuard.js';
import { checkGlobalCircuitBreaker, checkZombieGuard, tickMathGuard } from './mathGuard.js';
import { getBitgetClient } from '../services/bitget.js';
import { PrismaClient } from '@prisma/client';
import { logPhase } from './aiBase.js';

const prisma = new PrismaClient();
const activeLoops = new Map();

/**
 * Starts the AI Cognitive Loop for a specific bot configuration.
 */
export async function startEngine(botConfigId) {
  const loopId = Date.now().toString();
  console.log(`[Engine Debug] startEngine() called for bot ${botConfigId} (LoopID: ${loopId})`);
  
  if (activeLoops.has(botConfigId)) {
    console.log(`[Engine] Stopping existing loop for ${botConfigId} before restart...`);
  }

  console.log(`[Engine] Starting background loop for bot ${botConfigId} (LoopID: ${loopId})...`);
  activeLoops.set(botConfigId, loopId);
  
  const loop = async () => {
    // Wait slightly to allow previous loop checks to potentially clear
    await new Promise(resolve => setTimeout(resolve, 500));
    
    while (activeLoops.get(botConfigId) === loopId) {
      console.log(`[Engine Debug] Entering loop iteration for ${botConfigId}`);
      try {
        // Fetch fresh config
        const config = await prisma.botConfig.findUnique({ 
          where: { id: botConfigId },
          include: { User: true }
        });

        if (!config || !config.isActive || activeLoops.get(botConfigId) !== loopId) {
          console.log(`[Engine Debug] Stopping loop ${loopId} for bot ${botConfigId}. Reason: ${!config ? 'Config deleted' : (!config.isActive ? 'Bot deactivated' : 'Loop replaced')}`);
          if (activeLoops.get(botConfigId) === loopId) activeLoops.delete(botConfigId);
          break;
        }

        console.log(`[Engine Loop] Bot ${botConfigId} iteration starting (LoopID: ${loopId})`);

        // ═══════════════════════════════════════════════
        // §3 CIRCUIT BREAKER & BALANCE CHECKS
        // ═══════════════════════════════════════════════
        const exchangeClient = getExchangeClient(config);
        if (exchangeClient) {
          try {
            let walletEquity = 0;
            const accountTypes = ['spot', 'swap'];
            const stablecoins = ['USDT', 'USD', 'SUSDT', 'USDC', 'BUSD'];

            for (const accType of accountTypes) {
              try {
                const balance = await exchangeClient.fetchBalance({ type: accType });
                for (const coin of stablecoins) {
                  const val = parseFloat(balance.total?.[coin] || 0);
                  if (val > 0) walletEquity += val;
                }
              } catch (e) {}
            }

            let unrealizedPnlTotal = 0;
            try {
              const positions = await exchangeClient.fetchPositions();
              for (const pos of positions) {
                if (parseFloat(pos.contracts) > 0) {
                  unrealizedPnlTotal += parseFloat(pos.unrealizedPnl || 0);
                }
              }
            } catch (posErr) {
              console.warn('[Engine] Could not fetch positions.');
            }

            const totalEquity = walletEquity + unrealizedPnlTotal;
            await logPhase(botConfigId, 'TASK_CHECK', `[Engine Guard] Equity: ${totalEquity.toFixed(2)} (Cash: ${walletEquity.toFixed(2)}, PNL: ${unrealizedPnlTotal.toFixed(2)})`);

            const marketType = config.marketType || 'MIXED';
            const triggered = await checkZeroBalance(exchangeClient, botConfigId, config, walletEquity, unrealizedPnlTotal, marketType);
            if (triggered) {
              activeLoops.delete(botConfigId);
              break;
            }

            if (config.allocatedPortfolioUsdt > 0) {
              const breaker = await checkGlobalCircuitBreaker(botConfigId, totalEquity);
              if (breaker) {
                console.log(`[Engine] 🚨 CIRCUIT BREAKER TRIGGERED for ${botConfigId}. Halting.`);
                activeLoops.delete(botConfigId);
                break;
              }
            }
          } catch (balErr) {
            console.warn('[Engine] Guard checks failed:', balErr.message);
          }
        }

        // ═══════════════════════════════════════════════
        // §3 ZOMBIE & MATH GUARD
        // ═══════════════════════════════════════════════
        let tickerMap = {};
        if (exchangeClient) {
          try {
            tickerMap = await exchangeClient.fetchTickers();
            await checkZombieGuard(exchangeClient, botConfigId, tickerMap);
          } catch (e) {}
        }

        let nextSleepMs = 300000; // 5 mins
        if (exchangeClient) {
          const openTranches = await prisma.activeTranche.findMany({
            where: { botConfigId, status: 'OPEN' }
          });
          for (const tranche of openTranches) {
            await tickMathGuard(exchangeClient, tranche, tickerMap[tranche.symbol], !!Object.keys(tickerMap).length);
          }
        }

        // ═══════════════════════════════════════════════
        // AI COGNITIVE LOOP
        // ═══════════════════════════════════════════════
        const cycleResult = await runCognitiveLoop(botConfigId);
        if (cycleResult && cycleResult.status === 'SUCCESS' && cycleResult.aiTasks) {
          if (config.User) {
            let bitgetSpot, bitgetFutures;
            
            // If in Paper Mode and Demo Keys are provided -> Use Bitget Native Demo
            if (config.isPaperTrading && config.User.bitgetDemoApiKey) {
              console.log(`[Engine] Using Bitget NATIVE DEMO for bot ${botConfigId}`);
              bitgetSpot = getBitgetClient(config.User.bitgetDemoApiKey, config.User.bitgetDemoApiSecret, config.User.bitgetDemoPassphrase, true, 'SPOT');
              bitgetFutures = getBitgetClient(config.User.bitgetDemoApiKey, config.User.bitgetDemoApiSecret, config.User.bitgetDemoPassphrase, true, 'FUTURES');
            } else {
              bitgetSpot = getBitgetClient(config.User.bitgetApiKey, config.User.bitgetApiSecret, config.User.bitgetPassphrase, false, 'SPOT');
              bitgetFutures = getBitgetClient(config.User.bitgetApiKey, config.User.bitgetApiSecret, config.User.bitgetPassphrase, false, 'FUTURES');
            }

            if (cycleResult.aiTasks?.cancel_orders && cycleResult.aiTasks.cancel_orders.length > 0) {
              for (const ord of cycleResult.aiTasks.cancel_orders) {
                const orderId = ord?.id;
                if (!orderId) continue;
                let cancelled = false;
                try {
                  await bitgetFutures.cancelOrder(orderId);
                  cancelled = true;
                } catch (e) {}
                if (!cancelled) {
                  try {
                    await bitgetSpot.cancelOrder(orderId);
                    cancelled = true;
                  } catch (e) {}
                }
                if (cancelled) {
                  await logPhase(botConfigId, 'TRIGGER', `🧠 AI Cancel Order: ${orderId} (เหตุผล: ${ord.reason || '-'})`);
                } else {
                  await logPhase(botConfigId, 'TRIGGER', `⚠️ AI Cancel Order Failed: ${orderId} (เหตุผล: ${ord.reason || '-'})`);
                }
              }
            }

            // Close positions first to free Futures capital when AI wants to rotate positions
            if (cycleResult.aiTasks?.close_positions && cycleResult.aiTasks.close_positions.length > 0) {
              for (const posToClose of cycleResult.aiTasks.close_positions) {
                let closed = await forceClosePosition(bitgetFutures, posToClose.id, posToClose.reason);
                if (!closed) {
                  closed = await forceClosePosition(bitgetSpot, posToClose.id, posToClose.reason);
                }
              }
            }
            
            await executeStrategy(bitgetSpot, bitgetFutures, cycleResult.aiTasks, botConfigId, cycleResult.candidates || []);
          }
        } else if (cycleResult && cycleResult.errorType === 'QUOTA') {
          console.warn(`[Engine] ⚠️ Quota Exhausted. Waiting 10 minutes...`);
          nextSleepMs = 600000; 
        }

        await pruneFlashData(botConfigId);

        await new Promise(resolve => setTimeout(resolve, nextSleepMs));
        
      } catch (error) {
        if (error.message.includes('[CRITICAL_BALANCE]')) {
          activeLoops.delete(botConfigId);
          break;
        }
        console.error(`[Engine] Critical error in loop for ${botConfigId}:`, error);
        await new Promise(resolve => setTimeout(resolve, 60000));
      }
    }
  };

  loop().catch(err => console.error(`[Engine] Non-blocking loop error for ${botConfigId}:`, err));
}

function getExchangeClient(config) {
  try {
    if (config.isPaperTrading && config.User?.bitgetDemoApiKey) {
      return getBitgetClient(config.User.bitgetDemoApiKey, config.User.bitgetDemoApiSecret, config.User.bitgetDemoPassphrase, true);
    } else if (config.User?.bitgetApiKey) {
      return getBitgetClient(config.User.bitgetApiKey, config.User.bitgetApiSecret, config.User.bitgetPassphrase, false);
    }
    return null;
  } catch (e) { return null; }
}

export async function initEngine() {
  console.log('[Engine Debug] initEngine() beginning...');
  try {
    const activeConfigs = await prisma.botConfig.findMany({
      where: { isActive: true },
      include: { User: true }
    });
    console.log(`[Engine Debug] Found ${activeConfigs.length} active bots in database.`);
    for (const config of activeConfigs) {
      console.log(`[Engine Debug] Resuming bot: ${config.id}`);
      const client = getExchangeClient(config);
      if (client) await syncState(client, config.id, config.isPaperTrading);
      startEngine(config.id);
    }
  } catch (error) {
    console.error('[Engine] Failed to initialize active bots:', error);
  }
}

export function stopEngine(botConfigId) {
  if (activeLoops.has(botConfigId)) {
    console.log(`[Engine] Signaling stop for bot ${botConfigId}`);
    activeLoops.delete(botConfigId);
  }
}

async function pruneFlashData(botConfigId) {
  try {
    const keepLogIds = await prisma.aILogStream.findMany({
      where: { botConfigId },
      orderBy: { timestamp: 'desc' },
      take: 400,
      select: { id: true }
    });
    const keepLogIdSet = new Set(keepLogIds.map(x => x.id));
    await prisma.aILogStream.deleteMany({
      where: {
        botConfigId,
        ...(keepLogIdSet.size > 0 ? { id: { notIn: Array.from(keepLogIdSet) } } : {})
      }
    });

    const keepTrancheIds = await prisma.activeTranche.findMany({
      where: { botConfigId, status: { not: 'OPEN' } },
      orderBy: [{ closedAt: 'desc' }, { openedAt: 'desc' }],
      take: 200,
      select: { id: true }
    });
    const keepTrancheIdSet = new Set(keepTrancheIds.map(x => x.id));
    await prisma.activeTranche.deleteMany({
      where: {
        botConfigId,
        status: { not: 'OPEN' },
        ...(keepTrancheIdSet.size > 0 ? { id: { notIn: Array.from(keepTrancheIdSet) } } : {})
      }
    });
  } catch (e) {}
}
