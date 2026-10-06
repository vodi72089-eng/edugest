import { NextResponse } from 'next/server';

// GET /api/version/exe
// Résolution SERVEUR des URLs directes de téléchargement de la dernière
// release GitHub (exe Setup + exe Portable).
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
// GitHub. Un clic déclenche donc toujours un téléchargement immédiat
// (Content-Disposition: attachment côté GitHub).

export const dynamic = 'force-dynamic';

const REPO = 'vodi72089-eng/edugest';
// Repli épinglé : release connue la plus récente. Jamais la page de releases.
const FALLBACK_VERSION = '1.4.12';
const CACHE_TTL_MS = 10 * 60 * 1000;

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
  const base = `https://github.com/${REPO}/releases/download/v${version}`;
  return {
    version,
    setup: `${base}/EduGest-Setup-${version}.exe`,
    portable: `${base}/EduGest-Portable-${version}.exe`,
    latest,
  };
}

// Cache mémoire par isolate : au plus quelques requêtes GitHub toutes les
// 10 minutes, même pour un burst de visiteurs.
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
      if (version) {
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
    headers: { 'Cache-Control': 'public, max-age=600' },
  });
}
