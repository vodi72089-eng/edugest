import { db } from '@/lib/db';
import { requirePermission, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, 'school:update');
    if ('error' in authResult) return authResult.error;

    const { id } = await params;
    const body = await request.json();
    const { name, amount, trimester } = body;

    const fee = await db.schoolFee.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(amount && { amount: parseFloat(amount) }),
        ...(trimester && { trimester }),
      },
      include: { class: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ data: fee });
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

    const { id } = await params;
    await db.schoolFee.delete({ where: { id } });

    return NextResponse.json({ message: 'Frais supprimé' });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
