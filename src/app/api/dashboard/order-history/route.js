import { PrismaClient } from '@prisma/client';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { NextResponse } from 'next/server';
import { getBitgetClient } from '@/services/bitget';

const prisma = new PrismaClient();

function normalizeEntryAction(side) {
  const s = (side || '').toUpperCase();
  // Data may be stored as BUY/SELL or LONG/SHORT depending on engine version.
  if (s === 'BUY' || s === 'LONG') return 'BUY';
  if (s === 'SELL' || s === 'SHORT') return 'SELL';
  return s.includes('BUY') ? 'BUY' : 'SELL';
}

function computePnlPercentClosed({ entryPrice, exitPrice, side }) {
  if (entryPrice === null || entryPrice === undefined) return null;
  if (exitPrice === null || exitPrice === undefined) return null;
  if (entryPrice === 0) return null;

  const entryAction = normalizeEntryAction(side); // BUY or SELL
  const raw = ((exitPrice - entryPrice) / entryPrice) * 100;
  const adjusted = entryAction === 'BUY' ? raw : -raw;
  return Number(adjusted.toFixed(2));
}

function computePnlPercentOpen({ entryPrice, currentPrice, side }) {
  if (entryPrice === null || entryPrice === undefined) return null;
  if (currentPrice === null || currentPrice === undefined) return null;
  if (entryPrice === 0) return null;

  const entryAction = normalizeEntryAction(side); // BUY or SELL
  const raw = ((currentPrice - entryPrice) / entryPrice) * 100;
  const adjusted = entryAction === 'BUY' ? raw : -raw;
  return Number(adjusted.toFixed(2));
}

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

    if (!config) return NextResponse.json({ error: 'No BotConfig found' }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const statusParam = (searchParams.get('status') || 'CLOSED').toUpperCase(); // CLOSED|CANCELLED|ALL
    const search = (searchParams.get('search') || '').trim();
    const limitParam = parseInt(searchParams.get('limit') || '50', 10);
    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 100)) : 50;

    const whereClause = { botConfigId: config.id };
    if (statusParam !== 'ALL') whereClause.status = statusParam;
    if (search) {
      whereClause.symbol = { contains: search.toUpperCase(), mode: 'insensitive' };
    }

    const tranches = await prisma.activeTranche.findMany({
      where: whereClause,
      orderBy: [{ closedAt: 'desc' }, { openedAt: 'desc' }],
      take: limit
    });

    // Optional: enrich OPEN positions with live ticker price.
    let client = null;
    try {
      const isDemo = config.isPaperTrading && !!config.User?.bitgetDemoApiKey;
      const liveKeysOk = !config.isPaperTrading && !!config.User?.bitgetApiKey;

      if (isDemo) {
        client = getBitgetClient(
          config.User.bitgetDemoApiKey,
          config.User.bitgetDemoApiSecret,
          config.User.bitgetDemoPassphrase,
          true
        );
      } else if (liveKeysOk) {
        client = getBitgetClient(
          config.User.bitgetApiKey,
          config.User.bitgetApiSecret,
          config.User.bitgetPassphrase,
          false
        );
      }
    } catch (e) {
      client = null;
    }

    const openTranches = tranches.filter((t) => t.status === 'OPEN');
    const openPriceMap = new Map();
    if (client && openTranches.length > 0) {
      await Promise.all(
        openTranches.map(async (t) => {
          try {
            const ticker = await client.fetchTicker(t.symbol);
            const currentPrice = ticker?.last || ticker?.close || t.entryPrice || null;
            openPriceMap.set(t.id, currentPrice);
          } catch (e) {
            openPriceMap.set(t.id, null);
          }
        })
      );
    }

    const rows = tranches.map((t) => {
      const entryAction = normalizeEntryAction(t.side);
      const currentPrice = t.status === 'OPEN' ? openPriceMap.get(t.id) ?? null : null;

      const pnlPercent =
        t.status === 'CLOSED'
          ? computePnlPercentClosed({ entryPrice: t.entryPrice, exitPrice: t.exitPrice, side: t.side })
          : t.status === 'OPEN'
            ? computePnlPercentOpen({ entryPrice: t.entryPrice, currentPrice, side: t.side })
            : null;

      return {
        ...t,
        entryAction,
        exitAction: entryAction === 'BUY' ? 'SELL' : 'BUY',
        currentPrice,
        pnlPercent
      };
    });

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Order History API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

