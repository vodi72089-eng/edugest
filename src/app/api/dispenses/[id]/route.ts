import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole, verifySchoolAccess, sanitizeError } from '@/lib/auth';

const DISPENSE_WRITE_ROLES = ['MEDICAL', 'SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN'];

const VALID_STATUSES = ['ACTIVE', 'EXPIRED', 'CANCELLED'];

/**
 * PUT /api/dispenses/[id]
 * body: { status?, endDate?, reason?, note? }
 * Met à jour une dispense (comptes MEDICAL / SCHOOL_ADMIN / SUPER_ADMIN_GLOBAL).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireRole(request, DISPENSE_WRITE_ROLES);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { id } = await params;
    const existing = await db.dispense.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Dispense non trouvée' }, { status: 404 });
    }

    if (!verifySchoolAccess(user, existing.schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

    const body = await request.json();
    const { status, endDate, reason, note } = body;

    const data: Record<string, unknown> = {};
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json(
          { error: `Statut invalide (valeurs acceptées : ${VALID_STATUSES.join(', ')})` },
          { status: 400 }
        );
      }
      data.status = status;
    }
    if (endDate !== undefined) {
      if (endDate === null) {
        data.endDate = null;
      } else {
        const d = new Date(endDate);
        if (isNaN(d.getTime())) {
          return NextResponse.json({ error: 'endDate invalide (date ISO attendue)' }, { status: 400 });
        }
        data.endDate = d;
      }
    }
    if (reason !== undefined) data.reason = reason;
    if (note !== undefined) data.note = note || null;

    const dispense = await db.dispense.update({ where: { id }, data });

    return NextResponse.json({ data: dispense });
  } catch (error) {
    console.error('[Dispenses] PUT error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
