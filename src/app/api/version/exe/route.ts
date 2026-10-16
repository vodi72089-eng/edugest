import { NextResponse } from 'next/server';

// GET /api/version/exe
// Résolution serveur de la version de l'EXE courant (Setup + Portable).
//
// Pourquoi cet endpoint existe : le navigateur ne PEUT PAS lire
// `releases/latest/download/latest.yml` lui-même — GitHub n'envoie aucun
// en-tête Access-Control-Allow-Origin sur les téléchargements de release
// (vérifié : ACAO absent) → le fetch échoue toujours en CORS, la version
// restait non résolue, et le bouton « Télécharger l'app » retombait sur le
// lien de repli = la PAGE de releases GitHub (l'utilisateur atterrissait sur
// GitHub au lieu de télécharger). Ici le Worker fetch GitHub côté serveur
// (pas de CORS), avec cache mémoire 10 min ; en cas d'échec il renvoie
// l'URL DIRECTE épinglée de la dernière release connue — jamais la page
// GitHub. Le clic utilise ensuite le proxy de téléchargement sur ce domaine.

export const dynamic = 'force-dynamic';

const REPO = 'vodi72089-eng/edugest';
// Repli épinglé : release connue la plus récente. Jamais la page de releases.
const FALLBACK_VERSION = '1.4.27';
const CACHE_TTL_MS = 2 * 60 * 1000;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

type ExeUrls = {
  version: string;
  /** URL directe de l'installateur (démarrage rapide) */
  setup: string;
  /** URL directe de la version portable */
  portable: string;
  /** true si résolu depuis la dernière release, false = repli épinglé */
  latest: boolean;
};

function directUrls(version: string, latest: boolean): ExeUrls {
  // Same-origin endpoint streams the asset as an attachment; the browser
  // never opens GitHub and the download can resume through byte ranges.
  const encodedVersion = encodeURIComponent(version);
  return {
    version,
    setup: `/api/version/exe/download?type=setup&version=${encodedVersion}`,
    portable: `/api/version/exe/download?type=portable&version=${encodedVersion}`,
    latest,
  };
}

// Cache mémoire par isolate pendant 2 minutes pour limiter les requêtes GitHub.
let cache: { ts: number; value: ExeUrls } | null = null;

async function resolveExeUrls(): Promise<ExeUrls> {
  if (cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.value;
  try {
    const res = await fetch(
      `https://github.com/${REPO}/releases/latest/download/latest.yml`,
      { redirect: 'follow' }
    );
    if (res.ok) {
      const text = await res.text();
      const m = text.match(/^version:\s*(.+)$/m);
      const version = String(m ? m[1] : '').trim().replace(/^v/, '');
      if (VERSION_PATTERN.test(version)) {
        const value = directUrls(version, true);
        cache = { ts: Date.now(), value };
        return value;
      }
    }
  } catch {
    // GitHub injoignable → on retombe sur le cache périmé puis l'épinglé.
  }
  if (cache) return cache.value;
  return directUrls(FALLBACK_VERSION, false);
}

export async function GET() {
  const value = await resolveExeUrls();
  return NextResponse.json(value, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
