// ─── IP geolocation (ipwho.is, HTTPS, gratuit, sans clé) ──────────────────
// Best-effort: any failure (offline, timeout, private IP) returns null.
//
// ⚠️ Ce module est importé par des composants CLIENT (CurrentDeviceInfo).
// Il ne doit donc JAMAIS dépendre d'un module Node (fs/path) au runtime —
// d'où `import type` (effacé à la compilation) et la partie serveur
// (persist dans les fichiers de session) déplacée dans geo-server.ts.
// Sans cela, le bundle client tente de résoudre « fs » et next build /
// next dev échouent (Module not found: Can't resolve 'fs').
import type { GeoLocation } from './auth';

const cache = new Map<string, { at: number; data: GeoLocation }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const TIMEOUT_MS = 4000;

/**
 * Normalise une IP brute (en-tête proxy ou champ de session) :
 * — garde la 1re IP d'une liste « x-forwarded-for » séparée par des virgules,
 * — retire le préfixe IPv4-mappé « ::ffff: » (derrière Caddy/NAT, la socket
 *   Node expose souvent « ::ffff:192.168.1.20 »),
 * — retire les crochets d'une IPv6 littérale « [2001:db8::1] ».
 * Retourne '' si rien d'exploitable.
 *
 * ⚠️ NOTE POUR L'AGENT PRINCIPAL : la version centrale getClientIp()
 * (src/lib/auth.ts) devrait appliquer cette même normalisation — voir
 * worklog.md (tâche 2-e) pour la fonction recommandée.
 */
export function normalizeClientIp(raw: string | null | undefined): string {
  if (!raw) return '';
  const first = raw.split(',')[0]?.trim() || '';
  const unbracketed =
    first.startsWith('[') && first.includes(']')
      ? first.slice(1, first.indexOf(']'))
      : first;
  return unbracketed.replace(/^::ffff:/i, '').trim();
}

function isPrivateIp(ip: string): boolean {
  const v = normalizeClientIp(ip);
  if (!v || v === 'localhost' || v === 'unknown') return true;
  if (v === '::1' || v === '0.0.0.0') return true;
  if (v.startsWith('127.') || v.startsWith('10.') ||
      v.startsWith('192.168.') || v.startsWith('169.254.')) return true;
  // Plage privée 172.16.0.0/12 UNIQUEMENT (172.0–15 et 172.32+ sont publics).
  const m172 = v.match(/^172\.(\d+)\./);
  if (m172) {
    const n = Number(m172[1]);
    if (n >= 16 && n <= 31) return true;
  }
  // IPv6 : uniques locales (fc00::/7 → fc/fd) et link-local (fe80::/10).
  const lower = v.toLowerCase();
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')) return true;
  return false;
}

interface IpWhoIsResponse {
  success?: boolean;
  ip?: unknown;
  city?: unknown;
  region?: unknown;
  country?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  connection?: { isp?: unknown; org?: unknown } | null;
}

interface IpapiCoResponse {
  error?: unknown;
  ip?: unknown;
  city?: unknown;
  region?: unknown;
  country_name?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  org?: unknown;
}

/** Fournisseurs HTTPS gratuits sans clé : ipwho.is puis ipapi.co (secours). */
async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const j: unknown = await res.json();
    if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
    return j as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Résout la localisation d'une IP. L'IP est NORMALISÉE d'abord (::ffff:,
 * CSV x-forwarded-for) — le garde-fou IP privée s'applique sur l'IP propre.
 * Forme de retour inchangée : GeoLocation { city, region, country, isp, lat, lon }.
 */
export async function resolveIpLocation(rawIp: string): Promise<GeoLocation | null> {
  const ip = normalizeClientIp(rawIp);
  if (!ip || isPrivateIp(ip)) return null;
  const cached = cache.get(ip);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  // 1) ipwho.is — HTTPS, gratuit, sans clé (cf. SchoolMap.tsx : CORS ouvert).
  const who = await fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}?lang=fr`);
  if (who) {
    const j = who as IpWhoIsResponse;
    if (j.success !== false) {
      const isp =
        (j.connection && typeof j.connection.isp === 'string' && j.connection.isp) ||
        (j.connection && typeof j.connection.org === 'string' && j.connection.org) ||
        '';
      const data: GeoLocation = {
        city: typeof j.city === 'string' ? j.city : '',
        region: typeof j.region === 'string' ? j.region : '',
        country: typeof j.country === 'string' ? j.country : '',
        isp,
        lat: typeof j.latitude === 'number' ? j.latitude : 0,
        lon: typeof j.longitude === 'number' ? j.longitude : 0,
      };
      cache.set(ip, { at: Date.now(), data });
      return data;
    }
  }

  // 2) Fallback ipapi.co — HTTPS, gratuit, sans clé.
  const co = await fetchJson(`https://ipapi.co/${encodeURIComponent(ip)}/json/`);
  if (co) {
    const j = co as IpapiCoResponse;
    if (j.error !== true) {
      const data: GeoLocation = {
        city: typeof j.city === 'string' ? j.city : '',
        region: typeof j.region === 'string' ? j.region : '',
        country: typeof j.country_name === 'string' ? j.country_name : '',
        isp: typeof j.org === 'string' ? j.org : '',
        lat: typeof j.latitude === 'number' ? j.latitude : 0,
        lon: typeof j.longitude === 'number' ? j.longitude : 0,
      };
      cache.set(ip, { at: Date.now(), data });
      return data;
    }
  }

  return null;
}
