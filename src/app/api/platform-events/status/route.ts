import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, verifySchoolAccess, sanitizeError } from '@/lib/auth';
import { resolveEventVisibility } from '@/lib/platform-events';

/**
 * GET /api/platform-events/status — tout utilisateur authentifié (périmètre école)
 *
 * Retourne la visibilité des fonctionnalités contrôlées par la plateforme :
 *  - CLASS_PASSING : événement plateforme → fallback calcul année scolaire
 *  - BULLETIN_PUBLICATION : événement plateforme → fallback toujours visible
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || user.schoolId;

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId est requis' }, { status: 400 });
    }

    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

    const activeSchoolYear = await db.schoolYear.findFirst({
      where: { schoolId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    const [classPassing, bulletinPublication] = await Promise.all([
      resolveEventVisibility('CLASS_PASSING', schoolId, activeSchoolYear),
      resolveEventVisibility('BULLETIN_PUBLICATION', schoolId),
    ]);

    return NextResponse.json({
      data: {
        CLASS_PASSING: classPassing,
        BULLETIN_PUBLICATION: bulletinPublication,
      },
    });
  } catch (error) {
    console.error('[PlatformEvents] status error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
