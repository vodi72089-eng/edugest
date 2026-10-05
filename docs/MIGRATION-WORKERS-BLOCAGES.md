# Migration Cloudflare Workers — Inventaire des blocages et fixes compatibles

> Référence de migration vers la cible imposée :
> **Cloudflare (DNS/HTTPS) → Workers → R2 · Queues · Durable Objects · Hyperdrive → Neon PostgreSQL**.
> Règles : ne jamais couper une fonctionnalité en silence ; tout blocage est listé ici avec un
> fix compatible ; Baileys-WhatsApp et la génération PDF sont **intouchables**.
>
> Statut : **phase de validation dev** (smoke `vite dev` + workerd en cours).
> Dernière mise à jour : 2026-10-03.

## 1. Récapitulatif

| # | Blocage | Sévérité | Fix compatible | Statut |
|---|---------|----------|----------------|--------|
| B1 | Sessions serveur sur fichiers (`src/lib/auth.ts`) | 🔴 bloquant (auth) | Sessions en base (Neon via Hyperdrive) — modèle `Session` à créer | Fix proposé |
| B2 | Uploads & fichiers locaux (`upload/`, `os.tmpdir`) | 🔴 bloquant (fichiers) | Bucket **R2** (mêmes URLs API) + script de migration des fichiers | Fix proposé |
| B3 | Scheduler rapports (`setInterval` in-process) | 🔴 bloquant (fiabilité) | **Cron Trigger** Workers + verrou atomique en base (ou Durable Object) | Fix proposé |
| B4 | `platform/update` (`child_process` → `git pull`) | 🟠 impossible sur Workers | Garde runtime → réponse **501 explicite** (déploiement = push CI). Décision utilisateur : garder ou retirer | Fix proposé |
| B5 | PDF (pdfkit dynamique + logo via `fs`) | 🟠 à valider | pdfkit devrait se bundler sous Vite (à confirmer par test réel) ; logo → import asset (buffer/base64) | À tester |
| B6 | Fallback SMTP nodemailer | 🟡 partiel | Primaire **Resend HTTP** (compatible Workers ✓) ; si SMTP tombe, l'email reste assuré par le primaire | À tester |
| B7 | Notifications web (`web-push`) | 🟡 à valider | `https` pur → devrait fonctionner ; VAPID en secrets Workers | À tester |
| B8 | Mini-service WhatsApp (Baileys, port 3011) | 🟡 hors Workers | Process **séparé** conservé tel quel ; en prod : URL publique via **Cloudflare Tunnel** (pas de VPS) + secrets `WHATSAPP_SERVER_URL` / `WHATSAPP_API_KEY` | Décision utilisateur |
| B9 | `next/image` (optimiseur `sharp` absent de workerd) | 🟡 à valider | Loader compatible / `images.unoptimized` / Cloudflare Images selon le test | À tester |
| B10 | Bindings & secrets Workers (Hyperdrive, R2, DO, Queues, `DATABASE_URL`, VAPID, OAuth…) | 🔴 déploy | Étape C : création des bindings + `wrangler secret put` | À faire |
| B11 | Prisma sur edge | 🟠 en fix | `@prisma/adapter-pg` branché dans `src/lib/db.ts` (installé, version 6.19.2) | En cours de test |

## 2. Détail par blocage

### B1 — Sessions serveur sur fichiers (bloquant)
`src/lib/auth.ts` stocke les sessions dans `SESSIONS_DIR` avec `fs.*Sync` (exists/mkdir/write/read/
readdir/unlink), organisées par sous-dossier école. Sur workerd, `node:fs` n'a pas de vrai système
de fichiers → **toute l'authentification tomberait**.
- **Fix recommandé** : nouveau modèle Prisma `Session` (Neon/Hyperdrive), requêtes Prisma
  (déjà compatible partout). Un seul impl pour dev Node **et** Workers, plus robuste en
  multi-instances. Portage des fonctions : lecture/écriture/suppression/listing par école.
- Alternative : Durable Object sessions (forte cohérence) ou KV (cohérence éventuelle — à éviter
  pour la révocation).

### B2 — Uploads et fichiers locaux (bloquant)
- `src/app/api/upload/route.ts` : écriture `fs.writeFileSync(UPLOAD_DIR/…)`.
- `src/app/api/upload/[...path]/route.ts` : lecture/`stat` pour servir (logos, pièces jointes).
- `src/app/api/sommation/route.ts` + `src/app/api/payments/receipt/[id]/route.ts` :
  `existsSync` + `readFileSync` sur un fichier existant.
- `src/app/api/school/import-db/route.ts` : écriture dans `os.tmpdir()`.
- **Fix** : bucket **R2** pour upload/lecture (API URL identique, service public via
  `env.ASSETS` ou route qui lit R2 + en-têtes MIME/`Content-Disposition` conservés) ;
  import-db : parser depuis le `Buffer` en mémoire (pas de fichier temporaire) ;
  script de migration des fichiers `upload/` existants vers R2.

### B3 — Scheduler des rapports (bloquant pour la fiabilité)
`src/lib/report-scheduler.ts` : `setInterval(60 s)` démarré par `src/instrumentation.ts`
(✅ démarre dans workerd — vu en boot), verrou anti-double-exécution en mémoire
(`runningScheduleIds`). Sur Workers : durée de vie des isolats non garantie → timer fiable
impossible, verrou mémoire partagé impossible.
- **Fix recommandé** : **Cron Trigger** (`triggers.crons` dans `wrangler.jsonc`) → handler qui
  balaie `ReportSchedule` avec **revendication atomique en base**
  (`UPDATE … SET claim = … WHERE id = … AND claim échu`), ou Cron → **Queue** (consommateur
  idempotent). Conserver `startInProcessScheduler()` pour `next dev`/standalone.
- Alternative : Durable Object `ReportScheduler` (alarmes, verrou natif) si garanties fortes.

### B4 — `platform/update` (impossible, décision utilisateur)
`src/app/api/platform/update/route.ts` exécute `git stash` + `git pull --ff-only` via
`child_process` (auto-mise-à-jour du serveur VPS). N'existera pas sur Workers.
- **Fix compatible** : garde de runtime (détection Workers) → réponses claires **501**
  « Déploiement via CI : git push → Cloudflare Workers Builds » (super-admin uniquement,
  jamais de coupure silencieuse). Option : retirer complètement l'endpoint (décision utilisateur).

### B5 — PDF (intouchable, à valider)
- `src/lib/report-pdf.ts` + `src/lib/cashier-report-pdf.ts` : `import('pdfkit')` dynamique
  avec commentaires `webpackIgnore`/`turbopackIgnore` (hors bundle côté Next). **Sous Vite,
  l'import littéral est normalement bundlé** → à valider par un appel PDF réel dans workerd.
  - Si échec : config d'alias/polyfills pour pdfkit (Buffer/stream fournis par `nodejs_compat`).
- `src/lib/pdf-brand.ts` : lit `public/edugest-logo*.jpg|png` via `fs` → **remplacer par un
  import d'asset Vite** (bytes en base64/buffer ou self-fetch de l'asset) — aucune fonte custom
  détectée (polices standard pdfkit intégrées ✓).
- `src/lib/pdf-medical.ts` : même motif de lecture `fs`.

### B6 — Email (partiellement compatible)
`src/lib/email.ts` : primaire = **Resend via `fetch` HTTPS** ✓ compatible Workers ;
secours = nodemailer SMTP (`net`/`tls` — non garanti sur workerd), + endpoint de test SMTP.
- **Fix** : garder les deux ; si le secours échoue sur Workers, log explicite — l'envoi reste
  assuré par Resend (aucune coupure).

### B7 — Notifications push (à valider)
`src/lib/push.ts` : `web-push` en HTTPS pur → attendu compatible ; VAPID_PUBLIC/PRIVATE_KEY en
secrets Workers. Test de bout en bout requis.

### B8 — WhatsApp Baileys (intouchable, hors bundle)
Le serveur Baileys vit dans `mini-services/whatsapp-server` (process `bun` séparé, port 3011,
API key) — **aucun changement de code applicatif**. En production Workers, l'appli doit atteindre
ce process via une URL publique HTTPS :
- **Fix compatible sans VPS** : **Cloudflare Tunnel** (`cloudflared`) exposant le service de la
  machine actuelle ou de tout hébergeur gratuit ; secrets `WHATSAPP_SERVER_URL` + `WHATSAPP_API_KEY`.
- `src/lib/whatsapp/client.ts` (Baileys embarqué dans l'app) : **sans importeur détecté** → code
  mort, non bundlé, sans impact (ne pas le retirer sans décision explicite).
- Décision utilisateur requise : hébergement pérenne du bridge.

### B9 — Images `next/image` (à valider)
Pas de config `images` dans `next.config` → vérifier le rendu des images sous vinext/workerd
(optimiseur `sharp` indisponible). Fixs possibles : `images.unoptimized`, loader Vite/Workers,
ou Cloudflare Images selon le constat.

### B10 — Bindings & secrets (étape C)
- Bindings : Hyperdrive (→ Neon), R2 (uploads), DO (sessions/scheduler), Queues.
- Secrets : `DATABASE_URL` (variante directe Neon, sans `-pooler`/`channel_binding`),
  `WHATSAPP_SERVER_URL`, `WHATSAPP_API_KEY`, `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`,
  `SMTP_*` (optionnel), clés Google OAuth, éventuellement `SESSION_SECRET`.
- Schéma : `prisma/schema.prisma` unifié sur `provider = "postgresql"` (dev = Neon pour tous,
  workerd n'a pas de fs). Ancienne config SQLite sauvegardée : `.env.local.sqlite.bak`.
  Les variables vivent dans `.env.local` (dev) ; `prisma/.env` pour la CLI (gitignoré).

### B11 — Prisma sur edge (en cours)
`@prisma/adapter-pg` installé et branché dans `src/lib/db.ts` (lecture `DATABASE_URL`,
branche `HYPERDRIVE.connection_string` prévue à l'étape bindings). Validation : smoke
`GET /api/health` → **200 `database: up`** dans workerd.

## 3. Points déjà validés (pas des blocages)

- **Prisma/Neon** : schéma postgresql validé, `db push` en phase, boot Neon OK (phase A).
- **bcryptjs** (pur JS) : compatible Workers (coût CPU bcrypt 12 acceptable).
- **Pas de SQL spécifique SQLite** détecté (`strftime`/`AUTOINCREMENT`/… : aucun).
- **Resend HTTPS** primaire pour l'email.
- **`src/lib/store.ts` + `src/lib/realtime.ts`** : code **client** (zustand/localStorage/polling
  navigateur) — non concernés par workerd.
- **`instrumentation.ts`** : démarre dans workerd (« Planificateur in-process démarré » observé).
- **Baileys** : hors bundle (mini-service séparé) — règle « ne pas couper » respectée.
- **`nodejs_compat`** : Buffer, streams, `node:net`/`node:tls` (attendu pour pg/HTTPS).
- **CI** : `bunx tsc --noEmit` 0 erreur ; `eslint` : 72 problèmes (70 erreurs, 2 warnings),
  aucun fichier modifié par la migration concerné — baseline non augmentée.

## 4. Tests restants avant de pouvoir déclarer la production

1. Smoke Workers vert : `GET /api/health` **200 `database: up`** dans workerd (retry en cours).
2. Routes clés : login (bcrypt+session), `/api/schools`, rendu landing.
3. PDF réel (rapport + caisse) dans workerd.
4. Upload + lecture R2 (une fois les bindings créés).
5. Email Resend de bout en bout ; push web ; webhook paiement (miropay/CinetPay — HTTPS ✓).
6. Scheduler : Cron Trigger + verrou DB (une fois B3 implémenté).
7. Google OAuth complet (client ID/secret à recevoir).
8. Déploiement réel + domaine, HTTPS, logs, migrations — checklist finale complète.
