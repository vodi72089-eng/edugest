import { NextRequest, NextResponse } from 'next/server';
import { requireRole, sanitizeError } from '@/lib/auth';

const WA_SERVER = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3001';

async function waFetch(path: string, method: string = 'GET', body?: any) {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${WA_SERVER}${path}`, opts);
  return res.json();
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;

    const data = await waFetch('/status');
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ data: { status: 'disconnected', qr: null, error: 'WhatsApp server not running' } });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;

    const body = await request.json().catch(() => ({}));

    if (body.phone) {
      const data = await waFetch('/pair-code', 'POST', { phone: body.phone });
      return NextResponse.json({ data });
    }

    const data = await waFetch('/start', 'POST');
    return NextResponse.json({ data, message: 'WhatsApp client started' });
  } catch (error) {
    return NextResponse.json({ error: 'WhatsApp server not running. Start with: npx tsx whatsapp-server.ts' }, { status: 503 });
  }
}
