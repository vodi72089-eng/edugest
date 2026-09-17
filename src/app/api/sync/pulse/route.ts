import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, sanitizeError } from '@/lib/auth';

// GET /api/sync/pulse — état réel de la connexion à la base de données.
// Renvoie les vraies statistiques (compteurs) des tables principales et une
// « signature » de changement : toute écriture en base (paiement, élève,
// note, communication…) modifie cette signature, ce qui permet au client
// de détecter les mises à jour et de rafraîchir l'affichage automatiquement.
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;

    const [schools, users, students, payments, communications, notifications] = await Promise.all([
      db.school.count(),
      db.user.count(),
      db.student.count(),
      db.paymentRecord.count(),
      db.communication.count(),
      db.notification.count(),
    ]);

    const [maxSchool, maxUser, maxStudent, maxPayment, maxCommunication, maxNotification] = await Promise.all([
      db.school.aggregate({ _max: { updatedAt: true } }),
      db.user.aggregate({ _max: { updatedAt: true } }),
      db.student.aggregate({ _max: { updatedAt: true } }),
      db.paymentRecord.aggregate({ _max: { updatedAt: true } }),
      db.communication.aggregate({ _max: { createdAt: true } }),
      db.notification.aggregate({ _max: { createdAt: true } }),
    ]);

    const stamps = [
      maxSchool._max.updatedAt,
      maxUser._max.updatedAt,
      maxStudent._max.updatedAt,
      maxPayment._max.updatedAt,
      maxCommunication._max.createdAt,
      maxNotification._max.createdAt,
    ].filter((d): d is Date => !!d);
    const lastWriteAt = stamps.length > 0 ? new Date(Math.max(...stamps.map((d) => d.getTime()))) : null;

    // Signature : toute modification (insertion, édition, suppression) de ces
    // tables change soit un compteur, soit l'horodatage max → signature différente.
    const signature = [
      schools, users, students, payments, communications, notifications,
      ...stamps.map((d) => d.getTime()),
    ].join('-');

    return NextResponse.json({
      data: {
        db: 'connected',
        signature,
        lastWriteAt: lastWriteAt ? lastWriteAt.toISOString() : null,
        counts: {
          schools,
          users,
          students,
          payments,
          communications,
          notifications,
        },
      },
    });
  } catch (error) {
    console.error('Error building DB pulse:', error);
    return NextResponse.json(
      { error: sanitizeError(error), data: { db: 'disconnected' } },
      { status: 500 }
    );
  }
}
