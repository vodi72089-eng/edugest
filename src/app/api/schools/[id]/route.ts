import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission, requireRole, verifySchoolAccess, sanitizeError, type AuthUser } from '@/lib/auth';
import { archiveExcessStudents, restoreArchivedStudents } from '@/lib/archive';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Allow public access for active schools (SchoolDetailView is public)
    // Authenticated users get school access verification
    let user: AuthUser | null = null;
    try {
      const authResult = await requirePermission(request, 'school:read');
      if (!('error' in authResult)) {
        user = authResult.user;
      }
    } catch {}

    if (user && !verifySchoolAccess(user, id)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    const school = await db.school.findUnique({
      where: { id, isActive: true },
      include: {
        classes: {
          include: {
            _count: { select: { students: true } },
          },
          orderBy: { name: 'asc' },
        },
        schoolYears: { orderBy: { createdAt: 'desc' } },
        users: {
          select: { id: true, name: true, email: true, role: true, isActive: true },
        },
        comments: {
          where: { isApproved: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        // Galerie publique + événements visibles sur la page vitrine de
        // l'école (SchoolDetailView) : uniquement les événements « Tout le
        // monde » (audience=ALL) — PERSONNEL/PARENTS restent internes.
        schoolPhotos: { orderBy: { createdAt: 'desc' } },
        events: {
          where: { audience: 'ALL', startAt: { gte: new Date() } },
          orderBy: { startAt: 'asc' },
          take: 20,
        },
        _count: {
          select: { students: true, classes: true, users: true },
        },
      },
    });

    if (!school) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    // ── SÉCURITÉ (P1) : la liste du personnel (noms, EMAILS, rôles) n'est
    // plus exposée aux visiteurs anonymes — réservée aux utilisateurs
    // authentifiés habilités (school:read).
    const data = user ? school : { ...school, users: [] };

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error getting school:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { id } = await params;

    // ── RÈGLES DE MODIFICATION ────────────────────────────────────────────────
    // - SUPER_ADMIN_GLOBAL : modification complète (permission school:update).
    // - SCHOOL_ADMIN : peut modifier UNIQUEMENT la photo (logo) et la couverture
    //   de SA PROPRE école, quel que soit le forfait (la photo est un besoin de
    //   base, pas une feature payante). Les autres champs (nom, forfait…)
    //   restent réservés au SUPER_ADMIN / au flux d'approbation.
    const isSchoolAdminSelf = user.role === 'SCHOOL_ADMIN' && user.schoolId === id
    if (!isSchoolAdminSelf) {
      const permCheck = await requirePermission(request, 'school:update');
      if ('error' in permCheck) return permCheck.error;
    }
    if (user.role !== 'SUPER_ADMIN_GLOBAL' && !isSchoolAdminSelf) {
      return NextResponse.json(
        { error: 'Seul un SUPER_ADMIN_GLOBAL peut modifier une école' },
        { status: 403 }
      );
    }

    // Verify school access
    if (!verifySchoolAccess(user, id)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    const body = await request.json();

    const existing = await db.school.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    // FIX: Mass assignment vulnerability - use explicit allowlist of fields
    const allowedFields = [
      'name', 'shortName', 'email', 'phone', 'address', 'city', 'province',
      'country', 'latitude', 'longitude', 'description', 'history', 'mission',
      'establishmentYear', 'schoolType', 'schoolCategory', 'logo', 'coverImage',
      'subscriptionTier', 'subscriptionStatus', 'subscriptionStartDate',
      'subscriptionEndDate', 'isActive', 'maxStudents',
      'educationalSystem', 'schoolLevel',
    ];

    const updateData: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // SCHOOL_ADMIN : seuls logo/coverImage de sa propre école sont modifiables
    if (isSchoolAdminSelf) {
      for (const key of Object.keys(updateData)) {
        if (key !== 'logo' && key !== 'coverImage') delete updateData[key];
      }
    }

    // ── COHÉRENCE FORFAIT ⇄ ÉLÈVES : tout changement de tier via cette route
    // doit réellement AJOUTER/RETIRER les élèves au-delà de la nouvelle limite
    // (downgrade → archivage des excédents ; upgrade → restauration).
    let tierChange: { archived: number; restored: number } | null = null;
    const newTier = typeof updateData.subscriptionTier === 'string' ? updateData.subscriptionTier : null;
    if (newTier && newTier !== existing.subscriptionTier) {
      const tierOrder = ['FREEMIUM', 'ESSENTIEL', 'STANDARD', 'PREMIUM', 'ENTERPRISE', 'CORPORATE'];
      const oldIdx = tierOrder.indexOf(existing.subscriptionTier || 'FREEMIUM');
      const newIdx = tierOrder.indexOf(newTier);
      if (newIdx < oldIdx) {
        const { archived } = await archiveExcessStudents(id, newTier);
        tierChange = { archived, restored: 0 };
      } else if (newIdx > oldIdx) {
        const { restored } = await restoreArchivedStudents(id, newTier);
        tierChange = { archived: 0, restored };
      }
    }

    const school = await db.school.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      data: school,
      ...(tierChange ? {
        message:
          tierChange.archived > 0
            ? `${tierChange.archived} élève(s) archivé(s) : limite du forfait ${newTier} appliquée.`
            : tierChange.restored > 0
              ? `${tierChange.restored} élève(s) restauré(s) après extension du forfait.`
              : undefined,
        tierChange,
      } : {}),
    });
  } catch (error) {
    console.error('Error updating school:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Only SUPER_ADMIN_GLOBAL can delete schools
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { id } = await params;

    // Verify school access
    if (!verifySchoolAccess(user, id)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    const existing = await db.school.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    // Soft delete
    const school = await db.school.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ data: school, message: 'School deactivated successfully' });
  } catch (error) {
    console.error('Error deleting school:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
