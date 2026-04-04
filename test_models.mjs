import { GoogleGenAI } from '@google/genai';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const configs = await prisma.botConfig.findMany({ include: { User: true } });
  const keyStr = configs[0]?.User?.aiApiKey;
  if (!keyStr) { console.log('No key'); process.exit(0); }
  
  // decrypt simple logic if available, or just assume it's unencrypted for now
  // since I'm running in module, let's just use the raw key or require decrypt manually
  const API_KEY = process.env.GEMINI_API_KEY || keyStr.split(':')[1] || keyStr; // assuming format
  // Wait, I can just import decrypt from the crypto module if I know the path.
  // Actually, I can use a simpler approach:
}
