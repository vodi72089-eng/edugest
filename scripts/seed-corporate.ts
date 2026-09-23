/**
 * Seed démo — comptes HORS école :
 *   • Corporate « Groupe Scolaire Lumière SARL » + compte corporate@edugest.app / corporate123
 *     avec 2 écoles rattachées (Lumière Kinshasa + 2e école si dispo)
 *   • Support EduGest : support@edugest.app / support123
 * Idempotent : ne recrée pas si l'email existe déjà. DEV UNIQUEMENT.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

async function main() {
  // ── Support agent ──
  let support = await db.user.findUnique({ where: { email: 'support@edugest.app' } });
  if (!support) {
    support = await db.user.create({
      data: {
        name: 'Équipe Support EduGest',
        email: 'support@edugest.app',
        phone: '+243990000901',
        password: await bcrypt.hash('support123', 12),
        role: 'SUPPORT_AGENT',
        schoolId: null,
        isVerified: true,
      },
    });
    console.log('✅ Support agent créé : support@edugest.app / support123');
  } else {
    console.log('ℹ️ Support agent déjà présent');
  }

  // ── Corporate ──
  const corporate = await db.user.findUnique({ where: { email: 'corporate@edugest.app' } });
  if (!corporate) {
    const schools = await db.school.findMany({ orderBy: { createdAt: 'asc' }, take: 2, select: { id: true, name: true } });
    const corp = await db.corporate.create({
      data: {
        name: 'Groupe Scolaire Lumière SARL',
        contactName: 'Direction Groupe Lumière',
        contactEmail: 'direction@grouplumiere.cd',
        contactPhone: '+243990000900',
        city: 'Kinshasa',
        notes: 'Client corporate de démonstration — réseau multi-écoles.',
        schools: { create: schools.map(s => ({ schoolId: s.id })) },
        users: {
          create: {
            role: 'CORPORATE_ADMIN',
            user: {
              create: {
                name: 'M. Kabongo (Corporate)',
                email: 'corporate@edugest.app',
                phone: '+243990000900',
                password: await bcrypt.hash('corporate123', 12),
                role: 'CORPORATE_ADMIN',
                schoolId: null,
                isVerified: true,
              },
            },
          },
        },
      },
    });
    console.log(`✅ Corporate créé : corporate@edugest.app / corporate123 — ${schools.length} école(s) rattachée(s) : ${schools.map(s => s.name).join(', ')}`);
  } else {
    console.log('ℹ️ Corporate déjà présent');
  }
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
