import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const school = await p.school.findFirst({ where: { name: 'QA Test School' } });
if (!school) { console.log('no school'); await p.$disconnect(); process.exit(0); }
const id = school.id;
console.log('cleaning', id);

async function tryDel(label, fn) {
  try { const n = await fn(); if (n > 0) console.log(' ', label, n); return true; }
  catch (e) { console.log(' ', label, 'blocked'); return false; }
}

// multiple passes: children of children
for (let pass = 0; pass < 4; pass++) {
  await tryDel('student', () => p.student.deleteMany({ where: { schoolId: id } }).then(r => r.count));
  await tryDel('class', () => p['class'].deleteMany({ where: { schoolId: id } }).then(r => r.count));
  await tryDel('schoolYear', () => p.schoolYear.deleteMany({ where: { schoolId: id } }).then(r => r.count));
  await tryDel('subject', () => p.subject.deleteMany({ where: { schoolId: id } }).then(r => r.count));
  await tryDel('homework', () => p.homework.deleteMany({ where: { schoolId: id } }).then(r => r.count));
  await tryDel('paymentRecord', () => p.paymentRecord.deleteMany({ where: { schoolId: id } }).then(r => r.count));
  await tryDel('communication', () => p.communication.deleteMany({ where: { schoolId: id } }).then(r => r.count));
  await tryDel('schoolComment', () => p.schoolComment.deleteMany({ where: { schoolId: id } }).then(r => r.count));
  try { await p.school.delete({ where: { id } }); console.log('SCHOOL DELETED'); break; }
  catch (e) { console.log('pass', pass, 'school delete blocked'); }
}
const gone = await p.school.findFirst({ where: { name: 'QA Test School' } });
console.log('remaining:', gone ? 'STILL THERE' : 'gone');
await p.$disconnect();
