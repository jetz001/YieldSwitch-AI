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

    let { bitgetApiKey, bitgetApiSecret, bitgetPassphrase, bitgetDemoApiKey, bitgetDemoApiSecret, bitgetDemoPassphrase, isDemo } = await req.json();
    
    // Choose which set of keys to test
    let key = isDemo ? bitgetDemoApiKey : bitgetApiKey;
    let secret = isDemo ? bitgetDemoApiSecret : bitgetApiSecret;
    let pass = isDemo ? bitgetDemoPassphrase : bitgetPassphrase;

    if (!key || !secret || !pass) {
      return NextResponse.json({ 
        success: false, 
        message: 'กรุณากรอกข้อมูล Bitget API ให้ครบถ้วน (Key, Secret, Passphrase) ก่อนทดสอบ' 
      }, { status: 400 });
    }

    // Handle masked keys from DB
    if (key.includes('•') || secret.includes('•') || pass.includes('•')) {
      const user = await prisma.user.findUnique({ where: { id: session.user.id } });
      const { decrypt } = require('@/utils/crypto');
      if (isDemo) {
        key = key.includes('•') ? decrypt(user.bitgetDemoApiKey) || key : key;
        secret = secret.includes('•') ? decrypt(user.bitgetDemoApiSecret) || secret : secret;
        pass = pass.includes('•') ? decrypt(user.bitgetDemoPassphrase) || pass : pass;
      } else {
        key = key.includes('•') ? decrypt(user.bitgetApiKey) || key : key;
        secret = secret.includes('•') ? decrypt(user.bitgetApiSecret) || secret : secret;
        pass = pass.includes('•') ? decrypt(user.bitgetPassphrase) || pass : pass;
      }
    }

    const options = { defaultType: 'swap' };
    if (isDemo) {
      options['headers'] = { 'paptrading': '1' };
    }

    const exchange = new ccxt.bitget({
      apiKey: key,
      secret: secret,
      password: pass,
      options: options
    });

    // Test: Fetch balance
    const balance = await exchange.fetchBalance({ type: 'swap' });
    
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
