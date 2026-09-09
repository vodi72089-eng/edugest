import webpush from 'web-push';
import { db } from '@/lib/db';

/**
 * Web Push helpers (VAPID).
 * Sends real browser push notifications (visible even when EduGest is closed),
 * and automatically prunes dead subscriptions (404/410 from the push service).
 */

let initialized = false;

function ensureInit(): boolean {
  if (initialized) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:contact@edugest.app',
      publicKey,
      privateKey
    );
    initialized = true;
    return true;
  } catch {
    return false;
  }
}

/** Public VAPID key (safe to expose to the browser, used by pushManager.subscribe). */
export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Save (upsert) a browser subscription for the given user. */
export async function savePushSubscription(userId: string, sub: PushSubscriptionInput): Promise<void> {
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    throw new Error('Subscription invalide');
  }
  await db.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: {
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
    update: {
      userId,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
  });
}

/** Remove a browser subscription (e.g. user revoked notifications or logged out). */
export async function removePushSubscription(endpoint: string): Promise<void> {
  if (!endpoint) return;
  await db.pushSubscription.deleteMany({ where: { endpoint } });
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  icon?: string;
}

/**
 * Send a web push to every browser subscribed by this user.
 * Fire-and-forget safe: dead endpoints are pruned, other errors swallowed.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureInit()) return;
  const subscriptions = await db.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return;

  await Promise.allSettled(
    subscriptions.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload)
        );
      } catch (err: any) {
        // 404/410 = subscription expired or revoked -> remove it so the table stays clean
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          await db.pushSubscription
            .delete({ where: { endpoint: s.endpoint } })
            .catch(() => {});
        }
      }
    })
  );
}
