import ccxt from 'ccxt';
import { decrypt } from '../utils/crypto.js';

/**
 * Initializes CCXT client with the user's decrypted API keys for a specific exchange
 */
export function getExchangeClient(exchangeId, encryptedApiKey, encryptedSecret, encryptedPassphrase, isDemo = false, marketType = 'FUTURES') {
  const safeExchangeId = String(exchangeId || 'bitget').toLowerCase();
  
  if (!safeExchangeId) throw new Error("Exchange ID must be provided.");
  if (!encryptedApiKey || !encryptedSecret) {
    throw new Error(`Incomplete ${safeExchangeId.toUpperCase()} API credentials provided.`);
  }

  const shouldDecrypt = (val) => val && val.includes(':');
  
  const apiKey = shouldDecrypt(encryptedApiKey) ? decrypt(encryptedApiKey) : encryptedApiKey;
  const secret = shouldDecrypt(encryptedSecret) ? decrypt(encryptedSecret) : encryptedSecret;
  const password = encryptedPassphrase ? (shouldDecrypt(encryptedPassphrase) ? decrypt(encryptedPassphrase) : encryptedPassphrase) : undefined;

  if (!apiKey || !secret) {
    throw new Error(`${exchangeId.toUpperCase()} API credentials could not be processed.`);
  }

  const ccxtExchangeClass = ccxt[safeExchangeId];
  if (!ccxtExchangeClass) {
    throw new Error(`Exchange ${safeExchangeId} is not supported by CCXT.`);
  }

  const exchangeConfig = {
    apiKey: apiKey,
    secret: secret,
    enableRateLimit: true,
    options: {
      'defaultType': marketType?.toLowerCase() === 'spot' ? 'spot' : 'swap',
      'createMarketBuyOrderRequiresPrice': false,
      'recvWindow': 10000,
      'adjustForTimeDifference': true,
    }
  };

  if (password) {
    exchangeConfig.password = password;
  }

  const exchange = new ccxtExchangeClass(exchangeConfig);

  // Use CCXT's native sandbox mode for Demo
  if (isDemo) {
    try {
      exchange.setSandboxMode(true);
    } catch (e) {
      console.warn(`[ExchangeFactory] ${safeExchangeId} does not support sandbox mode via CCXT.`);
    }
  }

  return exchange;
}

// For backwards compatibility or quick calls
export function getBitgetClient(encryptedApiKey, encryptedSecret, encryptedPassphrase, isDemo = false, marketType = 'FUTURES') {
  return getExchangeClient('bitget', encryptedApiKey, encryptedSecret, encryptedPassphrase, isDemo, marketType);
}
