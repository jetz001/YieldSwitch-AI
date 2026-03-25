import { PrismaClient } from '@prisma/client';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from 'next/server';
import { getBitgetClient } from '@/services/bitget';
import { initEngine } from '@/engine/engineManager';

const prisma = new PrismaClient();
let engineInitialized = false;

export async function GET(req) {
  if (!engineInitialized) {
    initEngine();
    engineInitialized = true;
  }
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

    const activePositions = await prisma.activeTranche.findMany({
      where: { botConfigId: config.id, status: 'OPEN' }
    });

    const closedPositions = await prisma.activeTranche.findMany({
      where: { botConfigId: config.id, status: 'CLOSED' }
    });

    const totalPnl = closedPositions.reduce((acc, p) => acc + (p.pnlUsdt || 0), 0);
    const paperPnl = activePositions.filter(p => p.isPaperTrade).reduce((acc, p) => acc + (p.pnlUsdt || 0), 0);
    let initialCapital = config.isPaperTrading ? config.paperBalanceUsdt : config.allocatedPortfolioUsdt;
    
    const isDemo = config.isPaperTrading && !!config.User.bitgetDemoApiKey;
    const isLive = !config.isPaperTrading && !!config.User.bitgetApiKey;
    let connectionStatus = (isLive || isDemo) ? 'CONNECTED' : 'NOT_CONFIGURED';
    let assets = [];

    if (isLive || isDemo) {
      try {
        const apiKey = isDemo ? config.User.bitgetDemoApiKey : config.User.bitgetApiKey;
        const apiSecret = isDemo ? config.User.bitgetDemoApiSecret : config.User.bitgetApiKeySecret;
        const apiPass = isDemo ? config.User.bitgetDemoPassphrase : config.User.bitgetPassphrase;
        const bitgetClient = getBitgetClient(apiKey, apiSecret, apiPass, isDemo);

        let totalEquityUsdt = 0;
        let walletAssetsValueUsdt = 0;
        let assetsMap = {};

        const fetchBal = async (type) => {
          try {
            const bal = await bitgetClient.fetchBalance({ type });
            for (const coin in bal.total || {}) {
              const total = parseFloat(bal.total[coin] || 0);
              if (total > 0) {
                if (!assetsMap[coin]) assetsMap[coin] = { coin, total: 0, free: 0, used: 0 };
                assetsMap[coin].total += total;
                assetsMap[coin].free += parseFloat(bal.free?.[coin] || 0);
                assetsMap[coin].used += parseFloat(bal.used?.[coin] || 0);
              }
            }
          } catch (e) {}
        };

        await fetchBal('swap');
        await fetchBal('spot');

        const stablecoins = ['USDT', 'USD', 'SUSDT', 'USDC', 'BUSD'];
        for (const coin of stablecoins) {
          const amt = assetsMap[coin]?.total || 0;
          totalEquityUsdt += amt;
          walletAssetsValueUsdt += amt;
        }

        // Best-effort: convert non-stable assets to USDT value using ticker.last
        // Note: some assets may not have a direct /USDT market; those will be skipped.
        try {
          if (Object.keys(assetsMap).length > 0) {
            await bitgetClient.loadMarkets();
          }
        } catch (e) {}

        try {
          const positions = await bitgetClient.fetchPositions();
          for (const pos of positions) {
            if (parseFloat(pos.contracts) > 0) {
              totalEquityUsdt += parseFloat(pos.unrealizedPnl || 0);
            }
          }
        } catch (e) {}

        // Price non-stable assets
        try {
          const stablecoinSet = new Set(stablecoins);
          const nonStableAssets = Object.values(assetsMap).filter((a) => a?.total > 0 && !stablecoinSet.has(a.coin));
          // Sort to reduce expensive calls when there are many small dust assets
          nonStableAssets.sort((a, b) => b.total - a.total);
          const assetsToPrice = nonStableAssets.slice(0, 15);

          for (const asset of assetsToPrice) {
            let currentPrice = null;
            const candidates = [
              `${asset.coin}/USDT`,
              `${asset.coin}/USDT:USDT`,
              `${asset.coin}/USD`
            ];

            for (const sym of candidates) {
              try {
                // If markets are loaded, prefer exact symbol matches.
                if (bitgetClient.markets && bitgetClient.markets[sym] === undefined) {
                  continue;
                }
              } catch (e) {}

              try {
                const ticker = await bitgetClient.fetchTicker(sym);
                const last = ticker?.last ?? ticker?.close;
                if (typeof last === 'number' && Number.isFinite(last) && last > 0) {
                  currentPrice = last;
                  break;
                }
                if (ticker?.bid && ticker?.ask) {
                  const mid = (ticker.bid + ticker.ask) / 2;
                  if (mid > 0) {
                    currentPrice = mid;
                    break;
                  }
                }
              } catch (e) {
                // Try next candidate symbol
              }
            }

            if (currentPrice !== null) {
              walletAssetsValueUsdt += asset.total * currentPrice;
            }
          }
        } catch (e) {}

        if (totalEquityUsdt > 0) initialCapital = totalEquityUsdt;
        assets = Object.values(assetsMap);

        return NextResponse.json({
          isAutopilot: config.isActive,
          isPaperTrading: config.isPaperTrading,
          marketType: config.marketType || 'MIXED',
          connectionStatus: 'CONNECTED',
          initialCapital,
          extractedCapital: totalPnl > 0 ? totalPnl : 0,
          riskCapital: config.allocatedPortfolioUsdt,
          targetProfit: config.targetProfitUsdt,
          portfolioHealth: 100 - (activePositions.length * 2),
          currentPnl: totalPnl + paperPnl,
          walletAssetsValueUsdt,
          aiDirectives: config.aiDirectives || "เน้นความปลอดภัยและกำไรที่สม่ำเสมอ",
          assets
        });
      } catch (err) {
        console.error(`[Dashboard] Bitget fetch failed:`, err.message);
      }
    }

    return NextResponse.json({
      isAutopilot: config.isActive,
      isPaperTrading: config.isPaperTrading,
      marketType: config.marketType || 'MIXED',
      connectionStatus,
      initialCapital,
      extractedCapital: totalPnl > 0 ? totalPnl : 0,
      riskCapital: config.allocatedPortfolioUsdt,
      targetProfit: config.targetProfitUsdt,
      portfolioHealth: 100 - (activePositions.length * 2),
      currentPnl: totalPnl + paperPnl,
      walletAssetsValueUsdt: 0,
      aiDirectives: config.aiDirectives || "เน้นความปลอดภัยและกำไรที่สม่ำเสมอ",
      assets: []
    });
  } catch (error) {
    console.error('Dashboard Stats Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
