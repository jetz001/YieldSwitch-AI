import { runCognitiveLoop } from './aiCognitiveDualLoop.js';
import { executeStrategy } from './executionGuard.js';
import { syncState } from './executionGuard.js';
import { checkGlobalCircuitBreaker, checkZombieGuard, tickMathGuard } from './mathGuard.js';
import { getBitgetClient } from '../services/bitget.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const activeLoops = new Map();

/**
 * Starts the AI Cognitive Loop for a specific bot configuration.
 * Master Prompt: Zero-Touch Autopilot — runs indefinitely with all guards active.
 */
export async function startEngine(botConfigId) {
  if (activeLoops.has(botConfigId)) {
    console.log(`[Engine] Stopping existing loop for ${botConfigId} before restart...`);
    stopEngine(botConfigId);
  }

  console.log(`[Engine] Starting background loop for bot ${botConfigId}...`);
  
  const loop = async () => {
    // Wait for the previous loop to truly exit if needed, but for simplicity we just proceed
    // since stopEngine removes it from the map.
    await new Promise(resolve => setTimeout(resolve, 1000));
    while (activeLoops.has(botConfigId)) {
      try {
        // Fetch fresh config to check if it's still active
        const config = await prisma.botConfig.findUnique({ 
          where: { id: botConfigId },
          include: { User: true }
        });

        if (!config || !config.isActive) {
          console.log(`[Engine] Stopping bot ${botConfigId} (Reason: Inactive or deleted)`);
          activeLoops.delete(botConfigId);
          break;
        }

        // ═══════════════════════════════════════════════
        // §3 CIRCUIT BREAKER CHECK (every loop iteration)
        // ═══════════════════════════════════════════════
        const exchangeClient = getExchangeClient(config);
        if (exchangeClient && config.allocatedPortfolioUsdt > 0) {
          try {
            // Fetch balances from both spot and swap to get full equity picture
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
              } catch (e) {
                // Skip account types that don't exist
              }
            }

            // Include value of open positions (unrealized P&L)
            let unrealizedPnlTotal = 0;
            try {
              const positions = await exchangeClient.fetchPositions();
              for (const pos of positions) {
                if (parseFloat(pos.contracts) > 0) {
                  unrealizedPnlTotal += parseFloat(pos.unrealizedPnl || 0);
                }
              }
            } catch (posErr) {
              console.warn('[Engine] Could not fetch positions for equity calculation.');
            }

            const totalEquity = walletEquity + unrealizedPnlTotal;
            const riskThreshold = config.allocatedPortfolioUsdt * 0.85; // 15% drop

            // Log details periodically (if equity is getting close or just for transparency)
            console.log(`[Engine Guard] Total Value: $${totalEquity.toFixed(2)} (Cash: $${walletEquity.toFixed(2)}, PNL: $${unrealizedPnlTotal.toFixed(2)}) | Breaker at: $${riskThreshold.toFixed(2)}`);
            
            const breaker = await checkGlobalCircuitBreaker(botConfigId, totalEquity);
            if (breaker) {
              console.log(`[Engine] 🚨 CIRCUIT BREAKER TRIGGERED for ${botConfigId}. Equity ${totalEquity.toFixed(2)} vs Budget ${config.allocatedPortfolioUsdt}. Halting.`);
              
              // 1. Close all open positions on Exchange
              try {
                const positions = await exchangeClient.fetchPositions();
                for (const pos of positions.filter(p => parseFloat(p.contracts) > 0)) {
                  const closeSide = pos.side === 'long' ? 'sell' : 'buy';
                  
                  // CANCEL ALL PENDING ORDERS FIRST
                  try { await exchangeClient.cancelAllOrders(pos.symbol); } catch(e) {}
                  
                  // CLOSE POSITION
                  await exchangeClient.createMarketOrder(pos.symbol, closeSide, parseFloat(pos.contracts));
                }
                
                // 2. SAFETY: Also cancel common symbols even if position is 0 (to catch hanging orders)
                const commonSymbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XLM/USDT', 'XRP/USDT'];
                for (const s of commonSymbols) {
                   try { await exchangeClient.cancelAllOrders(s); } catch (e) {}
                }
              } catch (closeErr) {
                console.error('[Engine] Error closing positions during circuit breaker:', closeErr.message);
              }

              // SYNC DATABASE: Mark all tranches as CLOSED
              await prisma.activeTranche.updateMany({
                where: { botConfigId, status: 'OPEN' },
                data: { status: 'CLOSED', closedAt: new Date() }
              });
              
              activeLoops.delete(botConfigId);
              break;
            }
          } catch (balErr) {
            console.warn('[Engine] Circuit Breaker balance check failed:', balErr.message);
          }
        }

        // ═══════════════════════════════════════════════
        // §3 ZOMBIE GUARD (every loop iteration)
        // ═══════════════════════════════════════════════
        if (exchangeClient) {
          await checkZombieGuard(exchangeClient, botConfigId);
        }

        // ═══════════════════════════════════════════════
        // §3 MATH GUARD TICK — TP Scaling & Trailing Stops
        // ═══════════════════════════════════════════════
        let nextSleepMs = 300000; // Default cooldown: 5 minutes
        
        if (exchangeClient) {
          const openTranches = await prisma.activeTranche.findMany({
            where: { botConfigId, status: 'OPEN' }
          });
          
          let rateLimitedCount = 0;
          for (const tranche of openTranches) {
            const result = await tickMathGuard(exchangeClient, tranche);
            if (result === 'RATE_LIMITED') {
              rateLimitedCount++;
            }
          }
          
          // If we hit rate limits, back off for longer period
          if (rateLimitedCount > 0) {
            console.warn(`[Engine] Rate limited on ${rateLimitedCount}/${openTranches.length} positions - extending backoff`);
            nextSleepMs = Math.max(nextSleepMs, 300000); // 5 minutes minimum
          }
        }

        // ═══════════════════════════════════════════════
        // AI COGNITIVE LOOP — Plan phase
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
            
            // Execute the plan with candidates for symbol mapping
            await executeStrategy(bitgetSpot, bitgetFutures, cycleResult.aiTasks, botConfigId, cycleResult.candidates || []);
          }
        } else if (cycleResult && cycleResult.errorType === 'QUOTA') {
          // If Quota exhausted, back off for 10 minutes
          console.warn(`[Engine] ⚠️ Quota Exhausted for ${botConfigId}. Waiting 10 minutes...`);
          nextSleepMs = 600000; 
        }

        // Sleep before next cycle
        await new Promise(resolve => setTimeout(resolve, nextSleepMs));

        
      } catch (error) {
        console.error(`[Engine] Critical error in loop for ${botConfigId}:`, error);
        // Exponential backoff on error
        await new Promise(resolve => setTimeout(resolve, 60000));
      }
    }
  };

  activeLoops.set(botConfigId, true);
  loop(); // Start non-blocking
}

/**
 * Helper: Get exchange client from config for guard checks
 */
function getExchangeClient(config) {
  try {
    if (config.isPaperTrading && config.User?.bitgetDemoApiKey) {
      return getBitgetClient(config.User.bitgetDemoApiKey, config.User.bitgetDemoApiSecret, config.User.bitgetDemoPassphrase, true);
    } else if (config.User?.bitgetApiKey) {
      return getBitgetClient(config.User.bitgetApiKey, config.User.bitgetApiSecret, config.User.bitgetPassphrase, false);
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Initializes and resumes all active bots from the database.
 * §5 State Recovery: On boot, sync state from exchange.
 */
export async function initEngine() {
  try {
    const activeConfigs = await prisma.botConfig.findMany({
      where: { isActive: true },
      include: { User: true }
    });

    console.log(`[Engine] Resuming ${activeConfigs.length} active bots...`);
    
    for (const config of activeConfigs) {
      // §5 State Recovery on boot
      const client = getExchangeClient(config);
      if (client) {
        await syncState(client, config.id, config.isPaperTrading);
      }
      
      startEngine(config.id);
    }
  } catch (error) {
    console.error('[Engine] Failed to initialize active bots:', error);
  }
}

/**
 * Stops the AI Cognitive Loop for a specific bot configuration.
 */
export function stopEngine(botConfigId) {
  if (activeLoops.has(botConfigId)) {
    console.log(`[Engine] Signaling stop for bot ${botConfigId}`);
    activeLoops.delete(botConfigId);
  }
}
