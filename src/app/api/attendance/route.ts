import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, verifySchoolAccess, sanitizeError, getRoleCycle, classMatchesCycle, type AuthUser } from '@/lib/auth';

// ─── Liste de présence (appel quotidien) ────────────────────────────────────
// GET  /api/attendance?classId=…&date=YYYY-MM-DD  → statuts du jour
// POST /api/attendance { classId, date, entries:[{studentId,status}] } → upsert
//
// Gardes serveur :
//  - permission discipline:read / discipline:update
//  - accès école vérifié
//  - un compte à cycle imposé (DIRECTION_*/DISCIPLINE_*) ne peut appeler que
//    les classes de SON cycle (section OU nom maternelle M1/M2/PS/MS/GS…)
//  - les parents n'ont PAS accès à l'appel

const VALID_STATUSES = ['PRESENT', 'ABSENT', 'LATE'];

function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function assertClassAccess(
  user: AuthUser,
  classId: string
): Promise<{ ok: true; classRecord: { id: string; name: string; section: string | null; schoolId: string } } | { ok: false; status: number; error: string }> {
  const classRecord = await db.class.findUnique({
    where: { id: classId },
    select: { id: true, name: true, section: true, schoolId: true },
  });
  if (!classRecord) return { ok: false, status: 404, error: 'Classe non trouvée' };
  if (!verifySchoolAccess(user, classRecord.schoolId)) {
    return { ok: false, status: 403, error: 'Accès à cette école non autorisé' };
  }
  const cycle = getRoleCycle(user.role);
  if (cycle && !classMatchesCycle(classRecord.section, classRecord.name, cycle)) {
    return { ok: false, status: 403, error: 'Cette classe ne relève pas de votre cycle' };
  }
  return { ok: true, classRecord };
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'discipline:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    if (user.role === 'PARENT') {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('classId') || '';
    const date = searchParams.get('date') || todayLocalISO();

    if (!classId) {
      return NextResponse.json({ error: 'classId requis' }, { status: 400 });
    }
    const access = await assertClassAccess(user, classId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const records = await db.attendanceRecord.findMany({
      where: { classId, date },
      select: { studentId: true, status: true, recordedBy: true, updatedAt: true },
    });

    const [classStudents, presentCount] = await Promise.all([
      db.student.findMany({
        where: { classId, isArchived: false, isExcluded: false },
        select: { id: true, firstName: true, lastName: true, matricule: true, photoUrl: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      db.attendanceRecord.count({ where: { classId, date, status: 'PRESENT' } }),
    ]);

    return NextResponse.json({
      data: {
        class: { id: access.classRecord.id, name: access.classRecord.name, section: access.classRecord.section },
        date,
        records,
        students: classStudents,
        counts: {
          total: classStudents.length,
          present: records.filter(r => r.status === 'PRESENT').length,
          absent: records.filter(r => r.status === 'ABSENT').length,
          late: records.filter(r => r.status === 'LATE').length,
          unmarked: Math.max(0, classStudents.length - records.length),
        },
      },
    });
  } catch (error) {
    console.error('Error listing attendance:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'discipline:update');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { classId, date, entries } = body as {
      classId?: string;
      date?: string;
      entries?: { studentId: string; status: string }[];
    };

    if (!classId || !date || !Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: 'classId, date et entries requis' }, { status: 400 });
    }
    const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayLocalISO();

    const access = await assertClassAccess(user, classId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    // Tous les élèves doivent appartenir à cette classe (anti-contournement)
    const studentIds = [...new Set(entries.map(e => e.studentId).filter(Boolean))];
    const classStudents = await db.student.findMany({
      where: { id: { in: studentIds }, classId },
      select: { id: true },
    });
    const validIds = new Set(classStudents.map(s => s.id));

    let saved = 0;
    for (const entry of entries) {
      if (!entry?.studentId || !validIds.has(entry.studentId)) continue;
      const status = VALID_STATUSES.includes(entry.status) ? entry.status : 'PRESENT';
      await db.attendanceRecord.upsert({
        where: { studentId_date: { studentId: entry.studentId, date: safeDate } },
        update: { status, recordedBy: user.name, classId },
        create: { studentId: entry.studentId, classId, schoolId: access.classRecord.schoolId, date: safeDate, status, recordedBy: user.name },
      });
      saved += 1;
    }

    return NextResponse.json({ data: { saved, date: safeDate, classId } }, { status: 201 });
  } catch (error) {
    console.error('Error saving attendance:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
