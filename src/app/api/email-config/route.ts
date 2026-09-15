import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, sanitizeError } from '@/lib/auth';
import { getEmailApiConfig, invalidateEmailConfigCache, sendEmailViaResend, EmailApiConfig } from '@/lib/email';

const EMAIL_CONFIG_KEY = 'RESEND_EMAIL_CONFIG';

function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

// GET /api/email-config — configuration Resend (super administrateur uniquement)
// La clé API n'est JAMAIS renvoyée en clair (uniquement un masque d'affichage).
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;

    const cfg = await getEmailApiConfig(true);
    return NextResponse.json({
      data: {
        configured: !!cfg?.apiKey,
        enabled: !!cfg?.enabled,
        fromEmail: cfg?.fromEmail || '',
        fromName: cfg?.fromName || '',
        apiKeyMasked: cfg?.apiKey ? maskKey(cfg.apiKey) : '',
      },
    });
  } catch (error) {
    console.error('Error fetching email config:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

// POST /api/email-config
// Body: { action: 'save', enabled, fromEmail, fromName, apiKey? }
//    ou { action: 'test', testEmail }
// — « save »  : enregistre la configuration (si apiKey vide, la clé existante est conservée)
// — « test »  : envoie un email de test via Resend avec la configuration enregistrée
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json().catch(() => ({}));
    const action = body.action || 'save';

    if (action === 'test') {
      const cfg = await getEmailApiConfig(true);
      if (!cfg?.apiKey) {
        return NextResponse.json({ error: 'Configurez d\'abord votre clé API Resend' }, { status: 400 });
      }
      const testEmail = (body.testEmail || '').trim();
      if (!testEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
        return NextResponse.json({ error: 'Adresse email de test invalide' }, { status: 400 });
      }
      const result = await sendEmailViaResend(
        testEmail,
        'EduGest — Test de configuration Resend',
        `
        <div style="max-width:480px;margin:40px auto;font-family:'Segoe UI',Tahoma,sans-serif;">
          <div style="background:linear-gradient(135deg,#0d1f1a,#0b1613);border-radius:16px;padding:32px;text-align:center;">
            <h1 style="color:#f5a623;margin:0 0 12px;font-size:22px;">✅ Configuration Resend active</h1>
            <p style="color:rgba(255,255,255,0.7);margin:0;font-size:14px;">
              Les emails EduGest (codes de vérification, notifications) partiront désormais via Resend.
            </p>
          </div>
        </div>`
      );
      if (result.success) {
        return NextResponse.json({ data: { ok: true }, message: `Email de test envoyé à ${testEmail}` });
      }
      return NextResponse.json({ error: result.error || 'Échec de l\'envoi du test' }, { status: 502 });
    }

    // ── action: save ──
    const enabled = !!body.enabled;
    const fromEmail = (body.fromEmail || '').trim();
    const fromName = (body.fromName || '').trim();
    const apiKey = (body.apiKey || '').trim();

    const existing = await db.globalApiConfig.findUnique({ where: { key: EMAIL_CONFIG_KEY } });
    let existingCfg: Partial<EmailApiConfig> = {};
    try { existingCfg = existing ? JSON.parse(existing.value) : {}; } catch { /* reset */ }

    if (enabled) {
      if (!existingCfg.apiKey && !apiKey) {
        return NextResponse.json({ error: 'Clé API Resend requise pour activer l\'envoi d\'emails' }, { status: 400 });
      }
      if (!fromEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
        return NextResponse.json({ error: 'Adresse expéditeur invalide (ex. noreply@votre-ecole.cd)' }, { status: 400 });
      }
    }

    const nextCfg: EmailApiConfig = {
      enabled,
      apiKey: apiKey || (existingCfg.apiKey as string) || '',
      fromEmail,
      fromName: fromName || 'EduGest',
    };

    await db.globalApiConfig.upsert({
      where: { key: EMAIL_CONFIG_KEY },
      create: {
        key: EMAIL_CONFIG_KEY,
        value: JSON.stringify(nextCfg),
        description: 'Configuration de l\'API email Resend (codes de vérification + notifications)',
        updatedBy: user.id,
      },
      update: {
        value: JSON.stringify(nextCfg),
        updatedBy: user.id,
      },
    });
    invalidateEmailConfigCache();

    return NextResponse.json({
      data: {
        configured: !!nextCfg.apiKey,
        enabled: nextCfg.enabled,
        fromEmail: nextCfg.fromEmail,
        fromName: nextCfg.fromName,
        apiKeyMasked: nextCfg.apiKey ? maskKey(nextCfg.apiKey) : '',
      },
      message: 'Configuration Resend enregistrée',
    });
  } catch (error) {
    console.error('Error saving email config:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
