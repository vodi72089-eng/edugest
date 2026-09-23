import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole, sanitizeError } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

// ─── /api/corporates/[id]/schools — rattachement d'écoles à un corporate ───
// POST { schoolId }  → rattache | DELETE ?schoolId=… → détache (SAG uniquement)

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;
    const { user: admin } = authResult;
    const { id } = await params;
    const body = await request.json();
    const { schoolId } = body;
    if (!schoolId) return NextResponse.json({ error: 'schoolId requis' }, { status: 400 });

    const [corporate, school] = await Promise.all([
      db.corporate.findUnique({ where: { id } }),
      db.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true } }),
    ]);
    if (!corporate) return NextResponse.json({ error: 'Corporate introuvable' }, { status: 404 });
    if (!school) return NextResponse.json({ error: 'École introuvable' }, { status: 404 });

    await db.corporateSchool.upsert({
      where: { corporateId_schoolId: { corporateId: id, schoolId } },
      create: { corporateId: id, schoolId },
      update: {},
    });

    await logAudit({
      action: 'CORP_SCHOOL_ASSIGNED',
      userId: admin.id, userName: admin.name, userRole: admin.role,
      entityType: 'Corporate', entityId: id,
      schoolId,
      details: `École « ${school.name} » rattachée au corporate « ${corporate.name} »`,
      meta: { corporate: corporate.name, school: school.name },
    });

    return NextResponse.json({ data: { ok: true } }, { status: 201 });
  } catch (error) {
    console.error('[Corporates:schools] POST error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;
    const { user: admin } = authResult;
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');
    if (!schoolId) return NextResponse.json({ error: 'schoolId requis' }, { status: 400 });

    const link = await db.corporateSchool.findUnique({
      where: { corporateId_schoolId: { corporateId: id, schoolId } },
      include: { corporate: { select: { name: true } }, school: { select: { name: true } } },
    });
    if (!link) return NextResponse.json({ error: 'Rattachement introuvable' }, { status: 404 });

    await db.corporateSchool.delete({ where: { id: link.id } });

    await logAudit({
      action: 'CORP_SCHOOL_UNASSIGNED',
      userId: admin.id, userName: admin.name, userRole: admin.role,
      entityType: 'Corporate', entityId: id,
      schoolId,
      details: `École « ${link.school.name} » détachée du corporate « ${link.corporate.name} »`,
    });

    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error('[Corporates:schools] DELETE error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
