import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, verifySchoolAccess, sanitizeError } from '@/lib/auth';
import { getArchivedStudents } from '@/lib/archive';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, 'students:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { id } = await params;

    // Vérifier l'accès à l'école
    if (!verifySchoolAccess(user, id)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    const archivedStudents = await getArchivedStudents(id);

    return NextResponse.json({ data: archivedStudents });
  } catch (error) {
    console.error('Error fetching archived students:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
