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
      else if (m.includes('1b')) finalModel = 'gemma-3-1b-it';
      else finalModel = 'gemma-3-4b-it';
    } else if (m.includes('2.0-flash-lite')) {
      finalModel = 'gemini-2.0-flash-lite-preview-02-05';
    } else if (m.includes('2.0-flash')) {
      finalModel = 'gemini-2.0-flash-exp';
    } else if (m.includes('1.5-pro')) {
      finalModel = 'gemini-1.5-pro-latest';
    } else if (m.includes('1.5-flash-8b')) {
      finalModel = 'gemini-1.5-flash-8b-latest';
    } else if (m.includes('1.5-flash')) {
      finalModel = 'gemini-1.5-flash-latest';
    } else if (m.includes('3.1-flash-lite')) {
      finalModel = 'gemini-3.1-flash-lite-latest';
    } else {
      // Direct pass for any other specific models, or fallback to 1.5-flash
      finalModel = model.startsWith('models/') ? model.replace('models/', '') : model;
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
