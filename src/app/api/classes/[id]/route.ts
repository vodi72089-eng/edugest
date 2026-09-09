import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, verifySchoolAccess, sanitizeError } from '@/lib/auth';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requirePermission(request, 'classes:delete');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { id } = await params;
    const existing = await db.class.findUnique({ where: { id }, include: { _count: { select: { students: true } } } });
    if (!existing) return NextResponse.json({ error: 'Classe non trouvée' }, { status: 404 });
    if (!verifySchoolAccess(user, existing.schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }
    if (existing._count.students > 0) {
      return NextResponse.json({ error: `Impossible de supprimer: ${existing._count.students} élève(s) inscrit(s) dans cette classe` }, { status: 400 });
    }

    await db.class.delete({ where: { id } });

    // Garder le compteur dénormalisé de l'école cohérent (inverse du POST)
    await db.school.update({
      where: { id: existing.schoolId },
      data: { classCount: { decrement: 1 } },
    });

    return NextResponse.json({ message: 'Classe supprimée avec succès' });
  } catch (error) {
    console.error('Error deleting class:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requirePermission(request, 'classes:update');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { id } = await params;
    const body = await request.json();
    const { name, section, level, capacity } = body;

    const existing = await db.class.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Classe non trouvée' }, { status: 404 });
    if (!verifySchoolAccess(user, existing.schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (section !== undefined) updateData.section = section;
    if (level !== undefined) updateData.level = level;
    if (capacity !== undefined) updateData.capacity = capacity;

    // Vérifier les doublons de nom dans la même école/année scolaire,
    // sinon Prisma renverrait une 500 à la place d'une 409 propre.
    if (name !== undefined && typeof name === 'string' && name.trim()) {
      const duplicate = await db.class.findFirst({
        where: {
          name: name.trim(),
          schoolYearId: existing.schoolYearId,
          NOT: { id },
        },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: `Class "${name.trim()}" already exists for this school year` },
          { status: 409 }
        );
      }
    }

    const updated = await db.class.update({ where: { id }, data: updateData });
    return NextResponse.json({ data: updated, message: 'Classe mise à jour' });
  } catch (error) {
    console.error('Error updating class:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
