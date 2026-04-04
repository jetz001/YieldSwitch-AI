import { prisma } from '@/lib/db';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from 'next/server';
import { getBitgetClient } from '@/services/bitget';
import { initEngine } from '@/engine/engineManager';

let engineInitialized = false;

export async function GET(_req) {
  console.log('[Stats API] GET request received');
  if (!engineInitialized) {
    console.log('[DEBUG] initEngine() triggered from /api/dashboard/stats');
    initEngine().catch(err => {
      console.error('[CRITICAL] initEngine failed on startup:', err);
    });
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

    const extractMarketTypeFromDirectives = (directives) => {
      const text = String(directives || '');
      const marker = text.match(/\[\[\s*MARKET_TYPE\s*=\s*(SPOT|FUTURES|MIXED)\s*\]\]/i);
      if (marker?.[1]) return marker[1].toUpperCase();
      const alt = text.match(/MARKET_TYPE\s*[:=]\s*(SPOT|FUTURES|MIXED)/i);
      if (alt?.[1]) return alt[1].toUpperCase();
      return null;
    };
    const marketType = extractMarketTypeFromDirectives(config.aiDirectives) || config.marketType || 'MIXED';
    
    const isDemo = config.isPaperTrading && !!config.User.bitgetDemoApiKey;
    const isLive = !config.isPaperTrading && !!config.User.bitgetApiKey;
    let connectionStatus = (isLive || isDemo) ? 'CONNECTED' : 'NOT_CONFIGURED';
    let assets = [];

    if (isLive || isDemo) {
      try {
        const apiKey = isDemo ? config.User.bitgetDemoApiKey : config.User.bitgetApiKey;
        const apiSecret = isDemo ? config.User.bitgetDemoApiSecret : config.User.bitgetApiSecret;
        const apiPass = isDemo ? config.User.bitgetDemoPassphrase : config.User.bitgetPassphrase;
        const spotClient = getBitgetClient(apiKey, apiSecret, apiPass, isDemo, 'SPOT');
        const futuresClient = getBitgetClient(apiKey, apiSecret, apiPass, isDemo, 'FUTURES');

        let walletAssetsValueUsdt = 0;
        let assetsMap = {};

        let spotAssets = [];
        let futureAssets = [];
        let spotValueUsdt = 0;
        let futureValueUsdt = 0;

        const fetchBal = async (client, type) => {
          try {
            const bal = await client.fetchBalance({ type });
            console.log(`[Stats API] fetched ${type} balance. Coins:`, Object.keys(bal.total || {}));
            for (const coin in bal.total || {}) {
              const total = parseFloat(bal.total[coin] || 0);
              if (total > 0) {
                if (!assetsMap[coin]) assetsMap[coin] = { coin, total: 0, free: 0, used: 0 };
                assetsMap[coin].total += total;
                assetsMap[coin].free += parseFloat(bal.free?.[coin] || 0);
                assetsMap[coin].used += parseFloat(bal.used?.[coin] || 0);

                const item = { coin, total, free: parseFloat(bal.free?.[coin] || 0), used: parseFloat(bal.used?.[coin] || 0) };
                if (type === 'spot') spotAssets.push(item);
                if (type === 'swap') futureAssets.push(item);
              }
            }
          } catch (e) {
            console.error(`[Stats API] fetchBalance error for ${type}:`, e.message);
          }
        };

        await Promise.all([
          fetchBal(futuresClient, 'swap'),
          fetchBal(spotClient, 'spot')
        ]);

        const stablecoins = ['USDT', 'USD', 'SUSDT', 'USDC', 'BUSD'];
        const stableSet = new Set(stablecoins);
        
        // Initial valuation with stables
        spotAssets.forEach(a => { if(stableSet.has(a.coin)) spotValueUsdt += a.total; });
        futureAssets.forEach(a => { if(stableSet.has(a.coin)) futureValueUsdt += a.total; });
        
        walletAssetsValueUsdt = spotValueUsdt + futureValueUsdt;
        console.log(`[Stats API] Initial Value (Stables): Spot=${spotValueUsdt}, Future=${futureValueUsdt}`);
        
        try {
          if (Object.keys(assetsMap).length > 0) {
            await futuresClient.loadMarkets();
            await spotClient.loadMarkets();
          }
        } catch (e) {
          console.error('[Stats API] loadMarkets error:', e.message);
        }

        // Positions valuation (Futures only) + count open positions
        let openPositionsCount = 0;
        let openOrdersCount = 0;
        let unrealizedPnlTotal = 0;

        const [positions, spotOpenOrders, futuresOpenOrders] = await Promise.all([
          futuresClient.fetchPositions().catch(() => []),
          spotClient.fetchOpenOrders().catch(() => []),
          futuresClient.fetchOpenOrders().catch(() => [])
        ]);

        for (const pos of positions) {
          if (parseFloat(pos.contracts) > 0) {
            openPositionsCount += 1;
            const upnl = parseFloat(pos.unrealizedPnl || 0);
            unrealizedPnlTotal += upnl;
          }
        }
        if (marketType === 'SPOT') openOrdersCount = (spotOpenOrders || []).length;
        else if (marketType === 'FUTURES') openOrdersCount = (futuresOpenOrders || []).length;
        else openOrdersCount = (spotOpenOrders || []).length + (futuresOpenOrders || []).length;

        const openCount =
          marketType === 'SPOT'
            ? openOrdersCount
            : marketType === 'FUTURES'
              ? openPositionsCount
              : openOrdersCount + openPositionsCount;

        const portfolioHealth = Math.max(0, Math.min(100, 100 - (openCount * 2)));

        // Price non-stable assets for both tabs
        const priceAsset = async (asset) => {
          if (stableSet.has(asset.coin)) return 0;
          let currentPrice = null;
          const candidates = [`${asset.coin}/USDT`, `${asset.coin}/USDT:USDT`, `${asset.coin}/USD` ];
          for (const sym of candidates) {
            try {
              if (futuresClient.markets && futuresClient.markets[sym] === undefined && spotClient.markets && spotClient.markets[sym] === undefined) continue;
              const ticker = await (sym.includes(':') ? futuresClient.fetchTicker(sym) : spotClient.fetchTicker(sym));
              const last = ticker?.last ?? ticker?.close;
              if (typeof last === 'number' && Number.isFinite(last) && last > 0) { currentPrice = last; break; }
            } catch (e) {}
          }
          return currentPrice ? asset.total * currentPrice : 0;
        };

        // Valuation update (Parallelize asset pricing)
        const [spotResults, futureResults] = await Promise.all([
          Promise.all(spotAssets.map(a => priceAsset(a))),
          Promise.all(futureAssets.map(a => priceAsset(a)))
        ]);
        
        spotValueUsdt += spotResults.reduce((sum, val) => sum + val, 0);
        futureValueUsdt += futureResults.reduce((sum, val) => sum + val, 0);
        
        walletAssetsValueUsdt = spotValueUsdt + futureValueUsdt;
        assets = Object.values(assetsMap);

        return NextResponse.json({
          isAutopilot: config.isActive,
          isPaperTrading: config.isPaperTrading,
          marketType,
          connectionStatus: 'CONNECTED',
          initialCapital: config.allocatedPortfolioUsdt,
          extractedCapital: 0,
          riskCapital: config.allocatedPortfolioUsdt,
          targetProfit: config.targetProfitUsdt,
          portfolioHealth,
          currentPnl: unrealizedPnlTotal,
          walletAssetsValueUsdt,
          spotValueUsdt,
          futureValueUsdt,
          aiDirectives: config.aiDirectives || "เน้นความปลอดภัยและกำไรที่สม่ำเสมอ",
          assets,
          spotAssets,
          futureAssets
        });
      } catch (err) {
        console.error(`[Dashboard Stats] Bitget fetch failed:`, err.message);
      }
    }

    return NextResponse.json({
      isAutopilot: config.isActive,
      isPaperTrading: config.isPaperTrading,
      marketType,
      connectionStatus,
      initialCapital: config.allocatedPortfolioUsdt,
      extractedCapital: 0,
      riskCapital: config.allocatedPortfolioUsdt,
      targetProfit: config.targetProfitUsdt,
      portfolioHealth: 0,
      currentPnl: 0,
      walletAssetsValueUsdt: 0,
      spotValueUsdt: 0,
      futureValueUsdt: 0,
      aiDirectives: config.aiDirectives || "เน้นความปลอดภัยและกำไรที่สม่ำเสมอ",
      assets: [],
      spotAssets: [],
      futureAssets: []
    });
  } catch (error) {
    console.error('Dashboard Stats Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
