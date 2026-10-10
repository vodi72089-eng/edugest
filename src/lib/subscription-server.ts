/**
 * Abonnement — fonctions SERVEUR (celles qui interrogent la base).
 *
 * ISOLÉES de src/lib/subscription.ts volontairement : ce dernier est importé
 * par du code navigateur (page.tsx, useFeatureAccess, dashboards, views).
 * Importer `db` (→ Prisma → driver PG) depuis le module partagé faisait
 * atterrir le driver dans le bundle client, qui exécute `Buffer` (Node) au
 * rendu → `ReferenceError: Buffer is not defined` → page blanche en prod.
 *
 * Règle : AUCUN import de `@/lib/db` dans src/lib/subscription.ts.
 */
import { db } from '@/lib/db';
import {
  getTierLimits,
  ADMIN_ROLES,
  TEACHER_ROLES,
  type SubscriptionCheck,
} from '@/lib/subscription';

/**
 * Check if a school's subscription is active and not expired.
 * FREEMIUM schools always have access (no expiration).
 */
export async function checkSubscription(schoolId: string | null | undefined): Promise<SubscriptionCheck> {
  if (!schoolId) {
    return { active: false, tier: 'FREEMIUM', expired: false, daysRemaining: null, error: 'École introuvable' };
  }
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: {
      subscriptionTier: true,
      subscriptionStatus: true,
      subscriptionStartDate: true,
      subscriptionEndDate: true,
    },
  });

  if (!school) {
    return { active: false, tier: 'FREEMIUM', expired: false, daysRemaining: null, error: 'École introuvable' };
  }

  const tier = school.subscriptionTier || 'FREEMIUM';
  const status = school.subscriptionStatus || 'ACTIVE';

  // FREEMIUM always active (limited features but no block)
  if (tier === 'FREEMIUM') {
    return { active: true, tier, expired: false, daysRemaining: null };
  }

  // Check status field
  if (status !== 'ACTIVE') {
    return { active: false, tier, expired: true, daysRemaining: 0, error: 'Abonnement suspendu' };
  }

  // Check expiration date
  if (school.subscriptionEndDate) {
    const now = new Date();
    const endDate = new Date(school.subscriptionEndDate);

    if (endDate < now) {
      return { active: false, tier, expired: true, daysRemaining: 0, error: 'Abonnement expiré' };
    }

    const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return { active: true, tier, expired: false, daysRemaining };
  }

  // No end date set but paid tier → treat as active (legacy data)
  return { active: true, tier, expired: false, daysRemaining: null };
}

export async function checkCanCreateStudent(schoolId: string | null | undefined): Promise<{ ok: true } | { ok: false; error: string; limit: number; current: number }> {
  if (!schoolId) return { ok: true };
  const school = await db.school.findUnique({ where: { id: schoolId }, select: { subscriptionTier: true } });
  const tier = school?.subscriptionTier || 'FREEMIUM';
  const limits = getTierLimits(tier);
  const current = await db.student.count({ where: { schoolId, isArchived: false } });
  if (current >= limits.maxStudents) {
    return { ok: false, error: `Limite d'élèves atteinte (${limits.maxStudents} max pour ${tier}). Passez au forfait supérieur.`, limit: limits.maxStudents, current };
  }
  return { ok: true };
}

export async function checkCanCreateUser(schoolId: string | null | undefined, role: string): Promise<{ ok: true } | { ok: false; error: string; limit: number; current: number }> {
  if (!schoolId) return { ok: true };
  const school = await db.school.findUnique({ where: { id: schoolId }, select: { subscriptionTier: true } });
  const tier = school?.subscriptionTier || 'FREEMIUM';
  const limits = getTierLimits(tier);

  if (role === 'PARENT') return { ok: true }; // parents unlimited (or via student creation)
  if (ADMIN_ROLES.includes(role)) {
    // NOTE : le secrétaire n'est PAS compté dans le forfait (aucun niveau,
    // freemium inclus) — c'est un compte de support, pas un titulaire.
    const current = await db.user.count({ where: { schoolId, role: { in: ADMIN_ROLES, not: 'SECRETARY' } } });
    if (limits.maxAdmins >= 0 && current >= limits.maxAdmins) {
      return { ok: false, error: `Limite d'admins atteinte (${limits.maxAdmins} max pour ${tier}).`, limit: limits.maxAdmins, current };
    }
  }
  if (TEACHER_ROLES.includes(role) || role === 'EPS') {
    // EPS est traité comme un professeur partout ailleurs (matières/classes,
    // rapports) : il doit donc compter dans le quota, sinon un forfait
    // FREEMIUM (maxTeachers: 0) créait des professeurs illimités via ce rôle.
    const teacherLikeRoles = [...TEACHER_ROLES, 'EPS'];
    const current = await db.user.count({ where: { schoolId, role: { in: teacherLikeRoles } } });
    if (current >= limits.maxTeachers) {
      return { ok: false, error: `Limite de professeurs atteinte (${limits.maxTeachers} max pour ${tier}).`, limit: limits.maxTeachers, current };
    }
  }
  return { ok: true };
}

export async function getSchoolTier(schoolId: string): Promise<string> {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { subscriptionTier: true },
  });
  return school?.subscriptionTier || 'FREEMIUM';
}
