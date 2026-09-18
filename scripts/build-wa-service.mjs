/**
 * EduGest — bundle le mini-service WhatsApp (Baileys) en un seul fichier JS
 * exécutable par le Node embarqué d'Electron (pas besoin de Bun).
 *
 * Entrée  : mini-services/whatsapp-server/index.ts
 * Sortie  : desktop/wa-server/wa-server.cjs (+ node_modules du service)
 * Outil   : esbuild (téléchargé via npx au premier appel).
 *
 * Le bundle est ensuite embarqué dans l'app via electron-builder
 * (extraResources "wa-server") et démarré par desktop/main.js avec
 * WHATSAPP_AUTH_DIR dans %APPDATA% (session persistante entre MAJ).
 *
 * Usage : `node scripts/build-wa-service.mjs`
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svcDir = join(root, 'mini-services', 'whatsapp-server');
const outDir = join(root, 'desktop', 'wa-server');

// 1) Patch @trashcore/baileys (const → let, cf. patch.mjs — version Node ici
//    car patch.mjs utilise import.meta.dir, spécifique à Bun).
const luxu = join(svcDir, 'node_modules', '@trashcore', 'baileys', 'lib', 'Socket', 'luxu.js');
if (!existsSync(luxu)) {
  console.error('[build-wa] dépendances manquantes — lancez `npm install` dans mini-services/whatsapp-server');
  process.exit(1);
}
let luxuSrc = readFileSync(luxu, 'utf-8');
const before = luxuSrc;
luxuSrc = luxuSrc.replace(/const media = null;/g, 'let media = null;');
luxuSrc = luxuSrc.replace(/const mediaType = null;/g, 'let mediaType = null;');
if (luxuSrc !== before) {
  writeFileSync(luxu, luxuSrc);
  console.log('[build-wa] luxu.js patché (const → let)');
}

// 2) Bundle esbuild en CJS (les require() dynamiques de baileys/chalk
//    exigent CJS à l'exécution). import.meta.url n'existe pas en CJS : on le
//    fige vers le source (utilisé uniquement pour le AUTH_DIR par défaut,
//    toujours surchargé par WHATSAPP_AUTH_DIR dans l'app desktop).
const srcFileUrl = 'file:///' + join(svcDir, 'index.ts').replace(/\\/g, '/');
execSync(
  `npx -y esbuild@0.24.2 "${join(svcDir, 'index.ts')}" --bundle --platform=node --format=cjs --define:import.meta.url="'${srcFileUrl}'" --outfile="${join(outDir, 'wa-server.cjs')}" --log-level=warning`,
  { cwd: root, stdio: 'inherit', shell: true }
);
console.log('[build-wa] OK → desktop/wa-server/wa-server.cjs');
