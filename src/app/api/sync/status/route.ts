import { db } from '@/lib/db';
import { requireAuth, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET/POST /api/sync/status - ÉTAT DE LA SYNCHRONISATION (exe UNIQUEMENT).
// Calcule, dans la base LOCALE SQLite, le nombre de modifications en attente
// d'envoi vers la plateforme et quelques extraits récents - c'est la source
// de vérité de l'interface « Synchronisation » des réglages.
//
// Contrat :
//   body.since           = date ISO de la dernière synchro réussie (optionnel ;
//                          absent = tout est considéré comme en attente).
//   body.fullBaseline    = { schoolYears, subjects, users } - compteurs des
//                          tables SANS colonne de version relevés au dernier
//                          envoi complet ; les ajouts détectés (écart positif)
//                          sont renvoyés dans pending.fullAdded.
//   body.localSchoolId   = école locale (SAG uniquement ; les autres rôles
//                          utilisent l'école de leur session).
//
// Réponse : { data: { pending: {...}, pendingTotal, lastWriteAt, samples } }
//
// Refusé hors Electron (même garde que /api/sync/send).

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

// Faux étudiant des enregistrements d'ABONNEMENT de la plateforme
// (PaymentRecord.studentId = '__subscription__') : ce ne sont pas des
// paiements d'élèves → jamais comptés ni affichés comme en attente.
const SUBSCRIPTION_STUDENT_ID = '__subscription__';

const added = (current: number, baseline: unknown): number => {
  const b = Number(baseline);
  if (!isFinite(b) || b < 0) return current; // pas de baseline : tout est en attente
  return Math.max(0, current - b);
};

export async function POST(request: NextRequest) {
  try {
    const userAgent = request.headers.get('user-agent') || '';
    if (!/electron/i.test(userAgent)) {
      return err("L'état de synchronisation n'est disponible que dans l'application desktop.", 403);
    }

    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    let body: any = {};
    try {
      body = await request.json();
    } catch { /* GET-like : corps vide accepté */ }

    let localSchoolId: string | null = null;
    if (user.role === 'SUPER_ADMIN_GLOBAL') {
      localSchoolId = typeof body.localSchoolId === 'string' && body.localSchoolId ? body.localSchoolId : null;
    } else if (user.schoolId) {
      localSchoolId = user.schoolId;
      if (typeof body.localSchoolId === 'string' && body.localSchoolId && body.localSchoolId !== user.schoolId) {
        return err('École locale refusée', 403);
      }
    }
    if (!localSchoolId) return err('École locale non trouvée', 404);

    let sinceDate: Date | null = null;
    if (body.since) {
      const d = new Date(String(body.since));
      if (!isNaN(d.getTime())) sinceDate = d;
    }
    const deltaWhere = sinceDate ? { updatedAt: { gte: sinceDate } } : {};
    const baseline = body.fullBaseline && typeof body.fullBaseline === 'object' ? body.fullBaseline : null;

    // ?? Compteurs (tables versionnées en delta, tables sans version vs baseline)
    const [classesN, studentsN, gradesN, feesN, paymentsN, yearsAll, subjectsAll, usersAll] = await Promise.all([
      db.class.count({ where: { schoolId: localSchoolId, ...deltaWhere } }),
      db.student.count({ where: { schoolId: localSchoolId, isArchived: false, ...deltaWhere } }),
      db.grade.count({ where: { student: { schoolId: localSchoolId }, ...deltaWhere } }),
      db.schoolFee.count({ where: { schoolId: localSchoolId, ...deltaWhere } }),
      db.paymentRecord.count({ where: { schoolId: localSchoolId, studentId: { not: SUBSCRIPTION_STUDENT_ID }, ...deltaWhere } }).catch(() => 0),
      db.schoolYear.count({ where: { schoolId: localSchoolId } }),
      db.subject.count({ where: { schoolId: localSchoolId } }),
      db.user.count({ where: { schoolId: localSchoolId, role: { in: ['TEACHER', 'HEAD_TEACHER', 'PARENT'] }, isActive: true } }),
    ]);

    const fullAdded = {
      schoolYears: added(yearsAll, baseline?.schoolYears),
      subjects: added(subjectsAll, baseline?.subjects),
      users: added(usersAll, baseline?.users),
    };

    // ?? Dernière écriture locale (fraîcheur de la base) ���
    let lastWriteAt: Date | null = null;
    try {
      const agg = await db.student.aggregate({ _max: { updatedAt: true }, where: { schoolId: localSchoolId } });
      lastWriteAt = agg._max.updatedAt || null;
    } catch { /* best-effort */ }

    // ?? Extraits récents (alimente la liste « modifications » de l'UI) ??
    const samples: { type: string; label: string; at: string }[] = [];
    try {
      const [stRows, grRows, payRows, feeRows, clRows] = await Promise.all([
        db.student.findMany({
          where: { schoolId: localSchoolId, isArchived: false, ...deltaWhere },
          select: { firstName: true, lastName: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' }, take: 3,
        }),
        db.grade.findMany({
          where: { student: { schoolId: localSchoolId }, ...deltaWhere },
          select: { score: true, trimester: true, updatedAt: true, student: { select: { matricule: true, firstName: true, lastName: true } }, subject: { select: { name: true } } },
          orderBy: { updatedAt: 'desc' }, take: 3,
        }),
        db.paymentRecord.findMany({
          where: { schoolId: localSchoolId, studentId: { not: SUBSCRIPTION_STUDENT_ID }, ...deltaWhere },
          select: { studentId: true, paidAmount: true, status: true, receiptNumber: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' }, take: 3,
        }).catch(() => [] as any[]),
        db.schoolFee.findMany({
          where: { schoolId: localSchoolId, ...deltaWhere },
          select: { name: true, amount: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' }, take: 2,
        }),
        db.class.findMany({
          where: { schoolId: localSchoolId, ...deltaWhere },
          select: { name: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' }, take: 2,
        }),
      ]);
      // PaymentRecord : studentId nu (pas de relation Prisma) -> jointure manuelle.
      const payIds = [...new Set(payRows.map((r: any) => String(r.studentId)).filter(Boolean))];
      const payStu = payIds.length
        ? await db.student.findMany({ where: { id: { in: payIds } }, select: { id: true, firstName: true, lastName: true } })
        : [];
      const payNameById = new Map(payStu.map(s => [s.id, `${s.firstName} ${s.lastName}`]));

      stRows.forEach(r => samples.push({ type: 'Élève', label: `${r.firstName} ${r.lastName}`, at: r.updatedAt.toISOString() }));
      grRows.forEach(r => samples.push({ type: 'Note', label: `${r.student?.firstName || ''} ${r.student?.lastName || ''} - ${r.subject?.name || '?'} (${r.trimester})`, at: r.updatedAt.toISOString() }));
      payRows.forEach((r: any) => samples.push({ type: 'Paiement', label: `${payNameById.get(String(r.studentId)) || '?'} - ${r.paidAmount}${r.receiptNumber ? ` (${r.receiptNumber})` : ''}`, at: r.updatedAt.toISOString() }));
      feeRows.forEach(r => samples.push({ type: 'Frais', label: `${r.name} - ${r.amount}`, at: r.updatedAt.toISOString() }));
      clRows.forEach(r => samples.push({ type: 'Classe', label: r.name, at: r.updatedAt.toISOString() }));
    } catch { /* extraits best-effort */ }

    samples.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    const pending = {
      classes: classesN,
      students: studentsN,
      grades: gradesN,
      schoolFees: feesN,
      paymentRecords: paymentsN,
      fullAdded,
    };
    const pendingTotal =
      classesN + studentsN + gradesN + feesN + paymentsN +
      fullAdded.schoolYears + fullAdded.subjects + fullAdded.users;

    return NextResponse.json({
      data: {
        pending,
        pendingTotal,
        lastWriteAt: lastWriteAt ? lastWriteAt.toISOString() : null,
        since: sinceDate ? sinceDate.toISOString() : null,
        samples: samples.slice(0, 8),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
