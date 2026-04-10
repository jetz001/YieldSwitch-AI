import { getContext, callLLM, cleanJson, logPhase } from './aiBase.js';

export async function runCognitiveSpotLoop(botConfigId) {
  const context = await getContext(botConfigId, 'SPOT');
  if (!context) return null;

  const { config, candidates, bulletsAvailable, candidatesForAI, portfolioExposure, fearGreed, btcTrend, llmInfo } = context;

  await logPhase(
    botConfigId,
    'PLAN',
    `[PLAN] [PORT CHECK] : Spot active. Candidates: ${candidatesForAI?.length || 0}, Bullets: ${bulletsAvailable}`
  );

  const rules = `คุณคือ AI Crypto Analyst ที่ทำงานแบบ Real-time Stream เท่านั้น (Zero Logging - Transient Only).
JSON only. Always include keys: strategy(string),confidence(0-100),reasoning,trades[],close_positions[]. trades items must include {symbol,side,amount,stopLossPercent}. side must be "buy" only. amount is USDT value. Max trades=${bulletsAvailable}. 
Review active_positions (your current Spot wallet assets). 
[STRICT RULE] close_positions MUST ONLY contain symbols currently found in active_positions. DO NOT hallucinate or close symbols from the candidates array. Use EXACT symbol names from active_positions.
You MUST manage existing positions: decide HOLD vs CLOSE to take profit or cut loss. Use close_positions even if no new trades. close_positions items must include {symbol,side,reason} (side should be "sell" for Spot). Add optional key position_review(string).
Use Crypto Decision Tree (DT-IDs) for logic:
BULLISH: DT-BULL-01 (Strong Momentum/Breakout -> BUY+), DT-BULL-02 (Healthy Pullback -> BUY+), DT-BULL-03 (Strong Trend -> HOLD/Run Profit).
BEARISH: DT-BEAR-03 (Oversold -> WAIT).
PROFIT/RISK: DT-SELL-01 (Hit Target/Profitable -> CLOSE Asset to USDT), DT-SELL-02 (Overbought/Greed -> P-SELL), DT-SELL-03 (Trend Reverse -> EXIT).
reasoning: Plain English or Thai summary (max 20 words, must be punchy like: 'BTC choppy. Stay neutral.' or 'DT-SELL-01: DOGE Hit TP Target.').`;

  const contextPayload = {
    trading_env: { bullets: bulletsAvailable, budget: config.allocatedPortfolioUsdt },
    mkt_regime: { btc_trend: btcTrend, fng: fearGreed },
    portfolio: portfolioExposure,
    active_positions: context.activePositionsForAI,
    candidates: candidatesForAI
  };

  let aiOutput;
  let retryCount = 0;
  const maxRetries = 2;

  while (retryCount <= maxRetries) {
    try {
      const raw = await callLLM(llmInfo, rules, contextPayload);
      aiOutput = JSON.parse(cleanJson(raw));
      
      const reasoning = aiOutput.reasoning || 'Market analyzed. Generating tasks.';
      await logPhase(botConfigId, 'PLAN', `[PLAN] [AI REASONING] : ${reasoning}`);
      break; // Success
    } catch (parseErr) {
      if (parseErr.message?.includes('429') || parseErr.message?.includes('quota')) {
        console.error(`[AI Spot Loop] Quota Exhausted (429). Stopping loop.`);
        return { status: 'FAILED', errorType: 'QUOTA', message: 'API Quota Exhausted' };
      }

      retryCount++;
      if (retryCount > maxRetries) {
        console.error(`[AI Spot Loop] JSON Parse Error after ${maxRetries} retries:`, parseErr.message);
        aiOutput = { strategy: 'NO_TRADE', confidence: 0, reasoning: 'fallback', trades: [] };
        await logPhase(botConfigId, 'PLAN', `[PLAN] [AI ERROR] : Cannot parse JSON after ${maxRetries} retries.`);
        break;
      }
      console.warn(`[AI Spot Loop] JSON Parse failed, retrying (${retryCount}/${maxRetries})...`);
      await logPhase(botConfigId, 'PLAN', `[PLAN] [AI DEBUG] : JSON error, retrying (${retryCount}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const safeTrades = Array.isArray(aiOutput?.trades) ? aiOutput.trades : [];

  const normalizeSpotSymbol = (sym) => {
    const s = String(sym || '').trim().toUpperCase();
    if (!s) return '';
    const noPipe = s.includes('|') ? s.split('|')[0] : s;
    const noSpace = noPipe.split(/\s+/)[0];
    return noSpace.split(':')[0];
  };
  const activeSymbols = new Set((context.activePositionsForAI || []).map(p => normalizeSpotSymbol(p.symbol)).filter(Boolean));
  const rawClose = Array.isArray(aiOutput?.close_positions) ? aiOutput.close_positions : [];
  const sanitizedClose = rawClose.filter(item => {
    const sym = typeof item === 'string' ? item : item?.symbol;
    const normalized = normalizeSpotSymbol(sym);
    return !!(normalized && activeSymbols.has(normalized));
  });
  if (rawClose.length !== sanitizedClose.length) {
    aiOutput.close_positions = sanitizedClose;
  }

  if (aiOutput.trades?.length > 0) {
    aiOutput.trades.forEach(t => {
      const amtStr = (t.amount !== undefined && t.amount !== null) ? t.amount : 'Auto';
      logPhase(botConfigId, 'IMPLEMENT', `[ACTION] ${t.symbol} BUY (Spot) : Amt ${amtStr} USDT.`);
    });
  }

  aiOutput.close_positions?.forEach(t => {
    logPhase(botConfigId, 'IMPLEMENT', `[ACTION] ${t.symbol} CLOSE-POS (Spot) : ${t.reason || 'Target Hit'}`);
  });

  if (typeof aiOutput?.position_review === 'string' && aiOutput.position_review.trim().length > 0) {
    await logPhase(botConfigId, 'TASK_CHECK', `[STATUS] PORT REVIEW : ${aiOutput.position_review.trim()}`);
  } else if ((context.activePositionsForAI?.length || 0) > 0) {
    await logPhase(botConfigId, 'TASK_CHECK', `[STATUS] ACTIVE ASSETS : ${context.activePositionsForAI.length} Coins held.`);
  }

  const trades = safeTrades;
  if (trades.length === 0 && (!aiOutput.close_positions || aiOutput.close_positions.length === 0)) {
    await logPhase(botConfigId, 'TASK_CHECK', `[STATUS] STANDBY : No immediate actions required.`);
  }

  return { status: 'SUCCESS', aiTasks: aiOutput, candidates };
}
