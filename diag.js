const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkData() {
  try {
    const users = await prisma.user.findMany({
      include: { BotConfig: true }
    });
    
    console.log('--- DATABASE DIAGNOSTIC ---');
    users.forEach(u => {
      console.log(`User ID: ${u.id}, Email: ${u.email}`);
      console.log(`  Live Keys: ${!!u.bitgetApiKey}`);
      console.log(`  Demo Keys: ${!!u.bitgetDemoApiKey}`);
      u.BotConfig.forEach(c => {
        console.log(`    Bot ID: ${c.id}, isPaperTrading: ${c.isPaperTrading}, isActive: ${c.isActive}`);
        console.log(`    Market Type: ${c.marketType}, Paper Balance: ${c.paperBalanceUsdt}`);
      });
    });
    console.log('---------------------------');
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();
