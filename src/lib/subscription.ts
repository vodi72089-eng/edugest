import { db } from '@/lib/db';

export const SUBSCRIPTION_PRICES: Record<string, number> = {
  FREEMIUM: 0,
  ESSENTIEL: 100,
  STANDARD: 250,
  PREMIUM: 500,
  ENTERPRISE: 1000,
  CORPORATE: 0, // Custom pricing
};

export const SUBSCRIPTION_FEATURES: Record<string, string[]> = {
  FREEMIUM: ['students', 'classes', 'grades', 'parents'],
  ESSENTIEL: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline'],
  STANDARD: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline', 'report_cards', 'communications', 'convocations'],
  PREMIUM: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline', 'report_cards', 'communications', 'convocations', 'analytics', 'multi_years'],
  ENTERPRISE: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline', 'report_cards', 'communications', 'convocations', 'analytics', 'multi_years', 'api_access', 'priority_support', 'custom_branding'],
  CORPORATE: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline', 'report_cards', 'communications', 'convocations', 'analytics', 'multi_years', 'api_access', 'priority_support', 'custom_branding'],
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
export async function checkSubscription(schoolId: string): Promise<SubscriptionCheck> {
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
export function hasFeatureAccess(tier: string, feature: string): boolean {
  const features = SUBSCRIPTION_FEATURES[tier] || SUBSCRIPTION_FEATURES.FREEMIUM;
  return features.includes(feature);
}

/**
 * Get the number of students a school can enroll based on its tier.
 */
export function getMaxStudentsForTier(tier: string): number {
  const limits: Record<string, number> = {
    FREEMIUM: 30,
    ESSENTIEL: 100,
    STANDARD: 500,
    PREMIUM: 2000,
    ENTERPRISE: 10000,
    CORPORATE: 99999,
  };
  return limits[tier] || limits.FREEMIUM;
}
