const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const bots = await prisma.botConfig.findMany({
      include: { User: { select: { email: true } } }
    });
    console.log('ALL BOTS:', JSON.stringify(bots, null, 2));
  } catch (err) {
    console.error('ERROR FETCHING BOTS:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
