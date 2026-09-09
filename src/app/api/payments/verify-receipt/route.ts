import { db } from '@/lib/db';
import { requirePermission, verifySchoolAccess, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/payments/verify-receipt?id=xxx&schoolId=yyy — Find payment by ID or receipt number
export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'payments:verify');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id') || '';
    const schoolId = searchParams.get('schoolId') || '';

    if (!id) {
      return NextResponse.json({ error: 'id est requis' }, { status: 400 });
    }

    if (schoolId && !verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

    const q = id.trim().toLowerCase();
    const qNoHyphens = q.replace(/-/g, '');

    // Search by exact ID, receipt number, reference number, or partial matches
    const payment = await db.paymentRecord.findFirst({
      where: schoolId ? { schoolId } : {},
      include: {
        school: { select: { name: true, shortName: true } },
      },
    });

    // Try to find matching payment
    const whereClause: Record<string, unknown> = schoolId ? { schoolId } : {};

    // First: try exact match on common fields
    const candidates = await db.paymentRecord.findMany({
      where: whereClause,
      take: 1000,
      orderBy: { createdAt: 'desc' },
    });

    const match = candidates.find(p => {
      // Exact ID match
      if (p.id.toLowerCase() === q) return true;
      // ID without hyphens
      if (p.id.toLowerCase().replace(/-/g, '') === qNoHyphens) return true;
      // Last 8 chars of ID
      if (p.id.slice(-8).toLowerCase() === q.slice(-8)) return true;
      // Receipt number
      if (p.receiptNumber && p.receiptNumber.toLowerCase() === q) return true;
      // Reference number
      if (p.referenceNumber && p.referenceNumber.toLowerCase() === q) return true;
      // Partial containment
      if (q.includes(p.id.toLowerCase()) || q.includes(p.id.slice(-8).toLowerCase())) return true;
      if (p.id.toLowerCase().includes(q) || p.id.slice(-8).toLowerCase().includes(q)) return true;
      if (p.receiptNumber && (q.includes(p.receiptNumber.toLowerCase()) || p.receiptNumber.toLowerCase().includes(q))) return true;
      if (p.referenceNumber && (q.includes(p.referenceNumber.toLowerCase()) || p.referenceNumber.toLowerCase().includes(q))) return true;
      return false;
    });

    if (!match) {
      return NextResponse.json({ error: 'Aucun paiement trouvé' }, { status: 404 });
    }

    // Enrich with student data
    const student = await db.student.findUnique({
      where: { id: match.studentId },
      select: { id: true, firstName: true, lastName: true, matricule: true, photoUrl: true },
    });

    return NextResponse.json({
      data: {
        ...match,
        student: student || null,
        isVerified: !!match.verifiedBy,
      },
    });
  } catch (error) {
    console.error('Error verifying receipt:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
