import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const p = new PrismaClient();
const hash = bcrypt.hashSync('admin123', 10);
const users = await p.user.findMany({ select: { id: true, email: true } });
for (const u of users) {
  await p.user.update({ where: { id: u.id }, data: { password: hash } });
  console.log('reset', u.email);
}
console.log('done', users.length);
await p.$disconnect();
