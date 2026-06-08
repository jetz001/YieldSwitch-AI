// Stubbed for Cloudflare Pages (Edge Runtime) compatibility
// In a real scenario, replace with fetch-based REST API calls since ccxt is not supported.

export function getExchangeClient(exchangeId, encryptedApiKey, encryptedSecret, encryptedPassphrase, isDemo = false, marketType = 'FUTURES') {
  console.log(`[ExchangeFactory] Stubbed initialization for ${exchangeId}`);
  return {
    fetchTicker: async () => ({ last: 0 }),
    fetchBalance: async () => ({ total: { USDT: 0 } }),
    createMarketBuyOrder: async () => ({ id: crypto.randomUUID() }),
    createMarketSellOrder: async () => ({ id: crypto.randomUUID() }),
    fetchPositions: async () => ([]),
  };
}

export function getBitgetClient(encryptedApiKey, encryptedSecret, encryptedPassphrase, isDemo = false, marketType = 'FUTURES') {
  return getExchangeClient('bitget', encryptedApiKey, encryptedSecret, encryptedPassphrase, isDemo, marketType);
}
