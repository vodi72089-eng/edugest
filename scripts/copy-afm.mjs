#!/usr/bin/env node
/**
 * Copie les métriques de polices standard de pdfkit (js/data/*.afm) dans
 * dist/server/_next/static/data/ — l'emplacement que le chunk pdfkit.es du
 * bundle Workers consulte via readFileSync (td = dirname du chunk =
 * /bundle/_next/static sous workerd, fallback cwd()/_next/static).
 *
 * Sans ce fichier : « Error: no such file or directory, readAll
 * '/bundle/_next/static/data/Helvetica.afm' » → tous les PDF en 500.
 * Exécuté après `vite build` (build:vinext) ; la règle wrangler de type
 * Text (glob dist/server + tout sous-static + suffixe afm) inclut ces
 * fichiers dans le bundle Workers.
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, 'node_modules', 'pdfkit', 'js', 'data');
const dest = join(root, 'dist', 'server', '_next', 'static', 'data');

mkdirSync(dest, { recursive: true });
let n = 0;
for (const f of readdirSync(src)) {
  if (!f.endsWith('.afm')) continue;
  copyFileSync(join(src, f), join(dest, f));
  n++;
}
console.log(`[copy-afm] ${n} fichiers .afm -> ${dest}`);

// ── Injection de la règle wrangler dans la config GÉNÉRÉE ────────────────────
// @cloudflare/vite-plugin écrit dist/server/wrangler.json à chaque build et y
// place SES propres rules (ESModule **/*.js) — celles de wrangler.jsonc sont
// ignorées pour le champ rules. Or wrangler n'attache des fichiers additionnels
// (lisibles via node:fs sous /bundle/<chemin>) QUE s'ils matchent une règle de
// ce fichier. On ajoute donc la règle Text ici, après coup.
const cfgPath = join(root, 'dist', 'server', 'wrangler.json');
try {
  const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
  const rules = Array.isArray(cfg.rules) ? cfg.rules : [];
  const hasAfm = rules.some((r) => Array.isArray(r.globs) && r.globs.some((g) => g.includes('.afm')));
  if (!hasAfm) {
    rules.push({ type: 'Text', globs: ['**/*.afm'], fallthrough: true });
    cfg.rules = rules;
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    console.log('[copy-afm] règle Text (.afm) injectée dans dist/server/wrangler.json');
  } else {
    console.log('[copy-afm] règle .afm déjà présente dans dist/server/wrangler.json');
  }
} catch (e) {
  console.error('[copy-afm] ÉCHEC injection règle wrangler :', e.message);
  process.exitCode = 1;
}
