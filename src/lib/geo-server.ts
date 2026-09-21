// ─── Geolocalisation IP — partie SERVEUR uniquement ───────────────────────
// Séparé de geo.ts (client-safe) car il dépend de auth.ts → fs (fichiers de
// session). Importé exclusivement par des routes API.
import { updateSessionLocationBySid, type GeoLocation, type SessionListItem } from './auth';
import { resolveIpLocation } from './geo';

// Resolve and persist missing locations for a user's sessions, then mutate
// the list items so the API response includes them immediately.
export async function enrichSessionsWithLocation(userId: string, sessions: SessionListItem[]): Promise<void> {
  for (const s of sessions) {
    if (s.location || !s.ip) continue;
    const loc = await resolveIpLocation(s.ip);
    if (loc) {
      updateSessionLocationBySid(userId, s.sid, loc);
      s.location = loc;
    }
  }
}
