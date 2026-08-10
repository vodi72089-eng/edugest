import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  sanitizeError,
  getTokenFromRequest,
  updateSessionDeviceData,
} from '@/lib/auth';

// POST /api/sessions/device — record the current session's device fingerprint
// and hardware signals. Best-effort: malformed payloads are ignored.
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;

    const token = getTokenFromRequest(request);
    if (!token) return NextResponse.json({ error: 'Session introuvable' }, { status: 401 });

    let body: Record<string, unknown> = {};
    try { body = await request.json(); } catch { /* empty payload is fine */ }

    updateSessionDeviceData(token, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[sessions/device] POST error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
