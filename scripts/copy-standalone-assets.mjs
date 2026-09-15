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
import { cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const jobs = [
  [join(root, '.next', 'static'), join(root, '.next', 'standalone', '.next', 'static')],
  [join(root, 'public'), join(root, '.next', 'standalone', 'public')],
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

if (failed) process.exit(1);
console.log('[copy-standalone-assets] OK');
