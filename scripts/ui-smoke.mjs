/**
 * Smoke test navigateur (vérification des correctifs client).
 * Usage : node scripts/ui-smoke.mjs [baseUrl]
 *
 * Objectif : monter réellement les vues touchées par les correctifs de hooks
 * (page.tsx : Communications/Convocations ; GradesView ; PaymentsView) et
 * vérifier qu'aucune erreur React (« Rendered more/fewer hooks ») ni erreur de
 * page n'apparaît, avec une capture d'écran par vue.
 *
 * Connexion : via l'API (cookie httpOnly partagé avec le contexte navigateur),
 * puis navigation directe sur les URLs réelles de l'application — c'est aussi
 * le chemin « cookie sans localStorage » (bootstrapSessionFromCookie).
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:3210';
const EXEC = process.env.CHROME_PATH
  || path.join(process.env.USERPROFILE || '', 'AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe');
const EMAIL = process.env.SMOKE_EMAIL || 'admin@edugest.app';
const PASSWORD = process.env.SMOKE_PASSWORD || 'admin123';

const VIEWS = [
  ['/dashboard', 'Administration EduGest'],
  ['/students', 'Élèves'],
  ['/grades', 'Notes'],
  ['/payments', 'Paiements'],
  ['/communications', 'Communications'],
  ['/convocation', 'Convocation'],
];

const SHOT_DIR = 'qa-shots/corrections';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const browser = await chromium.launch({ executablePath: EXEC, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });

// ── Connexion API : pose le cookie httpOnly de session dans le contexte ──
const login = await ctx.request.post(`${BASE}/api/auth`, {
  data: { email: EMAIL, password: PASSWORD },
});
console.log(`login ${EMAIL} → HTTP ${login.status()}`);
if (!login.ok()) {
  console.log(await login.text());
  await browser.close();
  process.exit(1);
}
const cookies = await ctx.cookies();
console.log(`cookie de session : ${cookies.some((c) => c.name === 'edugest_token') ? 'présent ✔' : 'ABSENT ✖'}`);

let failures = 0;
const rows = [];

for (const [routePath, expected] of VIEWS) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`);
  });

  await page.goto(`${BASE}${routePath}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  // Laisse la SPA restaurer la session (cookie → /api/auth/me) et peindre la vue.
  await page.waitForTimeout(6000);

  const body = (await page.locator('body').innerText().catch(() => '')) || '';
  const hookCrash = errors.some((e) => /hooks than|Rendered more|Rendered fewer|Application error|Unhandled Runtime Error/i.test(e));
  const rendered = body.trim().length > 120;
  const hasExpected = expected ? body.includes(expected) : true;
  const ok = rendered && !hookCrash && hasExpected;
  if (!ok) failures++;

  const shot = path.join(SHOT_DIR, `${routePath.replace(/[^\w]+/g, '_') || 'root'}.png`);
  await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
  rows.push({ route: routePath, rendered, hookCrash, hasExpected, errors: errors.length, shot });
  console.log(
    `${ok ? '✅' : '❌'} ${routePath.padEnd(16)} rendu=${rendered ? 'oui' : 'NON'} ` +
    `hooks=${hookCrash ? 'CRASH' : 'ok'} texte«${expected}»=${hasExpected ? 'oui' : 'NON'} ` +
    `erreurs=${errors.length}${errors.length ? ' → ' + errors[0].slice(0, 120) : ''}`
  );
  await page.close();
}

await browser.close();
console.log(`\nRÉSULTAT smoke navigateur : ${VIEWS.length - failures} vues OK / ${failures} en échec`);
console.log(`captures : ${SHOT_DIR}`);
process.exit(failures === 0 ? 0 : 1);
