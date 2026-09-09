import { useEduGestStore } from '@/lib/store';
import { hasFeatureAccess, getMinTierForFeature } from '@/lib/subscription';

/**
 * Hook pour vérifier l'accès à une fonctionnalité basé sur le tier
 * 
 * Usage:
 * ```tsx
 * const { hasAccess, tier, requiredTier } = useFeatureAccess('grades');
 * if (!hasAccess) return <SubscriptionRequired />;
 * ```
 */
export function useFeatureAccess(feature: string) {
  const { userData } = useEduGestStore();
  const tier = userData?.school?.subscriptionTier || 'FREEMIUM';
  
  return {
    hasAccess: hasFeatureAccess(tier, feature),
    tier,
    requiredTier: getMinTierForFeature(feature),
  };
}
