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
        if (!user.bitgetDemoApiKey) throw new Error('ไม่พบรหัส Demo API ในฐานข้อมูล กรุณากรอกข้อมูลใหม่');
        key = key.includes('•') ? decrypt(user.bitgetDemoApiKey) : key;
        secret = secret.includes('•') ? decrypt(user.bitgetDemoApiSecret) : secret;
        pass = pass.includes('•') ? decrypt(user.bitgetDemoPassphrase) : pass;
      } else {
        if (!user.bitgetApiKey) throw new Error('ไม่พบรหัส API จริงในฐานข้อมูล กรุณากรอกข้อมูลใหม่');
        key = key.includes('•') ? decrypt(user.bitgetApiKey) : key;
        secret = secret.includes('•') ? decrypt(user.bitgetApiSecret) : secret;
        pass = pass.includes('•') ? decrypt(user.bitgetPassphrase) : pass;
      }

      if (!key || !secret || !pass) {
        throw new Error('ไม่สามารถถอดรหัส API Key ได้ กรุณากรอกข้อมูลใหม่อีกครั้ง');
      }
    }

    const { getBitgetClient } = require('@/services/bitget');
    
    // Test connection
    const exchange = getBitgetClient(key, secret, pass, isDemo);

    // Test: Fetch balance from multiple account types
    let totalUsdt = 0;
    const accountTypes = ['spot', 'swap'];
    for (const accType of accountTypes) {
      try {
        const balance = await exchange.fetchBalance({ type: accType });
        const usdt = parseFloat(balance.total?.USDT || 0);
        const usd = parseFloat(balance.total?.USD || 0);
        if (usdt > 0 || usd > 0) {
          totalUsdt += usdt + usd;
        }
      } catch (e) {
        // Some account types may not be available
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `${isDemo ? 'DEMO' : 'LIVE'} Bitget V2 Connection Success!`,
      balance: totalUsdt.toFixed(2)
    });

  } catch (error) {
    console.error('Bitget Test Error Details:', {
      message: error.message,
      code: error.code,
      name: error.name,
      body: error.body || error.data
    });
    return NextResponse.json({ 
      success: false, 
      message: `Bitget Error: ${error.message}${error.body ? ' - ' + error.body : ''}` 
    }, { status: 400 });
  }
}
