import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, sanitizeError } from '@/lib/auth';
import {
  AI_CHAIN_MAX,
  AI_PROVIDERS,
  AiChainMember,
  AiProviderConfig,
  AiProviderKey,
  chatWithAi,
  getAiChain,
  getAiProviderConfig,
  getAiUsageStats,
  invalidateAiProviderConfigCache,
  listProviderModels,
  maskAiKey,
  saveAiChain,
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
    const chain = await getAiChain();
    const usage = await getAiUsageStats();
    return NextResponse.json({
      data: {
        configured: !!(cfg && cfg.provider !== 'zai' && (cfg.provider === 'ollama' || cfg.apiKey)),
        provider: cfg?.provider || 'zai',
        model: cfg?.model || preset?.defaultModel || '',
        baseUrl: cfg?.baseUrl || preset?.baseUrl || '',
        apiKeyMasked: cfg?.apiKey ? maskAiKey(cfg.apiKey) : '',
        presets: AI_PROVIDERS,
        chainMax: AI_CHAIN_MAX,
        // Équipe : clés jamais renvoyées (masque seul, vide = conservée).
        chain: chain.map(m => ({
          provider: m.provider,
          apiKey: '',
          apiKeyMasked: m.apiKey ? maskAiKey(m.apiKey) : '',
          model: m.model,
          baseUrl: m.baseUrl,
        })),
        usage,
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

    // ── action: models — liste les modèles exposés par la clé ──────────
    if (action === 'models') {
      const models = await listProviderModels(
        provider,
        apiKeyRaw,
        (typeof body.baseUrl === 'string' && body.baseUrl.trim()) || preset.baseUrl
      );
      return NextResponse.json({ data: { models, provider } });
    }

    // ── action: models-check — le modèle répond-il vraiment ? (ping « OK »)
    // Distingue les modèles ACTIFS des modèles en fin de vie (ex. NVIDIA 410).
    if (action === 'models-check') {
      const model = (typeof body.model === 'string' && body.model.trim()).slice(0, 200);
      if (!model) return NextResponse.json({ error: 'Modèle manquant.' }, { status: 400 });
      const candidate: AiProviderConfig = {
        provider,
        apiKey: apiKeyRaw,
        model,
        baseUrl: (typeof body.baseUrl === 'string' && body.baseUrl.trim()) || preset.baseUrl,
      };
      try {
        const { reply } = await chatWithAi(
          [
            { role: 'system', content: 'Réponds uniquement : OK' },
            { role: 'user', content: 'OK ?' },
          ],
          candidate,
          25_000
        );
        if (!reply.trim()) return NextResponse.json({ data: { ok: false, model, error: 'Réponse vide.' } });
        return NextResponse.json({ data: { ok: true, model } });
      } catch (e) {
        return NextResponse.json({ data: { ok: false, model, error: e instanceof Error ? e.message.slice(0, 200) : 'Échec' } });
      }
    }

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

    // ── action: save-chain — enregistre l'équipe (ordre de bascule) ────
    if (action === 'save-chain') {
      const savedChain = await getAiChain();
      const rawMembers = Array.isArray(body.members) ? body.members.slice(0, AI_CHAIN_MAX) : [];
      const members: AiChainMember[] = [];
      for (let i = 0; i < rawMembers.length; i++) {
        const raw = rawMembers[i] || {};
        const p: AiProviderKey = VALID_PROVIDERS.includes(raw.provider) ? raw.provider : 'zai';
        const pr = AI_PROVIDERS.find(x => x.value === p)!;
        const keyRaw = typeof raw.apiKey === 'string' ? raw.apiKey.trim() : '';
        // Vide ou masque = conserve la clé enregistrée au même rang.
        const key = (keyRaw && !keyRaw.includes('•')) ? keyRaw : (savedChain[i]?.provider === p ? savedChain[i].apiKey : '');
        if (p !== 'zai' && p !== 'ollama' && !key) {
          return NextResponse.json({ error: `Membre ${i + 1} (${p}) : clé API manquante.` }, { status: 400 });
        }
        members.push({
          provider: p,
          apiKey: key,
          model: (typeof raw.model === 'string' && raw.model.trim()) || pr.defaultModel,
          baseUrl: (typeof raw.baseUrl === 'string' && raw.baseUrl.trim()) || pr.baseUrl,
        });
      }
      if (members.length === 0) {
        return NextResponse.json({ error: 'Équipe vide : ajoutez au moins un fournisseur.' }, { status: 400 });
      }
      await saveAiChain(members);
      invalidateAiProviderConfigCache();
      return NextResponse.json({
        data: {
          chain: members.map(m => ({
            provider: m.provider,
            apiKey: '',
            apiKeyMasked: m.apiKey ? maskAiKey(m.apiKey) : '',
            model: m.model,
            baseUrl: m.baseUrl,
          })),
        },
        message: `Équipe enregistrée (${members.length} fournisseur${members.length > 1 ? 's' : ''} en bascule).`,
      });
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
