/**
 * Technical Data Service
 * Calculates EMA, RSI, ATR locally from OHLCV data (no external paid APIs).
 * Master Prompt §2: EMA 20, 50, 200, RSI (14), ATR, 20-period Volume MA
 */

/**
 * Calculate Exponential Moving Average
 * @param {number[]} closes - Array of closing prices
 * @param {number} period - EMA period
 * @returns {number} Current EMA value
 */
export function calculateEMA(closes, period) {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  
  // Seed with SMA of first `period` values
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

/**
 * Calculate RSI (Relative Strength Index)
 * @param {number[]} closes - Array of closing prices
 * @param {number} period - RSI period (default 14)
 * @returns {number} RSI value (0-100)
 */
export function calculateRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  
  const changes = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }
  
  // Initial average gain/loss from first `period` changes
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] >= 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= period;
  avgLoss /= period;
  
  // Smooth with Wilder's method for remaining changes
  for (let i = period; i < changes.length; i++) {
    if (changes[i] >= 0) {
      avgGain = (avgGain * (period - 1) + changes[i]) / period;
      avgLoss = (avgLoss * (period - 1) + 0) / period;
    } else {
      avgGain = (avgGain * (period - 1) + 0) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(changes[i])) / period;
    }
  }
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

/**
 * Calculate Average True Range
 * @param {Array} ohlcv - Array of [timestamp, open, high, low, close, volume]
 * @param {number} period - ATR period (default 14)
 * @returns {number} ATR value
 */
export function calculateATR(ohlcv, period = 14) {
  if (ohlcv.length < period + 1) return null;
  
  const trueRanges = [];
  for (let i = 1; i < ohlcv.length; i++) {
    const high = ohlcv[i][2];
    const low = ohlcv[i][3];
    const prevClose = ohlcv[i - 1][4];
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }
  
  // Initial ATR = SMA of first `period` TRs
  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  // Smooth with Wilder's method
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }
  return atr;
}

/**
 * Calculate Volume Moving Average
 * @param {number[]} volumes - Array of volumes
 * @param {number} period - MA period (default 20)
 * @returns {number} Volume MA value
 */
export function calculateVolumeMA(volumes, period = 20) {
  if (volumes.length < period) return null;
  const recent = volumes.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / period;
}

/**
 * Full technical analysis from raw OHLCV data
 * Returns all indicators required by the Master Prompt
 * @param {Array} ohlcv - ccxt OHLCV array (need ≥201 candles for EMA200)
 * @returns {object} All indicator values
 */
export function analyzeOHLCV(ohlcv) {
  if (!ohlcv || ohlcv.length < 30) {
    return null; // Insufficient data
  }
  
  const closes = ohlcv.map(c => c[4]);
  const volumes = ohlcv.map(c => c[5]);
  const currentPrice = closes[closes.length - 1];
  const currentVolume = volumes[volumes.length - 1];
  
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);
  const rsi14 = calculateRSI(closes, 14);
  const atr14 = calculateATR(ohlcv, 14);
  const volumeMA20 = calculateVolumeMA(volumes, 20);
  
  // Detect EMA alignment for trend
  let trend = 'NEUTRAL';
  if (ema20 && ema50) {
    if (currentPrice > ema20 && ema20 > ema50) trend = 'BULLISH';
    else if (currentPrice < ema20 && ema20 < ema50) trend = 'BEARISH';
    else trend = 'CHOP';
  }
  
  // Volume anomaly check (>300% of 20-MA)
  const volumeRatio = volumeMA20 ? currentVolume / volumeMA20 : 0;
  const volumeAnomaly = volumeRatio > 3;
  
  // EMA50 breakout
  const ema50Breakout = ema50 ? (currentPrice > ema50 && closes[closes.length - 2] <= ema50) : false;
  
  // Wick analysis for SMC (Liquidity Sweep detection)
  const lastCandle = ohlcv[ohlcv.length - 1];
  const [, open, high, low, close] = lastCandle;
  const bodySize = Math.abs(close - open);
  const upperWick = high - Math.max(open, close);
  const lowerWick = Math.min(open, close) - low;
  const hasLiquiditySweepWick = (lowerWick > bodySize * 2) || (upperWick > bodySize * 2);
  
  return {
    currentPrice,
    ema20,
    ema50,
    ema200,
    rsi14: rsi14 ? parseFloat(rsi14.toFixed(2)) : null,
    atr14: atr14 ? parseFloat(atr14.toFixed(6)) : null,
    volumeMA20,
    volumeRatio: parseFloat(volumeRatio.toFixed(2)),
    volumeAnomaly,
    ema50Breakout,
    hasLiquiditySweepWick,
    trend,
  };
}

/**
 * Detect BTC market trend (used for market_regime context)
 * @param {object} exchangeClient - ccxt client
 * @returns {string} 'BULLISH' | 'BEARISH' | 'CHOP'
 */
export async function detectBTCTrend(exchangeClient) {
  try {
    const ohlcv = await exchangeClient.fetchOHLCV('BTC/USDT', '1h', undefined, 210);
    if (!ohlcv || ohlcv.length < 50) return 'NEUTRAL';
    
    const analysis = analyzeOHLCV(ohlcv);
    return analysis ? analysis.trend : 'NEUTRAL';
  } catch (error) {
    console.error('[TechnicalData] BTC trend detection failed:', error.message);
    return 'NEUTRAL';
  }
}
