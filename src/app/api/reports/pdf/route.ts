import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, verifySchoolAccess, sanitizeError } from '@/lib/auth';
import { collectDetailedReport } from '@/lib/report-data';
import { buildReportPdf } from '@/lib/report-pdf';
import { getRoleSealLabel } from '@/lib/helpers';

// ─── Rapport PDF au design EduGest (détaillé, nominatif) ────────────────────
// GET /api/reports/pdf?days=N[&schoolId=…]
//
// Renvoie un PDF A4 (bandeau vert/or EduGest) contenant TOUT le détail de la
// période : effectifs, paiements (élève, montant, horodatage à la seconde,
// n° de reçu), sujets des communications, sanctions (élève + description),
// points positifs (élève + points + raison), convocations, présences par
// élève (« 2 jours d'absence », « 1 jour de retard »), classements classes
// (présence + notes + discipline) et élèves (top 3 / 3 derniers, % estimé
// et conduite estimée). Réservé aux rôles administratifs.

const PDF_ALLOWED_ROLES = [
  'SUPER_ADMIN_GLOBAL',
  'SCHOOL_ADMIN',
  'DIRECTION_MATERNELLE',
  'DIRECTION_PRIMAIRE',
  'DIRECTION_SECONDAIRE',
  'SECRETARY',
];

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    if (!PDF_ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const daysParam = Number.parseInt(searchParams.get('days') || '7', 10);
    const days = Number.isFinite(daysParam) ? Math.max(1, Math.min(31, daysParam)) : 7;

    let schoolId: string;
    if (user.role === 'SUPER_ADMIN_GLOBAL') {
      const requested = searchParams.get('schoolId') || '';
      if (!requested) {
        return NextResponse.json({ error: 'schoolId requis' }, { status: 400 });
      }
      if (!verifySchoolAccess(user, requested)) {
        return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
      }
      schoolId = requested;
    } else {
      if (!user.schoolId) {
        return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
      }
      const requested = searchParams.get('schoolId') || '';
      if (requested && requested !== user.schoolId) {
        return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
      }
      schoolId = user.schoolId;
    }

    const data = await collectDetailedReport(schoolId, days);
    const sealLabel = getRoleSealLabel(user.role);
    data.sealLabel = sealLabel;

    const pdf = await buildReportPdf(data, sealLabel);

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="rapport-${data.school.shortName || 'ecole'}-${data.period.to}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Error building PDF report:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
