const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const updated = await prisma.botConfig.update({
      where: { id: 'admin-bot-001' },
      data: { 
        isActive: true, 
        marketType: 'FUTURES' 
      }
    });
    console.log('BOT UPDATED:', JSON.stringify(updated, null, 2));
  } catch (err) {
    console.error('ERROR UPDATING BOT:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
