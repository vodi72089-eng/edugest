import { db } from './db';

const WA_SERVER = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3001';
const WA_API_KEY = process.env.WHATSAPP_API_KEY || 'edugest-wa-dev-key';

// Cache du numéro admin configuré
let cachedAdminPhone: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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
 * Vérifie si le WhatsApp est connecté et prêt à envoyer
 */
export async function isWhatsAppConnected(): Promise<boolean> {
  try {
    const res = await fetch(`${WA_SERVER}/status`, { headers: { 'x-api-key': WA_API_KEY } });
    const data = await res.json();
    return data.status === 'connected';
  } catch {
    return false;
  }
}

/**
 * Envoie un message WhatsApp via le serveur
 */
async function sendWhatsAppMessage(phone: string, message: string): Promise<boolean> {
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
    return data.ok === true;
  } catch (error) {
    console.warn('[WhatsApp Agent] Send failed:', error);
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
}): Promise<boolean> {
  const { parentPhone, studentName, motif, date, schoolName } = params;

  if (await isRecipientAdmin(parentPhone)) {
    console.log('[WhatsApp Agent] Skipping notification to admin phone');
    return false;
  }

  if (!(await isWhatsAppConnected())) {
    console.log('[WhatsApp Agent] WhatsApp not connected, skipping notification');
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

  return sendWhatsAppMessage(parentPhone, message);
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
}): Promise<boolean> {
  const { parentPhone, studentName, subject, title, dueDate, schoolName } = params;

  if (await isRecipientAdmin(parentPhone)) {
    console.log('[WhatsApp Agent] Skipping notification to admin phone');
    return false;
  }

  if (!(await isWhatsAppConnected())) {
    console.log('[WhatsApp Agent] WhatsApp not connected, skipping notification');
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

  return sendWhatsAppMessage(parentPhone, message);
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
}): Promise<boolean> {
  const { parentPhone, studentName, subject, score, maxScore, trimester, schoolName } = params;

  if (await isRecipientAdmin(parentPhone)) {
    console.log('[WhatsApp Agent] Skipping notification to admin phone');
    return false;
  }

  if (!(await isWhatsAppConnected())) {
    console.log('[WhatsApp Agent] WhatsApp not connected, skipping notification');
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

  return sendWhatsAppMessage(parentPhone, message);
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
}): Promise<boolean> {
  const { parentPhone, studentName, trimester, average, ranking, totalStudents, schoolName } = params;

  if (await isRecipientAdmin(parentPhone)) {
    console.log('[WhatsApp Agent] Skipping notification to admin phone');
    return false;
  }

  if (!(await isWhatsAppConnected())) {
    console.log('[WhatsApp Agent] WhatsApp not connected, skipping notification');
    return false;
  }

  const message = `📊 *BULLETIN*\n\n` +
    `Élève : *${studentName}*\n` +
    `Trimestre : ${trimester}\n` +
    `Moyenne : ${average.toFixed(2)}/20\n` +
    `Rang : ${ranking}/${totalStudents}\n` +
    `École : ${schoolName}\n\n` +
    `_EduGest - ${schoolName}_`;

  return sendWhatsAppMessage(parentPhone, message);
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
}): Promise<boolean> {
  const { parentPhone, studentName, type, severity, title, description, schoolName } = params;

  if (await isRecipientAdmin(parentPhone)) {
    console.log('[WhatsApp Agent] Skipping notification to admin phone');
    return false;
  }

  if (!(await isWhatsAppConnected())) {
    console.log('[WhatsApp Agent] WhatsApp not connected, skipping notification');
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

  return sendWhatsAppMessage(parentPhone, message);
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
// NOTIFICATIONS DE PAIEMENT
// ═══════════════════════════════════════════════════════════════════════════════

export async function notifyPaymentCreated(
  recipients: { phone: string; name: string }[],
  studentName: string,
  className: string,
  amount: number,
  trimester: string,
  schoolName: string
) {
  if (!(await isWhatsAppConnected())) return;
  const msg = `💰 *Nouveau paiement enregistré*\n\n` +
    `Élève: ${studentName}\nClasse: ${className}\n` +
    `Montant: ${amount.toLocaleString('fr-FR')} CDF\n` +
    `Trimestre: ${trimester}\nÉcole: ${schoolName}\n\n` +
    `Statut: En attente de vérification`;
  for (const r of recipients) {
    if (await isRecipientAdmin(r.phone)) continue;
    await sendWhatsAppMessage(r.phone, msg);
  }
}

export async function notifyPaymentApproved(
  recipientPhone: string,
  studentName: string,
  amount: number,
  trimester: string,
  schoolName: string
) {
  if (!(await isWhatsAppConnected())) return;
  const msg = `✅ *Paiement approuvé*\n\n` +
    `Élève: ${studentName}\nMontant: ${amount.toLocaleString('fr-FR')} CDF\n` +
    `Trimestre: ${trimester}\nÉcole: ${schoolName}\n\n` +
    `Votre paiement a été confirmé. Merci!`;
  await sendWhatsAppMessage(recipientPhone, msg);
}

export async function notifyPaymentRejected(
  recipientPhone: string,
  studentName: string,
  amount: number,
  trimester: string,
  schoolName: string,
  reason?: string
) {
  if (!(await isWhatsAppConnected())) return;
  const msg = `❌ *Paiement rejeté*\n\n` +
    `Élève: ${studentName}\nMontant: ${amount.toLocaleString('fr-FR')} CDF\n` +
    `Trimestre: ${trimester}\nÉcole: ${schoolName}\n` +
    (reason ? `Raison: ${reason}\n\n` : `\n`) +
    `Veuillez contacter l'administration.`;
  await sendWhatsAppMessage(recipientPhone, msg);
}
