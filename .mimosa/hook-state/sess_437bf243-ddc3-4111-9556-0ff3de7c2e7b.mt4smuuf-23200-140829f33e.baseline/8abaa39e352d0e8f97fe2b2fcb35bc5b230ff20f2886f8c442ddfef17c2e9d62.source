const { PrismaClient } = require('@prisma/client');
const path = require('path');
const dbPath = 'file:' + path.resolve(__dirname, 'prisma/db/custom.db');
const db = new PrismaClient({ datasources: { db: { url: dbPath } } });

(async () => {
  const admin = await db.user.findUnique({ where: { email: 'admin@edugest.app' } });
  console.log('Before:', admin.name, admin.phone);
  
  await db.user.update({ where: { email: 'admin@edugest.app' }, data: { phone: '+243827629864' } });
  
  const updated = await db.user.findUnique({ where: { email: 'admin@edugest.app' } });
  console.log('After:', updated.name, updated.phone);
  
  await db.$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
