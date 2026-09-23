import { db } from '@/lib/db';
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

/** Exécute un programme : génère + envoie, puis met à jour son état. */
export async function runSchedule(schedule: ScheduleLike): Promise<{ status: string; detail: string }> {
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
