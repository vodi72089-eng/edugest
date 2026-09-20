import { db } from '@/lib/db';
import { requirePermission, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

/**
 * « Tout marquer comme lu » — IMPLÉMENTATION UNIQUE.
 * Permission : « notifications:read » (et non « stats:read » — sinon
 * TEACHER / MEDICAL / EPS recevaient un 403 sur cette action).
 * Le frontend n'applique l'état lu localement QUE si cette route répond 200.
 */
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'notifications:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    await db.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
