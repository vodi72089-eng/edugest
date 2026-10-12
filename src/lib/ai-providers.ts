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
  { value: 'nvidia', label: 'NVIDIA NIM (build.nvidia.com, crédits gratuits)', baseUrl: 'https://integrate.api.nvidia.com/v1', defaultModel: 'meta/llama-3.3-70b-instruct', keyHint: 'nvapi-…' },
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
