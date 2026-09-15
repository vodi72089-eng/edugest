import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole, sanitizeError } from '@/lib/auth';
import { isPlatformEventKey } from '@/lib/platform-events';
import { notifyPassingUpdateToAdmins } from '@/lib/passing-notify';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * GET /api/platform-events — SUPER_ADMIN_GLOBAL uniquement
 * Liste de tous les événements plateforme (triés par date de création, récents d'abord).
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;

    const events = await db.platformEvent.findMany({
      orderBy: { createdAt: 'desc' },
      include: { school: { select: { name: true, shortName: true } } },
    });

    return NextResponse.json({
      data: events.map(e => ({
        id: e.id,
        key: e.key,
        schoolId: e.schoolId,
        school: e.school,
        schoolYearLabel: e.schoolYearLabel,
        officialDate: e.officialDate,
        visibleDaysBefore: e.visibleDaysBefore,
        enabled: e.enabled,
        message: e.message,
        createdByName: e.createdByName,
        createdAt: e.createdAt,
      })),
    });
  } catch (error) {
    console.error('[PlatformEvents] GET error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

/**
 * POST /api/platform-events — SUPER_ADMIN_GLOBAL uniquement
 * Crée un événement plateforme (Passage de classe / Publication des bulletins).
 * Si enabled=true, notifie le personnel des écoles ciblées (ou de TOUTES les
 * écoles si schoolId est null, plafonné à 500 notifications).
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { key, schoolId, schoolYearLabel, officialDate, visibleDaysBefore, enabled, message } = body;

    if (!key || !isPlatformEventKey(key)) {
      return NextResponse.json(
        { error: 'key invalide (valeurs acceptées : CLASS_PASSING, BULLETIN_PUBLICATION)' },
        { status: 400 }
      );
    }

    if (!officialDate || isNaN(new Date(officialDate).getTime())) {
      return NextResponse.json({ error: 'officialDate invalide (date ISO attendue)' }, { status: 400 });
    }

    const daysBefore = visibleDaysBefore !== undefined && visibleDaysBefore !== null
      ? Math.max(0, Math.floor(Number(visibleDaysBefore)))
      : 21;
    if (isNaN(daysBefore)) {
      return NextResponse.json({ error: 'visibleDaysBefore invalide' }, { status: 400 });
    }

    const isEnabled = enabled !== undefined ? Boolean(enabled) : true;

    // Vérifier l'école ciblée éventuelle
    if (schoolId) {
      const school = await db.school.findUnique({ where: { id: schoolId }, select: { id: true } });
      if (!school) {
        return NextResponse.json({ error: 'École non trouvée' }, { status: 404 });
      }
    }

    const event = await db.platformEvent.create({
      data: {
        key,
        schoolId: schoolId || null,
        schoolYearLabel: schoolYearLabel || null,
        officialDate: new Date(officialDate),
        visibleDaysBefore: daysBefore,
        enabled: isEnabled,
        message: message || null,
        createdById: user.id,
        createdByName: user.name,
      },
    });

    // ── Notifications in-app + EMAIL au personnel des écoles ciblées ────────
    // (assistants des écoles ciblées ou de TOUTES les écoles, + super admins)
    let notified = 0;
    let emailed = 0;
    if (event.enabled) {
      try {
        const openDate = new Date(new Date(event.officialDate).getTime() - event.visibleDaysBefore * DAY_MS);
        const openFr = openDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
        const officialFr = new Date(event.officialDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
        const baseMessage = key === 'CLASS_PASSING'
          ? `L'interface Passage de classe sera disponible à partir du ${openFr} (publication officielle : ${officialFr})`
          : `La publication des bulletins sera disponible à partir du ${openFr} (publication officielle : ${officialFr})`;
        const notifMessage = message ? `${baseMessage}. ${message}` : baseMessage;
        const title = key === 'CLASS_PASSING' ? 'Passage de classe' : 'Publication des bulletins';

        const result = await notifyPassingUpdateToAdmins({
          type: key,
          title,
          message: notifMessage,
          schoolId: event.schoolId,
          relatedId: event.id,
          excludeUserId: user.id,
        });
        notified = result.appSent;
        emailed = result.emailSent;
      } catch (notifError) {
        console.error('[PlatformEvents] Notification error (non-blocking):', notifError);
      }
    }

    return NextResponse.json({ data: event, notifications: { sent: notified, emails: emailed } }, { status: 201 });
  } catch (error) {
    console.error('[PlatformEvents] POST error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
