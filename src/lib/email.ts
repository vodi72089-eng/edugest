import nodemailer from 'nodemailer';
import { db } from './db';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION EMAIL — deux canaux possibles :
//  1. Resend API (recommandé) — configuré depuis l'app :
//     Communications → « Config API » (super administrateur uniquement)
//     Stocké en base (GlobalApiConfig.RESEND_EMAIL_CONFIG)
//  2. SMTP classique (fallback) — variables d'environnement SMTP_*
// ═══════════════════════════════════════════════════════════════════════════

const EMAIL_CONFIG_KEY = 'RESEND_EMAIL_CONFIG';

export interface EmailApiConfig {
  enabled: boolean;
  apiKey: string;   // Clé API Resend (re_xxx)
  fromEmail: string; // Adresse expéditeur validée dans Resend
  fromName: string;  // Nom d'expéditeur affiché
}

export interface EmailResult {
  success: boolean;
  error?: string;
}

// ── Lecture de la configuration Resend (cache 30 s pour éviter une requête
//    DB à chaque envoi) ─────────────────────────────────────────────────────
let configCache: { value: EmailApiConfig | null; at: number } | null = null;

export async function getEmailApiConfig(force: boolean = false): Promise<EmailApiConfig | null> {
  if (!force && configCache && Date.now() - configCache.at < 30_000) {
    return configCache.value;
  }
  try {
    const row = await db.globalApiConfig.findUnique({ where: { key: EMAIL_CONFIG_KEY } });
    if (!row) {
      configCache = { value: null, at: Date.now() };
      return null;
    }
    const parsed = JSON.parse(row.value) as EmailApiConfig;
    configCache = { value: parsed, at: Date.now() };
    return parsed;
  } catch (e) {
    console.warn('[EMAIL] Lecture config Resend impossible:', e);
    return null;
  }
}

export function invalidateEmailConfigCache() {
  configCache = null;
}

// ── Envoi via Resend API ────────────────────────────────────────────────────
export async function sendEmailViaResend(
  to: string,
  subject: string,
  html: string
): Promise<EmailResult> {
  const cfg = await getEmailApiConfig();
  if (!cfg?.apiKey) {
    return { success: false, error: 'Resend n\'est pas configuré (clé API manquante)' };
  }
  if (!cfg.enabled) {
    return { success: false, error: 'L\'envoi d\'emails via Resend est désactivé' };
  }
  if (!cfg.fromEmail) {
    return { success: false, error: 'Adresse expéditeur (from) manquante dans la configuration Resend' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: cfg.fromName ? `${cfg.fromName} <${cfg.fromEmail}>` : cfg.fromEmail,
        to: [to],
        subject,
        html,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json?.message || json?.name || `HTTP ${res.status}`;
      console.error('[EMAIL][Resend] Erreur API:', msg);
      return { success: false, error: `Resend: ${msg}` };
    }
    console.log(`[EMAIL][Resend] Envoyé à ${to} (id: ${json?.id || 'n/a'})`);
    return { success: true };
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? 'Délai dépassé (20s)' : (e?.message || 'Erreur réseau Resend');
    console.error('[EMAIL][Resend] Échec:', msg);
    return { success: false, error: msg };
  }
}

// Vérifie si Resend est actif (configuré + activé)
export async function isResendActive(): Promise<boolean> {
  const cfg = await getEmailApiConfig();
  return !!(cfg?.apiKey && cfg?.enabled && cfg?.fromEmail);
}

// ── Transporteur SMTP (fallback) ────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Send an OTP code via email.
 * Priorité : Resend API (si configuré dans l'app) → sinon SMTP.
 */
export async function sendOtpEmail(
  to: string,
  code: string,
  schoolName: string = 'EduGest'
): Promise<EmailResult> {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background-color:#0a0f0d;font-family:'Segoe UI',Tahoma,sans-serif;">
      <div style="max-width:480px;margin:40px auto;background:linear-gradient(135deg,#0d1f1a,#0b1613);border-radius:16px;border:1px solid rgba(245,166,35,0.2);overflow:hidden;">
        <div style="background:linear-gradient(135deg,#f5a623,#ffb643);padding:24px;text-align:center;">
          <h1 style="margin:0;color:#0a0f0d;font-size:24px;font-weight:800;">🎓 ${schoolName}</h1>
        </div>
        <div style="padding:32px;">
          <h2 style="color:#ffffff;margin:0 0 8px;font-size:18px;">Code de vérification</h2>
          <p style="color:rgba(255,255,255,0.6);font-size:14px;margin:0 0 24px;">Utilisez ce code pour vérifier votre compte :</p>

          <div style="background:rgba(245,166,35,0.1);border:2px solid rgba(245,166,35,0.3);border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
            <span style="font-size:36px;font-weight:800;color:#f5a623;letter-spacing:8px;font-family:'Courier New',monospace;">${code}</span>
          </div>

          <p style="color:rgba(255,255,255,0.4);font-size:12px;margin:0;text-align:center;">
            Ce code expire dans 10 minutes. Ne partagez ce code avec personne.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
  const subject = `Code de vérification - ${schoolName}`;

  // 1) Resend (configuré depuis Communications → Config API)
  if (await isResendActive()) {
    const resendResult = await sendEmailViaResend(to, subject, html);
    if (resendResult.success) return resendResult;
    console.warn('[EMAIL] Resend a échoué, tentative SMTP en secours:', resendResult.error);
  }

  // 2) Fallback SMTP
  if (!process.env.SMTP_USER) {
    console.warn('[EMAIL] Ni Resend ni SMTP configuré. Code non envoyé:', code);
    return { success: false, error: 'Email non configuré (Resend ou SMTP). Code: ' + code };
  }

  try {
    await transporter.sendMail({
      from: `"${schoolName}" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
    return { success: true };
  } catch (error) {
    console.error('[EMAIL] Send error:', error);
    return { success: false, error: 'Erreur envoi email' };
  }
}

/**
 * Test SMTP connection.
 */
export async function testSmtpConnection(): Promise<{ connected: boolean; error?: string }> {
  try {
    await transporter.verify();
    return { connected: true };
  } catch (error: any) {
    return { connected: false, error: error.message };
  }
}
