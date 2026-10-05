import { db } from '@/lib/db';
import { notify } from '@/lib/notify';
import {
  collectCashierReport,
  buildWhatsAppCashierText,
} from '@/lib/cashier-report';
import { nextLagosOccurrence } from '@/lib/report-data';
import { buildCashierReportPdf } from '@/lib/cashier-report-pdf';
import {
  getWhatsAppLiveStatus,
  getSchoolWhatsAppNumber,
  sendWhatsAppMessage,
  sendWhatsAppDocument,
} from '@/lib/whatsapp-agent';

// ─── Exécution d'un programme de rapport de CAISSE ──────────────────────────
// Même cycle que runScheduleInner (activité) mais contenu caisse : le rapport
// couvre l'intervalle jusqu'à l'heure d'envoi − 1 minute (ex. 12h00 → 11h59),
// avec paiements, décompte horaire, dettes et cas graves ↔ moindres.
// Dispatché par runSchedule() dans src/lib/report-scheduler.ts (reportType).

interface CashierScheduleLike {
  id: string;
  schoolId: string;
  createdBy: string;
  createdByName: string;
  intervalDays: number;
  hour: number;
  minute: number;
  recipients: string;
  sendPdf: boolean;
  nextRunAt: Date | null;
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

/** Exécute un programme de rapport de caisse : génère + envoie, puis met à jour son état. */
export async function runCashierSchedule(
  schedule: CashierScheduleLike,
): Promise<{ status: string; detail: string }> {
  const days = Math.max(1, Math.min(31, schedule.intervalDays || 1));
  let status = 'failed';
  let detail = 'Erreur inconnue';

  try {
    const data = await collectCashierReport(schedule.schoolId, days, schedule.hour, schedule.minute);
    const sealLabel = 'Caisse';
    const text = buildWhatsAppCashierText(data, sealLabel);
    const hhmm = `${String(schedule.hour).padStart(2, '0')}:${String(schedule.minute).padStart(2, '0')}`;
    const footer =
      `\n\n🤖 _Envoi automatique Look School 360 — rapport de caisse tous les ${days} jour${days > 1 ? 's' : ''} à ` +
      `${hhmm} (heure locale)_`;
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
        // PDF joint (design Look School 360)
        let pdfBase64: string | null = null;
        let filename = `rapport-caisse-${data.school.shortName || 'ecole'}-${data.period.to}.pdf`;
        if (schedule.sendPdf) {
          try {
            const buf = await buildCashierReportPdf(data, sealLabel);
            pdfBase64 = buf.toString('base64');
          } catch (e) {
            console.error('[Scheduler] Génération PDF caisse échouée :', e);
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
                caption: `📋 Rapport de caisse — ${data.school.name} (PDF Look School 360)`,
                schoolId: schedule.schoolId,
              });
            }
            if (sentText && sentDoc) ok += 1;
            else fail += 1;
          } catch (e) {
            console.error('[Scheduler] Envoi caisse vers', phone, 'échoué :', e);
            fail += 1;
          }
        }
        if (ok > 0 && fail === 0) {
          status = 'success';
          detail = `Rapport de caisse envoyé à ${ok} destinataire${ok > 1 ? 's' : ''}${pdfBase64 ? ' (texte + PDF)' : ''}.`;
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
      const [school, creator] = await Promise.all([
        db.school.findUnique({ where: { id: schedule.schoolId }, select: { name: true } }),
        db.user.findUnique({ where: { id: schedule.createdBy }, select: { role: true } }),
      ]);
      await db.auditLog.create({
        data: {
          userId: schedule.createdBy,
          userName: schedule.createdByName,
          userRole: creator?.role || 'SCHOOL_ADMIN',
          action: 'REPORT_SCHEDULE_RUN',
          entityType: 'ReportSchedule',
          entityId: schedule.id,
          details: `Automatisation caisse ${days}j/${schedule.hour}h${String(schedule.minute).padStart(2, '0')} — ${status} : ${detail} (école ${school?.name || schedule.schoolId})`,
        },
      });
    } catch { /* audit non bloquant */ }

    // ── Réception IN-APP : notification caisse + direction ─────────────────
    try {
      const users = await db.user.findMany({
        where: {
          schoolId: schedule.schoolId,
          isActive: true,
          role: { in: ['CASHIER', 'SCHOOL_ADMIN', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE'] },
        },
        select: { id: true },
      });
      const [y, m, d] = data.period.to.split('-');
      const periodFr = `${d}/${m}/${y}`;
      const statusFr =
        status === 'success' ? 'envoyé sur WhatsApp (texte + PDF)' :
        status === 'partial' ? 'envoyé partiellement sur WhatsApp' :
        status === 'agent_offline' ? 'généré — agent WhatsApp hors ligne, disponible dans l\'app' :
        'généré — envoi WhatsApp en échec, disponible dans l\'app';
      for (const u of users) {
        await notify({
          data: {
            type: 'REPORT_READY',
            title: `🧾 Rapport de caisse — ${periodFr}`,
            message: `${data.school.name} : ${statusFr}. Ouvrez « Rapports » pour consulter le détail.`,
            userId: u.id,
            schoolId: schedule.schoolId,
            linkTo: 'reports',
          },
        });
      }
    } catch { /* notification non bloquante */ }
  } catch (e) {
    console.error('[Scheduler] runCashierSchedule erreur :', e);
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
    console.error('[Scheduler] Mise à jour du planning caisse échouée :', e);
  }

  return { status, detail };
}
