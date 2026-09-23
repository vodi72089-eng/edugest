import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole, verifySchoolAccess, sanitizeError } from '@/lib/auth';

// ─── Événement scolaire (édition / suppression) ─────────────────────────────
// PUT    /api/events/[id] — mêmes rôles que la création, même école
// DELETE /api/events/[id] — SUPER_ADMIN_GLOBAL et SCHOOL_ADMIN uniquement

// Mêmes listes que /api/events/route.ts (non exportées — contrainte Next.js
// sur les exports autorisés dans un fichier route.ts).
const EVENT_WRITE_ROLES = [
  'SUPER_ADMIN_GLOBAL',
  'SCHOOL_ADMIN',
  'DIRECTION_MATERNELLE',
  'DIRECTION_PRIMAIRE',
  'DIRECTION_SECONDAIRE',
  'SECRETARY',
];
const EVENT_CATEGORIES = ['REUNION', 'EXAMEN', 'FETE', 'REUNION_PARENTS', 'SORTIE', 'AUTRE'];
const EVENT_AUDIENCES = ['ALL', 'PERSONNEL', 'PARENTS'];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireRole(request, EVENT_WRITE_ROLES);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { id } = await params;
    const existing = await db.schoolEvent.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Événement non trouvé' }, { status: 404 });
    }
    if (!verifySchoolAccess(user, existing.schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }
    const { title, description, category, startAt, endAt, location, audience } = body as {
      title?: string;
      description?: string;
      category?: string;
      startAt?: string;
      endAt?: string | null;
      location?: string;
      audience?: string;
    };

    const data: Record<string, unknown> = {};

    if (title !== undefined) {
      const cleanTitle = (title || '').trim();
      if (!cleanTitle) {
        return NextResponse.json({ error: 'Le titre est obligatoire' }, { status: 400 });
      }
      data.title = cleanTitle;
    }
    if (description !== undefined) {
      data.description = (description || '').trim() || null;
    }
    if (category !== undefined) {
      data.category = EVENT_CATEGORIES.includes(category) ? category : 'AUTRE';
    }
    let startDate: Date | null = null;
    if (startAt !== undefined) {
      startDate = new Date(startAt);
      if (isNaN(startDate.getTime())) {
        return NextResponse.json({ error: 'Date de début invalide' }, { status: 400 });
      }
      data.startAt = startDate;
    }
    if (endAt !== undefined) {
      if (endAt === null || endAt === '') {
        data.endAt = null;
      } else {
        const d = new Date(endAt);
        if (isNaN(d.getTime())) {
          return NextResponse.json({ error: 'Date de fin invalide' }, { status: 400 });
        }
        const base = startDate || existing.startAt;
        if (d.getTime() < base.getTime()) {
          return NextResponse.json({ error: 'La fin doit être après le début' }, { status: 400 });
        }
        data.endAt = d;
      }
    }
    if (location !== undefined) {
      data.location = (location || '').trim() || null;
    }
    if (audience !== undefined) {
      data.audience = EVENT_AUDIENCES.includes(audience) ? audience : 'ALL';
    }

    const event = await db.schoolEvent.update({
      where: { id },
      data,
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        startAt: true,
        endAt: true,
        location: true,
        audience: true,
        createdBy: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ data: event });
  } catch (error) {
    console.error('Error updating event:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN']);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { id } = await params;
    const existing = await db.schoolEvent.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Événement non trouvé' }, { status: 404 });
    }
    if (!verifySchoolAccess(user, existing.schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    await db.schoolEvent.delete({ where: { id } });

    return NextResponse.json({ data: { ok: true, id } });
  } catch (error) {
    console.error('Error deleting event:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
