/**
 * Crée les comptes de test pour chaque forfait d'abonnement EduGest.
 * Exécuter : node scripts/seed-tier-accounts.js
 *
 * Produit :
 *  - 3 écoles manquantes (ESSENTIEL, ENTERPRISE, CORPORATE) + admin chacune
 *  - mot de passe uniforme `admin123` pour les 9 admins d'école
 *  - élèves de test (120 pour l'école ESSENTIEL afin de tester
 *    l'archivage automatique lors d'un downgrade vers FREEMIUM)
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const db = new PrismaClient();

const TIERS = ['FREEMIUM', 'ESSENTIEL', 'STANDARD', 'PREMIUM', 'ENTERPRISE', 'CORPORATE'];

const NEW_SCHOOLS = [
  {
    key: 'essentiel', name: 'Institut Essentiel Démo', shortName: 'IED',
    email: 'admin@essentiel.cd', tier: 'ESSENTIEL', students: 120,
    city: 'Lubumbashi', province: 'Haut-Katanga',
  },
  {
    key: 'enterprise', name: 'Académie Enterprise Démo', shortName: 'AED',
    email: 'admin@enterprise.cd', tier: 'ENTERPRISE', students: 10,
    city: 'Goma', province: 'Nord-Kivu',
  },
  {
    key: 'corporate', name: 'Groupe Corporate Démo', shortName: 'GCD',
    email: 'admin@corporate.cd', tier: 'CORPORATE', students: 10,
    city: 'Kinshasa', province: 'Kinshasa',
  },
];

async function ensureSchoolYear(schoolId) {
  const existing = await db.schoolYear.findFirst({ where: { schoolId } });
  if (existing) return existing;
  return db.schoolYear.create({
    data: { label: '2025-2026', startDate: new Date('2025-09-01'), endDate: new Date('2026-07-15'), schoolId },
  });
}

async function createDemoSchool(spec, passwordHash, phoneIndex) {
  let school = await db.school.findFirst({ where: { email: spec.email } });
  if (!school) {
    school = await db.school.create({
      data: {
        name: spec.name,
        shortName: spec.shortName,
        email: spec.email,
        phone: `+24397${String(100000 + phoneIndex).slice(-6)}`,
        address: 'Avenue de la Démo 1',
        city: spec.city,
        province: spec.province,
        country: 'RDC',
        schoolType: 'MIXTE',
        schoolCategory: 'PRIVEE',
        educationalSystem: 'RDC',
        maxStudents: 10000,
        subscriptionTier: spec.tier,
        subscriptionStatus: 'ACTIVE',
        subscriptionStartDate: new Date(),
        subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        isActive: true,
      },
    });
    console.log(`✓ École créée : ${school.name} (${spec.tier})`);
  } else {
    console.log(`• École déjà présente : ${school.name} (${spec.tier})`);
  }

  // Admin d'école
  const admin = await db.user.findUnique({ where: { email: spec.email } });
  if (!admin) {
    await db.user.create({
      data: {
        email: spec.email,
        phone: `+24398${String(200000 + phoneIndex).slice(-6)}`,
        password: passwordHash,
        name: `Admin ${spec.shortName}`,
        role: 'SCHOOL_ADMIN',
        schoolId: school.id,
        isActive: true,
        isVerified: true,
      },
    });
    console.log(`  ✓ Admin créé : ${spec.email} / admin123`);
  } else {
    await db.user.update({ where: { id: admin.id }, data: { password: passwordHash, isActive: true } });
    console.log(`  • Admin déjà présent (mot de passe réinitialisé) : ${spec.email} / admin123`);
  }

  // Élèves de démonstration (pour tester l'archivage au downgrade)
  const activeCount = await db.student.count({ where: { schoolId: school.id, isArchived: false } });
  if (activeCount < spec.students) {
    const year = await ensureSchoolYear(school.id);
    let cls = await db.class.findFirst({ where: { schoolId: school.id } });
    if (!cls) {
      cls = await db.class.create({
        data: { name: `${spec.shortName} 1A`, level: 'SECONDAIRE', capacity: 300, schoolId: school.id, schoolYearId: year.id },
      });
    }
    const toCreate = spec.students - activeCount;
    const existingMats = new Set(
      (await db.student.findMany({ where: { schoolId: school.id }, select: { matricule: true } })).map(s => s.matricule)
    );
    const data = [];
    for (let i = 0; i < toCreate; i++) {
      let mat = `DEM${school.id.slice(-4).toUpperCase()}${String(i + activeCount + 1).padStart(4, '0')}`;
      while (existingMats.has(mat)) mat = 'X' + mat.slice(1);
      existingMats.add(mat);
      data.push({
        matricule: mat,
        firstName: `Élève${(i + activeCount + 1)}`,
        lastName: spec.shortName,
        gender: i % 2 === 0 ? 'M' : 'F',
        classId: cls.id,
        schoolId: school.id,
        schoolYearId: year.id,
      });
    }
    await db.student.createMany({ data });
    console.log(`  ✓ ${toCreate} élèves créés (total actif : ${spec.students})`);
  } else {
    console.log(`  • Élèves déjà présents : ${activeCount}`);
  }
}

async function main() {
  const passwordHash = await bcrypt.hash('admin123', 10);

  // 1. Nouvelles écoles manquantes
  for (let i = 0; i < NEW_SCHOOLS.length; i++) {
    await createDemoSchool(NEW_SCHOOLS[i], passwordHash, i + 1);
  }

  // 2. Uniformiser le mot de passe des admins existants (seed) sur admin123
  const existingAdmins = await db.user.findMany({
    where: { role: 'SCHOOL_ADMIN', email: { in: ['admin@lumiere.cd', 'admin@mwanzo.cd', 'admin@dakar.cd', 'admin@abidjan.cd', 'admin@brazza.cd', 'admin@kivu.cd'] } },
  });
  for (const a of existingAdmins) {
    await db.user.update({ where: { id: a.id }, data: { password: passwordHash, isActive: true } });
    console.log(`• Mot de passe réinitialisé : ${a.email} / admin123`);
  }

  // 3. Récapitulatif
  const schools = await db.school.findMany({
    select: { name: true, subscriptionTier: true, _count: { select: { students: true } } },
    orderBy: { createdAt: 'asc' },
  });
  console.log('\n═══ RÉCAPITULATIF FORFAITS ═══');
  for (const t of TIERS) {
    const s = schools.filter(x => x.subscriptionTier === t);
    for (const x of s) {
      console.log(`${t.padEnd(11)} | ${x.name.padEnd(30)} | ${x._count.students} élèves | admin : admin@${x.name.includes('Lumière') ? 'lumiere.cd' : x.name.includes('Mwanzo') ? 'mwanzo.cd' : x.name.includes('Dakar') ? 'dakar.cd' : x.name.includes('Abidjan') ? 'abidjan.cd' : x.name.includes('Brazza') ? 'brazza.cd' : x.name.includes('Kivu') ? 'kivu.cd' : x.name.includes('Essentiel') ? 'essentiel.cd' : x.name.includes('Enterprise') ? 'enterprise.cd' : 'corporate.cd'} / admin123`);
    }
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
