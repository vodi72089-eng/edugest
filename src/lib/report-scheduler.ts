import { db } from '@/lib/db';
import { notify } from '@/lib/notify';
import {
  collectDetailedReport,
  buildWhatsAppTextReport,
  nextLagosOccurrence,
} from '@/lib/report-data';
import { buildReportPdf } from '@/lib/report-pdf';
import {
  getWhatsAppLiveStatus,
  getSchoolWhatsAppNumber,
  sendWhatsAppMessage,
  sendWhatsAppDocument,
} from '@/lib/whatsapp-agent';

// ─── Planificateur agentique des rapports ───────────────────────────────────
// Chaque minute, le serveur balaie les ReportSchedule actifs dont nextRunAt
// est échu, génère le rapport (texte WhatsApp + PDF au design EduGest) et
// l'envoie aux destinataires programmés. Démarré par src/instrumentation.ts.

interface ScheduleLike {
  id: string;
  schoolId: string;
  createdBy: string;
  createdByName: string;
  intervalDays: number;
  hour: number;
  minute: number;
  recipients: string;
  sendPdf: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  runCount: number;
}

function parseRecipients(json: string): string[] {
  try {
    const arr = JSON.parse(json || '[]');
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => String(x).trim()).filter((x) => x.length >= 6);
  } catch {
    return [];
  }
}

// Anti double-exécution (instrumentation in-process + route scheduler-run +
// mini-service externe peuvent théoriquement déclencher le même id).
const runningScheduleIds = new Set<string>();

/** Exécute un programme : génère + envoie, puis met à jour son état. */
export async function runSchedule(schedule: ScheduleLike): Promise<{ status: string; detail: string }> {
  if (runningScheduleIds.has(schedule.id)) {
    return { status: 'running', detail: 'Exécution déjà en cours pour ce programme.' };
  }
  runningScheduleIds.add(schedule.id);
  try {
    return await runScheduleInner(schedule);
  } finally {
    runningScheduleIds.delete(schedule.id);
  }
}

async function runScheduleInner(schedule: ScheduleLike): Promise<{ status: string; detail: string }> {
  const days = Math.max(1, Math.min(31, schedule.intervalDays || 1));
  let status = 'failed';
  let detail = 'Erreur inconnue';

  try {
    const data = await collectDetailedReport(schedule.schoolId, days);
    const sealLabel = 'Propriétaire';
    const text = buildWhatsAppTextReport(data, sealLabel);
    const footer =
      `\n\n🤖 _Envoi automatique EduGest — tous les ${days} jour${days > 1 ? 's' : ''} à ` +
      `${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')} (heure locale)_`;
    const fullText = `${text}${footer}`;

    const recipients = parseRecipients(schedule.recipients);
    if (!recipients.length) {
      status = 'failed';
      detail = 'Aucun numéro destinataire valide configuré — le rapport n’a pas été envoyé.';
    } else {
      const live = await getWhatsAppLiveStatus();
      const schoolPhone = await getSchoolWhatsAppNumber(schedule.schoolId);
      const agentReady = live.status === 'connected' && !!schoolPhone;

      if (!agentReady) {
        status = 'agent_offline';
        detail = `Agent WhatsApp non connecté (${live.status}) — rapport généré mais non envoyé. Reconnectez l’agent ; l’envoi reprendra automatiquement.`;
      } else {
        // PDF joint (design EduGest)
        let pdfBase64: string | null = null;
        let filename = `rapport-${data.school.shortName || 'ecole'}-${data.period.to}.pdf`;
        if (schedule.sendPdf) {
          try {
            const buf = await buildReportPdf(data, sealLabel);
            pdfBase64 = buf.toString('base64');
          } catch (e) {
            console.error('[Scheduler] Génération PDF échouée :', e);
          }
        }

        let ok = 0;
        let fail = 0;
        for (const phone of recipients) {
          try {
            const sentText = await sendWhatsAppMessage(phone, fullText, schedule.schoolId);
            let sentDoc = true;
            if (pdfBase64) {
              sentDoc = await sendWhatsAppDocument({
                phone,
                fileBase64: pdfBase64,
                filename,
                mimetype: 'application/pdf',
                caption: `📋 ${periodTitleOf(days)} — ${data.school.name} (PDF EduGest)`,
                schoolId: schedule.schoolId,
              });
            }
            if (sentText && sentDoc) ok += 1;
            else fail += 1;
          } catch (e) {
            console.error('[Scheduler] Envoi vers', phone, 'échoué :', e);
            fail += 1;
          }
        }
        if (ok > 0 && fail === 0) {
          status = 'success';
          detail = `Rapport envoyé à ${ok} destinataire${ok > 1 ? 's' : ''}${pdfBase64 ? ' (texte + PDF)' : ''}.`;
        } else if (ok > 0) {
          status = 'partial';
          detail = `Envoi partiel : ${ok} succès, ${fail} échec${fail > 1 ? 's' : ''}.`;
        } else {
          status = 'failed';
          detail = `Envoi échoué pour les ${fail} destinataire${fail > 1 ? 's' : ''}.`;
        }
      }
    }

    // Journal d'audit non bloquant
    try {
      const school = await db.school.findUnique({ where: { id: schedule.schoolId }, select: { name: true } });
      await db.auditLog.create({
        data: {
          userId: schedule.createdBy,
          userName: schedule.createdByName,
          userRole: 'SCHOOL_ADMIN',
          action: 'REPORT_SCHEDULE_RUN',
          entityType: 'ReportSchedule',
          entityId: schedule.id,
          details: `Automatisation ${schedule.intervalDays}j/${schedule.hour}h${String(schedule.minute).padStart(2, '0')} — ${status} : ${detail} (école ${school?.name || schedule.schoolId})`,
        },
      });
    } catch { /* audit non bloquant */ }

    // ── Réception IN-APP : notification aux admins de l'école ────────────
    // Le rapport est toujours consultable dans « Rapports » (PDF détaillé),
    // même si l'agent WhatsApp est hors ligne ou qu'un envoi a échoué.
    try {
      const admins = await db.user.findMany({
        where: {
          schoolId: schedule.schoolId,
          isActive: true,
          role: { in: ['SCHOOL_ADMIN', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE'] },
        },
        select: { id: true },
      });
      const [y, m, d] = data.period.to.split('-');
      const periodFr = `${d}/${m}/${y}` + (data.period.days > 1 ? ` (${data.period.days} jours)` : '');
      const statusFr =
        status === 'success' ? 'envoyé sur WhatsApp (texte + PDF)' :
        status === 'partial' ? 'envoyé partiellement sur WhatsApp' :
        status === 'agent_offline' ? 'généré — agent WhatsApp hors ligne, PDF disponible dans l\'app' :
        'généré — envoi WhatsApp en échec, PDF disponible dans l\'app';
      for (const a of admins) {
        await notify({
          data: {
            type: 'REPORT_READY',
            title: `📊 Rapport d'activité — ${periodFr}`,
            message: `${data.school.name} : ${statusFr}. Ouvrez « Rapports » pour consulter le PDF détaillé.`,
            userId: a.id,
            schoolId: schedule.schoolId,
            linkTo: 'reports',
          },
        });
      }
    } catch { /* notification non bloquante */ }
  } catch (e) {
    console.error('[Scheduler] runSchedule erreur :', e);
    detail = `Erreur de génération : ${(e as Error)?.message || 'inconnue'}`;
  }

  // Avance le planning : + intervalDays à partir de l'échéance (rattrapage borné)
  try {
    let next = schedule.nextRunAt ? new Date(schedule.nextRunAt) : nextLagosOccurrence(schedule.hour, schedule.minute);
    const now = Date.now();
    let guard = 0;
    while (next.getTime() <= now && guard < 60) {
      next = new Date(next.getTime() + days * 24 * 3600_000);
      guard++;
    }
    if (next.getTime() <= now) {
      next = nextLagosOccurrence(schedule.hour, schedule.minute);
    }
    await db.reportSchedule.update({
      where: { id: schedule.id },
      data: {
        lastRunAt: new Date(),
        nextRunAt: next,
        lastStatus: status,
        lastDetail: detail,
        runCount: { increment: 1 },
      },
    });
  } catch (e) {
    console.error('[Scheduler] Mise à jour du planning échouée :', e);
  }

  return { status, detail };
}

function periodTitleOf(days: number): string {
  if (days === 1) return 'Rapport quotidien';
  if (days === 7) return 'Rapport hebdomadaire';
  return `Rapport — ${days} jours`;
}

// ─── Planificateur in-process (src/instrumentation.ts) ──────────────────────
// Option serveur 24/7 : à chaque démarrage de l'instance Next, une passe
// balaye les ReportSchedule actifs dont nextRunAt est échu (toutes les 60 s).
// Fonctionne en dev, en standalone (prod) et dans l'exe desktop — aucun
// processus externe requis. Le mini-service port 3002 reste un redondant
// optionnel ; le verrou runningScheduleIds empêche tout double envoi.
const SCHEDULER_GLOBAL_KEY = '__edugestReportSchedulerStarted';

export function startInProcessScheduler(intervalMs = 60_000): void {
  const g = globalThis as unknown as Record<string, unknown>;
  if (g[SCHEDULER_GLOBAL_KEY]) return;
  g[SCHEDULER_GLOBAL_KEY] = true;
  const tick = () => { void sweepDueSchedules(); };
  setTimeout(tick, 10_000); // première passe peu après le boot
  setInterval(tick, intervalMs);
  console.log(`[Scheduler] Planificateur in-process démarré (balayage toutes les ${intervalMs / 1000} s)`);
}

async function sweepDueSchedules(): Promise<void> {
  try {
    const due = await db.reportSchedule.findMany({
      where: { isActive: true, nextRunAt: { not: null, lte: new Date() } },
    });
    for (const s of due) {
      if (runningScheduleIds.has(s.id)) continue;
      console.log(`[Scheduler] Programme échu ${s.id} (${s.intervalDays}j à ${s.hour}h${String(s.minute).padStart(2, '0')}) — exécution in-process`);
      await runSchedule(s);
    }
  } catch (e) {
    console.error('[Scheduler] Balayage échoué :', e);
  }
}
