import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from 'next/server';
import ccxt from 'ccxt';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let { bitgetApiKey, bitgetApiSecret, bitgetPassphrase } = await req.json();
    
    if (!bitgetApiKey || !bitgetApiSecret || !bitgetPassphrase) {
      return NextResponse.json({ 
        success: false, 
        message: 'กรุณากรอกข้อมูล Bitget API ให้ครบถ้วน (Key, Secret, Passphrase) ก่อนทดสอบ' 
      }, { status: 400 });
    }

    // Handle masked keys from DB
    if (bitgetApiKey.includes('•') || bitgetApiSecret.includes('•') || bitgetPassphrase.includes('•')) {
      const user = await prisma.user.findUnique({ where: { id: session.user.id } });
      const { decrypt } = require('@/utils/crypto');
      bitgetApiKey = bitgetApiKey.includes('•') ? decrypt(user.bitgetApiKey) || bitgetApiKey : bitgetApiKey;
      bitgetApiSecret = bitgetApiSecret.includes('•') ? decrypt(user.bitgetApiSecret) || bitgetApiSecret : bitgetApiSecret;
      bitgetPassphrase = bitgetPassphrase.includes('•') ? decrypt(user.bitgetPassphrase) || bitgetPassphrase : bitgetPassphrase;
    }

    const exchange = new ccxt.bitget({
      apiKey: bitgetApiKey,
      secret: bitgetApiSecret,
      password: bitgetPassphrase,
      options: { defaultType: 'swap' }
    });

    // Test: Fetch balance
    const balance = await exchange.fetchBalance();
    
    return NextResponse.json({ 
      success: true, 
      message: 'Bitget V2 Connection Success!',
      balance: balance.total['USDT'] || 0
    });

  } catch (error) {
    console.error('Bitget Test Error:', error);
    return NextResponse.json({ 
      success: false, 
      message: `Bitget Error: ${error.message}` 
    }, { status: 400 });
  }
}
