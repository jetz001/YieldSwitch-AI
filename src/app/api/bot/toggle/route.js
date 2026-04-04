import { prisma } from '@/lib/db';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from 'next/server';
import { startEngine, stopEngine } from '@/engine/engineManager';
import { getBitgetClient } from '@/services/bitget';
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
      const bitgetApiKey = isPaperMode ? user.bitgetDemoApiKey : user.bitgetApiKey;
      const bitgetApiSecret = isPaperMode ? user.bitgetDemoApiSecret : user.bitgetApiSecret;
      const bitgetApiPass = isPaperMode ? user.bitgetDemoPassphrase : user.bitgetPassphrase;

      if (!bitgetApiKey || !bitgetApiSecret || !bitgetApiPass || !user.aiApiKey) {
        return NextResponse.json({ 
          error: 'API_KEYS_MISSING',
          message: 'กรุณากรอก API Key ทั้ง Bitget และ AI ในหน้าตั้งค่าก่อนเริ่มใช้งาน'
        }, { status: 400 });
      }

      // Live Connectivity Check - Bitget
      try {
        const client = getBitgetClient(bitgetApiKey, bitgetApiSecret, bitgetApiPass, isPaperMode);
        await client.fetchBalance({ type: isPaperMode ? 'swap' : 'spot' });
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
          const model = ai.client.getGenerativeModel({ model: ai.model });
          // Minimal check for Gemini
          if (!model) throw new Error("Could not initialize Gemini model.");
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
