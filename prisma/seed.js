const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = 'super_admin@yieldswitch.ai';
  const password = 'YieldSwitchAdmin2026!';
  const hashedPassword = await bcrypt.hash(password, 10);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash: hashedPassword,
      role: 'ADMIN',
      status: 'ACTIVE'
    },
    create: {
      id: 'super-admin-0001',
      email,
      passwordHash: hashedPassword,
      role: 'ADMIN',
      status: 'ACTIVE',
      hasAcceptedTerms: true,
      hasAcceptedCookies: true,
      consentDate: new Date(),
      lastActive: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    }
  });

  console.log({ admin });

  // Create default BotConfig for Admin
  const botConfig = await prisma.botConfig.upsert({
    where: { id: 'admin-bot-001' },
    update: {},
    create: {
      id: 'admin-bot-001',
      userId: admin.id,
      allocatedPortfolioUsdt: 50000,
      paperBalanceUsdt: 100000,
      targetProfitUsdt: 15000,
      isActive: true,
      isPaperTrading: true
    }
  });

  console.log({ botConfig });
  console.log('Admin account and BotConfig created/updated.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
