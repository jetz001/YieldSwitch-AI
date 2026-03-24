import OpenAI from 'openai';
import { decrypt } from '../utils/crypto';

/**
 * Initializes an LLM client with the user's decrypted API key
 */
export function getLLMClient(apiKey, provider = 'OPENAI', model = 'gpt-4o', shouldDecrypt = false) {
  if (!apiKey) {
    throw new Error("No AI API Key provided.");
  }
  
  const decryptedKey = shouldDecrypt ? decrypt(apiKey) : apiKey;
  if (!decryptedKey) {
    throw new Error("Failed to decrypt AI API Key.");
  }

  const config = {
    apiKey: decryptedKey,
  };

  if (provider === 'OPENROUTER') {
    config.baseURL = "https://openrouter.ai/api/v1";
    config.defaultHeaders = {
      "HTTP-Referer": "https://yieldswitch.ai", // Required by OpenRouter
      "X-Title": "YieldSwitch AI",
    };
  }

  const client = new OpenAI(config);
  
  // Return an object that includes the client and the chosen model
  return { client, model };
}
