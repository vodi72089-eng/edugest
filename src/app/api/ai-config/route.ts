import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, sanitizeError } from '@/lib/auth';
import {
  AI_PROVIDERS,
  AiProviderConfig,
  AiProviderKey,
  chatWithAi,
  getAiProviderConfig,
  invalidateAiProviderConfigCache,
  maskAiKey,
} from '@/lib/ai-providers';

const AI_CONFIG_KEY = 'AI_ASSISTANT_CONFIG';
const VALID_PROVIDERS = AI_PROVIDERS.map(p => p.value);

// GET /api/ai-config — config Agent IA (super administrateur uniquement)
// La clé API n'est JAMAIS renvoyée en clair (masque d'affichage uniquement).
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;

    const cfg = await getAiProviderConfig(true);
    const preset = AI_PROVIDERS.find(p => p.value === cfg?.provider);
    return NextResponse.json({
      data: {
        configured: !!(cfg && cfg.provider !== 'zai' && (cfg.provider === 'ollama' || cfg.apiKey)),
        provider: cfg?.provider || 'zai',
        model: cfg?.model || preset?.defaultModel || '',
        baseUrl: cfg?.baseUrl || preset?.baseUrl || '',
        apiKeyMasked: cfg?.apiKey ? maskAiKey(cfg.apiKey) : '',
        presets: AI_PROVIDERS,
      },
    });
  } catch (error) {
    console.error('Error fetching ai config:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

// POST /api/ai-config
// Body: { action: 'save', provider, apiKey?, model?, baseUrl? }
//    ou { action: 'test', provider?, apiKey?, model?, baseUrl?, question? }
// — « test » : interroge le fournisseur AVEC les identifiants saisis sans les
//   enregistrer (une clé invalide n'écrase jamais une config qui fonctionnait).
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;

    const body = await request.json().catch(() => ({}));
    const action = body.action || 'save';

    const provider: AiProviderKey = VALID_PROVIDERS.includes(body.provider) ? body.provider : 'zai';
    const preset = AI_PROVIDERS.find(p => p.value === provider)!;
    const saved = await getAiProviderConfig(true);

    // Champs saisis, avec retombée sur l'enregistré (vide = conservé).
    const apiKeyRaw = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    const apiKey = apiKeyRaw.includes('•') ? '' : apiKeyRaw;
    const candidate: AiProviderConfig = {
      provider,
      apiKey: apiKey || (saved?.provider === provider ? saved.apiKey : ''),
      model: (typeof body.model === 'string' && body.model.trim()) || preset.defaultModel,
      baseUrl: (typeof body.baseUrl === 'string' && body.baseUrl.trim()) || preset.baseUrl,
    };

    if (action === 'test') {
      if (provider !== 'zai' && provider !== 'ollama' && !candidate.apiKey) {
        return NextResponse.json({ error: 'Clé API manquante pour tester ce fournisseur' }, { status: 400 });
      }
      try {
        const question = (typeof body.question === 'string' && body.question.trim()) || 'Dis bonjour en une phrase.';
        const { reply, model } = await chatWithAi(
          [
            { role: 'system', content: 'Tu es l’Agent Kelasi 360. Réponds en français, en une phrase.' },
            { role: 'user', content: question.slice(0, 500) },
          ],
          candidate
        );
        if (!reply.trim()) {
          return NextResponse.json({ error: 'Le fournisseur a répondu vide — vérifiez le modèle' }, { status: 502 });
        }
        return NextResponse.json({ data: { ok: true, reply: reply.slice(0, 500), model, provider } });
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'Échec du test' }, { status: 502 });
      }
    }

    // ── action: save ──
    if (provider !== 'zai' && provider !== 'ollama' && !candidate.apiKey) {
      return NextResponse.json({ error: 'Clé API requise pour ce fournisseur (laissez vide pour conserver l’existante)' }, { status: 400 });
    }
    if (provider === 'custom' && !candidate.baseUrl) {
      return NextResponse.json({ error: 'URL de base requise pour un fournisseur personnalisé' }, { status: 400 });
    }

    await db.globalApiConfig.upsert({
      where: { key: AI_CONFIG_KEY },
      create: {
        key: AI_CONFIG_KEY,
        value: JSON.stringify(candidate),
        description: 'Fournisseur IA de l’Agent Kelasi 360 (contrôle plateforme)',
        updatedBy: 'super_admin',
      },
      update: { value: JSON.stringify(candidate) },
    });
    invalidateAiProviderConfigCache();

    return NextResponse.json({
      data: {
        provider: candidate.provider,
        model: candidate.model,
        baseUrl: candidate.baseUrl,
        apiKeyMasked: maskAiKey(candidate.apiKey),
        configured: provider !== 'zai' && (provider === 'ollama' || !!candidate.apiKey),
      },
      message: 'Fournisseur IA enregistré',
    });
  } catch (error) {
    console.error('Error saving ai config:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
