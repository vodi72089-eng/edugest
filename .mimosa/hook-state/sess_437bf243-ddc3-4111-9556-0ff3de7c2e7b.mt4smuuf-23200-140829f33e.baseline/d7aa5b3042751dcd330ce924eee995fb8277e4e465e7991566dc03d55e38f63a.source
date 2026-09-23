const { PrismaClient } = require('@prisma/client');
const path = require('path');
const p = new PrismaClient({ datasources: { db: { url: 'file:' + path.resolve(__dirname, 'prisma/db/custom.db') } } });
p.user.findUnique({ where: { email: 'admin@edugest.app' }, select: { name: true, phone: true } })
  .then(u => { console.log(u.name + ': ' + u.phone); p.$disconnect(); });
