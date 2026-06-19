---
Task ID: 1
Agent: Main Agent
Task: Fix dashboard statistics, personnel creation, homework view, and grades API

Work Log:
- Updated Prisma schema: added `subjectName`, `classNames`, `isTitulaire` to User model; added `teacherId`, `isTitulaire`, `description @default("")` to Homework model
- Ran `prisma db push` to sync schema with database
- Updated `/api/users/route.ts`: Added select/create/update for new fields (subjectName, classNames, isTitulaire)
- Updated `/api/homework/route.ts`: Added parentId-based homework filtering, teacherId, isTitulaire fields, made description optional
- Updated `/api/grades/route.ts`: Fixed schoolYearId resolution - now auto-resolves from student record or creates default school year instead of using hardcoded 'default'
- Updated `src/lib/store.ts`: Added subjectName, classNames, isTitulaire to UserData interface
- Updated login flow in page.tsx: Pass subjectName, classNames, isTitulaire from API to store
- Fixed all dashboard views to use real API data instead of hardcoded values:
  - SecretaryDashboard: fetches from /api/stats with schoolId, shows real student/class/discipline/payment counts
  - CashierDashboard: fetches real payment stats, shows actual collection rates
  - TeacherDashboard: fetches real class/student/homework counts, shows teacher's subject and titulaire status
  - HeadTeacherDashboard: fetches actual class info, shows subject and titulaire status
  - DisciplineDashboardView: fetches real discipline stats with section level
- Updated PersonnelView: Added teacher-specific form fields (Matière/Cours, Classes occupées, Titulaire toggle), show subject+titulaire badge in table
- Updated HomeworkView: Auto-fills subject from teacher profile, sends teacherId/isTitulaire with homework, shows "Titulaire" badge, added parent-specific view with prominent course/teacher/titulaire info
- Fixed lint issues: setState in useEffect warnings using setTimeout pattern

Stage Summary:
- All dashboard views now show real database statistics instead of hardcoded values
- Personnel creation form includes teacher-specific fields when Enseignant/Prof. Principal is selected
- Homework cards show course name, teacher name, and "Titulaire" badge
- Parents see prominent homework info with subject, teacher, and titulaire status
- Grades API now properly resolves schoolYearId from student records
- Login flow preserves teacher-specific data (subjectName, classNames, isTitulaire)
---
Task ID: 1
Agent: Main Agent
Task: Fix dashboard statistics, enhance teacher creation, verify homework display

Work Log:
- Analyzed the root cause: SuperAdminDashboard was using `/api/admin-analytics` which counts ALL students globally across ALL schools. When a new school admin creates a school, they get SUPER_ADMIN_GLOBAL role and see global stats including 20 seeded students.
- Fixed SuperAdminDashboard: When user has a schoolId (school admin), now shows school-specific dashboard using `/api/stats?schoolId=...` which returns only that school's data. When no schoolId (true platform admin), shows global admin analytics.
- Enhanced PersonnelView teacher creation form: Added `availableClasses` state, fetches classes filtered by schoolId, added clickable class chip buttons for selecting/deselecting classes in addition to the text input.
- Added classNames display in personnel table for TEACHER/HEAD_TEACHER roles.
- Fixed duplicate class chips by passing schoolId to `/api/classes?schoolId=...` API call.
- Fixed dashboard greetings: SecretaryDashboard now shows "Bonjour {name}" instead of "Bonjour Secrétaire", CashierDashboard shows "Bonjour {name}" instead of "Bonjour Caissier".
- Verified homework display already correctly shows: subject/course name badges, teacher names, "Titulaire" badge, and parent-specific enhanced display with course+teacher+titulaire.
- Verified with Agent Browser: New school creation now shows 0 students, teacher form has class selection chips, homework displays correctly.

Stage Summary:
- Dashboard now shows real school-specific statistics (0 for new schools, correct counts for existing schools)
- Teacher creation form has enhanced class selection with clickable chips
- Homework display correctly shows course name, teacher name, and titulaire label
- All lint checks pass, dev server running without errors

---
Task ID: 2
Agent: Main Agent
Task: Comprehensive bug testing and fixing all detected issues across the EduGest application

Work Log:
- Conducted thorough code review of page.tsx (~7500 lines) and all API routes
- Identified 18 bugs across CRITICAL, HIGH, MEDIUM, and LOW severity levels
- Created /api/subjects/route.ts (was completely missing - prevented teachers from entering grades)
- Fixed ConvocationView: Added onClick handler for submit button, added schoolId from userData, added convocations list display
- Fixed PaymentsView: Removed undefined setShowSuggestions call that caused runtime ReferenceError
- Fixed CashierDashboard: Replaced Math.random() per-class rates with actual collectionRate from stats API
- Fixed ParentDashboard: Replaced hardcoded "5 notifications" and "3 devoirs" with real computed values from API
- Fixed HomeworkView: Added schoolId filter for non-parent users, added schoolId to class fetch and homework refresh
- Fixed TeacherDashboard: Changed homework filter from teacherName to teacherId, added schoolId to fetches
- Fixed HeadTeacherDashboard: Stopped defaulting to first class when no class assigned, added "no class" message
- Fixed Discipline API: Added PUT handler for editing conduct records
- Fixed DisciplineView: Added inline edit functionality for discipline records (points, list type, status)
- Fixed Discipline filtering: Improved section matching to include class name patterns
- Fixed Homework API: Added class relation to Prisma schema and include in API response
- Fixed ClassesView, StudentsView, GradesView, CommunicationsView, PaymentsView: Added schoolId filters
- Fixed Grades API: Replaced hardcoded "2025-2026" year with dynamic year generation
- Updated Prisma schema: Added Homework-class relation, homeworks to Class model
- All lint checks pass (0 errors, 1 warning in SchoolMap.tsx)

Stage Summary:
- CRITICAL bugs fixed: Missing /api/subjects route, ConvocationView non-functional, PaymentsView crash
- HIGH bugs fixed: Random/fake stats replaced with real data, schoolId filters added everywhere, discipline edit capability added
- MEDIUM bugs fixed: Homework shows class name, improved discipline filtering, dynamic year generation, HeadTeacher no-class message
- All views now properly filter by schoolId to prevent cross-school data leakage
- Dashboard statistics now reflect real database counts
- Discipline records can now be edited (points, list type, status)
- Convocations can now be created and viewed in a list

---
Task ID: 3
Agent: Main Agent
Task: Detect and fix ALL security vulnerabilities in the EduGest application

Work Log:
- Conducted comprehensive security audit of all 27 API route files
- Identified 47 vulnerabilities (8 CRITICAL, 19 HIGH, 14 MEDIUM, 6 LOW)
- Created JWT-based authentication system at /src/lib/auth.ts with:
  - Token creation and verification using jose library
  - Role-based permission system (ROLE_PERMISSIONS mapping)
  - requireAuth(), requirePermission(), requireRole() helper functions
  - verifySchoolAccess() for school isolation
  - verifyParentAccess() for parent-child relationship checks
  - safeParseInt() for input validation
  - sanitizeError() for safe error messages
- Updated /api/auth/route.ts to issue JWT tokens on login, set HTTP-only cookies
- Added rate limiting on login attempts (5 attempts / 15 minutes)
- Updated all 27 API route files with authentication and authorization:
  - schools: school:read/create/update permissions, SUPER_ADMIN_GLOBAL only for create/update/delete
  - students: students:read/create/update/delete with school verification and parent filtering
  - users: users:read/create/update/delete, only SUPER_ADMIN_GLOBAL can assign SUPER_ADMIN_GLOBAL role
  - payments: payments:read/create/update/verify with financial field restrictions
  - grades: grades:read/create for teachers only, parent filtering
  - homework: homework:read/create for teachers, derives teacherId from session
  - communications: derives senderId/senderRole from session (prevents identity spoofing)
  - convocations: derives createdBy from session
  - discipline: uses auth user name for addedBy instead of 'System'
  - classes/subjects: requires appropriate permissions for creation
  - school-comments: PUT/DELETE requires admin role (GET/POST stay public)
  - pricing: GET public, POST/PUT SUPER_ADMIN_GLOBAL only
  - whatsapp-config: SUPER_ADMIN_GLOBAL only, API key masked in response
  - admin-analytics: SUPER_ADMIN_GLOBAL only
  - stats: requires stats:read permission, school-scoped
  - seed: disabled in production, requires SUPER_ADMIN_GLOBAL auth
- Fixed CRITICAL mass assignment in /api/schools/[id]: replaced `data: body` with explicit allowlist of 18 fields
- Fixed CRITICAL default passwords: now generates random passwords with crypto.randomBytes()
- Fixed CRITICAL school creation role: new school admins get SECRETARY, not SUPER_ADMIN_GLOBAL
- Fixed CRITICAL WhatsApp API key exposure: now masked in GET response
- Fixed CRITICAL payment verification: derives verifierName from session, not request body
- Fixed CRITICAL payment status bypass: new payments always start as PENDING
- Updated bcrypt cost factor from 10 to 12 for all password hashing
- Created client-side auth token management in /src/lib/store.ts:
  - setAuthToken/getAuthToken for token storage
  - authFetch() helper that adds Bearer token to all requests
  - Automatic 401 handling with logout redirect
- Updated page.tsx to use authFetch for all authenticated API calls
- Updated all 3 login flows to save JWT token and pass to store
- Removed auto school-year creation in grades API (security risk)
- All catch blocks now use sanitizeError() to prevent info leaks in production
- All parseInt calls replaced with safeParseInt() for input validation

Stage Summary:
- 47 security vulnerabilities identified and fixed
- JWT authentication system with HTTP-only cookies implemented
- Role-based access control (RBAC) enforced on all API endpoints
- IDOR vulnerabilities fixed: users can only access their school's data
- Parent-child relationship verification added
- Mass assignment vulnerability fixed with field allowlists
- Identity spoofing prevented in communications, convocations, homework
- API key masking implemented for WhatsApp config
- Default passwords replaced with random generation
- School creation no longer grants SUPER_ADMIN_GLOBAL
- Rate limiting added on login endpoint
- All tests pass: 200 with token, 401 without token, 403 with wrong role

---
Task ID: 4
Agent: Main Agent
Task: Add payment gateway integration API and currency conversion system

Work Log:
- Pushed security modifications to GitHub (commit 3eeb75d)
- Created Prisma models: PaymentGatewayConfig, SchoolCurrencyConfig, ExchangeRate, PaymentTransaction
- Ran db:push to sync new schema with database
- Created src/lib/exchange-rate.ts - Open source exchange rate service:
  - 3 open source APIs: Open ER API, ExchangeRate.host, Frankfurter (BCE)
  - Fallback rates for offline support
  - 10 supported currencies (USD, EUR, CDF, NGN, XOF, GHS, KES, ZAR, GBP, CAD)
  - Caching in database for 6 hours
- Created src/lib/payment-gateway.ts - Payment gateway service:
  - 8 supported gateways: DPO, Stripe, PayPal, Flutterwave, M-Pesa, Orange Money, Airtel Money, Manual
  - Each gateway has specific integration logic
  - Currency conversion on payment initiation
  - Transaction tracking with status management
- Created 8 new API routes:
  - /api/payment-gateways (GET, POST) - list catalog and configure gateways
  - /api/payment-gateways/[id] (GET, PUT, DELETE) - manage single gateway
  - /api/payment-gateways/initiate (POST) - initiate payment through gateway
  - /api/currency (GET, POST) - school currency configuration
  - /api/currency/exchange-rates (GET, POST) - fetch live rates from open source APIs
  - /api/currency/convert (POST) - convert amount between currencies
  - /api/payment-transactions (GET) - list payment transactions
  - /api/payment-transactions/[id] (GET, PUT) - manage single transaction
- Added new permissions to auth.ts: payment-gateways:manage, currency:manage, transactions:read
- Assigned permissions to SCHOOL_ADMIN, SECRETARY, CASHIER, DIRECTION roles
- Added 'payment-config' to ViewType in store.ts
- Added "Config. Paiements" menu item to SUPER_ADMIN_GLOBAL, SECRETARY, CASHIER sidebars
- Created PaymentConfigView component with 3 tabs:
  - Gateways tab: Cards for 8 payment gateways with configure/activate buttons
  - Currency tab: Base/display currency selectors, accepted currencies chips, live rates grid, currency converter
  - Transactions tab: Table of recent payment transactions with status badges
- Added RefreshCw icon import for refresh buttons
- All API keys masked in responses (show only last 4 chars)
- Fixed seed endpoint to allow initial seeding without auth (when no users exist)
- All tests pass: gateway catalog returns 8 gateways, currency config returns 10 currencies, live rates work (1 USD = 2286 CDF), gateway configuration works
- Verified with Agent Browser: Page loads, all 3 tabs work, gateway cards display, currency converter functional

Stage Summary:
- 8 payment gateways integrated (DPO, Stripe, PayPal, Flutterwave, M-Pesa, Orange Money, Airtel Money, Manual)
- 10 currencies supported with live exchange rates from 3 open source APIs
- Currency converter functional (tested: 100 USD = 228,629 CDF)
- Admins can configure gateway credentials per school
- All sensitive data (API keys, secrets) masked in responses
- Transactions tracked with full audit trail
- All routes secured with auth + RBAC + school access verification
- Changes pushed to GitHub (commit 48447a8)

---
Task ID: 5
Agent: Main Agent
Task: Fix critical bugs - parent access, grade entry, convocations filter, homework API, teacher-class linking

Work Log:
- Fixed CRITICAL bug in /src/lib/auth.ts verifyParentAccess(): was reading non-existent 'parentIds' field (plural) causing 500 errors for parents accessing student details, payments, receipts. Changed to 'parentId' (singular) matching Prisma schema. Affected endpoints: /api/students/[id], /api/payments, /api/payments/receipt/[id]
- Fixed CRITICAL bug in grade entry: frontend was sending schoolYearId:'default' (hardcoded string) which failed Prisma foreign key constraint. Updated /src/app/api/grades/route.ts POST to auto-resolve active school year from database when schoolYearId is missing or 'default'. Falls back to most recent year if no active year. Removed frontend hardcode in page.tsx line 4278. Also improved error display to show actual API error message.
- Fixed convocations API parent filtering: /src/app/api/convocations/route.ts GET was returning ALL school convocations to parents (data leak). Added where.student = { parentId: user.id } filter for PARENT role.
- Fixed homework API: /src/app/api/homework/route.ts - studentId query param was parsed but never used. Now uses it to filter by specific student's class for parents. Also added teacherId filter for TEACHER/HEAD_TEACHER roles (when no classId specified) so teachers only see their own homework by default.
- Enhanced teacher creation: /src/app/api/users/route.ts POST and PUT now link Class.headTeacherId to the user when isTitulaire is true and classNames provided. When titulaire status removed, clears headTeacherId on all classes where user was head teacher.
- Enhanced homework form: /src/app/page.tsx homework class dropdown now filters by teacher's classNames assignment (shows only classes the teacher teaches). Falls back to all classes if no classNames set. Shows "Classes assignées" hint text.
- Improved grade error handling: frontend now displays actual API error message instead of generic "Erreur lors de l'enregistrement"

Stage Summary:
- 2 CRITICAL bugs fixed (parent access 500 error, grade entry impossible)
- 2 security/data-leak bugs fixed (convocations parent filter, homework teacher filter)
- 2 enhancement features added (teacher-class linking, homework class dropdown filter)
- All API tests pass: grade creation auto-resolves schoolYearId, parent access returns 200 for own children, convocations parent filter returns only their children's records
- Browser test: login works, dashboard loads with "Bonjour Admin Global", no page errors
- Stats API returns real data: 20 students, 15 classes, 6 subjects, 60 payments, 7 discipline records
- Lint passes with 0 errors

---
Task ID: 6
Agent: main (sync session)
Task: Vérifier les mises à jour du dépôt GitHub et les installer

Work Log:
- git fetch origin → 17 nouveaux commits détectés sur origin/main (divergence: 1 local / 17 remote)
- Comparé mon commit local c51b6ed avec le commit distant b198994 — mêmes corrections de bugs (verifyParentAccess, grade entry, convocations filter, homework API, teacher-class linking)
- git reset --hard origin/main pour synchroniser proprement (HEAD maintenant à e10240b)
- Nouveaux fichiers/dépendances détectés: @whiskeysockets/baileys, pino, qrcode, whatsapp-web.js
- bun install → 253 packages installés (4 nouveaux)
- bun run db:push → schéma inchangé, DB déjà synchronisée
- bun run db:generate → Prisma Client v6.19.2 régénéré
- bun run lint → 0 erreurs (2 warnings inoffensifs sur directives eslint-disable inutilisées)
- Démarré le serveur dev (Next.js 16.1.3 Turbopack, prêt en 1107ms)
- Testé tous les endpoints API avec Bearer token (admin@edugest.app):
  * POST /api/auth → 200 (token session fichier UUID)
  * GET /api/stats → 200 (6 écoles, 20 étudiants, 19 utilisateurs)
  * GET /api/users?schoolId=... → 200
  * GET /api/classes?schoolId=... → 200
  * GET /api/students?schoolId=... → 200
  * GET /api/whatsapp-status → 200 (disconnected, server not running)
  * GET /api/discipline → 200
  * GET /api/convocations → 200
  * GET /api/homework → 200
  * GET /api/communications → 200
  * GET /api/subjects → 200
  * GET /api/payments → 200
- BUG TROUVÉ: GET /api/grades crashait avec PrismaClientValidationError — le filtre `where.schoolId` était appliqué mais le modèle Grade n'a PAS de champ schoolId
- BUG TROUVÉ: POST /api/upload retournait 500 générique quand le corps n'était pas multipart/form-data (request.formData() lance une exception avant la vérification if(!file))
- CORRIGÉ /api/grades: filtre maintenant via `where.class = { schoolId }` (jointure imbriquée Prisma)
- CORRIGÉ /api/upload: vérifie le content-type avant de parser, retourne 400 avec message clair
- Re-testé après fixes: /api/grades → 200 avec données réelles, /api/upload → 400 avec message friendly
- Commit 802ae03 poussé sur origin/main

Stage Summary:
- Dépôt synchronisé: 17 commits distants intégrés (HEAD: e10240b → 802ae03)
- Architecture auth changée par remote: JWT (jose) remplacé par sessions fichier (crypto.randomUUID + .sessions/<token>.json). Le frontend stocke le token dans localStorage et l'envoie via header Authorization: Bearer. Le cookie edugest_token n'est plus lu par requireAuth.
- 2 bugs corrigés: crash /api/grades (filtre schoolId inexistant) et /api/upload (erreur 500 générique)
- SchoolId courant en DB: cmqkphawx0000p7tjljdkbnfr (Complexe Scolaire Lumière)
- Admin: admin@edugest.app / admin123 (SUPER_ADMIN_GLOBAL)
- Tous les endpoints API testés fonctionnels, 0 erreur runtime dans dev.log

---
Task ID: 7
Agent: main (photo upload fix)
Task: Régler le problème de mise à jour de photo — "ça dit que la photo est mise à jour mais ça ne fait rien"

Work Log:
- Analysé 2 vidéos (Enregistrement de l'écran 2026-06-19 141245.mp4 et 141543.mp4) en extrayant les frames avec ffmpeg puis analyse VLM
- Vidéo 2 montrait un parent (Maman Nsimba) sur le dashboard qui sélectionne une photo via le file picker, mais la photo ne change pas dans l'interface
- Testé le backend: /api/upload → 200 (fichier sauvé), PUT /api/users/profile → 200 (profileImageUrl sauvegardé en DB), PUT /api/students/[id] → 200 (photoUrl sauvegardé). Le backend fonctionne correctement.
- BUG TROUVÉ: Dans ParentDashboard.tsx et ProfileView.tsx, le file input pour les photos d'enfants utilisait un seul useRef à l'intérieur d'un .map(). Avec plusieurs enfants, childPhotoInputRef.current pointait toujours vers le DERNIER input rendu. Cliquer sur la photo de l'enfant #1 ouvrait le file picker du DERNIER enfant, et la photo était sauvegardée pour le mauvais étudiant.
- CORRIGÉ ParentDashboard.tsx:
  * Déplacé le <input type=file> HORS du .map() (un seul input partagé)
  * Ajouté l'état photoTargetChildId pour tracker quel enfant a été cliqué
  * handleChildPhotoUpload lit maintenant photoTargetChildId au lieu du child.id du closure
  * Reset e.target.value='' après chaque upload pour permettre la re-sélection du même fichier
- CORRIGÉ ProfileView.tsx:
  * Même correction pour les photos d'enfants (input unique hors du map)
  * handlePhotoUpload (photo du profil parent) vérifie maintenant updateRes.ok avant d'afficher le toast de succès (avant, le toast "mis à jour" s'affichait même si le PUT échouait)
  * Reset e.target.value='' pour la photo de profil aussi
- Ajouté public/uploads/ au .gitignore et untracké les fichiers uploadés existants
- Vérifié end-to-end avec agent-browser en tant que parent 'Maman Nsimba':
  * Cliqué sur la photo de Kasongo Bakari (1er enfant) → uploadé → toast "Photo de l'enfant mise à jour!" → DB confirme photoUrl set pour Kasongo uniquement
  * Les 3 autres enfants non affectés (pas de photoUrl)
  * Photo du profil parent aussi fonctionne → DB confirme profileImageUrl sauvegardé
- Aucune erreur dans dev.log, lint passe avec 0 erreurs
- Commit 20001aa poussé sur origin/main

Stage Summary:
- Bug critique corrigé: les photos d'enfants étaient sauvegardées pour le mauvais enfant à cause d'un ref partagé dans un .map()
- La correction utilise un seul input file partagé hors du map + un state photoTargetChildId
- Vérifié visuellement et en DB que la bonne photo est associée au bon enfant
- Le toast de succès ne s'affiche plus si la sauvegarde DB échoue

---
Task ID: 8
Agent: main (whatsapp-server.js HTTP not listening)
Task: EduGest - Serveur WhatsApp (port 3001) ne répond pas à HTTP. whatsapp-server.js utilise http.createServer + whatsapp-web.js (Puppeteer/Edge). Le serveur affiche "Listening on 0.0.0.0:3001" mais le port n'écoute pas réellement (netstat vide, curl → ERR_CONNECTION_REFUSED). Le même code HTTP basique sans whatsapp-web.js fonctionne. Trouver pourquoi http.createServer() n'écoute pas et corriger.

Work Log:
- Lu whatsapp-server.js (225 lignes) et whatsapp-server.ts (143 lignes, variante Baileys déjà présente)
- Vérifié versions : whatsapp-web.js@1.34.7 → dépend de puppeteer@24.38.0 ; @whiskeysockets/baileys@6.17.16 installé ; package.json script "whatsapp" pointe déjà sur whatsapp-server.ts (Baileys)
- Confirmé que /api/whatsapp-status (Next.js) appelle http://localhost:3001/status, /start, /pair-code — contrat HTTP identique entre les deux variantes
- DIAGNOSTIC : l'ancien code appelait initClient() DANS le callback de server.listen(). client.initialize() lance Puppeteer → Edge. Sur Node.js v26, la policy par défaut --unhandled-rejections=throw termine le processus sur la PREMIÈRE rejection non catchée émise par Puppeteer/whatsapp-web.js (handshake CDP, event interne, crash Edge). Aucun handler process.on('unhandledRejection') / process.on('uncaughtException') n'était posé → le processus mourait silencieusement juste après "Listening", le port se fermait, netstat était vide, curl → ECONN_REFUSED. Un serveur HTTP basique fonctionnait car il ne déclenchait jamais Puppeteer.
- CORRIGÉ whatsapp-server.js :
  1. Handlers globaux process.on('unhandledRejection') / process.on('uncaughtException') / process.on('warning') posés en PREMIER (avant tout require lourd) — loguent au lieu de crasher
  2. initClient() DIFFÉRÉ via setImmediate() dans le callback de server.listen() : le serveur HTTP est complètement bindé et accepte les connexions AVANT que Puppeteer ne fasse quoi que ce soit. /status reste disponible même si Edge crashe
  3. try/catch autour de `new Client(...)` et gestion defensive de `client.initialize()` (Promise.resolve(initPromise).catch(...))
  4. executablePath configurable via WHATSAPP_BROWSER_PATH (défaut : Edge Windows). Permet Linux/macOS et override
  5. server.on('error') pour EADDRINUSE etc.
  6. process.on('SIGINT'/'SIGTERM'/'exit') + gracefulShutdown (logout/destroy/close propre)
  7. Heartbeat toutes les 30s (pid, port, status, lastError) pour confirmer que le processus est vivant dans les logs
  8. Ajouté client.on('change_state'), 'loading_screen', 'error' pour diagnostic
  9. readJsonBody() helper avec limite de taille (64KB pair-code, 1MB send) — protège contre body infinis
  10. Filet try/catch global dans le handler HTTP : une erreur inattendue ne fait JAMAIS planter le serveur
  11. /status retourne maintenant aussi `error` (lastError) pour diagnostic côté Next.js
  12. /start relance initClient() si client===null (permet retry après crash Puppeteer sans redémarrer le processus)
  13. /logout appelle destroy() en plus de logout() et reset clientInitStarted
- Tous les endpoints existants (/status, /qr-page, /pair-code, /start, /send, /logout) conservés à l'identique pour le contrat Next.js
- TEST (sur sandbox Linux, sans Edge) : WHATSAPP_PORT=3099 WHATSAPP_BROWSER_PATH=/nonexistent/edge node whatsapp-server.js
  * node --check → syntaxe valide
  * Puppeteer lance → échoue "Browser was not found at the configured executablePath" → erreur catchée et logguée avec stack trace
  * kill -0 $PID → process VIVANT (l'ancien code serait mort)
  * curl /status → 200 {"status":"disconnected","qr":null,"error":"Init error: Browser was not found..."} (pas de ECONN_REFUSED)
  * curl -X POST /start → 200 + retry initClient
  * netstat → LISTEN 0.0.0.0:3099 confirmé (l'ancien code n'aurait rien eu)
- Recommandation ajoutée en commentaire en tête de fichier : pour la prod, préférer `npm run whatsapp` (whatsapp-server.ts / Baileys, sans Puppeteer, plus robuste sur Node 26)

Stage Summary:
- Root cause : absence de handlers process.on('unhandledRejection'/'uncaughtException') + initClient() appelé dans le callback de server.listen() → sur Node 26 la 1ère rejection Puppeteer tuait le processus silencieusement juste après "Listening"
- Correction : handlers globaux + initClient() différé via setImmediate + try/catch defensifs + executablePath configurable + heartbeat + logging exit/SIGINT
- Le serveur HTTP reste maintenant debout MÊME si Puppeteer/Edge crash — /status répond toujours { status, qr, error }
- Testé : process reste vivant, port écoute, /status + /start répondent en JSON malgré l'échec Puppeteer
- Le contrat HTTP avec /api/whatsapp-status (Next.js) est préservé
- Commit à suivre

---
Task ID: 9
Agent: main (security: gear icon + profile features)
Task: Faille de sécurité: quand on clique sur "Paramètres" (icône engrenage) dans TOUS les comptes non-admin, ça mène aux "Paramètres de l'école" (réservé admin) au lieu du profil personnel. + Ajouter: changement de mot de passe, changement de numéro, liste des appareils connectés (pour déconnecter ou laisser).

Work Log:
- Analysé la capture d'écran (pasted_image_1781884326251.png) avec VLM: compte Enseignant "Prof. Mwepu Kashala" clique sur l'icône engrenage → arrive sur "Paramètres de l'école" (formulaire réservé admin avec nom école, abréviation, type, catégorie). FAILLE DE SÉCURITÉ.
- Exploration complète du code (Task 9-explore): confirmé que page.tsx ligne 2207 avait `onClick={() => setCurrentView('settings')}` hardcoded pour TOUS les rôles. SettingsView n'avait AUCUNE garde de rôle. Le backend PUT /api/schools/[id] retournait 403 pour les non-admin mais le formulaire était quand même affiché.

- BACKEND — src/lib/auth.ts (session v2 + énumération/révocation):
  * Étendu la shape du fichier session: {sid, userId, expiresAt, createdAt, lastUsedAt, userAgent, ip} (avant: juste {userId, expiresAt})
  * normalizeSession() lit les fichiers legacy v1 transparentement (champs manquants → ''/0)
  * createSession(userId, meta?) accepte {userAgent, ip} et génère un sid (crypto.randomUUID) séparé du token d'auth
  * validateSession() rafraîchit lastUsedAt de façon throttled (5 min) pour éviter une écriture disque à chaque requête
  * Ajouté listUserSessions(userId, currentToken?) — scanne .sessions/**, retourne [{sid, createdAt, lastUsedAt, expiresAt, userAgent, ip, isCurrent}] trié par lastUsedAt desc, nettoie les sessions expirées au passage
  * Ajouté revokeSessionByToken(token) — supprime le fichier (pour /api/auth/logout)
  * Ajouté revokeSessionBySid(userId, sid) — supprime par sid public (le token d'auth ne quitte jamais le serveur)
  * Ajouté revokeAllUserSessionsExcept(userId, exceptToken) — pour changement de mot de passe (force re-login autres appareils)
  * Ajouté getTokenFromRequest(), getClientIp() (x-forwarded-for/x-real-ip/cf-connecting-ip), getUserAgentFromRequest()
  * createToken() accepte maintenant un 2e paramètre meta propagé à createSession

- BACKEND — src/app/api/auth/route.ts: createToken() appelé avec {userAgent, ip} capturés du header de la requête
- BACKEND — src/app/api/auth/whatsapp/route.ts: createSession() appelé avec {userAgent, ip} aussi

- BACKEND — NOUVEAU src/app/api/auth/change-password/route.ts (POST):
  * Body: {currentPassword, newPassword}
  * Rate limit 5 tentatives/15 min par user (protection brute-force sur le mot de passe actuel)
  * Validation: newPassword 6-128 caractères, différent du current
  * bcrypt.compare(currentPassword, stored) puis bcrypt.hash(newPassword, 12) (même cost que le reste du code)
  * Après succès: revokeAllUserSessionsExcept(currentToken) → force re-login sur les autres appareils
  * Retourne {revokedSessions: count}

- BACKEND — NOUVEAU src/app/api/auth/logout/route.ts (POST):
  * revokeSessionByToken(currentToken) supprime le fichier session immédiatement
  * Clear cookie edugest_token (maxAge=0)
  * Avant: le fichier session restait 24h sur disque jusqu'à expiration naturelle

- BACKEND — NOUVEAU src/app/api/sessions/route.ts (GET): liste les sessions de l'user courant avec isCurrent flag
- BACKEND — NOUVEAU src/app/api/sessions/revoke/route.ts (POST {sid}): révoque une session par son sid public. Refuse de révoquer la session courante (400) pour éviter l'auto-lockout
- BACKEND — NOUVEAU src/app/api/sessions/revoke-all/route.ts (POST): révoque toutes les sessions sauf la courante. Retourne {revoked: count}

- BACKEND — src/app/api/users/profile/route.ts PUT étendu: accepte maintenant `phone` en plus de `name`/`profileImageUrl`. Validation format (7-15 chiffres), vérification unicité (excluant self, retour 409 si pris)

- FRONTEND — src/app/page.tsx ligne 2207: `onClick={() => setCurrentView('settings')}` → `onClick={() => setCurrentView('profile')}`. L'icône engrenage mène maintenant au profil personnel pour TOUS les rôles. Les admins ont un lien "Paramètres de l'école" dans leur profil pour accéder aux réglages école.

- FRONTEND — src/components/views/SettingsView.tsx: ajouté garde de rôle defense-in-depth. Split en SettingsView (wrapper avec garde) + SettingsViewInner (tout le contenu). Si userRole n'est pas SUPER_ADMIN_GLOBAL/SECRETARY → affiche "Accès restreint" avec bouton "Aller à mon profil". Même si un non-admin arrive sur cette vue par un moyen quelconque (stale state, dev tools), il ne voit pas le formulaire.

- FRONTEND — src/components/views/ProfileView.tsx réécrit complètement:
  * Section profil (photo + nom) — existant, conservé
  * NOUVEAU: lien "Paramètres de l'école" visible uniquement pour SUPER_ADMIN_GLOBAL/SECRETARY (canManageSchool) → navigue vers settings
  * NOUVEAU section "Numéro de téléphone": input + bouton "Mettre à jour" → PUT /api/users/profile {phone}
  * NOUVEAU section "Mot de passe": 3 champs (actuel, nouveau, confirmer) + checkbox "Afficher" + bouton "Changer le mot de passe" → POST /api/auth/change-password. Après succès: refresh de la liste sessions
  * NOUVEAU section "Appareils connectés": liste les sessions avec icône (Smartphone/Monitor selon UA), browser+OS parsés depuis userAgent, IP, lastUsedAt relatif, badge "CET APPAREIL" pour la session courante. Bouton "Déconnecter" par appareil (sauf courant). Bouton "Tout déconnecter (N)" si >1 session. Scrollable (max-h-96)
  * Helpers: parseUserAgent() (détecte Edge/Chrome/Firefox/Safari/Opera + Windows/macOS/Android/iOS/Linux + mobile/desktop), formatRelativeTime(), formatDateTime()
  * Sections enfants (PARENT only) — existant, conservé

- FRONTEND — src/lib/store.ts logout(): avant de cleaner le state local, appelle fetch('/api/auth/logout') en best-effort (non-await) pour révoquer la session côté serveur. Le token ne peut plus être réutilisé après déconnexion.

- TESTS BACKEND (curl, serveur dev):
  * GET /api/sessions → 200, retourne sessions avec userAgent/ip/isCurrent (sessions legacy v1 lues sans crash)
  * POST /api/auth/change-password mauvais current → 401 "Le mot de passe actuel est incorrect"
  * POST /api/auth/change-password new==current → 400 "Le nouveau mot de passe doit être différent"
  * POST /api/auth/change-password valide → 200, autres sessions révoquées
  * PUT /api/users/profile {phone} valide → 200 "Profil mis à jour"
  * PUT /api/users/profile phone dupliqué → 409 "déjà utilisé"
  * POST /api/auth/logout → 200, token révoqué
  * GET /api/sessions avec token révoqué → 401
  * POST /api/sessions/revoke {sid} → 200 "Appareil déconnecté", la session révoquée → 401
  * POST /api/sessions/revoke sur session courante → 400 (empêche auto-lockout)
  * POST /api/sessions/revoke-all → 200 {revoked: N}, seule la session courante reste

- TESTS FRONTEND (agent-browser, login teacher mwepu@lumiere.cd):
  * Login teacher → dashboard "Bonjour Prof. Mwepu Kashala" ✓
  * Clic engrenage (title="Mon profil") → arrive sur "Mon profil" (PAS "Paramètres de l'école") ✓ SÉCURITÉ RÉGLÉE
  * Page profile contient: "Mon profil", "Numéro de téléphone", "Mot de passe" (3 champs), "Appareils connectés", "CET APPAREIL" badge ✓
  * Changement mot de passe: rempli formulaire → soumis → login avec nouveau mot de passe réussit ✓ (vérifié end-to-end)
  * Test admin (admin@edugest.app): clic engrenage → profile → lien "Paramètres de l'école" visible ✓ → clic → arrive sur "Paramètres de l'école" (Informations générales) ✓
  * VLM confirme les captures d'écran

- Lint: 0 errors, 2 warnings pré-existantes (sans rapport)
- Aucune erreur runtime dans dev.log

Stage Summary:
- Faille de sécurité corrigée: l'icône engrenage mène au profil personnel pour tous les rôles (plus aux paramètres école). Garde defense-in-depth ajoutée dans SettingsView.
- 5 nouveaux endpoints API: /api/auth/change-password, /api/auth/logout, /api/sessions (GET), /api/sessions/revoke (POST), /api/sessions/revoke-all (POST)
- PUT /api/users/profile étendu pour accepter phone (avec validation + unicité)
- Session shape v2: {sid, userId, expiresAt, createdAt, lastUsedAt, userAgent, ip} — compatible legacy
- ProfileView réécrit avec 3 nouvelles sections: téléphone, mot de passe, appareils connectés
- logout() révoque maintenant la session côté serveur (le fichier session disparaît immédiatement)
- Changement de mot de passe révoque automatiquement les autres sessions (force re-login autres appareils)
- Commit à suivre
