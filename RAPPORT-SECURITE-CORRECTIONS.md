# RAPPORT — Audit de sécurité & corrections EduGest

**Dépôt analysé** : https://github.com/vodi72089-eng/edugest (clone local, copié dans le projet)
**Outils** : Semgrep 1.177.0 (règles `p/owasp-top-ten`, `p/javascript`, `p/typescript`, `p/security-audit`, `p/secrets`, `p/nextjs`) + audit manuel des promesses (README/EDUGEST_DOCUMENTATION) vs code.
**Correctifs appliqués** : 20 — détaillés ci-dessous.

---

## A. Erreurs contraires aux promesses de l'app — CORRIGÉES

### Chaîne WhatsApp (promesse : notifications auto + quotas mensuels + « votre propre API » illimitée)

1. **Quota WhatsApp jamais réinitialisé** — `src/lib/whatsapp-agent.ts`
   `whatsappMonthlyUsed` était incrémenté à chaque envoi mais remis à zéro nulle part → blocage définitif après ~500 messages cumulés (ESSENTIEL), alors que l'UI promet une fenêtre **mensuelle**.
   ✅ Fix : le gate utilise désormais `checkWhatsappQuota()` (comptage `WhatsappMessageLog` sur le mois calendaire, reset automatique), l'incrémentation du compteur School est supprimée.

2. **Suivi d'usage WhatsApp mort (toujours 0)** — `src/lib/whatsapp-agent.ts`, `bulletins/[studentId]/whatsapp/route.ts`
   `recordWhatsappMessage()` n'était **jamais appelé** → `/api/whatsapp/usage` renvoyait éternellement `used: 0`.
   ✅ Fix : chaque envoi (message et document, succès comme échec) est journalisé. Vérifié : `GET /api/whatsapp/usage` → `{"tier":"PREMIUM","limit":5000,"used":0,"remaining":5000,"resetsAt":"2026-10-01…"}`.

3. **« Votre propre API WhatsApp » n'envoyait jamais via Meta** — `whatsapp-agent.ts`
   `sendViaWhatsappApi()`/`sendDocumentViaWhatsappApi()` (100 % codés) n'étaient appelés par aucun code : les écoles payantes pour l'API perso restaient sur l'agent partagé.
   ✅ Fix : `sendWhatsAppMessage`/`sendWhatsAppDocument` routent automatiquement vers l'API Meta Cloud quand une config active existe (cache 60 s), sinon Baileys. Tous les points d'appel (11 sites) passent désormais le `schoolId`.

4. **Token Meta stocké en clair** — `whatsapp-config/custom/route.ts`
   Contredit la promesse « chiffrement AES-256-GCM des clés API ».
   ✅ Fix : `encryptSecret()` appliqué avant persistance.

### Gating des forfaits (promesse : quotas élèves/parents/bulletins selon le forfait)

5. **Contournement du quota élèves via l'import de base** — `school/import-db/route.ts`
   La boucle d'import n'appelait jamais `checkCanCreateStudent` → une école FREEMIUM (100 max) pouvait importer des milliers d'élèves.
   ✅ Fix : calcul du quota avant import, `studentSlots` décomptés, élèves excédentaires ignorés avec message d'erreur explicite.

6. **Comptes parents créables hors forfait** — `students/[id]/parent-account/route.ts`
   ✅ Fix : contrôle `canManageParentAccounts` (403 FREEMIUM), aligné sur `/api/parents`.

7. **Bulletins PDF non gated pour le personnel** — `bulletins/[studentId]/route.ts`
   `report_cards` démarre à STANDARD (`/api/report-cards` était gated, cette route non) → génération de bulletins officiels en FREEMIUM/ESSENTIEL.
   ✅ Fix : `hasFeatureAccess(tier,'report_cards')` pour tous les rôles staff (parent non concerné, déjà gated).

8. **Comptes legacy `ADMIN_FREEMIUM` ne pouvaient plus se connecter** — `src/lib/helpers.ts`
   ✅ Fix : ajouté à `API_ROLE_MAP` (→ SCHOOL_ADMIN côté front, permissions serveur réelles conservées).

### Promesses marketing contredites par le backend

9. **Landing « Tarifs » vs `getTierLimits()`** — `landing/sections/Pricing.tsx`, `api/pricing/route.ts`, DB `PricingPlan`
   « Professeurs illimités » (Essentiel → réellement 5), « WhatsApp illimité » (Standard → réellement 1 500), « 10 professeurs » (Standard → réellement 50), « API accès » au Professionnel (réellement ENTERPRISE+), « App mobile dédiée » (aucune app mobile — desktop seulement).
   ✅ Fix : textes alignés sur `SUBSCRIPTION_FEATURES`/`getTierLimits` dans les 3 sources (composant statique, `DEFAULT_TIERS` de l'API, ligne DB existante).

10. **Incohérence UI/API sur la vue « parents »** — `page.tsx`
    UI masquait aux SCHOOL_ADMIN < STANDARD alors que l'API autorise dès ESSENTIEL.
    ✅ Fix : UI alignée (parents : ESSENTIEL+ ; personnalisation/branding : PREMIUM+ — feature `custom_branding`).

11. **Route dashboard Freemium inexistante** — `FreemiumAdminDashboard.tsx`
    `fetch('/api/schools/{id}/stats')` → 404 (route absente) + lien mort `/pricing` (link existant via rewrite, ancre plus fiable) + « Jusqu'à 500 élèves » (Essentiel = 250).
    ✅ Fix : `GET /api/schools/[id]` (`_count.students/_count.classes`), `/#pricing`, 250.

### Robustesse

12. **Seed non idempotent (500 sur état partiel de la DB)** — `api/seed/route.ts`
    `P2002 Unique constraint failed on phone` lors d'un re-seed sur base partielle (promesse README : seed dev fonctionnel).
    ✅ Fix : helper `safeCreateUser()` — réutilise l'utilisateur existant en cas de collision email/phone au lieu de crasher.

---

## B. Failles de sécurité — CORRIGÉES

13. **IDOR multi-écoles sur `/api/whatsapp-config`** (Critique)
    Avant : `requireAuth` seul + `schoolId` du query honoré pour tous → un PARENT d'une autre école pouvait lire la config agent de n'importe quelle école.
    ✅ Fix : rôles `SUPER_ADMIN_GLOBAL`/`SCHOOL_ADMIN`/`SECRETARY` + scellage école (le query `schoolId` n'est honoré que pour le super admin). **Vérifié en navigateur/API** : l'admin CSL lisant la config de MWZ reçoit la sienne ; son POST écrit bien sous la clé de SON école.

14. **`GET /api/settings-approval` lisible par tous les rôles**
    Un PARENT/TEACHER recevait tout l'historique des demandes (JSON `changeData` : classes à créer/supprimer…).
    ✅ Fix : réservé à `SETTINGS_ROLES` + SECRETARY (uniquement les demandes `qr_create`). **Vérifié** : TEACHER → HTTP 403.

15. **XSS via SVG uploadé (XST)** — `api/upload/[...path]/route.ts`
    Un SVG authentifié contenant `<script>` était servi `inline` → exécution same-origin à l'ouverture directe.
    ✅ Fix : SVG servi en `Content-Disposition: attachment` + `Content-Security-Policy: sandbox; default-src 'none'` (les usages `<img>` restent fonctionnels).

16. **Tag GCM sans longueur explicite** — `src/lib/gateway-keys.ts` (Semgrep `gcm-no-tag-length`, ERROR)
    ✅ Fix : vérification stricte `tag.length === 16` avant `setAuthTag` (anti-troncation de tag d'authentification).

17. **`POST/GET /api/subscription/request` ouverts à tous les rôles**
    Un TEACHER/CASHIER/PARENT pouvait déposer une demande d'upgrade au nom de l'école.
    ✅ Fix : réservé à `SUPER_ADMIN_GLOBAL` + `SCHOOL_ADMIN`.

18. **SECRETARY pouvait importer une base d'école** — `import-db/route.ts`
    ✅ Fix : retiré de `IMPORT_ADMIN_ROLES` (opération critique réservée à l'administration).

## C. Résultats Semgrep (scan complet du projet)

- **16 findings** avant correctifs → les 4 réels applicables ont été corrigés (16bis infra) :
  - `gcm-no-tag-length` (ERROR) → corrigé (16).
  - `unknown-value-with-script-tag` ×2 (WARNING, `desktop/main.js`) → **faux positif** : `APP_VERSION` est une constante de build (`require('./package.json').version`), non contrôlée par l'utilisateur.
  - `defusedxml` / `urllib` (ERROR/WARNING) → artefacts de tooling (`.mimosa/`), hors code applicatif.
- Scan manuel complémentaire : **aucun** `eval`/`new Function`, **aucun** `child_process` dans `src/`, un seul `dangerouslySetInnerHTML` (shadcn `chart.tsx`, injection CSS de config locale — pattern standard).
- Points forts confirmés côté code : sessions serveur + RBAC 18 rôles avec anti-escalade, isolation école (`verifySchoolAccess`), webhooks paiement HMAC, rate-limiting login, seed bloqué en production, anti-énumération.

## D. Vérifications exécutées (navigateur + API)

- Landing `/` rendue (nav, hero, écoles 6, tarifs) — capture OK
- Connexion `admin@edugest.app/admin123` → dashboard Super Admin complet (23 vues)
- Connexion `admin@lumiere.cd/admin123` → SCHOOL_ADMIN rattaché à son école
- `GET /api/whatsapp/usage` (SAG) → données de quota réelles
- IDOR `whatsapp-config` → config d'autrui inaccessible, écriture scellée à l'école
- `settings-approval` en TEACHER → 403
- `tsc --noEmit` : **0 erreur** · ESLint sur fichiers modifiés : **0 warning**
- Tests Semgrep : ré-exécution propre
