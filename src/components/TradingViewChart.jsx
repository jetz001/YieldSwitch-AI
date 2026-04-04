'use client';

import React, { useEffect, useRef, memo } from 'react';

const TradingViewChart = ({ symbol = 'BINANCE:BTCUSDT', height = 450 }) => {
  const container = useRef();

  useEffect(() => {
    // Clean up old script if any
    const existingScript = document.getElementById('tradingview-widget-script');
    if (existingScript) {
      existingScript.remove();
    }

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.id = 'tradingview-widget-script';
    
    // Normalize symbol for TradingView (Standard CCXT/Exchange formats to TV formats)
    let tvSymbol = symbol;
    if (!tvSymbol.includes(':')) {
       // Default to BINANCE if no exchange is provided
       tvSymbol = `BINANCE:${tvSymbol.replace('/', '').replace(':USDT', 'USDT')}`;
    }

    script.innerHTML = JSON.stringify({
      "autosize": true,
      "symbol": tvSymbol,
      "interval": "D",
      "timezone": "Etc/UTC",
      "theme": "dark",
      "style": "1",
      "locale": "en",
      "enable_publishing": false,
      "allow_symbol_change": true,
      "calendar": false,
      "support_host": "https://www.tradingview.com",
      "hide_top_toolbar": false,
      "save_image": false,
      "container_id": "tradingview_chart_container"
    });

    if (container.current) {
      container.current.innerHTML = ''; // Clear container
      const widgetDiv = document.createElement('div');
      widgetDiv.id = 'tradingview_chart_container';
      widgetDiv.style.height = '100%';
      widgetDiv.style.width = '100%';
      container.current.appendChild(widgetDiv);
      container.current.appendChild(script);
    }

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [symbol]);

  return (
    <div className="tradingview-widget-container" ref={container} style={{ height: `${height}px`, width: '100%' }}>
      <div className="tradingview-widget-container__widget" style={{ height: '100%', width: '100%' }}></div>
    </div>
  );
};

export default memo(TradingViewChart);
