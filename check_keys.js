const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const user = await prisma.user.findFirst({
      where: { email: 'super_admin@yieldswitch.ai' }
    });
    console.log('USER KEYS:', JSON.stringify({
      apiKey: user.bitgetDemoApiKey ? 'PRESENT' : 'MISSING',
      apiSecret: user.bitgetDemoApiSecret ? 'PRESENT' : 'MISSING',
      passphrase: user.bitgetDemoPassphrase ? 'PRESENT' : 'MISSING'
    }, null, 2));
    
    // Output full keys to a temporary file if needed, but I'll use them directly in the next step
    // Actually, I'll just write the full script in the next step using the keys I find.
  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
