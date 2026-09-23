import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, sanitizeError } from '@/lib/auth';
import { getSmsApiConfig, invalidateSmsConfigCache, sendSmsViaProvider, hasProviderCredentials, SmsApiConfig, DEFAULT_SMS_CONFIG, SmsProvider } from '@/lib/sms';

const SMS_CONFIG_KEY = 'SMS_CONFIG';

// Champs secrets : laissés vides dans le formulaire, la valeur existante est conservée
const SECRET_FIELDS: Record<string, string[]> = {
  twilio: ['authToken'],
  africastalking: ['apiKey'],
  vonage: ['apiSecret'],
  custom: ['webhookToken'],
};
const PROVIDERS = ['africastalking', 'twilio', 'vonage', 'custom'];

function maskValue(v: string): string {
  if (!v) return '';
  if (v.length <= 8) return '••••';
  return `${v.slice(0, 4)}••••••••${v.slice(-4)}`;
}

function maskConfig(cfg: SmsApiConfig): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const p of PROVIDERS) {
    out[p] = {};
    for (const [k, v] of Object.entries(cfg[p as keyof SmsApiConfig] as Record<string, string>)) {
      out[p][k] = SECRET_FIELDS[p]?.includes(k) ? maskValue(v) : (v || '');
    }
  }
  return out;
}

// GET /api/sms-config — configuration SMS (super administrateur uniquement)
// Les secrets ne sont JAMAIS renvoyés en clair (masque d'affichage).
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;

    const cfg = await getSmsApiConfig(true);
    const fallback = cfg || DEFAULT_SMS_CONFIG;
    return NextResponse.json({
      data: {
        configured: hasProviderCredentials(fallback),
        enabled: !!fallback.enabled,
        provider: fallback.provider,
        fields: maskConfig(fallback),
      },
    });
  } catch (error) {
    console.error('Error fetching SMS config:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

// POST /api/sms-config
// Body: { action: 'save', enabled, provider, fields: { <provider>: { ...champs } } }
//    ou { action: 'test', testPhone }
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json().catch(() => ({}));
    const action = body.action || 'save';

    if (action === 'test') {
      const cfg = await getSmsApiConfig(true);
      if (!cfg?.enabled || !hasProviderCredentials(cfg)) {
        return NextResponse.json({ error: 'Configurez et activez d\'abord un fournisseur SMS' }, { status: 400 });
      }
      const testPhone = (body.testPhone || '').trim();
      if (!testPhone || !/^\+?\d{8,15}$/.test(testPhone.replace(/[\s\-().]/g, ''))) {
        return NextResponse.json({ error: 'Numéro de téléphone invalide (ex. +243812345678)' }, { status: 400 });
      }
      const result = await sendSmsViaProvider(testPhone, 'EduGest : test de configuration SMS réussi. La vérification par SMS est active.');
      if (result.success) {
        return NextResponse.json({ data: { ok: true }, message: `SMS de test envoyé à ${testPhone}` });
      }
      return NextResponse.json({ error: result.error || 'Échec de l\'envoi du SMS de test' }, { status: 502 });
    }

    // ── action: save ──
    const enabled = !!body.enabled;
    const provider = PROVIDERS.includes(body.provider) ? (body.provider as SmsProvider) : 'africastalking';
    const incoming = (body.fields || {}) as Record<string, Record<string, string>>;

    const existing = await db.globalApiConfig.findUnique({ where: { key: SMS_CONFIG_KEY } });
    let prev: SmsApiConfig = DEFAULT_SMS_CONFIG;
    try { if (existing) prev = { ...DEFAULT_SMS_CONFIG, ...JSON.parse(existing.value) }; } catch { /* reset */ }

    // Fusion : les champs secrets laissés vides conservent leur valeur existante
    const next: SmsApiConfig = { ...DEFAULT_SMS_CONFIG, enabled, provider };
    for (const p of PROVIDERS) {
      const section: Record<string, string> = {};
      for (const k of Object.keys(DEFAULT_SMS_CONFIG[p as keyof SmsApiConfig] as Record<string, string>)) {
        const incomingVal = (incoming[p]?.[k] ?? '').trim();
        const isSecret = SECRET_FIELDS[p]?.includes(k);
        if (isSecret && !incomingVal) {
          section[k] = (prev[p as keyof SmsApiConfig] as Record<string, string>)[k] || '';
        } else {
          section[k] = incomingVal;
        }
      }
      (next[p as keyof SmsApiConfig] as Record<string, string>) = section;
    }

    if (enabled && !hasProviderCredentials(next)) {
      return NextResponse.json({ error: 'Identifiants incomplets pour le fournisseur sélectionné' }, { status: 400 });
    }

    await db.globalApiConfig.upsert({
      where: { key: SMS_CONFIG_KEY },
      create: {
        key: SMS_CONFIG_KEY,
        value: JSON.stringify(next),
        description: 'Configuration de l\'API SMS (vérification par SMS + notifications)',
        updatedBy: user.id,
      },
      update: {
        value: JSON.stringify(next),
        updatedBy: user.id,
      },
    });
    invalidateSmsConfigCache();

    return NextResponse.json({
      data: {
        configured: hasProviderCredentials(next),
        enabled: next.enabled,
        provider: next.provider,
        fields: maskConfig(next),
      },
      message: 'Configuration SMS enregistrée',
    });
  } catch (error) {
    console.error('Error saving SMS config:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
