const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  
  const users = await prisma.user.findMany({ 
    select: { phone: true, role: true },
    take: 20
  });
  
  console.log('Existing users:');
  users.forEach(u => console.log(`  ${u.phone} (${u.role})`));
  
  await prisma.$disconnect();
}

main().catch(console.error);
