const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  
  const userCount = await prisma.user.count();
  console.log('Users:', userCount);
  
  const schoolCount = await prisma.school.count();
  console.log('Schools:', schoolCount);
  
  const studentCount = await prisma.student.count();
  console.log('Students:', studentCount);
  
  const archivedCount = await prisma.student.count({ where: { isArchived: true } });
  console.log('Archived Students:', archivedCount);
  
  // List users
  const users = await prisma.user.findMany({ select: { id: true, phone: true, role: true, schoolId: true } });
  console.log('\nUsers:');
  users.forEach(u => console.log(`  ${u.phone} (${u.role}) - School: ${u.schoolId}`));
  
  await prisma.$disconnect();
}

main().catch(console.error);
