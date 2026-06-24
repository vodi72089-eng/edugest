const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.student.findMany({
  select: { id: true, firstName: true, lastName: true, photoUrl: true }
}).then(r => {
  const withPhoto = r.filter(s => s.photoUrl);
  const withoutPhoto = r.filter(s => !s.photoUrl);
  console.log(`Total: ${r.length} | Avec photo: ${withPhoto.length} | Sans photo: ${withoutPhoto.length}`);
  if (withPhoto.length > 0) {
    console.log('\nAvec photo:');
    withPhoto.forEach(s => console.log(`  ${s.firstName} ${s.lastName}: ${s.photoUrl}`));
  }
  console.log('\nSans photo (premiers 5):');
  withoutPhoto.slice(0, 5).forEach(s => console.log(`  ${s.firstName} ${s.lastName}`));
  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
