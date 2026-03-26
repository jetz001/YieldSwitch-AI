import { PrismaClient } from '@prisma/client';
import { runCognitiveSpotLoop } from './aiCognitiveSpotLoop.js';
import { runCognitiveFutureLoop } from './aiCognitiveFutureLoop.js';

const prisma = new PrismaClient();

function extractMarketTypeFromDirectives(directives) {
  const text = String(directives || '');
  const marker = text.match(/\[\[\s*MARKET_TYPE\s*=\s*(SPOT|FUTURES|MIXED)\s*\]\]/i);
  if (marker?.[1]) return marker[1].toUpperCase();
  const alt = text.match(/MARKET_TYPE\s*[:=]\s*(SPOT|FUTURES|MIXED)/i);
  if (alt?.[1]) return alt[1].toUpperCase();
  return null;
}

export async function runCognitiveLoop(botConfigId) {
  const config = await prisma.botConfig.findUnique({ where: { id: botConfigId } });
  if (!config || !config.isActive) return null;

  const marketType = extractMarketTypeFromDirectives(config.aiDirectives) || config.marketType || 'MIXED';

  if (marketType === 'SPOT') {
    return runCognitiveSpotLoop(botConfigId);
  } else if (marketType === 'FUTURES') {
    return runCognitiveFutureLoop(botConfigId);
  } else {
    // MIXED Mode: For now, we default to Future Loop as it's more versatile,
    // but in the future we can add "Dual" logic here to analyze which is better.
    return runCognitiveFutureLoop(botConfigId);
  }
}
