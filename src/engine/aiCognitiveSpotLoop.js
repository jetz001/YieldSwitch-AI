import { getContext, callLLM, cleanJson, logPhase, formatTradeDetails, formatReasoningInfo } from './aiBase.js';

export async function runCognitiveSpotLoop(botConfigId) {
  const context = await getContext(botConfigId, 'SPOT');
  if (!context) return null;

  const { config, candidates, bulletsAvailable, candidatesForAI, portfolioExposure, fearGreed, btcTrend, llmInfo } = context;

  await logPhase(botConfigId, 'PLAN', `[1. PLAN] 🧠 ตรวจสอบตลาด (SPOT): ค้นหาโอกาสในตลาดสปอต`);

  const rules = `
    You are an Elite Spot Trader. Strictly respond in valid JSON.
    MISSION: ${config.aiDirectives || "Profit with safety."}
    
    === SPOT MARKET RULES ===
    - NO SHORTING/SELLING allowed. Only 'BUY' (Long) positions.
    - Strategy: DEEP_VALUE, DIRECTIONAL, or VOLUME_BREAKOUT.
    - Max Bullets: ${bulletsAvailable}.
    - Sector diversification: Max 2 positions per sector.
    
    === JSON OUTPUT ===
    {
      "strategy": "DEEP_VALUE|DIRECTIONAL|VOLUME_BREAKOUT",
      "confidence": 0-100,
      "reasoning": "ภาษาไทยสั้นๆ",
      "trades": [{
        "symbol": "BTC/USDT",
        "side": "buy",
        "amount": 500,
        "strategy": "DIRECTIONAL",
        "confidence": 85,
        "stopLossPercent": 5,
        "sector": "L1"
      }]
    }
  `;

  const contextPayload = {
    trading_env: { bullets: bulletsAvailable, budget: config.allocatedPortfolioUsdt },
    mkt_regime: { btc_trend: btcTrend, fng: fearGreed },
    portfolio: portfolioExposure,
    candidates: candidatesForAI
  };

  const raw = await callLLM(llmInfo, rules, contextPayload);
  const aiOutput = JSON.parse(cleanJson(raw));

  const implementDetails = formatTradeDetails(aiOutput.trades || [], candidates, 'SPOT');
  await logPhase(botConfigId, 'IMPLEMENT', `[2. IMPLEMENT] ⚙️ กำลังประยุกต์ใช้แผน (SPOT): ${implementDetails || aiOutput.strategy} (${aiOutput.confidence || 0}%)`);

  if (aiOutput.reasoning) {
    const extra = formatReasoningInfo(aiOutput.trades || [], candidates, 'SPOT');
    await logPhase(botConfigId, 'PLAN', `[AI REASONING] ${aiOutput.reasoning}${extra ? ` -> แผน: ${extra}` : ''}`);
  }

  const trades = aiOutput.trades || [];
  const tradeSymbols = trades.map(t => t.symbol).join(', ');
  const logMsg = trades.length > 0
    ? `[3. TASK CHECK] 📋 เตรียมส่งคำสั่งซื้อจำนวน ${trades.length} รายการ (${tradeSymbols})`
    : `[3. TASK CHECK] 📋 ไม่พบโอกาสในการเทรดในรอบนี้`;
  
  await logPhase(botConfigId, 'TASK_CHECK', logMsg);

  return { status: 'SUCCESS', aiTasks: aiOutput, candidates };
}
