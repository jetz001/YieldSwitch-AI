import { prisma } from '@/lib/db';
import { closePositionBySymbol } from '@/engine/executionGuard';
import { getExchangeClients } from '@/engine/engineManager';

export async function POST(req) {
  try {
    const { symbol, side, reason } = await req.json();

    if (!symbol) {
      return Response.json({ error: 'MISSING_SYMBOL' }, { status: 400 });
    }

    // Get the first active bot config
    const config = await prisma.botConfig.findFirst({
      where: { isActive: true }
    });

    if (!config) {
      return Response.json({ error: 'NO_ACTIVE_BOT' }, { status: 400 });
    }

    const { futures, spot } = await getExchangeClients(config.id);
    
    // Check if it's a spot symbol (no colon)
    const isSpot = !symbol.includes(':');
    const client = isSpot ? spot : futures;

    if (!client) {
      return Response.json({ error: 'CLIENT_NOT_INITIALIZED' }, { status: 400 });
    }

    if (isSpot) {
      // Market Sell for Spot
      await client.createMarketOrder(symbol, 'sell', undefined, { reason: reason || 'MANUAL_SPOT_SELL' });
    } else {
      // Market Close for Futures
      await closePositionBySymbol(
        client,
        config.id,
        symbol,
        side,
        reason || 'MANUAL_DASHBOARD_CLOSE'
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('[API ClosePosition] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
