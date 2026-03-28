import { getContext, callLLM, cleanJson, logPhase, formatTradeDetails, formatReasoningInfo } from './aiBase.js';

export async function runCognitiveSpotLoop(botConfigId) {
  const context = await getContext(botConfigId, 'SPOT');
  if (!context) return null;

  const { config, candidates, bulletsAvailable, candidatesForAI, portfolioExposure, fearGreed, btcTrend, llmInfo } = context;

  await logPhase(botConfigId, 'PLAN', `[1. PLAN] 🧠 Checking Market (SPOT): ค้นหาโอกาสในตลาดสปอต`);

  const rules = `JSON only. Always include keys: strategy(string),confidence(0-100),reasoning,trades[]. Side=buy only. Max trades=${bulletsAvailable}. reasoning<=10 words.`;

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

  const safeTrades = Array.isArray(aiOutput?.trades) ? aiOutput.trades : [];
  const safeConfidence = Number.isFinite(Number(aiOutput?.confidence)) ? Number(aiOutput.confidence) : 0;
  const safeStrategy =
    typeof aiOutput?.strategy === 'string' && aiOutput.strategy.trim().length > 0
      ? aiOutput.strategy.trim()
      : (safeTrades.length > 0 ? 'DIRECTIONAL' : 'NO_TRADE');

  const implementDetails = formatTradeDetails(aiOutput.trades || [], candidates, 'SPOT');
  await logPhase(botConfigId, 'IMPLEMENT', `[2. IMPLEMENT] ⚙️ Applying Plan (SPOT): ${implementDetails || safeStrategy} (${safeConfidence}%)`);

  if (aiOutput.reasoning) {
    const extra = formatReasoningInfo(aiOutput.trades || [], candidates, 'SPOT');
    await logPhase(botConfigId, 'PLAN', `[AI REASONING] ${aiOutput.reasoning}${extra ? ` -> Plan: ${extra}` : ''}`);
  }

  const trades = safeTrades;
  const tradeSymbols = trades.map(t => t.symbol).join(', ');
  const logMsg = trades.length > 0
    ? `[3. TASK CHECK] 📋 Preparing orders: ${trades.length} items (${tradeSymbols})`
    : `[3. TASK CHECK] 📋 No trading opportunities found in this cycle`;
  
  await logPhase(botConfigId, 'TASK_CHECK', logMsg);

  return { status: 'SUCCESS', aiTasks: aiOutput, candidates };
}
