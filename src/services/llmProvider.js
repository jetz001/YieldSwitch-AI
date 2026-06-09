import { decrypt } from '../utils/crypto.js';

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

  let finalModel = model;
  const isGemini = normProvider === 'GEMINI' || normProvider === 'GOOGLE';

  if (isGemini) {
    const m = model.toLowerCase();
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
      finalModel = model.startsWith('models/') ? model.replace('models/', '') : model;
    }
    
    return { apiKey: decryptedKey, model: finalModel, provider: 'GEMINI' };
  }

  if (normProvider !== 'GEMINI' && (model.startsWith('gemini-') || model.startsWith('models/gemini-'))) {
    finalModel = (normProvider === 'OPENROUTER' || normProvider === 'GROQ') ? 'moonshotai/kimi-2.5' : 'gpt-4o';
  }

  let baseURL = 'https://api.openai.com/v1';
  let headers = {
    'Authorization': `Bearer ${decryptedKey}`,
    'Content-Type': 'application/json'
  };

  if (normProvider === 'OPENROUTER') {
    baseURL = 'https://openrouter.ai/api/v1';
    headers['HTTP-Referer'] = 'https://yieldswitch.ai';
    headers['X-Title'] = 'YieldSwitch AI';
  } else if (normProvider === 'GROQ') {
    baseURL = 'https://api.groq.com/openai/v1';
  }

  return { apiKey: decryptedKey, model: finalModel, provider: normProvider, baseURL, headers };
}
