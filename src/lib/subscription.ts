import { db } from '@/lib/db';

export const SUBSCRIPTION_PRICES: Record<string, number> = {
  FREEMIUM: 0,
  ESSENTIEL: 100,
  STANDARD: 250,
  PREMIUM: 500,
  ENTERPRISE: 1000,
  CORPORATE: 0, // Custom pricing
};

export type TierFeature =
  | 'students' | 'classes' | 'grades' | 'parents'
  | 'payments' | 'homework' | 'discipline' | 'report_cards'
  | 'communications' | 'convocations' | 'analytics' | 'multi_years'
  | 'api_access' | 'priority_support' | 'custom_branding'
  | 'medical';

export const SUBSCRIPTION_FEATURES: Record<string, TierFeature[]> = {
  FREEMIUM: ['students', 'classes', 'grades', 'payments'],
  ESSENTIEL: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline'],
  STANDARD: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline', 'report_cards', 'communications', 'convocations'],
  PREMIUM: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline', 'report_cards', 'communications', 'convocations', 'analytics', 'multi_years', 'medical', 'priority_support', 'custom_branding'],
  ENTERPRISE: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline', 'report_cards', 'communications', 'convocations', 'analytics', 'multi_years', 'medical', 'api_access', 'priority_support', 'custom_branding'],
  CORPORATE: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline', 'report_cards', 'communications', 'convocations', 'analytics', 'multi_years', 'medical', 'api_access', 'priority_support', 'custom_branding'],
};

export interface SubscriptionCheck {
  active: boolean;
  tier: string;
  expired: boolean;
  daysRemaining: number | null;
  error?: string;
}

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

/**
 * Check if a school has access to a specific feature based on its subscription tier.
 */
export function hasFeatureAccess(tier: string, feature: TierFeature): boolean {
  const features = SUBSCRIPTION_FEATURES[tier] || SUBSCRIPTION_FEATURES.FREEMIUM;
  return features.includes(feature);
}

/**
 * Les parents peuvent-ils consulter les notes selon le tier d'abonnement ?
 * Le module parents (donc l'accès aux notes côté parent) commence à ESSENTIEL.
 */
export function tierAllowsParentGrades(tier: string): boolean {
  return hasFeatureAccess(tier, 'parents');
}

// ─── Tier limits (validated with product owner) ─────────────────────────────
export interface TierLimits {
  maxStudents: number;
  maxAdmins: number;      // Direction, Secretary, Cashier, Discipline... (staff accounts)
  maxTeachers: number;
  whatsappMonthly: number;
  canConfigPayments: boolean;   // payment gateways (Orange Money, M-Pesa...)
  canManageParentAccounts: boolean;
  reportCardsToParents: boolean; // notes & bulletins visibles côté parents
  medicalAccess: boolean;       // réservé à partir de Professionnel
}

export function getTierLimits(tier: string): TierLimits {
  const limits: Record<string, TierLimits> = {
    FREEMIUM: {
      maxStudents: 100,
      maxAdmins: 1,
      maxTeachers: 0,
      whatsappMonthly: 0,
      canConfigPayments: false,
      canManageParentAccounts: false,
      reportCardsToParents: false,
      medicalAccess: false,
    },
    ESSENTIEL: {
      maxStudents: 250,
      maxAdmins: 1,
      maxTeachers: 5,
      whatsappMonthly: 500,
      canConfigPayments: false,
      canManageParentAccounts: true,
      reportCardsToParents: false,
      medicalAccess: false,
    },
    STANDARD: {
      maxStudents: 1000,
      maxAdmins: 5,
      maxTeachers: 50,
      whatsappMonthly: 1500,
      canConfigPayments: true,
      canManageParentAccounts: true,
      reportCardsToParents: true,
      medicalAccess: false,
    },
    PREMIUM: {
      maxStudents: 2500,
      maxAdmins: 9999,
      maxTeachers: 9999,
      whatsappMonthly: 5000,
      canConfigPayments: true,
      canManageParentAccounts: true,
      reportCardsToParents: true,
      medicalAccess: true,
    },
    ENTERPRISE: {
      maxStudents: 99999,
      maxAdmins: 9999,
      maxTeachers: 9999,
      whatsappMonthly: 9999999,
      canConfigPayments: true,
      canManageParentAccounts: true,
      reportCardsToParents: true,
      medicalAccess: true,
    },
    CORPORATE: {
      maxStudents: 999999,
      maxAdmins: 9999,
      maxTeachers: 9999,
      whatsappMonthly: 9999999,
      canConfigPayments: true,
      canManageParentAccounts: true,
      reportCardsToParents: true,
      medicalAccess: true,
    },
  };
  return limits[tier] || limits.FREEMIUM;
}

/**
 * @deprecated Use getTierLimits instead.
 */
export function getMaxStudentsForTier(tier: string): number {
  return getTierLimits(tier).maxStudents;
}

// ─── Enforcement helpers (called from API routes) ──────────────────────────
export const ADMIN_ROLES = ['DIRECTION','DIRECTION_MATERNELLE','DIRECTION_PRIMAIRE','DIRECTION_SECONDAIRE','SECRETARY','CASHIER','DISCIPLINE','DISCIPLINE_MATERNELLE','DISCIPLINE_PRIMAIRE','DISCIPLINE_SECONDAIRE','SCHOOL_ADMIN'];
export const TEACHER_ROLES = ['TEACHER','HEAD_TEACHER'];

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
    const current = await db.user.count({ where: { schoolId, role: { in: ADMIN_ROLES } } });
    if (current >= limits.maxAdmins) {
      return { ok: false, error: `Limite d'admins atteinte (${limits.maxAdmins} max pour ${tier}).`, limit: limits.maxAdmins, current };
    }
  }
  if (TEACHER_ROLES.includes(role)) {
    const current = await db.user.count({ where: { schoolId, role: { in: TEACHER_ROLES } } });
    if (current >= limits.maxTeachers) {
      return { ok: false, error: `Limite de professeurs atteinte (${limits.maxTeachers} max pour ${tier}).`, limit: limits.maxTeachers, current };
    }
  }
  return { ok: true };
}

export function canTierConfigPayments(tier: string): boolean {
  return getTierLimits(tier).canConfigPayments;
}

export async function getSchoolTier(schoolId: string): Promise<string> {
  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { subscriptionTier: true },
  });
  return school?.subscriptionTier || 'FREEMIUM';
}

// Ordre des tiers pour déterminer le minimum requis
const TIER_ORDER = ['FREEMIUM', 'ESSENTIEL', 'STANDARD', 'PREMIUM', 'ENTERPRISE', 'CORPORATE'];

/**
 * Retourne le tier minimum requis pour une fonctionnalité
 */
export function getMinTierForFeature(feature: string): string {
  for (const tier of TIER_ORDER) {
    if (SUBSCRIPTION_FEATURES[tier]?.includes(feature as TierFeature)) {
      return tier;
    }
  }
  return 'FREEMIUM';
}
