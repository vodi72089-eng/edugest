/**
 * Platform events — résolution centralisée de la visibilité des fonctionnalités
 * contrôlées par la plateforme (« Passage de classe », « Publication des bulletins »).
 *
 * Hiérarchie :
 *  1. PLATFORM_EVENT — événement activé ciblant l'école (ou global schoolId=null),
 *     le plus spécifique d'abord puis la date officielle la plus récente.
 *  2. SCHOOL_YEAR — fallback Passage de classe : calculé depuis la fin de
 *     l'année scolaire active (getClassPassingTimeline).
 *  3. DEFAULT — fallback Publication des bulletins : toujours visible
 *     (comportement historique, pour ne rien casser).
 */

import { db } from '@/lib/db';
import { getClassPassingTimeline, SchoolYearDateInfo } from '@/lib/class-passing';

export type PlatformEventKey = 'CLASS_PASSING' | 'BULLETIN_PUBLICATION';
export type VisibilitySource = 'PLATFORM_EVENT' | 'SCHOOL_YEAR' | 'DEFAULT';

export interface EventVisibility {
  visible: boolean;
  openDate: string | null;
  officialDate: string | null;
  daysRemaining: number | null;
  message: string;
  source: VisibilitySource;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** La fenêtre reste visible jusqu'à 60 jours APRÈS la date officielle */
const VISIBLE_DAYS_AFTER = 60;

export const PLATFORM_EVENT_KEYS: PlatformEventKey[] = ['CLASS_PASSING', 'BULLETIN_PUBLICATION'];

export function isPlatformEventKey(key: string): key is PlatformEventKey {
  return (PLATFORM_EVENT_KEYS as string[]).includes(key);
}

/**
 * Trouve l'événement activé le plus pertinent pour une école :
 * spécifique à l'école prioritaire sur global (schoolId null),
 * puis date officielle la plus proche/récente d'abord.
 */
export async function findPlatformEvent(key: PlatformEventKey, schoolId: string) {
  const events = await db.platformEvent.findMany({
    where: { key, enabled: true, OR: [{ schoolId }, { schoolId: null }] },
  });
  if (events.length === 0) return null;
  events.sort((a, b) => {
    const aSpecific = a.schoolId === schoolId ? 1 : 0;
    const bSpecific = b.schoolId === schoolId ? 1 : 0;
    if (aSpecific !== bSpecific) return bSpecific - aSpecific;
    return new Date(b.officialDate).getTime() - new Date(a.officialDate).getTime();
  });
  return events[0];
}

/**
 * Résout la visibilité d'une fonctionnalité pour une école donnée.
 *
 * @param key               CLASS_PASSING | BULLETIN_PUBLICATION
 * @param schoolId          École ciblée
 * @param activeSchoolYear  Année scolaire active (fallback CLASS_PASSING)
 */
export async function resolveEventVisibility(
  key: PlatformEventKey,
  schoolId: string,
  activeSchoolYear?: SchoolYearDateInfo | null
): Promise<EventVisibility> {
  const now = new Date();
  const nowMs = now.getTime();
  const event = await findPlatformEvent(key, schoolId);

  if (event) {
    const official = new Date(event.officialDate);
    const officialMs = official.getTime();
    const openMs = officialMs - event.visibleDaysBefore * DAY_MS;
    const closeMs = officialMs + VISIBLE_DAYS_AFTER * DAY_MS;
    const visible = nowMs >= openMs && nowMs <= closeMs;
    const daysRemaining = visible ? null : Math.max(0, Math.ceil((openMs - nowMs) / DAY_MS));

    const openFr = new Date(openMs).toLocaleDateString('fr-FR');
    const officialFr = official.toLocaleDateString('fr-FR');
    const customMessage = event.message?.trim() || '';
    let message: string;
    if (visible) {
      message = customMessage ||
        (key === 'CLASS_PASSING'
          ? 'Interface Passage de classe ouverte'
          : 'Publication des bulletins disponible');
    } else if (daysRemaining !== null && daysRemaining > 0) {
      message =
        (key === 'CLASS_PASSING'
          ? `L'interface Passage de classe sera disponible à partir du ${openFr} (publication officielle : ${officialFr})`
          : `La publication des bulletins sera disponible à partir du ${openFr} (publication officielle : ${officialFr})`) +
        (customMessage ? ` ${customMessage}` : '');
    } else {
      message = key === 'CLASS_PASSING'
        ? 'Période de passage de classe clôturée'
        : 'Publication des bulletins clôturée';
    }

    return {
      visible,
      openDate: new Date(openMs).toISOString(),
      officialDate: official.toISOString(),
      daysRemaining,
      message,
      source: 'PLATFORM_EVENT',
    };
  }

  // ── Fallbacks (aucun événement plateforme) ─────────────────────────────────
  if (key === 'CLASS_PASSING') {
    const timeline = getClassPassingTimeline(activeSchoolYear);
    return {
      visible: timeline.isOpen,
      openDate: timeline.openDate ? timeline.openDate.toISOString() : null,
      officialDate: timeline.endDate ? timeline.endDate.toISOString() : null,
      daysRemaining: timeline.isOpen ? null : timeline.daysRemainingUntilOpen || null,
      message: timeline.message,
      source: 'SCHOOL_YEAR',
    };
  }

  // BULLETIN_PUBLICATION : comportement historique (toujours visible)
  return {
    visible: true,
    openDate: null,
    officialDate: null,
    daysRemaining: null,
    message: 'Bulletins disponibles (aucune restriction configurée)',
    source: 'DEFAULT',
  };
}
