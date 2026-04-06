import { prisma } from '@/lib/db';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from 'next/server';
import { startEngine, stopEngine } from '@/engine/engineManager';
import { getExchangeClient } from '@/services/exchangeFactory';
import { getLLMClient } from '@/services/llmProvider';
import { sanitizeInput, validateNumeric } from '@/utils/security';

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { isActive, isPaperTrading, aiDirectives, targetProfitUsdt, allocatedPortfolioUsdt } = await req.json();

    // Validation for starting Autopilot
    if (isActive === true) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id }
      });

      const isPaperMode = isPaperTrading !== undefined ? isPaperTrading : false;
      const exchangeId = user.activeExchange || 'bitget';
      let exApiKey, exApiSecret, exApiPass;

      if (exchangeId === 'binance') {
        exApiKey = isPaperMode ? user.binanceDemoApiKey : user.binanceApiKey;
        exApiSecret = isPaperMode ? user.binanceDemoApiSecret : user.binanceApiSecret;
        exApiPass = undefined;
      } else {
        exApiKey = isPaperMode ? user.bitgetDemoApiKey : user.bitgetApiKey;
        exApiSecret = isPaperMode ? user.bitgetDemoApiSecret : user.bitgetApiSecret;
        exApiPass = isPaperMode ? user.bitgetDemoPassphrase : user.bitgetPassphrase;
      }

      if (!exApiKey || !exApiSecret || (exchangeId === 'bitget' && !exApiPass) || !user.aiApiKey) {
        return NextResponse.json({ 
          error: 'API_KEYS_MISSING',
          message: `กรุณากรอก API Key ทั้ง ${exchangeId.toUpperCase()} และ AI ในหน้าตั้งค่าก่อนเริ่มใช้งาน`
        }, { status: 400 });
      }

      // Live Connectivity Check - Exchange
      try {
        const client = getExchangeClient(exchangeId, exApiKey, exApiSecret, exApiPass, isPaperMode, 'FUTURES');
        await client.fetchBalance({ type: isPaperMode ? 'swap' : 'spot' }).catch(() => client.fetchBalance());
      } catch (err) {
        console.error('Bitget Connectivity Check Failed:', err.message);
        return NextResponse.json({ 
          error: 'BITGET_CONNECTION_FAILED',
          message: `ไม่สามารถเชื่อมต่อกับ Bitget ได้: ${err.message}. กรุณาตรวจสอบ API Keys และสถานะบัญชี.`
        }, { status: 400 });
      }

      // Live Connectivity Check - AI Provider
      try {
        const ai = getLLMClient(user.aiApiKey, user.aiProvider, user.aiModel, true);
        if (ai.provider === 'GEMINI') {
          // Check for Gemini via the new @google/genai SDK
          const actualModel = ai.model.startsWith('models/') ? ai.model.split('/')[1] : ai.model;
          await ai.client.models.get({ model: actualModel });
        } else {
          // Minimal check for OpenAI/OpenRouter (fetch models)
          await ai.client.models.list();
        }
      } catch (err) {
        console.error('AI Connectivity Check Failed:', err.message);
        return NextResponse.json({ 
          error: 'AI_CONNECTION_FAILED',
          message: `ไม่สามารถเชื่อมต่อกับ AI Provider (${user.aiProvider}) ได้: ${err.message}. กรุณาตรวจสอบ AI API Key ในหน้าตั้งค่า.`
        }, { status: 400 });
      }
    }

    await prisma.botConfig.updateMany({
      where: { userId: session.user.id },
      data: {
        isActive: isActive !== undefined ? isActive : undefined,
        isPaperTrading: isPaperTrading !== undefined ? isPaperTrading : undefined,
        aiDirectives: aiDirectives !== undefined ? sanitizeInput(aiDirectives, 1000) : undefined,
        targetProfitUsdt: targetProfitUsdt !== undefined ? validateNumeric(targetProfitUsdt) : undefined,
        allocatedPortfolioUsdt: allocatedPortfolioUsdt !== undefined ? validateNumeric(allocatedPortfolioUsdt) : undefined
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
