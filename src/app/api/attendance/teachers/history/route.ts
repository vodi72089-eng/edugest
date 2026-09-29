import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, verifySchoolAccess, sanitizeError } from '@/lib/auth';

// ─── Historique de présence d'un professeurs (filtres classe / jour) ─────────
// GET /api/attendance/teachers/history?teacherId=…&from=YYYY-MM-DD&to=YYYY-MM-DD
// GET /api/attendance/teachers/history?schoolId=…&date=YYYY-MM-DD (tout l'école)

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'attendance:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    if (user.role === 'PARENT') {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const teacherId = searchParams.get('teacherId') || '';
    const schoolId = searchParams.get('schoolId') || (user.role === 'SUPER_ADMIN_GLOBAL' ? '' : user.schoolId || '');
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';
    const date = searchParams.get('date') || '';

    if (!schoolId) {
      return NextResponse.json({ error: 'School ID required' }, { status: 403 });
    }
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    const where: Record<string, unknown> = { schoolId };
    if (teacherId) where.teacherId = teacherId;
    if (date) where.date = date;
    if (from || to) {
      where.date = {};
      if (from) (where.date as Record<string, string>).gte = from;
      if (to) (where.date as Record<string, string>).lte = to;
    }

    const records = await db.teacherAttendanceRecord.findMany({
      where,
      orderBy: [{ date: 'desc' }],
      take: 500,
      include: {
        teacher: { select: { id: true, name: true, email: true, role: true, subjectName: true, classNames: true } },
      },
    });

    // Comptes pour le PDF
    const stats = { present: 0, absent: 0, late: 0, total: records.length };
    for (const r of records) {
      if (r.status === 'PRESENT') stats.present++;
      else if (r.status === 'ABSENT') stats.absent++;
      else if (r.status === 'LATE') stats.late++;
    }

    return NextResponse.json({ data: { records, stats } });
  } catch (error) {
    console.error('Error listing teacher attendance history:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
