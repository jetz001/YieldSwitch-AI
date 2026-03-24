import { PrismaClient } from '@prisma/client';
import { getLLMClient } from '../services/llmProvider';
import { getBitgetClient } from '../services/bitget';
import { runAutoScreener, getFearAndGreedIndex } from './autoScreener';

const prisma = new PrismaClient();

export async function runCognitiveLoop(botConfigId) {
  try {
    const config = await prisma.botConfig.findUnique({ where: { id: botConfigId }, include: { user: true } });
    if (!config || !config.isActive) return null;

    if (config.user.status === 'SUSPENDED' || config.user.status === 'BANNED') {
      console.warn(`Cognitive loop aborted. User ${config.user.id} is ${config.user.status}`);
      return null;
    }

    await logPhase(botConfigId, 'PLAN', '[PLAN] 🧠 AI คิดแผน: เรียก Screener แสกนเหรียญและดึงสถานะตลาด');

    const bitgetClient = getBitgetClient(config.user.bitgetApiKey, config.user.bitgetApiSecret, config.user.bitgetPassphrase);
    
    // Engine provides market data completely statelessly
    const candidates = await runAutoScreener(bitgetClient);
    const fearGreed = await getFearAndGreedIndex();
    
    // Stateless Context Injection (LLM JSON Payload)
    const contextPayload = {
      system_directive: "Evaluate candidates. Choose a strategy (Directional or Arbitrage) or output SHADOW_TRADE if confidence is low. Ensure multiple TP levels (TP1 25%, TP2 25%, Runner 50%). Strictly follow MARKET TYPE DIRECTIVES.",
      trading_environment: { 
        market_type: config.marketType || "MIXED", // 'SPOT', 'FUTURES', 'MIXED'
        bullets_available: 3, 
        allocated_budget_usdt: config.allocatedPortfolioUsdt 
      },
      market_regime: { 
        fear_and_greed_index: fearGreed 
      },
      scanned_candidates: candidates.slice(0, 5) // Send top 5 context
    };

    const { client: llmClient, model: llmModel } = getLLMClient(
      config.user.aiApiKey, 
      config.user.aiProvider || 'OPENAI', 
      config.user.aiModel || 'gpt-4o',
      true // Encrypted from DB
    );
    
    // System Rules array enforced into the LLM logic
    const rules = `
      You are an Elite Quant. The human just presses START/STOP.
      Rule 1 (SPOT): LONG/HOLD only. Deep Value Accumulation if fear < 25.
      Rule 2 (FUTURES/MIXED): LONG and SHORT allowed. 
      Rule 3 (Delta-Neutral Arbitrage): If funding_rate > 0.1% and market CHOP, simultaneously BUY Spot + SHORT Futures to harvest yield. Output strategy: 'DELTA_NEUTRAL'.
      Rule 4 (Shadow Mode): If confidence < 70%, output action: "SHADOW_TRADE".
    `;

    const planResponse = await llmClient.chat.completions.create({
      model: llmModel,
      messages: [
        { role: 'system', content: rules },
        { role: 'user', content: JSON.stringify(contextPayload) }
      ],
      response_format: { type: 'json_object' }
    });

    const aiOutput = JSON.parse(planResponse.choices[0].message.content);

    await logPhase(botConfigId, 'IMPLEMENT', `[IMPLEMENT] ⚙️ ปรับแผน: แนะนำกลยุทธ์ ${aiOutput.strategy} (ความมั่นใจ ${aiOutput.confidence || 0}%)`);
    await logPhase(botConfigId, 'TASK_CHECK', `[TASK CHECK] 📋 เตรียมรายการสั่งซื้อ... ส่งต่อ executionGuard.js เพื่อควบคุมคำสั่งจริง`);

    // The backend execution node applies `aiOutput` directly avoiding any hallucinated orders
    // returning it to engine master process.
    return { status: 'SUCCESS', aiTasks: aiOutput };
  } catch (error) {
    console.error('AI Cognitive Loop Error:', error);
    await logPhase(botConfigId, 'FEEDBACK_RETRY', `🚨 ข้อผิดพลาดในระบบ: ${error.message}`);
    return { status: 'FAILED', error: error.message };
  }
}

async function logPhase(botConfigId, step, content) {
  await prisma.aILogStream.create({
    data: { botConfigId, step, content, status: 'SUCCESS' }
  });
}
