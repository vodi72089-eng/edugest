import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthUser } from './auth';
import { hasFeatureAccess, getMinTierForFeature, getSchoolTier, TierFeature } from './subscription';

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

  const tier = await getSchoolTier(user.schoolId || '');
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
