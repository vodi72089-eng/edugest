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
import { cpSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const standalone = join(root, '.next', 'standalone');

const jobs = [
  [join(root, '.next', 'static'), join(standalone, '.next', 'static')],
  [join(root, 'public'), join(standalone, 'public')],
];

let failed = false;
for (const [from, to] of jobs) {
  if (!existsSync(from)) {
    console.error(`[copy-standalone-assets] introuvable : ${from}`);
    failed = true;
    continue;
  }
  cpSync(from, to, { recursive: true });
  console.log(`[copy-standalone-assets] ${from} -> ${to}`);
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
