import { PrismaClient } from '@prisma/client';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from 'next/server';

const prisma = new PrismaClient();

export async function GET(_req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        bitgetApiKey: true,
        bitgetApiSecret: true,
        bitgetPassphrase: true,
        bitgetDemoApiKey: true,
        bitgetDemoApiSecret: true,
        bitgetDemoPassphrase: true,
        aiApiKey: true,
        aiProvider: true,
        aiModel: true
      }
    });

    // Mask the keys before sending to frontend
    const mask = (str) => str ? `${str.substring(0, 4)}${'•'.repeat(12)}` : '';

    return NextResponse.json({
      bitgetApiKey: mask(user.bitgetApiKey),
      bitgetApiSecret: mask(user.bitgetApiSecret),
      bitgetPassphrase: mask(user.bitgetPassphrase),
      bitgetDemoApiKey: mask(user.bitgetDemoApiKey),
      bitgetDemoApiSecret: mask(user.bitgetDemoApiSecret),
      bitgetDemoPassphrase: mask(user.bitgetDemoPassphrase),
      aiApiKey: mask(user.aiApiKey),
      aiProvider: user.aiProvider || 'OPENAI',
      aiModel: user.aiModel || 'gpt-4o'
    });
  } catch (error) {
    console.error('Fetch User Config Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    console.log('[API/Users/Me] Received Update:', { ...body, aiApiKey: body.aiApiKey ? '***' : null });
    
    const { 
      bitgetApiKey, bitgetApiSecret, bitgetPassphrase, 
      bitgetDemoApiKey, bitgetDemoApiSecret, bitgetDemoPassphrase, 
      aiApiKey, aiProvider, aiModel 
    } = body;
    const userId = session.user.id;
    const { encrypt } = require('@/utils/crypto');

    // Helper to only update if not masked
    const shouldUpdate = (val) => val && !val.includes('•');

    const updateData = {
      aiProvider: aiProvider || undefined,
      aiModel: aiModel || undefined
    };

    if (shouldUpdate(bitgetApiKey)) updateData.bitgetApiKey = encrypt(bitgetApiKey);
    if (shouldUpdate(bitgetApiSecret)) updateData.bitgetApiSecret = encrypt(bitgetApiSecret);
    if (shouldUpdate(bitgetPassphrase)) updateData.bitgetPassphrase = encrypt(bitgetPassphrase);
    if (shouldUpdate(bitgetDemoApiKey)) updateData.bitgetDemoApiKey = encrypt(bitgetDemoApiKey);
    if (shouldUpdate(bitgetDemoApiSecret)) updateData.bitgetDemoApiSecret = encrypt(bitgetDemoApiSecret);
    if (shouldUpdate(bitgetDemoPassphrase)) updateData.bitgetDemoPassphrase = encrypt(bitgetDemoPassphrase);
    if (shouldUpdate(aiApiKey)) updateData.aiApiKey = encrypt(aiApiKey);

    console.log('[API/Users/Me] Final Update Data Keys:', Object.keys(updateData));

    await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    return NextResponse.json({ success: true, message: 'บันทึกข้อมูล API สำเร็จแล้ว' });
  } catch (error) {
    console.error('Update API Keys Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(_req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;

    // Right to be Forgotten: Cascade Delete via Prisma Transaction
    await prisma.$transaction(async (tx) => {
      // Because we set onDelete: Cascade in schema.prisma,
      // deleting the user will automatically delete BotConfigs, ActiveTranches, and AILogStreams.
      await tx.user.delete({
        where: { id: userId }
      });
    });

    return NextResponse.json({ success: true, message: 'บัญชีของคุณและข้อมูลทั้งหมดถูกลบถาวรแล้วตามสิทธิ์ PDPA' });
  } catch (error) {
    console.error('PDPA Delete API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
