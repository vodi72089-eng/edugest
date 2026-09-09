import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from './auth';
import { hasFeatureAccess, getMinTierForFeature, getSchoolTier } from './subscription';

/**
 * Middleware pour vérifier qu'un utilisateur a accès à une fonctionnalité
 * basé sur le tier de son école.
 */
export async function requireFeature(
  request: NextRequest,
  feature: string
): Promise<{ user: NonNullable<Awaited<ReturnType<typeof requireAuth>> extends { user: infer U } ? U : never> } | { error: NextResponse }> {
  const authResult = await requireAuth(request);
  if ('error' in authResult) return authResult;

  const { user } = authResult;

  const tier = await getSchoolTier(user.schoolId);
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
