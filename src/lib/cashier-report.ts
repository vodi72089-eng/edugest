import { db } from '@/lib/db';

// ─── Rapport de CAISSE (nouveau type d'automatisation) ──────────────────────
// Demande caisse : le programme est réglé sur une HEURE d'envoi (ex. 12:00)
// toutes les N heures ; le rapport regroupe TOUS les paiements reçus jusqu'à
// l'heure d'envoi − 1 minute (ex. envoi 12h00 → paiements jusqu'à 11h59:59),
// avec :
//   • nombre de payeurs + total encaissé + décompte PAR HEURE
//   • dettes actuelles (nb de débiteurs + total restant dû)
//   • les 5 cas de dettes LES PLUS GRAVES et les 5 MOINDRES
// Fuseau : Africa/Lagos (UTC+1, pas d'heure d'hiver) — même convention que
// le planificateur de rapports existant.

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', CDF: 'FC', NGN: '₦', XOF: 'CFA', GHS: '₵', KES: 'KSh', ZAR: 'R', GBP: '£', CAD: 'C$',
};

const LAGOS_OFFSET_MS = 3_600_000; // Africa/Lagos = UTC+1

export interface CashierPaymentRow {
  student: string;
  className: string;
  amount: number;
  paidAtISO: string | null;
  receipt: string;
  method: string;
}

export interface CashierHourRow {
  hour: number;      // 0-23 (heure de Lagos)
  count: number;     // paiements reçus cette heure-là
  total: number;     // montant encaissé cette heure-là
}

export interface CashierDebtRow {
  student: string;
  className: string;
  expected: number;
  paid: number;
  remaining: number;
}

export interface CashierReport {
  school: {
    id: string; name: string; shortName: string;
    address: string | null; city: string | null; province: string | null;
    phone: string | null; email: string | null; logo: string | null;
  };
  /** Intervalle couvert : from = début (minuit Lagos), to = jour du rapport. */
  period: { from: string; to: string; days: number };
  /** Coupure : dernière seconde prise en compte (ex. 11:59:59 pour envoi 12h). */
  cutoff: { iso: string; dateLabel: string; timeLabel: string };
  /** Réglage du programme (fréquence + heure d'envoi). */
  schedule: { intervalDays: number; hour: number; minute: number };
  generatedAtISO: string;
  currencySymbol: string;
  sealLabel: string;
  payments: {
    transactions: number;
    payers: number;           // nombre de gens distincts qui ont payé
    collected: number;
    byHour: CashierHourRow[]; // décompte « selon l'heure »
    list: CashierPaymentRow[];
  };
  debts: {
    count: number;            // élèves endettés
    total: number;            // total restant dû
    worst: CashierDebtRow[];  // cas les plus graves (top 5)
    least: CashierDebtRow[];  // cas les moins graves (top 5)
  };
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Coupure du rapport : heure d'envoi − 1 minute, seconde 59, en UTC.
 * Ex. envoi à 12:00 → 11:59:59 (heure de Lagos) le jour courant.
 */
export function cashierCutoff(hour: number, minute: number, now: Date = new Date()): Date {
  const lagos = new Date(now.getTime() + LAGOS_OFFSET_MS);
  const y = lagos.getUTCFullYear();
  const m = lagos.getUTCMonth();
  const d = lagos.getUTCDate();
  // Date.UTC normalise minute=-1 → 11:59:59 pour 12:00 (ou lendemain −1 j)
  return new Date(Date.UTC(y, m, d, hour, minute - 1, 59) - LAGOS_OFFSET_MS);
}

/** Date de Lagos (jour courant à minuit Lagos) exprimée en UTC. */
function lagosDayStart(daysAgo: number, now: Date = new Date()): Date {
  const lagos = new Date(now.getTime() + LAGOS_OFFSET_MS);
  const y = lagos.getUTCFullYear();
  const m = lagos.getUTCMonth();
  const d = lagos.getUTCDate();
  return new Date(Date.UTC(y, m, d - daysAgo, 0, 0, 0) - LAGOS_OFFSET_MS);
}

/** « 29/09/2026 à 11:59:59 » (heure Africa/Lagos). */
function fmtLagos(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const dt = new Date(iso);
    const lagos = new Date(dt.getTime() + LAGOS_OFFSET_MS);
    const p = (v: number) => String(v).padStart(2, '0');
    return `${p(lagos.getUTCDate())}/${p(lagos.getUTCMonth() + 1)}/${lagos.getUTCFullYear()} à ${p(lagos.getUTCHours())}:${p(lagos.getUTCMinutes())}:${p(lagos.getUTCSeconds())}`;
  } catch {
    return '—';
  }
}

/**
 * Collecte le rapport de caisse d'une école.
 * @param intervalDays fréquence du programme (couvre les N derniers jours)
 * @param hour / @minute heure d'envoi du programme (définit la coupure)
 */
export async function collectCashierReport(
  schoolId: string,
  intervalDays: number,
  hour: number,
  minute: number,
  now: Date = new Date(),
): Promise<CashierReport> {
  const days = Math.max(1, Math.min(31, Math.round(intervalDays || 1)));
  const cutoff = cashierCutoff(hour, minute, now);
  const from = lagosDayStart(days - 1, now);
  const fromStr = isoDate(from);
  const toStr = isoDate(cutoff);

  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: {
      id: true, name: true, shortName: true, address: true, city: true,
      province: true, phone: true, email: true, logo: true,
    },
  });
  if (!school) throw new Error('École non trouvée');

  const cur = await db.schoolCurrencyConfig.findUnique({
    where: { schoolId },
    select: { baseCurrency: true },
  });
  const currencySymbol = CURRENCY_SYMBOLS[cur?.baseCurrency || 'USD'] || cur?.baseCurrency || '$';

  const classes = await db.class.findMany({
    where: { schoolId },
    select: { id: true, name: true },
  });
  const classNameById = new Map(classes.map((c) => [c.id, c.name]));

  const periodWhere = { schoolId, status: { in: ['PAID', 'PARTIAL'] }, paidAt: { gte: from, lte: cutoff } };

  // ── Paiements de l'intervalle (jusqu'à la coupure) ──────────────────────
  const [transactionsAgg, collectedAgg, payerGroups, paymentRows] = await Promise.all([
    db.paymentRecord.count({ where: periodWhere }),
    db.paymentRecord.aggregate({ _sum: { paidAmount: true }, where: periodWhere }),
    db.paymentRecord.groupBy({ by: ['studentId'], _count: true, where: periodWhere }),
    db.paymentRecord.findMany({
      where: periodWhere,
      select: {
        id: true,
        amount: true, paidAmount: true, paidAt: true, receiptNumber: true,
        referenceNumber: true, paymentMethod: true, studentId: true,
      },
      orderBy: { paidAt: 'desc' },
      take: 1000,
    }),
  ]);

  // Noms des élèves ayant payé
  const payStudentIds = [...new Set(paymentRows.map((p) => p.studentId))];
  const payStudents = payStudentIds.length
    ? await db.student.findMany({
        where: { id: { in: payStudentIds } },
        select: { id: true, firstName: true, lastName: true, classId: true },
      })
    : [];
  const payStudentById = new Map(payStudents.map((s) => [s.id, s]));

  const paymentsList: CashierPaymentRow[] = paymentRows.map((p) => {
    const s = payStudentById.get(p.studentId);
    return {
      student: s ? `${s.firstName} ${s.lastName}` : `Élève ${p.studentId.slice(-6)}`,
      className: s ? classNameById.get(s.classId) || '—' : '—',
      amount: p.paidAmount || p.amount,
      paidAtISO: p.paidAt ? p.paidAt.toISOString() : null,
      receipt: p.receiptNumber || p.referenceNumber || `REC-${p.id?.slice?.(-8) || p.studentId.slice(-6).toUpperCase()}`,
      method: p.paymentMethod || '—',
    };
  });

  // ── Décompte PAR HEURE (heure de Lagos) — « les gens qui ont payé selon l'heure »
  const hourMap = new Map<number, { count: number; total: number }>();
  for (const p of paymentRows) {
    if (!p.paidAt) continue;
    const lagos = new Date(p.paidAt.getTime() + LAGOS_OFFSET_MS);
    const h = lagos.getUTCHours();
    const row = hourMap.get(h) || { count: 0, total: 0 };
    row.count += 1;
    row.total += p.paidAmount || p.amount;
    hourMap.set(h, row);
  }
  const byHour: CashierHourRow[] = [...hourMap.entries()]
    .map(([h, v]) => ({ hour: h, count: v.count, total: v.total }))
    .sort((a, b) => a.hour - b.hour);

  // ── Dettes : état AU MOMENT de la coupure (créées jusqu'à la coupure) ────
  const debtGroups = await db.paymentRecord.groupBy({
    by: ['studentId'],
    _sum: { amount: true, paidAmount: true },
    where: { schoolId, createdAt: { lte: cutoff } },
  });
  const debtors = debtGroups
    .map((g) => ({
      studentId: g.studentId,
      expected: g._sum.amount || 0,
      paid: g._sum.paidAmount || 0,
      remaining: (g._sum.amount || 0) - (g._sum.paidAmount || 0),
    }))
    .filter((d) => d.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining);

  const worstRaw = debtors.slice(0, 5);
  const worstIds = new Set(worstRaw.map((d) => d.studentId));
  // Les plus petites dettes (hors déjà listés « graves » quand il y a le choix)
  const leastRaw = (debtors.length > 5 ? debtors.filter((d) => !worstIds.has(d.studentId)) : [])
    .slice(-5)
    .reverse();

  const debtStudentIds = [...new Set([...worstRaw, ...leastRaw].map((d) => d.studentId))];
  const debtStudents = debtStudentIds.length
    ? await db.student.findMany({
        where: { id: { in: debtStudentIds } },
        select: { id: true, firstName: true, lastName: true, classId: true },
      })
    : [];
  const debtStudentById = new Map(debtStudents.map((s) => [s.id, s]));
  const toDebtRow = (d: { studentId: string; expected: number; paid: number; remaining: number }): CashierDebtRow => {
    const s = debtStudentById.get(d.studentId);
    return {
      student: s ? `${s.firstName} ${s.lastName}` : `Élève ${d.studentId.slice(-6)}`,
      className: s ? classNameById.get(s.classId) || '—' : '—',
      expected: d.expected,
      paid: d.paid,
      remaining: d.remaining,
    };
  };

  return {
    school,
    period: { from: fromStr, to: toStr, days },
    cutoff: {
      iso: cutoff.toISOString(),
      dateLabel: fmtLagos(cutoff.toISOString()).split(' à ')[0],
      timeLabel: fmtLagos(cutoff.toISOString()).split(' à ')[1] || '—',
    },
    schedule: { intervalDays: days, hour, minute },
    generatedAtISO: now.toISOString(),
    currencySymbol,
    sealLabel: 'Caisse',
    payments: {
      transactions: transactionsAgg,
      payers: payerGroups.length,
      collected: collectedAgg._sum.paidAmount || 0,
      byHour,
      list: paymentsList,
    },
    debts: {
      count: debtors.length,
      total: debtors.reduce((s, d) => s + d.remaining, 0),
      worst: worstRaw.map(toDebtRow),
      least: leastRaw.map(toDebtRow),
    },
  };
}

/**
 * Construit le TEXTE WhatsApp du rapport de caisse (format emoji).
 */
export function buildWhatsAppCashierText(data: CashierReport, sealLabel: string): string {
  const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const d = (iso: string) => {
    const [y, m, day] = iso.split('-');
    return `${day}/${m}/${y}`;
  };
  const hhmm = `${String(data.schedule.hour).padStart(2, '0')}:${String(data.schedule.minute).padStart(2, '0')}`;
  const lines: string[] = [];
  lines.push('📋 *RAPPORT DE CAISSE*');
  lines.push(`🏫 ${data.school.name}`);
  lines.push(`📅 Période : ${d(data.period.from)} → ${d(data.period.to)} (${data.period.days} jour${data.period.days > 1 ? 's' : ''})`);
  lines.push(`⏰ Envoi : tous les ${data.period.days} jours à ${hhmm} · paiements reçus jusqu’à ${data.cutoff.dateLabel} ${data.cutoff.timeLabel}`);
  lines.push('');
  lines.push('💰 *PAIEMENTS (intervalle)*');
  lines.push(`• Nombre de payeurs : ${fmt(data.payments.payers)}`);
  lines.push(`• Paiements reçus : ${fmt(data.payments.transactions)}`);
  lines.push(`• Total encaissé : ${fmt(data.payments.collected)} ${data.currencySymbol}`);
  if (data.payments.byHour.length) {
    lines.push('');
    lines.push('🕐 *PAIEMENTS SELON L’HEURE*');
    for (const h of data.payments.byHour.slice(0, 16)) {
      lines.push(`• ${String(h.hour).padStart(2, '0')}h–${String((h.hour + 1) % 24).padStart(2, '0')}h : ${h.count} paiement${h.count > 1 ? 's' : ''} — ${fmt(h.total)} ${data.currencySymbol}`);
    }
  }
  lines.push('');
  lines.push('🏦 *DETTES*');
  lines.push(`• Élèves endettés : ${fmt(data.debts.count)}`);
  lines.push(`• Total restant dû : ${fmt(data.debts.total)} ${data.currencySymbol}`);
  lines.push('');
  if (data.debts.worst.length) {
    lines.push('🔴 *CAS LES PLUS GRAVES*');
    for (const w of data.debts.worst) {
      lines.push(`• ${w.student} (${w.className}) — ${fmt(w.remaining)} ${data.currencySymbol} dus`);
    }
    lines.push('');
  }
  if (data.debts.least.length) {
    lines.push('🟢 *CAS LES MOINDRES*');
    for (const l of data.debts.least) {
      lines.push(`• ${l.student} (${l.className}) — ${fmt(l.remaining)} ${data.currencySymbol} dus`);
    }
    lines.push('');
  }
  if (!data.debts.worst.length && !data.debts.least.length) {
    lines.push('🟢 Aucune dette en cours — tous les élèves sont à jour.');
    lines.push('');
  }
  if (data.payments.list.length) {
    lines.push('🧾 *DERNIERS PAIEMENTS (heure locale)*');
    for (const p of data.payments.list.slice(0, 15)) {
      const t = p.paidAtISO ? fmtLagos(p.paidAtISO).replace(/^\d{2}\/\d{2}\/\d{4} à /, '') : '—';
      lines.push(`• ${t} — ${p.student} (${p.className}) — ${fmt(p.amount)} ${data.currencySymbol} · reçu ${p.receipt}`);
    }
    if (data.payments.list.length > 15) {
      lines.push(`… et ${fmt(data.payments.list.length - 15)} paiement(s) de plus (voir PDF).`);
    }
    lines.push('');
  }
  const gen = new Date(data.generatedAtISO);
  lines.push(`_Rapport scellé sur le rôle : ${sealLabel}_`);
  lines.push(`_Généré par Look School 360 le ${d(isoDate(gen))} à ${gen.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}_`);
  return lines.join('\n');
}
