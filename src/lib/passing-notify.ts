import { db } from '@/lib/db';
import { notify } from '@/lib/notify';
import { isResendActive, sendEmailViaResend } from '@/lib/email';

// ═══════════════════════════════════════════════════════════════════════════
// Notifications « Passage de classe » aux administrateurs
//
// À chaque mise à jour (décision validée, programmation plateforme), les
// admins concernés reçoivent :
//   1. une notification DANS L'APP (+ Web Push) via notify()
//   2. un EMAIL via Resend (configuré dans Communications → Config API)
//      — fallback silencieux : si Resend n'est pas configuré, seul
//        l'avertissement console est émis, l'opération n'échoue jamais.
// ═══════════════════════════════════════════════════════════════════════════

/** Rôles du personnel de l'école notifiés pour les mises à jour du passage de
 *  classe. Le CASHIER en est EXCLU (environnement caisse = paiements, pas la
 *  scolarité/passage). */
export const PASSING_STAFF_ROLES = [
  'SCHOOL_ADMIN',
  'SECRETARY',
  'DIRECTION_MATERNELLE',
  'DIRECTION_PRIMAIRE',
  'DIRECTION_SECONDAIRE',
];

/** Plafond de destinataires quand l'opération cible toutes les écoles */
const MAX_RECIPIENTS = 500;

export interface PassingAdminNotice {
  title: string;
  message: string;
  type: string;
  schoolId?: string | null;
  schoolName?: string | null;
  relatedId?: string | null;
  excludeUserId?: string | null;
}

export interface PassingAdminNoticeResult {
  appSent: number;
  emailSent: number;
  emailSkipped: number; // destinataires sans email ou Resend inactif
  recipients: number;
}

function emailHtml(params: { title: string; message: string; schoolName?: string | null }): string {
  const brand = params.schoolName || 'EduGest';
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background-color:#0a0f0d;font-family:'Segoe UI',Tahoma,sans-serif;">
      <div style="max-width:520px;margin:40px auto;background:linear-gradient(135deg,#0d1f1a,#0b1613);border-radius:16px;border:1px solid rgba(245,166,35,0.2);overflow:hidden;">
        <div style="background:linear-gradient(135deg,#f5a623,#ffb643);padding:20px;text-align:center;">
          <h1 style="margin:0;color:#0a0f0d;font-size:20px;font-weight:800;">🎓 ${brand}</h1>
        </div>
        <div style="padding:28px;">
          <h2 style="color:#ffffff;margin:0 0 10px;font-size:17px;">${params.title}</h2>
          <p style="color:rgba(255,255,255,0.75);font-size:14px;line-height:1.6;margin:0 0 18px;">${params.message}</p>
          <p style="color:rgba(255,255,255,0.4);font-size:12px;margin:0;text-align:center;">
            Notification automatique — EduGest, la plateforme de gestion scolaire
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Notifie les admins (personnel de l'école + super admins plateforme) d'une
 * mise à jour du passage de classe : notification in-app (+ push) puis email
 * Resend. Toutes les étapes sont non bloquantes pour l'appelant.
 */
export async function notifyPassingUpdateToAdmins(params: PassingAdminNotice): Promise<PassingAdminNoticeResult> {
  const result: PassingAdminNoticeResult = { appSent: 0, emailSent: 0, emailSkipped: 0, recipients: 0 };

  try {
    // Politique destinataires (resolver-compatible) :
    //   BULLETIN_UPDATED → Parent (déjà notifié par la route métier) + SCHOOL_ADMIN
    //   CLASS_PASSING et assimilés → staff de l'école + super admins plateforme
    const isBulletin = String(params.type || '').startsWith('BULLETIN');
    const whereSchool = params.schoolId
      ? { isActive: true, role: { in: isBulletin ? ['SCHOOL_ADMIN'] : PASSING_STAFF_ROLES }, schoolId: params.schoolId }
      : { isActive: true, role: { in: isBulletin ? ['SCHOOL_ADMIN'] : PASSING_STAFF_ROLES } };
    const staff = await db.user.findMany({
      where: whereSchool,
      select: { id: true, email: true },
    });
    const globals = isBulletin
      ? []
      : await db.user.findMany({
          where: { isActive: true, role: 'SUPER_ADMIN_GLOBAL' },
          select: { id: true, email: true },
        });

    // Déduplique (un user peut être staff école ET super admin), plafonne
    const seen = new Set<string>();
    const recipients = [...staff, ...globals]
      .filter((u) => {
        if (seen.has(u.id) || u.id === params.excludeUserId) return false;
        seen.add(u.id);
        return true;
      })
      .slice(0, MAX_RECIPIENTS);
    result.recipients = recipients.length;

    const emailActive = await isResendActive();

    for (const recipient of recipients) {
      // 1) Notification in-app (+ Web Push)
      try {
        await notify({
          data: {
            type: params.type,
            title: params.title,
            message: params.message,
            userId: recipient.id,
            schoolId: params.schoolId ?? null,
            relatedId: params.relatedId ?? null,
          },
        });
        result.appSent++;
      } catch (e) {
        console.error('[PassingNotify] In-app notification error:', e);
      }

      // 2) Email via Resend (si configuré + adresse disponible)
      if (recipient.email) {
        if (!emailActive) {
          result.emailSkipped++;
          continue;
        }
        try {
          const res = await sendEmailViaResend(
            recipient.email,
            params.title,
            emailHtml({ title: params.title, message: params.message, schoolName: params.schoolName })
          );
          if (res.success) result.emailSent++;
          else {
            result.emailSkipped++;
            console.warn('[PassingNotify] Email non envoyé à', recipient.email, ':', res.error);
          }
        } catch (e) {
          result.emailSkipped++;
          console.error('[PassingNotify] Email error:', e);
        }
      } else {
        result.emailSkipped++;
      }
    }
  } catch (e) {
    console.error('[PassingNotify] Fatal (non-blocking):', e);
  }

  return result;
}
