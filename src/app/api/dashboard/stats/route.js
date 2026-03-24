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

    let connectionStatus = (isLive || isDemo) ? 'CONNECTED' : 'NOT_CONFIGURED';

    // IF (LIVE) OR (NATIVE DEMO): Fetch REAL balance from Bitget to sync dashboard
    if (isLive || isDemo) {
      try {
        console.log(`[Dashboard] Fetching ${isDemo ? 'DEMO' : 'LIVE'} balance for user ${session.user.id}...`);
        
        const apiKey = isDemo ? config.User.bitgetDemoApiKey : config.User.bitgetApiKey;
        const apiSecret = isDemo ? config.User.bitgetDemoApiSecret : config.User.bitgetApiSecret;
        const apiPass = isDemo ? config.User.bitgetDemoPassphrase : config.User.bitgetPassphrase;

        const bitgetClient = getBitgetClient(apiKey, apiSecret, apiPass, isDemo);

        // Fetch balances from multiple account types to get the full picture
        let totalEquityUsdt = 0;

        // Try fetching from different account types
        const accountTypes = ['spot', 'swap'];
        for (const accType of accountTypes) {
          try {
            const balance = await bitgetClient.fetchBalance({ type: accType });
            
            // Log all available currencies for debugging
            const allCurrencies = Object.keys(balance.total || {}).filter(k => parseFloat(balance.total[k]) > 0);
            if (allCurrencies.length > 0) {
              console.log(`[Dashboard] ${accType} currencies:`, allCurrencies.map(c => `${c}=${balance.total[c]}`).join(', '));
            }

            // Sum all stablecoin-equivalent balances
            const stablecoins = ['USDT', 'USD', 'SUSDT', 'USDC', 'BUSD'];
            for (const coin of stablecoins) {
              const val = parseFloat(balance.total?.[coin] || 0);
              if (val > 0) totalEquityUsdt += val;
            }
          } catch (accErr) {
            // Some account types may not be available, that's OK
            console.log(`[Dashboard] ${accType} balance not available: ${accErr.message?.substring(0, 80)}`);
          }
        }

        console.log(`[Dashboard] ${isDemo ? 'Demo' : 'Real'} Total Equity (USDT): ${totalEquityUsdt}`);

        if (totalEquityUsdt > 0) {
          initialCapital = totalEquityUsdt;
          connectionStatus = 'CONNECTED';
        } else {
          // Balance is 0 but connection worked
          connectionStatus = 'CONNECTED';
        }
      } catch (err) {
        console.error(`[Dashboard] Bitget balance fetch failed:`, err.message);
        connectionStatus = 'DISCONNECTED';
      }
    }

    return NextResponse.json({
      isAutopilot: config.isActive,
      isPaperTrading: config.isPaperTrading,
      connectionStatus,
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
