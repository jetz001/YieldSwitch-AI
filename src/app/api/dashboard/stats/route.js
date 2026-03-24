import { PrismaClient } from '@prisma/client';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from 'next/server';

const prisma = new PrismaClient();

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = await prisma.botConfig.findFirst({
      where: { userId: session.user.id }
    });

    if (!config) {
      return NextResponse.json({ error: 'No BotConfig found' }, { status: 404 });
    }

    // Aggregate stats from database
    const activePositions = await prisma.activeTranche.findMany({
      where: { botConfigId: config.id, status: 'OPEN' }
    });

    const closedPositions = await prisma.activeTranche.findMany({
      where: { botConfigId: config.id, status: 'CLOSED' }
    });

    const totalPnl = closedPositions.reduce((acc, p) => acc + (p.pnlUsdt || 0), 0);
    const paperPnl = activePositions.filter(p => p.isPaperTrade).reduce((acc, p) => acc + (p.pnlUsdt || 0), 0);

    return NextResponse.json({
      isAutopilot: config.isActive,
      isPaperTrading: config.isPaperTrading,
      initialCapital: config.isPaperTrading ? config.paperBalanceUsdt : config.allocatedPortfolioUsdt,
      extractedCapital: totalPnl > 0 ? totalPnl : 0, // Simplified for now
      riskCapital: config.allocatedPortfolioUsdt,
      targetProfit: config.targetProfitUsdt,
      portfolioHealth: 100 - (activePositions.length * 2), // Simplified health logic
      currentPnl: totalPnl + paperPnl
    });
  } catch (error) {
    console.error('Dashboard Stats Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
