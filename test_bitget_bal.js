const { PrismaClient } = require('@prisma/client');
const ccxt = require('ccxt');
const { decrypt } = require('./src/utils/crypto.js');

const prisma = new PrismaClient();

async function testBal() {
  try {
    const user = await prisma.user.findFirst({
      where: { id: 'super-admin-0001' }
    });

    if (!user) {
      console.log('User not found');
      return;
    }

    const decryptVal = (val) => {
        if (!val) return null;
        if (val.includes(':')) {
            try {
                return decrypt(val);
            } catch (e) {
                return val;
            }
        }
        return val;
    };

    const apiKey = decryptVal(user.bitgetDemoApiKey);
    const apiSecret = decryptVal(user.bitgetDemoApiSecret);
    const apiPass = decryptVal(user.bitgetDemoPassphrase);

    console.log('API Key length:', apiKey?.length);
    console.log('Connecting to Bitget Demo...');

    const exchange = new ccxt.bitget({
      apiKey,
      secret: apiSecret,
      password: apiPass,
    });
    exchange.setSandboxMode(true);

    console.log('Fetching FUTURES (swap) balance...');
    const futBal = await exchange.fetchBalance({ type: 'swap' });
    console.log('Futures Total:', futBal.total);

    console.log('Fetching SPOT balance...');
    const spotBal = await exchange.fetchBalance({ type: 'spot' });
    console.log('Spot Total:', spotBal.total);

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

testBal();
