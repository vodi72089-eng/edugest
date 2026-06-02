import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.paymentRecord.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Payment record not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      'amount', 'paidAmount', 'paymentMethod', 'referenceNumber',
      'status', 'receiptNumber',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // If status changed to PAID, set paidAt
    if (body.status === 'PAID' && existing.status !== 'PAID') {
      updateData.paidAt = new Date();
    }

    const payment = await db.paymentRecord.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ data: payment });
  } catch (error) {
    console.error('Error updating payment:', error);
    return NextResponse.json({ error: 'Failed to update payment' }, { status: 500 });
  }
}
