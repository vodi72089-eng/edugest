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
  | 'parent_grades'   // Les parents recoivent/consultent notes & bulletins (STANDARD+)
  | 'mobile_app'      // App mobile dediee (Professionnel+)
  | 'multi_school';   // Multi-ecoles (Enterprise+)

export const SUBSCRIPTION_FEATURES: Record<string, TierFeature[]> = {
  FREEMIUM: ['students', 'classes', 'grades', 'payments'],
  // Essentiel : tout Freemium avec des limites plus longues, MAIS les parents
  // ne recoivent pas les notes/bulletins (reserve au Standard et plus).
  ESSENTIEL: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline'],
  STANDARD: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline', 'report_cards', 'communications', 'convocations', 'parent_grades'],
  PREMIUM: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline', 'report_cards', 'communications', 'convocations', 'analytics', 'multi_years', 'parent_grades', 'mobile_app', 'priority_support', 'custom_branding'],
  ENTERPRISE: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline', 'report_cards', 'communications', 'convocations', 'analytics', 'multi_years', 'parent_grades', 'mobile_app', 'priority_support', 'custom_branding', 'api_access', 'multi_school'],
  CORPORATE: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline', 'report_cards', 'communications', 'convocations', 'analytics', 'multi_years', 'parent_grades', 'mobile_app', 'priority_support', 'custom_branding', 'api_access', 'multi_school'],
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

// ─── Tier limits (specification produit) ────────────────────────────────────
// Convention : -1 = illimite
export interface TierLimits {
  maxStudents: number;
  maxAdmins: number;      // Direction, Secretary, Cashier, Discipline... (staff accounts)
  maxTeachers: number;
  whatsappMonthly: number; // -1 = illimite (Enterprise/Corporate ou API perso)
  canConfigPayments: boolean;   // payment gateways (Orange Money, M-Pesa...)
  canManageParentAccounts: boolean;
  parentGradesAccess: boolean;  // les parents voient/recoivent notes & bulletins
  canUseCustomWhatsappApi: boolean; // peut brancher sa propre API WhatsApp (Meta)
  maxSchools: number;           // multi-ecoles (-1 = illimite)
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
      parentGradesAccess: false,
      canUseCustomWhatsappApi: false,
      maxSchools: 1,
    },
    // Essentiel : 1 admin, 5 professeurs, 250 eleves, comptes parents,
    // 500 msgs WhatsApp/mois - SANS notes/bulletins aux parents.
    ESSENTIEL: {
      maxStudents: 250,
      maxAdmins: 1,
      maxTeachers: 5,
      whatsappMonthly: 500,
      canConfigPayments: false,
      canManageParentAccounts: true,
      parentGradesAccess: false,
      canUseCustomWhatsappApi: false,
      maxSchools: 1,
    },
    // Standard : 5 admins (secretaire, admin ecole, caissier, direction,
    // direction de discipline), notes & bulletins aux parents,
    // 1000 eleves et 1500 msgs WhatsApp/mois.
    STANDARD: {
      maxStudents: 1000,
      maxAdmins: 5,
      maxTeachers: 25,
      whatsappMonthly: 1500,
      canConfigPayments: true,
      canManageParentAccounts: true,
      parentGradesAccess: true,
      canUseCustomWhatsappApi: true,
      maxSchools: 1,
    },
    // Professionnel : admins illimites, profs illimites, app mobile dediee,
    // support prioritaire, personnalisation de l'app, 2500 eleves,
    // 5000 msgs WhatsApp/mois.
    PREMIUM: {
      maxStudents: 2500,
      maxAdmins: -1,
      maxTeachers: -1,
      whatsappMonthly: 5000,
      canConfigPayments: true,
      canManageParentAccounts: true,
      parentGradesAccess: true,
      canUseCustomWhatsappApi: true,
      maxSchools: 1,
    },
    // Enterprise : multi-ecoles (3 incluses), serveur dedie, formation equipe,
    // SLA garanti, 9999 admins, 99999 eleves (total ecoles confondues),
    // WhatsApp illimite.
    ENTERPRISE: {
      maxStudents: 99999,
      maxAdmins: 9999,
      maxTeachers: 9999,
      whatsappMonthly: -1,
      canConfigPayments: true,
      canManageParentAccounts: true,
      parentGradesAccess: true,
      canUseCustomWhatsappApi: true,
      maxSchools: 3,
    },
    // Corporate : groupes scolaires, sur mesure, tout illimite
    // (admins, eleves, ecoles), on-premise, marque blanche, integration sur mesure.
    CORPORATE: {
      maxStudents: -1,
      maxAdmins: -1,
      maxTeachers: -1,
      whatsappMonthly: -1,
      canConfigPayments: true,
      canManageParentAccounts: true,
      parentGradesAccess: true,
      canUseCustomWhatsappApi: true,
      maxSchools: -1,
    },
  };
  return limits[tier] || limits.FREEMIUM;
}

/**
 * Les parents de cette ecole peuvent-ils consulter/recevoir notes & bulletins ?
 * (a partir du Standard uniquement - pas en Freemium/Essentiel)
 */
export function tierAllowsParentGrades(tier: string): boolean {
  return getTierLimits(tier).parentGradesAccess;
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
  if (limits.maxStudents >= 0 && current >= limits.maxStudents) {
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
    if (limits.maxAdmins >= 0 && current >= limits.maxAdmins) {
      return { ok: false, error: `Limite d'admins atteinte (${limits.maxAdmins} max pour ${tier}).`, limit: limits.maxAdmins, current };
    }
  }
  if (TEACHER_ROLES.includes(role)) {
    const current = await db.user.count({ where: { schoolId, role: { in: TEACHER_ROLES } } });
    if (limits.maxTeachers >= 0 && current >= limits.maxTeachers) {
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
