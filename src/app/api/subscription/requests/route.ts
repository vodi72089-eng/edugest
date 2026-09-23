import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole, sanitizeError } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const schoolId = searchParams.get('schoolId');

    const where: any = {};
    if (status) where.status = status;
    if (schoolId) where.schoolId = schoolId;

    const requests = await db.subscriptionRequest.findMany({
      where,
      include: {
        school: {
          select: {
            id: true,
            name: true,
            shortName: true,
            subscriptionTier: true,
            city: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ data: requests });
  } catch (error) {
    console.error('Error fetching subscription requests:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
