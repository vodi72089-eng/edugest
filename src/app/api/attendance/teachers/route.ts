import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, verifySchoolAccess, sanitizeError, getRoleCycle, classMatchesCycle, type AuthUser } from '@/lib/auth';

// ─── Présence des professeurs (appel quotidien) ──────────────────────────────
// GET  /api/attendance/teachers?schoolId=…&date=YYYY-MM-DD → profs + statuts
// POST /api/attendance/teachers { schoolId, date, entries:[{teacherId,status}] }
//
// Gardes serveur :
//  - permission attendance:read (GET) / attendance:create (POST)
//  - accès école vérifié
//  - les rôles DISCIPLINE_* ne voient que les profs de LEUR cycle
//  - les parents n'ont PAS accès

const VALID_STATUSES = ['PRESENT', 'ABSENT', 'LATE'];

function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Les profs d'un cycle donné (via leurs TeacherAssignment → Class → section). */
async function teacherIdsForCycle(schoolId: string, cycle: string): Promise<Set<string>> {
  const assignments = await db.teacherAssignment.findMany({
    where: { class: { schoolId } },
    select: { teacherId: true, class: { select: { section: true, name: true } } },
  });
  const ids = new Set<string>();
  for (const a of assignments) {
    if (classMatchesCycle(a.class.section, a.class.name, cycle)) ids.add(a.teacherId);
  }
  return ids;
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'attendance:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    if (user.role === 'PARENT') {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || (user.role === 'SUPER_ADMIN_GLOBAL' ? '' : user.schoolId || '');
    const date = searchParams.get('date') || todayLocalISO();

    if (!schoolId) {
      return NextResponse.json({ error: 'School ID required' }, { status: 403 });
    }
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    // Liste des profs de l'école (rôle TEACHER ou HEAD_TEACHER)
    const teachers = await db.user.findMany({
      where: { schoolId, role: { in: ['TEACHER', 'HEAD_TEACHER'] }, isActive: true },
      select: { id: true, name: true, email: true, role: true, subjectName: true, classNames: true },
      orderBy: [{ name: 'asc' }],
    });

    // Filtrage par cycle pour les rôles DISCIPLINE_*
    const cycle = getRoleCycle(user.role);
    let visibleTeachers = teachers;
    if (cycle) {
      const ids = await teacherIdsForCycle(schoolId, cycle);
      visibleTeachers = teachers.filter(t => ids.has(t.id));
    }

    // Statuts du jour
    const records = await db.teacherAttendanceRecord.findMany({
      where: { schoolId, date },
      select: { teacherId: true, status: true, recordedBy: true, validatedBy: true, updatedAt: true },
    });
    const statusMap: Record<string, { status: string; recordedBy?: string | null; validatedBy?: string | null }> = {};
    for (const r of records) statusMap[r.teacherId] = r;

    const data = visibleTeachers.map(t => ({
      id: t.id,
      name: t.name,
      email: t.email,
      role: t.role,
      subjectName: t.subjectName,
      classNames: t.classNames,
      attendance: statusMap[t.id]?.status || null,
      recordedBy: statusMap[t.id]?.recordedBy || null,
      validatedBy: statusMap[t.id]?.validatedBy || null,
    }));

    const counts = { total: data.length, present: 0, absent: 0, late: 0, unmarked: 0 };
    for (const t of data) {
      if (t.attendance === 'PRESENT') counts.present++;
      else if (t.attendance === 'ABSENT') counts.absent++;
      else if (t.attendance === 'LATE') counts.late++;
      else counts.unmarked++;
    }

    return NextResponse.json({ data: { date, teachers: data, counts } });
  } catch (error) {
    console.error('Error listing teacher attendance:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'attendance:create');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { schoolId, date, entries } = body as {
      schoolId?: string;
      date?: string;
      entries?: { teacherId: string; status: string }[];
    };

    if (!schoolId || !date || !Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: 'schoolId, date et entries requis' }, { status: 400 });
    }

    const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayLocalISO();

    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    // Tous les profs doivent appartenir à cette école (anti-contournement)
    const teacherIds = [...new Set(entries.map(e => e.teacherId).filter(Boolean))];
    const schoolTeachers = await db.user.findMany({
      where: { id: { in: teacherIds }, schoolId, role: { in: ['TEACHER', 'HEAD_TEACHER'] } },
      select: { id: true },
    });
    const validIds = new Set(schoolTeachers.map(t => t.id));

    let saved = 0;
    for (const entry of entries) {
      if (!entry?.teacherId || !validIds.has(entry.teacherId)) continue;
      const status = VALID_STATUSES.includes(entry.status) ? entry.status : 'PRESENT';
      await db.teacherAttendanceRecord.upsert({
        where: { teacherId_date: { teacherId: entry.teacherId, date: safeDate } },
        update: { status, recordedBy: user.name, schoolId },
        create: { teacherId: entry.teacherId, schoolId, date: safeDate, status, recordedBy: user.name },
      });
      saved += 1;
    }

    return NextResponse.json({ data: { saved, date: safeDate, schoolId } }, { status: 201 });
  } catch (error) {
    console.error('Error saving teacher attendance:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
