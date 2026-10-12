import { db } from '@/lib/db';
import { requirePermission, verifySchoolAccess, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'school:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    // ── SÉCURITÉ (cross-tenant P1) : le schoolId du query n'est honoré que
    // pour SUPER_ADMIN_GLOBAL ; les autres rôles sont TOUJOURS scopés à leur
    // propre école (avant : lecture des frais de n'importe quelle école).
    let schoolId = searchParams.get('schoolId') || '';
    if (user.role !== 'SUPER_ADMIN_GLOBAL') {
      schoolId = user.schoolId || '';
    }
    const classId = searchParams.get('classId') || '';
    const trimester = searchParams.get('trimester') || '';

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId requis' }, { status: 400 });
    }

    const where: Record<string, unknown> = { isActive: true, schoolId };
    if (classId) where.classId = classId;
    if (trimester) where.trimester = trimester;

    const fees = await db.schoolFee.findMany({
      where,
      include: {
        class: { select: { id: true, name: true } },
        tranches: { orderBy: { position: 'asc' } },
      },
      orderBy: [{ class: { name: 'asc' } }, { trimester: 'asc' }],
    });

    return NextResponse.json({ data: fees });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'school-fees:manage');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { name, amount, trimester, classId, schoolId } = body;
    // Tranches optionnelles : [{ name, amount, isOptional? }] — le montant du
    // frais devient la somme des tranches quand elles sont fournies.
    const rawTranches = Array.isArray(body.tranches) ? body.tranches : [];
    const tranches = rawTranches
      .filter((t: { name?: unknown; amount?: unknown }) =>
        typeof t?.name === 'string' && t.name.trim() && Number.isFinite(Number(t?.amount)) && Number(t.amount) >= 0)
      .slice(0, 20)
      .map((t: { name: string; amount: number | string; isOptional?: unknown }, i: number) => ({
        name: t.name.trim().slice(0, 80),
        amount: Number(t.amount),
        isOptional: !!t.isOptional,
        position: i,
      }));

    if (!name || !trimester || !classId || !schoolId) {
      return NextResponse.json({ error: 'Nom, trimestre, classe et école requis' }, { status: 400 });
    }
    if (tranches.length === 0 && !Number.isFinite(Number(amount))) {
      return NextResponse.json({ error: 'Montant requis (ou définissez des tranches)' }, { status: 400 });
    }

    // ── SÉCURITÉ (cross-tenant P1) : avant, un DIRECTION_* FREEMIUM (qui
    // reçoit school:update) pouvait écrire des frais dans N'IMPORTE QUELLE
    // école en postant son schoolId. Désormais : vérification d'appartenance.
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

    // La classe doit appartenir à la même école que les frais.
    const targetClass = await db.class.findUnique({ where: { id: classId }, select: { schoolId: true } });
    if (!targetClass) {
      return NextResponse.json({ error: 'Classe introuvable' }, { status: 404 });
    }
    if (targetClass.schoolId !== schoolId) {
      return NextResponse.json({ error: 'Cette classe n\'appartient pas à cette école' }, { status: 400 });
    }

    // Check for duplicate: same name + same class + same trimester
    const existing = await db.schoolFee.findFirst({
      where: { name, classId, trimester, schoolId, isActive: true }
    });
    if (existing) {
      return NextResponse.json({ error: 'Ce frais existe déjà pour cette classe et ce trimestre' }, { status: 409 });
    }

    const totalAmount = tranches.length > 0
      ? tranches.reduce((s: number, t: { amount: number }) => s + t.amount, 0)
      : parseFloat(amount);
    const fee = await db.schoolFee.create({
      data: {
        name,
        amount: totalAmount,
        trimester,
        classId,
        schoolId,
        ...(tranches.length > 0 ? { tranches: { create: tranches } } : {}),
      },
      include: {
        class: { select: { id: true, name: true } },
        tranches: { orderBy: { position: 'asc' } },
      },
    });

    return NextResponse.json({ data: fee }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
