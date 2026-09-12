import { db } from './db';
import { getTierLimits } from './subscription';
import { getSchoolWhatsappApiConfig } from './whatsapp-api';

// ─── Suivi d'utilisation WhatsApp (temps réel) ──────────────────────────────
// Chaque message envoyé via l'agent WhatsApp EduGest (Baileys) est journalisé
// dans WhatsappMessageLog (channel='agent'). Les messages partis via l'API
// WhatsApp personnelle du client (channel='custom_api') ne comptent PAS dans
// le quota — le client n'est limité que par les tokens qu'il achète chez Meta.

export interface WhatsappUsage {
  tier: string;
  /** Limite mensuelle (-1 = illimité, 0 = aucun message autorisé) */
  limit: number;
  /** Messages envoyés ce mois-ci via l'agent EduGest */
  used: number;
  /** Messages restants (null = illimité) */
  remaining: number | null;
  /** Pourcentage consommé 0-100 (null = illimité) */
  percent: number | null;
  /** Début de la fenêtre de quota (1er jour du mois courant) */
  periodStart: string;
  /** Fin de la fenêtre de quota (1er jour du mois suivant) */
  resetsAt: string;
  /** true si l'école envoie via sa propre API WhatsApp (illimité côté EduGest) */
  usingCustomApi: boolean;
  /** true si l'école peut configurer sa propre API WhatsApp selon son forfait */
  canUseCustomApi: boolean;
}

/** Début/fin de la fenêtre de quota mensuelle (mois calendaire) */
export function currentQuotaPeriod(now = new Date()): { periodStart: Date; resetsAt: Date } {
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const resetsAt = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { periodStart, resetsAt };
}

/** Nombre de messages envoyés ce mois via l'agent EduGest pour une école */
export async function getMonthlyMessageCount(schoolId: string, periodStart?: Date): Promise<number> {
  const { periodStart: start } = currentQuotaPeriod();
  const since = periodStart || start;
  return db.whatsappMessageLog.count({
    where: { schoolId, channel: 'agent', status: 'SENT', createdAt: { gte: since } },
  });
}

/**
 * Usage WhatsApp temps réel d'une école : quota du forfait, consommation du
 * mois, restant, pourcentage — et mode d'envoi actif (agent EduGest ou API perso).
 */
export async function getWhatsappUsage(schoolId: string | null | undefined): Promise<WhatsappUsage> {
  const { periodStart, resetsAt } = currentQuotaPeriod();
  const base: WhatsappUsage = {
    tier: 'FREEMIUM',
    limit: 0,
    used: 0,
    remaining: 0,
    percent: null,
    periodStart: periodStart.toISOString(),
    resetsAt: resetsAt.toISOString(),
    usingCustomApi: false,
    canUseCustomApi: false,
  };
  if (!schoolId) return base;

  const school = await db.school.findUnique({
    where: { id: schoolId },
    select: { subscriptionTier: true },
  });
  const tier = school?.subscriptionTier || 'FREEMIUM';
  const limits = getTierLimits(tier);
  const used = await getMonthlyMessageCount(schoolId);

  // API personnelle active → pas de limite EduGest
  const customApi = await getSchoolWhatsappApiConfig(schoolId);
  const usingCustomApi = !!(customApi && customApi.isActive);

  const limit = limits.whatsappMonthly;
  const unlimited = limit < 0 || usingCustomApi;

  return {
    tier,
    limit: usingCustomApi ? -1 : limit,
    used,
    remaining: unlimited ? null : Math.max(0, limit - used),
    percent: unlimited || limit <= 0 ? (limit <= 0 && !usingCustomApi ? Math.min(100, used > 0 ? 100 : 0) : null) : Math.min(100, Math.round((used / limit) * 100)),
    periodStart: periodStart.toISOString(),
    resetsAt: resetsAt.toISOString(),
    usingCustomApi,
    canUseCustomApi: limits.canUseCustomWhatsappApi,
  };
}

/**
 * Vérifie que l'école peut encore envoyer un message via l'agent EduGest.
 * Retourne { ok: true } si OK, sinon { ok: false, reason } avec le détail usage.
 */
export async function checkWhatsappQuota(
  schoolId: string | null | undefined
): Promise<{ ok: boolean; reason?: string; usage?: WhatsappUsage }> {
  if (!schoolId) return { ok: true };
  const usage = await getWhatsappUsage(schoolId);

  // API perso du client → illimité (limité seulement par ses tokens Meta)
  if (usage.usingCustomApi) return { ok: true, usage };
  // Forfait à messages illimités
  if (usage.limit < 0) return { ok: true, usage };

  if (usage.used >= usage.limit) {
    return {
      ok: false,
      reason: `Quota WhatsApp mensuel atteint (${usage.used}/${usage.limit} messages). Il se réinitialise le ${new Date(usage.resetsAt).toLocaleDateString('fr-FR')} — ou connectez votre propre API WhatsApp pour des envois illimités.`,
      usage,
    };
  }
  return { ok: true, usage };
}

/**
 * Journalise un message envoyé (compteur quota + audit).
 * Ne lève jamais : le comptage ne doit pas casser un envoi réussi.
 */
export async function recordWhatsappMessage(params: {
  schoolId: string | null | undefined;
  phone: string;
  type?: 'message' | 'document';
  channel?: 'agent' | 'custom_api';
  ok: boolean;
}): Promise<void> {
  try {
    if (!params.schoolId) return;
    await db.whatsappMessageLog.create({
      data: {
        schoolId: params.schoolId,
        phone: params.phone,
        type: params.type || 'message',
        channel: params.channel || 'agent',
        status: params.ok ? 'SENT' : 'FAILED',
      },
    });
  } catch (error) {
    console.warn('[WhatsApp Usage] record failed:', error);
  }
}
