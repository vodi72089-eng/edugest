import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sanitizeError } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;
    const { id: communicationId } = await params;

    const communication = await db.communication.findUnique({ where: { id: communicationId } });
    if (!communication) {
      return NextResponse.json({ error: 'Communication non trouvée' }, { status: 404 });
    }

    const existing = await db.communicationRead.findUnique({
      where: { userId_communicationId: { userId: user.id, communicationId } },
    });

    if (!existing) {
      await db.communicationRead.create({
        data: { userId: user.id, communicationId },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error marking communication as read:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
