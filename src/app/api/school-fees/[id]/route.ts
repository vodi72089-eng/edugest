import { db } from '@/lib/db';
import { requirePermission, verifySchoolAccess, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

// ── SÉCURITÉ (cross-tenant P1) : avant, PUT/DELETE touchaient n'importe quel
// frais de n'importe quelle école par simple id. Désormais : le frais est
// chargé et son école vérifiée avant toute écriture.

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, 'school:update');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { id } = await params;
    const fee = await db.schoolFee.findUnique({ where: { id }, select: { schoolId: true } });
    if (!fee) {
      return NextResponse.json({ error: 'Frais introuvable' }, { status: 404 });
    }
    if (!verifySchoolAccess(user, fee.schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

    const body = await request.json();
    const { name, amount, trimester } = body;

    const updatedFee = await db.schoolFee.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(amount && { amount: parseFloat(amount) }),
        ...(trimester && { trimester }),
      },
      include: { class: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ data: updatedFee });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, 'school:update');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { id } = await params;
    const fee = await db.schoolFee.findUnique({ where: { id }, select: { schoolId: true } });
    if (!fee) {
      return NextResponse.json({ error: 'Frais introuvable' }, { status: 404 });
    }
    if (!verifySchoolAccess(user, fee.schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

    await db.schoolFee.delete({ where: { id } });

    return NextResponse.json({ message: 'Frais supprimé' });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
