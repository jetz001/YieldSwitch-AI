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

    if (!config) return NextResponse.json([]);

    const positions = await prisma.activeTranche.findMany({
      where: { botConfigId: config.id, status: 'OPEN' },
      orderBy: { openedAt: 'desc' }
    });

    return NextResponse.json(positions);
  } catch (error) {
    console.error('Dashboard Positions Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
