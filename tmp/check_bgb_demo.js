const { PrismaClient } = require('@prisma/client');
const ccxt = require('ccxt');
const crypto = require('crypto');
const prisma = new PrismaClient();

// Crypto Utils
const ALGORITHM = 'aes-256-gcm';
const keyEnv = "C83vlt5Gxh45uph9ZbCCGHwJ9QXtLPf3bmqDvh/Clgo=";
const ENCRYPTION_KEY = Buffer.from(keyEnv, 'base64');

function decrypt(hash) {
  if (!hash || !hash.includes(':')) return hash;
  try {
    const parts = hash.split(':');
    if (parts.length !== 3) return hash;
    const [ivHex, authTagHex, encryptedText] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    return hash;
  }
}

async function checkMarkets() {
  try {
    const user = await prisma.user.findFirst({
      where: { email: 'super_admin@yieldswitch.ai' }
    });

    const apiKey = decrypt(user.bitgetDemoApiKey);
    const secret = decrypt(user.bitgetDemoApiSecret);
    const password = decrypt(user.bitgetDemoPassphrase);

    console.log('--- Checking Bitget DEMO (Sandbox) Markets ---\n');

    // 1. Check SPOT Markets
    const spotExchange = new ccxt.bitget({
        apiKey: apiKey, secret: secret, password: password,
        options: { 'defaultType': 'spot' }
    });
    spotExchange.setSandboxMode(true);
    await spotExchange.loadMarkets();
    
    const bgbSpot = Object.keys(spotExchange.markets).filter(m => m.includes('BGB'));
    console.log('📍 SPOT Markets containing "BGB":');
    console.log(bgbSpot.length > 0 ? bgbSpot : 'None found');
    console.log('');

    // 2. Check SWAP (Futures) Markets
    const swapExchange = new ccxt.bitget({
        apiKey: apiKey, secret: secret, password: password,
        options: { 'defaultType': 'swap' }
    });
    swapExchange.setSandboxMode(true);
    await swapExchange.loadMarkets();
    
    const bgbSwap = Object.keys(swapExchange.markets).filter(m => m.includes('BGB'));
    console.log('📍 SWAP (Futures) Markets containing "BGB":');
    console.log(bgbSwap.length > 0 ? bgbSwap : 'None found');
    
    if (bgbSwap.length === 0) {
        console.log('\n❌ สรุป: ในโหมด Demo ของ Bitget ไม่มีเหรียญ BGB ในตลาด Futures ครับ');
    } else {
        console.log('\n✅ สรุป: พบเหรียญ BGB ในตลาด Futures ของโหมด Demo ครับ');
    }

  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkMarkets();