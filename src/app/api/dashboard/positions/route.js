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

    // Parse query params for search/filter
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim().toUpperCase() || '';
    const statusFilter = searchParams.get('status')?.toUpperCase() || 'ALL';

    // Build query: show ALL positions (OPEN, CLOSED, CANCELLED)
    const whereClause = { botConfigId: config.id };
    if (statusFilter !== 'ALL') {
      whereClause.status = statusFilter;
    }
    if (search) {
      whereClause.symbol = { contains: search, mode: 'insensitive' };
    }

    const positions = await prisma.activeTranche.findMany({
      where: whereClause,
      orderBy: { openedAt: 'desc' },
      take: 100
    });

    if (positions.length === 0) return NextResponse.json([]);

    // Set up exchange client for real-time prices (OPEN positions only)
    let client;
    try {
      if (config.isPaperTrading && config.User?.bitgetDemoApiKey) {
        client = getBitgetClient(config.User.bitgetDemoApiKey, config.User.bitgetDemoApiSecret, config.User.bitgetDemoPassphrase, true);
      } else if (config.User?.bitgetApiKey) {
        client = getBitgetClient(config.User.bitgetApiKey, config.User.bitgetApiSecret, config.User.bitgetPassphrase, false);
      }
    } catch (e) {
      client = null;
    }

    // Fetch open orders for matching check (only if we have a client)
    let openOrders = [];
    let hasExchangeConnection = false;
    if (client) {
      try {
        openOrders = await client.fetchOpenOrders();
        hasExchangeConnection = true;
      } catch (e) {
        console.warn('[Dashboard] Could not fetch open orders for matching check.');
      }
    }

    const augmentedPositions = await Promise.all(positions.map(async (pos) => {
      // For CLOSED/CANCELLED positions, use stored data — no live fetch needed
      if (pos.status !== 'OPEN') {
        return {
          ...pos,
          currentPrice: pos.exitPrice || pos.entryPrice,
          pnlPercent: pos.pnlUsdt && pos.originalAmount > 0
            ? parseFloat(((pos.pnlUsdt / pos.originalAmount) * 100).toFixed(2))
            : 0,
          isMatched: true,
        };
      }

      // For OPEN positions, fetch real-time data
      if (!client) {
        return { ...pos, currentPrice: pos.entryPrice, pnlPercent: 0, isMatched: true };
      }

      try {
        const ticker = await client.fetchTicker(pos.symbol);
        const currentPrice = ticker.last || ticker.close || pos.entryPrice;
        const pnlPercent = pos.side.toUpperCase() === 'BUY'
          ? ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100
          : ((pos.entryPrice - currentPrice) / pos.entryPrice) * 100;

        // Matching logic
        let isMatched = false;
        const isActuallyTrading = (config.isPaperTrading && !!config.User.bitgetDemoApiKey) || !config.isPaperTrading;

        if (!isActuallyTrading || pos.trancheGroupId.startsWith('sync')) {
          isMatched = true;
        } else if (hasExchangeConnection) {
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
