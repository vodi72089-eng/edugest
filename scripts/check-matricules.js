const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  
  const students = await prisma.student.findMany({ 
    select: { matricule: true }, 
    take: 10,
    orderBy: { createdAt: 'desc' }
  });
  
  console.log('Existing matricules:');
  students.forEach(s => console.log(`  ${s.matricule}`));
  
  const count = await prisma.student.count();
  console.log(`\nTotal students: ${count}`);
  
  await prisma.$disconnect();
}

main().catch(console.error);
