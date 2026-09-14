# Détection réelle des appareils connectés — Plan d'implémentation

> **Pour les agents d'exécution :** SOUS-SKILL REQUIS : utiliser superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans pour implémenter ce plan tâche par tâche. Les étapes utilisent la syntaxe `- [ ]` pour le suivi.

**Objectif :** Enrichir l'onglet « Appareils connectés » (SettingsView + ProfileView) avec une empreinte d'appareil stable (FingerprintJS web) et la géolocalisation de l'IP (ip-api.com), sans changer le design existant.

**Architecture :** Script client `src/lib/device-fingerprint.ts` qui calcule un visitorId FingerprintJS + signaux matériels et les envoie via un nouvel endpoint `POST /api/sessions/device` qui les écrit dans le fichier de session (`.sessions/`). La géolocalisation IP est résolue côté serveur (helper `src/lib/geo.ts`, cache 6 h, timeout 3 s, best-effort) à la lecture de la liste des sessions. Les deux vues affichent localisation + badge empreinte en réutilisant les styles existants (GOLD, GOLD_SOFT, TEXT_MUTED_LUXE, icônes lucide MapPin/Fingerprint/Globe).

**Stack technique :** Next.js 16 (App Router, route handlers), React 19, TypeScript, `@fingerprintjs/fingerprintjs` (nouvelle dépendance), sessions fichier JSON dans `.sessions/`, API gratuite `ip-api.com` (HTTP, sans clé).

## Contraintes globales

- **Aucun changement de design** : réutiliser les classes/couleurs/icônes déjà présentes dans chaque fichier. Aucun texte, libellé ou libellé d'onglet modifié.
- **Aucune modification du comportement existant** : mêmes signatures et mêmes contrats pour les fonctions et routes existantes ; extensions additives uniquement (champs optionnels).
- **Aucun changement de base de données** (Prisma intouché).
- **Aucun framework de test dans le repo** (pas de vitest/jest) → la vérification se fait par `npm run lint`, `npm run build` et vérification manuelle via le serveur dev (commandes exactes données dans chaque tâche).
- Messages d'interface en **français** (langue de l'app).
- Ne jamais exposer le jeton de session au client (seul `sid` est exposé, comme aujourd'hui).
- Le code d'enrichissement est best-effort : toute erreur (réseau, API externe, webview restreinte) est silencieuse et ne doit jamais faire échouer une requête ni planter l'app.

---

### Tâche 1 : Étendre le modèle de session (`src/lib/auth.ts`)

**Fichiers :**
- Modifier : `src/lib/auth.ts` (interfaces `SessionData`, `SessionListItem`, `SessionMeta` inchangée, `normalizeSession`, ajout de 2 fonctions exportées)

**Interfaces produites (utilisées par les tâches 2-4) :**
- `export interface GeoLocation { city: string; region: string; country: string; isp: string; lat: number; lon: number }`
- `SessionData` et `SessionListItem` gagnent des champs optionnels : `fingerprintId?: string`, `screen?: string`, `gpu?: string`, `battery?: string`, `languages?: string`, `timezone?: string`, `memory?: string`, `cores?: string`, `network?: string`, `location?: GeoLocation | null`
- `export function updateSessionDeviceData(token: string, device: Record<string, unknown>): boolean` — écrit les champs d'appareil dans le fichier de session du token donné
- `export function updateSessionLocationBySid(userId: string, sid: string, location: GeoLocation | null): boolean` — écrit la localisation dans le fichier de session correspondant au sid (même pattern de scan que `revokeSessionBySid`)

- [ ] **Étape 1 : Étendre les interfaces et `normalizeSession`**

Ajouter dans `src/lib/auth.ts`, juste avant `export interface SessionData` :

```ts
export interface GeoLocation {
  city: string;
  region: string;
  country: string;
  isp: string;
  lat: number;
  lon: number;
}
```

Remplacer l'interface `SessionData` par :

```ts
export interface SessionData {
  sid: string;
  userId: string;
  expiresAt: number;
  createdAt: number;
  lastUsedAt: number;
  userAgent: string;
  ip: string;
  // ── Enrichissement appareil (optionnel, écrit par /api/sessions/device) ──
  fingerprintId?: string;
  screen?: string;
  gpu?: string;
  battery?: string;
  languages?: string;
  timezone?: string;
  memory?: string;
  cores?: string;
  network?: string;
  location?: GeoLocation | null;
}
```

Remplacer l'interface `SessionListItem` par :

```ts
export interface SessionListItem {
  sid: string;
  createdAt: number;
  lastUsedAt: number;
  expiresAt: number;
  userAgent: string;
  ip: string;
  isCurrent: boolean;
  fingerprintId?: string;
  screen?: string;
  gpu?: string;
  battery?: string;
  languages?: string;
  timezone?: string;
  memory?: string;
  cores?: string;
  network?: string;
  location?: GeoLocation | null;
}
```

Dans `normalizeSession`, remplacer le `return` par (les champs manquants prennent des valeurs neutres — rétrocompatible fichiers v1/v2) :

```ts
  return {
    sid: typeof raw.sid === 'string' ? raw.sid : '',
    userId: raw.userId,
    expiresAt: typeof raw.expiresAt === 'number' ? raw.expiresAt : 0,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    lastUsedAt: typeof raw.lastUsedAt === 'number' ? raw.lastUsedAt : 0,
    userAgent: typeof raw.userAgent === 'string' ? raw.userAgent : '',
    ip: typeof raw.ip === 'string' ? raw.ip : '',
    fingerprintId: typeof raw.fingerprintId === 'string' ? raw.fingerprintId : '',
    screen: typeof raw.screen === 'string' ? raw.screen : '',
    gpu: typeof raw.gpu === 'string' ? raw.gpu : '',
    battery: typeof raw.battery === 'string' ? raw.battery : '',
    languages: typeof raw.languages === 'string' ? raw.languages : '',
    timezone: typeof raw.timezone === 'string' ? raw.timezone : '',
    memory: typeof raw.memory === 'string' ? raw.memory : '',
    cores: typeof raw.cores === 'string' ? raw.cores : '',
    network: typeof raw.network === 'string' ? raw.network : '',
    location: raw.location && typeof raw.location === 'object' ? raw.location as GeoLocation : null,
  };
```

- [ ] **Étape 2 : Ajouter `updateSessionDeviceData`**

Insérer après `revokeSessionByToken` (vers la ligne 194) :

```ts
// Write device-enrichment fields (fingerprint + hardware signals) into the
// session file for a given token. Only known string fields are accepted.
export function updateSessionDeviceData(token: string, device: Record<string, unknown>): boolean {
  const session = readSession(token);
  if (!session) return false;
  const allowed = ['fingerprintId', 'screen', 'gpu', 'battery', 'languages', 'timezone', 'memory', 'cores', 'network'] as const;
  let changed = false;
  for (const key of allowed) {
    const value = device[key];
    if (typeof value === 'string' && value.trim() !== '' && session[key] !== value) {
      session[key] = value;
      changed = true;
    }
  }
  if (changed) writeSession(token, session);
  return true;
}
```

- [ ] **Étape 3 : Ajouter `updateSessionLocationBySid`**

Insérer après `updateSessionDeviceData` :

```ts
// Persist the resolved IP geolocation into the session file matching `sid`.
// Mirrors revokeSessionBySid's scan pattern (sid is safe to expose, tokens never leave the server).
export function updateSessionLocationBySid(userId: string, sid: string, location: GeoLocation | null): boolean {
  try {
    ensureSessionsDir();
    const subdirs = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true });
    for (const d of subdirs) {
      if (!d.isDirectory()) continue;
      const subdirPath = path.join(SESSIONS_DIR, d.name);
      let files: string[] = [];
      try { files = fs.readdirSync(subdirPath); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        const token = f.replace(/\.json$/, '');
        const sessionPath = path.join(subdirPath, f);
        try {
          const raw = fs.readFileSync(sessionPath, 'utf-8');
          const s = normalizeSession(JSON.parse(raw));
          if (!s || s.userId !== userId) continue;
          const fileSid = s.sid || token.slice(0, 8);
          if (fileSid === sid) {
            s.location = location;
            writeSession(token, s);
            return true;
          }
        } catch {
          // skip corrupt
        }
      }
    }
  } catch {
    // ignore
  }
  return false;
}
```

- [ ] **Étape 4 : Vérifier**

Exécuter : `npx tsc --noEmit`
Attendu : aucune erreur liée à `src/lib/auth.ts`.

- [ ] **Étape 5 : Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat(auth): extend session model with device fingerprint and location fields"
```

---

### Tâche 2 : Helper de géolocalisation IP (`src/lib/geo.ts`)

**Fichiers :**
- Créer : `src/lib/geo.ts`

**Interfaces :**
- Consomme : `GeoLocation`, `updateSessionLocationBySid`, `SessionListItem` (de `@/lib/auth`)
- Produit : `resolveIpLocation(ip: string): Promise<GeoLocation | null>`, `enrichSessionsWithLocation(userId: string, sessions: SessionListItem[]): Promise<void>`

- [ ] **Étape 1 : Écrire le fichier**

Créer `src/lib/geo.ts` :

```ts
import { GeoLocation, SessionListItem, updateSessionLocationBySid } from './auth';

// ─── IP geolocation (ip-api.com, free, no key) ────────────────────────────
// Best-effort: any failure (offline, timeout, private IP) returns null.
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
```

- [ ] **Étape 2 : Vérifier**

Exécuter : `npx tsc --noEmit`
Attendu : aucune erreur.

- [ ] **Étape 3 : Commit**

```bash
git add src/lib/geo.ts
git commit -m "feat(geo): add IP geolocation helper with cache and enrichment"
```

---

### Tâche 3 : Géoloc lazily dans GET /api/sessions

**Fichiers :**
- Modifier : `src/app/api/sessions/route.ts`

**Interfaces :**
- Consomme : `enrichSessionsWithLocation` (de `@/lib/geo`)

- [ ] **Étape 1 : Modifier la route GET**

Dans `src/app/api/sessions/route.ts`, après l'import existant de `@/lib/auth`, ajouter :

```ts
import { enrichSessionsWithLocation } from '@/lib/geo';
```

Remplacer le corps du `GET` (lignes 19-22) :

```ts
    const currentToken = getTokenFromRequest(request) || undefined;
    const sessions = listUserSessions(user.id, currentToken);
    await enrichSessionsWithLocation(user.id, sessions);

    return NextResponse.json({ data: sessions });
```

- [ ] **Étape 2 : Vérifier**

Exécuter : `npx tsc --noEmit`
Attendu : aucune erreur.

- [ ] **Étape 3 : Commit**

```bash
git add src/app/api/sessions/route.ts
git commit -m "feat(sessions): resolve IP geolocation lazily on session list"
```

---

### Tâche 4 : Endpoint POST /api/sessions/device

**Fichiers :**
- Créer : `src/app/api/sessions/device/route.ts`

**Interfaces :**
- Consomme : `requireAuth`, `sanitizeError`, `getTokenFromRequest`, `updateSessionDeviceData` (de `@/lib/auth`)

- [ ] **Étape 1 : Écrire le fichier**

Créer `src/app/api/sessions/device/route.ts` :

```ts
import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuth,
  sanitizeError,
  getTokenFromRequest,
  updateSessionDeviceData,
} from '@/lib/auth';

// POST /api/sessions/device — record the current session's device fingerprint
// and hardware signals. Best-effort: malformed payloads are ignored.
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;

    const token = getTokenFromRequest(request);
    if (!token) return NextResponse.json({ error: 'Session introuvable' }, { status: 401 });

    let body: Record<string, unknown> = {};
    try { body = await request.json(); } catch { /* empty payload is fine */ }

    updateSessionDeviceData(token, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[sessions/device] POST error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
```

- [ ] **Étape 2 : Vérifier**

Exécuter : `npx tsc --noEmit`
Attendu : aucune erreur.

- [ ] **Étape 3 : Commit**

```bash
git add src/app/api/sessions/device/route.ts
git commit -m "feat(sessions): add device fingerprint recording endpoint"
```

---

### Tâche 5 : Script client FingerprintJS

**Fichiers :**
- Modifier : `package.json` (dépendance `@fingerprintjs/fingerprintjs`)
- Créer : `src/lib/device-fingerprint.ts`
- Modifier : `src/app/page.tsx` (composant `Home`, lignes ~4994-5024)

**Interfaces :**
- Produit : `reportDeviceFingerprint(): Promise<void>` — à appeler une fois par chargement de page authentifié
- Consomme : `authFetch` (de `@/lib/store`)

- [ ] **Étape 1 : Installer la dépendance**

Exécuter : `npm install @fingerprintjs/fingerprintjs`
Attendu : `@fingerprintjs/fingerprintjs` apparaît dans `dependencies` de `package.json`.

- [ ] **Étape 2 : Créer le script client**

Créer `src/lib/device-fingerprint.ts` :

```ts
import { authFetch } from './store'

// ─── Device fingerprint reporting (once per page load) ────────────────────
// Uses the official open-source FingerprintJS agent (works in browsers and
// Tauri webviews). Best-effort: failures are silent.
let reported = false

function getGpu(): string {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (!gl) return ''
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    if (!ext) return ''
    return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '')
  } catch {
    return ''
  }
}

async function getBattery(): Promise<string> {
  try {
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean } | null> }
    if (typeof nav.getBattery !== 'function') return ''
    const b = await nav.getBattery()
    if (!b) return ''
    return `${Math.round(b.level * 100)}%${b.charging ? ' (charge)' : ''}`
  } catch {
    return ''
  }
}

function getScreen(): string {
  try {
    const dpr = typeof window !== 'undefined' ? Math.round(window.devicePixelRatio || 1) : 1
    return `${screen.width}×${screen.height} (dpr ${dpr})`
  } catch {
    return ''
  }
}

async function collectSignals(): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  try {
    const screenInfo = getScreen()
    if (screenInfo) out.screen = screenInfo
    const gpu = getGpu()
    if (gpu) out.gpu = gpu
    const battery = await getBattery()
    if (battery) out.battery = battery
    if (navigator.languages?.length) out.languages = navigator.languages.join(', ')
    if (navigator.hardwareConcurrency) out.cores = String(navigator.hardwareConcurrency)
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { effectiveType?: string; downlink?: number } }
    if (nav.deviceMemory) out.memory = `${nav.deviceMemory} Go`
    if (nav.connection?.effectiveType) {
      out.network = nav.connection.downlink ? `${nav.connection.effectiveType} (${nav.connection.downlink} Mb/s)` : nav.connection.effectiveType
    }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz) out.timezone = tz
  } catch {
    // keep whatever was collected
  }
  return out
}

export async function reportDeviceFingerprint(): Promise<void> {
  if (typeof window === 'undefined' || reported) return
  reported = true
  try {
    const mod = await import('@fingerprintjs/fingerprintjs')
    const fp = await mod.load()
    const { visitorId } = await fp.get()
    const signals = await collectSignals()
    await authFetch('/api/sessions/device', {
      method: 'POST',
      body: JSON.stringify({ fingerprintId: visitorId, ...signals }),
    })
  } catch {
    // silent — enrichment is best-effort
  }
}
```

- [ ] **Étape 3 : Brancher dans `src/app/page.tsx`**

Dans `src/app/page.tsx` :

1. Ajouter l'import après la ligne 5 (`import { toast } from 'sonner'`) :

```tsx
import { reportDeviceFingerprint } from '@/lib/device-fingerprint'
```

2. Dans le composant `Home` (début, vers la ligne 4996), ajouter après le `useEffect` de `restoreSession` (lignes 4999-5001) :

```tsx
  // Report device fingerprint once when authenticated (best-effort)
  useEffect(() => {
    if (userRole) {
      reportDeviceFingerprint()
    }
  }, [userRole])
```

- [ ] **Étape 4 : Vérifier**

Exécuter : `npx tsc --noEmit`
Attendu : aucune erreur.

- [ ] **Étape 5 : Commit**

```bash
git add package.json package-lock.json src/lib/device-fingerprint.ts src/app/page.tsx
git commit -m "feat(device): report FingerprintJS visitor id and hardware signals per session"
```

---

### Tâche 6 : Affichage minimal (même design) dans SettingsView et ProfileView

**Fichiers :**
- Modifier : `src/components/views/SettingsView.tsx` (onglet devices, cartes lignes 599-642)
- Modifier : `src/components/views/ProfileView.tsx` (interface `SessionItem` lignes 14-22, cartes lignes 520-572)

**Interfaces :**
- Consomme : champs `location?: { city, region, country, isp, lat, lon } | null` et `fingerprintId?: string` sur les sessions

- [ ] **Étape 1 : SettingsView — import de l'icône**

Dans `src/components/views/SettingsView.tsx` ligne 8, ajouter `Fingerprint` à l'import lucide-react (MapPin y est déjà) :

```tsx
import { Building2, MapPin, FileText, Save, Star, MessageCircle, Trash2, Camera, ImagePlus, Plus, Edit, GraduationCap, Monitor, Smartphone, LogOut, Tablet, Globe, Fingerprint } from 'lucide-react'
```

- [ ] **Étape 2 : SettingsView — badge empreinte**

Dans la carte d'appareil (ligne 616, après `<span className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>{formatDeviceTitle(info)}</span>`), insérer juste avant le bloc `{s.isCurrent && (...)}` :

```tsx
                        {s.fingerprintId && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full inline-flex items-center gap-1" style={{ color: GOLD, background: GOLD_SOFT }}>
                            <Fingerprint size={9} />{s.fingerprintId.slice(0, 8)}
                          </span>
                        )}
```

- [ ] **Étape 3 : SettingsView — ligne localisation**

Dans la ligne des métadonnées (lignes 621-624), juste après le bloc `{s.ip && <><span>·</span>...{s.ip}</>}` (fermeture à la ligne 623), insérer :

```tsx
                        {s.location?.city && (
                          <>
                            <span>·</span>
                            <span className="inline-flex items-center gap-0.5"><MapPin size={10} />{s.location.city}{s.location.country ? `, ${s.location.country}` : ''}</span>
                          </>
                        )}
```

- [ ] **Étape 4 : ProfileView — interface `SessionItem`**

Dans `src/components/views/ProfileView.tsx`, étendre l'interface `SessionItem` (lignes 14-22) avec :

```ts
  fingerprintId?: string
  location?: { city: string; region: string; country: string; isp: string; lat: number; lon: number } | null
```

- [ ] **Étape 5 : ProfileView — import de l'icône**

Ligne 9, ajouter `Fingerprint` et `MapPin` à l'import lucide-react :

```tsx
import { Edit, Check, Camera, Lock, Phone, Monitor, LogOut, Shield, Building2, Smartphone, Globe, Tablet, Fingerprint, MapPin } from 'lucide-react'
```

- [ ] **Étape 6 : ProfileView — badge empreinte**

Dans la carte (ligne 537), après `<span className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>{formatDeviceTitle(info)}</span>`, avant le bloc `{s.isCurrent && (...)}` :

```tsx
                      {s.fingerprintId && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full inline-flex items-center gap-1" style={{ color: GOLD, background: GOLD_SOFT }}>
                          <Fingerprint size={9} />{s.fingerprintId.slice(0, 8)}
                        </span>
                      )}
```

- [ ] **Étape 7 : ProfileView — ligne localisation**

Dans le bloc métadonnées (lignes 542-550), après le bloc `{s.ip && (...)}` (fermeture ligne 549), insérer :

```tsx
                      {s.location?.city && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center gap-0.5"><MapPin size={10} />{s.location.city}{s.location.country ? `, ${s.location.country}` : ''}</span>
                        </>
                      )}
```

- [ ] **Étape 8 : Vérifier**

Exécuter : `npx tsc --noEmit`
Attendu : aucune erreur.

- [ ] **Étape 9 : Commit**

```bash
git add src/components/views/SettingsView.tsx src/components/views/ProfileView.tsx
git commit -m "feat(ui): show device location and fingerprint badge in connected devices (same design)"
```

---

### Tâche 7 : Vérification finale

**Fichiers :** aucun (vérification uniquement)

- [ ] **Étape 1 : Lint**

Exécuter : `npm run lint`
Attendu : aucune erreur eslint (au pire des warnings déjà existants, aucun *nouveau* lié aux fichiers modifiés).

- [ ] **Étape 2 : Build**

Exécuter : `npm run build`
Attendu : build Next.js réussi sans erreur TypeScript.

- [ ] **Étape 3 : Vérification manuelle**

1. Démarrer le serveur dev : `npm run dev` (ou `start-dev.sh` selon la config en cours).
2. Se connecter avec un compte (ex. super admin).
3. Ouvrir Profil → « Appareils connectés » : la carte de l'appareil courant affiche un badge `Fingerprint` (8 premiers caractères de l'empreinte) et la localisation « ville, pays » à côté de l'IP (peut prendre quelques secondes — appel ip-api.com, ou absent en réseau local hors-ligne).
4. Ouvrir Paramètres → onglet « Appareils connectés » (rôle SUPER_ADMIN_GLOBAL ou SECRETARY) : mêmes infos.
5. Vérifier le fichier de session : ouvrir le dernier `.json` dans `.sessions/**/` — il contient `fingerprintId`, `screen`, `gpu` (si dispo), `languages`, `timezone`, `network`, `location` (si IP publique).
6. Vérifier qu'aucune vue existante n'est cassée : onglets « Informations » et « Frais scolaires » de Paramètres fonctionnent comme avant ; la déconnexion d'un appareil fonctionne toujours.
7. Tester sans réseau : couper la connexion avant d'ouvrir l'onglet → aucune erreur affichée, juste l'absence des nouvelles infos.

- [ ] **Étape 4 : Commit final si nécessaire**

Si des corrections ont été faites pendant la vérification :

```bash
git add -A
git commit -m "fix: polish device detection after verification"
```

---

## Auto-revue du plan

- **Couverture spec** : script client (T5), endpoint (T4), géoloc lazily côté GET (T2+T3), modèle de session (T1), UI minimale même design (T6), vérification (T7) — tout est couvert, y compris les contraintes « backend existant inchangé » (ajouts seulement) et « aucun changement de design » (mêmes classes/couleurs).
- **Placeholders** : aucun — tout le code est fourni dans les étapes.
- **Cohérence des types** : `GeoLocation` défini en T1 et utilisé en T2/T3/T6 ; `updateSessionDeviceData(token, device)` défini en T1, consommé en T4 ; `enrichSessionsWithLocation(userId, sessions)` défini en T2, consommé en T3 ; champs de session cohérents entre auth.ts, geo.ts, SettingsView et ProfileView.
