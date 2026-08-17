import { db } from '@/lib/db';
import { requirePermission, verifySchoolAccess, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, 'payments:update');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { id } = await params;
    const body = await request.json();

    const existing = await db.paymentRecord.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Payment record not found' }, { status: 404 });
    }

    // Verify school access
    if (!verifySchoolAccess(user, existing.schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

    // Determine if user has payments:verify permission for financial fields
    const verifyResult = await requirePermission(request, 'payments:verify');
    const hasVerifyPermission = !('error' in verifyResult);

    // Fields that only users with payments:verify can modify
    const restrictedFields = ['verifiedBy', 'verifiedAt', 'verificationNote', 'status', 'paidAmount'];
    // Fields that any user with payments:update can modify
    const regularFields = ['paymentMethod', 'referenceNumber', 'receiptNumber'];

    const updateData: Record<string, unknown> = {};

    // Regular users can only update non-financial fields
    for (const field of regularFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Only users with payments:verify can modify financial/restricted fields
    if (hasVerifyPermission) {
      for (const field of restrictedFields) {
        if (body[field] !== undefined) {
          // CRITICAL: verifiedBy must always come from the authenticated user,
          // never from the request body (prevents identity spoofing)
          updateData[field] = field === 'verifiedBy' ? user.name : body[field];
        }
      }

      // If status changed to PAID, set paidAt
      if (body.status === 'PAID' && existing.status !== 'PAID') {
        updateData.paidAt = new Date();
      }
    } else {
      // Check if user tried to modify restricted fields without permission
      const attemptedRestricted = restrictedFields.filter(f => body[f] !== undefined);
      if (attemptedRestricted.length > 0) {
        return NextResponse.json(
          { error: 'Vous n\'avez pas la permission de modifier les champs financiers: ' + attemptedRestricted.join(', ') },
          { status: 403 }
        );
      }
    }

    const payment = await db.paymentRecord.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ data: payment });
  } catch (error) {
    console.error('Error updating payment:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
