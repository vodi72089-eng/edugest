import { db } from '@/lib/db';
import { sendPushToUser } from '@/lib/push';
import { pinAfter } from '@/lib/request-pin';

/**
 * Central notification helper.
 * Drop-in replacement for `db.notification.create` that ALSO sends a real
 * Web Push to the recipient's browsers (visible even when the app is closed).
 *
 * Extra unknown fields (e.g. linkTo/linkId) are stripped instead of crashing
 * Prisma strict validation.
 */

export interface NotificationData {
  type: string;
  title: string;
  message: string;
  userId: string;
  schoolId?: string | null;
  relatedId?: string | null;
  /** Reserved for deep-linking (not stored in the Notification model) */
  linkTo?: string;
  /** Reserved for deep-linking (not stored in the Notification model) */
  linkId?: string;
  /** Prisma field — passed through (defaults to false) */
  isRead?: boolean;
  /** Accepted for backwards compatibility (not stored in the model) */
  metadata?: string;
}

export async function notify({ data }: { data: NotificationData }) {
  const notification = await db.notification.create({
    data: {
      type: data.type,
      title: data.title,
      message: data.message,
      userId: data.userId,
      schoolId: data.schoolId ?? null,
      relatedId: data.relatedId ?? null,
      isRead: data.isRead ?? false,
    },
  });

  // Real browser push (non-blocking, errors swallowed inside)
  // pinAfter OBLIGATOIRE : sendPushToUser exécute db.pushSubscription.findMany
  // — sans épingle after(), workerd abandonne la continuation quand la réponse
  // métier part → Prisma ne conclut jamais sa file → TOUTES les requêtes DB
  // suivantes de l'isolat gèlent (1101 « code had hung » — constaté en prod).
  pinAfter(sendPushToUser(data.userId, {
    title: data.title,
    body: data.message,
    tag: notification.id,
    url: '/',
  }).catch(() => {}));

  return notification;
}
