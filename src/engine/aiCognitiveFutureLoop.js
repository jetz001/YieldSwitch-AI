import { getContext, callLLM, cleanJson, logPhase, formatTradeDetails, formatReasoningInfo } from './aiBase.js';

export async function runCognitiveFutureLoop(botConfigId) {
  const context = await getContext(botConfigId, 'FUTURES');
  if (!context) return null;

  const { config, candidates, bulletsAvailable, candidatesForAI, portfolioExposure, fearGreed, btcTrend, llmInfo } = context;

  await logPhase(botConfigId, 'PLAN', `[1. PLAN] 🧠 ตรวจสอบตลาด (FUTURES): ค้นหาโอกาสในตลาดฟิวเจอร์ส (Long/Short)`);

  const rules = `
    You are an Elite Futures Quant. Strictly respond in valid JSON.
    MISSION: ${config.aiDirectives || "Profit with safety."}
    
    === FUTURES MARKET RULES ===
    - You MUST identify both LONG and SHORT opportunities.
    - Terminology: Use 'buy' for LONG and 'sell' for SHORT.
    - Leverage is applied automatically based on stopLossPercent.
    - Mandatory: You MUST provide stopLossPercent. TP targets are calculated automatically.
    - Max Bullets: ${bulletsAvailable}.
    
    === JSON OUTPUT ===
    {
      "strategy": "DELTA_NEUTRAL|SMC_SWEEP|VOLUME_BREAKOUT|DIRECTIONAL",
      "confidence": 0-100,
      "reasoning": "ภาษาไทยสั้นๆ อธิบายเหตุผลให้ User",
      "trades": [{
        "symbol": "BTC/USDT",
        "side": "buy|sell",
        "amount": 500,
        "strategy": "DIRECTIONAL",
        "confidence": 85,
        "stopLossPercent": 3.5,
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

  const implementDetails = formatTradeDetails(aiOutput.trades || [], candidates, 'FUTURES');
  await logPhase(botConfigId, 'IMPLEMENT', `[2. IMPLEMENT] ⚙️ กำลังประยุกต์ใช้แผน (FUTURES): ${implementDetails || aiOutput.strategy} (${aiOutput.confidence || 0}%)`);

  if (aiOutput.reasoning) {
    const extra = formatReasoningInfo(aiOutput.trades || [], candidates, 'FUTURES');
    await logPhase(botConfigId, 'PLAN', `[AI REASONING] ${aiOutput.reasoning}${extra ? ` -> แผน: ${extra}` : ''}`);
  }

  const trades = aiOutput.trades || [];
  const tradeSymbols = trades.map(t => t.symbol).join(', ');
  const logMsg = trades.length > 0
    ? `[3. TASK CHECK] 📋 เตรียมส่งคำสั่งเทรดจำนวน ${trades.length} รายการ (${tradeSymbols})`
    : `[3. TASK CHECK] 📋 ไม่พบโอกาสในการเทรดในรอบนี้`;
  
  await logPhase(botConfigId, 'TASK_CHECK', logMsg);

  return { status: 'SUCCESS', aiTasks: aiOutput, candidates };
}
