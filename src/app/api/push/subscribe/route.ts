import { requireAuth, sanitizeError } from '@/lib/auth';
import { savePushSubscription } from '@/lib/push';
import { NextRequest, NextResponse } from 'next/server';

// POST /api/push/subscribe
// Body: { endpoint: string, keys: { p256dh: string, auth: string } }
// Registers the current browser as a push recipient for the logged-in user.
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { endpoint, keys } = body || {};

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json(
        { error: 'Subscription push invalide' },
        { status: 400 }
      );
    }

    await savePushSubscription(user.id, { endpoint, keys });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[push/subscribe] error:', error);
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
