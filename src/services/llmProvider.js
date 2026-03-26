import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { decrypt } from '../utils/crypto.js';

/**
 * Initializes an LLM client with the user's decrypted API key
 */
export function getLLMClient(apiKey, provider = 'OPENAI', model = 'gpt-4o', shouldDecrypt = false) {
  const normProvider = (provider || 'OPENAI').trim().toUpperCase();

  if (!apiKey) {
    throw new Error("No AI API Key provided.");
  }
  
  const shouldAttemptDecrypt = shouldDecrypt && apiKey.includes(':');
  const decryptedKey = shouldAttemptDecrypt ? decrypt(apiKey) : apiKey;
  
  if (!decryptedKey) {
    throw new Error("AI API Key could not be processed.");
  }

  // Alignment Safety: Ensure model is compatible with provider
  let finalModel = model;
  const isGemini = normProvider === 'GEMINI' || normProvider === 'GOOGLE';

  if (isGemini) {
    const m = model.toLowerCase();
    
    // Explicit Mapping to Stable IDs (Avoiding 404-prone preview IDs)
    if (m.includes('gemma')) {
      if (m.includes('27b')) finalModel = 'gemma-3-27b-it';
      else if (m.includes('12b')) finalModel = 'gemma-3-12b-it';
      else finalModel = 'gemma-3-4b-it';
    } else if (m.includes('pro')) {
      finalModel = 'gemini-1.5-pro-latest';
    } else {
      // All other variants (3.1 flash, 2.5 flash, etc) map to 1.5-flash-latest for stability
      finalModel = 'gemini-1.5-flash-latest';
    }
    
    const client = new GoogleGenAI({ apiKey: decryptedKey });
    const fullModelName = finalModel.startsWith('models/') ? finalModel : `models/${finalModel}`;
    return { client, model: fullModelName, provider: 'GEMINI' };
  }

  if (normProvider !== 'GEMINI' && (model.startsWith('gemini-') || model.startsWith('models/gemini-'))) {
    finalModel = (normProvider === 'OPENROUTER' || normProvider === 'GROQ') ? 'moonshotai/kimi-2.5' : 'gpt-4o';
  }

  // Handle OpenAI-compatible clients (OpenAI, OpenRouter)
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
  
  return { client, model: finalModel, provider };
}
