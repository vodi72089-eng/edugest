import { db } from '@/lib/db';
import { requirePermission, verifySchoolAccess, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/payments/verify-receipt?id=xxx&schoolId=yyy — Find payment by ID or receipt number
export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'payments:verify');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id') || '';

    if (!id) {
      return NextResponse.json({ error: 'id est requis' }, { status: 400 });
    }

    // ── SÉCURITÉ (cross-tenant P1) : le schoolId du query n'est plus
    // optionnel pour les non-SAG (avant : sans schoolId, la recherche
    // portait sur les 1000 derniers paiements de TOUTES les écoles).
    const schoolId = user.role === 'SUPER_ADMIN_GLOBAL'
      ? searchParams.get('schoolId') || ''
      : user.schoolId || '';

    if (schoolId && !verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

    const raw = id.trim();
    const q = raw.toLowerCase();
    const qNoHyphens = q.replace(/-/g, '');

    // Correspondances EXACTES uniquement (DB, pas de scan flou) :
    // id, id sans tirets, receiptNumber, referenceNumber. AUCUNE recherche
    // partielle/sous-chaîne (faux positifs + énumération inter-écoles).
    // (Comparaisons brutes : SQLite `=` est sensible à la casse.)
    const whereClause: Record<string, unknown> = schoolId ? { schoolId } : {};
    const match = await db.paymentRecord.findFirst({
      where: {
        ...whereClause,
        OR: [
          { id: raw },
          { id: q },
          { receiptNumber: raw },
          { referenceNumber: raw },
        ],
      },
      include: {
        school: { select: { name: true, shortName: true } },
      },
    }).then(async (m) => {
      if (m) return m;
      // Repli : id sans tirets (cuid possibles avec/sans tirets selon saisie).
      if (!qNoHyphens || qNoHyphens === q) return null;
      const candidates = await db.paymentRecord.findMany({
        where: whereClause,
        select: { id: true },
        take: 500,
      });
      const hit = candidates.find(p => p.id.toLowerCase().replace(/-/g, '') === qNoHyphens);
      if (!hit) return null;
      return db.paymentRecord.findUnique({
        where: { id: hit.id },
        include: { school: { select: { name: true, shortName: true } } },
      });
    });

    if (!match) {
      return NextResponse.json({ error: 'Aucun paiement trouvé' }, { status: 404 });
    }

    // Enrich with student data
    const student = await db.student.findUnique({
      where: { id: match.studentId },
      select: { id: true, firstName: true, lastName: true, matricule: true, photoUrl: true },
    });

    return NextResponse.json({
      data: {
        ...match,
        student: student || null,
        isVerified: !!match.verifiedBy,
      },
    });
  } catch (error) {
    console.error('Error verifying receipt:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
