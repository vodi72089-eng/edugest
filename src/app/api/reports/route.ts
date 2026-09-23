import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  verifySchoolAccess,
  sanitizeError,
  getRoleCycle,
  classFilterForCycle,
} from '@/lib/auth';

// ─── Rapports d'activité (sensibles au rôle) ────────────────────────────────
// GET /api/reports?schoolId=…&days=1|3|4|7 (défaut 7)
//
// Agrège les N derniers jours de l'école (N = 1 « aujourd'hui », 3, 4 ou 7)
// et renvoie un rapport JSON structuré ADAPTÉ AU RÔLE de l'appelant :
//  - SUPER_ADMIN_GLOBAL / SCHOOL_ADMIN / DIRECTION_* : effectifs, paiements,
//    discipline, présences (+ top classes), communications, personnel,
//    événements de la période. Les DIRECTION_* sont de plus scellés à LEUR
//    cycle (classes filtrées par section/nom — même mécanique que /api/stats).
//  - DISCIPLINE_* : incidents/sanctions/convocations/présences de leur cycle.
//  - SECRETARY : paiements enregistrés (nb, total encaissé) + communications.
//  - TEACHER / HEAD_TEACHER / EPS : SES classes (classNames), présences de ses
//    classes, devoirs publiés sur la période.
//
// AUCUNE donnée personnelle d'élève (pas de noms) — uniquement des compteurs
// et agrégats. L'école est scellée : rôles école sur user.schoolId, SAG via
// ?schoolId= + verifySchoolAccess.

const ALLOWED_DAYS = [1, 3, 4, 7];

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function attendanceFromStatusGroups(groups: { status: string; _count: number }[]) {
  const get = (s: string) => groups.find((g) => g.status === s)?._count || 0;
  const present = get('PRESENT');
  const absent = get('ABSENT');
  const late = get('LATE');
  const total = present + absent + late;
  const rate = total > 0 ? Math.round((present / total) * 100) : null;
  return { present, absent, late, total, rate };
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    if (user.role === 'PARENT') {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const daysParam = Number.parseInt(searchParams.get('days') || '7', 10);
    const days = ALLOWED_DAYS.includes(daysParam) ? daysParam : 7;

    // ── École de contexte (scellée) ────────────────────────────────────────
    let schoolId: string;
    if (user.role === 'SUPER_ADMIN_GLOBAL') {
      const requested = searchParams.get('schoolId') || '';
      if (!requested) {
        return NextResponse.json({ error: 'schoolId requis' }, { status: 400 });
      }
      if (!verifySchoolAccess(user, requested)) {
        return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
      }
      schoolId = requested;
    } else {
      if (!user.schoolId) {
        return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
      }
      if (searchParams.get('schoolId') && searchParams.get('schoolId') !== user.schoolId) {
        return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
      }
      schoolId = user.schoolId;
    }

    const school = await db.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, shortName: true },
    });
    if (!school) {
      return NextResponse.json({ error: 'École non trouvée' }, { status: 404 });
    }

    // ── Période : N derniers jours (jours = 1 → aujourd'hui) ──────────────
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - (days - 1));
    from.setHours(0, 0, 0, 0);
    const fromStr = isoDate(from);
    const toStr = isoDate(to);

    // ── Cycle imposé (DIRECTION_* / DISCIPLINE_*) ─────────────────────────
    const cycle = getRoleCycle(user.role);
    const cycleClassWhere: Record<string, unknown> = cycle ? classFilterForCycle(cycle) : {};

    const isDirection = user.role.startsWith('DIRECTION_');
    const isDiscipline = user.role.startsWith('DISCIPLINE_');
    const isAdminLike =
      user.role === 'SUPER_ADMIN_GLOBAL' || user.role === 'SCHOOL_ADMIN' || isDirection;
    const isSecretary = user.role === 'SECRETARY';
    const isTeacherLike = ['TEACHER', 'HEAD_TEACHER', 'EPS'].includes(user.role);

    const data: Record<string, unknown> = {
      school: { id: school.id, name: school.name, shortName: school.shortName },
      period: { from: fromStr, to: toStr, days },
      generatedAt: new Date().toISOString(),
      role: user.role,
      viewerName: user.name,
    };
    if (cycle) data.cycle = cycle;
    if (isDirection) data.note = 'vue Direction — limitée à votre cycle';

    // ── Effectifs + personnel (admin-like) ────────────────────────────────
    if (isAdminLike) {
      const classes = await db.class.findMany({
        where: { schoolId, ...(cycle ? { ...cycleClassWhere } : {}) },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      const studentWhere = {
        schoolId,
        isArchived: false,
        isExcluded: false,
        ...(cycle ? { class: cycleClassWhere } : {}),
      };
      const [totalStudents, byClassGroup, teachers] = await Promise.all([
        db.student.count({ where: studentWhere }),
        db.student.groupBy({ by: ['classId'], _count: true, where: studentWhere }),
        db.user.count({
          where: { schoolId, isActive: true, role: { in: ['TEACHER', 'HEAD_TEACHER', 'EPS'] } },
        }),
      ]);
      const byClass = classes
        .map((c) => ({
          className: c.name,
          count: byClassGroup.find((g) => g.classId === c.id)?._count || 0,
        }))
        .filter((x) => x.count > 0)
        .sort((a, b) => b.count - a.count);
      data.students = { total: totalStudents, classesCount: classes.length, byClass };
      data.personnel = { teachers };
    }

    // ── Paiements (admin-like + secrétaire) ───────────────────────────────
    if (isAdminLike || isSecretary) {
      const [transactions, collectedAgg, expectedAgg, unpaid] = await Promise.all([
        db.paymentRecord.count({ where: { schoolId, createdAt: { gte: from, lte: to } } }),
        db.paymentRecord.aggregate({
          _sum: { paidAmount: true },
          where: {
            schoolId,
            status: { in: ['PAID', 'PARTIAL'] },
            paidAt: { gte: from, lte: to },
          },
        }),
        db.paymentRecord.aggregate({
          _sum: { amount: true },
          where: { schoolId, createdAt: { gte: from, lte: to } },
        }),
        db.paymentRecord.count({ where: { schoolId, status: { in: ['PENDING', 'OVERDUE'] } } }),
      ]);
      data.payments = {
        transactions,
        collected: collectedAgg._sum.paidAmount || 0,
        expected: expectedAgg._sum.amount || 0,
        unpaid,
      };
    }

    // ── Discipline (admin-like + DISCIPLINE_*) ────────────────────────────
    if (isAdminLike || isDiscipline) {
      const disciplineStudentWhere = {
        schoolId,
        createdAt: { gte: from, lte: to },
        ...(cycle ? { student: { class: cycleClassWhere } } : {}),
      };
      const [incidents, positives, bySeverityRaw, convocations] = await Promise.all([
        db.disciplineRecord.count({
          where: { ...disciplineStudentWhere, listType: { in: ['BLACKLIST', 'GREYLIST'] } },
        }),
        db.disciplineRecord.count({ where: { ...disciplineStudentWhere, listType: 'WHITELIST' } }),
        db.disciplineRecord.groupBy({
          by: ['severity'],
          _count: true,
          where: disciplineStudentWhere,
        }),
        db.convocation.count({
          where: {
            schoolId,
            date: { gte: from, lte: to },
            ...(cycle ? { student: { class: cycleClassWhere } } : {}),
          },
        }),
      ]);
      const bySeverity: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0 };
      for (const g of bySeverityRaw) bySeverity[g.severity] = g._count;
      data.discipline = { incidents, positives, convocations, bySeverity };
    }

    // ── Présences (admin-like + DISCIPLINE_*) ─────────────────────────────
    if (isAdminLike || isDiscipline) {
      const attendanceWhere = {
        schoolId,
        date: { gte: fromStr, lte: toStr },
        ...(cycle ? { class: cycleClassWhere } : {}),
      };
      const statusGroups = await db.attendanceRecord.groupBy({
        by: ['status'],
        _count: true,
        where: attendanceWhere,
      });
      data.attendance = attendanceFromStatusGroups(
        statusGroups.map((g) => ({ status: g.status, _count: g._count }))
      );

      // Top 5 classes par taux de présence (agrégats uniquement, pas de noms)
      const byClassRaw = await db.attendanceRecord.groupBy({
        by: ['classId', 'status'],
        _count: true,
        where: attendanceWhere,
      });
      const classIds = [...new Set(byClassRaw.map((g) => g.classId))];
      const classRows = classIds.length
        ? await db.class.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } })
        : [];
      const topClasses = classRows
        .map((c) => {
          const groups = byClassRaw.filter((g) => g.classId === c.id);
          const st = attendanceFromStatusGroups(groups.map((g) => ({ status: g.status, _count: g._count })));
          return { className: c.name, rate: st.rate, total: st.total };
        })
        .filter((c) => c.total > 0 && c.rate !== null)
        .sort((a, b) => (b.rate || 0) - (a.rate || 0))
        .slice(0, 5);
      data.topClasses = topClasses;
    }

    // ── Communications (admin-like + secrétaire) ──────────────────────────
    if (isAdminLike || isSecretary) {
      const sent = await db.communication.count({
        where: { schoolId, sentAt: { gte: from, lte: to } },
      });
      data.communications = { sent };
    }

    // ── Événements de la période (admin-like) ─────────────────────────────
    if (isAdminLike) {
      const events = await db.schoolEvent.findMany({
        where: { schoolId, startAt: { gte: from, lte: to } },
        orderBy: { startAt: 'asc' },
        take: 20,
        select: { title: true, startAt: true, category: true, location: true },
      });
      data.events = events;
    }

    // ── Professeur : SES classes, présences, devoirs ──────────────────────
    if (isTeacherLike) {
      const me = await db.user.findUnique({
        where: { id: user.id },
        select: { classNames: true },
      });
      const names = (me?.classNames || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const classes = names.length
        ? await db.class.findMany({
            where: { schoolId, name: { in: names } },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : [];
      const classIds = classes.map((c) => c.id);

      let attendance = { present: 0, absent: 0, late: 0, total: 0, rate: null as number | null };
      if (classIds.length) {
        const statusGroups = await db.attendanceRecord.groupBy({
          by: ['status'],
          _count: true,
          where: { schoolId, date: { gte: fromStr, lte: toStr }, classId: { in: classIds } },
        });
        attendance = attendanceFromStatusGroups(
          statusGroups.map((g) => ({ status: g.status, _count: g._count }))
        );
      }
      const [myHomework, classesHomework] = await Promise.all([
        db.homework.count({
          where: { schoolId, teacherId: user.id, createdAt: { gte: from, lte: to } },
        }),
        classIds.length
          ? db.homework.count({
              where: { schoolId, classId: { in: classIds }, createdAt: { gte: from, lte: to } },
            })
          : Promise.resolve(0),
      ]);
      data.teacher = { classNames: classes.map((c) => c.name), attendance, homework: { mine: myHomework, forClasses: classesHomework } };
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Error building report:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
