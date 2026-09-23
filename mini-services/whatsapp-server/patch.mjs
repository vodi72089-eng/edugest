// Patch @trashcore/baileys v4.2.2 : "const media/mediaType" réassignées dans luxu.js
// Bun fait cette vérification à la transpilation → erreur fatale au chargement.
// Ce script est idempotent (rien à faire si déjà patché).
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const file = join(import.meta.dir, 'node_modules', '@trashcore', 'baileys', 'lib', 'Socket', 'luxu.js');
if (!existsSync(file)) {
  console.log('[patch] luxu.js introuvable — rien à faire');
  process.exit(0);
}
let src = readFileSync(file, 'utf-8');
const before = src;
src = src.replace(/const media = null;/g, 'let media = null;');
src = src.replace(/const mediaType = null;/g, 'let mediaType = null;');
if (src !== before) {
  writeFileSync(file, src);
  console.log('[patch] luxu.js patché (const → let) ✅');
} else {
  console.log('[patch] luxu.js déjà patché ou aucun pattern — OK');
}
