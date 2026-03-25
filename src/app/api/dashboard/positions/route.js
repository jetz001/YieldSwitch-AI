import { PrismaClient } from '@prisma/client';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from 'next/server';

import { getBitgetClient } from '@/services/bitget';

const prisma = new PrismaClient();

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = await prisma.botConfig.findFirst({
      where: { userId: session.user.id },
      include: { User: true }
    });

    if (!config) return NextResponse.json([]);

    const positions = await prisma.activeTranche.findMany({
      where: { botConfigId: config.id, status: 'OPEN' },
      orderBy: { openedAt: 'desc' }
    });

    if (positions.length === 0) return NextResponse.json([]);

    // Enhancement: Fetch Real-time P&L and Matching Status
    let client;
    if (config.isPaperTrading && config.User?.bitgetDemoApiKey) {
      client = getBitgetClient(config.User.bitgetDemoApiKey, config.User.bitgetDemoApiSecret, config.User.bitgetDemoPassphrase, true);
    } else {
      client = getBitgetClient(config.User.bitgetApiKey, config.User.bitgetApiSecret, config.User.bitgetPassphrase, false);
    }

    // 1. Fetch ALL open orders from exchange to check for "Pending" status
    let openOrders = [];
    let hasExchangeConnection = false;
    try {
      openOrders = await client.fetchOpenOrders();
      hasExchangeConnection = true;
    } catch (e) {
      console.warn('[Dashboard] Could not fetch open orders for matching check.');
    }

    const augmentedPositions = await Promise.all(positions.map(async (pos) => {
      try {
        const ticker = await client.fetchTicker(pos.symbol);
        const currentPrice = ticker.last || ticker.close || pos.entryPrice;
        const pnlPercent = pos.side.toUpperCase() === 'BUY' 
          ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
          : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;
        
        // 2. Check if this specific tranche is "Matched"
        // Logic: If it's NOT in the list of Open Orders, it must be Matched (Filled).
        let isMatched = false;
        const isActuallyTrading = (config.isPaperTrading && !!config.User.bitgetDemoApiKey) || !config.isPaperTrading;

        if (!isActuallyTrading || pos.trancheGroupId.startsWith('sync')) {
          isMatched = true; // Simulated or already synced positions are matched
        } else if (hasExchangeConnection) {
          // If no open orders exist for this symbol/side, we assume it's matched/filled.
          const isPending = openOrders.some(o => 
            o.symbol === pos.symbol && 
            o.side?.toLowerCase() === pos.side?.toLowerCase()
          );
          isMatched = !isPending;
        }

        return {
          ...pos,
          currentPrice,
          pnlPercent: parseFloat(pnlPercent.toFixed(2)),
          isMatched
        };
      } catch (e) {
        return { ...pos, currentPrice: pos.entryPrice, pnlPercent: 0, isMatched: true };
      }
    }));

    return NextResponse.json(augmentedPositions);
  } catch (error) {
    console.error('Dashboard Positions Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
