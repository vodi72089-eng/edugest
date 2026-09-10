import { requireAuth, sanitizeError } from '@/lib/auth';
import { removePushSubscription } from '@/lib/push';
import { NextRequest, NextResponse } from 'next/server';

// POST /api/push/unsubscribe
// Body: { endpoint: string }
// Removes the browser push subscription tied to this endpoint.
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;

    const body = await request.json();
    const { endpoint } = body || {};

    if (!endpoint) {
      return NextResponse.json({ error: 'endpoint requis' }, { status: 400 });
    }

    await removePushSubscription(endpoint);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[push/unsubscribe] error:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
