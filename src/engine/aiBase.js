import { prisma } from '../lib/db.js';
import { getLLMClient } from '../services/llmProvider.js';
import { getBitgetClient, getExchangeClient } from '../services/exchangeFactory.js';
import { getExchangeClients } from './engineManager.js';
import { runAutoScreener, getFearAndGreedIndex, getBTCTrend, getSectorForSymbol } from './autoScreener.js';
import { calculateSLPrice, calculateTPTiers } from '../utils/priceMath.js';

export async function getContext(botConfigId, marketType) {
  const config = await prisma.botConfig.findUnique({ 
    where: { id: botConfigId }, 
    include: { User: true } 
  });
  
  if (!config || !config.isActive) return null;

  const { spot, futures } = await getExchangeClients(botConfigId);
  const bitgetClient = marketType === 'SPOT' ? spot : futures;
  if (!bitgetClient) return null;

  const candidates = await runAutoScreener(bitgetClient);
  const fearGreed = await getFearAndGreedIndex();
  const btcTrend = await getBTCTrend(bitgetClient);

  const normalizeFuturesSide = (raw) => {
    const r = String(raw || '').toLowerCase();
    if (r.includes('short')) return 'SHORT';
    if (r.includes('sell')) return 'SHORT';
    return 'LONG';
  };

  let activePositionsForAI = [];
  let openOrdersForAI = [];
  let openCount = 0;

  try {
    if (String(marketType || '').toUpperCase() === 'FUTURES') {
      const positions = await bitgetClient.fetchPositions().catch(() => []);
      const openPositions = (positions || []).filter(p => {
        const contracts = Number(p.contracts || 0);
        return Number.isFinite(contracts) && contracts > 0;
      });
      openCount = openPositions.length;
      activePositionsForAI = openPositions.slice(0, 6).map(p => {
        const side = normalizeFuturesSide(p.side || p.info?.holdSide || p.info?.posSide);
        const entry = Number(p.entryPrice || 0);
        const mark = Number(p.markPrice || p.lastPrice || p.info?.markPrice || p.info?.markPx || p.info?.last || 0);
        const currentPrice = Number.isFinite(mark) && mark > 0 ? mark : entry;
        const pnlPercent =
          entry > 0 && Number.isFinite(currentPrice)
            ? Number((((currentPrice - entry) / entry) * (side === 'SHORT' ? -1 : 1) * 100).toFixed(2))
            : 0;
        const upnl = Number(p.unrealizedPnl || 0);
        const contracts = Number(p.contracts || 0);
        const notionalUsdt =
          Number.isFinite(contracts) && Number.isFinite(currentPrice) && currentPrice > 0
            ? Number((contracts * currentPrice).toFixed(2))
            : 0;
        return {
          symbol: p.symbol,
          side,
          entry: Number(entry.toFixed(5)),
          notional: notionalUsdt,
          pnl: pnlPercent
        };
      });

      const openOrdersRaw = await bitgetClient.fetchOpenOrders().catch(() => []);
      openOrdersForAI = (openOrdersRaw || []).slice(0, 6).map(o => ({
        symbol: o.symbol,
        side: String(o.side).toUpperCase(),
        price: o.price
      }));
    } else if (String(marketType || '').toUpperCase() === 'SPOT') {
      const openOrdersRaw = await bitgetClient.fetchOpenOrders().catch(() => []);
      openCount = (openOrdersRaw || []).length;
      openOrdersForAI = (openOrdersRaw || []).slice(0, 6).map(o => ({
        symbol: o.symbol,
        side: String(o.side).toUpperCase(),
        price: o.price
      }));

      // Fetch Spot balances
      const balance = await bitgetClient.fetchBalance({ type: 'spot' }).catch(() => ({}));
      const tickers = await bitgetClient.fetchTickers().catch(() => ({}));
      
      const freeTokens = Object.keys(balance.free || {}).filter(coin => 
        coin !== 'USDT' && coin !== 'USDC' && coin !== 'BGB' &&
        parseFloat(balance.free[coin]) > 0
      );

      // Fetch Bot History for Cost Basis
      const openTranches = await prisma.activeTranche.findMany({
        where: { botConfigId, status: 'OPEN' }
      });

      for (const coin of freeTokens) {
        const amount = parseFloat(balance.free[coin]);
        let symbol = `${coin}/USDT`;
        const ticker = tickers[symbol];
        
        if (ticker && ticker.last) {
          const valueUsdt = amount * ticker.last;
          if (valueUsdt >= 2) { // Exclude dust
            // Find cost basis
            const history = openTranches.filter(t => t.symbol === symbol || t.symbol === coin || t.symbol.startsWith(`${coin}/`));
            let entryPrice = 0;
            let pnlPercent = 0;
            
            if (history.length > 0) {
              const totalCost = history.reduce((sum, t) => sum + (Number(t.entryPrice) * Number(t.contracts)), 0);
              const totalAmount = history.reduce((sum, t) => sum + Number(t.contracts), 0);
              if (totalAmount > 0) {
                entryPrice = totalCost / totalAmount;
                pnlPercent = ((ticker.last - entryPrice) / entryPrice) * 100;
              }
            }

            activePositionsForAI.push({
              symbol: symbol,
              side: 'LONG', // Spot is always long
              entry: Number(entryPrice.toFixed(5)),
              notional: Number(valueUsdt.toFixed(2)),
              pnl: Number(pnlPercent.toFixed(2)),
              coinAmount: amount
            });
          }
        }
      }
    }
  } catch (e) {
    activePositionsForAI = [];
    openOrdersForAI = [];
    openCount = 0;
  }

  const portfolioExposure = activePositionsForAI.reduce((acc, p) => {
    const sector = getSectorForSymbol(p.symbol);
    acc[sector] = (acc[sector] || 0) + 1;
    return acc;
  }, {});

  const maxBullets = config.maxSplits || 10;
  const bulletsAvailable = Math.max(0, maxBullets - openCount);

  const candidatesForAI = candidates.slice(0, 2).map(c => ({
    symbol: c.originalSymbol || c.symbol,
    price: c.price,
    min: c.limits?.amount?.min || 0,
    score: c.score,
    reason: c.reason?.substring(0, 40)
  }));

  console.log(`[getContext] ${botConfigId} positions sent to AI: ${activePositionsForAI.length} (${activePositionsForAI.map(p => p.symbol).join(', ') || 'NONE'})`);

  return {
    config,
    marketType,
    candidates,
    fearGreed,
    btcTrend,
    portfolioExposure,
    bulletsAvailable,
    candidatesForAI,
    activePositionsForAI,
    openOrdersForAI,
    llmInfo: getLLMClient(config.User.aiApiKey, config.User.aiProvider || 'OPENAI', config.User.aiModel || 'gpt-4o', true)
  };
}

export async function callLLM(llmInfo, rules, contextPayload) {
  const { apiKey, model, provider, baseURL, headers } = llmInfo;
  const normAiProvider = (provider || 'OPENAI').trim().toUpperCase();

  if (normAiProvider === 'GEMINI') {
    const actualModel = model.replace('models/', '');
    console.log(`[callLLM] Calling Gemini API directly with model: ${actualModel}`);
    
    const isGemma = model.toLowerCase().includes('gemma');
    let finalRules = rules;
    
    if (isGemma) {
      finalRules += "\n\nCRITICAL FORMATTING RULES:\n1. Output ONLY valid JSON.\n2. NO preamble or explanations.\n3. reasoning MUST BE PLAIN TEXT.\n4. STRICT RULE: ONLY close positions listed in 'active_positions'. DO NOT close or sell coins you do not own.\n5. IF 'active_positions' IS EMPTY, YOU MUST SET 'close_positions': [].\n6. IF 'open_orders' IS EMPTY, YOU MUST SET 'cancel_orders': [].\n7. TRADES must be > 5 USDT and satisfy 'min' amount in candidates.\n8. WARNING: DO NOT ECHO INPUT DATA.";
    }

    const userPrompt = isGemma 
      ? `TASK: Analyze market data and return NEXT ACTIONS in JSON format.\nRULES:\n${finalRules}\n\nDATA TO ANALYZE:\n${JSON.stringify(contextPayload)}`
      : `Analyze the following trading environment state and formulate your next actions:\n\n${JSON.stringify(contextPayload)}`;

    const body = {
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { maxOutputTokens: 2000 }
    };

    if (!isGemma) {
      body.generationConfig.responseMimeType = "application/json";
      body.systemInstruction = { parts: [{ text: finalRules }] };
    }

    let fetchResponse;
    try {
      fetchResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${actualModel}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      const data = await fetchResponse.json();
      if (!fetchResponse.ok) throw new Error(data.error?.message || `HTTP ${fetchResponse.status}`);
      
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Invalid Gemini response format");
      return text;
    } catch (error) {
      console.error(`[callLLM] Error calling Gemini:`, error.message);
      
      if (error.message.includes('Developer instruction') || error.message.includes('INVALID_ARGUMENT')) {
        console.log(`[callLLM] Retrying without systemInstruction for ${actualModel}`);
        const retryBody = {
          contents: [{ role: 'user', parts: [{ text: `${rules}\n\nAnalyze this data:\n${JSON.stringify(contextPayload)}` }] }],
          generationConfig: { maxOutputTokens: 2000 }
        };
        const retryRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${actualModel}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(retryBody)
        });
        const retryData = await retryRes.json();
        return retryData.candidates?.[0]?.content?.parts?.[0]?.text;
      }
      throw error;
    }
  } else {
    const body = {
      model: model,
      messages: [
        { role: 'system', content: rules }, 
        { role: 'user', content: JSON.stringify(contextPayload) }
      ],
      max_tokens: 2000
    };
    if (normAiProvider !== 'GEMINI') {
      body.response_format = { type: 'json_object' };
    }

    const res = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
    return data.choices[0].message.content;
  }
}

export function cleanJson(str) {
  if (!str) return "{}";
  
  // Preliminary cleanup
  let s = String(str)
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  
  // Extract main object
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    s = s.slice(start, end + 1);
  }
  
  // Ensure keys are quoted (Fixes unintentional splits of words like 'with' and 'but')
  s = s.replace(/([{,]\s*)([A-Za-z0-9_]+)\s*(?=("|{|\[|-?\d|true|false|null))/gi, '$1"$2": ');
  s = s.replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":');

  // Fix nested quotes in string values (specifically for Gemma models)
  // Finds ': "value" ' where punctuation follows the closing quote
  s = s.replace(/:\s*"([\s\S]*?)"(?=\s*[,}\]])/g, (match, content) => {
    return `: "${content.replace(/"/g, "'")}"`;
  });

  // Final comma/whitespace cleanup
  s = s.replace(/,\s*([}\]])/g, '$1');
  s = s.replace(/\s*([{}\[\]])\s*/g, '$1');

  // Second pass for safety - re-extract JSON slice if corrupted
  const finalStart = s.indexOf('{');
  const finalEnd = s.lastIndexOf('}');
  if (finalStart !== -1 && finalEnd !== -1 && finalEnd > finalStart) {
    s = s.slice(finalStart, finalEnd + 1);
  }

  return s;
}

// Transient Storage - Zero Logging Mechanism
global.aiTransientLogs = global.aiTransientLogs || new Map();

export async function logPhase(botConfigId, step, content) {
  try {
    // Safe truncation for console log to avoid breaking multi-byte characters (like Thai)
    const safeTruncate = (str, len) => {
      if (!str || str.length <= len) return str;
      return Array.from(str).slice(0, len).join('') + '...';
    };
    
    console.log(`[AI Log] ${step}: ${safeTruncate(content, 80)}`);
    
    // Zero Logging: Store in Memory Only (Transient Only)
    if (!global.aiTransientLogs.has(botConfigId)) {
      global.aiTransientLogs.set(botConfigId, []);
    }
    const logArray = global.aiTransientLogs.get(botConfigId);
    
    logArray.unshift({
      id: crypto.randomUUID(),
      botConfigId,
      step,
      content,
      timestamp: new Date().toISOString(),
      status: 'SUCCESS'
    });
    
    // No Bloat: Keep Max 50 items
    if (logArray.length > 50) {
      logArray.pop();
    }
  } catch (err) {
    console.error(`[AI Log Error] Failed to write transient log:`, err.message);
  }
}

export function formatTradeDetails(trades, candidates, marketType) {
  return trades.map(t => {
    const c = (candidates || []).find(cand => cand.symbol === t.symbol || cand.originalSymbol === t.symbol);
    const priceStr = c?.price ? `@${c.price}` : '';
    let actionLabel = t.side === 'buy' ? 'ซื้อ' : 'ขาย';
    if (marketType === 'FUTURES' || marketType === 'MIXED') {
      actionLabel = t.side === 'buy' ? 'เปิด LONG' : 'เปิด SHORT';
    }
    return `${actionLabel} ${t.symbol} ${priceStr}`;
  }).join(', ');
}

export function formatReasoningInfo(trades, candidates, marketType) {
  return trades.map(t => {
    const c = (candidates || []).find(cand => cand.symbol === t.symbol || cand.originalSymbol === t.symbol);
    let sideLabel = t.side?.toUpperCase();
    if (marketType === 'FUTURES' || marketType === 'MIXED') {
      sideLabel = sideLabel === 'SELL' || sideLabel === 'SHORT' ? 'SHORT' : 'LONG';
    }
    const entryPrice = c?.price || 0;
    const slPrice = calculateSLPrice(entryPrice, t.side, t.stopLossPercent);
    const tpTiers = calculateTPTiers(entryPrice, t.side, t.stopLossPercent);
    const slTpStr = (entryPrice && slPrice && tpTiers?.tp1?.price) 
      ? ` SL:${slPrice.toFixed(4)} TP:${tpTiers.tp1.price.toFixed(4)}` : '';
    return `${t.symbol} (${sideLabel})${entryPrice ? ` @${entryPrice}` : ''}${slTpStr}`;
  }).join(', ');
}
