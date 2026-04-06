import { runCognitiveLoop } from './aiCognitiveDualLoop.js';
import { checkZeroBalance } from './guards/balanceGuard.js';
import { executeStrategy, closePositionBySymbol } from './executionGuard.js';
import { checkGlobalCircuitBreaker } from './mathGuard.js';
import { getBitgetClient } from '../services/bitget.js';
import { prisma } from '../lib/db.js';
import { logPhase } from './aiBase.js';

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
            await logPhase(botConfigId, 'TASK_CHECK', `[STATUS] PORTFOLIO : Equity: $${totalEquity.toFixed(2)} (Cash: $${walletEquity.toFixed(2)}, PNL: $${unrealizedPnlTotal.toFixed(2)})`);

            const extractMarketTypeFromDirectives = (directives) => {
              const text = String(directives || '');
              const marker = text.match(/\[\[\s*MARKET_TYPE\s*=\s*(SPOT|FUTURES|MIXED)\s*\]\]/i);
              if (marker?.[1]) return marker[1].toUpperCase();
              const alt = text.match(/MARKET_TYPE\s*[:=]\s*(SPOT|FUTURES|MIXED)/i);
              if (alt?.[1]) return alt[1].toUpperCase();
              return null;
            };
            const marketType = extractMarketTypeFromDirectives(config.aiDirectives) || config.marketType || 'MIXED';
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

        let nextSleepMs = 300000; // 5 mins

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
                  await logPhase(botConfigId, 'TRIGGER', `[ACTION] Cancel Order: ${orderId} : ${ord.reason || 'AI Decision'}`);
                } else {
                  await logPhase(botConfigId, 'TRIGGER', `[ACTION] Cancel Order Failed: ${orderId} : ${ord.reason || '-'}`);
                }
              }
            }

            // Close positions first to free Futures capital when AI wants to rotate positions
            if (cycleResult.aiTasks?.close_positions && cycleResult.aiTasks.close_positions.length > 0) {
              for (const posToClose of cycleResult.aiTasks.close_positions) {
                const raw =
                  typeof posToClose === 'string'
                    ? posToClose.trim()
                    : String(posToClose?.symbol || posToClose?.id || '').trim();
                const rawParts = raw.includes('|') ? raw.split('|') : [raw];
                const closeSymbol = rawParts[0];
                if (!closeSymbol) continue;
                const safeReason =
                  typeof posToClose?.reason === 'string' && posToClose.reason.trim().length > 0
                    ? posToClose.reason.trim()
                    : '-';
                const closeSideRaw = posToClose?.side ? String(posToClose.side).toUpperCase() : null;
                let closeSide =
                  closeSideRaw === 'BUY' || closeSideRaw === 'LONG'
                    ? 'LONG'
                    : closeSideRaw === 'SELL' || closeSideRaw === 'SHORT'
                      ? 'SHORT'
                      : null;
                if (!closeSide && rawParts.length >= 2) {
                  const inferred = String(rawParts[1] || '').toUpperCase();
                  closeSide = inferred === 'SHORT' ? 'SHORT' : inferred === 'LONG' ? 'LONG' : null;
                }

                // Cleanup symbol if AI messes up the format, e.g., ADA/USDT:SHORT
                let cleanCloseSymbol = closeSymbol.toUpperCase();
                if (cleanCloseSymbol.endsWith(':SHORT')) cleanCloseSymbol = cleanCloseSymbol.replace(':SHORT', ':USDT');
                if (cleanCloseSymbol.endsWith(':LONG')) cleanCloseSymbol = cleanCloseSymbol.replace(':LONG', ':USDT');
                if (cleanCloseSymbol.endsWith(':SELL')) cleanCloseSymbol = cleanCloseSymbol.replace(':SELL', ':USDT');
                if (cleanCloseSymbol.endsWith(':BUY')) cleanCloseSymbol = cleanCloseSymbol.replace(':BUY', ':USDT');

                if (marketType === 'SPOT') {
                  await closePositionBySymbol(bitgetSpot, botConfigId, closeSymbol, closeSide, safeReason);
                } else if (marketType === 'FUTURES') {
                  await closePositionBySymbol(bitgetFutures, botConfigId, cleanCloseSymbol, closeSide, safeReason);
                } else {
                  let closed = await closePositionBySymbol(bitgetFutures, botConfigId, cleanCloseSymbol, closeSide, safeReason);
                  if (!closed) {
                    await closePositionBySymbol(bitgetSpot, botConfigId, closeSymbol, closeSide, safeReason);
                  }
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
    const user = config.User;
    if (config.isPaperTrading && user?.bitgetDemoApiKey) {
      return getBitgetClient(user.bitgetDemoApiKey, user.bitgetDemoApiSecret, user.bitgetDemoPassphrase, true);
    } else if (user?.bitgetApiKey) {
      return getBitgetClient(user.bitgetApiKey, user.bitgetApiSecret, user.bitgetPassphrase, false);
    }
    return null;
  } catch (e) { return null; }
}

export async function getExchangeClients(botConfigId) {
  const config = await prisma.botConfig.findUnique({
    where: { id: botConfigId },
    include: { User: true }
  });
  if (!config) return { spot: null, futures: null };

  const user = config.User;
  let spot = null;
  let futures = null;

  if (config.isPaperTrading && user?.bitgetDemoApiKey) {
    futures = getBitgetClient(user.bitgetDemoApiKey, user.bitgetDemoApiSecret, user.bitgetDemoPassphrase, true);
    spot = futures; // Bitget Demo Unified
  } else {
    if (user?.bitgetApiKey) {
      spot = getBitgetClient(user.bitgetApiKey, user.bitgetApiSecret, user.bitgetPassphrase, false);
    }
    // For live, we might need a separate futures client if they differ, 
    // but usually getBitgetClient handles both if it's V2.
    futures = spot; 
  }
  
  return { spot, futures };
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
    // Note: AI Thought Console logs are now zero-logging and transient in memory.
    // We no longer query or prune aILogStream from DB.

    // 2. Prune Trade History (Keep latest 1,000 CLOSED/CANCELLED tranches)
    // We only prune closed/cancelled to avoid deleting active positions.
    const keepHistoryIds = await prisma.activeTranche.findMany({
      where: { 
        botConfigId,
        status: { in: ['CLOSED', 'CANCELLED'] }
      },
      orderBy: { openedAt: 'desc' },
      take: 1000,
      select: { id: true }
    });
    
    const keepHistoryIdSet = new Set(keepHistoryIds.map(x => x.id));
    await prisma.activeTranche.deleteMany({
      where: {
        botConfigId,
        status: { in: ['CLOSED', 'CANCELLED'] },
        ...(keepHistoryIdSet.size > 0 ? { id: { notIn: Array.from(keepHistoryIdSet) } } : {})
      }
    });

  } catch (e) {
    console.warn('[Engine] Pruning failed:', e.message);
  }
}
