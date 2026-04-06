import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from 'next/server';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let { 
      exchangeId = 'bitget',
      bitgetApiKey, bitgetApiSecret, bitgetPassphrase, 
      bitgetDemoApiKey, bitgetDemoApiSecret, bitgetDemoPassphrase,
      binanceApiKey, binanceApiSecret,
      binanceDemoApiKey, binanceDemoApiSecret,
      isDemo 
    } = await req.json();
    
    // Choose which set of keys to test
    let key, secret, pass;

    if (exchangeId === 'binance') {
      key = isDemo ? binanceDemoApiKey : binanceApiKey;
      secret = isDemo ? binanceDemoApiSecret : binanceApiSecret;
      pass = undefined;
    } else {
      key = isDemo ? bitgetDemoApiKey : bitgetApiKey;
      secret = isDemo ? bitgetDemoApiSecret : bitgetApiSecret;
      pass = isDemo ? bitgetDemoPassphrase : bitgetPassphrase;
    }

    if (!key || !secret || (exchangeId === 'bitget' && !pass)) {
      return NextResponse.json({ 
        success: false, 
        message: `กรุณากรอกข้อมูล ${exchangeId.toUpperCase()} API ให้ครบถ้วนก่อนทดสอบ` 
      }, { status: 400 });
    }

    // Handle masked keys from DB
    if (key.includes('•') || secret.includes('•') || (pass && pass.includes('•'))) {
      const user = await prisma.user.findUnique({ where: { id: session.user.id } });
      const { decrypt } = require('@/utils/crypto');
      
      if (exchangeId === 'binance') {
        if (isDemo) {
          if (!user.binanceDemoApiKey) throw new Error('ไม่พบรหัส Demo API ในฐานข้อมูล');
          key = key.includes('•') ? decrypt(user.binanceDemoApiKey) : key;
          secret = secret.includes('•') ? decrypt(user.binanceDemoApiSecret) : secret;
        } else {
          if (!user.binanceApiKey) throw new Error('ไม่พบรหัส API จริงในฐานข้อมูล');
          key = key.includes('•') ? decrypt(user.binanceApiKey) : key;
          secret = secret.includes('•') ? decrypt(user.binanceApiSecret) : secret;
        }
      } else {
        if (isDemo) {
          if (!user.bitgetDemoApiKey) throw new Error('ไม่พบรหัส Demo API ในฐานข้อมูล');
          key = key.includes('•') ? decrypt(user.bitgetDemoApiKey) : key;
          secret = secret.includes('•') ? decrypt(user.bitgetDemoApiSecret) : secret;
          pass = pass.includes('•') ? decrypt(user.bitgetDemoPassphrase) : pass;
        } else {
          if (!user.bitgetApiKey) throw new Error('ไม่พบรหัส API จริงในฐานข้อมูล');
          key = key.includes('•') ? decrypt(user.bitgetApiKey) : key;
          secret = secret.includes('•') ? decrypt(user.bitgetApiSecret) : secret;
          pass = pass.includes('•') ? decrypt(user.bitgetPassphrase) : pass;
        }
      }

      if (!key || !secret || (exchangeId === 'bitget' && !pass)) {
        throw new Error('ไม่สามารถถอดรหัส API Key ได้ กรุณากรอกข้อมูลใหม่อีกครั้ง');
      }
    }

    const { getExchangeClient } = require('@/services/exchangeFactory');
    
    // Test connection
    const exchange = getExchangeClient(exchangeId, key, secret, pass, isDemo);

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
      message: `${isDemo ? 'DEMO' : 'LIVE'} ${exchangeId.toUpperCase()} Connection Success!`,
      balance: totalUsdt.toFixed(2)
    });

  } catch (error) {
    console.error('Exchange Test Error Details:', error);
    return NextResponse.json({ 
      success: false, 
      message: `Error: ${error.message}${error.body ? ' - ' + error.body : ''}` 
    }, { status: 400 });
  }
}
