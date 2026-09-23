import { db } from '@/lib/db';
import { getRoleSealLabel } from '@/lib/helpers';

// ─── Collecteur de rapport DÉTAILLÉ (PDF + automatisation) ──────────────────
// Version riche de GET /api/reports : inclut les données nominatives
// nécessaires au PDF scellé demandé par le propriétaire —
//   • paiements : élève, montant, date/heure À LA SECONDE, n° de reçu
//   • communications : sujets envoyés
//   • discipline : sanctions (élève + sanction + description), points
//     positifs (élève + points + raison), convocations (élève + motif)
//   • présences : taux + liste des absents/retards avec nombre de JOURS
//     (« 2 jours » d'absence, « 1 jour de retard »…)
//   • classements : classes (présence + notes + discipline) et élèves
//     (top 3 / 3 derniers, % estimé + conduite estimée sur la période)
// Utilisé par /api/reports/pdf et le planificateur d'automatisation.

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', CDF: 'FC', NGN: '₦', XOF: 'CFA', GHS: '₵', KES: 'KSh', ZAR: 'R', GBP: '£', CAD: 'C$',
};

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

/** Notes sur /20 → % ; sinon garde-fou clampé 0..100. */
function scoreToPct(avg: number): number {
  if (!isFinite(avg)) return 0;
  const pct = avg <= 20 ? avg * 5 : avg;
  return Math.max(0, Math.min(100, Math.round(pct * 10) / 10));
}

export interface DetailedPayment { student: string; className: string; amount: number; paidAtISO: string | null; receipt: string; method: string }
export interface DetailedComm { title: string; type: string; sentAtISO: string }
export interface DetailedIncident { student: string; className: string; sanction: string; description: string; points: number; severity: string; createdAtISO: string }
export interface DetailedPositive { student: string; className: string; points: number; reason: string; createdAtISO: string }
export interface DetailedConvocation { student: string; className: string; motif: string; dateISO: string; status: string }
export interface DetailedAttendanceStudent { student: string; className: string; absentDays: number; lateDays: number }
export interface ClassRankingRow { className: string; studentsCount: number; presenceRate: number | null; gradeAvgPct: number | null; disciplineScore: number; score: number }
export interface StudentRankingRow {
  student: string; className: string;
  gradePct: number | null;                       // % estimé (notes de la période)
  presenceRate: number | null;                   // % présence individuelle
  conductScore: number; conductLabel: string;    // conduite estimée (discipline)
  positivePoints: number; negativePoints: number;
  score: number;                                 // score global de classement
}

export interface DetailedReport {
  school: { id: string; name: string; shortName: string };
  period: { from: string; to: string; days: number };
  generatedAtISO: string;
  currencySymbol: string;
  sealLabel: string;
  students: { total: number; classesCount: number; byClass: { className: string; count: number }[]; teachers: number };
  payments: { transactions: number; collected: number; expected: number; unpaid: number; list: DetailedPayment[] };
  communications: { sent: number; list: DetailedComm[] };
  discipline: {
    incidents: number; positives: number; convocations: number;
    incidentsList: DetailedIncident[]; positivesList: DetailedPositive[]; convocationsList: DetailedConvocation[];
  };
  attendance: { present: number; absent: number; late: number; total: number; rate: number | null };
  attendanceByStudent: DetailedAttendanceStudent[];
  classRanking: { top: ClassRankingRow[]; worst: ClassRankingRow | null };
  studentRanking: { top: StudentRankingRow[]; bottom: StudentRankingRow[] };
}

/** Étiquette de conduite estimée à partir du solde disciplinaire. */
export function conductLabel(positivePoints: number, negativePoints: number): { score: number; label: string } {
  const score = Math.max(0, Math.min(100, 100 - negativePoints * 5 + positivePoints * 2));
  const label =
    score >= 90 ? 'Excellent' :
    score >= 75 ? 'Bon' :
    score >= 60 ? 'Moyen' : 'Préoccupant';
  return { score, label };
}

/**
 * Collecte le rapport détaillé complet d'une école pour les N derniers jours.
 * Portée ADMIN (propriétaire) : école entière, données nominatives incluses.
 */
export async function collectDetailedReport(schoolId: string, days: number): Promise<DetailedReport> {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);
  const fromStr = isoDate(from);
  const toStr = isoDate(to);

  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { id: true, name: true, shortName: true },
  });
  if (!school) throw new Error('École non trouvée');

  const cur = await db.schoolCurrencyConfig.findUnique({
    where: { schoolId },
    select: { baseCurrency: true },
  });
  const currencySymbol = CURRENCY_SYMBOLS[cur?.baseCurrency || 'USD'] || cur?.baseCurrency || '$';

  // ── Effectifs ────────────────────────────────────────────────────────────
  const classes = await db.class.findMany({
    where: { schoolId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const classIds = classes.map((c) => c.id);
  const studentWhere = { schoolId, isArchived: false, isExcluded: false };
  const [totalStudents, byClassGroup, teachers] = await Promise.all([
    db.student.count({ where: studentWhere }),
    db.student.groupBy({ by: ['classId'], _count: true, where: studentWhere }),
    db.user.count({ where: { schoolId, isActive: true, role: { in: ['TEACHER', 'HEAD_TEACHER', 'EPS'] } } }),
  ]);
  const byClass = classes
    .map((c) => ({ className: c.name, count: byClassGroup.find((g) => g.classId === c.id)?._count || 0 }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);

  // ── Paiements (agrégats + liste nominative avec reçu + horodatage) ───────
  const [transactions, collectedAgg, expectedAgg, unpaid, paymentsRows] = await Promise.all([
    db.paymentRecord.count({ where: { schoolId, createdAt: { gte: from, lte: to } } }),
    db.paymentRecord.aggregate({
      _sum: { paidAmount: true },
      where: { schoolId, status: { in: ['PAID', 'PARTIAL'] }, paidAt: { gte: from, lte: to } },
    }),
    db.paymentRecord.aggregate({
      _sum: { amount: true },
      where: { schoolId, createdAt: { gte: from, lte: to } },
    }),
    db.paymentRecord.count({ where: { schoolId, status: { in: ['PENDING', 'OVERDUE'] } } }),
    db.paymentRecord.findMany({
      where: { schoolId, status: { in: ['PAID', 'PARTIAL'] }, paidAt: { gte: from, lte: to } },
      select: {
        amount: true, paidAmount: true, paidAt: true, receiptNumber: true, referenceNumber: true,
        paymentMethod: true, id: true, studentId: true,
      },
      orderBy: { paidAt: 'desc' },
      take: 150,
    }),
  ]);
  // PaymentRecord n'a pas de relation Prisma vers Student → jointure manuelle
  const payStudentIds = [...new Set(paymentsRows.map((p) => p.studentId))];
  const payStudents = payStudentIds.length
    ? await db.student.findMany({
        where: { id: { in: payStudentIds } },
        select: { id: true, firstName: true, lastName: true, classId: true },
      })
    : [];
  const payStudentById = new Map(payStudents.map((s) => [s.id, s]));
  const classNameById = new Map(classes.map((c) => [c.id, c.name]));
  const paymentsList: DetailedPayment[] = paymentsRows.map((p) => {
    const s = payStudentById.get(p.studentId);
    return {
      student: s ? `${s.firstName} ${s.lastName}` : `Élève ${p.studentId.slice(-6)}`,
      className: s ? classNameById.get(s.classId) || '—' : '—',
      amount: p.paidAmount || p.amount,
      paidAtISO: p.paidAt ? p.paidAt.toISOString() : null,
      receipt: p.receiptNumber || p.referenceNumber || `REC-${p.id.slice(-8).toUpperCase()}`,
      method: p.paymentMethod || '—',
    };
  });

  // ── Communications (sujets envoyés) ─────────────────────────────────────
  const [commsCount, commsRows] = await Promise.all([
    db.communication.count({ where: { schoolId, sentAt: { gte: from, lte: to } } }),
    db.communication.findMany({
      where: { schoolId, sentAt: { gte: from, lte: to } },
      select: { title: true, type: true, sentAt: true },
      orderBy: { sentAt: 'desc' },
      take: 60,
    }),
  ]);
  const communications = {
    sent: commsCount,
    list: commsRows.map((c) => ({ title: c.title, type: c.type, sentAtISO: c.sentAt.toISOString() })),
  };

  // ── Discipline : incidents/sanctions + points positifs + convocations ───
  const [disciplineRows, convocationsRows] = await Promise.all([
    db.disciplineRecord.findMany({
      where: { schoolId, createdAt: { gte: from, lte: to } },
      select: {
        listType: true, title: true, description: true, points: true, severity: true, createdAt: true,
        student: { select: { id: true, firstName: true, lastName: true, classId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    db.convocation.findMany({
      where: { schoolId, date: { gte: from, lte: to } },
      select: {
        motif: true, date: true, status: true,
        student: { select: { firstName: true, lastName: true, classId: true } },
      },
      orderBy: { date: 'desc' },
      take: 100,
    }),
  ]);
  const incidentsList: DetailedIncident[] = disciplineRows
    .filter((r) => r.listType === 'BLACKLIST' || r.listType === 'GREYLIST')
    .map((r) => ({
      student: `${r.student.firstName} ${r.student.lastName}`,
      className: classNameById.get(r.student.classId) || '—',
      sanction: r.title || r.listType,
      description: r.description || '',
      points: r.points,
      severity: r.severity,
      createdAtISO: r.createdAt.toISOString(),
    }));
  const positivesList: DetailedPositive[] = disciplineRows
    .filter((r) => r.listType === 'WHITELIST')
    .map((r) => ({
      student: `${r.student.firstName} ${r.student.lastName}`,
      className: classNameById.get(r.student.classId) || '—',
      points: r.points,
      reason: r.title || r.description || '',
      createdAtISO: r.createdAt.toISOString(),
    }));
  const convocationsList: DetailedConvocation[] = convocationsRows.map((r) => ({
    student: `${r.student.firstName} ${r.student.lastName}`,
    className: classNameById.get(r.student.classId) || '—',
    motif: r.motif,
    dateISO: r.date.toISOString(),
    status: r.status,
  }));

  // ── Présences : totaux + par élève (jours d'absence / de retard) ─────────
  const attendanceWhere = { schoolId, date: { gte: fromStr, lte: toStr } };
  const [statusGroups, perStudentGroups, perClassGroups] = await Promise.all([
    db.attendanceRecord.groupBy({ by: ['status'], _count: true, where: attendanceWhere }),
    db.attendanceRecord.groupBy({
      by: ['studentId', 'status'],
      _count: true,
      where: { ...attendanceWhere, status: { in: ['ABSENT', 'LATE'] } },
    }),
    db.attendanceRecord.groupBy({ by: ['classId', 'status'], _count: true, where: attendanceWhere }),
  ]);
  const attendance = attendanceFromStatusGroups(statusGroups.map((g) => ({ status: g.status, _count: g._count })));

  // Noms des élèves concernés (absences/retards)
  const flaggedStudentIds = [...new Set(perStudentGroups.map((g) => g.studentId))];
  const flaggedStudents = flaggedStudentIds.length
    ? await db.student.findMany({
        where: { id: { in: flaggedStudentIds } },
        select: { id: true, firstName: true, lastName: true, classId: true },
      })
    : [];
  const flaggedById = new Map(flaggedStudents.map((s) => [s.id, s]));
  const attByStudentMap = new Map<string, DetailedAttendanceStudent>();
  for (const g of perStudentGroups) {
    const s = flaggedById.get(g.studentId);
    if (!s) continue;
    const row = attByStudentMap.get(g.studentId) || {
      student: `${s.firstName} ${s.lastName}`,
      className: classNameById.get(s.classId) || '—',
      absentDays: 0, lateDays: 0,
    };
    if (g.status === 'ABSENT') row.absentDays = g._count;
    if (g.status === 'LATE') row.lateDays = g._count;
    attByStudentMap.set(g.studentId, row);
  }
  const attendanceByStudent = [...attByStudentMap.values()].sort(
    (a, b) => (b.absentDays - a.absentDays) || (b.lateDays - a.lateDays)
  );

  // Taux de présence individuel (pour le classement élèves)
  const presenceByStudent = new Map<string, { present: number; total: number }>();
  const allStatusPerStudent = await db.attendanceRecord.groupBy({
    by: ['studentId', 'status'], _count: true, where: attendanceWhere,
  });
  for (const g of allStatusPerStudent) {
    const row = presenceByStudent.get(g.studentId) || { present: 0, total: 0 };
    row.total += g._count;
    if (g.status === 'PRESENT') row.present += g._count;
    presenceByStudent.set(g.studentId, row);
  }

  // ── Notes de la période (moyennes par élève / par classe) ────────────────
  const gradeRows = classIds.length
    ? await db.grade.findMany({
        where: { classId: { in: classIds }, createdAt: { gte: from, lte: to } },
        select: { studentId: true, classId: true, score: true },
        take: 8000,
      })
    : [];
  const gradeSumByStudent = new Map<string, { sum: number; n: number; classId: string }>();
  const gradeSumByClass = new Map<string, { sum: number; n: number }>();
  for (const g of gradeRows) {
    const s = gradeSumByStudent.get(g.studentId) || { sum: 0, n: 0, classId: g.classId };
    s.sum += g.score; s.n += 1; s.classId = g.classId;
    gradeSumByStudent.set(g.studentId, s);
    const c = gradeSumByClass.get(g.classId) || { sum: 0, n: 0 };
    c.sum += g.score; c.n += 1;
    gradeSumByClass.set(g.classId, c);
  }

  // ── Classement CLASSES : présence + notes + discipline ───────────────────
  // disciplineScore classe : 100 − 6 pts/incident + 2 pt/point positif (clampé)
  const disciplineByClass = new Map<string, { incidents: number; positivePoints: number }>();
  for (const r of disciplineRows) {
    const cid = r.student.classId;
    const row = disciplineByClass.get(cid) || { incidents: 0, positivePoints: 0 };
    if (r.listType === 'WHITELIST') row.positivePoints += r.points;
    else row.incidents += 1;
    disciplineByClass.set(cid, row);
  }
  const classRankingRows: ClassRankingRow[] = classes.map((c) => {
    const st = attendanceFromStatusGroups(
      perClassGroups.filter((g) => g.classId === c.id).map((g) => ({ status: g.status, _count: g._count }))
    );
    const gAvg = gradeSumByClass.get(c.id);
    const gradeAvgPct = gAvg && gAvg.n > 0 ? scoreToPct(gAvg.sum / gAvg.n) : null;
    const disc = disciplineByClass.get(c.id) || { incidents: 0, positivePoints: 0 };
    const disciplineScore = Math.max(0, Math.min(100, 100 - disc.incidents * 6 + disc.positivePoints));
    // Score global : 50 % présence · 30 % notes · 20 % discipline
    const pPart = st.rate !== null ? st.rate : 0;
    const gPart = gradeAvgPct !== null ? gradeAvgPct : pPart; // sans notes → pondéré par présence
    const score = Math.round((pPart * 0.5 + gPart * 0.3 + disciplineScore * 0.2) * 10) / 10;
    return {
      className: c.name,
      studentsCount: byClass.find((x) => x.className === c.name)?.count || 0,
      presenceRate: st.rate,
      gradeAvgPct,
      disciplineScore,
      score,
    };
  }).filter((c) => c.studentsCount > 0 || c.presenceRate !== null);
  const rankedClasses = [...classRankingRows].sort((a, b) => b.score - a.score);
  const classRanking = {
    top: rankedClasses.slice(0, 3),
    worst: rankedClasses.length > 1 ? rankedClasses[rankedClasses.length - 1] : null,
  };

  // ── Classement ÉLÈVES : % estimé (notes) + conduite (discipline) ─────────
  const disciplineByStudent = new Map<string, { pos: number; neg: number }>();
  for (const r of disciplineRows) {
    const row = disciplineByStudent.get(r.student.id) || { pos: 0, neg: 0 };
    if (r.listType === 'WHITELIST') row.pos += r.points;
    else row.neg += Math.abs(r.points);
    disciplineByStudent.set(r.student.id, row);
  }
  // Élèves candidates : ceux qui ont notes OU présence OU discipline sur la période
  const candidateIds = new Set<string>([
    ...gradeSumByStudent.keys(),
    ...presenceByStudent.keys(),
    ...disciplineByStudent.keys(),
  ]);
  const candidateStudents = candidateIds.size
    ? await db.student.findMany({
        where: { id: { in: [...candidateIds] } },
        select: { id: true, firstName: true, lastName: true, classId: true },
      })
    : [];
  const studentRankingRows: StudentRankingRow[] = candidateStudents.map((s) => {
    const g = gradeSumByStudent.get(s.id);
    const gradePct = g && g.n > 0 ? scoreToPct(g.sum / g.n) : null;
    const p = presenceByStudent.get(s.id);
    const presenceRate = p && p.total > 0 ? Math.round((p.present / p.total) * 100) : null;
    const d = disciplineByStudent.get(s.id) || { pos: 0, neg: 0 };
    const conduct = conductLabel(d.pos, d.neg);
    // Score global élève : 45 % notes · 35 % présence · 20 % conduite
    const gPart = gradePct !== null ? gradePct : (presenceRate !== null ? presenceRate : conduct.score);
    const pPart = presenceRate !== null ? presenceRate : gPart;
    const score = Math.round((gPart * 0.45 + pPart * 0.35 + conduct.score * 0.2) * 10) / 10;
    return {
      student: `${s.firstName} ${s.lastName}`,
      className: classNameById.get(s.classId) || '—',
      gradePct, presenceRate,
      conductScore: conduct.score, conductLabel: conduct.label,
      positivePoints: d.pos, negativePoints: d.neg,
      score,
    };
  });
  const rankedStudents = [...studentRankingRows].sort((a, b) => b.score - a.score);
  const studentRanking = {
    top: rankedStudents.slice(0, 3),
    bottom: rankedStudents.length > 3 ? rankedStudents.slice(-3).reverse() : [],
  };

  return {
    school: { id: school.id, name: school.name, shortName: school.shortName },
    period: { from: fromStr, to: toStr, days },
    generatedAtISO: new Date().toISOString(),
    currencySymbol,
    sealLabel: 'Propriétaire', // porte de défaut ; surchargée par l'appelant si besoin
    students: { total: totalStudents, classesCount: classes.length, byClass, teachers },
    payments: {
      transactions, collected: collectedAgg._sum.paidAmount || 0,
      expected: expectedAgg._sum.amount || 0, unpaid, list: paymentsList,
    },
    communications,
    discipline: {
      incidents: incidentsList.length, positives: positivesList.length, convocations: convocationsList.length,
      incidentsList, positivesList, convocationsList,
    },
    attendance,
    attendanceByStudent,
    classRanking,
    studentRanking,
  };
}

// ─── Formatage temps (fuseau Africa/Lagos, avec secondes) ───────────────────
const lagosDateTimeFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Africa/Lagos',
  day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
});

/** « 23/09/2026 à 08:00:15 » (heure Africa/Lagos). */
export function fmtLagosDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const parts = lagosDateTimeFmt.formatToParts(new Date(iso));
    const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
    return `${get('day')}/${get('month')}/${get('year')} à ${get('hour')}:${get('minute')}:${get('second')}`;
  } catch {
    return '—';
  }
}

/** Prochaine occurrence de hour:minute (heure Africa/Lagos = UTC+1, pas de DST). */
export function nextLagosOccurrence(hour: number, minute: number, after: Date = new Date()): Date {
  const y = after.getUTCFullYear();
  const m = after.getUTCMonth();
  const d = after.getUTCDate();
  // hour:minute Lagos = (hour-1):minute UTC
  let candidate = new Date(Date.UTC(y, m, d, hour, minute) - 3600_000);
  while (candidate.getTime() <= after.getTime()) {
    candidate = new Date(candidate.getTime() + 24 * 3600_000);
  }
  return candidate;
}

/**
 * Construit le TEXTE WhatsApp du rapport (format emoji, tel qu'envoyé par
 * /api/reports/send) à partir du rapport détaillé — utilisé par l'automatisation.
 */
export function buildWhatsAppTextReport(data: DetailedReport, sealLabel: string): string {
  const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const d = (iso: string) => {
    const [y, m, day] = iso.split('-');
    return `${day}/${m}/${y}`;
  };
  const title = data.period.days === 1 ? 'RAPPORT DU JOUR' : data.period.days === 7 ? 'RAPPORT HEBDOMADAIRE' : `RAPPORT — ${data.period.days} DERNIERS JOURS`;
  const lines: string[] = [];
  lines.push(`📋 *${title}*`);
  lines.push(`🏫 ${data.school.name}`);
  lines.push(`📅 Période : ${d(data.period.from)} → ${d(data.period.to)} (${data.period.days} jour${data.period.days > 1 ? 's' : ''})`);
  lines.push('');
  lines.push('👥 *EFFECTIFS*');
  lines.push(`• Élèves actifs : ${fmt(data.students.total)} (${data.students.classesCount} classe${data.students.classesCount > 1 ? 's' : ''})`);
  if (data.students.byClass.length) {
    lines.push(`• ${data.students.byClass.slice(0, 5).map((c) => `${c.className} : ${c.count}`).join(' · ')}`);
  }
  lines.push(`• Professeurs : ${fmt(data.students.teachers)}`);
  lines.push('');
  lines.push('💰 *PAIEMENTS (période)*');
  lines.push(`• Transactions enregistrées : ${fmt(data.payments.transactions)}`);
  lines.push(`• Total encaissé : ${fmt(data.payments.collected)} ${data.currencySymbol}`);
  lines.push(`• Total attendu : ${fmt(data.payments.expected)} ${data.currencySymbol}`);
  lines.push(`• Impayés actuels : ${fmt(data.payments.unpaid)}`);
  lines.push(`📢 *COMMUNICATIONS* : ${fmt(data.communications.sent)} envoyée${data.communications.sent > 1 ? 's' : ''}`);
  lines.push('');
  lines.push('⚠️ *DISCIPLINE (période)*');
  lines.push(`• Incidents / sanctions : ${fmt(data.discipline.incidents)}`);
  lines.push(`• Points positifs : ${fmt(data.discipline.positives)}`);
  lines.push(`• Convocations : ${fmt(data.discipline.convocations)}`);
  lines.push('');
  lines.push('✅ *PRÉSENCES (période)*');
  lines.push(data.attendance.rate !== null ? `• Taux de présence : ${data.attendance.rate}%` : '• Taux de présence : aucune donnée');
  lines.push(`• Présents : ${fmt(data.attendance.present)} · Absents : ${fmt(data.attendance.absent)} · Retards : ${fmt(data.attendance.late)}`);
  lines.push('');
  if (data.classRanking.top.length) {
    lines.push('🏆 *TOP CLASSES (présence · notes · discipline)*');
    for (const c of data.classRanking.top) {
      const g = c.gradeAvgPct !== null ? ` · notes ${c.gradeAvgPct}%` : '';
      lines.push(`• ${c.className} — score ${c.score}/100 (présence ${c.presenceRate !== null ? c.presenceRate + '%' : '—'}${g})`);
    }
    if (data.classRanking.worst) {
      lines.push(`• Classe à soutenir : ${data.classRanking.worst.className} — score ${data.classRanking.worst.score}/100`);
    }
    lines.push('');
  }
  if (data.studentRanking.top.length) {
    lines.push('🥇 *TOP 3 ÉLÈVES (période)*');
    for (const s of data.studentRanking.top) {
      lines.push(`• ${s.student} (${s.className}) — ${s.gradePct !== null ? s.gradePct + '%' : '—'} · conduite ${s.conductLabel}`);
    }
    lines.push('');
  }
  const gen = new Date(data.generatedAtISO);
  lines.push(`_Rapport scellé sur le rôle : ${sealLabel}_`);
  lines.push(`_Généré par EduGest le ${d(isoDate(gen))} à ${gen.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}_`);
  return lines.join('\n');
}

export { getRoleSealLabel };
