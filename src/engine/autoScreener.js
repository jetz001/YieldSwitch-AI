import { analyzeOHLCV, detectBTCTrend } from '../services/technicalData.js';

/**
 * Sector mapping for correlation guard
 * Maps common symbols to their sector category
 */
const SECTOR_MAP = {
  // Meme
  'DOGE': 'MEME', 'SHIB': 'MEME', 'PEPE': 'MEME', 'FLOKI': 'MEME', 'WIF': 'MEME', 'BONK': 'MEME', 'MEME': 'MEME', 'NEIRO': 'MEME',
  // Layer 1
  'BTC': 'L1', 'ETH': 'L1', 'SOL': 'L1', 'ADA': 'L1', 'AVAX': 'L1', 'DOT': 'L1', 'NEAR': 'L1', 'SUI': 'L1', 'APT': 'L1', 'SEI': 'L1', 'TON': 'L1', 'TRX': 'L1',
  // Layer 2
  'ARB': 'L2', 'OP': 'L2', 'MATIC': 'L2', 'STRK': 'L2', 'ZK': 'L2', 'MANTA': 'L2',
  // DeFi
  'UNI': 'DEFI', 'AAVE': 'DEFI', 'MKR': 'DEFI', 'CRV': 'DEFI', 'SUSHI': 'DEFI', 'DYDX': 'DEFI', 'LDO': 'DEFI', 'PENDLE': 'DEFI', 'JUP': 'DEFI',
  // AI
  'FET': 'AI', 'RNDR': 'AI', 'TAO': 'AI', 'WLD': 'AI', 'ARKM': 'AI', 'AI16Z': 'AI',
  // Gaming
  'AXS': 'GAMING', 'GALA': 'GAMING', 'IMX': 'GAMING', 'SAND': 'GAMING', 'MANA': 'GAMING', 'PIXEL': 'GAMING',
  // RWA
  'ONDO': 'RWA', 'MNT': 'RWA', 'POLYX': 'RWA',
};

/**
 * Resolve sector from a symbol string (e.g. "DOGE/USDT" -> "MEME")
 */
export function getSectorForSymbol(symbol) {
  const base = symbol.split('/')[0].replace(':USDT', '').toUpperCase();
  return SECTOR_MAP[base] || 'OTHER';
}

/**
 * Auto-Screener (Radar)
 * Master Prompt §2: Scan top 100 USDT pairs for volume anomalies, 
 * extreme funding rates, and technical indicator confluences.
 */
export async function runAutoScreener(exchangeClient) {
  try {
    await exchangeClient.loadMarkets();
    const markets = Object.values(exchangeClient.markets).filter(
      m => m.active && (m.symbol.includes('USDT') || m.symbol.includes('SUSDT'))
    );
    
    // Sort by something if we can, or just take first 100 for radar
    const top100 = markets.slice(0, 100);
    const candidates = [];

    for (const market of top100) {
      try {
        // Fetch enough candles for EMA200 (need 210+)
        const ohlcv = await exchangeClient.fetchOHLCV(market.symbol, '1h', undefined, 210);
        if (!ohlcv || ohlcv.length < 30) continue;

        // Run full technical analysis
        const analysis = analyzeOHLCV(ohlcv);
        if (!analysis) continue;

        // Check funding rates for Delta-Neutral Arbitrage
        let fundingRateDesc = null;
        let fundingRateValue = 0;
        if (market.future || market.swap) {
          try {
            const funding = await exchangeClient.fetchFundingRate(market.symbol);
            if (funding && Math.abs(funding.fundingRate) > 0.001) { // > 0.1%
              fundingRateValue = funding.fundingRate;
              fundingRateDesc = `${(funding.fundingRate * 100).toFixed(2)}% (Extreme Funding - Perfect for Arbitrage)`;
            }
          } catch (e) {
            // Ignore funding fetch errors
          }
        }

        // Build market structure description
        const structureParts = [];
        if (analysis.volumeAnomaly) structureParts.push(`Volume Anomaly: ${analysis.volumeRatio}x of 20-MA`);
        if (analysis.ema50Breakout) structureParts.push('EMA50 Breakout Confirmed');
        if (analysis.hasLiquiditySweepWick) structureParts.push('Liquidity Sweep Wick Detected (SMC)');
        structureParts.push(`Trend: ${analysis.trend}`);

        // Only include candidates with at least one signal
        const hasSignal = analysis.volumeAnomaly || analysis.ema50Breakout || 
                          analysis.hasLiquiditySweepWick || fundingRateDesc ||
                          (analysis.rsi14 !== null && (analysis.rsi14 < 25 || analysis.rsi14 > 75));

        if (hasSignal) {
          const lastCandle = ohlcv[ohlcv.length - 1];
          candidates.push({
            symbol: market.symbol, // Use the correct exchange symbol format
            originalSymbol: market.symbol.replace(/:USDT$/, '').replace(/:SUSDT$/, ''), // Strip settlement for AI readability
            price: lastCandle ? parseFloat(lastCandle[4].toFixed(8)) : null,
            sector: getSectorForSymbol(market.symbol),
            timeframe: '1H',
            funding_rate: fundingRateDesc || 'Neutral',
            funding_rate_value: fundingRateValue,
            market_structure: structureParts.join(' | '),
            indicators: {
              ema20: analysis.ema20 ? parseFloat(analysis.ema20.toFixed(6)) : null,
              ema50: analysis.ema50 ? parseFloat(analysis.ema50.toFixed(6)) : null,
              ema200: analysis.ema200 ? parseFloat(analysis.ema200.toFixed(6)) : null,
              rsi14: analysis.rsi14,
              atr14: analysis.atr14,
              volume_ratio: analysis.volumeRatio,
            },
            trend: analysis.trend,
          });
        }
      } catch (e) {
        // Skip symbols that fail (delisted, rate-limited, etc.)
        continue;
      }
    }

    // Sort by signal strength: volume anomalies first, then extreme RSI, then funding
    candidates.sort((a, b) => {
      const scoreA = (a.indicators.volume_ratio > 3 ? 3 : 0) + (a.indicators.rsi14 < 25 || a.indicators.rsi14 > 75 ? 2 : 0) + (a.funding_rate_value ? 1 : 0);
      const scoreB = (b.indicators.volume_ratio > 3 ? 3 : 0) + (b.indicators.rsi14 < 25 || b.indicators.rsi14 > 75 ? 2 : 0) + (b.funding_rate_value ? 1 : 0);
      return scoreB - scoreA;
    });

    return candidates;
  } catch (error) {
    console.error('AutoScreener Execution failed:', error.message);
    return [];
  }
}

/**
 * Fetch daily Fear & Greed Index
 * Master Prompt §2: News & Sentiment Oracle
 */
export async function getFearAndGreedIndex() {
  try {
    const res = await fetch('https://api.alternative.me/fng/');
    const data = await res.json();
    return parseInt(data.data[0].value, 10);
  } catch (err) {
    // Default neutral if failed
    return 50; 
  }
}

/**
 * Get BTC trend for market regime context
 * Uses detectBTCTrend from technicalData.js
 */
export async function getBTCTrend(exchangeClient) {
  return await detectBTCTrend(exchangeClient);
}
