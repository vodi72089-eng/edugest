import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, verifySchoolAccess, sanitizeError } from '@/lib/auth';
import { buildTeacherAttendancePDF } from '@/lib/attendance-pdf';

// ─── PDF de présence d'un professeurs ────────────────────────────────────────
// GET /api/attendance/teachers/history/pdf?teacherId=…&from=…&to=…

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

    if (!teacherId || !schoolId) {
      return NextResponse.json({ error: 'teacherId et schoolId requis' }, { status: 400 });
    }
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    const teacher = await db.user.findUnique({
      where: { id: teacherId },
      select: { id: true, name: true, email: true, role: true, subjectName: true, classNames: true, schoolId: true },
    });
    if (!teacher || teacher.schoolId !== schoolId) {
      return NextResponse.json({ error: 'Professeur non trouvé' }, { status: 404 });
    }

    const where: Record<string, unknown> = { schoolId, teacherId };
    if (from || to) {
      where.date = {};
      if (from) (where.date as Record<string, string>).gte = from;
      if (to) (where.date as Record<string, string>).lte = to;
    }

    const records = await db.teacherAttendanceRecord.findMany({
      where,
      orderBy: [{ date: 'desc' }],
      take: 500,
    });

    const stats = { present: 0, absent: 0, late: 0, total: records.length };
    for (const r of records) {
      if (r.status === 'PRESENT') stats.present++;
      else if (r.status === 'ABSENT') stats.absent++;
      else if (r.status === 'LATE') stats.late++;
    }

    const school = await db.school.findUnique({
      where: { id: schoolId },
      select: { name: true, shortName: true, address: true, city: true, province: true, logo: true },
    });

    const period = from && to ? `Du ${from} au ${to}` : from ? `Depuis ${from}` : to ? `Jusqu'au ${to}` : 'Tout l\'historique';

    const pdfBuffer = buildTeacherAttendancePDF({
      teacher: { name: teacher.name, email: teacher.email, subjectName: teacher.subjectName, classNames: teacher.classNames },
      school: { name: school?.name || '', shortName: school?.shortName || '', address: school?.address, city: school?.city, province: school?.province, logo: school?.logo },
      records: records.map(r => ({ date: r.date, status: r.status })),
      stats,
      period,
    });

    const filename = `presence-${teacher.name.replace(/\s+/g, '-')}-${from || 'debut'}-${to || 'fin'}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error generating teacher attendance PDF:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
