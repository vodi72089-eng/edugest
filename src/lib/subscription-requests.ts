// Demandes d'abonnement : création auto (inscription) + réponse au demandeur.
//
// - L'inscription avec une formule payante crée une école FREEMIUM + une
//   demande PENDING (jamais d'auto-attribution payante) notifiée aux
//   super admins DANS l'application.
// - À la décision (PATCH approuve/rejette), le demandeur est prévenu par
//   email et/ou WhatsApp (best-effort : un échec ne bloque jamais).
import { db } from './db';
import { notify } from './notify';

export const PAID_TIERS = ['ESSENTIEL', 'STANDARD', 'PREMIUM', 'ENTERPRISE', 'CORPORATE'];

const TIER_LABELS: Record<string, string> = {
  FREEMIUM: 'Freemium',
  ESSENTIEL: 'Essentiel',
  STANDARD: 'Standard',
  PREMIUM: 'Professionnel',
  ENTERPRISE: 'Enterprise',
  CORPORATE: 'Corporate',
};

export function subscriptionTierLabel(tier: string): string {
  return TIER_LABELS[tier] || tier;
}

/** Vrai numéro appelable — rejette les fallbacks type `admin-<schoolId>`. */
export function isRealPhone(phone: unknown): phone is string {
  if (typeof phone !== 'string') return false;
  const digits = phone.replace(/[\s.\-()]/g, '');
  return /^\+?\d{7,15}$/.test(digits);
}

export function isRealEmail(email: unknown): email is string {
  return typeof email === 'string' && /.+@.+\..+/.test(email.trim());
}

interface SubscriptionRequestRow {
  id: string;
  schoolId: string;
  requestedTier: string;
  currentTier: string;
  status: string;
  requestedByName: string;
  requestedById: string;
}

/**
 * Prévient tous les SUPER_ADMIN_GLOBAL d'une demande (notification in-app).
 * Utilisé à la création manuelle comme automatique (inscription).
 */
export async function notifySuperAdminsOfRequest(
  req: SubscriptionRequestRow,
  schoolName: string,
): Promise<void> {
  const superAdmins = await db.user.findMany({
    where: { role: 'SUPER_ADMIN_GLOBAL' },
    select: { id: true },
  });
  for (const admin of superAdmins) {
    await notify({
      data: {
        userId: admin.id,
        schoolId: req.schoolId,
        type: 'SUBSCRIPTION_UPGRADE_REQUEST',
        title: "Demande d'abonnement",
        message: `${req.requestedByName} demande la formule ${subscriptionTierLabel(req.requestedTier)} pour ${schoolName} (actuelle : ${subscriptionTierLabel(req.currentTier)})`,
        relatedId: req.id,
      },
    });
  }
}

export interface DecisionNotice {
  /** 'SENT' | 'SIMULATED' (tracé sans clé Resend) | 'FAILED' | null (pas d'email) */
  email: 'SENT' | 'SIMULATED' | 'FAILED' | null;
  /** true si le WhatsApp est parti, false sinon, null si pas de numéro */
  whatsapp: boolean | null;
}

/**
 * Réponse au demandeur par email et/ou WhatsApp après décision.
 * Best-effort : ne lève jamais (le PATCH ne doit jamais échouer à cause
 * d'un canal de notification indisponible).
 */
export async function notifyRequesterOfDecision(
  subRequest: SubscriptionRequestRow,
): Promise<DecisionNotice> {
  const result: DecisionNotice = { email: null, whatsapp: null };
  try {
    const [requester, school] = await Promise.all([
      db.user.findUnique({
        where: { id: subRequest.requestedById },
        select: { email: true, phone: true, name: true },
      }),
      db.school.findUnique({
        where: { id: subRequest.schoolId },
        select: { name: true, email: true, phone: true },
      }),
    ]);
    const approved = subRequest.status === 'APPROVED';
    const label = subscriptionTierLabel(subRequest.requestedTier);
    const schoolName = school?.name || 'votre école';
    const firstName = (requester?.name || subRequest.requestedByName || '').split(' ')[0] || 'Bonjour';

    // ── Email ──
    const toEmail = [requester?.email, school?.email].find(isRealEmail) || null;
    if (toEmail) {
      try {
        const { sendPlatformEmail } = await import('./platform-email');
        const subject = approved
          ? `Votre formule ${label} est activée — ${schoolName}`
          : `Votre demande de formule ${label} — ${schoolName}`;
        const body = approved
          ? `${firstName}, bonne nouvelle : votre demande de passage à la formule <strong>${label}</strong> pour ${schoolName} a été <strong>approuvée</strong>. Elle est active dès maintenant. Merci de votre confiance !`
          : `${firstName}, votre demande de passage à la formule <strong>${label}</strong> pour ${schoolName} a été <strong>refusée</strong>. Votre école reste en formule ${subscriptionTierLabel(subRequest.currentTier)}. Pour toute question, répondez à cet email ou contactez l'administrateur de la plateforme.`;
        const sent = await sendPlatformEmail({
          to: toEmail,
          subject,
          html: `<p>${body}</p><p style="color:#64748b;font-size:12px">EduGest — gestion scolaire</p>`,
          template: 'GENERIC',
          fromKey: 'noreply',
        });
        result.email = sent.status;
      } catch {
        result.email = 'FAILED';
      }
    }

    // ── WhatsApp ──
    const toPhone = [requester?.phone, school?.phone].find(isRealPhone) || null;
    if (toPhone) {
      try {
        const { sendWhatsAppMessage } = await import('./whatsapp-agent');
        const text = approved
          ? `EduGest : ${firstName}, votre formule ${label} pour ${schoolName} est ACTIVÉE. Merci !`
          : `EduGest : ${firstName}, votre demande de formule ${label} pour ${schoolName} a été refusée. Votre école reste en ${subscriptionTierLabel(subRequest.currentTier)}.`;
        result.whatsapp = await sendWhatsAppMessage(toPhone, text, subRequest.schoolId);
      } catch {
        result.whatsapp = false;
      }
    }
    return result;
  } catch {
    return result;
  }
}
