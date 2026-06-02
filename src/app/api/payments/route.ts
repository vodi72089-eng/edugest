import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || '';
    const status = searchParams.get('status') || '';
    const trimester = searchParams.get('trimester') || '';
    const studentId = searchParams.get('studentId') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const where: Record<string, unknown> = {};

    if (schoolId) where.schoolId = schoolId;
    if (status) where.status = status;
    if (trimester) where.trimester = trimester;
    if (studentId) where.studentId = studentId;

    const [payments, total] = await Promise.all([
      db.paymentRecord.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          school: {
            select: { id: true, name: true, shortName: true },
          },
        },
      }),
      db.paymentRecord.count({ where }),
    ]);

    // Enrich with student data manually since PaymentRecord has no student relation
    const studentIds = [...new Set(payments.map(p => p.studentId))];
    const students = await db.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, firstName: true, lastName: true, matricule: true },
    });
    const studentMap = Object.fromEntries(students.map(s => [s.id, s]));

    const enrichedPayments = payments.map(p => ({
      ...p,
      student: studentMap[p.studentId] || null,
    }));

    return NextResponse.json({
      data: enrichedPayments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing payments:', error);
    return NextResponse.json({ error: 'Failed to list payments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      studentId,
      schoolId,
      amount,
      paidAmount,
      trimester,
      paymentMethod,
      referenceNumber,
      status,
      receiptNumber,
    } = body;

    if (!studentId || !schoolId || !amount || !trimester) {
      return NextResponse.json(
        { error: 'Missing required fields: studentId, schoolId, amount, trimester' },
        { status: 400 }
      );
    }

    const payment = await db.paymentRecord.create({
      data: {
        studentId,
        schoolId,
        amount,
        paidAmount: paidAmount || 0,
        trimester,
        paymentMethod: paymentMethod || null,
        referenceNumber: referenceNumber || null,
        status: status || 'PENDING',
        receiptNumber: receiptNumber || null,
        paidAt: status === 'PAID' ? new Date() : null,
      },
    });

    return NextResponse.json({ data: payment }, { status: 201 });
  } catch (error) {
    console.error('Error creating payment:', error);
    return NextResponse.json({ error: 'Failed to create payment' }, { status: 500 });
  }
}
