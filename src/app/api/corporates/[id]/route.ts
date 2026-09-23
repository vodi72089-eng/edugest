import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole, sanitizeError } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

// ─── /api/corporates/[id] — détail / mise à jour / suppression (SAG) ───────

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL', 'SUPPORT_AGENT']);
    if ('error' in authResult) return authResult.error;
    const { id } = await params;

    const corporate = await db.corporate.findUnique({
      where: { id },
      include: {
        schools: { include: { school: { select: { id: true, name: true, shortName: true, city: true, studentCount: true, subscriptionTier: true, isActive: true } } } },
        users: { include: { user: { select: { id: true, name: true, email: true, phone: true, isActive: true, lastLoginAt: true } } } },
        tickets: { orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, ref: true, subject: true, status: true, priority: true, createdAt: true } },
      },
    });
    if (!corporate) return NextResponse.json({ error: 'Corporate introuvable' }, { status: 404 });

    return NextResponse.json({
      data: {
        ...corporate,
        schools: corporate.schools.map(cs => cs.school),
        users: corporate.users.map(cu => ({ ...cu.user, corporateRole: cu.role })),
      },
    });
  } catch (error) {
    console.error('[Corporates:id] GET error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

// PUT — mises à jour : { status? | notes? | contactName? | contactEmail? | contactPhone? | city? | name? }
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;
    const { user: admin } = authResult;
    const { id } = await params;
    const body = await request.json();

    const existing = await db.corporate.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Corporate introuvable' }, { status: 404 });

    const data: Record<string, string> = {};
    for (const field of ['name', 'contactName', 'contactEmail', 'contactPhone', 'city', 'notes', 'status'] as const) {
      if (body[field] !== undefined) data[field] = String(body[field]);
    }
    if (body.status && !['ACTIVE', 'SUSPENDED'].includes(body.status)) {
      return NextResponse.json({ error: 'Statut invalide (ACTIVE ou SUSPENDED)' }, { status: 400 });
    }

    const corporate = await db.corporate.update({ where: { id }, data });

    await logAudit({
      action: body.status ? (body.status === 'ACTIVE' ? 'CORP_ACTIVATED' : 'CORP_SUSPENDED') : 'CORP_UPDATED',
      userId: admin.id, userName: admin.name, userRole: admin.role,
      entityType: 'Corporate', entityId: id,
      details: `Corporate « ${corporate.name} » mis à jour${body.status ? ` → ${body.status}` : ''}`,
      meta: { changes: data },
    });

    return NextResponse.json({ data: { id: corporate.id } });
  } catch (error) {
    console.error('[Corporates:id] PUT error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;
    const { user: admin } = authResult;
    const { id } = await params;

    const corporate = await db.corporate.findUnique({ where: { id }, include: { schools: true, users: true } });
    if (!corporate) return NextResponse.json({ error: 'Corporate introuvable' }, { status: 404 });
    if (corporate.users.length > 0) {
      return NextResponse.json({ error: 'Supprimez d\u2019abord les comptes rattachés à ce corporate' }, { status: 400 });
    }

    await db.corporate.delete({ where: { id } });

    await logAudit({
      action: 'CORP_DELETED',
      userId: admin.id, userName: admin.name, userRole: admin.role,
      entityType: 'Corporate', entityId: id,
      details: `Corporate « ${corporate.name} » supprimé (${corporate.schools.length} écoles détachées)`,
    });

    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    console.error('[Corporates:id] DELETE error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
