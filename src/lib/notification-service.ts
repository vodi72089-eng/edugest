import { db } from '@/lib/db';
import { sendPushToUser } from '@/lib/push';
import { resolveNotificationRecipients, type NotificationEvent, type ResolvedNotificationRecipient } from '@/lib/notification-recipient-resolver';
import { notifUrlForRole } from '@/lib/notification-routing';

/**
 * NotificationService — point d'entrée UNIQUE des notifications métier.
 *
 * notifyEvent(event, content) :
 *   1. résout les destinataires (NotificationRecipientResolver — la MÊME
 *      liste sert à DB, Push, Email et WhatsApp) ;
 *   2. crée les notifications DANS LA BASE (canal A) ;
 *   3. envoie le Web Push (canal B) avec une URL ouvrable PAR RÔLE ;
 *   4. envoie l'Email si explicitement demandé ET Resend configuré (canal F).
 *
 * WhatsApp : les templates riches (convocation, bulletin, paiement…) sont
 * envoyés par les routes métier elles-mêmes — elles réutilisent la MÊME liste
 * de destinataires renvoyée par resolveNotificationRecipients() (aucune
 * logique parallèle). Le service ne duplique donc pas ces templates.
 *
 * Son & notifications natives Windows (canal E / D) : côté client — le
 * frontend détecte les NOUVELLES notifications du poll (page.tsx Topbar),
 * joue le son (notification-sound.ts) et délègue à l'exe via preload
 * (`__edugest.notifications`) ; le Web Push ouvre la bonne URL via sw.js.
 *
 * Non bloquant : toute erreur est journalisée et avalée — l'opération métier
 * qui déclenche la notification ne doit JAMAIS échouer à cause d'elle.
 */

export interface NotifyEventContent {
  title: string;
  message: string;
  /** ID de l'entité liée (paymentId, gradeId, convocationId…) — stocké en DB. */
  relatedId?: string | null;
  /** Variante de message pour le PARENT (sinon même message que le staff). */
  parentMessage?: string;
  /** Email optionnel (canal F) — envoyé seulement si Resend est actif. */
  email?: { subject?: string };
  /** Indique que l'appelant gère lui-même le WhatsApp avec cette liste. */
  whatsappHandledByCaller?: true;
}

export interface NotifyEventResult {
  recipients: ResolvedNotificationRecipient[];
  dbCreated: number;
  pushSent: number;
  emailSent: number;
  emailSkipped: number;
}

export async function notifyEvent(event: NotificationEvent, content: NotifyEventContent): Promise<NotifyEventResult> {
  const result: NotifyEventResult = { recipients: [], dbCreated: 0, pushSent: 0, emailSent: 0, emailSkipped: 0 };
  try {
    const recipients = await resolveNotificationRecipients(event);
    result.recipients = recipients;
    if (recipients.length === 0) return result;

    const parentIds = new Set(
      recipients.filter((r) => r.role === 'PARENT').map((r) => r.userId)
    );

    // Emails : adresses des destinataires (canal F, optionnel).
    let emailByUser: Record<string, string | null> = {};
    if (content.email) {
      const users = await db.user.findMany({
        where: { id: { in: recipients.map((r) => r.userId) } },
        select: { id: true, email: true },
      });
      emailByUser = Object.fromEntries(users.map((u) => [u.id, u.email]));
    }

    for (const recipient of recipients) {
      try {
        const message = recipient.role === 'PARENT' && content.parentMessage
          ? content.parentMessage
          : content.message;

        const notification = await db.notification.create({
          data: {
            type: event.type,
            title: content.title,
            message,
            userId: recipient.userId,
            schoolId: event.schoolId ?? null,
            relatedId: content.relatedId ?? null,
          },
        });
        result.dbCreated++;

        // Canal B : Web Push — URL ouvrable selon le RÔLE du destinataire
        // (jamais une vue inexistante pour lui).
        sendPushToUser(recipient.userId, {
          title: content.title,
          body: message,
          tag: notification.id,
          url: notifUrlForRole(event.type, recipient.role),
        }).catch(() => {});
        result.pushSent++;

        // Canal F : Email (si demandé + adresse présente).
        if (content.email) {
          const to = emailByUser[recipient.userId];
          if (!to) {
            result.emailSkipped++;
          } else {
            try {
              const { isResendActive, sendEmailViaResend } = await import('@/lib/email');
              if (await isResendActive()) {
                const res = await sendEmailViaResend(to, content.email.subject || content.title, notificationEmailHtml(content.title, message));
                if (res.success) result.emailSent++;
                else result.emailSkipped++;
              } else {
                result.emailSkipped++;
              }
            } catch {
              result.emailSkipped++;
            }
          }
        }
      } catch (e) {
        console.error('[NotificationService] recipient error:', recipient.userId, event.type, e);
      }
    }
  } catch (e) {
    console.error('[NotificationService] notifyEvent error:', event.type, e);
  }
  return result;
}

/** Gabarit email sobre — les détails sensibles restent dans l'application. */
function notificationEmailHtml(title: string, message: string): string {
  return `
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"></head>
    <body style="margin:0;padding:0;background:#0a0f0d;font-family:'Segoe UI',Tahoma,sans-serif;">
      <div style="max-width:520px;margin:40px auto;background:linear-gradient(135deg,#0d1f1a,#0b1613);border-radius:16px;border:1px solid rgba(245,166,35,0.2);overflow:hidden;">
        <div style="background:linear-gradient(135deg,#f5a623,#ffb643);padding:20px;text-align:center;">
          <h1 style="margin:0;color:#0a0f0d;font-size:20px;font-weight:800;">🎓 EduGest</h1>
        </div>
        <div style="padding:28px;">
          <h2 style="color:#ffffff;margin:0 0 10px;font-size:17px;">${title}</h2>
          <p style="color:rgba(255,255,255,0.75);font-size:14px;line-height:1.6;margin:0;">${message}</p>
          <p style="color:rgba(255,255,255,0.4);font-size:12px;margin:18px 0 0;text-align:center;">
            Connectez-vous à EduGest pour consulter le détail.
          </p>
        </div>
      </div>
    </body></html>`;
}
