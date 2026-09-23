import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, sanitizeError } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, 'convocations:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;
    const { id: convocationId } = await params;

    const convocation = await db.convocation.findUnique({ where: { id: convocationId } });
    if (!convocation) {
      return NextResponse.json({ error: 'Convocation non trouvée' }, { status: 404 });
    }

    await db.convocationRead.upsert({
      where: { userId_convocationId: { userId: user.id, convocationId } },
      update: { readAt: new Date() },
      create: { userId: user.id, convocationId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error marking convocation as read:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}