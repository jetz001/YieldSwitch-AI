import { prisma } from '@/lib/db';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from 'next/server';

import { getExchangeClients } from '@/engine/engineManager';

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

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim().toUpperCase() || '';
    const marketType = (searchParams.get('marketType') || config.marketType || 'FUTURES').toUpperCase();

    const isDemo = config.isPaperTrading && (config.User?.bitgetDemoApiKey || config.User?.binanceDemoApiKey);
    const liveKeysOk = !config.isPaperTrading && (config.User?.bitgetApiKey || config.User?.binanceApiKey);
    if (!isDemo && !liveKeysOk) return NextResponse.json([]);

    const { spot, futures } = await getExchangeClients(config.id);
    if (!spot || !futures) return NextResponse.json([]);
    const spotClient = spot;
    const futuresClient = futures;

    const normalizeSymbol = (s) => String(s || '').toUpperCase();
    const normalizeFuturesSide = (raw) => {
      const r = String(raw || '').toLowerCase();
      if (r.includes('short')) return 'SELL';
      if (r.includes('sell')) return 'SELL';
      return 'BUY';
    };

    const rows = [];

    const [positions, openOrders] = await Promise.all([
      (marketType === 'FUTURES' || marketType === 'MIXED') ? futuresClient.fetchPositions().catch(() => []) : Promise.resolve([]),
      (marketType === 'SPOT' || marketType === 'MIXED') ? spotClient.fetchOpenOrders().catch(() => []) : Promise.resolve([])
    ]);

    if (marketType === 'FUTURES' || marketType === 'MIXED') {
      for (const p of positions) {
        const contracts = Number(p.contracts || 0);
        if (!Number.isFinite(contracts) || contracts <= 0) continue;
        const symbol = p.symbol;
        if (search && !normalizeSymbol(symbol).includes(search)) continue;

        const entryPrice = Number(p.entryPrice || 0);
        const currentPrice = Number(p.markPrice || p.lastPrice || p.info?.markPrice || p.info?.markPx || p.info?.last || entryPrice);
        const side = normalizeFuturesSide(p.side || p.info?.holdSide || p.info?.posSide);
        const baseAmount = contracts;
        const notionalUsdt = Number.isFinite(currentPrice) && currentPrice > 0 ? baseAmount * currentPrice : 0;
        const pnlPercent =
          entryPrice > 0 && Number.isFinite(currentPrice)
            ? Number((((currentPrice - entryPrice) / entryPrice) * (side === 'SELL' ? -1 : 1) * 100).toFixed(2))
            : 0;

        rows.push({
          id: `ex-pos-${symbol}-${side}`,
          botConfigId: config.id,
          symbol,
          side,
          status: 'OPEN',
          trancheGroupId: 'exchange',
          entryPrice,
          exitPrice: null,
          pnlUsdt: Number(p.unrealizedPnl || 0),
          originalAmount: notionalUsdt,
          remainingAmount: notionalUsdt,
          isCapitalExtracted: false,
          isPaperTrade: !!config.isPaperTrading,
          takeProfitPrice: null,
          stopLossPrice: null,
          trailingStopPrice: null,
          highestPriceReached: 0,
          openedAt: p.datetime ? new Date(p.datetime) : null,
          closedAt: null,
          sector: 'OTHER',
          tpTiers: null,
          marketType: 'FUTURES',
          currentPrice,
          pnlPercent,
          isMatched: true
        });
      }
    }

    if (marketType === 'SPOT' || marketType === 'MIXED') {
      for (const o of openOrders) {
        const symbol = o.symbol;
        if (search && !normalizeSymbol(symbol).includes(search)) continue;
        rows.push({
          id: `ex-ord-${o.id}`,
          botConfigId: config.id,
          symbol,
          side: String(o.side || '').toUpperCase(),
          status: 'OPEN',
          trancheGroupId: 'exchange-order',
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
          closedAt: null,
          sector: 'OTHER',
          tpTiers: null,
          marketType: 'SPOT',
          currentPrice: Number(o.price || 0),
          pnlPercent: 0,
          isMatched: false
        });
      }
    }

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Dashboard Positions Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
