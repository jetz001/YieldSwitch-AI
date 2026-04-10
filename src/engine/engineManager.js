import { runCognitiveLoop } from './aiCognitiveDualLoop.js';
import { checkZeroBalance } from './guards/balanceGuard.js';
import { executeStrategy, closePositionBySymbol } from './executionGuard.js';
import { checkGlobalCircuitBreaker } from './mathGuard.js';
import { getExchangeClient } from '../services/exchangeFactory.js';
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
        const exchangeClient = getLocalExchangeClient(config);
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
            let engineClientSpot, engineClientFutures;
            
            // Determine which exchange to use
            const exchangeId = String(config.exchangeId || config.User?.activeExchange || 'bitget').toLowerCase();
            console.log(`[Engine] Using Exchange: ${exchangeId.toUpperCase()} for bot ${botConfigId}`);

            // If in Paper Mode and Demo Keys are provided -> Use Native Demo
            if (config.isPaperTrading) {
              const demoKey = exchangeId === 'binance' ? config.User.binanceDemoApiKey : config.User.bitgetDemoApiKey;
              const demoSecret = exchangeId === 'binance' ? config.User.binanceDemoApiSecret : config.User.bitgetDemoApiSecret;
              const demoPass = exchangeId === 'binance' ? undefined : config.User.bitgetDemoPassphrase;
              
              if (demoKey) {
                console.log(`[Engine] Using NATIVE DEMO for bot ${botConfigId}`);
                engineClientSpot = getExchangeClient(exchangeId, demoKey, demoSecret, demoPass, true, 'SPOT');
                engineClientFutures = getExchangeClient(exchangeId, demoKey, demoSecret, demoPass, true, 'FUTURES');
              }
            } else {
              const liveKey = exchangeId === 'binance' ? config.User.binanceApiKey : config.User.bitgetApiKey;
              const liveSecret = exchangeId === 'binance' ? config.User.binanceApiSecret : config.User.bitgetApiSecret;
              const livePass = exchangeId === 'binance' ? undefined : config.User.bitgetPassphrase;
              
              engineClientSpot = getExchangeClient(exchangeId, liveKey, liveSecret, livePass, false, 'SPOT');
              engineClientFutures = getExchangeClient(exchangeId, liveKey, liveSecret, livePass, false, 'FUTURES');
            }

            if (cycleResult.aiTasks?.cancel_orders && cycleResult.aiTasks.cancel_orders.length > 0) {
              for (const ord of cycleResult.aiTasks.cancel_orders) {
                const orderId = ord?.id;
                if (!orderId) continue;
                let cancelled = false;
                try {
                  await engineClientFutures.cancelOrder(orderId);
                  cancelled = true;
                } catch (e) {}
                if (!cancelled) {
                  try {
                    await engineClientSpot.cancelOrder(orderId);
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
              const extractMarketTypeFromDirectives = (directives) => {
                const text = String(directives || '');
                const marker = text.match(/\[\[\s*MARKET_TYPE\s*=\s*(SPOT|FUTURES|MIXED)\s*\]\]/i);
                if (marker?.[1]) return marker[1].toUpperCase();
                const alt = text.match(/MARKET_TYPE\s*[:=]\s*(SPOT|FUTURES|MIXED)/i);
                if (alt?.[1]) return alt[1].toUpperCase();
                return null;
              };
              const marketType = extractMarketTypeFromDirectives(config.aiDirectives) || config.marketType || 'MIXED';

              const normalizeBasePair = (sym) => {
                const s = String(sym || '').trim().toUpperCase();
                if (!s) return '';
                const noPipe = s.includes('|') ? s.split('|')[0] : s;
                const noSpace = noPipe.split(/\s+/)[0];
                const noDirective = noSpace
                  .replace(/:SHORT$/i, '')
                  .replace(/:LONG$/i, '')
                  .replace(/:SELL$/i, '')
                  .replace(/:BUY$/i, '');
                return noDirective.split(':')[0];
              };

              let futuresOpenBasePairs = null;
              let spotHeldCoins = null;

              if (marketType === 'FUTURES' || marketType === 'MIXED') {
                const positions = await engineClientFutures.fetchPositions().catch(() => []);
                futuresOpenBasePairs = new Set(
                  (positions || [])
                    .filter(p => Number(p?.contracts || 0) > 0)
                    .map(p => normalizeBasePair(p.symbol))
                    .filter(Boolean)
                );
              }

              if (marketType === 'SPOT' || marketType === 'MIXED') {
                const bal = await engineClientSpot.fetchBalance({ type: 'spot' }).catch(() => ({}));
                spotHeldCoins = new Set(
                  Object.keys(bal?.free || {})
                    .filter(c => Number(bal.free[c]) > 0)
                    .map(c => String(c).toUpperCase())
                );
              }

              for (const posToClose of cycleResult.aiTasks.close_positions) {
                const raw =
                  typeof posToClose === 'string'
                    ? posToClose.trim()
                    : String(posToClose?.symbol || posToClose?.id || '').trim();
                const rawParts = raw.includes('|') ? raw.split('|') : [raw];
                const closeSymbol = rawParts[0];
                if (!closeSymbol) continue;

                const closeBasePair = normalizeBasePair(closeSymbol);
                const closeCoin = closeBasePair ? closeBasePair.split('/')[0] : String(closeSymbol).split('/')[0].toUpperCase();
                const posExists =
                  marketType === 'FUTURES'
                    ? !!(closeBasePair && futuresOpenBasePairs?.has(closeBasePair))
                    : marketType === 'SPOT'
                      ? !!(closeCoin && spotHeldCoins?.has(closeCoin))
                      : !!(
                          (closeBasePair && futuresOpenBasePairs?.has(closeBasePair)) ||
                          (closeCoin && spotHeldCoins?.has(closeCoin))
                        );

                if (!posExists) {
                  const ghostMsg = `[GUARD] 👻 AI Ghost Trade Blocked: AI tried to close ${closeSymbol} but it is not in active positions.`;
                  console.warn(`[Engine] ${ghostMsg}`);
                  await logPhase(botConfigId, 'TASK_CHECK', ghostMsg);
                  continue;
                }

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
                  await closePositionBySymbol(engineClientSpot, botConfigId, closeSymbol, closeSide, safeReason);
                } else if (marketType === 'FUTURES') {
                  await closePositionBySymbol(engineClientFutures, botConfigId, cleanCloseSymbol, closeSide, safeReason);
                } else {
                  let closed = await closePositionBySymbol(engineClientFutures, botConfigId, cleanCloseSymbol, closeSide, safeReason);
                  if (!closed) {
                    await closePositionBySymbol(engineClientSpot, botConfigId, closeSymbol, closeSide, safeReason);
                  }
                }
              }
            }
            
            await executeStrategy(engineClientSpot, engineClientFutures, cycleResult.aiTasks, botConfigId, cycleResult.candidates || []);
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

function getLocalExchangeClient(config) {
  try {
    const user = config.User;
    const exchangeId = String(config.exchangeId || user?.activeExchange || 'bitget').toLowerCase();
    
    if (config.isPaperTrading) {
      const demoKey = exchangeId === 'binance' ? user.binanceDemoApiKey : user.bitgetDemoApiKey;
      const demoSecret = exchangeId === 'binance' ? user.binanceDemoApiSecret : user.bitgetDemoApiSecret;
      const demoPass = exchangeId === 'binance' ? undefined : user.bitgetDemoPassphrase;
      if (demoKey) return getExchangeClient(exchangeId, demoKey, demoSecret, demoPass, true);
    } else {
      const liveKey = exchangeId === 'binance' ? user.binanceApiKey : user.bitgetApiKey;
      const liveSecret = exchangeId === 'binance' ? user.binanceApiSecret : user.bitgetApiSecret;
      const livePass = exchangeId === 'binance' ? undefined : user.bitgetPassphrase;
      if (liveKey) return getExchangeClient(exchangeId, liveKey, liveSecret, livePass, false);
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
  const exchangeId = config.exchangeId || user?.activeExchange || 'bitget';

  if (config.isPaperTrading) {
    const demoKey = exchangeId === 'binance' ? user.binanceDemoApiKey : user.bitgetDemoApiKey;
    const demoSecret = exchangeId === 'binance' ? user.binanceDemoApiSecret : user.bitgetDemoApiSecret;
    const demoPass = exchangeId === 'binance' ? undefined : user.bitgetDemoPassphrase;
    
    if (demoKey) {
      futures = getExchangeClient(exchangeId, demoKey, demoSecret, demoPass, true, 'FUTURES');
      spot = futures; 
    }
  } else {
    const liveKey = exchangeId === 'binance' ? user.binanceApiKey : user.bitgetApiKey;
    const liveSecret = exchangeId === 'binance' ? user.binanceApiSecret : user.bitgetApiSecret;
    const livePass = exchangeId === 'binance' ? undefined : user.bitgetPassphrase;
    
    if (liveKey) {
      spot = getExchangeClient(exchangeId, liveKey, liveSecret, livePass, false, 'SPOT');
      futures = getExchangeClient(exchangeId, liveKey, liveSecret, livePass, false, 'FUTURES');
    }
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
