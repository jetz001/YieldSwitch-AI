const { PrismaClient } = require('@prisma/client');
const ccxt = require('ccxt');
const { decrypt } = require('./src/utils/crypto.js');

const prisma = new PrismaClient();

function getBitgetClient(apiKey, secret, password, isDemo = false, marketType = 'FUTURES') {
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

  if (isDemo) {
    exchange.setSandboxMode(true);
  }

  return exchange;
}

async function testBal() {
  try {
    const user = await prisma.user.findFirst({
        where: { id: 'super-admin-0001' }
      });
  
    const decryptVal = (val) => {
        if (!val) return null;
        if (val.includes(':')) return decrypt(val);
        return val;
    };

    const apiKey = decryptVal(user.bitgetDemoApiKey);
    const apiSecret = decryptVal(user.bitgetDemoApiSecret);
    const apiPass = decryptVal(user.bitgetDemoPassphrase);

    const isDemo = true;
    const spotClient = getBitgetClient(apiKey, apiSecret, apiPass, isDemo, 'SPOT');
    const futuresClient = getBitgetClient(apiKey, apiSecret, apiPass, isDemo, 'FUTURES');

    let assetsMap = {};
    let spotAssets = [];
    let futureAssets = [];

    const fetchBal = async (client, type) => {
      try {
        console.log(`Fetching ${type} balance...`);
        const bal = await client.fetchBalance({ type });
        console.log(`Fetched ${type} balance. Total coins:`, Object.keys(bal.total || {}).length);
        for (const coin in bal.total || {}) {
          const total = parseFloat(bal.total[coin] || 0);
          if (total > 0) {
            console.log(`  ${coin}: ${total}`);
            if (!assetsMap[coin]) assetsMap[coin] = { coin, total: 0, free: 0, used: 0 };
            assetsMap[coin].total += total;
            const item = { coin, total, free: parseFloat(bal.free?.[coin] || 0), used: parseFloat(bal.used?.[coin] || 0) };
            if (type === 'spot') spotAssets.push(item);
            if (type === 'swap') futureAssets.push(item);
          }
        }
      } catch (e) {
        console.error(`fetchBalance error for ${type}:`, e.message);
      }
    };

    await Promise.all([
      fetchBal(futuresClient, 'swap'),
      fetchBal(spotClient, 'spot')
    ]);

    console.log('Final Assets:', Object.keys(assetsMap).length);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

testBal();
