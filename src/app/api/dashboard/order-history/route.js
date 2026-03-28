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

function _computePnlPercentClosed({ entryPrice, exitPrice, side }) {
  if (entryPrice === null || entryPrice === undefined) return null;
  if (exitPrice === null || exitPrice === undefined) return null;
  if (entryPrice === 0) return null;

  const entryAction = normalizeEntryAction(side); // BUY or SELL
  const raw = ((exitPrice - entryPrice) / entryPrice) * 100;
  const adjusted = entryAction === 'BUY' ? raw : -raw;
  return Number(adjusted.toFixed(2));
}

function _computePnlPercentOpen({ entryPrice, currentPrice, side }) {
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

    const isDemo = config.isPaperTrading && !!config.User?.bitgetDemoApiKey;
    const liveKeysOk = !config.isPaperTrading && !!config.User?.bitgetApiKey;
    if (!isDemo && !liveKeysOk) return NextResponse.json([]);

    const marketType = (searchParams.get('marketType') || config.marketType || 'FUTURES').toUpperCase();
    const client = marketType === 'SPOT'
      ? (isDemo
          ? getBitgetClient(config.User.bitgetDemoApiKey, config.User.bitgetDemoApiSecret, config.User.bitgetDemoPassphrase, true, 'SPOT')
          : getBitgetClient(config.User.bitgetApiKey, config.User.bitgetApiSecret, config.User.bitgetPassphrase, false, 'SPOT'))
      : (isDemo
          ? getBitgetClient(config.User.bitgetDemoApiKey, config.User.bitgetDemoApiSecret, config.User.bitgetDemoPassphrase, true, 'FUTURES')
          : getBitgetClient(config.User.bitgetApiKey, config.User.bitgetApiSecret, config.User.bitgetPassphrase, false, 'FUTURES'));

    const norm = (s) => String(s || '').toUpperCase();
    const wantsSearch = search ? norm(search) : '';

    let rows = [];
    if (statusParam === 'CLOSED' || statusParam === 'ALL') {
      const trades = await client.fetchMyTrades(undefined, undefined, limit).catch(() => []);
      const mappedTrades = (trades || [])
        .filter(t => !wantsSearch || norm(t.symbol).includes(wantsSearch))
        .map(t => {
          const entryAction = normalizeEntryAction(t.side);
          return {
            id: `ex-trade-${t.id || `${t.timestamp}-${t.symbol}-${t.side}`}`,
            botConfigId: config.id,
            symbol: t.symbol,
            side: (t.side || '').toUpperCase(),
            status: 'CLOSED',
            trancheGroupId: 'exchange-trade',
            entryPrice: Number(t.price || 0),
            exitPrice: null,
            pnlUsdt: null,
            originalAmount: Number(t.amount || 0),
            remainingAmount: 0,
            isCapitalExtracted: false,
            isPaperTrade: !!config.isPaperTrading,
            takeProfitPrice: null,
            stopLossPrice: null,
            trailingStopPrice: null,
            highestPriceReached: 0,
            openedAt: t.datetime ? new Date(t.datetime) : null,
            closedAt: t.datetime ? new Date(t.datetime) : null,
            sector: 'OTHER',
            tpTiers: null,
            marketType: marketType === 'SPOT' ? 'SPOT' : 'FUTURES',
            entryAction,
            exitAction: entryAction === 'BUY' ? 'SELL' : 'BUY',
            currentPrice: null,
            pnlPercent: null,
          };
        });
      rows = rows.concat(mappedTrades);
    }

    if (statusParam === 'CANCELLED' || statusParam === 'ALL') {
      const cancelled = await client.fetchCanceledOrders(undefined, undefined, limit).catch(() => []);
      const mappedCancelled = (cancelled || [])
        .filter(o => !wantsSearch || norm(o.symbol).includes(wantsSearch))
        .map(o => {
          const entryAction = normalizeEntryAction(o.side);
          return {
            id: `ex-cancel-${o.id}`,
            botConfigId: config.id,
            symbol: o.symbol,
            side: (o.side || '').toUpperCase(),
            status: 'CANCELLED',
            trancheGroupId: 'exchange-cancel',
            entryPrice: Number(o.price || 0),
            exitPrice: null,
            pnlUsdt: null,
            originalAmount: Number(o.amount || 0),
            remainingAmount: Number(o.remaining || 0),
            isCapitalExtracted: false,
            isPaperTrade: !!config.isPaperTrading,
            takeProfitPrice: null,
            stopLossPrice: null,
            trailingStopPrice: null,
            highestPriceReached: 0,
            openedAt: o.datetime ? new Date(o.datetime) : null,
            closedAt: o.lastTradeTimestamp ? new Date(o.lastTradeTimestamp) : (o.datetime ? new Date(o.datetime) : null),
            sector: 'OTHER',
            tpTiers: null,
            marketType: marketType === 'SPOT' ? 'SPOT' : 'FUTURES',
            entryAction,
            exitAction: entryAction === 'BUY' ? 'SELL' : 'BUY',
            currentPrice: null,
            pnlPercent: null,
          };
        });
      rows = rows.concat(mappedCancelled);
    }

    rows = rows
      .sort((a, b) => {
        const ta = a.closedAt ? new Date(a.closedAt).getTime() : (a.openedAt ? new Date(a.openedAt).getTime() : 0);
        const tb = b.closedAt ? new Date(b.closedAt).getTime() : (b.openedAt ? new Date(b.openedAt).getTime() : 0);
        return tb - ta;
      })
      .slice(0, limit);

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Order History API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

