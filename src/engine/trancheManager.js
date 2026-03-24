/**
 * Tranche Manager
 * Calculates splits / bullets based on exchange limits
 */
export async function calculateTranches(exchangeClient, symbol, allocatedBudget, config) {
  try {
    await exchangeClient.loadMarkets();
    const market = exchangeClient.markets[symbol];

    if (!market) {
      throw new Error(`Symbol ${symbol} not found on exchange`);
    }

    const minCost = market.limits?.cost?.min || 5.0; // Assume $5 min if not specified
    let targetSplits = config.maxSplits;

    let idealBulletSize = allocatedBudget / targetSplits;

    if (idealBulletSize < minCost) {
      targetSplits = Math.floor(allocatedBudget / minCost);
      if (targetSplits < config.minSplits) {
        throw new Error(`Allocated budget too small for minimum splits. Need at least ${config.minSplits * minCost}`);
      }
      idealBulletSize = minCost;
    }

    return {
      tranches: targetSplits,
      bulletSizeUsdt: idealBulletSize
    };
  } catch (error) {
    console.error('Tranche Calculation Error:', error);
    throw error;
  }
}
