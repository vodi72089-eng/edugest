/**
 * Abonnement — constantes et logique PURE (safe navigateur).
 *
 * ⚠️ NE JAMAIS importer `@/lib/db` (ni Prisma, ni le driver PG) dans ce
 * fichier : il est importé depuis le bundle client (page.tsx,
 * useFeatureAccess, dashboards, views). Un tel import embarquait `pg` dans
 * le navigateur, qui exécute `Buffer` → `ReferenceError: Buffer is not
 * defined` → page blanche en production.
 *
 * Les fonctions qui interrogent la base sont dans ./subscription-server.
 */
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
  | 'medical' | 'PARENT_GRADES';

export const SUBSCRIPTION_FEATURES: Record<string, TierFeature[]> = {
  FREEMIUM: ['students', 'classes', 'grades', 'payments'],
  ESSENTIEL: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline', 'PARENT_GRADES'],
  STANDARD: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline', 'report_cards', 'communications', 'convocations', 'PARENT_GRADES'],
  PREMIUM: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline', 'report_cards', 'communications', 'convocations', 'analytics', 'multi_years', 'medical', 'priority_support', 'custom_branding', 'PARENT_GRADES'],
  ENTERPRISE: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline', 'report_cards', 'communications', 'convocations', 'analytics', 'multi_years', 'medical', 'api_access', 'priority_support', 'custom_branding', 'PARENT_GRADES'],
  CORPORATE: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline', 'report_cards', 'communications', 'convocations', 'analytics', 'multi_years', 'medical', 'api_access', 'priority_support', 'custom_branding', 'PARENT_GRADES'],
};

export interface SubscriptionCheck {
  active: boolean;
  tier: string;
  expired: boolean;
  daysRemaining: number | null;
  error?: string;
}

/**
 * Check if a school has access to a specific feature based on its subscription tier.
 */
export function hasFeatureAccess(tier: string, feature: TierFeature): boolean {
  const features = SUBSCRIPTION_FEATURES[tier] || SUBSCRIPTION_FEATURES.FREEMIUM;
  return features.includes(feature);
}

/**
 * Les parents peuvent-ils consulter/recevoir notes & bulletins ?
 * À partir du STANDARD uniquement (pas en Freemium/Essentiel).
 */
export function tierAllowsParentGrades(tier: string): boolean {
  return getTierLimits(tier).reportCardsToParents;
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
  canUseCustomWhatsappApi: boolean; // API WhatsApp perso (BYO) — Professionnel+
  maxPhotos: number;            // Galerie photo publique (Corporate = illimité)
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
      canUseCustomWhatsappApi: false,
      maxPhotos: 1,
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
      canUseCustomWhatsappApi: false,
      maxPhotos: 5,
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
      canUseCustomWhatsappApi: false,
      maxPhotos: 10,
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
      canUseCustomWhatsappApi: true,
      maxPhotos: 25,
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
      canUseCustomWhatsappApi: true,
      maxPhotos: 40,
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
      canUseCustomWhatsappApi: true,
      maxPhotos: 999999,
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

export function canTierConfigPayments(tier: string): boolean {
  return getTierLimits(tier).canConfigPayments;
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
