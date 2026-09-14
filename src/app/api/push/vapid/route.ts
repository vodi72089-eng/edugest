import { getVapidPublicKey } from '@/lib/push';
import { NextResponse } from 'next/server';

// GET /api/push/vapid
// Returns the public VAPID key so the browser can subscribe to push notifications.
// The public key is designed to be exposed to clients.
export async function GET() {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    return NextResponse.json(
      { error: 'Notifications push non configurées sur le serveur' },
      { status: 503 }
    );
  }
  return NextResponse.json({ publicKey });
}
