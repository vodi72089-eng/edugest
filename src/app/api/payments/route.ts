import { db } from '@/lib/db';
import { requirePermission, verifySchoolAccess, verifyParentAccess, safeParseInt, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'payments:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || '';
    const status = searchParams.get('status') || '';
    const trimester = searchParams.get('trimester') || '';
    const studentId = searchParams.get('studentId') || '';
    const page = safeParseInt(searchParams.get('page'), 1, 1, 10000);
    const limit = safeParseInt(searchParams.get('limit'), 20, 1, 100);

    const where: Record<string, unknown> = {};

    // For PARENT role: restrict to their children's payments only
    if (user.role === 'PARENT') {
      const children = await db.student.findMany({
        where: { parentId: user.id },
        select: { id: true },
      });
      const childIds = children.map(s => s.id);
      where.studentId = { in: childIds };
    } else if (user.role !== 'SUPER_ADMIN_GLOBAL') {
      // For non-SUPER_ADMIN_GLOBAL, restrict to their schoolId
      where.schoolId = user.schoolId;
    }

    if (schoolId) {
      // Verify school access for the requested schoolId
      if (!verifySchoolAccess(user, schoolId)) {
        return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
      }
      where.schoolId = schoolId;
    }
    if (status) where.status = status;
    if (trimester) where.trimester = trimester;
    if (studentId) {
      // For PARENT, ensure the studentId is one of their children
      if (user.role === 'PARENT') {
        const hasAccess = await verifyParentAccess(user, studentId);
        if (!hasAccess) {
          return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
        }
      }
      where.studentId = studentId;
    }

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
      select: { id: true, firstName: true, lastName: true, matricule: true, photoUrl: true },
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
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'payments:create');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

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
      receiptNumber,
    } = body;

    // Verify school access
    if (!schoolId || !verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

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

    // Force status to PENDING on creation — do not allow client to set status directly
    const payment = await db.paymentRecord.create({
      data: {
        studentId: resolvedStudentId,
        schoolId,
        amount,
        paidAmount: paidAmount || 0,
        trimester,
        paymentMethod: paymentMethod || null,
        referenceNumber: referenceNumber || null,
        status: 'PENDING',
        receiptNumber: receiptNum,
        paidAt: null,
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
          photoUrl: student.photoUrl,
        },
      } 
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating payment:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
