const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const config = await prisma.botConfig.findFirst();
  console.log('BOT_CONFIG:', JSON.stringify(config, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
