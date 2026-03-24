import { runCognitiveLoop } from './aiCognitiveLoop';
import { executeStrategy } from './executionGuard';
import { syncState } from './executionGuard';
import { checkGlobalCircuitBreaker, checkZombieGuard, tickMathGuard } from './mathGuard';
import { getBitgetClient } from '../services/bitget';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const activeLoops = new Map();

/**
 * Starts the AI Cognitive Loop for a specific bot configuration.
 * Master Prompt: Zero-Touch Autopilot — runs indefinitely with all guards active.
 */
export async function startEngine(botConfigId) {
  if (activeLoops.has(botConfigId)) {
    console.log(`[Engine] Loop already active for ${botConfigId}`);
    return;
  }

  console.log(`[Engine] Starting background loop for bot ${botConfigId}...`);
  
  const loop = async () => {
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
            let totalEquity = 0;
            const accountTypes = ['spot', 'swap'];
            const stablecoins = ['USDT', 'USD', 'SUSDT', 'USDC', 'BUSD'];

            for (const accType of accountTypes) {
              try {
                const balance = await exchangeClient.fetchBalance({ type: accType });
                for (const coin of stablecoins) {
                  const val = parseFloat(balance.total?.[coin] || 0);
                  if (val > 0) totalEquity += val;
                }
              } catch (e) {
                // Skip account types that don't exist
              }
            }
            
            const breaker = await checkGlobalCircuitBreaker(botConfigId, totalEquity);
            if (breaker) {
              console.log(`[Engine] 🚨 CIRCUIT BREAKER TRIGGERED for ${botConfigId}. Equity ${totalEquity.toFixed(2)} vs Budget ${config.allocatedPortfolioUsdt}. Halting.`);
              
              // Close all open positions
              try {
                const positions = await exchangeClient.fetchPositions();
                for (const pos of positions.filter(p => parseFloat(p.contracts) > 0)) {
                  const closeSide = pos.side === 'long' ? 'sell' : 'buy';
                  await exchangeClient.createMarketOrder(pos.symbol, closeSide, parseFloat(pos.contracts));
                }
              } catch (closeErr) {
                console.error('[Engine] Error closing positions during circuit breaker:', closeErr.message);
              }
              
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
        if (exchangeClient) {
          const openTranches = await prisma.activeTranche.findMany({
            where: { botConfigId, status: 'OPEN' }
          });
          for (const tranche of openTranches) {
            await tickMathGuard(exchangeClient, tranche);
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
              bitgetSpot = getBitgetClient(config.User.bitgetDemoApiKey, config.User.bitgetDemoApiSecret, config.User.bitgetDemoPassphrase, true);
              bitgetFutures = getBitgetClient(config.User.bitgetDemoApiKey, config.User.bitgetDemoApiSecret, config.User.bitgetDemoPassphrase, true);
            } else {
              bitgetSpot = getBitgetClient(config.User.bitgetApiKey, config.User.bitgetApiSecret, config.User.bitgetPassphrase, false);
              bitgetFutures = getBitgetClient(config.User.bitgetApiKey, config.User.bitgetApiSecret, config.User.bitgetPassphrase, false);
            }
            
            // Execute the plan
            await executeStrategy(bitgetSpot, bitgetFutures, cycleResult.aiTasks, botConfigId);
          }
        }

        // Sleep for 30 seconds (dev) / 60 seconds (prod)
        await new Promise(resolve => setTimeout(resolve, 30000));
        
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
        await syncState(client, config.id);
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
