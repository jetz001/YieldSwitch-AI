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

    // Check SWAP (Futures) Markets detail
    const swapExchange = new ccxt.bitget({
        apiKey: apiKey, secret: secret, password: password,
        options: { 'defaultType': 'swap' }
    });
    swapExchange.setSandboxMode(true);
    await swapExchange.loadMarkets();
    
    const symbol = 'BGB/USDT';
    const market = swapExchange.market(symbol);
    console.log(`\n--- Market Detail for ${symbol} in SWAP mode ---`);
    console.log(JSON.stringify(market, null, 2));

  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkMarkets();