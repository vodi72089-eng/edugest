import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, sanitizeError } from '@/lib/auth';
import { db } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { sendPlatformEmail } from '@/lib/platform-email';

// ═══════════════════════════════════════════════════════════════════════════
// PASSAGE D'ÉCOLE — activation envoyée par l'admin plateforme uniquement
// Le passage de classe n'est disponible pour une école QUE lorsque le
// SUPER_ADMIN_GLOBAL lui envoie l'activation (FeatureGrant). Sans grant,
// la vue ET l'API /api/class-passing restent verrouillées.
// ═══════════════════════════════════════════════════════════════════════════

export const FEATURE_KEYS = ['CLASS_PASSING', 'BULLETINS'];

// GET /api/feature-grants?schoolId=&feature= — vérification (toute école auth.)
//    ou sans paramètres → liste complète (SAG)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');
    const feature = searchParams.get('feature');

    // Vérification ciblée (utilisateurs rattachés à une école / SAG)
    if (schoolId && feature) {
      const authResult = await requireAuth(request);
      if ('error' in authResult) return authResult.error;
      const { user } = authResult;
      if (user.role !== 'SUPER_ADMIN_GLOBAL' && user.schoolId !== schoolId) {
        return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
      }
      const grant = await db.featureGrant.findUnique({
        where: { feature_schoolId: { feature, schoolId } },
      });
      const active = !!grant && !grant.revoked && (!grant.activeUntil || grant.activeUntil.getTime() > Date.now());
      return NextResponse.json({ data: { granted: active, grant: active ? { id: grant!.id, activeUntil: grant!.activeUntil, note: grant!.note } : null } });
    }

    // Liste complète (SAG)
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;

    const grants = await db.featureGrant.findMany({
      orderBy: { createdAt: 'desc' },
      include: { school: { select: { id: true, name: true, shortName: true, subscriptionTier: true } } },
    });
    return NextResponse.json({
      data: grants.map(g => ({
        id: g.id, feature: g.feature, note: g.note, revoked: g.revoked,
        activeUntil: g.activeUntil, createdAt: g.createdAt,
        grantedByName: g.grantedByName,
        school: g.school,
        active: !g.revoked && (!g.activeUntil || g.activeUntil.getTime() > Date.now()),
      })),
    });
  } catch (error) {
    console.error('[FeatureGrants] GET error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

// POST /api/feature-grants — « j'envoie » le passage à une école (SAG)
// Body: { feature, schoolId, note?, activeUntil? (ISO) }
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;
    const { user: admin } = authResult;

    const body = await request.json();
    const { feature, schoolId, note } = body;
    if (!FEATURE_KEYS.includes(feature)) {
      return NextResponse.json({ error: 'Fonctionnalité inconnue' }, { status: 400 });
    }
    const school = await db.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, shortName: true } });
    if (!school) return NextResponse.json({ error: 'École introuvable' }, { status: 404 });

    let activeUntil: Date | null = null;
    if (body.activeUntil) {
      activeUntil = new Date(body.activeUntil);
      if (isNaN(activeUntil.getTime())) return NextResponse.json({ error: 'Date d\u2019expiration invalide' }, { status: 400 });
    }

    const grant = await db.featureGrant.upsert({
      where: { feature_schoolId: { feature, schoolId } },
      create: { feature, schoolId, grantedByUserId: admin.id, grantedByName: admin.name, note: note || null, activeUntil },
      update: { revoked: false, grantedByUserId: admin.id, grantedByName: admin.name, note: note || null, activeUntil },
    });

    // Email d'activation envoyé depuis « nos emails » (contact) aux admins école
    const admins = await db.user.findMany({
      where: { schoolId, role: { in: ['SCHOOL_ADMIN', 'ADMIN_FREEMIUM'] }, isActive: true },
      select: { email: true, name: true },
    });
    const featureLabel = feature === 'CLASS_PASSING' ? 'Passage de classe' : 'Bulletins';
    for (const a of admins.slice(0, 10)) {
      if (!a.email) continue;
      await sendPlatformEmail({
        to: a.email, fromKey: 'contact', template: 'HANDOVER_GRANT',
        subject: `EduGest — « ${featureLabel} » activé pour ${school.name}`,
        html: `<p>Bonjour ${a.name},</p><p>L'administrateur de la plateforme a activé <b>${featureLabel}</b> pour votre école <b>${school.name}</b>${activeUntil ? ` (jusqu'au ${activeUntil.toLocaleDateString('fr-FR')})` : ''}.</p><p>Rendez-vous dans l'onglet dédié de votre tableau de bord.</p><p>L'équipe EduGest</p>`,
      });
    }

    await logAudit({
      action: 'GRANT_SENT',
      userId: admin.id, userName: admin.name, userRole: admin.role,
      entityType: 'FeatureGrant', entityId: grant.id, schoolId,
      details: `« ${featureLabel} » envoyé à l'école « ${school.name} »${activeUntil ? ` jusqu'au ${activeUntil.toLocaleDateString('fr-FR')}` : ''}`,
      meta: { feature, school: school.name, activeUntil: activeUntil?.toISOString() || null },
    });

    return NextResponse.json({ data: { id: grant.id, granted: true } }, { status: 201 });
  } catch (error) {
    console.error('[FeatureGrants] POST error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

// PATCH /api/feature-grants — révoque un don d'activation (SAG)
// Body: { id, revoked: true }
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;
    const { user: admin } = authResult;

    const body = await request.json();
    const { id, revoked } = body;
    if (!id || revoked !== true) return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 });

    const grant = await db.featureGrant.update({
      where: { id },
      data: { revoked: true },
      include: { school: { select: { name: true } } },
    });

    await logAudit({
      action: 'GRANT_REVOKED',
      userId: admin.id, userName: admin.name, userRole: admin.role,
      entityType: 'FeatureGrant', entityId: id, schoolId: grant.schoolId,
      details: `Activation ${grant.feature} révoquée pour « ${grant.school.name} »`,
    });

    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error('[FeatureGrants] PATCH error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
