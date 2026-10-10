import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthUser } from './auth';
import { hasFeatureAccess, getMinTierForFeature, TierFeature } from './subscription';
import { checkSubscription } from './subscription-server';

/**
 * Middleware pour vérifier qu'un utilisateur a accès à une fonctionnalité
 * basé sur le tier de son école.
 * - SUPER_ADMIN_GLOBAL : toujours autorisé (gestion de la plateforme).
 * - Les autres rôles : le tier de leur école doit inclure la feature.
 */
export async function requireFeature(
  request: NextRequest,
  feature: TierFeature
): Promise<{ user: AuthUser } | { error: Response | NextResponse }> {
  const authResult = await requireAuth(request);
  if ('error' in authResult) return authResult;

  const { user } = authResult;

  // Le super admin de la plateforme n'est rattaché à aucune école :
  // bypass systématique (sinon getSchoolTier(null) → FREEMIUM → 403).
  if (user.role === 'SUPER_ADMIN_GLOBAL') return { user };

  // ── Le forfait ne suffit pas : le statut et la date de fin font foi.
  // Avant, une école PREMIUM expirée conservait bulletins, communications,
  // convocations, devoirs, discipline, module médical et API WhatsApp perso
  // indéfiniment (aucun middleware n'existe).
  // Compte sans école (plateforme / corporate) : comportement précédent conservé.
  const sub = user.schoolId
    ? await checkSubscription(user.schoolId)
    : { active: true, tier: 'FREEMIUM', expired: false, daysRemaining: null };
  const tier = sub.tier;
  if (!sub.active) {
    return {
      error: NextResponse.json({
        error: `Abonnement ${sub.expired ? 'expiré' : 'inactif'} (${tier}) — renouvelez l'abonnement pour accéder à cette fonctionnalité.`,
        featureRequired: feature,
        tierRequired: getMinTierForFeature(feature),
        currentTier: tier,
        subscriptionExpired: !!sub.expired,
      }, { status: 403 })
    };
  }
  if (!hasFeatureAccess(tier, feature)) {
    return {
      error: NextResponse.json({
        error: `Fonctionnalité non disponible dans le forfait ${tier}`,
        featureRequired: feature,
        tierRequired: getMinTierForFeature(feature),
        currentTier: tier,
      }, { status: 403 })
    };
  }

  return { user };
}
