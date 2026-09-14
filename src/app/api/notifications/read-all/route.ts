import { db } from '@/lib/db';
import { requirePermission, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'stats:read');
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
