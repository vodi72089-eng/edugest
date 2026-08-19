import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, sanitizeError } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, 'homework:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;
    const { id: homeworkId } = await params;

    const homework = await db.homework.findUnique({ where: { id: homeworkId } });
    if (!homework) {
      return NextResponse.json({ error: 'Devoir non trouvé' }, { status: 404 });
    }

    await db.homeworkRead.upsert({
      where: { userId_homeworkId: { userId: user.id, homeworkId } },
      update: { readAt: new Date() },
      create: { userId: user.id, homeworkId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error marking homework as read:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}