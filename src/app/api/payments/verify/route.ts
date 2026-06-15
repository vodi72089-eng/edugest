import { db } from '@/lib/db';
import { requirePermission, verifySchoolAccess, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

// POST /api/payments/verify — Verify/validate a payment record
export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'payments:verify');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { paymentId, verificationNote, action } = body;

    if (!paymentId) {
      return NextResponse.json(
        { error: 'Champ requis manquant: paymentId' },
        { status: 400 }
      );
    }

    const existing = await db.paymentRecord.findUnique({
      where: { id: paymentId },
      include: {
        school: {
          select: { name: true, shortName: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Paiement non trouvé' },
        { status: 404 }
      );
    }

    // Verify school access
    if (!verifySchoolAccess(user, existing.schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

    // Derive verifierName from the authenticated user's name
    const verifierName = user.name;

    // Get student info
    const student = await db.student.findUnique({
      where: { id: existing.studentId },
      select: { firstName: true, lastName: true, matricule: true },
    });

    if (action === 'approve') {
      const payment = await db.paymentRecord.update({
        where: { id: paymentId },
        data: {
          status: 'PAID',
          paidAt: existing.paidAt || new Date(),
          verifiedBy: verifierName,
          verifiedAt: new Date(),
          verificationNote: verificationNote || null,
        },
      });

      return NextResponse.json({
        data: {
          ...payment,
          student: student || null,
          action: 'approved',
        },
        message: 'Paiement vérifié et approuvé avec succès',
      });
    }

    if (action === 'reject') {
      const payment = await db.paymentRecord.update({
        where: { id: paymentId },
        data: {
          status: 'REJECTED',
          verifiedBy: verifierName,
          verifiedAt: new Date(),
          verificationNote: verificationNote || 'Paiement rejeté',
        },
      });

      return NextResponse.json({
        data: {
          ...payment,
          student: student || null,
          action: 'rejected',
        },
        message: 'Paiement rejeté',
      });
    }

    // Default: just mark as verified (without changing status)
    const payment = await db.paymentRecord.update({
      where: { id: paymentId },
      data: {
        verifiedBy: verifierName,
        verifiedAt: new Date(),
        verificationNote: verificationNote || null,
      },
    });

    return NextResponse.json({
      data: {
        ...payment,
        student: student || null,
        action: 'verified',
      },
      message: 'Paiement marqué comme vérifié',
    });
  } catch (error) {
    console.error('Error verifying payment:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}

// GET /api/payments/verify?schoolId=X — Get unverified payments for a school
export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'payments:verify');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || '';
    const status = searchParams.get('status') || 'all';

    if (!schoolId) {
      return NextResponse.json(
        { error: 'schoolId est requis' },
        { status: 400 }
      );
    }

    // Verify school access
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

    const where: Record<string, unknown> = { schoolId };

    // Filter by verification status
    if (status === 'unverified') {
      where.verifiedBy = null;
    } else if (status === 'verified') {
      where.verifiedBy = { not: null };
    }

    const payments = await db.paymentRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Enrich with student data
    const studentIds = [...new Set(payments.map(p => p.studentId))];
    const students = await db.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, firstName: true, lastName: true, matricule: true },
    });
    const studentMap = Object.fromEntries(students.map(s => [s.id, s]));

    const enrichedPayments = payments.map(p => ({
      ...p,
      student: studentMap[p.studentId] || null,
      isVerified: !!p.verifiedBy,
    }));

    const totalUnverified = enrichedPayments.filter(p => !p.isVerified).length;
    const totalVerified = enrichedPayments.filter(p => p.isVerified).length;

    return NextResponse.json({
      data: enrichedPayments,
      summary: {
        total: enrichedPayments.length,
        verified: totalVerified,
        unverified: totalUnverified,
      },
    });
  } catch (error) {
    console.error('Error fetching verification data:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
