const { PrismaClient } = require('@prisma/client');
const path = require('path');
const db = new PrismaClient({ datasources: { db: { url: 'file:' + path.resolve('prisma/db/custom.db') } } });
(async () => {
  const user = await db.user.update({ where: { id: 'cmqgovun1001piokk1zedxptt' }, data: { phone: '+243827629864' } });
  console.log('Updated:', user.name, '-> phone:', user.phone);
  await db.$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
