import { PrismaClient } from '@prisma/client';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from 'next/server';
import { startEngine, stopEngine } from '@/engine/engineManager';

const prisma = new PrismaClient();

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { isActive, isPaperTrading } = await req.json();

    // Validation for starting Autopilot
    if (isActive === true) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id }
      });

      if (!user.bitgetApiKey || !user.bitgetApiSecret || !user.bitgetPassphrase || !user.aiApiKey) {
        return NextResponse.json({ 
          error: 'API_KEYS_MISSING',
          message: 'กรุณากรอก API Key ทั้ง Bitget และ AI ในหน้าตั้งค่าก่อนเริ่มใช้งาน'
        }, { status: 400 });
      }
    }

    const config = await prisma.botConfig.updateMany({
      where: { userId: session.user.id },
      data: {
        isActive: isActive !== undefined ? isActive : undefined,
        isPaperTrading: isPaperTrading !== undefined ? isPaperTrading : undefined
      }
    });

    const updatedConfig = await prisma.botConfig.findFirst({
      where: { userId: session.user.id }
    });

    if (updatedConfig) {
      if (isActive === true) {
        startEngine(updatedConfig.id);
      } else if (isActive === false) {
        stopEngine(updatedConfig.id);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Bot Toggle Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
