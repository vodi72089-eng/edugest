import { db } from './db';
import { checkWhatsappQuota, recordWhatsappMessage } from './whatsapp-usage';
import { getSchoolWhatsappApiConfig, sendViaWhatsappApi, sendDocumentViaWhatsappApi } from './whatsapp-api';
import { tierAllowsParentGrades } from './subscription';

const WA_SERVER = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3001';
const WA_API_KEY = process.env.WHATSAPP_API_KEY || 'edugest-wa-dev-key';

// Cache du numéro admin configuré
let cachedAdminPhone: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cache par école
const schoolPhoneCache: Map<string, { phone: string | null; timestamp: number }> = new Map();

// Cache du statut temps-réel du serveur WhatsApp (courte durée)
let cachedLiveStatus: { status: string; connectedPhone: string | null; timestamp: number } | null = null;
const LIVE_STATUS_TTL = 10_000; // 10s

export interface WhatsAppLiveStatus {
  status: 'connecting' | 'connected' | 'disconnected';
  connectedPhone: string | null;
}

/**
 * Statut temps-réel du serveur WhatsApp (mini-service Baileys) — mis en cache 10s
 */
export async function getWhatsAppLiveStatus(): Promise<WhatsAppLiveStatus> {
  const now = Date.now();
  if (cachedLiveStatus && now - cachedLiveStatus.timestamp < LIVE_STATUS_TTL) {
    return {
      status: cachedLiveStatus.status as WhatsAppLiveStatus['status'],
      connectedPhone: cachedLiveStatus.connectedPhone,
    };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${WA_SERVER}/status`, {
      headers: { 'x-api-key': WA_API_KEY },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    cachedLiveStatus = {
      status: data.status || 'disconnected',
      connectedPhone: data.connectedPhone || null,
      timestamp: now,
    };
  } catch {
    cachedLiveStatus = { status: 'disconnected', connectedPhone: null, timestamp: now };
  }
  return {
    status: cachedLiveStatus.status as WhatsAppLiveStatus['status'],
    connectedPhone: cachedLiveStatus.connectedPhone,
  };
}

/**
 * Récupère le numéro WhatsApp admin configuré (depuis GlobalApiConfig)
 */
async function getAdminPhone(): Promise<string | null> {
  const now = Date.now();
  if (cachedAdminPhone && now - cacheTimestamp < CACHE_TTL) {
    return cachedAdminPhone;
  }

  try {
    const config = await db.globalApiConfig.findUnique({
      where: { key: 'WHATSAPP_OFFICIAL_NUMBER' },
    });

    if (config) {
      try {
        const parsed = JSON.parse(config.value);
        cachedAdminPhone = parsed.phoneNumber || null;
      } catch {
        cachedAdminPhone = config.value;
      }
      cacheTimestamp = now;
      return cachedAdminPhone;
    }
  } catch (error) {
    console.error('[WhatsApp Agent] Error fetching admin phone:', error);
  }

  return null;
}

/**
 * Récupère le numéro WhatsApp d'une école spécifique.
 *
 * IMPORTANT (auto-liaison) : si aucune configuration n'existe pour l'école mais que
 * le serveur WhatsApp est connecté (session Baileys appairée), le numéro connecté
 * est automatiquement lié à l'école. Ainsi, dès que l'agent WhatsApp de l'école est
 * connecté (QR ou code de parrainage), les notifications partent réellement —
 * sans étape manuelle supplémentaire.
 */
export async function getSchoolWhatsAppNumber(schoolId: string | null | undefined): Promise<string | null> {
  if (!schoolId) return null;

  const now = Date.now();
  const cached = schoolPhoneCache.get(schoolId);
  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.phone;
  }

  const configKey = `WHATSAPP_SCHOOL_CONFIG_${schoolId}`;

  try {
    const config = await db.globalApiConfig.findUnique({
      where: { key: configKey },
    });

    if (config) {
      try {
        const parsed = JSON.parse(config.value);
        const phone = parsed.phoneNumber || null;
        schoolPhoneCache.set(schoolId, { phone, timestamp: now });
        return phone;
      } catch {
        schoolPhoneCache.set(schoolId, { phone: null, timestamp: now });
        return null;
      }
    }
  } catch (error) {
    console.error(`[WhatsApp Agent] Error fetching school ${schoolId} phone:`, error);
  }

  // ── Auto-liaison : le serveur WhatsApp est-il connecté avec un numéro ? ──
  const live = await getWhatsAppLiveStatus();
  if (live.status === 'connected' && live.connectedPhone) {
    try {
      await db.globalApiConfig.upsert({
        where: { key: configKey },
        create: {
          key: configKey,
          value: JSON.stringify({
            phoneNumber: live.connectedPhone,
            isConnected: true,
            connectedAt: new Date().toISOString(),
            autoBound: true,
          }),
          description: 'Agent WhatsApp de l\'école (lié automatiquement à la connexion)',
          updatedBy: 'system',
        },
        update: {
          value: JSON.stringify({
            phoneNumber: live.connectedPhone,
            isConnected: true,
            connectedAt: new Date().toISOString(),
            autoBound: true,
          }),
        },
      });
      console.log(`[WhatsApp Agent] Agent WhatsApp +${live.connectedPhone} lié automatiquement à l'école ${schoolId}`);
      schoolPhoneCache.set(schoolId, { phone: live.connectedPhone, timestamp: now });
      return live.connectedPhone;
    } catch (error) {
      console.error('[WhatsApp Agent] Auto-bind failed:', error);
    }
  }

  schoolPhoneCache.set(schoolId, { phone: null, timestamp: now });
  return null;
}

/**
 * Invalide le cache du numéro WhatsApp d'une école
 */
export function invalidateSchoolPhoneCache(schoolId: string): void {
  schoolPhoneCache.delete(schoolId);
}

/**
 * Vérifie si le WhatsApp est connecté et prêt à envoyer
 */
export async function isWhatsAppConnected(): Promise<boolean> {
  return (await getWhatsAppLiveStatus()).status === 'connected';
}

/**
 * Envoie un message WhatsApp.
 *
 * Routage automatique :
 *  - si l'école a configuré sa PROPRE API WhatsApp (Meta Cloud API) active,
 *    le message part via son numéro/son token → PAS de limite EduGest
 *    (le client n'est limité que par les tokens achetés chez Meta) ;
 *  - sinon, le message part via l'agent WhatsApp EduGest (Baileys) et est
 *    compté dans le quota mensuel du forfait de l'école.
 *
 * @param schoolId  Obligatoire pour le routage/comptage (null = agent sans suivi)
 */
async function sendWhatsAppMessage(phone: string, message: string, schoolId?: string | null, kind: 'message' | 'document' = 'message'): Promise<boolean> {
  // 1) API WhatsApp personnelle de l'école → illimité côté EduGest
  if (schoolId) {
    const customApi = await getSchoolWhatsappApiConfig(schoolId);
    if (customApi && customApi.isActive) {
      const result = await sendViaWhatsappApi(customApi, phone, message);
      await recordWhatsappMessage({ schoolId, phone, type: kind, channel: 'custom_api', ok: result.ok });
      return result.ok;
    }
  }

  // 2) Agent WhatsApp EduGest (Baileys)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 28000);

    const res = await fetch(`${WA_SERVER}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': WA_API_KEY },
      body: JSON.stringify({ phone, message }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const data = await res.json();
    const ok = data.ok === true;
    if (schoolId) await recordWhatsappMessage({ schoolId, phone, type: kind, channel: 'agent', ok });
    return ok;
  } catch (error) {
    console.warn('[WhatsApp Agent] Send failed:', error);
    if (schoolId) await recordWhatsappMessage({ schoolId, phone, type: kind, channel: 'agent', ok: false });
    return false;
  }
}

/**
 * Envoie un document (PDF, image…) via l'API WhatsApp de l'école si configurée,
 * sinon via le serveur WhatsApp EduGest (mini-service /send-document).
 */
export async function sendWhatsAppDocument(params: {
  phone: string;
  fileBase64: string;
  filename: string;
  mimetype?: string;
  caption?: string;
  schoolId?: string | null;
}): Promise<boolean> {
  const mimetype = params.mimetype || 'application/pdf';

  // 1) API WhatsApp personnelle de l'école → illimité côté EduGest
  if (params.schoolId) {
    const customApi = await getSchoolWhatsappApiConfig(params.schoolId);
    if (customApi && customApi.isActive) {
      const result = await sendDocumentViaWhatsappApi(
        customApi, params.phone, params.fileBase64, params.filename, mimetype, params.caption
      );
      await recordWhatsappMessage({ schoolId: params.schoolId, phone: params.phone, type: 'document', channel: 'custom_api', ok: result.ok });
      return result.ok;
    }
  }

  // 2) Agent WhatsApp EduGest
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 40000);

    const res = await fetch(`${WA_SERVER}/send-document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': WA_API_KEY },
      body: JSON.stringify({
        phone: params.phone,
        fileBase64: params.fileBase64,
        filename: params.filename,
        mimetype,
        caption: params.caption || '',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const data = await res.json();
    const ok = data.ok === true;
    if (params.schoolId) await recordWhatsappMessage({ schoolId: params.schoolId, phone: params.phone, type: 'document', channel: 'agent', ok });
    return ok;
  } catch (error) {
    console.warn('[WhatsApp Agent] Document send failed:', error);
    if (params.schoolId) await recordWhatsappMessage({ schoolId: params.schoolId, phone: params.phone, type: 'document', channel: 'agent', ok: false });
    return false;
  }
}

/**
 * Vérifie si le numéro destinataire est le numéro admin (évite d'envoyer à soi-même)
 */
async function isRecipientAdmin(phone: string): Promise<boolean> {
  const adminPhone = await getAdminPhone();
  if (!adminPhone) return false;

  const normalize = (p: string) => p.replace(/[\s\-().]/g, '').replace(/^\+/, '');
  return normalize(phone) === normalize(adminPhone);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GATE COMMUN — vérifie que l'agent WhatsApp de l'école est prêt
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Vérifie que l'école a un canal WhatsApp opérationnel et autorisé.
 *
 * Ordre de vérification :
 *  1. API WhatsApp personnelle de l'école active → OK (illimité côté EduGest)
 *  2. Agent WhatsApp EduGest connecté (numéro lié + session Baileys)
 *  3. Quota mensuel du forfait non dépassé
 *
 * Retourne null si OK, sinon la raison du blocage (pour logs/debug).
 */
async function checkSchoolAgentReady(
  schoolId: string | null | undefined
): Promise<{ ok: boolean; reason?: string }> {
  if (!schoolId) return { ok: false, reason: 'schoolId manquant' };

  // 1) API WhatsApp du client → pas de limite mensuelle EduGest
  const customApi = await getSchoolWhatsappApiConfig(schoolId);
  if (customApi && customApi.isActive) {
    return { ok: true };
  }

  // 2) Agent WhatsApp EduGest
  const schoolPhone = await getSchoolWhatsAppNumber(schoolId);
  if (!schoolPhone) {
    return { ok: false, reason: `Aucun agent WhatsApp connecté pour l'école ${schoolId} (connectez-le dans Connexion WhatsApp)` };
  }

  const live = await getWhatsAppLiveStatus();
  if (live.status !== 'connected') {
    return { ok: false, reason: 'Agent WhatsApp non connecté (statut: ' + live.status + ')' };
  }

  // 3) Quota mensuel du forfait
  const quota = await checkWhatsappQuota(schoolId);
  if (!quota.ok) {
    return { ok: false, reason: quota.reason };
  }

  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS PAR TYPE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Notifie un parent d'une convocation
 */
export async function notifyConvocation(params: {
  parentPhone: string;
  studentName: string;
  motif: string;
  date: Date;
  schoolName: string;
  schoolId: string;
}): Promise<boolean> {
  const { parentPhone, studentName, motif, date, schoolName, schoolId } = params;

  const gate = await checkSchoolAgentReady(schoolId);
  if (!gate.ok) {
    console.log(`[WhatsApp Agent] Convocation non envoyée — ${gate.reason}`);
    return false;
  }

  if (await isRecipientAdmin(parentPhone)) {
    console.log('[WhatsApp Agent] Skipping notification to admin phone');
    return false;
  }

  const formattedDate = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

  const message = `📋 *CONVOCATION*\n\n` +
    `Élève : *${studentName}*\n` +
    `École : ${schoolName}\n` +
    `Motif : ${motif}\n` +
    `Date : ${formattedDate}\n\n` +
    `_EduGest - ${schoolName}_`;

  return sendWhatsAppMessage(parentPhone, message, schoolId);
}

/**
 * Notifie un parent d'un nouveau devoir
 */
export async function notifyHomework(params: {
  parentPhone: string;
  studentName: string;
  subject: string;
  title: string;
  dueDate: Date;
  schoolName: string;
  schoolId: string;
}): Promise<boolean> {
  const { parentPhone, studentName, subject, title, dueDate, schoolName, schoolId } = params;

  const gate = await checkSchoolAgentReady(schoolId);
  if (!gate.ok) {
    console.log(`[WhatsApp Agent] Devoir non envoyé — ${gate.reason}`);
    return false;
  }

  if (await isRecipientAdmin(parentPhone)) {
    console.log('[WhatsApp Agent] Skipping notification to admin phone');
    return false;
  }

  const formattedDate = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(dueDate);

  const message = `📚 *DEVOIR*\n\n` +
    `Élève : *${studentName}*\n` +
    `Matière : ${subject}\n` +
    `Sujet : ${title}\n` +
    `À rendre le : ${formattedDate}\n` +
    `École : ${schoolName}\n\n` +
    `_EduGest - ${schoolName}_`;

  return sendWhatsAppMessage(parentPhone, message, schoolId);
}

/**
 * Notifie un parent d'une nouvelle note
 */
export async function notifyGrade(params: {
  parentPhone: string;
  studentName: string;
  subject: string;
  score: number;
  maxScore: number;
  trimester: string;
  schoolName: string;
  schoolId: string;
}): Promise<boolean> {
  const { parentPhone, studentName, subject, score, maxScore, trimester, schoolName, schoolId } = params;

  // Forfait sans notes/bulletins aux parents (Freemium, Essentiel) → pas d'envoi
  const schoolTier = await db.school.findUnique({ where: { id: schoolId }, select: { subscriptionTier: true } });
  if (!tierAllowsParentGrades(schoolTier?.subscriptionTier || 'FREEMIUM')) {
    console.log(`[WhatsApp Agent] Note non envoyée — forfait ${schoolTier?.subscriptionTier || 'FREEMIUM'} sans notes aux parents`);
    return false;
  }

  const gate = await checkSchoolAgentReady(schoolId);
  if (!gate.ok) {
    console.log(`[WhatsApp Agent] Note non envoyée — ${gate.reason}`);
    return false;
  }

  if (await isRecipientAdmin(parentPhone)) {
    console.log('[WhatsApp Agent] Skipping notification to admin phone');
    return false;
  }

  const percentage = Math.round((score / maxScore) * 100);
  let emoji = '📝';
  if (percentage >= 80) emoji = ' excellent';
  else if (percentage >= 60) emoji = '👍';
  else if (percentage >= 40) emoji = '⚠️';
  else emoji = '🔴';

  const message = `${emoji} *NOTE*\n\n` +
    `Élève : *${studentName}*\n` +
    `Matière : ${subject}\n` +
    `Note : ${score}/${maxScore} (${percentage}%)\n` +
    `Trimestre : ${trimester}\n` +
    `École : ${schoolName}\n\n` +
    `_EduGest - ${schoolName}_`;

  return sendWhatsAppMessage(parentPhone, message, schoolId);
}

/**
 * Notifie un parent d'un bulletin disponible
 */
export async function notifyBulletin(params: {
  parentPhone: string;
  studentName: string;
  trimester: string;
  average: number;
  ranking: number;
  totalStudents: number;
  schoolName: string;
  schoolId: string;
}): Promise<boolean> {
  const { parentPhone, studentName, trimester, average, ranking, totalStudents, schoolName, schoolId } = params;

  // Forfait sans notes/bulletins aux parents (Freemium, Essentiel) → pas d'envoi
  const schoolTier = await db.school.findUnique({ where: { id: schoolId }, select: { subscriptionTier: true } });
  if (!tierAllowsParentGrades(schoolTier?.subscriptionTier || 'FREEMIUM')) {
    console.log(`[WhatsApp Agent] Bulletin non envoyé — forfait ${schoolTier?.subscriptionTier || 'FREEMIUM'} sans bulletins aux parents`);
    return false;
  }

  const gate = await checkSchoolAgentReady(schoolId);
  if (!gate.ok) {
    console.log(`[WhatsApp Agent] Bulletin non envoyé — ${gate.reason}`);
    return false;
  }

  if (await isRecipientAdmin(parentPhone)) {
    console.log('[WhatsApp Agent] Skipping notification to admin phone');
    return false;
  }

  const message = `📊 *BULLETIN*\n\n` +
    `Élève : *${studentName}*\n` +
    `Trimestre : ${trimester}\n` +
    `Moyenne : ${average.toFixed(2)}/20\n` +
    `Rang : ${ranking}/${totalStudents}\n` +
    `École : ${schoolName}\n\n` +
    `_EduGest - ${schoolName}_`;

  return sendWhatsAppMessage(parentPhone, message, schoolId);
}

/**
 * Notifie un parent d'un enregistrement de discipline
 */
export async function notifyDiscipline(params: {
  parentPhone: string;
  studentName: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  schoolName: string;
  schoolId: string;
}): Promise<boolean> {
  const { parentPhone, studentName, type, severity, title, description, schoolName, schoolId } = params;

  const gate = await checkSchoolAgentReady(schoolId);
  if (!gate.ok) {
    console.log(`[WhatsApp Agent] Discipline non envoyée — ${gate.reason}`);
    return false;
  }

  if (await isRecipientAdmin(parentPhone)) {
    console.log('[WhatsApp Agent] Skipping notification to admin phone');
    return false;
  }

  const severityEmoji: Record<string, string> = {
    LOW: '🟢',
    MEDIUM: '🟡',
    HIGH: '🟠',
    CRITICAL: '🔴',
  };

  const emoji = severityEmoji[severity] || '⚪';

  const message = `${emoji} *DISCIPLINE*\n\n` +
    `Élève : *${studentName}*\n` +
    `Type : ${type}\n` +
    `Gravité : ${severity}\n` +
    `Titre : ${title}\n` +
    `Détails : ${description}\n` +
    `École : ${schoolName}\n\n` +
    `_EduGest - ${schoolName}_`;

  return sendWhatsAppMessage(parentPhone, message, schoolId);
}

/**
 * Récupère le numéro admin (pour affichage/debug)
 */
export async function getAdminPhoneNumber(): Promise<string | null> {
  return getAdminPhone();
}

/**
 * Invalide le cache du numéro admin
 */
export function invalidateAdminPhoneCache(): void {
  cachedAdminPhone = null;
  cacheTimestamp = 0;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMMUNICATIONS — diffusion WhatsApp réelle aux destinataires
// ═══════════════════════════════════════════════════════════════════════════════

export interface CommunicationWhatsAppResult {
  sent: number;
  failed: number;
  totalRecipients: number;
  skipped: boolean;
  reason?: string;
}

/**
 * Envoie une communication aux parents via l'agent WhatsApp de l'école.
 * Résout l'audience selon targetType (ALL / PARENTS / STAFF / CLASS / USER),
 * applique le scope (MATERNELLE / PRIMAIRE / SECONDAIRE) aux parents,
 * et espace les envois (anti-ban WhatsApp).
 */
export async function notifyCommunication(params: {
  schoolId: string;
  schoolName: string;
  title: string;
  content: string;
  type: string;
  targetType: string;
  targetId?: string | null;
  scope?: string | null;
}): Promise<CommunicationWhatsAppResult> {
  const { schoolId, schoolName, title, content, type, targetType, targetId, scope } = params;

  const result: CommunicationWhatsAppResult = { sent: 0, failed: 0, totalRecipients: 0, skipped: false };

  const gate = await checkSchoolAgentReady(schoolId);
  if (!gate.ok) {
    result.skipped = true;
    result.reason = gate.reason;
    console.log(`[WhatsApp Agent] Communication "${title}" non diffusée — ${gate.reason}`);
    return result;
  }

  // ── Résolution de l'audience ──────────────────────────────────────────────
  let recipients: { phone: string; name: string }[] = [];

  const parentsWhere: Record<string, unknown> = { schoolId, isActive: true, role: 'PARENT' };
  const staffWhere: Record<string, unknown> = { schoolId, isActive: true, role: { not: 'PARENT' } };

  try {
    if (targetType === 'PARENTS') {
      // Parents (filtrés par scope si précisé : parents d'élèves des classes du cycle)
      if (scope && ['MATERNELLE', 'PRIMAIRE', 'SECONDAIRE'].includes(scope)) {
        const students = await db.student.findMany({
          where: { schoolId, isArchived: false, isExcluded: false, class: { level: scope } },
          select: { parentId: true },
        });
        const parentIds = [...new Set(students.map(s => s.parentId).filter(Boolean) as string[])];
        recipients = parentIds.length > 0
          ? await db.user.findMany({ where: { ...parentsWhere, id: { in: parentIds } }, select: { phone: true, name: true } })
          : [];
      } else {
        recipients = await db.user.findMany({ where: parentsWhere, select: { phone: true, name: true } });
      }
    } else if (targetType === 'STAFF') {
      recipients = await db.user.findMany({ where: staffWhere, select: { phone: true, name: true } });
    } else if (targetType === 'CLASS' && targetId) {
      // Parents des élèves de la classe
      const students = await db.student.findMany({
        where: { classId: targetId, isArchived: false, isExcluded: false },
        select: { parentId: true },
      });
      const parentIds = [...new Set(students.map(s => s.parentId).filter(Boolean) as string[])];
      recipients = parentIds.length > 0
        ? await db.user.findMany({ where: { ...parentsWhere, id: { in: parentIds } }, select: { phone: true, name: true } })
        : [];
    } else if (targetType === 'USER' && targetId) {
      const user = await db.user.findUnique({ where: { id: targetId }, select: { phone: true, name: true, isActive: true } });
      recipients = user?.phone && user.isActive ? [{ phone: user.phone, name: user.name }] : [];
    } else {
      // ALL : tout le monde (personnel + parents)
      recipients = await db.user.findMany({
        where: { schoolId, isActive: true },
        select: { phone: true, name: true },
      });
    }
  } catch (error) {
    console.error('[WhatsApp Agent] Erreur résolution audience communication:', error);
    result.skipped = true;
    result.reason = 'Erreur lors de la résolution des destinataires';
    return result;
  }

  // Déduplication par numéro
  const seen = new Set<string>();
  recipients = recipients.filter(r => {
    const key = r.phone.replace(/[^0-9]/g, '');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Exclure le numéro admin (agent lui-même)
  const adminPhone = await getAdminPhone();
  const normalize = (p: string) => p.replace(/[\s\-().]/g, '').replace(/^\+/, '');
  if (adminPhone) {
    recipients = recipients.filter(r => normalize(r.phone) !== normalize(adminPhone));
  }

  // Exclure le numéro de l'agent WhatsApp lui-même (l'école ne s'envoie pas un message)
  const live = await getWhatsAppLiveStatus();
  if (live.connectedPhone) {
    recipients = recipients.filter(r => r.phone.replace(/[^0-9]/g, '') !== live.connectedPhone!.replace(/[^0-9]/g, ''));
  }

  result.totalRecipients = recipients.length;

  if (recipients.length === 0) {
    result.skipped = true;
    result.reason = 'Aucun destinataire avec numéro WhatsApp';
    console.log('[WhatsApp Agent] Communication sans destinataire — diffusion ignorée.');
    return result;
  }

  const typeEmoji: Record<string, string> = {
    ANNOUNCEMENT: '📢',
    NOTIFICATION: '🔔',
    EVENT: '📅',
    ALERT: '⚠️',
  };
  const emoji = typeEmoji[type] || '📢';

  const message = `${emoji} *${title.toUpperCase()}*\n` +
    `${schoolName}\n\n` +
    `${content}\n\n` +
    `_EduGest - ${schoolName}_`;

  // Plafond de sécurité anti-ban
  const MAX_RECIPIENTS = 200;
  const capped = recipients.slice(0, MAX_RECIPIENTS);
  if (recipients.length > MAX_RECIPIENTS) {
    console.warn(`[WhatsApp Agent] Communication plafonnée à ${MAX_RECIPIENTS}/${recipients.length} destinataires (anti-ban).`);
  }

  for (const r of capped) {
    const ok = await sendWhatsAppMessage(r.phone, message, schoolId);
    if (ok) result.sent++;
    else result.failed++;
    // Espacement anti-ban WhatsApp (~1,2s entre les envois)
    await new Promise(res => setTimeout(res, 1200));
  }

  console.log(`[WhatsApp Agent] Communication "${title}" diffusée : ${result.sent} envoyés, ${result.failed} échecs.`);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS DE PAIEMENT
// ═══════════════════════════════════════════════════════════════════════════════

export async function notifyPaymentCreated(
  recipients: { phone: string; name: string }[],
  studentName: string,
  className: string,
  amount: number,
  trimester: string,
  schoolName: string,
  schoolId: string
) {
  const gate = await checkSchoolAgentReady(schoolId);
  if (!gate.ok) {
    console.log(`[WhatsApp Agent] Paiement non notifié — ${gate.reason}`);
    return;
  }

  const msg = `💰 *Nouveau paiement enregistré*\n\n` +
    `Élève: ${studentName}\nClasse: ${className}\n` +
    `Montant: ${amount.toLocaleString('fr-FR')} CDF\n` +
    `Trimestre: ${trimester}\nÉcole: ${schoolName}\n\n` +
    `Statut: En attente de vérification`;
  for (const r of recipients) {
    if (await isRecipientAdmin(r.phone)) continue;
    await sendWhatsAppMessage(r.phone, msg, schoolId);
  }
}

export async function notifyPaymentApproved(
  recipientPhone: string,
  studentName: string,
  amount: number,
  trimester: string,
  schoolName: string,
  schoolId: string
) {
  const gate = await checkSchoolAgentReady(schoolId);
  if (!gate.ok) {
    console.log(`[WhatsApp Agent] Approbation non notifiée — ${gate.reason}`);
    return;
  }
  const msg = `✅ *Paiement approuvé*\n\n` +
    `Élève: ${studentName}\nMontant: ${amount.toLocaleString('fr-FR')} CDF\n` +
    `Trimestre: ${trimester}\nÉcole: ${schoolName}\n\n` +
    `Votre paiement a été confirmé. Merci!`;
  await sendWhatsAppMessage(recipientPhone, msg, schoolId);
}

export async function notifyPaymentRejected(
  recipientPhone: string,
  studentName: string,
  amount: number,
  trimester: string,
  schoolName: string,
  schoolId: string,
  reason?: string
) {
  const gate = await checkSchoolAgentReady(schoolId);
  if (!gate.ok) {
    console.log(`[WhatsApp Agent] Rejet non notifié — ${gate.reason}`);
    return;
  }
  const msg = `❌ *Paiement rejeté*\n\n` +
    `Élève: ${studentName}\nMontant: ${amount.toLocaleString('fr-FR')} CDF\n` +
    `Trimestre: ${trimester}\nÉcole: ${schoolName}\n` +
    (reason ? `Raison: ${reason}\n\n` : `\n`) +
    `Veuillez contacter l'administration.`;
  await sendWhatsAppMessage(recipientPhone, msg, schoolId);
}
