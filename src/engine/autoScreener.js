import ccxt from 'ccxt';

/**
 * Auto-Screener (Radar)
 * Scans top USDT pairs every 15-60 mins for volume anomalies or extreme funding.
 */
export async function runAutoScreener(exchangeClient) {
  try {
    await exchangeClient.loadMarkets();
    const markets = Object.values(exchangeClient.markets).filter(m => m.active && m.symbol.endsWith('/USDT:USDT') === false && m.symbol.includes('USDT'));
    
    // Sort by something if we can, or just take first 100 for radar
    const top100 = markets.slice(0, 100);
    const candidates = [];

    // Note: In production we'd fetch OHLCV in parallel with rate limits handling
    for (const market of top100) {
      // Fetch OHLCV to determine volume anomaly
      // 15m or 1H candle Volume > 300% of 20-period Volume MA + Price breaks EMA 50
      const ohlcv = await exchangeClient.fetchOHLCV(market.symbol, '1h', undefined, 21);
      if (!ohlcv || ohlcv.length < 21) continue;

      const volumes = ohlcv.map(c => c[5]);
      const currentVol = volumes[volumes.length - 1];
      const previous20Vols = volumes.slice(0, 20);
      const vol20MA = previous20Vols.reduce((a, b) => a + b, 0) / 20;

      let anomaly = null;
      if (currentVol > vol20MA * 3) {
        anomaly = `Volume Anomaly: >300% of 20-MA (${currentVol} vs ${vol20MA.toFixed(2)})`;
      }

      // Check funding rates for Delta-Neutral Arbitrage
      let fundingRateDesc = null;
      if (market.future || market.swap) {
        try {
          const funding = await exchangeClient.fetchFundingRate(market.symbol);
          if (funding && Math.abs(funding.fundingRate) > 0.001) { // > 0.1%
            fundingRateDesc = `${(funding.fundingRate * 100).toFixed(2)}% (Extreme Funding - Perfect for Arbitrage)`;
          }
        } catch (e) {
          // Ignore
        }
      }

      if (anomaly || fundingRateDesc) {
        candidates.push({
          symbol: market.symbol,
          timeframe: '1H',
          funding_rate: fundingRateDesc || 'Neutral',
          market_structure: anomaly ? `Breakout logic triggered: ${anomaly}` : 'Ranging',
        });
      }
    }

    return candidates;
  } catch (error) {
    console.error('AutoScreener Execution failed:', error);
    return [];
  }
}

/**
 * Fetch daily Fear & Greed Index
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
