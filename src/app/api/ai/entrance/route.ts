import { NextRequest, NextResponse } from 'next/server';
import {
  APP_NAME,
  AI_ENDPOINTS,
  auditAgentAction,
  consumeAgentQuota,
  getAgentQuota,
  isAgentConfigured,
  requireAgent,
  resolveAuthorizedActions,
} from '@/lib/ai-agent';

// ─── POST /api/ai/entrance — Point de connexion de l'agent IA externe ───────
// Body attendu :
// {
//   "agentToken": "...",           // ou header Authorization: Bearer <token>
//   "capabilities": ["pdf","db","whatsapp","notifications"],
//   "preferences": { "language": "fr", "timeout": 30000 }
// }

export async function POST(request: NextRequest) {
  let body: { agentToken?: unknown; capabilities?: unknown; preferences?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // body optionnel : auth par header possible seule
  }

  const guard = requireAgent(request, body.agentToken);
  if (guard) return guard;

  if (!isAgentConfigured()) {
    return NextResponse.json({ status: 'unavailable', error: 'Agent IA non configuré.' }, { status: 503 });
  }

  if (!consumeAgentQuota()) {
    return NextResponse.json(
      { status: 'quota_exceeded', quotas: getAgentQuota() },
      { status: 429 },
    );
  }

  const authorizedActions = resolveAuthorizedActions(body.capabilities);
  const prefs =
    body.preferences && typeof body.preferences === 'object'
      ? (body.preferences as Record<string, unknown>)
      : {};

  await auditAgentAction(
    'AI_AGENT_CONNECT',
    'AiAgentSession',
    null,
    `Connexion de l'agent IA (capacités demandées : ${
      Array.isArray(body.capabilities) ? body.capabilities.join(', ') : 'toutes'
    }).`,
    null,
    { preferences: prefs, userAgent: request.headers.get('user-agent') ?? undefined },
  );

  return NextResponse.json({
    status: 'connected',
    app: APP_NAME,
    connectedAt: new Date().toISOString(),
    authorizedActions,
    quotas: getAgentQuota(),
    endpoints: AI_ENDPOINTS,
  });
}
