import { PrismaClient } from '@prisma/client';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from 'next/server';

const prisma = new PrismaClient();

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { userId, status } = await req.json();

    if (!['ACTIVE', 'SUSPENDED', 'BANNED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Zero-Knowledge Key Erasure for BANNED users
    const updateData = { status };
    if (status === 'BANNED') {
      updateData.bitgetApiKey = null;
      updateData.bitgetApiSecret = null;
      updateData.bitgetPassphrase = null;
      updateData.aiApiKey = null;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    // Halt all bots if suspended or banned
    if (status !== 'ACTIVE') {
      await prisma.botConfig.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false }
      });
    }

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error('Moderation API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
