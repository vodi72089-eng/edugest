import ZAI from 'z-ai-web-dev-sdk';
import { db } from './db';

// ═══════════════════════════════════════════════════════════════════════════
// FOURNISSEURS IA — Agent Kelasi 360 (configurable depuis le contrôle
// plateforme, clé AI_ASSISTANT_CONFIG dans GlobalApiConfig).
// Un seul pilote HTTP (format OpenAI /chat/completions) + préréglages :
// OpenAI, DeepSeek, OpenRouter, Mistral, Groq, Gemini (endpoint compatible
// OpenAI) et Personnalisé. ZAI (SDK intégré) reste le défaut sans clé.
// ═══════════════════════════════════════════════════════════════════════════

export type AiProviderKey =
  | 'zai'
  | 'openai'
  | 'deepseek'
  | 'openrouter'
  | 'mistral'
  | 'groq'
  | 'gemini'
  | 'nvidia'
  | 'ollama'
  | 'custom';

export interface AiProviderPreset {
  value: AiProviderKey;
  label: string;
  baseUrl: string;
  defaultModel: string;
  keyHint: string;
}

export const AI_PROVIDERS: AiProviderPreset[] = [
  { value: 'zai', label: 'ZAI — SDK intégré (défaut, sans clé)', baseUrl: '', defaultModel: '', keyHint: '' },
  { value: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini', keyHint: 'sk-…' },
  { value: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat', keyHint: 'sk-…' },
  { value: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'openai/gpt-4o-mini', keyHint: 'sk-or-…' },
  { value: 'mistral', label: 'Mistral AI', baseUrl: 'https://api.mistral.ai/v1', defaultModel: 'mistral-small-latest', keyHint: '…' },
  { value: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile', keyHint: 'gsk_…' },
  { value: 'gemini', label: 'Google Gemini (endpoint compatible OpenAI)', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/', defaultModel: 'gemini-2.0-flash', keyHint: 'AIza…' },
  { value: 'nvidia', label: 'NVIDIA NIM (build.nvidia.com, crédits gratuits)', baseUrl: 'https://integrate.api.nvidia.com/v1', defaultModel: 'nvidia/llama-3.1-nemotron-70b-instruct', keyHint: 'nvapi-…' },
  { value: 'ollama', label: 'Ollama — modèles locaux (sans clé)', baseUrl: 'http://localhost:11434/v1', defaultModel: 'llama3.1', keyHint: 'aucune clé requise' },
  { value: 'custom', label: 'Personnalisé (toute API compatible OpenAI)', baseUrl: '', defaultModel: '', keyHint: '…' },
];

export interface AiProviderConfig {
  provider: AiProviderKey;
  apiKey: string;
  model: string;
  baseUrl: string;
}

const AI_CONFIG_KEY = 'AI_ASSISTANT_CONFIG';
const AI_CHAIN_KEY = 'AI_ASSISTANT_CHAIN';
const AI_STATS_KEY = 'AI_USAGE_STATS';

export interface AiChainMember {
  provider: AiProviderKey;
  apiKey: string;
  model: string;
  baseUrl: string;
}

export interface AiUsageStats {
  date: string; // YYYY-MM-DD
  stats: Record<string, { calls: number; fails: number }>;
  lastActive: AiProviderKey | null;
  lastFailover: { at: string; from: AiProviderKey; to: AiProviderKey; error: string } | null;
}

export const AI_CHAIN_MAX = 3;

export function maskAiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

// ── Lecture config (cache 30 s) ────────────────────────────────────────────
let configCache: { value: AiProviderConfig | null; at: number } | null = null;

export async function getAiProviderConfig(force = false): Promise<AiProviderConfig | null> {
  if (!force && configCache && Date.now() - configCache.at < 30_000) {
    return configCache.value;
  }
  try {
    const row = await db.globalApiConfig.findUnique({ where: { key: AI_CONFIG_KEY } });
    if (!row) {
      configCache = { value: null, at: Date.now() };
      return null;
    }
    const parsed = JSON.parse(row.value) as AiProviderConfig;
    configCache = { value: parsed, at: Date.now() };
    return parsed;
  } catch (e) {
    console.warn('[AI] Lecture config fournisseur impossible:', e);
    return null;
  }
}

export function invalidateAiProviderConfigCache() {
  configCache = null;
}

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ── Liste les modèles d'un fournisseur (ceux qui répondent) ───────────────
// GET {baseUrl}/models avec la clé : ne renvoie que les modèles réellement
// exposés par le compte (DeepSeek, NVIDIA, OpenRouter…). Ollama : sans clé.
export async function listProviderModels(
  provider: AiProviderKey,
  apiKey: string,
  baseUrl: string,
  timeoutMs = 20_000
): Promise<string[]> {
  const preset = AI_PROVIDERS.find(p => p.value === provider);
  const base = (baseUrl || preset?.baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('URL de base manquante.');
  if (provider !== 'zai' && provider !== 'ollama' && !apiKey.trim()) {
    throw new Error('Clé API requise pour lister les modèles.');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/models`, {
      headers: {
        ...(apiKey.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {}),
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Liste des modèles refusée : HTTP ${res.status} — vérifiez la clé API.`);
    }
    const data = await res.json();
    const ids: string[] = Array.isArray(data?.data)
      ? data.data.map((m: { id?: unknown }) => String(m?.id || '')).filter((s: string) => !!s)
      : [];
    return [...new Set(ids)].sort();
  } finally {
    clearTimeout(timer);
  }
}

// ── Équipe (chaîne de secours) : membres dans l'ordre de bascule ───────────
export async function getAiChain(): Promise<AiChainMember[]> {
  try {
    const row = await db.globalApiConfig.findUnique({ where: { key: AI_CHAIN_KEY } });
    if (!row) return [];
    const parsed = JSON.parse(row.value) as { members?: AiChainMember[] };
    const members = Array.isArray(parsed.members) ? parsed.members : [];
    return members
      .filter(m => m && AI_PROVIDERS.some(p => p.value === m.provider))
      .slice(0, AI_CHAIN_MAX)
      .map(m => ({
        provider: m.provider,
        apiKey: typeof m.apiKey === 'string' ? m.apiKey : '',
        model: typeof m.model === 'string' ? m.model : '',
        baseUrl: typeof m.baseUrl === 'string' ? m.baseUrl : '',
      }));
  } catch (e) {
    console.warn('[AI] Lecture équipe impossible:', e);
    return [];
  }
}

export async function saveAiChain(members: AiChainMember[]): Promise<void> {
  await db.globalApiConfig.upsert({
    where: { key: AI_CHAIN_KEY },
    create: {
      key: AI_CHAIN_KEY,
      value: JSON.stringify({ members: members.slice(0, AI_CHAIN_MAX) }),
      description: 'Équipe IA : ordre de bascule des fournisseurs (contrôle plateforme)',
      updatedBy: 'super_admin',
    },
    update: { value: JSON.stringify({ members: members.slice(0, AI_CHAIN_MAX) }) },
  });
}

// ── Suivi des quotas : appels/échecs par fournisseur, remis à zéro chaque jour
export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function getAiUsageStats(): Promise<AiUsageStats> {
  const empty: AiUsageStats = { date: todayKey(), stats: {}, lastActive: null, lastFailover: null };
  try {
    const row = await db.globalApiConfig.findUnique({ where: { key: AI_STATS_KEY } });
    if (!row) return empty;
    const parsed = JSON.parse(row.value) as AiUsageStats;
    if (parsed.date !== todayKey()) return empty;
    return { ...empty, ...parsed };
  } catch {
    return empty;
  }
}

async function recordAiUsage(provider: AiProviderKey, ok: boolean, failover?: AiUsageStats['lastFailover']): Promise<void> {
  try {
    const stats = await getAiUsageStats();
    const entry = stats.stats[provider] || { calls: 0, fails: 0 };
    entry.calls += 1;
    if (!ok) entry.fails += 1;
    stats.stats[provider] = entry;
    if (ok) stats.lastActive = provider;
    if (failover) stats.lastFailover = failover;
    await db.globalApiConfig.upsert({
      where: { key: AI_STATS_KEY },
      create: { key: AI_STATS_KEY, value: JSON.stringify(stats), description: 'Suivi quotas IA (journalier)', updatedBy: 'system' },
      update: { value: JSON.stringify(stats) },
    });
  } catch (e) {
    console.warn('[AI] Suivi quotas impossible:', e);
  }
}

// ── Appel avec bascule : essaie l'équipe dans l'ordre, passe au suivant en
// cas d'échec (quota fini, 429/5xx, réseau, réponse vide). Sans équipe
// configurée : retombe sur la config unique historique.
export async function chatWithAiChain(
  messages: AiChatMessage[],
  timeoutMs = 45_000
): Promise<{ reply: string; provider: AiProviderKey; model: string; failovers: { from: AiProviderKey; error: string }[] }> {
  const chain = await getAiChain();
  const members: AiChainMember[] = chain.length > 0
    ? chain
    : (() => {
        // Compatibilité : ancienne config unique.
        return [];
      })();

  if (members.length === 0) {
    const out = await chatWithAi(messages, null, timeoutMs);
    await recordAiUsage(out.provider, !!out.reply.trim());
    if (!out.reply.trim()) throw new Error('Réponse vide du fournisseur.');
    return { ...out, failovers: [] };
  }

  const failovers: { from: AiProviderKey; error: string }[] = [];
  let lastError = 'Aucun fournisseur disponible.';
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    try {
      const out = await chatWithAi(messages, m, timeoutMs);
      if (!out.reply.trim()) throw new Error('Réponse vide.');
      await recordAiUsage(m.provider, true, failovers.length > 0
        ? { at: new Date().toISOString(), from: failovers[failovers.length - 1].from, to: m.provider, error: failovers[failovers.length - 1].error }
        : undefined);
      return { ...out, failovers };
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'Échec inconnu';
      await recordAiUsage(m.provider, false);
      failovers.push({ from: m.provider, error: lastError });
    }
  }
  throw new Error(`Tous les fournisseurs de l’équipe ont échoué. Dernier : ${lastError}`);
}

// ── Appel chat : ZAI (SDK) ou HTTP compatible OpenAI ────────────────────────
export async function chatWithAi(
  messages: AiChatMessage[],
  cfgOverride?: AiProviderConfig | null,
  timeoutMs = 45_000
): Promise<{ reply: string; provider: AiProviderKey; model: string }> {
  const cfg = cfgOverride ?? (await getAiProviderConfig());
  const provider = cfg?.provider || 'zai';

  if (provider === 'zai') {
    // Comportement historique inchangé (SDK intégré, sans clé à gérer).
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: messages.map(m =>
        m.role === 'system' ? { role: 'assistant', content: m.content } : { role: m.role, content: m.content }
      ) as { role: 'user' | 'assistant'; content: string }[],
      thinking: { type: 'disabled' },
    });
    return { reply: completion.choices[0]?.message?.content || '', provider, model: 'zai-default' };
  }

  const preset = AI_PROVIDERS.find(p => p.value === provider);
  const baseUrl = (cfg?.baseUrl || preset?.baseUrl || '').replace(/\/+$/, '');
  const model = (cfg?.model || preset?.defaultModel || '').trim();
  const apiKey = (cfg?.apiKey || '').trim();
  if (!baseUrl) throw new Error(`Fournisseur « ${provider} » : URL de base manquante.`);
  if (!model) throw new Error(`Fournisseur « ${provider} » : modèle manquant.`);
  // Ollama local : aucune clé requise (les autres : clé obligatoire).
  if (!apiKey && provider !== 'ollama') throw new Error(`Fournisseur « ${provider} » : clé API manquante.`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({ model, messages }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '').then(t => t.slice(0, 300));
      throw new Error(`Fournisseur « ${provider} » : HTTP ${res.status}${errText ? ` — ${errText}` : ''}`);
    }
    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content || '';
    return { reply, provider, model };
  } finally {
    clearTimeout(timer);
  }
}
