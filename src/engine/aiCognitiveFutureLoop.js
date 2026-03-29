import { getContext, callLLM, cleanJson, logPhase, formatTradeDetails, formatReasoningInfo } from './aiBase.js';
import { getBitgetClient } from '../services/bitget.js';

export async function runCognitiveFutureLoop(botConfigId) {
  const context = await getContext(botConfigId, 'FUTURES');
  if (!context) return null;

  const { config, candidates, bulletsAvailable, candidatesForAI, activePositionsForAI, openOrdersForAI, portfolioExposure, fearGreed, btcTrend, llmInfo } = context;

  await logPhase(
    botConfigId,
    'PLAN',
    `[1. PLAN] 🧠 Checking Market (FUTURES): โพสิชันเปิดอยู่ ${activePositionsForAI?.length || 0} รายการ, ออเดอร์ค้าง ${openOrdersForAI?.length || 0} รายการ`
  );

  const rules = `JSON only. Always include keys: strategy(string),confidence(0-100),reasoning,trades[],close_positions[],cancel_orders[]. trades items must include {symbol,side,amount,stopLossPercent}. side must be "buy" or "sell" only. buy=LONG sell=SHORT. amount is USDT value. Max trades=${bulletsAvailable}. Review active_positions + open_orders. You MUST manage existing positions: decide HOLD vs CLOSE to take profit or cut loss. Use close_positions even if no new trades. If capital tight and a new trade is better, close_positions first. Futures usage <=50%. close_positions items must include {symbol,side,reason} where side is LONG or SHORT. cancel_orders items must include {id,reason}. Add optional key position_review(string) summarizing what to do with current positions. reasoning<=10 words.`;

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
        Number.isFinite(amountFromAI) && amountFromAI > 0
          ? amountFromAI
          : Math.max(5, defaultUsdt);

      const ticker = await client.fetchTicker(mappedSymbol).catch(() => null);
      const px = side === 'buy' ? (ticker?.bid || ticker?.last || ticker?.close) : (ticker?.ask || ticker?.last || ticker?.close);
      const price = Number(px);
      if (!Number.isFinite(price) || price <= 0) {
        stats.noMarket += 1;
        continue;
      }

      const amountBaseRaw = valueUsdt / price;
      const precisionAmount = client.amountToPrecision(mappedSymbol, amountBaseRaw);
      const finalAmount = parseFloat(precisionAmount);

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
      if (minCost > 0 && currentCost < minCost) {
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
  await logPhase(botConfigId, 'IMPLEMENT', `[2. IMPLEMENT] ⚙️ Applying Plan (FUTURES): ${implementDetails || safeStrategy} (${safeConfidence}%)`);

  if (aiOutput.reasoning) {
    const extra = formatReasoningInfo(aiOutput.trades || [], candidates, 'FUTURES');
    await logPhase(botConfigId, 'PLAN', `[AI REASONING] ${aiOutput.reasoning}${extra ? ` -> Plan: ${extra}` : ''}`);
  }

  if (typeof aiOutput?.position_review === 'string' && aiOutput.position_review.trim().length > 0) {
    await logPhase(botConfigId, 'PLAN', `[POSITION CHECK] ${aiOutput.position_review.trim()}`);
  } else {
    const toClose = Array.isArray(aiOutput?.close_positions) ? aiOutput.close_positions : [];
    const closeList = toClose
      .map(x => `${x?.symbol || '-'}(${String(x?.side || '').toUpperCase() || '-'})`)
      .filter(Boolean)
      .join(', ');
    if (toClose.length > 0) {
      await logPhase(botConfigId, 'PLAN', `[POSITION CHECK] แนะนำปิด ${toClose.length} รายการ: ${closeList}`);
    } else if ((activePositionsForAI?.length || 0) > 0) {
      await logPhase(botConfigId, 'PLAN', `[POSITION CHECK] คงสถานะเดิม ${activePositionsForAI.length} รายการ (ยังไม่เข้าเงื่อนไขปิดทำกำไร/ตัดขาดทุน)`);
    }
  }

  const trades = Array.isArray(aiOutput?.trades) ? aiOutput.trades : [];
  const tradeSymbols = trades.map(t => t.symbol).join(', ');
  const logMsg = trades.length > 0
    ? `[3. TASK CHECK] 📋 Preparing trades: ${trades.length} items (${tradeSymbols})`
    : `[3. TASK CHECK] 📋 No trading opportunities found in this cycle`;
  
  await logPhase(botConfigId, 'TASK_CHECK', logMsg);

  return { status: 'SUCCESS', aiTasks: aiOutput, candidates };
}
