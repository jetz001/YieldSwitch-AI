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

async function main() {
  try {
    const user = await prisma.user.findFirst({
      where: { email: 'super_admin@yieldswitch.ai' }
    });

    const apiKey = decrypt(user.bitgetDemoApiKey);
    const secret = decrypt(user.bitgetDemoApiSecret);
    const password = decrypt(user.bitgetDemoPassphrase);

    const exchange = new ccxt.bitget({
        apiKey: apiKey,
        secret: secret,
        password: password,
        enableRateLimit: true,
        options: { 'defaultType': 'swap' }
    });
    exchange.setSandboxMode(true);

    console.log('Connecting to Bitget Demo (Swap Mode)...');
    await exchange.loadMarkets();

    // Force BGB/USDT
    const symbol = 'BGB/USDT'; 
    const amount = 50; 
    
    console.log(`Targeting Symbol: ${symbol}`);
    await exchange.loadMarkets();
    
    // Get current price
    const ticker = await exchange.fetchTicker(symbol);
    const price = ticker.last;
    
    // Calculate TP/SL for simulation (Even though we can't send them to Exchange for Spot)
    const slPrice = price * 0.98; 
    const tpPrice = price * 1.05; 
    
    console.log(`Current Price: ${price}`);
    console.log(`Placing MARKET BUY on SPOT for ${amount} USDT worth of ${symbol}...`);
    
    // Bitget SPOT MARKET BUY: 
    // In CCXT, for Bitget spot market buy, 'amount' is the amount of QUOTE currency (USDT) to spend
    const order = await exchange.createOrder(symbol, 'market', 'buy', amount, undefined, {
        'createMarketBuyOrderRequiresPrice': false
    });

    console.log('✅ ORDER SUCCESSFUL!');
    console.log('Order ID:', order.id);
    console.log(`Note: This is a SPOT order. TP (${tpPrice.toFixed(4)}) and SL (${slPrice.toFixed(4)}) will be handled by the Bot's MathGuard.`);
    
    console.log(`\n✅ วางคำสั่ง Long (Spot) สำหรับ ${symbol} เรียบร้อยแล้วครับ!`);
    
  } catch (err) {
    console.error('ERROR PLACING ORDER:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();