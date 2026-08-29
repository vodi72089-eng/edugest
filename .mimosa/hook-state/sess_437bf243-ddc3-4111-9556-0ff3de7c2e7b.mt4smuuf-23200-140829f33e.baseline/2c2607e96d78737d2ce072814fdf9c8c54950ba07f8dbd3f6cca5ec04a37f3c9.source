import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, sanitizeError } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, 'communications:create');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;
    const { id } = await params;

    if (!['SUPER_ADMIN_GLOBAL', 'ADMIN'].includes(user.role)) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const body = await request.json();
    const { action } = body; // 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
    }

    const comm = await db.communication.findUnique({ where: { id } });
    if (!comm) {
      return NextResponse.json({ error: 'Communication non trouvée' }, { status: 404 });
    }

    if (comm.status !== 'PENDING') {
      return NextResponse.json({ error: 'Communication déjà traitée' }, { status: 400 });
    }

    const newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';
    const updated = await db.communication.update({
      where: { id },
      data: { status: newStatus },
    });

    await db.notification.create({
      data: {
        userId: comm.senderId,
        schoolId: comm.schoolId,
        type: newStatus === 'APPROVED' ? 'COMMUNICATION_APPROVED' : 'COMMUNICATION_REJECTED',
        title: newStatus === 'APPROVED' ? 'Communication approuvée' : 'Communication rejetée',
        message: `Votre communication "${comm.title}" a été ${newStatus === 'APPROVED' ? 'approuvée' : 'rejetée'} par l'admin.`,
        isRead: false,
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('Error approving communication:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
