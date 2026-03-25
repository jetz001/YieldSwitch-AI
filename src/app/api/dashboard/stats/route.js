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
          totalEquityUsdt += assetsMap[coin]?.total || 0;
        }

        try {
          const positions = await bitgetClient.fetchPositions();
          for (const pos of positions) {
            if (parseFloat(pos.contracts) > 0) {
              totalEquityUsdt += parseFloat(pos.unrealizedPnl || 0);
            }
          }
        } catch (e) {}

        if (totalEquityUsdt > 0) initialCapital = totalEquityUsdt;
        assets = Object.values(assetsMap);

        return NextResponse.json({
          isAutopilot: config.isActive,
          isPaperTrading: config.isPaperTrading,
          connectionStatus: 'CONNECTED',
          initialCapital,
          extractedCapital: totalPnl > 0 ? totalPnl : 0,
          riskCapital: config.allocatedPortfolioUsdt,
          targetProfit: config.targetProfitUsdt,
          portfolioHealth: 100 - (activePositions.length * 2),
          currentPnl: totalPnl + paperPnl,
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
      connectionStatus,
      initialCapital,
      extractedCapital: totalPnl > 0 ? totalPnl : 0,
      riskCapital: config.allocatedPortfolioUsdt,
      targetProfit: config.targetProfitUsdt,
      portfolioHealth: 100 - (activePositions.length * 2),
      currentPnl: totalPnl + paperPnl,
      aiDirectives: config.aiDirectives || "เน้นความปลอดภัยและกำไรที่สม่ำเสมอ",
      assets: []
    });
  } catch (error) {
    console.error('Dashboard Stats Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
