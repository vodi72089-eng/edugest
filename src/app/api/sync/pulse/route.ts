import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, sanitizeError } from '@/lib/auth';

// GET /api/sync/pulse - état réel de la connexion à la base de données.
// Renvoie les vraies statistiques (compteurs) des tables principales et une
// « signature » de changement : toute écriture en base (paiement, élève,
// note, communication...) modifie cette signature, ce qui permet au client
// de détecter les mises à jour et de rafraîchir l'affichage automatiquement.
//
// ?? NEON (Workers) : UNE SEULE requête SQL brute (au lieu de 12 appels
//   Prisma en parallèle) : chaque appel PrismaNeonHTTP = 1 fetch réseau ;
//   la rafale de 12 fetchs en parallèle, chevauchée avec les autres requêtes
//   de l'isolate (limite « hung » workerd), provoquait des annulations en
//   chaîne sur les isolats chargés (constaté en prod le 10/10/2026 avec le
//   polling de l'EXE toutes les 5 s : 192 requêtes tuées en 30 min, puis 0
//   après cette unique requête). Ici : 1 aller-retour unique.
//   ?? EXE (SQLite) : chemin ORM conservé - better-sqlite3 est synchrone et
//   en processus (aucun fetch, aucune limite workerd) ; le SQL brut serait
//   de plus invalide sur SQLite (cast `::int` Postgres).
//
// ?? SÉCURITÉ (P2) : les compteurs sont scopés à l'école de l'utilisateur
//   pour tout non-SUPER_ADMIN_GLOBAL (avant : compteurs globaux de toute la
//   plateforme exposés à tout utilisateur authentifié).
export async function GET(request: NextRequest) {
  const tPulse = Date.now();
  const iso = (globalThis as { __edugestIso?: string }).__edugestIso || '?';
  try {
    console.log(`[pulse:${iso}] enter`);
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;
    console.log(`[pulse:${iso}] auth-ok ${Date.now() - tPulse}ms`);

    const isSuperAdmin = user.role === 'SUPER_ADMIN_GLOBAL';
    const schoolScope = isSuperAdmin ? {} : { schoolId: user.schoolId || '__none__' };
    const notifScope = {
      ...schoolScope,
      ...(isSuperAdmin
        ? {}
        : { OR: [{ userId: user.id }, { schoolId: user.schoolId || '__none__' }] }),
    };

    type Stamps = {
      maxSchool: Date | null;
      maxUser: Date | null;
      maxStudent: Date | null;
      maxPayment: Date | null;
      maxCommunication: Date | null;
      maxNotification: Date | null;
    };
    let counts: {
      schools: number;
      users: number;
      students: number;
      payments: number;
      communications: number;
      notifications: number;
    };
    let stamps: Stamps;

    const isSqlite = (process.env.DATABASE_URL || '').startsWith('file:');

    if (isSqlite) {
      // ???? Branche EXE (SQLite locale) : ORM Prisma classique.
      const [schools, users, students, payments, communications, notifications, maxSchool, maxUser, maxStudent, maxPayment, maxCommunication, maxNotification] =
        await Promise.all([
          isSuperAdmin ? db.school.count() : Promise.resolve(1),
          db.user.count({ where: schoolScope }),
          db.student.count({ where: schoolScope }),
          db.paymentRecord.count({ where: schoolScope }),
          db.communication.count({ where: schoolScope }),
          db.notification.count({ where: notifScope }),
          isSuperAdmin ? db.school.aggregate({ _max: { updatedAt: true } }) : Promise.resolve({ _max: { updatedAt: null } }),
          db.user.aggregate({ _max: { updatedAt: true }, where: schoolScope }),
          db.student.aggregate({ _max: { updatedAt: true }, where: schoolScope }),
          db.paymentRecord.aggregate({ _max: { updatedAt: true }, where: schoolScope }),
          db.communication.aggregate({ _max: { createdAt: true }, where: schoolScope }),
          db.notification.aggregate({ _max: { createdAt: true }, where: notifScope }),
        ]);
      counts = { schools, users, students, payments, communications, notifications };
      stamps = {
        maxSchool: maxSchool._max.updatedAt,
        maxUser: maxUser._max.updatedAt,
        maxStudent: maxStudent._max.updatedAt,
        maxPayment: maxPayment._max.updatedAt,
        maxCommunication: maxCommunication._max.createdAt,
        maxNotification: maxNotification._max.createdAt,
      };
    } else {
      // ???? Branche Neon (Workers) : une seule requête SQL brute.
      const schoolId = user.schoolId || '__none__';
      type Row = {
        schools: number;
        users: number;
        students: number;
        payments: number;
        communications: number;
        notifications: number;
        max_school: Date | null;
        max_user: Date | null;
        max_student: Date | null;
        max_payment: Date | null;
        max_communication: Date | null;
        max_notification: Date | null;
      };
      let row: Row;
      if (isSuperAdmin) {
        row = (await db.$queryRaw<Row[]>`
          SELECT
            (SELECT COUNT(*) FROM "School")::int AS schools,
            (SELECT COUNT(*) FROM "User")::int AS users,
            (SELECT COUNT(*) FROM "Student")::int AS students,
            (SELECT COUNT(*) FROM "PaymentRecord")::int AS payments,
            (SELECT COUNT(*) FROM "Communication")::int AS communications,
            (SELECT COUNT(*) FROM "Notification")::int AS notifications,
            (SELECT MAX("updatedAt") FROM "School") AS max_school,
            (SELECT MAX("updatedAt") FROM "User") AS max_user,
            (SELECT MAX("updatedAt") FROM "Student") AS max_student,
            (SELECT MAX("updatedAt") FROM "PaymentRecord") AS max_payment,
            (SELECT MAX("createdAt") FROM "Communication") AS max_communication,
            (SELECT MAX("createdAt") FROM "Notification") AS max_notification
        `)[0];
      } else {
        row = (await db.$queryRaw<Row[]>`
          SELECT
            1::int AS schools,
            (SELECT COUNT(*) FROM "User" WHERE "schoolId" = ${schoolId})::int AS users,
            (SELECT COUNT(*) FROM "Student" WHERE "schoolId" = ${schoolId})::int AS students,
            (SELECT COUNT(*) FROM "PaymentRecord" WHERE "schoolId" = ${schoolId})::int AS payments,
            (SELECT COUNT(*) FROM "Communication" WHERE "schoolId" = ${schoolId})::int AS communications,
            (SELECT COUNT(*) FROM "Notification" WHERE "schoolId" = ${schoolId})::int AS notifications,
            NULL::timestamp AS max_school,
            (SELECT MAX("updatedAt") FROM "User" WHERE "schoolId" = ${schoolId}) AS max_user,
            (SELECT MAX("updatedAt") FROM "Student" WHERE "schoolId" = ${schoolId}) AS max_student,
            (SELECT MAX("updatedAt") FROM "PaymentRecord" WHERE "schoolId" = ${schoolId}) AS max_payment,
            (SELECT MAX("createdAt") FROM "Communication" WHERE "schoolId" = ${schoolId}) AS max_communication,
            (SELECT MAX("createdAt") FROM "Notification" WHERE "schoolId" = ${schoolId}) AS max_notification
        `)[0];
      }
      const toMs = (d: Date | string | null): number | null =>
        d ? new Date(d).getTime() : null;
      counts = {
        schools: Number(row.schools),
        users: Number(row.users),
        students: Number(row.students),
        payments: Number(row.payments),
        communications: Number(row.communications),
        notifications: Number(row.notifications),
      };
      stamps = {
        maxSchool: toMs(row.max_school) !== null ? new Date(toMs(row.max_school) as number) : null,
        maxUser: toMs(row.max_user) !== null ? new Date(toMs(row.max_user) as number) : null,
        maxStudent: toMs(row.max_student) !== null ? new Date(toMs(row.max_student) as number) : null,
        maxPayment: toMs(row.max_payment) !== null ? new Date(toMs(row.max_payment) as number) : null,
        maxCommunication: toMs(row.max_communication) !== null ? new Date(toMs(row.max_communication) as number) : null,
        maxNotification: toMs(row.max_notification) !== null ? new Date(toMs(row.max_notification) as number) : null,
      };
    }
    console.log(`[pulse:${iso}] query-done ${Date.now() - tPulse}ms`);

    const stampMs = [
      stamps.maxSchool,
      stamps.maxUser,
      stamps.maxStudent,
      stamps.maxPayment,
      stamps.maxCommunication,
      stamps.maxNotification,
    ]
      .filter((d): d is Date => !!d)
      .map((d) => d.getTime());
    const lastWriteAt = stampMs.length > 0 ? new Date(Math.max(...stampMs)) : null;

    // Signature : toute modification (insertion, édition, suppression) de ces
    // tables change soit un compteur, soit l'horodatage max → signature différente.
    const signature = [
      counts.schools,
      counts.users,
      counts.students,
      counts.payments,
      counts.communications,
      counts.notifications,
      ...stampMs,
    ].join('-');

    console.log(`[pulse:${iso}] sent ${Date.now() - tPulse}ms`);
    return NextResponse.json({
      data: {
        db: 'connected',
        signature,
        lastWriteAt: lastWriteAt ? lastWriteAt.toISOString() : null,
        counts: {
          schools: counts.schools,
          users: counts.users,
          students: counts.students,
          payments: counts.payments,
          communications: counts.communications,
          notifications: counts.notifications,
        },
      },
    });
  } catch (error) {
    console.error(`[pulse:${iso}] error after ${Date.now() - tPulse}ms:`, error);
    return NextResponse.json(
      { error: sanitizeError(error), data: { db: 'disconnected' } },
      { status: 500 }
    );
  }
}
