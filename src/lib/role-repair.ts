import { db } from '@/lib/db';
import { notify } from '@/lib/notify';
import bcrypt from 'bcryptjs';

/**
 * Réparation structurelle des rôles administratifs.
 *
 * Invariants de la plateforme :
 *   1. SUPER_ADMIN_GLOBAL = admin de la PLATEFORME → schoolId = null,
 *      jamais l'admin d'une école en particulier.
 *   2. Chaque école doit avoir AU MOINS un SCHOOL_ADMIN actif (admin d'école).
 *      Les écoles créées via l'API reçoivent leur admin à la création ; les
 *      bases anciennes (seed antérieur à l'introduction des admins d'école)
 *      peuvent en manquer — l'admin plateforme apparaissait alors comme
 *      « admin de l'école » à leur place.
 *
 * La réparation est IDEMPOTENTE : sans effet sur une base déjà conforme.
 * Elle est appelée à la connexion d'un SUPER_ADMIN_GLOBAL (chemin garanti)
 * de façon non bloquante pour la connexion.
 */

const DEFAULT_ADMIN_PASSWORD = 'admin123'; // identique au seed de démonstration

/** Slug technique pour dériver un email d'admin d'école. */
function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'ecole';
}

/** Téléphone unique aléatoire (champ obligatoire + unique en base). */
async function randomUniquePhone(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const candidate = `+2439${Math.floor(10000000 + Math.random() * 89999999)}`;
    const clash = await db.user.findUnique({ where: { phone: candidate }, select: { id: true } });
    if (!clash) return candidate;
  }
  return `+2439${Date.now()}`.slice(0, 15); // filet de sécurité (quasi impossible)
}

export interface RoleRepairResult {
  superAdminsDetached: number;
  adminsCreated: Array<{ schoolName: string; email: string; password: string }>;
}

export async function repairPlatformAdminIntegrity(): Promise<RoleRepairResult> {
  const result: RoleRepairResult = { superAdminsDetached: 0, adminsCreated: [] };

  // ── 1. L'admin plateforme n'appartient à aucune école ──────────────────────
  const detached = await db.user.updateMany({
    where: { role: 'SUPER_ADMIN_GLOBAL', schoolId: { not: null } },
    data: { schoolId: null },
  });
  result.superAdminsDetached = detached.count;

  // ── 2. Chaque école a besoin d'un admin d'école (SCHOOL_ADMIN) ─────────────
  // Écoles ne comptant AUCUN SCHOOL_ADMIN actif.
  const schools = await db.school.findMany({
    select: {
      id: true, name: true, shortName: true,
      _count: { select: { users: { where: { role: 'SCHOOL_ADMIN', isActive: true } } } },
    },
  });

  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
  for (const school of schools) {
    if (school._count.users > 0) continue;

    // Email déterministe admin@<slug>.cd — suffixé si collision.
    const base = `admin@${slugify(school.shortName || school.name)}.cd`;
    let email = base;
    for (let i = 2; i < 6; i++) {
      const clash = await db.user.findUnique({ where: { email }, select: { id: true } });
      if (!clash) break;
      email = base.replace(/\.cd$/, `-${i}.cd`);
    }
    const clash = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (clash) email = `admin-${Date.now()}@${slugify(school.shortName || school.name)}.cd`;

    const phone = await randomUniquePhone();
    const adminName = `Directeur ${school.shortName || school.name}`;
    try {
      const created = await db.user.create({
        data: {
          name: adminName,
          email,
          phone,
          password: passwordHash,
          role: 'SCHOOL_ADMIN',
          schoolId: school.id,
        },
        select: { id: true, email: true },
      });

      result.adminsCreated.push({ schoolName: school.name, email: created.email || email, password: DEFAULT_ADMIN_PASSWORD });

      // Informer les admins plateforme (ils voient la réparation faite).
      const platformAdmins = await db.user.findMany({
        where: { role: 'SUPER_ADMIN_GLOBAL', isActive: true },
        select: { id: true },
      });
      for (const pa of platformAdmins) {
        await notify({
          data: {
            userId: pa.id,
            schoolId: null,
            type: 'SYSTEM',
            title: 'Administrateur d\u2019école créé',
            message: `« ${school.name} » n'avait aucun administrateur. Compte créé : ${created.email || email} — mot de passe provisoire : ${DEFAULT_ADMIN_PASSWORD} (à changer).`,
          },
        }).catch(() => {});
      }
    } catch (e) {
      console.error('[role-repair] création admin école échouée :', (e as Error)?.message);
    }
  }

  if (result.superAdminsDetached > 0 || result.adminsCreated.length > 0) {
    console.log('[role-repair] appliqué :', JSON.stringify(result));
  }
  return result;
}
