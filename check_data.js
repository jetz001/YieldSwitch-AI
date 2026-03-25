const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  const bots = await prisma.botConfig.findMany();
  const tranches = await prisma.activeTranche.findMany();
  const logs = await prisma.aILogStream.findMany();

  console.log('--- Database Stats ---');
  console.log('Users:', users.length);
  users.forEach(u => console.log(` - ${u.email} (ID: ${u.id})`));
  console.log('BotConfigs:', bots.length);
  console.log('ActiveTranches:', tranches.length);
  console.log('AILogStreams:', logs.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
