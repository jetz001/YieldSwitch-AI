const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log('--- Users ---');
  users.forEach(u => console.log(`${u.email} - ID: ${u.id}`));

  const botConfigs = await prisma.botConfig.findMany();
  console.log('--- BotConfigs ---');
  botConfigs.forEach(bc => console.log(`User: ${bc.userId} - ID: ${bc.id}`));

  const tranches = await prisma.activeTranche.findMany();
  console.log('--- ActiveTranches ---');
  tranches.forEach(at => console.log(`Bot: ${at.botConfigId} - Symbol: ${at.symbol}`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
