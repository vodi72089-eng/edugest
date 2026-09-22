// ─── Geolocalisation IP — partie SERVEUR uniquement ───────────────────────
// Séparé de geo.ts (client-safe) car il dépend de auth.ts → fs (fichiers de
// session). Importé exclusivement par des routes API.
import { updateSessionLocationBySid, type GeoLocation, type SessionListItem } from './auth';
import { normalizeClientIp, resolveIpLocation } from './geo';

// Resolve and persist missing locations for a user's sessions, then mutate
// the list items so the API response includes them immediately.
// Les IP de session sont normalisées avant résolution (retrait du préfixe
// « ::ffff: » hérité de Caddy/NAT, 1re IP d'un CSV x-forwarded-for) —
// sinon une IP LAN « ::ffff:192.168.x » est vue comme privée et la
// localisation n'est jamais affichée.
export async function enrichSessionsWithLocation(userId: string, sessions: SessionListItem[]): Promise<void> {
  for (const s of sessions) {
    const ip = normalizeClientIp(s.ip);
    if (s.location || !ip) continue;
    const loc = await resolveIpLocation(ip);
    if (loc) {
      updateSessionLocationBySid(userId, s.sid, loc);
      s.location = loc;
    }
  }
}

// Type GeoLocation re-exporté pour compatibilité d'import existante.
export type { GeoLocation };
