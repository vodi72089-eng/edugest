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
      studentName,
      schoolId,
      amount,
      paidAmount,
      trimester,
      paymentMethod,
      referenceNumber,
      status,
      receiptNumber,
    } = body;

    // If studentName is provided instead of studentId, try to find the student by name
    let resolvedStudentId = studentId;
    if (!resolvedStudentId && studentName) {
      const nameParts = studentName.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ');
      
      const students = await db.student.findMany({
        where: {
          OR: [
            { firstName: { contains: firstName }, lastName: { contains: lastName || firstName } },
            { firstName: { contains: lastName || firstName }, lastName: { contains: firstName } },
          ],
        },
        take: 5,
        select: { id: true, firstName: true, lastName: true, matricule: true },
      });
      
      if (students.length === 0) {
        return NextResponse.json(
          { error: 'Le nom de l\'élève a été mal écrit ou il n\'existe pas' },
          { status: 404 }
        );
      }
      
      if (students.length > 1) {
        return NextResponse.json({
          error: 'Plusieurs élèves correspondent à ce nom. Veuillez être plus précis.',
          suggestions: students.map(s => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, matricule: s.matricule })),
        }, { status: 400 });
      }
      
      resolvedStudentId = students[0].id;
    }

    if (!resolvedStudentId || !schoolId || !amount || !trimester) {
      return NextResponse.json(
        { error: 'Champs requis manquants: élève, école, montant, trimestre' },
        { status: 400 }
      );
    }

    // Verify student exists
    const student = await db.student.findUnique({
      where: { id: resolvedStudentId },
      select: { id: true, firstName: true, lastName: true, matricule: true },
    });

    if (!student) {
      return NextResponse.json(
        { error: 'Le nom de l\'élève a été mal écrit ou il n\'existe pas' },
        { status: 404 }
      );
    }

    // Generate receipt number if not provided
    const receiptNum = receiptNumber || `REC-${Date.now().toString(36).toUpperCase()}`;

    const payment = await db.paymentRecord.create({
      data: {
        studentId: resolvedStudentId,
        schoolId,
        amount,
        paidAmount: paidAmount || 0,
        trimester,
        paymentMethod: paymentMethod || null,
        referenceNumber: referenceNumber || null,
        status: status || 'PENDING',
        receiptNumber: receiptNum,
        paidAt: status === 'PAID' ? new Date() : null,
      },
    });

    // Return payment with student data for immediate use
    return NextResponse.json({ 
      data: {
        ...payment,
        student: {
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          matricule: student.matricule,
        },
      } 
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating payment:', error);
    return NextResponse.json({ error: 'Failed to create payment' }, { status: 500 });
  }
}
