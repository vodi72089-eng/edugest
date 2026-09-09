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
  // Le store persiste le tier directement sur userData (structure aplatie),
  // avec fallback sur l'objet school imbriqué pour compatibilité.
  const tier = userData?.subscriptionTier || (userData as { school?: { subscriptionTier?: string } } | undefined)?.school?.subscriptionTier || 'FREEMIUM';
  
  return {
    hasAccess: hasFeatureAccess(tier, feature),
    tier,
    requiredTier: getMinTierForFeature(feature),
  };
}
