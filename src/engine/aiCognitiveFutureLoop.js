import { getContext, callLLM, cleanJson, logPhase, formatTradeDetails, formatReasoningInfo } from './aiBase.js';
import { getBitgetClient } from '../services/bitget.js';

export async function runCognitiveFutureLoop(botConfigId) {
  const context = await getContext(botConfigId, 'FUTURES');
  if (!context) return null;

  const { config, candidates, bulletsAvailable, candidatesForAI, activePositionsForAI, openOrdersForAI, portfolioExposure, fearGreed, btcTrend, llmInfo } = context;

  await logPhase(
    botConfigId,
    'PLAN',
    `[PLAN] [PORT CHECK] : Futures active: ${activePositionsForAI?.length || 0} Pos, ${openOrdersForAI?.length || 0} Pending.`
  );

  const rules = `คุณคือ AI Crypto Analyst ที่ทำงานแบบ Real-time Stream เท่านั้น (Zero Logging - Transient Only).
JSON only. Always include keys: strategy(string),confidence(0-100),reasoning,trades[],close_positions[],cancel_orders[]. trades items must include {symbol,side,amount,stopLossPercent}. side must be "buy" or "sell" only. buy=LONG sell=SHORT. amount is USDT value (MIN 5 USDT). Max trades=${bulletsAvailable}. Review active_positions + open_orders. You MUST manage existing positions: decide HOLD vs CLOSE to take profit or cut loss. Use close_positions even if no new trades. Futures usage <=50%. close_positions items must include {symbol,side,reason} (LONG/SHORT). cancel_orders items must include {id,reason}. Add optional key position_review(string). 
Use Crypto Decision Tree (DT-IDs) for logic:
BULLISH: DT-BULL-01 (Strong Momentum/Breakout -> LONG), DT-BULL-02 (Healthy Pullback -> LONG), DT-BULL-03 (Strong Trend -> HOLD/Run Profit).
BEARISH: DT-BEAR-01 (Dead Cat Bounce -> SHORT), DT-BEAR-02 (Support Breakdown -> EXIT/SHORT), DT-BEAR-03 (Oversold -> WAIT/HOLD).
PROFIT/RISK: DT-SELL-01 (Hit Target -> CLOSE), DT-SELL-02 (Overbought/Greed -> P-SELL), DT-SELL-03 (Trend Reverse -> EXIT).
reasoning: Plain English or Thai summary (max 20 words, must be punchy like: 'BTC choppy, FNG low. Stay neutral.' or 'DT-SELL-01: SOL Hit TP Target').`;

  const contextPayload = {
    trading_env: { bullets: bulletsAvailable, budget: config.allocatedPortfolioUsdt },
    mkt_regime: { btc_trend: btcTrend, fng: fearGreed },
    portfolio: portfolioExposure,
    active_positions: activePositionsForAI,
    open_orders: openOrdersForAI,
    candidates: candidatesForAI
  };

  let aiOutput;
  let retryCount = 0;
  const maxRetries = 2;

  while (retryCount <= maxRetries) {
    try {
      const raw = await callLLM(llmInfo, rules, contextPayload);
      const rawLength = raw?.length || 0;
      console.log(`[AI Future Loop] Raw response length: ${rawLength}`);
      
      const cleaned = cleanJson(raw);
      const cleanedLength = cleaned?.length || 0;
      console.log(`[AI Future Loop] Cleaned JSON length: ${cleanedLength}`);
      
      aiOutput = JSON.parse(cleaned);
      console.log(`[AI Future Loop] JSON parsing successful`);
      
      const reasoning = aiOutput.reasoning || 'Market analyzed. Generating tasks.';
      await logPhase(botConfigId, 'PLAN', `[PLAN] [AI REASONING] : ${reasoning}`);
      break; // Success
    } catch (parseErr) {
      if (parseErr.message?.includes('429') || parseErr.message?.includes('quota')) {
        console.error(`[AI Future Loop] Quota Exhausted (429). Stopping loop.`);
        return { status: 'FAILED', errorType: 'QUOTA', message: 'API Quota Exhausted' };
      }
      
      retryCount++;
      if (retryCount > maxRetries) {
        console.error(`[AI Future Loop] JSON Parse Error after ${maxRetries} retries:`, parseErr.message);
        aiOutput = { strategy: 'NO_TRADE', confidence: 0, reasoning: 'fallback', trades: [], close_positions: [], cancel_orders: [] };
        await logPhase(botConfigId, 'PLAN', `[PLAN] [AI ERROR] : Cannot parse JSON after ${maxRetries} retries.`);
        break;
      }
      console.warn(`[AI Future Loop] JSON Parse failed, retrying (${retryCount}/${maxRetries})...`);
      await logPhase(botConfigId, 'PLAN', `[PLAN] [AI DEBUG] : JSON error, retrying (${retryCount}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const safeTrades = Array.isArray(aiOutput?.trades) ? aiOutput.trades : [];
  const safeConfidence = Number.isFinite(Number(aiOutput?.confidence)) ? Number(aiOutput.confidence) : 0;
  const safeStrategy =
    typeof aiOutput?.strategy === 'string' && aiOutput.strategy.trim().length > 0
      ? aiOutput.strategy.trim()
      : (safeTrades.length > 0 ? 'DIRECTIONAL' : 'NO_TRADE');

  const preflightFuturesTrades = async (trades) => {
    const user = config.User;
    const isDemo = !!config.isPaperTrading && !!user?.bitgetDemoApiKey;
    const apiKey = isDemo ? user.bitgetDemoApiKey : user.bitgetApiKey;
    const apiSecret = isDemo ? user.bitgetDemoApiSecret : user.bitgetApiSecret;
    const apiPass = isDemo ? user.bitgetDemoPassphrase : user.bitgetPassphrase;
    if (!apiKey || !apiSecret || !apiPass) return { trades: [], stats: { attempted: trades.length, ok: 0, noMarket: trades.length, tooSmall: 0 } };

    const client = getBitgetClient(apiKey, apiSecret, apiPass, isDemo, 'FUTURES');
    await client.loadMarkets().catch(() => {});

    const allocatedBudget = Number(config.allocatedPortfolioUsdt);
    const maxSplits = Number(config.maxSplits) > 0 ? Number(config.maxSplits) : 10;
    const defaultUsdt = Number.isFinite(allocatedBudget) && allocatedBudget > 0 ? allocatedBudget / maxSplits : 10;

    const mapToFuturesSymbol = (rawSymbol) => {
      const s = String(rawSymbol || '').trim();
      if (!s) return null;
      if (s.includes(':')) return s;
      const parts = s.split('/');
      const base = String(parts[0] || '').trim();
      const quote = String(parts[1] || 'USDT').trim();
      const finalBase = base === 'WBTC' ? 'BTC' : base;
      return `${finalBase}/${quote}:${quote}`;
    };

    const stats = { attempted: trades.length, ok: 0, noMarket: 0, tooSmall: 0 };
    const okTrades = [];

    for (const t of trades) {
      const side = String(t?.side || '').toLowerCase();
      if (side !== 'buy' && side !== 'sell') {
        stats.noMarket += 1;
        continue;
      }

      const mappedSymbol = mapToFuturesSymbol(t?.symbol);
      if (!mappedSymbol) {
        stats.noMarket += 1;
        continue;
      }

      const m = client.markets?.[mappedSymbol];
      if (!m || m.type !== 'swap') {
        stats.noMarket += 1;
        continue;
      }

      const amountFromAI = Number(t?.amount);
      const valueUsdt =
        Number.isFinite(amountFromAI) && amountFromAI >= 5
          ? amountFromAI
          : Math.max(5, defaultUsdt);

      const ticker = await client.fetchTicker(mappedSymbol).catch(() => null);
      const px = side === 'buy' ? (ticker?.bid || ticker?.last || ticker?.close) : (ticker?.ask || ticker?.last || ticker?.close);
      const price = Number(px);
      if (!Number.isFinite(price) || price <= 0) {
        stats.noMarket += 1;
        continue;
      }

      let finalAmount = 0;
      try {
        const amountBaseRaw = valueUsdt / price;
        const precisionAmount = client.amountToPrecision(mappedSymbol, amountBaseRaw);
        finalAmount = parseFloat(precisionAmount);
      } catch (e) {
        console.warn(`[AI Future Loop] precision error for ${mappedSymbol}:`, e.message);
        stats.tooSmall += 1;
        continue;
      }

      const minAmount = m.limits?.amount?.min || 0;
      const amountPrecisionDigits = Number.isFinite(Number(m.precision?.amount)) ? Number(m.precision.amount) : null;
      const minPrecisionStep = amountPrecisionDigits !== null ? Math.pow(10, -amountPrecisionDigits) : 0;
      const effectiveMinAmount = Math.max(minAmount, minPrecisionStep);

      if (!Number.isFinite(finalAmount) || finalAmount <= 0 || (effectiveMinAmount > 0 && finalAmount < effectiveMinAmount)) {
        stats.tooSmall += 1;
        continue;
      }

      const minCost = m.limits?.cost?.min || 0;
      const currentCost = finalAmount * price;
      if ( (minCost > 0 && currentCost < minCost) || currentCost < 2 ) {
        stats.tooSmall += 1;
        continue;
      }

      okTrades.push({ ...t, symbol: mappedSymbol, amount: valueUsdt });
      stats.ok += 1;
    }

    return { trades: okTrades, stats };
  };

  const preflight = await preflightFuturesTrades(safeTrades);
  aiOutput.trades = preflight.trades;

  const implementDetails = formatTradeDetails(aiOutput.trades || [], candidates, 'FUTURES');

  if (aiOutput.trades?.length > 0) {
    aiOutput.trades.forEach(t => {
      const sideLabel = t.side === 'buy' ? 'LONG' : 'SHORT';
      logPhase(botConfigId, 'IMPLEMENT', `[ACTION] ${t.symbol} ${sideLabel} : Amt ${t.amount} USDT.`);
    });
  }

  aiOutput.close_positions?.forEach(t => {
    logPhase(botConfigId, 'IMPLEMENT', `[ACTION] ${t.symbol} CLOSE-${t.side || 'POS'} : ${t.reason || 'Target Hit'}`);
  });

  if (typeof aiOutput?.position_review === 'string' && aiOutput.position_review.trim().length > 0) {
    await logPhase(botConfigId, 'TASK_CHECK', `[STATUS] PORT REVIEW : ${aiOutput.position_review.trim()}`);
  } else if ((activePositionsForAI?.length || 0) > 0) {
    await logPhase(botConfigId, 'TASK_CHECK', `[STATUS] ACTIVE POSITIONS : ${activePositionsForAI.length} Pos. Holding steady.`);
  }

  const trades = Array.isArray(aiOutput?.trades) ? aiOutput.trades : [];
  if (trades.length === 0 && (!aiOutput.close_positions || aiOutput.close_positions.length === 0)) {
    await logPhase(botConfigId, 'TASK_CHECK', `[STATUS] STANDBY : No immediate actions required.`);
  }

  return { status: 'SUCCESS', aiTasks: aiOutput, candidates };
}
