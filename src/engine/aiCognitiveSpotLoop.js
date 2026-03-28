import { getContext, callLLM, cleanJson, logPhase, formatTradeDetails, formatReasoningInfo } from './aiBase.js';

export async function runCognitiveSpotLoop(botConfigId) {
  const context = await getContext(botConfigId, 'SPOT');
  if (!context) return null;

  const { config, candidates, bulletsAvailable, candidatesForAI, portfolioExposure, fearGreed, btcTrend, llmInfo } = context;

  await logPhase(botConfigId, 'PLAN', `[1. PLAN] 🧠 Checking Market (SPOT): ค้นหาโอกาสในตลาดสปอต`);

  const rules = `
    You are an Elite Spot Trader. Response MUST be valid JSON.
    
    === RULES ===
    - Side: 'buy' only.
    - Max Bullets: ${bulletsAvailable}.
    - BE EXTREMELY CONCISE in reasoning (max 10 words).
    
    === OUTPUT ===
    {
      "strategy": "DELTA_NEUTRAL|VOLUME_BREAKOUT|DIRECTIONAL",
      "confidence": 0-100,
      "reasoning": "ไทยสั้นๆ",
      "trades": [{"symbol": "BTC/USDT", "side": "buy", "amount": 500, "strategy": "DIRECTIONAL", "confidence": 85, "sector": "L1"}]
    }
  `;

  const contextPayload = {
    trading_env: { bullets: bulletsAvailable, budget: config.allocatedPortfolioUsdt },
    mkt_regime: { btc_trend: btcTrend, fng: fearGreed },
    portfolio: portfolioExposure,
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
        console.error(`[AI Spot Loop] Quota Exhausted (429). Stopping loop.`);
        return { status: 'FAILED', errorType: 'QUOTA', message: 'API Quota Exhausted' };
      }

      retryCount++;
      if (retryCount > maxRetries) {
        console.error(`[AI Spot Loop] JSON Parse Error after ${maxRetries} retries:`, parseErr.message);
        return { status: 'FAILED', errorType: 'PARSE', message: parseErr.message };
      }
      console.warn(`[AI Spot Loop] JSON Parse failed, retrying (${retryCount}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const implementDetails = formatTradeDetails(aiOutput.trades || [], candidates, 'SPOT');
  await logPhase(botConfigId, 'IMPLEMENT', `[2. IMPLEMENT] ⚙️ Applying Plan (SPOT): ${implementDetails || aiOutput.strategy} (${aiOutput.confidence || 0}%)`);

  if (aiOutput.reasoning) {
    const extra = formatReasoningInfo(aiOutput.trades || [], candidates, 'SPOT');
    await logPhase(botConfigId, 'PLAN', `[AI REASONING] ${aiOutput.reasoning}${extra ? ` -> Plan: ${extra}` : ''}`);
  }

  const trades = aiOutput.trades || [];
  const tradeSymbols = trades.map(t => t.symbol).join(', ');
  const logMsg = trades.length > 0
    ? `[3. TASK CHECK] 📋 Preparing orders: ${trades.length} items (${tradeSymbols})`
    : `[3. TASK CHECK] 📋 No trading opportunities found in this cycle`;
  
  await logPhase(botConfigId, 'TASK_CHECK', logMsg);

  return { status: 'SUCCESS', aiTasks: aiOutput, candidates };
}
