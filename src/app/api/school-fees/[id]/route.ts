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
    const authResult = await requirePermission(request, 'school-fees:manage');
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
    // Remplacement complet des tranches quand fournies (tableau, même vide
    // = suppression des tranches → retour au montant libre du frais).
    const replaceTranches = Array.isArray(body.tranches);
    const tranches = replaceTranches
      ? (body.tranches as { name?: unknown; amount?: unknown; isOptional?: unknown }[])
          .filter(t => typeof t?.name === 'string' && t.name.trim() && Number.isFinite(Number(t?.amount)) && Number(t.amount) >= 0)
          .slice(0, 20)
          .map((t, i) => ({
            name: String(t.name).trim().slice(0, 80),
            amount: Number(t.amount),
            isOptional: !!t.isOptional,
            position: i,
          }))
      : null;

    try {
      if (replaceTranches) {
        await db.feeTranche.deleteMany({ where: { feeId: id } });
      }
      const totalAmount = tranches && tranches.length > 0
        ? tranches.reduce((s: number, t: { amount: number }) => s + t.amount, 0)
        : (amount ? parseFloat(amount) : undefined);
      const updatedFee = await db.schoolFee.update({
        where: { id },
        data: {
          ...(name && { name }),
          ...(totalAmount !== undefined && { amount: totalAmount }),
          ...(trimester && { trimester }),
          ...(tranches && tranches.length > 0 ? { tranches: { create: tranches } } : {}),
        },
        include: {
          class: { select: { id: true, name: true } },
          tranches: { orderBy: { position: 'asc' } },
        },
      });

      return NextResponse.json({ data: updatedFee });
    } catch (e) {
      // Doublon nom/classe/trimestre → 409 explicite au lieu d'un 500.
      const msg = e instanceof Error ? e.message : '';
      if (msg.includes('Unique constraint') || (e as { code?: string }).code === 'P2002') {
        return NextResponse.json(
          { error: 'Un frais porte déjà ce nom pour cette classe et ce trimestre.' },
          { status: 409 }
        );
      }
      throw e;
    }
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, 'school-fees:manage');
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

    // Tranches supprimées d'abord (sécurité si la cascade FK n'est pas
    // appliquée par le moteur local), puis le frais.
    await db.feeTranche.deleteMany({ where: { feeId: id } });
    await db.schoolFee.delete({ where: { id } });

    return NextResponse.json({ message: 'Frais supprimé' });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
