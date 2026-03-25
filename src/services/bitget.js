import ccxt from 'ccxt';
import { decrypt } from '../utils/crypto';

/**
 * Initializes CCXT Bitget client with the user's decrypted API keys
 */
export function getBitgetClient(encryptedApiKey, encryptedSecret, encryptedPassphrase, isDemo = false, marketType = 'FUTURES') {
  if (!encryptedApiKey || !encryptedSecret || !encryptedPassphrase) {
    throw new Error("Incomplete Bitget API credentials provided.");
  }

  const shouldDecrypt = (val) => val && val.includes(':');
  
  const apiKey = shouldDecrypt(encryptedApiKey) ? decrypt(encryptedApiKey) : encryptedApiKey;
  const secret = shouldDecrypt(encryptedSecret) ? decrypt(encryptedSecret) : encryptedSecret;
  const password = shouldDecrypt(encryptedPassphrase) ? decrypt(encryptedPassphrase) : encryptedPassphrase;

  if (!apiKey || !secret || !password) {
    throw new Error("Bitget API credentials could not be processed.");
  }

  const exchange = new ccxt.bitget({
    apiKey: apiKey,
    secret: secret,
    password: password,
    enableRateLimit: true,
    options: {
      'defaultType': marketType?.toLowerCase() === 'spot' ? 'spot' : 'swap',
      'createMarketBuyOrderRequiresPrice': false,
      'recvWindow': 10000,
      'adjustForTimeDifference': true,
    }
  });

  // Use CCXT's native sandbox mode for Demo — this switches
  // the base URL to Bitget's demo endpoint and sets paptrading headers automatically
  if (isDemo) {
    exchange.setSandboxMode(true);
  }

  return exchange;
}
