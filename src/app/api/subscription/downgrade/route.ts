import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole, verifySchoolAccess, sanitizeError } from '@/lib/auth';
import { archiveExcessStudents } from '@/lib/archive';

// Ordre des forfaits (index croissant = niveau supérieur)
const TIER_ORDER = ['FREEMIUM', 'ESSENTIEL', 'STANDARD', 'PREMIUM', 'ENTERPRISE', 'CORPORATE'];

export async function POST(request: NextRequest) {
  try {
    // Sécurité : seul un SUPER_ADMIN_GLOBAL ou le SCHOOL_ADMIN de l'école peut
    // changer le tier (tout utilisateur authentifié pouvait le faire avant).
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN']);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { schoolId, newTier } = body;

    if (!schoolId || !newTier) {
      return NextResponse.json(
        { error: 'schoolId et newTier requis' },
        { status: 400 }
      );
    }

    // Vérifier l'accès à l'école
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    // Vérifier que le nouveau tier est valide
    const validTiers = TIER_ORDER;
    if (!validTiers.includes(newTier)) {
      return NextResponse.json(
        { error: 'Tier invalide' },
        { status: 400 }
      );
    }

    // ── SÉCURITÉ (P0) : un SCHOOL_ADMIN ne peut que RÉTROGRADER son école.
    // Avant, ce endpoint acceptait n'importe quel tier → un admin FREEMIUM
    // pouvait s'auto-promouvoir en ENTERPRISE/CORPORATE gratuitement et
    // neutraliser tous les gating par forfait. Seul SUPER_ADMIN_GLOBAL peut
    // monter un tier (via la validation du paiement d'abonnement).
    if (user.role !== 'SUPER_ADMIN_GLOBAL') {
      const school = await db.school.findUnique({
        where: { id: schoolId },
        select: { subscriptionTier: true },
      });
      const currentIndex = TIER_ORDER.indexOf(school?.subscriptionTier || 'FREEMIUM');
      const newIndex = TIER_ORDER.indexOf(newTier);
      if (newIndex > currentIndex) {
        return NextResponse.json(
          { error: 'Seul un SUPER_ADMIN_GLOBAL peut augmenter le forfait. Passez par « Mon abonnement » pour demander une montée de formule.' },
          { status: 403 }
        );
      }
    }

    // Archiver les élèves excédentaires
    const archiveResult = await archiveExcessStudents(schoolId, newTier);

    // Mettre à jour le tier de l'école
    await db.school.update({
      where: { id: schoolId },
      data: { subscriptionTier: newTier },
    });

    return NextResponse.json({
      data: {
        newTier,
        archived: archiveResult.archived,
      },
      message: archiveResult.archived > 0
        ? `Tier changé en ${newTier}. ${archiveResult.archived} élève(s) archivé(s).`
        : `Tier changé en ${newTier}. Aucun élève à archiver.`,
    });
  } catch (error) {
    console.error('Error during downgrade:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
