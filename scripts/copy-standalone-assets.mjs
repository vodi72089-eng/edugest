/**
 * EduGest — copie les assets statiques dans le build standalone.
 *
 * Le mode `output: 'standalone'` de Next.js ne copie PAS `.next/static`
 * ni `public/` : sans cette étape, l'app desktop (Electron) affiche du
 * HTML brut sans CSS ni JS (tout `/_next/static/*` retourne 404).
 *
 * Ce script remplace les `cp -r` Unix de `npm run build` pour fonctionner
 * aussi sous Windows PowerShell (où `cp -r a b/` a une sémantique différente
 * et où `&&` n'existe pas en PowerShell 5.1).
 *
 * Usage : `node scripts/copy-standalone-assets.mjs` (après `next build`).
 */
import { cpSync, existsSync, rmSync, readFileSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const standalone = join(root, '.next', 'standalone');

const jobs = [
  [join(root, '.next', 'static'), join(standalone, '.next', 'static')],
  [join(root, 'public'), join(standalone, 'public')],
];

let failed = false;
/** Copie récursive tolérante : ignore les fichiers spéciaux/verrouillés
 *  (chunks Turbopack `[externals]_node`, `.tmp` du moteur Prisma...). */
function copyDirTolerant(from, to) {
  const walk = (src, dest) => {
    mkdirSync(dest, { recursive: true });
    for (const ent of readdirSync(src, { withFileTypes: true })) {
      const s = join(src, ent.name);
      const d = join(dest, ent.name);
      try {
        if (ent.isDirectory()) walk(s, d);
        else if (ent.isFile() || ent.isSymbolicLink()) copyFileSync(s, d);
        // sockets/FIFO/autres spéciaux : ignorés
      } catch { /* fichier verrouillé ou supprimé entre-temps : ignoré */ }
    }
  };
  walk(from, to);
}
for (const [from, to] of jobs) {
  if (!existsSync(from)) {
    console.error(`[copy-standalone-assets] introuvable : ${from}`);
    failed = true;
    continue;
  }
  try {
    cpSync(from, to, { recursive: true });
    console.log(`[copy-standalone-assets] ${from} -> ${to}`);
  } catch (e) {
    // Windows EINVAL sur certains chunks Turbopack (ex. [externals]_node 0 octet)
    // → on copie fichier par fichier en ignorant les cas spéciaux
    console.warn(`[copy-standalone-assets] cpSync direct échoué (${e.code}), repli fichier par fichier`);
    try {
      copyDirTolerant(from, to);
      console.log(`[copy-standalone-assets] ${from} -> ${to} (repli)`);
    } catch (e2) {
      console.error(`[copy-standalone-assets] ÉCHEC copie ${from} : ${e2.message}`);
      failed = true;
    }
  }
}

// ── pdfkit + better-sqlite3 : jamais tracés par Next dans le standalone ──────
// Leurs imports sont DYNAMIQUES (`await import('pdfkit')` dans report-pdf /
// cashier-report-pdf, idem better-sqlite3 dans /api/school/import-db) : le
// traceur Next ne les embarque pas et .next/standalone/node_modules ne les
// contient pas. En local, Node les retrouve dans le node_modules racine
// (pnpm) ; DANS L'EXE (resources/app sans aucun node_modules parent) →
// MODULE_NOT_FOUND → tous les PDF sortent en 500. Vérifié : 200 avec le
// paquet racine visible, 500 dès qu'on le masque (conditions EXE).
// On copie donc chaque arbre pnpm (paquet + dépendances transitives,
// résolues via createRequire depuis chaque paquet) à plat dans
// .next/standalone/node_modules — en dossiers RÉELS, les junctions pnpm ne
// survivant pas au packaging electron-builder.
const PKG_TREES = ['pdfkit', 'better-sqlite3'];

/** Dossier réel d'un paquet : résout le point d'entrée puis remonte jusqu'au
 *  package.json portant le bon nom (le main peut être dans lib/, dist/…). */
function pkgDir(name, requireFrom) {
  const req = createRequire(requireFrom);
  let entry;
  try {
    entry = req.resolve(name);
  } catch {
    entry = req.resolve(`${name}/package.json`);
  }
  let dir = dirname(entry);
  for (let i = 0; i < 12 && dir !== dirname(dir); i++) {
    const pj = join(dir, 'package.json');
    if (existsSync(pj)) {
      try {
        if (JSON.parse(readFileSync(pj, 'utf8')).name === name) return dir;
      } catch { /* package.json illisible : on continue de remonter */ }
    }
    dir = dirname(dir);
  }
  throw new Error(`package.json introuvable pour « ${name} » (depuis ${requireFrom})`);
}

/** Copie la fermeture transitively des paquets roots dans destNodeModules. */
function copyPkgClosure(roots, destNodeModules) {
  const seen = new Map();
  const scriptPath = fileURLToPath(import.meta.url);
  const queue = roots.map((name) => ({ name, from: scriptPath }));
  while (queue.length) {
    const { name, from } = queue.shift();
    if (seen.has(name)) continue;
    const dir = pkgDir(name, from);
    seen.set(name, dir);
    let deps = {};
    try { deps = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).dependencies || {}; } catch {}
    for (const dep of Object.keys(deps)) queue.push({ name: dep, from: join(dir, 'package.json') });
  }
  for (const [name, dir] of seen) {
    const target = join(destNodeModules, ...name.split('/'));
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
    try {
      cpSync(dir, target, { recursive: true });
    } catch {
      // Fichiers temporaires/verrouillés (ex. query_engine-*.tmp) : repli tolérant
      copyDirTolerant(dir, target);
    }
  }
  return [...seen.keys()];
}

try {
  const copied = copyPkgClosure(PKG_TREES, join(standalone, 'node_modules'));
  console.log(`[copy-standalone-assets] ${copied.length} paquets embarqués : ${copied.join(', ')}`);
} catch (e) {
  console.error(`[copy-standalone-assets] ÉCHEC copie des paquets : ${e.message}`);
  failed = true;
}

// Élagage : le tracing Next embarque parfois `desktop/` (l'app Electron
// elle-même, dont `dist/` avec les exes + win-unpacked ≈ 1 Go) dans le
// standalone. L'embarquer serait récursif et fait exploser l'installeur.
// Le serveur Next n'en a jamais besoin au runtime.
for (const junk of ['desktop']) {
  const p = join(standalone, junk);
  if (existsSync(p)) {
    rmSync(p, { recursive: true, force: true });
    console.log(`[copy-standalone-assets] élagué : ${p}`);
  }
}

if (failed) process.exit(1);
console.log('[copy-standalone-assets] OK');
