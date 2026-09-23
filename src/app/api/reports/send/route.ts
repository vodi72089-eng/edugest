import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  verifySchoolAccess,
  sanitizeError,
  getRoleCycle,
  classFilterForCycle,
} from '@/lib/auth';
import {
  getWhatsAppLiveStatus,
  getSchoolWhatsAppNumber,
  notifyCommunication,
} from '@/lib/whatsapp-agent';

// ─── Envoi du rapport par WhatsApp (agent de l'école) ───────────────────────
// POST /api/reports/send { schoolId, days }
//
// 1. Génère le TEXTE du rapport (format WhatsApp : emojis, titres en gras,
//    montants formatés simplement) pour les N derniers jours, scellé sur le
//    rôle de l'appelant (mêmes sections que GET /api/reports).
// 2. L'envoie via l'agent WhatsApp de l'école aux numéros du personnel
//    administratif (SCHOOL_ADMIN + DIRECTION_* de CETTE école, téléphone non
//    vide) — un message par destinataire (notifyCommunication, cible USER,
//    gate quota/connexion par école incluse).
// 3. Répond { data: { text, sent, warning? } } : le texte complet est TOUJOURS
//    renvoyé — l'admin principal (SUPER_ADMIN_GLOBAL) le partage via le
//    WhatsApp de l'app, et le front affiche un bouton de partage de secours
//    (copie + wa.me) quand l'agent de l'école n'est pas connecté.
//
// NB : la collecte est une version compacte de GET /api/reports (les helpers
// ne sont pas partageables entre fichiers route.ts — contrainte Next.js sur
// les exports autorisés). Aucune donnée personnelle d'élève : compteurs seuls.

const ALLOWED_DAYS = [1, 3, 4, 7];
const SEND_ALLOWED_ROLES = [
  'SUPER_ADMIN_GLOBAL',
  'SCHOOL_ADMIN',
  'SECRETARY',
  'DIRECTION_MATERNELLE',
  'DIRECTION_PRIMAIRE',
  'DIRECTION_SECONDAIRE',
  'DISCIPLINE_MATERNELLE',
  'DISCIPLINE_PRIMAIRE',
  'DISCIPLINE_SECONDAIRE',
  'TEACHER',
  'HEAD_TEACHER',
  'EPS',
];

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', CDF: 'FC', NGN: '₦', XOF: 'CFA', GHS: '₵', KES: 'KSh', ZAR: 'R', GBP: '£', CAD: 'C$',
};

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Format simple déterministe : 12500 → « 12 500 » (séparateur espace fine). */
function fmtNum(n: number): string {
  return String(Math.round(n * 100) / 100).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function periodLabel(days: number): string {
  if (days === 1) return 'RAPPORT DU JOUR';
  if (days === 7) return 'RAPPORT HEBDOMADAIRE';
  return `RAPPORT — ${days} DERNIERS JOURS`;
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

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    if (!SEND_ALLOWED_ROLES.includes(user.role)) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const daysParam = Number.parseInt(String((body as { days?: number }).days ?? '7'), 10);
    const days = ALLOWED_DAYS.includes(daysParam) ? daysParam : 7;

    // ── École de contexte (scellée) ────────────────────────────────────────
    let schoolId: string;
    if (user.role === 'SUPER_ADMIN_GLOBAL') {
      const requested = String((body as { schoolId?: string }).schoolId || '') ||
        new URL(request.url).searchParams.get('schoolId') || '';
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
      const requested = String((body as { schoolId?: string }).schoolId || '');
      if (requested && requested !== user.schoolId) {
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

    // ── Période ────────────────────────────────────────────────────────────
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - (days - 1));
    from.setHours(0, 0, 0, 0);
    const fromStr = isoDate(from);
    const toStr = isoDate(to);

    const cycle = getRoleCycle(user.role);
    const cycleClassWhere: Record<string, unknown> = cycle ? classFilterForCycle(cycle) : {};
    const isDirection = user.role.startsWith('DIRECTION_');
    const isDiscipline = user.role.startsWith('DISCIPLINE_');
    const isAdminLike =
      user.role === 'SUPER_ADMIN_GLOBAL' || user.role === 'SCHOOL_ADMIN' || isDirection;
    const isSecretary = user.role === 'SECRETARY';
    const isTeacherLike = ['TEACHER', 'HEAD_TEACHER', 'EPS'].includes(user.role);

    // Devise de l'école (montants stockés en base)
    const cur = await db.schoolCurrencyConfig.findUnique({
      where: { schoolId },
      select: { baseCurrency: true },
    });
    const currencySymbol = CURRENCY_SYMBOLS[cur?.baseCurrency || 'USD'] || cur?.baseCurrency || '$';

    // ── Collecte compacte (mêmes scoping que GET /api/reports) ────────────
    const lines: string[] = [];

    if (isAdminLike) {
      const classes = await db.class.findMany({
        where: { schoolId, ...(cycle ? { ...cycleClassWhere } : {}) },
        select: { id: true, name: true },
      });
      const studentWhere = {
        schoolId,
        isArchived: false,
        isExcluded: false,
        ...(cycle ? { class: cycleClassWhere } : {}),
      };
      const [totalStudents, byClassGroup, teachers, events] = await Promise.all([
        db.student.count({ where: studentWhere }),
        db.student.groupBy({ by: ['classId'], _count: true, where: studentWhere }),
        db.user.count({ where: { schoolId, isActive: true, role: { in: ['TEACHER', 'HEAD_TEACHER', 'EPS'] } } }),
        db.schoolEvent.findMany({
          where: { schoolId, startAt: { gte: from, lte: to } },
          orderBy: { startAt: 'asc' },
          take: 8,
          select: { title: true, startAt: true },
        }),
      ]);
      const topByClass = classes
        .map((c) => ({ name: c.name, count: byClassGroup.find((g) => g.classId === c.id)?._count || 0 }))
        .filter((x) => x.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      lines.push('👥 *EFFECTIFS*');
      lines.push(`• Élèves actifs : ${fmtNum(totalStudents)} (${classes.length} classe${classes.length > 1 ? 's' : ''})`);
      if (topByClass.length) {
        lines.push(`• ${topByClass.map((c) => `${c.name} : ${c.count}`).join(' · ')}`);
      }
      lines.push(`• Professeurs : ${fmtNum(teachers)}`);
      lines.push('');
      if (events.length) {
        lines.push('🗓️ *ÉVÉNEMENTS DE LA PÉRIODE*');
        for (const ev of events) {
          lines.push(`• ${ev.title} — ${fmtDate(isoDate(new Date(ev.startAt)))}`);
        }
        lines.push('');
      }
    }

    if (isAdminLike || isSecretary) {
      const [transactions, collectedAgg, expectedAgg, unpaid, comms] = await Promise.all([
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
        db.communication.count({ where: { schoolId, sentAt: { gte: from, lte: to } } }),
      ]);
      lines.push('💰 *PAIEMENTS (période)*');
      lines.push(`• Transactions enregistrées : ${fmtNum(transactions)}`);
      lines.push(`• Total encaissé : ${fmtNum(collectedAgg._sum.paidAmount || 0)} ${currencySymbol}`);
      if (isAdminLike) {
        lines.push(`• Total attendu : ${fmtNum(expectedAgg._sum.amount || 0)} ${currencySymbol}`);
      }
      lines.push(`• Impayés actuels : ${fmtNum(unpaid)}`);
      lines.push(`📢 *COMMUNICATIONS* : ${fmtNum(comms)} envoyée${comms > 1 ? 's' : ''}`);
      lines.push('');
    }

    if (isAdminLike || isDiscipline) {
      const disciplineWhere = {
        schoolId,
        createdAt: { gte: from, lte: to },
        ...(cycle ? { student: { class: cycleClassWhere } } : {}),
      };
      const [incidents, positives, convocations] = await Promise.all([
        db.disciplineRecord.count({ where: { ...disciplineWhere, listType: { in: ['BLACKLIST', 'GREYLIST'] } } }),
        db.disciplineRecord.count({ where: { ...disciplineWhere, listType: 'WHITELIST' } }),
        db.convocation.count({
          where: { schoolId, date: { gte: from, lte: to }, ...(cycle ? { student: { class: cycleClassWhere } } : {}) },
        }),
      ]);
      const statusGroups = await db.attendanceRecord.groupBy({
        by: ['status'],
        _count: true,
        where: {
          schoolId,
          date: { gte: fromStr, lte: toStr },
          ...(cycle ? { class: cycleClassWhere } : {}),
        },
      });
      const att = attendanceFromStatusGroups(statusGroups.map((g) => ({ status: g.status, _count: g._count })));

      lines.push('⚠️ *DISCIPLINE (période)*');
      lines.push(`• Incidents / sanctions : ${fmtNum(incidents)}`);
      lines.push(`• Points positifs : ${fmtNum(positives)}`);
      lines.push(`• Convocations : ${fmtNum(convocations)}`);
      lines.push('');
      lines.push('✅ *PRÉSENCES (période)*');
      lines.push(att.rate !== null
        ? `• Taux de présence : ${att.rate}%`
        : '• Taux de présence : aucune donnée');
      lines.push(`• Présents : ${fmtNum(att.present)} · Absents : ${fmtNum(att.absent)} · Retards : ${fmtNum(att.late)}`);
      lines.push('');

      if (isAdminLike) {
        const byClassRaw = await db.attendanceRecord.groupBy({
          by: ['classId', 'status'],
          _count: true,
          where: {
            schoolId,
            date: { gte: fromStr, lte: toStr },
            ...(cycle ? { class: cycleClassWhere } : {}),
          },
        });
        const classIds = [...new Set(byClassRaw.map((g) => g.classId))];
        const classRows = classIds.length
          ? await db.class.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } })
          : [];
        const top = classRows
          .map((c) => {
            const st = attendanceFromStatusGroups(
              byClassRaw.filter((g) => g.classId === c.id).map((g) => ({ status: g.status, _count: g._count }))
            );
            return { name: c.name, rate: st.rate, total: st.total };
          })
          .filter((c) => c.total > 0 && c.rate !== null)
          .sort((a, b) => (b.rate || 0) - (a.rate || 0))
          .slice(0, 5);
        if (top.length) {
          lines.push('🏆 *TOP CLASSES (présence)*');
          for (const c of top) lines.push(`• ${c.name} — ${c.rate}%`);
          lines.push('');
        }
      }
    }

    if (isTeacherLike) {
      const me = await db.user.findUnique({ where: { id: user.id }, select: { classNames: true } });
      const names = (me?.classNames || '').split(',').map((s) => s.trim()).filter(Boolean);
      const classes = names.length
        ? await db.class.findMany({ where: { schoolId, name: { in: names } }, select: { id: true, name: true } })
        : [];
      const classIds = classes.map((c) => c.id);
      let att = { present: 0, absent: 0, late: 0, total: 0, rate: null as number | null };
      if (classIds.length) {
        const statusGroups = await db.attendanceRecord.groupBy({
          by: ['status'],
          _count: true,
          where: { schoolId, date: { gte: fromStr, lte: toStr }, classId: { in: classIds } },
        });
        att = attendanceFromStatusGroups(statusGroups.map((g) => ({ status: g.status, _count: g._count })));
      }
      const myHomework = await db.homework.count({
        where: { schoolId, teacherId: user.id, createdAt: { gte: from, lte: to } },
      });
      lines.push('👩‍🏫 *MES CLASSES*');
      lines.push(classes.length ? `• ${classes.map((c) => c.name).join(', ')}` : '• Aucune classe occupée enregistrée');
      lines.push('✅ *PRÉSENCES DE MES CLASSES (période)*');
      lines.push(att.rate !== null ? `• Taux de présence : ${att.rate}%` : '• Aucune donnée de présence');
      lines.push(`📝 *DEVOIRS PUBLIÉS* : ${fmtNum(myHomework)} sur la période`);
      lines.push('');
    }

    // ── Assemblage du texte ────────────────────────────────────────────────
    const title = periodLabel(days);
    const bodyText = lines.join('\n').trim();
    const generatedAt = new Date();
    const fullText =
      `📋 *${title}*\n` +
      `🏫 ${school.name}\n` +
      `📅 Période : ${fmtDate(fromStr)} → ${fmtDate(toStr)} (${days} jour${days > 1 ? 's' : ''})\n\n` +
      `${bodyText}\n` +
      `_Rapport scellé sur le rôle : ${user.role}_\n` +
      `_Généré par EduGest le ${fmtDate(isoDate(generatedAt))} à ${generatedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}_`;

    // ── Destinataires : administratifs de CETTE école ──────────────────────
    const adminRecipientRoles = [
      'SCHOOL_ADMIN',
      'DIRECTION_MATERNELLE',
      'DIRECTION_PRIMAIRE',
      'DIRECTION_SECONDAIRE',
    ];
    const recipients = await db.user.findMany({
      where: { schoolId, isActive: true, role: { in: adminRecipientRoles } },
      select: { id: true, phone: true, name: true },
    });
    const validRecipients = recipients.filter((r) => (r.phone || '').trim().length > 0);

    // ── Connectivité de l'agent WhatsApp de l'école ───────────────────────
    const live = await getWhatsAppLiveStatus();
    const schoolPhone = await getSchoolWhatsAppNumber(schoolId);
    const agentReady = live.status === 'connected' && !!schoolPhone;

    let sentCount = 0;
    let failedCount = 0;
    let warning: string | undefined;

    if (!agentReady) {
      warning = `Agent WhatsApp de l'école non connecté (${live.status}) — partagez le rapport manuellement via le bouton Partager.`;
    } else if (validRecipients.length === 0) {
      warning = "Aucun destinataire administratif (admin/direction) avec numéro WhatsApp — partagez le rapport manuellement.";
    } else {
      for (const r of validRecipients) {
        try {
          const res = await notifyCommunication({
            schoolId,
            schoolName: school.name,
            title,
            content: bodyText,
            type: 'NOTIFICATION',
            targetType: 'USER',
            targetId: r.id,
          });
          sentCount += res.sent;
          failedCount += res.failed;
        } catch (e) {
          console.error('[Reports] Envoi WhatsApp rapport échoué pour', r.id, e);
          failedCount += 1;
        }
      }
      if (sentCount === 0) {
        warning = "L'envoi via l'agent WhatsApp de l'école a échoué — partagez le rapport manuellement via le bouton Partager.";
      }
    }

    return NextResponse.json({
      data: {
        text: fullText,
        sent: sentCount > 0,
        sentCount,
        failedCount,
        recipientCount: validRecipients.length,
        agentConnected: agentReady,
        period: { from: fromStr, to: toStr, days },
        ...(warning ? { warning } : {}),
      },
    });
  } catch (error) {
    console.error('Error sending report:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
