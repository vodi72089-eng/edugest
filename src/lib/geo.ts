// ─── IP geolocation (ip-api.com, free, no key) ────────────────────────────
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
const TIMEOUT_MS = 3000;

function isPrivateIp(ip: string): boolean {
  return (
    ip === '::1' || ip === 'localhost' ||
    ip.startsWith('127.') || ip.startsWith('10.') ||
    ip.startsWith('192.168.') || ip.startsWith('172.') ||
    ip.startsWith('169.254.')
  );
}

export async function resolveIpLocation(ip: string): Promise<GeoLocation | null> {
  if (!ip || isPrivateIp(ip)) return null;
  const cached = cache.get(ip);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=fr&fields=status,country,city,regionName,isp,lat,lon,query`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const j = await res.json();
    if (j.status !== 'success') return null;
    const data: GeoLocation = {
      city: typeof j.city === 'string' ? j.city : '',
      region: typeof j.regionName === 'string' ? j.regionName : '',
      country: typeof j.country === 'string' ? j.country : '',
      isp: typeof j.isp === 'string' ? j.isp : '',
      lat: typeof j.lat === 'number' ? j.lat : 0,
      lon: typeof j.lon === 'number' ? j.lon : 0,
    };
    cache.set(ip, { at: Date.now(), data });
    return data;
  } catch {
    return null;
  }
}
