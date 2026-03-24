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
      where: { userId: session.user.id },
      select: { id: true }
    });

    if (!config) {
      return NextResponse.json({ error: 'No BotConfig found' }, { status: 404 });
    }

    const logs = await prisma.aILogStream.findMany({
      where: { botConfigId: config.id },
      orderBy: { timestamp: 'desc' },
      take: 50
    });

    return NextResponse.json(logs);
  } catch (error) {
    console.error('Logs API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
