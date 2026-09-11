import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole, sanitizeError } from '@/lib/auth';
import { archiveExcessStudents, restoreArchivedStudents } from '@/lib/archive';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { requestId, action } = body;

    if (!requestId || !action) {
      return NextResponse.json(
        { error: 'requestId et action requis' },
        { status: 400 }
      );
    }

    if (!['APPROVE', 'REJECT'].includes(action)) {
      return NextResponse.json(
        { error: 'Action invalide (APPROVE ou REJECT)' },
        { status: 400 }
      );
    }

    const subscriptionRequest = await db.subscriptionRequest.findUnique({
      where: { id: requestId },
      include: { school: true },
    });

    if (!subscriptionRequest) {
      return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
    }

    if (subscriptionRequest.status !== 'PENDING' && subscriptionRequest.status !== 'PAID') {
      return NextResponse.json(
        { error: 'Cette demande a déjà été traitée' },
        { status: 400 }
      );
    }

    if (action === 'REJECT') {
      await db.subscriptionRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          resolvedByName: user.name,
          resolvedById: user.id,
          resolvedAt: new Date(),
        },
      });
      return NextResponse.json({ message: 'Demande rejetée' });
    }

    const newTier = subscriptionRequest.requestedTier;
    const schoolId = subscriptionRequest.schoolId;
    const currentTier = subscriptionRequest.currentTier;
    const tierOrder = ['FREEMIUM', 'ESSENTIEL', 'STANDARD', 'PREMIUM', 'ENTERPRISE', 'CORPORATE'];
    const currentIndex = tierOrder.indexOf(currentTier);
    const newIndex = tierOrder.indexOf(newTier);

    if (newIndex < currentIndex) {
      await archiveExcessStudents(schoolId, newTier);
    } else if (newIndex > currentIndex) {
      await restoreArchivedStudents(schoolId, newTier);
    }

    await db.school.update({
      where: { id: schoolId },
      data: {
        subscriptionTier: newTier,
        subscriptionStatus: 'ACTIVE',
        subscriptionStartDate: new Date(),
        subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    await db.subscriptionRequest.update({
      where: { id: requestId },
      data: {
        status: 'VALIDATED',
        resolvedByName: user.name,
        resolvedById: user.id,
        resolvedAt: new Date(),
      },
    });

    return NextResponse.json({
      message: `Abonnement ${newTier} activé pour ${subscriptionRequest.school.name}`,
    });
  } catch (error) {
    console.error('Error validating subscription:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}