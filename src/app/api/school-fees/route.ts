import { db } from '@/lib/db';
import { requirePermission, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'school:read');
    if ('error' in authResult) return authResult.error;

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || '';
    const classId = searchParams.get('classId') || '';
    const trimester = searchParams.get('trimester') || '';

    const where: Record<string, unknown> = { isActive: true };
    if (schoolId) where.schoolId = schoolId;
    if (classId) where.classId = classId;
    if (trimester) where.trimester = trimester;

    const fees = await db.schoolFee.findMany({
      where,
      include: { class: { select: { id: true, name: true } } },
      orderBy: [{ class: { name: 'asc' } }, { trimester: 'asc' }],
    });

    return NextResponse.json({ data: fees });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'school:update');
    if ('error' in authResult) return authResult.error;

    const body = await request.json();
    const { name, amount, trimester, classId, schoolId } = body;

    if (!name || !amount || !trimester || !classId || !schoolId) {
      return NextResponse.json({ error: 'Tous les champs sont requis' }, { status: 400 });
    }

    // Check for duplicate: same name + same class + same trimester
    const existing = await db.schoolFee.findFirst({
      where: { name, classId, trimester, schoolId, isActive: true }
    });
    if (existing) {
      return NextResponse.json({ error: 'Ce frais existe déjà pour cette classe et ce trimestre' }, { status: 409 });
    }

    const fee = await db.schoolFee.create({
      data: { name, amount: parseFloat(amount), trimester, classId, schoolId },
      include: { class: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ data: fee }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}