import { prisma } from '../lib/db.js';
import { randomUUID } from 'crypto';
import { getLLMClient } from '../services/llmProvider.js';
import { getBitgetClient } from '../services/bitget.js';
import { runAutoScreener, getFearAndGreedIndex, getBTCTrend, getSectorForSymbol } from './autoScreener.js';
import { calculateSLPrice, calculateTPTiers } from '../utils/priceMath.js';

export async function getContext(botConfigId, marketType) {
  const config = await prisma.botConfig.findUnique({ 
    where: { id: botConfigId }, 
    include: { User: true } 
  });
  
  if (!config || !config.isActive) return null;

  let bitgetClient;
  if (config.isPaperTrading && config.User.bitgetDemoApiKey) {
    bitgetClient = getBitgetClient(config.User.bitgetDemoApiKey, config.User.bitgetDemoApiSecret, config.User.bitgetDemoPassphrase, true, marketType);
  } else {
    bitgetClient = getBitgetClient(config.User.bitgetApiKey, config.User.bitgetApiSecret, config.User.bitgetPassphrase, false, marketType);
  }

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
  const { client, model, provider } = llmInfo;
  const normAiProvider = (provider || 'OPENAI').trim().toUpperCase();

  if (normAiProvider === 'GEMINI') {
    const isGemma = model.toLowerCase().includes('gemma');
    
    // ดึงรหัส Model จาก API Vault มาใช้ตรงๆโดยไม่บังคับ Lock แล้ว
    const actualModel = model.replace('models/', '');
    
    console.log(`[callLLM] Calling Gemini API directly with model: ${actualModel}`);
    
    // Determine if we should use systemInstruction or merge into prompt
    // Gemma 1B/27B and some older models do not support developer_instruction
    const supportsSystemInstruction = !isGemma;

    try {
      const configObj = { maxOutputTokens: 2000 };
      let finalRules = rules;
      
      if (!isGemma) {
        configObj.responseMimeType = "application/json";
        configObj.systemInstruction = { parts: [{ text: finalRules }] };
      } else {
        // Gemma 1B/27B needs extra guidance since JSON mode is off
        finalRules += "\n\nCRITICAL FORMATTING RULES:\n1. Output ONLY valid JSON.\n2. NO preamble or explanations.\n3. reasoning MUST BE PLAIN TEXT (forbidden chars: double-quotes/colons).\n4. IF 'active_positions' IS EMPTY, YOU MUST SET 'close_positions': []. DO NOT HALLUCINATE POSITIONS.\n5. IF 'open_orders' IS EMPTY, YOU MUST SET 'cancel_orders': [].\n6. TRADES must be > 5 USDT and satisfy 'min' amount in candidates.\n7. WARNING: DO NOT ECHO INPUT DATA.";
      }
      
      const userPrompt = isGemma 
        ? `TASK: Analyze market data and return NEXT ACTIONS in JSON format.\nRULES:\n${finalRules}\n\nDATA TO ANALYZE:\n${JSON.stringify(contextPayload)}`
        : `Analyze the following trading environment state and formulate your next actions:\n\n${JSON.stringify(contextPayload)}`;

      const response = await client.models.generateContent({
        model: actualModel,
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        config: configObj
      });
      
      console.log(`[callLLM] Response length: ${response.text?.length || 0}`);
      
      return response.text;
    } catch (error) {
      console.error(`[callLLM] Error calling Gemini:`, error.message);
      
      // If we hit the developer instruction error, retry once by merging into prompt
      if (error.message.includes('Developer instruction') || error.message.includes('INVALID_ARGUMENT')) {
        console.log(`[callLLM] Retrying without systemInstruction for ${actualModel}`);
        try {
          const retryResponse = await client.models.generateContent({
            model: actualModel,
            contents: [{ role: 'user', parts: [{ text: `${rules}\n\nAnalyze this data:\n${JSON.stringify(contextPayload)}` }] }],
            config: { maxOutputTokens: 2000 }
          });
          return retryResponse.text;
        } catch (retryErr) {
          console.error(`[callLLM] Retry failed:`, retryErr.message);
        }
      }

      if (isGemma || error.message.includes('429') || error.message.includes('Quota')) {
        console.log(`[callLLM] Global Fallback: trying gemini-2.0-flash-lite`);
        try {
          const fallbackResponse = await client.models.generateContent({
            model: 'gemini-2.0-flash-lite',
            contents: [{ role: 'user', parts: [{ text: `Analyze the following trading environment state:\n\n${JSON.stringify(contextPayload)}` }] }],
            config: { maxOutputTokens: 2000, responseMimeType: "application/json", systemInstruction: rules }
          });
          return fallbackResponse.text;
        } catch (fallbackError) {
          console.error(`[callLLM] Global Fallback also failed:`, fallbackError.message);
          throw error;
        }
      }
      throw error;
    }
  } else {
    const completionOptions = {
      model: model,
      messages: [{ role: 'system', content: rules }, { role: 'user', content: JSON.stringify(contextPayload) }],
      max_tokens: 2000
    };
    if (normAiProvider !== 'GEMINI') completionOptions.response_format = { type: 'json_object' };
    const response = await client.chat.completions.create(completionOptions);
    return response.choices[0].message.content;
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
  
  // Ensure keys are quoted
  s = s.replace(/([{,]\s*)([A-Za-z0-9_]+)\s*(?=("|{|\[|-?\d|t|f|null))/g, '$1"$2": ');
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

export async function logPhase(botConfigId, step, content) {
  try {
    // Safe truncation for console log to avoid breaking multi-byte characters (like Thai)
    const safeTruncate = (str, len) => {
      if (!str || str.length <= len) return str;
      return Array.from(str).slice(0, len).join('') + '...';
    };
    
    console.log(`[AI Log] ${step}: ${safeTruncate(content, 80)}`);
    await prisma.aILogStream.create({
      data: {
        id: randomUUID(),
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
