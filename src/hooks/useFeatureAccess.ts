import { useEduGestStore } from '@/lib/store';
import { hasFeatureAccess, getMinTierForFeature, type TierFeature } from '@/lib/subscription';

/**
 * Hook pour vérifier l'accès à une fonctionnalité basé sur le tier
 *
 * Usage:
 * ```tsx
 * const { hasAccess, tier, requiredTier } = useFeatureAccess('grades');
 * if (!hasAccess) return <SubscriptionRequired />;
 * ```
 */
export function useFeatureAccess(feature: TierFeature) {
  const { userData, userRole } = useEduGestStore();

  // Compte PLATEFORME (SUPER_ADMIN_GLOBAL) : aucun gating d'abonnement.
  // Son profil n'a pas de forfait d'école (schoolId null → tier undefined) ;
  // le fallback « FREEMIUM » ci-dessous le faisait atterrir sur la page
  // « Fonctionnalité non disponible » (discipline, notes, paiements,
  // communications, convocations). Même bypass que canAccessView et
  // requireFeature côté API.
  if (userRole === 'SUPER_ADMIN_GLOBAL') {
    return {
      hasAccess: true,
      tier: 'PLATFORM',
      requiredTier: getMinTierForFeature(feature),
    };
  }

  // Le store persiste le tier directement sur userData (structure aplatie),
  // avec fallback sur l'objet school imbriqué pour compatibilité.
  const tier = userData?.subscriptionTier || (userData as { school?: { subscriptionTier?: string } } | undefined)?.school?.subscriptionTier || 'FREEMIUM';

  return {
    hasAccess: hasFeatureAccess(tier, feature),
    tier,
    requiredTier: getMinTierForFeature(feature),
  };
}
