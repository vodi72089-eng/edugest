import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sanitizeError } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;
    if (!user.schoolId) {
      return NextResponse.json({ error: 'École introuvable' }, { status: 404 });
    }

    const school = await db.school.findUnique({
      where: { id: user.schoolId },
      select: {
        subscriptionTier: true,
        subscriptionStatus: true,
        subscriptionStartDate: true,
        subscriptionEndDate: true,
      },
    });

    if (!school) {
      return NextResponse.json({ error: 'École introuvable' }, { status: 404 });
    }

    let daysRemaining: number | null = null;
    if (school.subscriptionEndDate) {
      const endDate = new Date(school.subscriptionEndDate);
      const now = new Date();
      const remaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      daysRemaining = remaining < 0 ? 0 : remaining;
    }

    const pendingRequest = await db.subscriptionRequest.findFirst({
      where: {
        schoolId: user.schoolId,
        status: { in: ['PENDING', 'PAID'] },
      },
      select: {
        id: true,
        requestedTier: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      data: {
        tier: school.subscriptionTier || 'FREEMIUM',
        status: school.subscriptionStatus || 'ACTIVE',
        startDate: school.subscriptionStartDate,
        endDate: school.subscriptionEndDate,
        daysRemaining,
        pendingRequest,
      },
    });
  } catch (error) {
    console.error('Error fetching subscription status:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
