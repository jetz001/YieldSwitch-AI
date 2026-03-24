import ccxt from 'ccxt';
import { decrypt } from '../utils/crypto';

/**
 * Initializes CCXT Bitget client with the user's decrypted API keys
 */
export function getBitgetClient(encryptedApiKey, encryptedSecret, encryptedPassphrase, isDemo = false) {
  if (!encryptedApiKey || !encryptedSecret || !encryptedPassphrase) {
    throw new Error("Incomplete Bitget API credentials provided.");
  }

  const apiKey = decrypt(encryptedApiKey);
  const secret = decrypt(encryptedSecret);
  const password = decrypt(encryptedPassphrase);

  if (!apiKey || !secret || !password) {
    throw new Error("Failed to decrypt Bitget API credentials.");
  }

  const options = {
    defaultType: 'swap', // V2 uses 'swap' for futures
    'createMarketBuyOrderRequiresPrice': false,
    'recvWindow': 10000
  };

  if (isDemo) {
    options['headers'] = { 'paptrading': '1' };
  }

  return new ccxt.bitget({
    apiKey: apiKey,
    secret: secret,
    password: password,
    enableRateLimit: true,
    options: options
  });
}
