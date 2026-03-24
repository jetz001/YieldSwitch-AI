import { PrismaClient } from '@prisma/client';
import { getLLMClient } from '../services/llmProvider';
import { getBitgetClient } from '../services/bitget';
import { runAutoScreener, getFearAndGreedIndex, getBTCTrend, getSectorForSymbol } from './autoScreener';

const prisma = new PrismaClient();

export async function runCognitiveLoop(botConfigId) {
  try {
    const config = await prisma.botConfig.findUnique({ where: { id: botConfigId }, include: { User: true } });
    if (!config || !config.isActive) return null;

    if (config.User.status === 'SUSPENDED' || config.User.status === 'BANNED') {
      console.warn(`Cognitive loop aborted. User ${config.User.id} is ${config.User.status}`);
      return null;
    }

    await logPhase(botConfigId, 'PLAN', '[PLAN] 🧠 AI คิดแผน: เรียก Screener แสกนเหรียญและดึงสถานะตลาด');

    // Determine which exchange client to use for screening
    let bitgetClient;
    if (config.isPaperTrading && config.User.bitgetDemoApiKey) {
      bitgetClient = getBitgetClient(config.User.bitgetDemoApiKey, config.User.bitgetDemoApiSecret, config.User.bitgetDemoPassphrase, true);
    } else {
      bitgetClient = getBitgetClient(config.User.bitgetApiKey, config.User.bitgetApiSecret, config.User.bitgetPassphrase);
    }
    
    // Engine provides market data completely statelessly
    const candidates = await runAutoScreener(bitgetClient);
    const fearGreed = await getFearAndGreedIndex();
    const btcTrend = await getBTCTrend(bitgetClient);

    // §6: Fetch portfolio_exposure (current sector holdings)
    const openTranches = await prisma.activeTranche.findMany({
      where: { botConfigId, status: 'OPEN' }
    });
    const portfolioExposure = [...new Set(openTranches.map(t => getSectorForSymbol(t.symbol)))];

    // Count available bullets (max - currently open)
    const maxBullets = config.maxSplits || 10;
    const usedBullets = openTranches.length;
    const bulletsAvailable = Math.max(0, maxBullets - usedBullets);
    
    // §6 Stateless Context Injection (LLM JSON Payload)
    const contextPayload = {
      system_directive: "Evaluate candidates. Choose a strategy (Directional, Deep Value Accumulation, Volume Anomaly Breakout, SMC Liquidity Sweep, or Delta-Neutral Arbitrage) or output SHADOW_TRADE if confidence is low. Ensure multiple TP levels (TP1 at 1.5R sell 25%, TP2 at 3.0R sell 25%, Runner 50% with Trailing Stop). Strictly follow MARKET TYPE DIRECTIVES. Include stopLossPercent and sector in each trade.",
      trading_environment: { 
        market_type: config.marketType || "MIXED",
        bullets_available: bulletsAvailable, 
        allocated_budget_usdt: config.allocatedPortfolioUsdt 
      },
      market_regime: { 
        btc_trend: btcTrend,
        fear_and_greed_index: fearGreed 
      },
      portfolio_exposure: portfolioExposure,
      scanned_candidates: candidates.slice(0, 5)
    };

    const { client: llmClient, model: llmModel } = getLLMClient(
      config.User.aiApiKey, 
      config.User.aiProvider || 'OPENAI', 
      config.User.aiModel || 'gpt-4o',
      true // Encrypted from DB
    );
    
    // §1 System Rules — comprehensive market-type-aware directives
    const rules = `
      You are an Elite Quantitative Analyst at a top-tier Crypto Hedge Fund.
      You MUST respond in valid JSON format.
      PRIMARY MISSION DIRECTIVE: ${config.aiDirectives || "เน้นความปลอดภัยและกำไรที่สม่ำเสมอ"}

      === MARKET TYPE DIRECTIVES ===
      The current market_type is: ${config.marketType || 'MIXED'}

      IF market_type IS 'SPOT':
        Rule 1: STRICTLY FORBIDDEN from generating "SHORT" or "sell" signals. LONG/HOLD only.
        Rule 2: In Bearish regime or fear_and_greed < 25, use "Deep Value Accumulation" (scaling in, no hard SL).
        Rule 3: No leverage. Risk managed purely by position sizing.
      
      IF market_type IS 'FUTURES' or 'MIXED':
        Rule 1: LONG and SHORT signals are both allowed.
        Rule 2: Stop Loss MUST be tighter than calculated Liquidation Price.
        Rule 3: If funding_rate > 0.1% and market is CHOP/RANGING, output strategy: 'DELTA_NEUTRAL' to harvest yield.
      
      === RISK RULES ===
      Rule: If confidence < 70%, output action: "SHADOW_TRADE" (paper trade for learning).
      Rule: sector of the new trade MUST differ from portfolio_exposure if that sector already has 2 holdings.
      Rule: Always specify stopLossPercent for each trade.
      Rule: Each trade MUST include TP scaling: tp1 (1.5R, sell 25%), tp2 (3.0R, sell 25%), runner (50% with trailing stop).

      === OUTPUT FORMAT ===
      {
        "strategy": "DELTA_NEUTRAL|SMC_SWEEP|VOLUME_BREAKOUT|DEEP_VALUE|DIRECTIONAL|SHADOW_TRADE",
        "confidence": 0-100,
        "reasoning": "Thai explanation of why this strategy was chosen",
        "trades": [
          {
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
          }
        ]
      }
    `;

    const planResponse = await llmClient.chat.completions.create({
      model: llmModel,
      messages: [
        { role: 'system', content: rules },
        { role: 'user', content: JSON.stringify(contextPayload) }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 2000
    });

    const aiOutput = JSON.parse(planResponse.choices[0].message.content);

    await logPhase(botConfigId, 'IMPLEMENT', `[IMPLEMENT] ⚙️ ปรับแผน: แนะนำกลยุทธ์ ${aiOutput.strategy} (ความมั่นใจ ${aiOutput.confidence || 0}%)`);
    
    if (aiOutput.reasoning) {
      await logPhase(botConfigId, 'PLAN', `[AI REASONING] ${aiOutput.reasoning}`);
    }

    await logPhase(botConfigId, 'TASK_CHECK', `[TASK CHECK] 📋 เตรียมรายการสั่งซื้อ ${(aiOutput.trades || []).length} รายการ... ส่งต่อ executionGuard.js เพื่อควบคุมคำสั่งจริง`);

    return { status: 'SUCCESS', aiTasks: aiOutput };
  } catch (error) {
    console.error('AI Cognitive Loop Error:', error);
    await logPhase(botConfigId, 'FEEDBACK_RETRY', `🚨 ข้อผิดพลาดในระบบ: ${error.message}`);
    return { status: 'FAILED', error: error.message };
  }
}

async function logPhase(botConfigId, step, content) {
  try {
    console.log(`[AI Log] ${step}: ${content.substring(0, 80)}...`);
    await prisma.aILogStream.create({
      data: { botConfigId, step, content, status: 'SUCCESS' }
    });
  } catch (err) {
    console.error(`[AI Log Error] Failed to write to DB:`, err.message);
  }
}
