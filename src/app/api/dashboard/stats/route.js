import { PrismaClient } from '@prisma/client';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from 'next/server';
import { getBitgetClient } from '@/services/bitget';
import { initEngine } from '@/engine/engineManager';

const prisma = new PrismaClient();
let engineInitialized = false;

export async function GET(req) {
  // Ensure background engine is running for all active bots
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

    if (!config) {
      return NextResponse.json({ error: 'No BotConfig found' }, { status: 404 });
    }

    console.log(`[Dashboard Debug] isPaperTrading: ${config.isPaperTrading}, User has API Key: ${!!config.User?.bitgetApiKey}`);

    // Aggregate stats from database
    const activePositions = await prisma.activeTranche.findMany({
      where: { botConfigId: config.id, status: 'OPEN' }
    });

    const closedPositions = await prisma.activeTranche.findMany({
      where: { botConfigId: config.id, status: 'CLOSED' }
    });

    const totalPnl = closedPositions.reduce((acc, p) => acc + (p.pnlUsdt || 0), 0);
    const paperPnl = activePositions.filter(p => p.isPaperTrade).reduce((acc, p) => acc + (p.pnlUsdt || 0), 0);

    let initialCapital = config.isPaperTrading ? config.paperBalanceUsdt : config.allocatedPortfolioUsdt;

    // Determine environmental flags
    const isDemo = config.isPaperTrading && !!config.User.bitgetDemoApiKey;
    const isLive = !config.isPaperTrading && !!config.User.bitgetApiKey;

    // IF (LIVE) OR (NATIVE DEMO): Fetch REAL balance from Bitget to sync dashboard
    if (isLive || isDemo) {
      try {
        console.log(`[Dashboard] Fetching ${isDemo ? 'DEMO' : 'LIVE'} balance for user ${session.user.id}...`);
        
        const apiKey = isDemo ? config.User.bitgetDemoApiKey : config.User.bitgetApiKey;
        const apiSecret = isDemo ? config.User.bitgetDemoApiSecret : config.User.bitgetApiSecret;
        const apiPass = isDemo ? config.User.bitgetDemoPassphrase : config.User.bitgetPassphrase;

        const bitgetClient = getBitgetClient(apiKey, apiSecret, apiPass, isDemo);

        // Bitget V2 specifically needs 'swap' or 'futures' type for many accounts
        const balance = await bitgetClient.fetchBalance({ type: 'swap' });
        
        // Use total USDT balance from exchange
        const realUsdt = balance.total?.USDT || balance.USDT?.total || 0;
        console.log(`[Dashboard] ${isDemo ? 'Demo' : 'Real'} USDT detected: ${realUsdt}`);

        if (realUsdt > 0) {
          initialCapital = realUsdt;
        }
      } catch (err) {
        console.error(`[Dashboard] Bitget balance fetch failed:`, err.message);
      }
    }

    return NextResponse.json({
      isAutopilot: config.isActive,
      isPaperTrading: config.isPaperTrading,
      initialCapital,
      extractedCapital: totalPnl > 0 ? totalPnl : 0, // Simplified for now
      riskCapital: config.allocatedPortfolioUsdt,
      targetProfit: config.targetProfitUsdt,
      portfolioHealth: 100 - (activePositions.length * 2), // Simplified health logic
      currentPnl: totalPnl + paperPnl,
      aiDirectives: config.aiDirectives || "เน้นความปลอดภัยและกำไรที่สม่ำเสมอ"
    });
  } catch (error) {
    console.error('Dashboard Stats Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
