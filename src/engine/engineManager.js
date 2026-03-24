import { runCognitiveLoop } from './aiCognitiveLoop';
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

        // Run one cycle
        await runCognitiveLoop(botConfigId);

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
 * Stops the AI Cognitive Loop for a specific bot configuration.
 */
export function stopEngine(botConfigId) {
  if (activeLoops.has(botConfigId)) {
    console.log(`[Engine] Signaling stop for bot ${botConfigId}`);
    activeLoops.delete(botConfigId);
  }
}
