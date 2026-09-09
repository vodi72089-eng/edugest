import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';

const WA_SERVER = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3001';
const WA_API_KEY = process.env.WHATSAPP_API_KEY || 'edugest-wa-dev-key';

async function waFetch(path: string, method: string = 'GET', body?: any) {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json', 'x-api-key': WA_API_KEY } };
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
  } catch {
    return NextResponse.json({ data: { status: 'disconnected', connectedPhone: null, verified: false, qr: null, linkingCode: 'EDUGEST1' } });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;
    const body = await request.json().catch(() => ({}));

    if (body.action === 'generate-otp') {
      const data = await waFetch('/generate-otp', 'POST', { phone: body.phone });
      return NextResponse.json({ data });
    }
    if (body.action === 'pair') {
      const data = await waFetch('/pair', 'POST', { phone: body.phone });
      return NextResponse.json({ data });
    }
    if (body.action === 'verify-otp') {
      const data = await waFetch('/verify-otp', 'POST', { code: body.code, phone: body.phone });
      return NextResponse.json({ data });
    }
    if (body.action === 'logout') {
      const data = await waFetch('/logout', 'POST');
      return NextResponse.json({ data });
    }

    // Default: start client
    const data = await waFetch('/start', 'POST');
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: 'WhatsApp server not running' }, { status: 503 });
  }
}