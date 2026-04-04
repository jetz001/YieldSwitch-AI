'use client';

export function getChartUrl(symbol, marketType = 'SPOT') {
  if (!symbol) return '#';
  
  // Normalize symbol: remove colons, slashes, etc.
  // Input examples: "BTC/USDT", "ETH/USDT:USDT", "DOGE"
  const cleanSymbol = symbol.split(':')[0].replace('/', '').toUpperCase();
  const isFutures = symbol.includes(':') || marketType === 'FUTURES';
  
  if (isFutures) {
    // Bitget Futures URL
    const coin = cleanSymbol.replace('USDT', '');
    return `https://www.bitget.com/futures/usdt/${coin}USDT`;
  }
  
  // Bitget Spot URL
  const coin = cleanSymbol.includes('USDT') ? cleanSymbol : `${cleanSymbol}USDT`;
  return `https://www.bitget.com/spot/${coin}`;
}

export default function CoinLink({ symbol, marketType, children, className = "" }) {
  const url = getChartUrl(symbol, marketType);
  return (
    <a 
      href={url} 
      target="_blank" 
      rel="noopener noreferrer"
      className={`hover:text-teal-400 hover:underline decoration-teal-500/50 underline-offset-4 transition-all ${className}`}
    >
      {children}
    </a>
  );
}
