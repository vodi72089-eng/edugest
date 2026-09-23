import { NextRequest, NextResponse } from 'next/server';
import { requireRole, sanitizeError } from '@/lib/auth';
import { notify } from '@/lib/notify';
import { db } from '@/lib/db';

/**
 * POST /api/platform-announcements — Annonce plateforme (nouveautés, infos).
 * Réservé au SUPER_ADMIN_GLOBAL. Crée une notification in-app (+ push) pour
 * les administrateurs des écoles ciblées (toutes si schoolId omis).
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;

    const body = await request.json();
    const { schoolId, title, message } = body as {
      schoolId?: string | null;
      title?: string;
      message?: string;
    };

    if (!title?.trim() || !message?.trim()) {
      return NextResponse.json(
        { error: 'Titre et message requis' },
        { status: 400 }
      );
    }

    const schools = await db.school.findMany({
      where: {
        isActive: true,
        ...(schoolId ? { id: schoolId } : {}),
      },
      select: { id: true, name: true },
    });
    if (schools.length === 0) {
      return NextResponse.json({ error: 'Aucune école cible' }, { status: 404 });
    }

    const admins = await db.user.findMany({
      where: {
        schoolId: { in: schools.map((s) => s.id) },
        role: { in: ['SCHOOL_ADMIN'] },
        isActive: true,
      },
      select: { id: true, schoolId: true },
    });

    let sent = 0;
    for (const admin of admins) {
      try {
        await notify({
          data: {
            userId: admin.id,
            schoolId: admin.schoolId,
            type: 'PLATFORM_ANNOUNCEMENT',
            title: title.trim(),
            message: message.trim(),
          },
        });
        sent++;
      } catch {
        /* un destinataire en échec ne bloque pas les autres */
      }
    }

    return NextResponse.json({
      data: { sent, schools: schools.length },
    });
  } catch (error) {
    console.error('Error sending platform announcement:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
