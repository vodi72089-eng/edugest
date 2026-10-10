import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';

const WA_SERVER = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3001';
const WA_API_KEY = process.env.WHATSAPP_API_KEY || (process.env.NODE_ENV !== 'production' ? 'edugest-wa-dev-key' : '');

const AGENT_ROLES = ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN'];

async function waFetch(path: string, method: string = 'GET', body?: any) {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json', 'x-api-key': WA_API_KEY } };
  if (body) opts.body = JSON.stringify(body);
  const controller = new AbortController();
  // /pair peut attendre l'initialisation du client puis réessayer la demande
  // de code. Le délai doit couvrir ce scénario, sinon le code est créé côté
  // service mais la route Next abandonne avant de pouvoir le renvoyer.
  const timeout = setTimeout(() => controller.abort(), 180000);
  try {
    const res = await fetch(`${WA_SERVER}${path}`, { ...opts, signal: controller.signal });
    clearTimeout(timeout);
    return await res.json();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

// GET /api/whatsapp-status — statut temps-réel de l'agent WhatsApp (mini-service)
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, AGENT_ROLES);
    if ('error' in authResult) return authResult.error;
    const data = await waFetch('/status');
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ data: { status: 'disconnected', qr: null, connectedPhone: null, pairingCode: null, server: 'natsu-baileys-v10' } });
  }
}

// POST /api/whatsapp-status — actions sur l'agent WhatsApp
// Actions supportées (correspondent aux endpoints RÉELS du mini-service 3001) :
//   {} (défaut)        → /start   : démarre le client (QR + pairing disponibles)
//   { action: 'pair' } → /pair    : code de parrainage pour un numéro
//   { action: 'logout' } → /logout : déconnexion + suppression de la session
//   { action: 'reset' } → /reset  : nouvelle session neuve immédiate
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, AGENT_ROLES);
    if ('error' in authResult) return authResult.error;
    const body = await request.json().catch(() => ({}));

    if (body.action === 'pair') {
      const data = await waFetch('/pair', 'POST', { phone: body.phone });
      return NextResponse.json({ data });
    }
    // ── SÉCURITÉ (multi-tenant) : l'agent Baileys est UNIQUE et partagé par
    // toutes les écoles. `logout` / `reset` détruisent la session utilisée par
    // tout le monde : un admin d'école pouvait donc couper les envois de la
    // plateforme entière. Ces deux actions sont réservées à la plateforme ;
    // « start » et « pair » restent accessibles aux écoles (reconnexion).
    if (body.action === 'logout' || body.action === 'reset') {
      if (authResult.user.role !== 'SUPER_ADMIN_GLOBAL') {
        return NextResponse.json(
          { error: "La déconnexion / réinitialisation de l'agent WhatsApp est réservée à l'administration de la plateforme (agent partagé par toutes les écoles)." },
          { status: 403 }
        );
      }
      const data = await waFetch(body.action === 'logout' ? '/logout' : '/reset', 'POST');
      return NextResponse.json({ data });
    }

    // Default: start client
    const data = await waFetch('/start', 'POST');
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: 'WhatsApp server not running' }, { status: 503 });
  }
}
