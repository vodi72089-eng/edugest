/**
 * EduGest — Seed déterministe du SUPER_ADMIN_GLOBAL pour les tests CI.
 *
 * Pourquoi ce script : /api/seed (GET) est interdit en production, le serveur
 * de CI tourne en production, et la résolution des chemins SQLite relatifs
 * diffère entre CLI (prisma/), dev (prisma/) et standalone (.next/standalone/)
 * — le seed HTTP n'était donc jamais garanti en CI. Ce script écrit le compte
 * SAG directement dans la base pointée par DATABASE_URL (chemin ABSOLU dans
 * le workflow → le même fichier que celui lu par le serveur).
 *
 * Idempotent : ré-exécutable sans erreur (upsert logique).
 * Usage : DATABASE_URL="file:/chemin/absolu/custom.db" node seed-sag.mjs
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();
const EMAIL = 'admin@edugest.app';
const PASSWORD = 'admin123';

async function main() {
  const existing = await db.user.findUnique({ where: { email: EMAIL } });
  if (existing) {
    console.log(`✔ SAG déjà présent (${EMAIL}) — ${await db.user.count()} utilisateurs au total`);
    return;
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // Le modèle User exige schoolId (FK) : rattaché à l'école démo comme le
  // seed officiel de l'application (src/app/api/seed/route.ts).
  let school = await db.school.findFirst({ where: { email: 'info@lumiere.cd' } });
  if (!school) {
    school = await db.school.create({
      data: {
        name: 'Complexe Scolaire Lumière',
        shortName: 'CSL',
        email: 'info@lumiere.cd',
        phone: '+243810000000',
        address: '45 Ave de la Libération',
        city: 'Kinshasa',
        province: 'Kinshasa',
        country: 'RD Congo',
      },
    });
    console.log('✔ École démo créée :', school.name);
  }

  await db.user.create({
    data: {
      name: 'Admin Global',
      email: EMAIL,
      phone: '+243810000001',
      password: passwordHash,
      role: 'SUPER_ADMIN_GLOBAL',
      schoolId: school.id,
      isActive: true,
      isVerified: true,
    },
  });
  console.log(`✔ SAG créé (${EMAIL} / ${PASSWORD}) — ${await db.user.count()} utilisateurs au total`);
}

main()
  .catch((e) => {
    console.error('⛔ Seed impossible :', e.message);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
