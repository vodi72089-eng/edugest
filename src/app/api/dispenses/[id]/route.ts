import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole, verifySchoolAccess, sanitizeError } from '@/lib/auth';

const DISPENSE_WRITE_ROLES = ['MEDICAL', 'SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN'];

/**
 * PUT /api/dispenses/[id]
 * body: { endDate?, reason? }
 * Met à jour une dispense (comptes MEDICAL / SCHOOL_ADMIN / SUPER_ADMIN_GLOBAL).
 * NB : le modèle MedicalDispensation n'a pas de champ status/note — seuls
 * endDate et reason sont modifiables.
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
    const existing = await db.medicalDispensation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Dispense non trouvée' }, { status: 404 });
    }

    if (!verifySchoolAccess(user, existing.schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

    const body = await request.json();
    const { endDate, reason } = body;

    const data: Prisma.MedicalDispensationUpdateInput = {};
    if (endDate !== undefined && endDate !== null) {
      const d = new Date(endDate);
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: 'endDate invalide (date ISO attendue)' }, { status: 400 });
      }
      data.endDate = d;
    }
    if (reason !== undefined) data.reason = reason;

    const dispense = await db.medicalDispensation.update({ where: { id }, data });

    return NextResponse.json({ data: dispense });
  } catch (error) {
    console.error('[Dispenses] PUT error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
