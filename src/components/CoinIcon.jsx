'use client';

import { useState } from 'react';

export default function CoinIcon({ symbol, size = 16, className = "" }) {
  // Extract coin from symbol (e.g., BTC/USDT -> btc, BTCUSDT -> btc, BTC:USDT -> btc)
  const coin = symbol ? symbol.split(/[/:]/)[0].toLowerCase() : '';
  const [error, setError] = useState(false);

  if (!coin || error) {
    return (
      <div 
        style={{ width: size, height: size }}
        className={`bg-slate-700/50 rounded-full flex items-center justify-center text-[8px] font-bold text-slate-400 border border-slate-600/30 ${className}`}
      >
        {coin ? coin.charAt(0).toUpperCase() : '?'}
      </div>
    );
  }

  return (
    <img
      src={`https://assets.coincap.io/assets/icons/${coin}@2x.png`}
      alt={coin}
      width={size}
      height={size}
      className={`rounded-full object-contain bg-white/5 ${className}`}
      onError={() => setError(true)}
    />
  );
}
