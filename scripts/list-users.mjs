import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const users = await p.user.findMany({ select: { email: true, role: true, schoolId: true, isActive: true }, orderBy: { email: 'asc' } });
for (const u of users) console.log([u.email, u.role, u.schoolId ?? '-', u.isActive ? '1' : '0'].join(' | '));
await p.$disconnect();
