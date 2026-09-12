import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole, sanitizeError } from '@/lib/auth';

/**
 * PATCH /api/platform-events/[id] — SUPER_ADMIN_GLOBAL uniquement
 * Met à jour un événement plateforme (officialDate, visibleDaysBefore, enabled, message).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;

    const { id } = await params;
    const existing = await db.platformEvent.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Événement non trouvé' }, { status: 404 });
    }

    const body = await request.json();
    const { officialDate, visibleDaysBefore, enabled, message, schoolYearLabel } = body;

    const data: Record<string, unknown> = {};
    if (officialDate !== undefined) {
      const d = new Date(officialDate);
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: 'officialDate invalide (date ISO attendue)' }, { status: 400 });
      }
      data.officialDate = d;
    }
    if (visibleDaysBefore !== undefined) {
      const days = Math.max(0, Math.floor(Number(visibleDaysBefore)));
      if (isNaN(days)) {
        return NextResponse.json({ error: 'visibleDaysBefore invalide' }, { status: 400 });
      }
      data.visibleDaysBefore = days;
    }
    if (enabled !== undefined) data.enabled = Boolean(enabled);
    if (message !== undefined) data.message = message || null;
    if (schoolYearLabel !== undefined) data.schoolYearLabel = schoolYearLabel || null;

    const event = await db.platformEvent.update({ where: { id }, data });

    return NextResponse.json({ data: event });
  } catch (error) {
    console.error('[PlatformEvents] PATCH error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

/**
 * DELETE /api/platform-events/[id] — SUPER_ADMIN_GLOBAL uniquement
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;

    const { id } = await params;
    const existing = await db.platformEvent.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Événement non trouvé' }, { status: 404 });
    }

    await db.platformEvent.delete({ where: { id } });

    return NextResponse.json({ data: { success: true } });
  } catch (error) {
    console.error('[PlatformEvents] DELETE error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
