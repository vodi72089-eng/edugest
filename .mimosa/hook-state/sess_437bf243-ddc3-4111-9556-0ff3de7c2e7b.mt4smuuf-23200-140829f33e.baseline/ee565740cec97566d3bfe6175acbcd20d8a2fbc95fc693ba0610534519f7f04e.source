import { db } from '@/lib/db';
import {
  requirePermission,
  verifySchoolAccess,
  safeParseInt,
  sanitizeError,
} from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/payment-transactions?schoolId=...&status=...&gatewayType=...&page=...&limit=...
// List payment transactions for a school with optional filters and pagination.
export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'payments:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || '';
    const status = searchParams.get('status') || '';
    const gatewayType = searchParams.get('gatewayType') || '';
    const studentId = searchParams.get('studentId') || '';
    const page = safeParseInt(searchParams.get('page'), 1, 1, 10000);
    const limit = safeParseInt(searchParams.get('limit'), 20, 1, 200);

    if (!schoolId) {
      return NextResponse.json(
        { error: 'schoolId est requis' },
        { status: 400 }
      );
    }

    // Verify school access
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    // Build the where clause
    const where: Record<string, unknown> = { schoolId };

    if (status) where.status = status;
    if (gatewayType) where.gatewayType = gatewayType;

    // For PARENT role, restrict to their children's transactions only
    if (user.role === 'PARENT') {
      if (studentId) {
        // Verify parent-child access
        const student = await db.student.findUnique({
          where: { id: studentId },
          select: { parentId: true },
        });
        if (!student || student.parentId !== user.id) {
          return NextResponse.json(
            { error: 'Accès non autorisé à cet élève' },
            { status: 403 }
          );
        }
        where.studentId = studentId;
      } else {
        // Restrict to all children of this parent
        const children = await db.student.findMany({
          where: { parentId: user.id },
          select: { id: true },
        });
        where.studentId = { in: children.map((s) => s.id) };
      }
    } else if (studentId) {
      where.studentId = studentId;
    }

    const [transactions, total] = await Promise.all([
      db.paymentTransaction.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { initiatedAt: 'desc' },
      }),
      db.paymentTransaction.count({ where }),
    ]);

    // Enrich with student data when available
    const studentIds = [
      ...new Set(
        transactions
          .map((t) => t.studentId)
          .filter((id): id is string => Boolean(id))
      ),
    ];

    let studentMap: Record<string, any> = {};
    if (studentIds.length > 0) {
      const students = await db.student.findMany({
        where: { id: { in: studentIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          matricule: true,
        },
      });
      studentMap = Object.fromEntries(students.map((s) => [s.id, s]));
    }

    const enriched = transactions.map((t) => ({
      ...t,
      student: t.studentId ? studentMap[t.studentId] || null : null,
    }));

    return NextResponse.json({
      data: enriched,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[PaymentTransactions] Error listing transactions:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
