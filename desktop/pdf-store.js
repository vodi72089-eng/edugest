/**
 * EduGest Desktop — rangement des PDF générés par l'application.
 *
 * Logique PURE (aucune dépendance Electron) : `main.js` l'appelle avec le
 * dossier Documents de l'utilisateur, ce qui permet de la tester avec node.
 *
 * Chaque PDF est rangé dans `<Documents>/EduGest/<Catégorie>/` selon son nom
 * de fichier (ex. `recu-…pdf` → « Reçus de paiement »).
 */
const path = require('path');
const fs = require('fs');

/** Dossier racine visible par l'utilisateur dans ses Documents. */
const EDUGEST_DOCS_DIR = 'EduGest';

/** Correspondance préfixe de nom de fichier → dossier de catégorie. */
const PDF_CATEGORY_FOLDERS = [
  { prefixes: ['recu-', 'rec-'], folder: 'Reçus de paiement' },
  { prefixes: ['bulletin-', 'bul-'], folder: 'Bulletins' },
  { prefixes: ['sommation-'], folder: 'Sommations' },
  { prefixes: ['rapport-'], folder: 'Rapports' },
  { prefixes: ['presence-'], folder: 'Présences' },
  { prefixes: ['fsa-', 'dis-', 'reg-'], folder: 'Documents médicaux' },
  { prefixes: ['not-'], folder: 'Notes' },
];

const PDF_FALLBACK_FOLDER = 'Documents';

/** Taille maximale acceptée (base64) : 40 Mo — garde-fou IPC. */
const MAX_DATA_LENGTH = 40 * 1024 * 1024;

/**
 * Nom de fichier sûr : basename (anti `../`), sans caractères interdits
 * Windows, extension .pdf garantie, longueur bornée.
 */
function sanitizePdfFilename(name) {
  let base = path.basename(String(name || '')).trim() || 'document.pdf';
  base = base
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
  if (!base) base = 'document.pdf';
  if (!/\.pdf$/i.test(base)) base += '.pdf';
  return base;
}

/** Dossier de catégorie pour un nom de fichier (déjà assaini). */
function categoryFolder(filename) {
  const lower = String(filename || '').toLowerCase();
  const entry = PDF_CATEGORY_FOLDERS.find((c) => c.prefixes.some((p) => lower.startsWith(p)));
  return entry ? entry.folder : PDF_FALLBACK_FOLDER;
}

/** Chemin unique : `nom.pdf`, puis `nom (2).pdf`, `nom (3).pdf`… (jamais d'écrasement). */
function uniquePdfPath(dir, filename) {
  let dest = path.join(dir, filename);
  if (!fs.existsSync(dest)) return dest;
  const ext = path.extname(filename);
  const stem = path.basename(filename, ext);
  for (let i = 2; i < 1000; i++) {
    const cand = path.join(dir, `${stem} (${i})${ext}`);
    if (!fs.existsSync(cand)) return cand;
  }
  return path.join(dir, `${stem} (${Date.now()})${ext}`);
}

/**
 * Enregistre un PDF (déjà décodé) dans son dossier de catégorie.
 * @param {{ documentsDir: string, filename: string, buffer: Buffer }} args
 *   documentsDir = dossier « EduGest » parent (ex. `<Documents>/EduGest`).
 * @returns {{ path: string, folder: string, filename: string }}
 */
function savePdfBuffer({ documentsDir, filename, buffer }) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('données PDF vides');
  }
  if (buffer.length > MAX_DATA_LENGTH) {
    throw new Error('fichier trop volumineux');
  }
  const safe = sanitizePdfFilename(filename);
  const folder = categoryFolder(safe);
  const dir = path.join(documentsDir, folder);
  fs.mkdirSync(dir, { recursive: true });
  const dest = uniquePdfPath(dir, safe);
  fs.writeFileSync(dest, buffer);
  return { path: dest, folder, filename: path.basename(dest) };
}

module.exports = {
  EDUGEST_DOCS_DIR,
  PDF_CATEGORY_FOLDERS,
  PDF_FALLBACK_FOLDER,
  MAX_DATA_LENGTH,
  sanitizePdfFilename,
  categoryFolder,
  uniquePdfPath,
  savePdfBuffer,
};
