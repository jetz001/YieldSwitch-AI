/**
 * Price Math Utility for YieldSwitch AI
 * Calculations for Stop Loss and Take Profit Tiers
 */

export function calculateSLPrice(entryPrice, side, stopLossPercent) {
  if (!entryPrice || !stopLossPercent) return null;
  const isLong = side?.toUpperCase() === 'BUY' || side?.toUpperCase() === 'LONG';
  const riskAmount = entryPrice * (stopLossPercent / 100);
  return isLong ? entryPrice - riskAmount : entryPrice + riskAmount;
}

export function calculateTPTiers(entryPrice, side, stopLossPercent) {
  if (!entryPrice || !stopLossPercent) return null;
  const isLong = side?.toUpperCase() === 'BUY' || side?.toUpperCase() === 'LONG';
  const riskAmount = entryPrice * (stopLossPercent / 100);

  // Targets based on Risk/Reward ratios: 1:1, 1:2, 1:3
  return {
    tp1: { 
      price: isLong ? entryPrice + riskAmount : entryPrice - riskAmount, 
      reached: false 
    },
    tp2: { 
      price: isLong ? entryPrice + (2 * riskAmount) : entryPrice - (2 * riskAmount), 
      reached: false 
    },
    tp3: { 
      price: isLong ? entryPrice + (3 * riskAmount) : entryPrice - (3 * riskAmount), 
      reached: false 
    }
  };
}
