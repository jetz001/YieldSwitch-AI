import { runCognitiveLoop } from './aiCognitiveLoop';
import { executeStrategy } from './executionGuard';
import { getBitgetClient } from '../services/bitget';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const activeLoops = new Map();

/**
 * Starts the AI Cognitive Loop for a specific bot configuration.
 * It runs indefinitely with a delay until stopped or marked inactive.
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
          select: { isActive: true } 
        });

        if (!config || !config.isActive) {
          console.log(`[Engine] Stopping bot ${botConfigId} (Reason: Inactive or deleted)`);
          activeLoops.delete(botConfigId);
          break;
        }

        // Run AI Planning cycle
        const cycleResult = await runCognitiveLoop(botConfigId);
        
        if (cycleResult && cycleResult.status === 'SUCCESS' && cycleResult.aiTasks) {
          // Fetch full config for API keys
          const fullConfig = await prisma.botConfig.findUnique({ 
            where: { id: botConfigId },
            include: { User: true }
          });

          if (fullConfig && fullConfig.User) {
            // Determine which keys to use
            let bitgetSpot, bitgetFutures;
            
            // If in Paper Mode and Demo Keys are provided -> Use Bitget Native Demo
            if (fullConfig.isPaperTrading && fullConfig.User.bitgetDemoApiKey) {
              console.log(`[Engine] Using Bitget NATIVE DEMO for bot ${botConfigId}`);
              bitgetSpot = getBitgetClient(fullConfig.User.bitgetDemoApiKey, fullConfig.User.bitgetDemoApiSecret, fullConfig.User.bitgetDemoPassphrase, true);
              bitgetFutures = getBitgetClient(fullConfig.User.bitgetDemoApiKey, fullConfig.User.bitgetDemoApiSecret, fullConfig.User.bitgetDemoPassphrase, true);
            } else {
              // Otherwise use Live Keys (which might still run in Shadow Mode inside executionGuard if isPaperTrading is true)
              bitgetSpot = getBitgetClient(fullConfig.User.bitgetApiKey, fullConfig.User.bitgetApiSecret, fullConfig.User.bitgetPassphrase, false);
              bitgetFutures = getBitgetClient(fullConfig.User.bitgetApiKey, fullConfig.User.bitgetApiSecret, fullConfig.User.bitgetPassphrase, false);
            }
            
            // Execute the plan
            await executeStrategy(bitgetSpot, bitgetFutures, cycleResult.aiTasks, botConfigId);
          }
        }

        // Sleep for 1 minute (or adjust based on strategy)
        // For dev, let's do 30 seconds for better visibility
        await new Promise(resolve => setTimeout(resolve, 30000));
        
      } catch (error) {
        console.error(`[Engine] Critical error in loop for ${botConfigId}:`, error);
        // Exponential backoff or simple delay on error
        await new Promise(resolve => setTimeout(resolve, 60000));
      }
    }
  };

  activeLoops.set(botConfigId, true);
  loop(); // Start non-blocking
}

/**
 * Initializes and resumes all active bots from the database.
 * Call this on server startup or first request.
 */
export async function initEngine() {
  try {
    const activeConfigs = await prisma.botConfig.findMany({
      where: { isActive: true },
      select: { id: true }
    });

    console.log(`[Engine] Resuming ${activeConfigs.length} active bots...`);
    for (const config of activeConfigs) {
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
