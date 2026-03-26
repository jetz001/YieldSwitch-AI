import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { getLLMClient } from '../services/llmProvider';
import { getBitgetClient } from '../services/bitget';
import { runAutoScreener, getFearAndGreedIndex, getBTCTrend, getSectorForSymbol } from './autoScreener';

const prisma = new PrismaClient();

function extractMarketTypeFromDirectives(directives) {
  const text = String(directives || '');
  const marker = text.match(/\[\[\s*MARKET_TYPE\s*=\s*(SPOT|FUTURES|MIXED)\s*\]\]/i);
  if (marker?.[1]) return marker[1].toUpperCase();
  const alt = text.match(/MARKET_TYPE\s*[:=]\s*(SPOT|FUTURES|MIXED)/i);
  if (alt?.[1]) return alt[1].toUpperCase();
  return null;
}

export async function runCognitiveLoop(botConfigId) {
  try {
    const config = await prisma.botConfig.findUnique({ where: { id: botConfigId }, include: { User: true } });
    if (!config || !config.isActive) return null;

    if (config.User.status === 'SUSPENDED' || config.User.status === 'BANNED') {
      console.warn(`Cognitive loop aborted. User ${config.User.id} is ${config.User.status}`);
      return null;
    }

    const marketType = extractMarketTypeFromDirectives(config.aiDirectives) || config.marketType || 'MIXED';

    await logPhase(botConfigId, 'PLAN', `[1. PLAN] 🧠 ตรวจสอบตลาด (${marketType}): เริ่มต้นค้นหาเหรียญและวิเคราะห์สถานะตลาดผ่าน Screener`);

    // Determine which exchange client to use for screening
    let bitgetClient;
    if (config.isPaperTrading && config.User.bitgetDemoApiKey) {
      bitgetClient = getBitgetClient(config.User.bitgetDemoApiKey, config.User.bitgetDemoApiSecret, config.User.bitgetDemoPassphrase, true, marketType);
    } else {
      bitgetClient = getBitgetClient(config.User.bitgetApiKey, config.User.bitgetApiSecret, config.User.bitgetPassphrase, false, marketType);
    }
    
    // Engine provides market data completely statelessly
    const candidates = await runAutoScreener(bitgetClient);
    const fearGreed = await getFearAndGreedIndex();
    const btcTrend = await getBTCTrend(bitgetClient);

    // §6: Fetch portfolio_exposure (current sector holdings)
    const openTranches = await prisma.activeTranche.findMany({
      where: { botConfigId, status: 'OPEN' }
    });

    const portfolioExposure = openTranches.reduce((acc, t) => {
      const sector = getSectorForSymbol(t.symbol);
      acc[sector] = (acc[sector] || 0) + 1;
      return acc;
    }, {});

    // Count available bullets (max - currently open)
    const maxBullets = config.maxSplits || 10;
    const usedBullets = openTranches.length;
    const bulletsAvailable = Math.max(0, maxBullets - usedBullets);

    const cleanedAiDirectives = String(config.aiDirectives || '')
      .replace(/\[\[\s*MARKET_TYPE\s*=\s*(SPOT|FUTURES|MIXED)\s*\]\]\s*/gi, '')
      .replace(/MARKET_TYPE\s*[:=]\s*(SPOT|FUTURES|MIXED)\s*/gi, '')
      .trim();
    
    // §6 Stateless Context Injection (LLM JSON Payload)
    // Transform candidates to use originalSymbol for AI readability
    const candidatesForAI = candidates.slice(0, 3).map(c => ({
      ...c,
      symbol: c.originalSymbol || c.symbol // Use originalSymbol if available, fallback to symbol
    }));
    
    const contextPayload = {
      system_directive: "Evaluate candidates. Use strategy (Directional, Deep Value, Vol Breakout, SMC, or Delta-Neutral). Sell: TP1 1.5R (25%), TP2 3.0R (25%), Runner 50% + Trailing SL. Set stopLossPercent & sector.",
      trading_env: { 
        mkt_type: marketType || "MIXED",
        bullets: bulletsAvailable, 
        budget_usdt: config.allocatedPortfolioUsdt 
      },
      mkt_regime: { 
        btc_trend: btcTrend,
        fng_idx: fearGreed 
      },
      portfolio_exp: portfolioExposure,
      candidates: candidatesForAI
    };

    const { client: llmClient, model: llmModel, provider: aiProvider } = getLLMClient(
      config.User.aiApiKey, 
      config.User.aiProvider || 'OPENAI', 
      config.User.aiModel || 'gpt-4o',
      true // Encrypted from DB
    );
    
    console.log(`[Engine] Cognitive Cycle using: ${aiProvider} / ${llmModel}`);
    
    // §1 System Rules — optimized for token usage
    const rules = `
      You are an Elite Quant. Respond in strictly valid JSON.
      MISSION: ${cleanedAiDirectives || "Profit with safety. (เน้นกำไรและความปลอดภัย)"}
      LANGUAGE: Use English for internal logic. Use Thai ONLY for 'reasoning' (concise).

      === MARKET DIRECTIVES (${marketType || 'MIXED'}) ===
      - SPOT: NO SHORT/SELL allowed. Use only 'DEEP_VALUE' or 'DIRECTIONAL' BUY.
      - FUTURES: You MUST look for both LONG and SHORT opportunities. Use Leverage (set stopLossPercent to auto-calculate).
      - MIXED: You decide between Spot and Futures based on market trend.
      
      - Current Market Mode is ${marketType}. If it is FUTURES, you are expected to utilize Shorting if the trend is bearish.
      
      - Total Limit: Max 10 tranches across all coins.
      - Sector Diversification: Distribute trades across sectors. Recommended max 2-3 per sector, but you may override based on extreme market opportunity.
      - Always provide stopLossPercent.

      === JSON OUTPUT ===
      {
        "strategy": "DELTA_NEUTRAL|SMC_SWEEP|VOLUME_BREAKOUT|DEEP_VALUE|DIRECTIONAL|SHADOW_TRADE",
        "confidence": 0-100,
        "reasoning": "ภาษาไทยสั้นๆ อธิบายเหตุผลให้ User",
        "trades": [{
          "symbol": "BTC/USDT",
          "side": "buy|sell",
          "amount": 500,
          "strategy": "DIRECTIONAL",
          "confidence": 85,
          "stopLossPercent": 3.5,
          "sector": "L1",
          "tp1_r": 1.5,
          "tp2_r": 3.0,
          "trailing_stop_atr_mult": 2
        }]
      }
    `;

    const normAiProvider = (aiProvider || 'OPENAI').trim().toUpperCase();
    let aiOutputRaw;

    if (normAiProvider === 'GEMINI') {
      try {
        const isGemma = llmModel.toLowerCase().includes('gemma');
        const genConfig = {
          maxOutputTokens: 2000
        };
        
        // Gemma-3 does not support native JSON mode via mimeType yet
        if (!isGemma) {
          genConfig.responseMimeType = "application/json";
        }

        const response = await llmClient.models.generateContent({
          model: llmModel,
          contents: [
            { role: 'user', parts: [{ text: `${rules}\n\nCONTEXT:\n${JSON.stringify(contextPayload)}` }] }
          ],
          config: genConfig
        });
        aiOutputRaw = response.text;
      } catch (err) {
        if (err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED')) {
          await logPhase(botConfigId, 'FEEDBACK_RETRY', '⚠️ เควต้า Gemini เต็ม (429): กำลังรอ 15 วินาทีเพื่อให้ระบบรีเซ็ต...');
          await new Promise(r => setTimeout(r, 15000));
        }
        throw err;
      }
    } else {
      const completionOptions = {
        model: llmModel,
        messages: [
          { role: 'system', content: rules },
          { role: 'user', content: JSON.stringify(contextPayload) }
        ],
        max_tokens: 1000
      };

      if (normAiProvider !== 'GEMINI') {
        completionOptions.response_format = { type: 'json_object' };
      }

      const planResponse = await llmClient.chat.completions.create(completionOptions);
      aiOutputRaw = planResponse.choices[0].message.content;
    }

    // Helper to clean JSON string from AI (remove markdown code blocks if any)
    const cleanJsonResponse = (str) => {
      if (!str) return "{}";
      return str.replace(/```json/g, '').replace(/```/g, '').trim();
    };

    let aiOutput;
    const cleanedRaw = cleanJsonResponse(aiOutputRaw);
    try {
      aiOutput = JSON.parse(cleanedRaw);
    } catch (parseErr) {
      console.error('Failed to parse AI JSON. Raw output:', cleanedRaw);
      // Fallback: If it's a truncation issue, we might try to close the JSON manually, 
      // but for now, we'll just throw a more descriptive error.
      throw new Error(`AI JSON Parsing Failed: ${parseErr.message} | Context: ${cleanedRaw.substring(0, 100)}...`);
    }

    await logPhase(botConfigId, 'IMPLEMENT', `[2. IMPLEMENT] ⚙️ ประยุกต์ใช้: นำกลยุทธ์ ${aiOutput.strategy} มาปรับค่าพารามิเตอร์สำหรับบอท (ความมั่นใจ ${aiOutput.confidence || 0}%)`);
    
    if (aiOutput.reasoning) {
      await logPhase(botConfigId, 'PLAN', `[AI REASONING] ${aiOutput.reasoning}`);
    }

    const trades = aiOutput.trades || [];
    const tradeSymbols = trades.map(t => t.symbol).join(', ');
    const logMsg = trades.length > 0
      ? `[3. TASK CHECK] 📋 ติดตามแผน: เตรียมส่งคำสั่งซื้อจำนวน ${trades.length} รายการ (${tradeSymbols}) และเริ่มตรวจสอบสถานะการทำงานจริง`
      : `[3. TASK CHECK] 📋 ตรวจสอบสถานะ: ไม่พบโอกาสในการเทรดที่เหมาะสมในรอบนี้ กำลังติดตามตลาดต่อไป`;
    
    await logPhase(botConfigId, 'TASK_CHECK', logMsg);

    return { status: 'SUCCESS', aiTasks: aiOutput, candidates: candidates };
  } catch (error) {
    console.error('AI Cognitive Loop Error:', error);
    const isQuotaError = error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED');
    await logPhase(botConfigId, 'FEEDBACK_RETRY', `🚨 ข้อผิดพลาดในระบบ: ${error.message}${isQuotaError ? ' (Quota Exhausted)' : ''}`);
    return { 
      status: 'FAILED', 
      error: error.message,
      errorType: isQuotaError ? 'QUOTA' : 'GENERAL'
    };
  }
}

async function logPhase(botConfigId, step, content) {
  try {
    console.log(`[AI Log] ${step}: ${content.substring(0, 80)}...`);
    await prisma.aILogStream.create({
      data: { 
        id: randomUUID(), // Manually generate ID to bypass DB sync issues
        botConfigId, 
        step, 
        content, 
        status: 'SUCCESS' 
      }
    });
  } catch (err) {
    console.error(`[AI Log Error] Failed to write to DB:`, err.message);
  }
}
