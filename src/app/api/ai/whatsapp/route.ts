import { NextRequest, NextResponse } from 'next/server';
import { auditAgentAction, requireAgent } from '@/lib/ai-agent';

// ─── GET /api/ai/whatsapp — Statut de l'agent WhatsApp (mini-service) ───────
// Passe par le service WhatsApp interne (natsu-baileys-v10, port 3001) comme
// la route /api/whatsapp-status, mais avec l'authentification agent IA.

const WA_SERVER = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3001';
const WA_API_KEY =
  process.env.WHATSAPP_API_KEY || (process.env.NODE_ENV !== 'production' ? 'edugest-wa-dev-key' : '');

export async function GET(request: NextRequest) {
  const guard = requireAgent(request);
  if (guard) return guard;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${WA_SERVER}/status`, {
      headers: { 'Content-Type': 'application/json', 'x-api-key': WA_API_KEY },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();

    await auditAgentAction('AI_AGENT_WHATSAPP_STATUS', 'WhatsappAgent', null, 'Consultation du statut WhatsApp.');

    return NextResponse.json({
      status: data?.status ?? 'unknown',
      connected: data?.status === 'connected',
      connectedPhone: data?.connectedPhone ?? null,
      server: 'natsu-baileys-v10',
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      {
        status: 'disconnected',
        connected: false,
        connectedPhone: null,
        server: 'natsu-baileys-v10',
        error: 'Service WhatsApp injoignable.',
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  }
}
