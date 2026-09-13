import { db } from '@/lib/db';
import { requireRole, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

// QR codes d'inscription parent — réservés aux administrateurs de l'école
const QR_ADMIN_ROLES = ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN', 'SECRETARY', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE'];

// DELETE /api/school-qr-codes/[id] — révoque (désactive) un QR code
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireRole(request, QR_ADMIN_ROLES);
    if ('error' in auth) return auth.error;
    const { user } = auth;

    const { id } = await params;

    const qr = await db.schoolQrCode.findUnique({ where: { id } });
    if (!qr) {
      return NextResponse.json({ error: 'QR code non trouvé' }, { status: 404 });
    }
    if (user.role !== 'SUPER_ADMIN_GLOBAL' && qr.schoolId !== user.schoolId) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    await db.schoolQrCode.update({ where: { id }, data: { isActive: false } });

    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error('Error revoking QR code:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
