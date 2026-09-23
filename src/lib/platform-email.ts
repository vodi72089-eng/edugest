import { db } from './db';
import { sendEmailViaResend } from './email';

// ═══════════════════════════════════════════════════════════════════════════
// NOS EMAILS PLATEFORME — adresses officielles EduGest branchées sur Resend
//
// La plateforme possède SES propres adresses d'expédition :
//   • noreply@edugest.app  → notifications transactionnelles (OTP, welcome…)
//   • support@edugest.app  → support client (réponses tickets, accompagne-
//     ment corporates)
//   • contact@edugest.app  → commercial / partenariats / passage d'école
//
// Elles sont éditables par le SUPER_ADMIN_GLOBAL (clé GlobalApiConfig
// « PLATFORM_EMAIL_ADDRESSES »). Chaque envoi passe par sendPlatformEmail()
// qui journalise dans EmailMessage (boîte d'envoi consultable) :
//   • Resend configuré → envoi réel (status SENT / FAILED)
//   • Resend absent (dev) → status SIMULATED (l'email est tracé, pas envoyé)
// ═══════════════════════════════════════════════════════════════════════════

export interface PlatformEmailAddress {
  key: string;      // noreply | support | contact
  address: string;  // noreply@edugest.app
  label: string;    // usage lisible
  description: string;
}

export const PLATFORM_EMAILS_KEY = 'PLATFORM_EMAIL_ADDRESSES';

export const DEFAULT_PLATFORM_EMAILS: PlatformEmailAddress[] = [
  { key: 'noreply', address: 'noreply@edugest.app', label: 'Notifications', description: 'Codes de vérification, alertes, emails automatiques (pas de réponse humaine).' },
  { key: 'support', address: 'support@edugest.app', label: 'Support client', description: 'Réponses aux tickets et accompagnement des corporates.' },
  { key: 'contact', address: 'contact@edugest.app', label: 'Commercial', description: 'Partenariats, démos, passage d\u2019école, contrats corporates.' },
];

export async function getPlatformEmailAddresses(): Promise<PlatformEmailAddress[]> {
  try {
    const row = await db.globalApiConfig.findUnique({ where: { key: PLATFORM_EMAILS_KEY } });
    if (!row) return DEFAULT_PLATFORM_EMAILS;
    const parsed = JSON.parse(row.value) as PlatformEmailAddress[];
    // Toujours garantir les 3 clés officielles (merge avec défauts)
    return DEFAULT_PLATFORM_EMAILS.map(def => {
      const custom = parsed.find(p => p.key === def.key);
      return custom ? { ...def, address: custom.address || def.address } : def;
    });
  } catch {
    return DEFAULT_PLATFORM_EMAILS;
  }
}

export async function savePlatformEmailAddresses(list: { key: string; address: string }[]): Promise<PlatformEmailAddress[]> {
  const clean = DEFAULT_PLATFORM_EMAILS.map(def => {
    const custom = list.find(l => l.key === def.key);
    return { ...def, address: (custom?.address || def.address).trim().toLowerCase() };
  });
  const existing = await db.globalApiConfig.findUnique({ where: { key: PLATFORM_EMAILS_KEY } });
  const value = JSON.stringify(clean.map(c => ({ key: c.key, address: c.address })));
  if (existing) {
    await db.globalApiConfig.update({ where: { key: PLATFORM_EMAILS_KEY }, data: { value } });
  } else {
    await db.globalApiConfig.create({ data: { key: PLATFORM_EMAILS_KEY, value, updatedBy: 'system' } });
  }
  return clean;
}

export function addressFor(key: string, list: PlatformEmailAddress[]): string {
  return list.find(l => l.key === key)?.address || list[0].address;
}

export interface SendPlatformEmailOptions {
  to: string;
  subject: string;
  html: string;
  template?: string;   // WELCOME | HANDOVER_GRANT | TICKET_REPLY | TEST | GENERIC
  fromKey?: string;    // noreply (défaut) | support | contact
}

export interface SendPlatformEmailResult {
  success: boolean;
  status: 'SENT' | 'FAILED' | 'SIMULATED';
  error?: string;
  messageId?: string;
}

// Envoi + journalisation systématique dans la boîte d'envoi EmailMessage.
// Ne lève JAMAIS d'exception — le résultat est toujours tracé en base.
export async function sendPlatformEmail(opts: SendPlatformEmailOptions): Promise<SendPlatformEmailResult> {
  const addresses = await getPlatformEmailAddresses();
  const fromKey = opts.fromKey || 'noreply';
  const from = addressFor(fromKey, addresses);

  const row = await db.emailMessage.create({
    data: {
      toEmail: opts.to.trim().toLowerCase(),
      subject: opts.subject,
      template: opts.template || 'GENERIC',
      fromKey,
      status: 'QUEUED',
      provider: 'resend',
    },
  });

  const cfg = await import('./email').then(m => m.getEmailApiConfig());
  if (!cfg?.apiKey || !cfg.enabled) {
    // Dev / prod sans clé : on trace l'email sans l'envoyer (SIMULÉ),
    // l'interface reste identique — la bascule prod se fait côté config Resend.
    await db.emailMessage.update({ where: { id: row.id }, data: { status: 'SIMULATED', error: 'Resend non configuré — envoi simulé (dev)' } });
    return { success: true, status: 'SIMULATED', messageId: row.id };
  }

  try {
    const result = await sendEmailViaResend(opts.to, opts.subject, opts.html, from);
    if (result.success) {
      await db.emailMessage.update({ where: { id: row.id }, data: { status: 'SENT', sentAt: new Date() } });
      return { success: true, status: 'SENT', messageId: row.id };
    }
    await db.emailMessage.update({ where: { id: row.id }, data: { status: 'FAILED', error: result.error || 'Erreur inconnue' } });
    return { success: false, status: 'FAILED', error: result.error, messageId: row.id };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Erreur inconnue';
    await db.emailMessage.update({ where: { id: row.id }, data: { status: 'FAILED', error } });
    return { success: false, status: 'FAILED', error, messageId: row.id };
  }
}

// Vérifie si une fonctionnalité a été « envoyée » (activée) à une école
// par le SUPER_ADMIN_GLOBAL — utilisée notamment par le passage de classe.
export async function hasFeatureGrant(feature: string, schoolId: string): Promise<boolean> {
  const grant = await db.featureGrant.findUnique({
    where: { feature_schoolId: { feature, schoolId } },
  });
  if (!grant || grant.revoked) return false;
  if (grant.activeUntil && grant.activeUntil.getTime() < Date.now()) return false;
  return true;
}
