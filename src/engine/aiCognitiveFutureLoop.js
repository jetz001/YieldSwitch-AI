import { getContext, callLLM, cleanJson, logPhase, formatTradeDetails, formatReasoningInfo } from './aiBase.js';

export async function runCognitiveFutureLoop(botConfigId) {
  const context = await getContext(botConfigId, 'FUTURES');
  if (!context) return null;

  const { config, candidates, bulletsAvailable, candidatesForAI, activePositionsForAI, portfolioExposure, fearGreed, btcTrend, llmInfo } = context;

  await logPhase(botConfigId, 'PLAN', `[1. PLAN] 🧠 Checking Market (FUTURES): ค้นหาโอกาสในตลาดและประเมินไม้ที่เปิดอยู่`);

  const rules = `
    You are an Elite Futures Quant. Response MUST be valid JSON.
    
    === RULES ===
    - Action: 'buy' (LONG) or 'sell' (SHORT).
    - Provide stopLossPercent. TP is auto-calculated.
    - Max Bullets: ${bulletsAvailable}.
    - Active positions: review 'active_positions'. If trend changed/high risk, add to 'close_positions' with ID and reason.
    - BE EXTREMELY CONCISE in reasoning (max 10 words).
    
    === OUTPUT ===
    {
      "strategy": "DELTA_NEUTRAL|VOLUME_BREAKOUT|DIRECTIONAL",
      "confidence": 0-100,
      "reasoning": "ไทยสั้นๆ",
      "trades": [{"symbol": "BTC/USDT", "side": "buy|sell", "amount": 500, "strategy": "DIRECTIONAL", "confidence": 85, "stopLossPercent": 3.5, "sector": "L1"}],
      "close_positions": [{"id": "uuid", "reason": "ไทยสั้นๆ"}]
    }
  `;

  const contextPayload = {
    trading_env: { bullets: bulletsAvailable, budget: config.allocatedPortfolioUsdt },
    mkt_regime: { btc_trend: btcTrend, fng: fearGreed },
    portfolio: portfolioExposure,
    active_positions: activePositionsForAI,
    candidates: candidatesForAI
  };

  let aiOutput;
  let retryCount = 0;
  const maxRetries = 2;

  while (retryCount <= maxRetries) {
    try {
      const raw = await callLLM(llmInfo, rules, contextPayload);
      aiOutput = JSON.parse(cleanJson(raw));
      break; // Success
    } catch (parseErr) {
      if (parseErr.message?.includes('429') || parseErr.message?.includes('quota')) {
        console.error(`[AI Future Loop] Quota Exhausted (429). Stopping loop.`);
        return { status: 'FAILED', errorType: 'QUOTA', message: 'API Quota Exhausted' };
      }
      
      retryCount++;
      if (retryCount > maxRetries) {
        console.error(`[AI Future Loop] JSON Parse Error after ${maxRetries} retries:`, parseErr.message);
        return { status: 'FAILED', errorType: 'PARSE', message: parseErr.message };
      }
      console.warn(`[AI Future Loop] JSON Parse failed, retrying (${retryCount}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const implementDetails = formatTradeDetails(aiOutput.trades || [], candidates, 'FUTURES');
  await logPhase(botConfigId, 'IMPLEMENT', `[2. IMPLEMENT] ⚙️ Applying Plan (FUTURES): ${implementDetails || aiOutput.strategy} (${aiOutput.confidence || 0}%)`);

  if (aiOutput.reasoning) {
    const extra = formatReasoningInfo(aiOutput.trades || [], candidates, 'FUTURES');
    await logPhase(botConfigId, 'PLAN', `[AI REASONING] ${aiOutput.reasoning}${extra ? ` -> Plan: ${extra}` : ''}`);
  }

  const trades = aiOutput.trades || [];
  const tradeSymbols = trades.map(t => t.symbol).join(', ');
  const logMsg = trades.length > 0
    ? `[3. TASK CHECK] 📋 Preparing trades: ${trades.length} items (${tradeSymbols})`
    : `[3. TASK CHECK] 📋 No trading opportunities found in this cycle`;
  
  await logPhase(botConfigId, 'TASK_CHECK', logMsg);

  return { status: 'SUCCESS', aiTasks: aiOutput, candidates };
}
