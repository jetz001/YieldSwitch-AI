const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const email = 'super_admin@yieldswitch.ai';
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    console.log('User not found');
  } else {
    console.log('User found:');
    console.log('ID:', user.id);
    console.log('Email:', user.email);
    console.log('Role:', user.role);
    console.log('Status:', user.status);
    console.log('Has passwordHash:', !!user.passwordHash);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
