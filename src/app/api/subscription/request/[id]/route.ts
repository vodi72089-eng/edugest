import { db } from '@/lib/db';
import { requireRole, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    if (!status || !['APPROVED', 'REJECTED'].includes(status)) {
      return NextResponse.json({ error: 'Status invalide (APPROVED ou REJECTED)' }, { status: 400 });
    }

    const subRequest = await db.subscriptionRequest.findUnique({ where: { id } });
    if (!subRequest) {
      return NextResponse.json({ error: 'Demande non trouvée' }, { status: 404 });
    }
    if (subRequest.status !== 'PENDING') {
      return NextResponse.json({ error: 'Demande déjà traitée' }, { status: 409 });
    }

    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + 1);

    await db.subscriptionRequest.update({
      where: { id },
      data: {
        status,
        resolvedByName: user.name,
        resolvedById: user.id,
        resolvedAt: now,
      },
    });

    // If approved, update school subscription
    if (status === 'APPROVED') {
      await db.school.update({
        where: { id: subRequest.schoolId },
        data: {
          subscriptionTier: subRequest.requestedTier,
          subscriptionStatus: 'ACTIVE',
          subscriptionStartDate: now,
          subscriptionEndDate: endDate,
        },
      });

      // Record subscription payment
      const { SUBSCRIPTION_PRICES } = await import('@/lib/subscription');
      const amount = SUBSCRIPTION_PRICES[subRequest.requestedTier] || 0;

      if (amount > 0) {
        await db.paymentRecord.create({
          data: {
            studentId: '__subscription__',
            schoolId: subRequest.schoolId,
            amount: amount * 100,
            paidAmount: amount * 100,
            trimester: 'ABONNEMENT',
            paymentMethod: 'CASH',
            referenceNumber: `SUB-UPGRADE-${Date.now()}`,
            status: 'PAID',
            paidAt: now,
            receiptNumber: `REC-UPGRADE-${Date.now().toString(36).toUpperCase()}`,
          },
        });
      }

      // Audit log
      await db.auditLog.create({
        data: {
          userId: user.id,
          userName: user.name,
          userRole: user.role,
          action: 'SUBSCRIPTION_UPGRADE_APPROVED',
          entityType: 'School',
          entityId: subRequest.schoolId,
          details: `Upgrade ${subRequest.currentTier} → ${subRequest.requestedTier} (demande de ${subRequest.requestedByName})`,
        },
      });
    }

    // Notify school users of decision
    const schoolUsers = await db.user.findMany({
      where: { schoolId: subRequest.schoolId, isActive: true },
      select: { id: true },
    });

    for (const u of schoolUsers) {
      await db.notification.create({
        data: {
          userId: u.id,
          schoolId: subRequest.schoolId,
          type: 'SYSTEM',
          title: status === 'APPROVED' ? 'Abonnement mis à jour' : 'Demande d\'upgrade refusée',
          message: status === 'APPROVED'
            ? `Votre abonnement est maintenant ${subRequest.requestedTier}. Valide jusqu'au ${endDate.toLocaleDateString('fr-FR')}.`
            : `Votre demande de passage vers ${subRequest.requestedTier} a été refusée.`,
          linkTo: 'settings',
        },
      });
    }

    return NextResponse.json({
      data: {
        id: subRequest.id,
        status,
        schoolId: subRequest.schoolId,
        requestedTier: subRequest.requestedTier,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
