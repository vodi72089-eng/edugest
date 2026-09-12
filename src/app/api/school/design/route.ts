import { db } from '@/lib/db';
import { requireAuth, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

// ─── Personnalisation du design de l'application (couleurs de l'école) ──────
// Champs School : designPrimary / designAccent / designGold / designUpdatedAt
// Accès :
//   - GET  : SUPER_ADMIN_GLOBAL (avec ?schoolId) ou SCHOOL_ADMIN (sa propre école)
//   - PUT  : SUPER_ADMIN_GLOBAL (toutes écoles) ou SCHOOL_ADMIN
//            (uniquement forfaits STANDARD et plus — gating strict)
// Sémantique des couleurs (PUT) :
//   - champ absent            → inchangé
//   - champ null explicite    → réinitialisé à null (retour au design par défaut)
//   - champ '#RRGGBB' valide  → appliqué

const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/;

// Forfaits autorisant la personnalisation (le client l'exige strictement)
const DESIGN_ALLOWED_TIERS = ['STANDARD', 'PREMIUM', 'ENTERPRISE', 'CORPORATE'];

function isValidHex(value: unknown): value is string {
  return typeof value === 'string' && HEX_REGEX.test(value);
}

// ─── GET : récupérer le design d'une école ──────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);

    if (user.role === 'SUPER_ADMIN_GLOBAL') {
      const schoolId = searchParams.get('schoolId');
      if (!schoolId) {
        return NextResponse.json(
          { error: 'Paramètre schoolId requis' },
          { status: 400 }
        );
      }

      const [school, schools] = await Promise.all([
        db.school.findUnique({
          where: { id: schoolId },
          select: {
            id: true,
            name: true,
            designPrimary: true,
            designAccent: true,
            designGold: true,
            designUpdatedAt: true,
          },
        }),
        // Liste des écoles pour le sélecteur côté plateforme
        db.school.findMany({
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
      ]);

      if (!school) {
        return NextResponse.json({ error: 'École non trouvée' }, { status: 404 });
      }

      return NextResponse.json({
        data: {
          schools,
          design: {
            primary: school.designPrimary,
            accent: school.designAccent,
            gold: school.designGold,
            updatedAt: school.designUpdatedAt,
          },
          schoolId: school.id,
          schoolName: school.name,
        },
      });
    }

    if (user.role === 'SCHOOL_ADMIN') {
      if (!user.schoolId) {
        return NextResponse.json(
          { error: 'Aucune école associée à votre compte' },
          { status: 400 }
        );
      }

      const school = await db.school.findUnique({
        where: { id: user.schoolId },
        select: {
          id: true,
          name: true,
          designPrimary: true,
          designAccent: true,
          designGold: true,
          designUpdatedAt: true,
        },
      });

      if (!school) {
        return NextResponse.json({ error: 'École non trouvée' }, { status: 404 });
      }

      return NextResponse.json({
        data: {
          design: {
            primary: school.designPrimary,
            accent: school.designAccent,
            gold: school.designGold,
            updatedAt: school.designUpdatedAt,
          },
          schoolId: school.id,
          schoolName: school.name,
        },
      });
    }

    return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

// ─── PUT : enregistrer le design d'une école ────────────────────────────────
export async function PUT(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    if (user.role !== 'SUPER_ADMIN_GLOBAL' && user.role !== 'SCHOOL_ADMIN') {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }
    const payload = body as {
      schoolId?: string | null;
      primary?: string | null;
      accent?: string | null;
      gold?: string | null;
    };

    // ── Résolution de l'école ciblée ────────────────────────────────────────
    let schoolId: string;

    if (user.role === 'SUPER_ADMIN_GLOBAL') {
      if (!payload.schoolId) {
        return NextResponse.json(
          { error: 'Paramètre schoolId requis' },
          { status: 400 }
        );
      }
      schoolId = payload.schoolId;
    } else {
      // SCHOOL_ADMIN : uniquement sa propre école (schoolId du body ignoré)
      if (!user.schoolId) {
        return NextResponse.json(
          { error: 'Aucune école associée à votre compte' },
          { status: 400 }
        );
      }
      schoolId = user.schoolId;
    }

    const school = await db.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, subscriptionTier: true },
    });

    if (!school) {
      return NextResponse.json({ error: 'École non trouvée' }, { status: 404 });
    }

    // ── Gating strict : personnalisation réservée aux forfaits STANDARD+ ────
    if (
      user.role === 'SCHOOL_ADMIN' &&
      !DESIGN_ALLOWED_TIERS.includes(school.subscriptionTier || 'FREEMIUM')
    ) {
      return NextResponse.json(
        {
          error:
            'La personnalisation est réservée aux écoles Standard et plus. Passez à un forfait supérieur.',
        },
        { status: 403 }
      );
    }

    // ── Validation des couleurs : absent = inchangé, null = reset ───────────
    const updateData: {
      designPrimary?: string | null;
      designAccent?: string | null;
      designGold?: string | null;
      designUpdatedAt: Date;
    } = { designUpdatedAt: new Date() };

    if (payload.primary !== undefined) {
      if (payload.primary === null) updateData.designPrimary = null;
      else if (isValidHex(payload.primary)) updateData.designPrimary = payload.primary;
      else {
        return NextResponse.json(
          { error: 'Format de couleur invalide pour primary. Utilisez le format hexadécimal #RRGGBB.' },
          { status: 400 }
        );
      }
    }

    if (payload.accent !== undefined) {
      if (payload.accent === null) updateData.designAccent = null;
      else if (isValidHex(payload.accent)) updateData.designAccent = payload.accent;
      else {
        return NextResponse.json(
          { error: 'Format de couleur invalide pour accent. Utilisez le format hexadécimal #RRGGBB.' },
          { status: 400 }
        );
      }
    }

    if (payload.gold !== undefined) {
      if (payload.gold === null) updateData.designGold = null;
      else if (isValidHex(payload.gold)) updateData.designGold = payload.gold;
      else {
        return NextResponse.json(
          { error: 'Format de couleur invalide pour gold. Utilisez le format hexadécimal #RRGGBB.' },
          { status: 400 }
        );
      }
    }

    const updated = await db.school.update({
      where: { id: schoolId },
      data: updateData,
      select: {
        designPrimary: true,
        designAccent: true,
        designGold: true,
        designUpdatedAt: true,
      },
    });

    return NextResponse.json({
      data: {
        design: {
          primary: updated.designPrimary,
          accent: updated.designAccent,
          gold: updated.designGold,
        },
      },
    });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
