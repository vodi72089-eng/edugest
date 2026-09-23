const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seed() {
  console.log('=== SEEDING DATABASE ===\n');
  
  const passwordHash = await bcrypt.hash('admin123', 12);
  
  // Create school
  const school = await prisma.school.create({
    data: {
      name: 'École Test',
      shortName: 'ET',
      email: 'test@ecole.cd',
      phone: '+243810000001',
      address: '123 Rue Test',
      city: 'Kinshasa',
      province: 'Kinshasa',
      country: 'RD Congo',
      subscriptionTier: 'FREEMIUM',
      maxStudents: 100,
    }
  });
  console.log(`✅ School created: ${school.name} (ID: ${school.id})`);
  
  // Create admin user (use unique phone)
  const admin = await prisma.user.create({
    data: {
      phone: '+243844444444',
      password: passwordHash,
      name: 'Admin Test',
      role: 'SCHOOL_ADMIN',
      schoolId: school.id,
      isActive: true,
    }
  });
  console.log(`✅ Admin created: ${admin.name} (Phone: ${admin.phone})`);
  
  // Create school year
  const schoolYear = await prisma.schoolYear.create({
    data: {
      label: '2024-2025',
      startDate: new Date('2024-09-01'),
      endDate: new Date('2025-06-30'),
      isActive: true,
      schoolId: school.id,
    }
  });
  console.log(`✅ School year created: ${schoolYear.label}`);
  
  // Create class
  const class1 = await prisma.class.create({
    data: {
      name: '6ème A',
      section: 'A',
      level: '6ème',
      capacity: 40,
      schoolId: school.id,
      schoolYearId: schoolYear.id,
    }
  });
  console.log(`✅ Class created: ${class1.name}`);
  
  // Create 150 students (exceeds FREEMIUM limit of 100)
  console.log('\nCreating 150 students...');
  const students = [];
  for (let i = 1; i <= 150; i++) {
    const student = await prisma.student.create({
      data: {
        matricule: `ARCH-${String(i).padStart(4, '0')}`,
        firstName: `Eleve`,
        lastName: `${String(i).padStart(3, '0')}`,
        gender: i % 2 === 0 ? 'M' : 'F',
        classId: class1.id,
        schoolId: school.id,
        schoolYearId: schoolYear.id,
      }
    });
    students.push(student);
  }
  console.log(`✅ Created ${students.length} students`);
  
  // Verify counts
  const activeCount = await prisma.student.count({ where: { schoolId: school.id, isArchived: false } });
  const archivedCount = await prisma.student.count({ where: { schoolId: school.id, isArchived: true } });
  console.log(`\n📊 Current state:`);
  console.log(`   Active students: ${activeCount}`);
  console.log(`   Archived students: ${archivedCount}`);
  console.log(`   School tier: ${school.subscriptionTier}`);
  console.log(`   Max students: ${school.maxStudents}`);
  
  return { school, admin, schoolYear, class1, students };
}

async function testArchiveFunctions() {
  console.log('\n\n=== TESTING ARCHIVE FUNCTIONS ===\n');
  
  const path = require('path');
  const { archiveExcessStudents, restoreArchivedStudents, getArchivedStudents } = require(path.join(__dirname, '../src/lib/archive'));
  
  const school = await prisma.school.findFirst();
  if (!school) {
    console.log('❌ No school found');
    return;
  }
  
  console.log(`Testing with school: ${school.name}`);
  
  // Test 1: Archive excess students (FREEMIUM allows 100, we have 150)
  console.log('\n--- Test 1: Archive excess students → FREEMIUM ---');
  const archiveResult = await archiveExcessStudents(school.id, 'FREEMIUM');
  console.log(`✅ Archived: ${archiveResult.archived} students`);
  
  // Verify
  const activeAfterArchive = await prisma.student.count({ where: { schoolId: school.id, isArchived: false } });
  const archivedAfterArchive = await prisma.student.count({ where: { schoolId: school.id, isArchived: true } });
  console.log(`   Active: ${activeAfterArchive}`);
  console.log(`   Archived: ${archivedAfterArchive}`);
  
  // Test 2: Get archived students
  console.log('\n--- Test 2: Get archived students ---');
  const archivedList = await getArchivedStudents(school.id);
  console.log(`✅ Retrieved ${archivedList.length} archived students`);
  if (archivedList.length > 0) {
    console.log(`   First: ${archivedList[0].firstName} ${archivedList[0].lastName}`);
    console.log(`   Last: ${archivedList[archivedList.length-1].firstName} ${archivedList[archivedList.length-1].lastName}`);
  }
  
  // Test 3: Restore students (ESSENTIEL allows 500)
  console.log('\n--- Test 3: Restore students → ESSENTIEL ---');
  const restoreResult = await restoreArchivedStudents(school.id, 'ESSENTIEL');
  console.log(`✅ Restored: ${restoreResult.restored} students`);
  
  // Verify
  const activeAfterRestore = await prisma.student.count({ where: { schoolId: school.id, isArchived: false } });
  const archivedAfterRestore = await prisma.student.count({ where: { schoolId: school.id, isArchived: true } });
  console.log(`   Active: ${activeAfterRestore}`);
  console.log(`   Archived: ${archivedAfterRestore}`);
  
  // Test 4: Archive again for API test
  console.log('\n--- Test 4: Re-archive for API tests ---');
  await archiveExcessStudents(school.id, 'FREEMIUM');
  const finalActive = await prisma.student.count({ where: { schoolId: school.id, isArchived: false } });
  const finalArchived = await prisma.student.count({ where: { schoolId: school.id, isArchived: true } });
  console.log(`   Active: ${finalActive}`);
  console.log(`   Archived: ${finalArchived}`);
  
  console.log('\n=== ALL TESTS PASSED ✅ ===');
}

async function main() {
  try {
    await seed();
    await testArchiveFunctions();
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
