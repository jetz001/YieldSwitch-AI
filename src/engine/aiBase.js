import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { getLLMClient } from '../services/llmProvider.js';
import { getBitgetClient } from '../services/bitget.js';
import { runAutoScreener, getFearAndGreedIndex, getBTCTrend, getSectorForSymbol } from './autoScreener.js';
import { calculateSLPrice, calculateTPTiers } from '../utils/priceMath.js';

const prisma = new PrismaClient();

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

  const openTranches = await prisma.activeTranche.findMany({
    where: { botConfigId, status: 'OPEN' }
  });

  const activePositionsForAI = openTranches.map(t => {
    const tpTiers = t.tpTiers ? JSON.parse(t.tpTiers) : null;
    return {
      id: t.id,
      symbol: t.symbol,
      side: t.side,
      entry: t.entryPrice,
      sl: t.stopLossPrice,
      tp: tpTiers?.tp1?.price || null
    };
  });

  let openOrdersForAI = [];
  try {
    const openOrdersRaw = await bitgetClient.fetchOpenOrders();
    openOrdersForAI = (openOrdersRaw || []).slice(0, 12).map(o => ({
      id: o.id,
      symbol: o.symbol,
      side: o.side,
      type: o.type,
      price: o.price,
      amount: o.amount,
      remaining: o.remaining,
      status: o.status
    }));
  } catch (e) {
    openOrdersForAI = [];
  }

  const portfolioExposure = openTranches.reduce((acc, t) => {
    const sector = getSectorForSymbol(t.symbol);
    acc[sector] = (acc[sector] || 0) + 1;
    return acc;
  }, {});

  const maxBullets = config.maxSplits || 10;
  const bulletsAvailable = Math.max(0, maxBullets - openTranches.length);

  const candidatesForAI = candidates.slice(0, 2).map(c => ({
    symbol: c.originalSymbol || c.symbol,
    price: c.price,
    score: c.score,
    reason: c.reason?.substring(0, 100) // Truncate reasoning
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
    const genConfig = { maxOutputTokens: 2000 };
    if (!isGemma) genConfig.responseMimeType = "application/json";

    const response = await client.models.generateContent({
      model: model,
      contents: [{ role: 'user', parts: [{ text: `${rules}\n\nCONTEXT:\n${JSON.stringify(contextPayload)}` }] }],
      config: genConfig
    });
    return response.text;
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
  return str.replace(/```json/g, '').replace(/```/g, '').trim();
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
