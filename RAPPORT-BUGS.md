# Rapport de bugs — EduGest

**Date** : 10/10/2026
**Périmètre** : application Next.js 16 (App Router) — 161 routes API, `src/app/page.tsx` (10 218 lignes), ~50 vues, libs métier, schéma Prisma, mini-services (WhatsApp, planificateur), service worker.
**Méthode** : audit statique (lecture de code) + `tsc --noEmit` + ESLint (React Compiler / `rules-of-hooks`) + recoupement avec `RAPPORT-QA.txt` et `RAPPORT-SECURITE-CORRECTIONS.md`.
**Contrat de lecture** : chaque bug listé est **confirmé par lecture du code** (fichier:ligne cités ci-dessous). Les pistes non prouvées sont isolées en §7.

> ✅ **État au 10/10/2026 — corrections appliquées** : 6/6 CRITIQUE, 19/20 ÉLEVÉ, 19/35 MOYEN sur 47 fichiers. Détail, changements de comportement et reste à faire : [`CORRECTIONS.md`](CORRECTIONS.md).
> **Vérifié en exécution** : `next build` **exit 0** (161 routes), suite de sécurité du projet **31/31**, smoke test navigateur **6/6 vues** sans erreur de hooks, `tsc` 0 erreur dans `src/`, ESLint 71 → 20 messages (0 `rules-of-hooks`).

---

## Synthèse — les 8 corrections à faire en premier

| # | Bug | Fichier | Impact |
|---|-----|---------|--------|
| 1 | Paiement en ligne crédité **sans conversion de devise** | [`api/payments/webhook/route.ts:220`](src/app/api/payments/webhook/route.ts#L220) | Dette de 100 CDF soldée pour 100 USD |
| 2 | Webhook **rejoué = double crédit** (paiement partiel) | [`api/payments/webhook/route.ts:160`](src/app/api/payments/webhook/route.ts#L160) | PAID avec la moitié de l'argent |
| 3 | **Paywall sans expiration** : `requireFeature` ignore statut et date de fin | [`lib/feature-gate.ts:25`](src/lib/feature-gate.ts#L25) | Une école expirée garde tout le forfait payant |
| 4 | **Renouvellement gratuit à vie** : la demande `PAID` n'est jamais consommée | [`api/payments/subscription/renew/route.ts:57`](src/app/api/payments/subscription/renew/route.ts#L57) | 1 paiement → renouvellements illimités + fausses recettes |
| 5 | Un **QR d'école** suffit à s'approprier un élève non rattaché | [`api/public/parent-register/route.ts:96-158`](src/app/api/public/parent-register/route.ts#L96) | Données d'un mineur livrées à un inconnu |
| 6 | **Passkey M-Pesa** renvoyé en clair à tout compte de l'école | [`api/payment-gateways/route.ts:42`](src/app/api/payment-gateways/route.ts#L42) | Fuite d'un secret opérateur (forge de STK Push) |
| 7 | Login **WhatsApp** : aucune session posée + jeton renvoyé dans le JSON | [`api/auth/whatsapp/route.ts:159`](src/app/api/auth/whatsapp/route.ts#L159) | Connexion impossible (401 en boucle) + jeton exposé |
| 8 | Le formulaire de caisse enregistre un montant USD/EUR **comme du CDF** si le taux manque | [`components/views/PaymentsView.tsx:274`](src/components/views/PaymentsView.tsx#L274) | 100 USD enregistrés 100 CDF (facteur ≈ 2 800) |

---

## 1. CRITIQUE

### BUG-1 — Un paiement en ligne est crédité sans conversion de devise
[`src/app/api/payments/webhook/route.ts:220`](src/app/api/payments/webhook/route.ts#L220) · [`src/lib/payment-gateway.ts:241-244`](src/lib/payment-gateway.ts#L241)

```ts
// payment-gateway.ts — le montant converti EST calculé et stocké…
amount: request.amount,        // 241 — monnaie d'origine (KES, USD…)
currency: request.currency,    // 242
convertedAmount,               // 243 — montant en monnaie de base de l'école
baseCurrency,                  // 244
// webhook — … puis JAMAIS relu :
const incoming = event.amount != null ? Number(event.amount) : Number(transaction.amount)
const newPaid = alreadyPaid + incoming     // 222 — crédité dans paidAmount (exprimé en base)
```
Le contrôle de devise (ligne 177) ne s'exécute que **si la passerelle renvoie un champ devise** ; un callback STK M-Pesa n'en envoie pas (`parseEvent`, ligne 68 : `currency: payload.Currency || null`).
**Impact** : école en CDF, un parent paie 100 USD (≈ 250 000 CDF) → `paidAmount += 100` → la dette de 100 CDF passe **PAID**. En sens inverse, l'école en CDF crédite 500 KES comme 500 CDF.
**Correctif** : `const incoming = Number(transaction.convertedAmount ?? event.amount ?? transaction.amount)`.

### BUG-2 — Un webhook rejoué crédite deux fois et solde la dette à tort
[`src/app/api/payments/webhook/route.ts:160`](src/app/api/payments/webhook/route.ts#L160), [`226-232`](src/app/api/payments/webhook/route.ts#L226), [`247-257`](src/app/api/payments/webhook/route.ts#L247)

La garde d'idempotence ne couvre que `transaction.status === 'SUCCESS'`. Or le chemin « sous-paiement » laisse la transaction en `AMOUNT_MISMATCH` (ligne 231) et l'enregistrement en `PARTIAL` :
```ts
226  if (!isFull && alreadyPaid < EPSILON) {                        // 1er versement incomplet
231    db.paymentTransaction.update({ … status: 'AMOUNT_MISMATCH' })
232    db.paymentRecord.update({ … paidAmount: Math.round(newPaid) }) // crédité 1×
```
Au rejeu (M-Pesa rejoue les callbacks non acquittés) : statut ≠ SUCCESS, record ≠ PAID, `alreadyPaid > 0` → retour au cumul (ligne 220) → **crédité 2×**.
**Impact** : dû 2 000, versement 1 000 → rejeu → `PAID` avec 1 000 réellement encaissés + double notification parent.
**Correctif** : idempotence par `gatewayTransactionId` (marqueur « déjà traité ») indépendante du statut.

### BUG-3 — Paywall sans expiration : `requireFeature` ne vérifie ni statut ni date de fin
[`src/lib/feature-gate.ts:25`](src/lib/feature-gate.ts#L25) · [`src/lib/subscription-server.ts:108-114`](src/lib/subscription-server.ts#L108)

```ts
// feature-gate.ts
25  const tier = await getSchoolTier(user.schoolId || '');
26  if (!hasFeatureAccess(tier, feature)) { … 403 }
// subscription-server.ts — getSchoolTier ne lit QUE le forfait
111   select: { subscriptionTier: true },
```
La logique d'expiration existe (`checkSubscription`, [`subscription-server.ts:24-70`](src/lib/subscription-server.ts#L24)) mais n'est consommée que par `requireActiveSubscription` ([`auth.ts:834`](src/lib/auth.ts#L834)), utilisée sur 7 routes de **création** (students, classes, grades, homework, discipline, convocations, communications). Aucun `middleware.ts`.
**Impact** : une école PREMIUM (500 $/mois) non renouvelée conserve à vie bulletins, communications, convocations, devoirs, discipline, comptes parents, module médical et API WhatsApp perso (envois illimités).
**Correctif** : dans `requireFeature`, appeler `checkSubscription(schoolId)` et refuser si `!active`.

### BUG-4 — Renouvellement d'abonnement gratuit à vie
[`src/app/api/payments/subscription/renew/route.ts:57-71`](src/app/api/payments/subscription/renew/route.ts#L57)

```ts
57  const paidRequest = await db.subscriptionRequest.findFirst({
58    where: { schoolId: user.schoolId, requestedTier: tier, status: 'PAID' },
65  if (!paidRequest) { return 403 }
```
La demande n'est **jamais consommée** : la suite ne fait qu'écrire `subscriptionEndDate = +1 mois` (l.79-87), créer un `PaymentRecord` `status:'PAID', paidAmount: price*100` (l.91-104, donc de **fausses recettes**) et un log d'audit.
**Impact** : l'école paie une fois, puis appelle `POST { tier }` chaque mois → forfait conservé et recettes fictives enregistrées.
**Correctif** : consommer la preuve atomiquement (`updateMany({ where: { id, status: 'PAID' }, data: { status: 'CONSUMED' } })` et exiger `count === 1`).

### BUG-5 — Un QR d'école suffit à s'approprier le dossier d'un élève non rattaché
[`src/app/api/public/parent-register/route.ts:96-158`](src/app/api/public/parent-register/route.ts#L96) · [`src/app/api/public/find-child/route.ts:57-83`](src/app/api/public/find-child/route.ts#L57)

```ts
96   const qr = await db.schoolQrCode.findUnique({ where: { token } });   // seule barrière
…
141  const created = await tx.user.create({ data: { name, phone, password: hashed, role: 'PARENT', schoolId: qr.schoolId, … } });
155  const linked = await tx.student.updateMany({ where: { id: { in: studentIds }, parentId: null }, data: { parentId: created.id } });
```
`find-child` expose la liste des classes et retrouve les élèves **par nom** (id, prénom, nom, classe) avec le même token. Aucune preuve de parenté n'est demandée : ni code envoyé au numéro enregistré par l'école, ni validation du staff. Le token circule en query string (`?token=…`) — il est photographiable sur une affiche d'école.
**Impact** : une personne non parente crée un compte PARENT et s'attribue n'importe quel élève encore non rattaché (notes, paiements, discipline, convocations, données d'un mineur) ; l'opération est irréversible (`parentId` non nul bloque toute autre revendication).
**Mitigations déjà présentes** (à conserver) : QR actif et non expiré, élève de la bonne école, non archivé, un enfant = un seul compte parent, transaction atomique, unicité du téléphone.
**Correctif** : exiger une preuve de parenté (OTP sur le numéro enregistré par l'école, ou approbation du staff) avant la liaison.

### BUG-6 — IDOR : la configuration financière de n'importe quelle école est lisible
[`src/app/api/school-currency/route.ts:8-20`](src/app/api/school-currency/route.ts#L8)

```ts
8   const authResult = await requirePermission(request, 'school:read');
12  const schoolId = searchParams.get('schoolId') || '';   // ← aucune vérification
18  const config = await db.schoolCurrencyConfig.findUnique({ where: { schoolId } });
```
Déjà signalé (P1) dans `RAPPORT-QA.txt` : **toujours ouvert**. Tout rôle avec `school:read` (SECRETARY, DIRECTION, CASHIER…) lit devise de base, devise d'affichage et taux manuels d'une école concurrente en changeant un paramètre d'URL.
**Correctif** : `if (!verifySchoolAccess(user, schoolId)) return 403;`.

---

## 2. ÉLEVÉ

### BUG-7 — Login WhatsApp : aucune session établie et jeton renvoyé en clair
[`src/app/api/auth/whatsapp/route.ts:147-159`](src/app/api/auth/whatsapp/route.ts#L147) · [`src/app/page.tsx:2432-2464`](src/app/page.tsx#L2432)

```ts
147  const sessionToken = await createSession(user.id, { … });
159  return NextResponse.json({ data: { ...userData, token: sessionToken, school } });
```
Ce fichier n'utilise **jamais** `cookies` (vérifié : aucune occurrence), contrairement à `auth/route.ts:359` et `auth/google/callback:105` qui posent le cookie httpOnly. Côté client, `page.tsx:2438-2464` consomme `json.data`, appelle `login(role, …)` et **ignore `apiUser.token`** ; `authFetch` n'envoie aucun en-tête `Authorization` (choix documenté dans [`store.ts:33-58`](src/lib/store.ts#L33)).
**Impact** : l'utilisateur se voit connecté mais toutes les requêtes suivantes sont 401 → `authFetch` déclenche `auth:unauthorized` → retour à l'écran de connexion. Le flux « connexion par WhatsApp » est inopérant, et le jeton de session transite en JSON (contraire au choix « jamais exposé au navigateur »).
**Aggravants** : codes OTP dans une `Map` en mémoire (perdus entre isolates) et comparaison `stored.code !== code.trim()` non constante (l.128).
**Correctif** : poser le cookie httpOnly comme `/api/auth` et ne jamais renvoyer le token.

### BUG-8 — Aucun scoping de cycle pour les rôles `DISCIPLINE_*`
[`src/app/api/discipline/route.ts:141-152`](src/app/api/discipline/route.ts#L141) (GET) et [`222-240`](src/app/api/discipline/route.ts#L222) (POST)

```ts
141  const where: Record<string, unknown> = {};
143  if (schoolId) where.schoolId = schoolId;
150  if (user.role === 'PARENT') { where.student = { parentId: user.id }; }
…
230  if (targetStudent.schoolId !== schoolId) { return 403 }   // école seulement
```
`getRoleCycle` / `classMatchesCycle` ne sont **pas importés** dans ce fichier, alors qu'ils sont appliqués dans `classes`, `students`, `attendance`, `homework`, `subjects`, `convocations` (POST), `stats`, `reports`.
**Impact** : un `DISCIPLINE_PRIMAIRE` lit les sanctions de **tous les cycles** et peut créer/modifier une sanction pour un élève du secondaire, avec notification WhatsApp aux parents — exactement le comportement que [`auth.ts:296-301`](src/lib/auth.ts#L296) déclare corrigé.
**Correctif** : appliquer `classMatchesCycle(student.class.section, student.class.name, getRoleCycle(user.role))` au GET comme au POST/PUT.

### BUG-9 — Passkey M-Pesa renvoyé en clair à tout membre de l'école, stocké non chiffré
[`src/app/api/payment-gateways/route.ts:42`](src/app/api/payment-gateways/route.ts#L42) (idem `[id]/route.ts:33`, `platform-payment-gateways/route.ts:32`)

```ts
40   apiKey: maskSensitive(config.apiKey),
41   secretKey: maskSensitive(config.secretKey),
42   publicKey: config.publicKey || null,      // ← non masqué
```
Or `publicKey` **est** le passkey Lipa Na M-Pesa :
```ts
// payment-gateway.ts
392  if (!config.publicKey) missing.push('Passkey (Lipa Na M-Pesa)');
441  Password: Buffer.from(`${config.merchantId}${config.publicKey}${timestamp}`).toString('base64'),
```
Le GET n'exige que `requireAuth` + appartenance à l'école (l.61-81) : un **PARENT** ou un TEACHER de l'école reçoit le passkey **et** le `merchantId` (ShortCode).
**Impact** : fuite d'un secret opérateur permettant de forger un STK Push sur le shortcode de l'école.
**Correctif** : chiffrer `publicKey` à l'écriture (`encryptSecret`) et le masquer en sortie.

### BUG-10 — Un caissier peut marquer une transaction SUCCESS sans encaissement
[`src/app/api/payment-transactions/[id]/route.ts:96`](src/app/api/payment-transactions/[id]/route.ts#L96), [`127-142`](src/app/api/payment-transactions/[id]/route.ts#L127)

```ts
96   const authResult = await requirePermission(request, 'payments:verify');  // accordé au CASHIER
127  if (status !== undefined) { if (!VALID_STATUSES.includes(status)) …; updateData.status = status; }
139  if (status === 'SUCCESS' && existing.status !== 'SUCCESS') updateData.completedAt = new Date();
```
`syncFromGateway` (l.153-155) appelle `checkTransactionStatus`, qui ne fait qu'un `findUnique` **local** ([`payment-gateway.ts:934-947`](src/lib/payment-gateway.ts#L934)) : la passerelle n'est jamais interrogée. Sur STANDARD+, `payments:verify` n'est pas retiré ([`auth.ts:589-606`](src/lib/auth.ts#L589)).
**Impact** : un caissier fabrique une transaction SUCCESS — y compris un paiement d'abonnement — sans argent reçu ; combiné à BUG-4, cela alimente la chaîne « faux succès → demande PAID → renouvellement gratuit ».
**Correctif** : interdire le passage manuel à SUCCESS (ou exiger une confirmation réelle de la passerelle), réserver la transition au SUPER_ADMIN_GLOBAL.

### BUG-11 — Le quota WhatsApp n'est vérifié que dans les helpers de notification
Définition : [`src/lib/whatsapp-usage.ts:98`](src/lib/whatsapp-usage.ts#L98) · appel **unique** : [`src/lib/whatsapp-agent.ts:339`](src/lib/whatsapp-agent.ts#L339)

Appelants directs de `sendWhatsAppMessage`/`sendWhatsAppDocument` **sans contrôle de quota** :
- [`src/lib/report-scheduler.ts:130,133`](src/lib/report-scheduler.ts#L130) (rapports planifiés)
- [`src/lib/cashier-schedule.ts:92,95`](src/lib/cashier-schedule.ts#L92) (rapport de caisse automatique)
- [`src/app/api/bulletins/[studentId]/whatsapp/route.ts:123`](src/app/api/bulletins/[studentId]/whatsapp/route.ts#L123) (bulletins aux parents)
- [`src/lib/subscription-requests.ts:137`](src/lib/subscription-requests.ts#L137)
**Impact** : une école FREEMIUM (`whatsappMonthly: 0`) ou ayant épuisé son quota envoie messages et documents illimités → le différenciateur payant (500 → 5 000 messages/mois) n'a aucune valeur.
**Correctif** : appeler `checkWhatsappQuota(schoolId)` dans `sendWhatsAppMessage`/`sendWhatsAppDocument` eux-mêmes.

### BUG-12 — Bulletins officiels (STANDARD+) produits et envoyés sans contrôle de forfait
[`src/app/api/bulletins/[studentId]/whatsapp/route.ts:28-58`](src/app/api/bulletins/[studentId]/whatsapp/route.ts#L28)

La route n'applique que `requireAuth` + rôles staff, alors que son jumeau GET le fait ([`bulletins/[studentId]/route.ts:35-43`](src/app/api/bulletins/[studentId]/route.ts#L35) : `hasFeatureAccess(tier,'report_cards')`).
**Impact** : une école ESSENTIEL (100 $) obtient le bulletin officiel réservé à STANDARD (250 $) et l'envoie aux parents sans quota (BUG-11).
**Correctif** : `requireFeature(request, 'report_cards')` en tête du POST.

### BUG-13 — Le webhook école marque SUCCESS sur sous-paiement : blocs de contrôle vides (code mort)
[`src/app/api/payments/webhook/route.ts:167-176`](src/app/api/payments/webhook/route.ts#L167)

```ts
171  if (Math.abs(Number(event.amount) - expectedAmount) >= EPSILON && Number(event.amount) < expectedAmount - EPSILON) {
172    // Sous-paiement : géré en PARTIAL plus bas si rattaché, sinon AMOUNT_MISMATCH.
173  } else if (…) {
174    // Sur-paiement : accepté (PAID), écart tracé en audit.
175  }
```
Aucun `return`, aucune écriture : l'exécution continue vers l.195-203 qui écrit `status: 'SUCCESS'`. Le garde-fou PARTIAL ne s'applique qu'aux transactions **avec** `paymentRecordId` (l.206) — une transaction d'abonnement (sans `paymentRecordId`) devient donc SUCCESS avec `Amount: 1`.
**Impact** : transaction archivée SUCCESS sans encaissement, réutilisable comme « preuve » par la chaîne abonnement (BUG-4/BUG-14).
**Correctif** : remplacer les blocs vides par `AMOUNT_MISMATCH` + audit + réponse 422.

### BUG-14 — Webhook abonnement : montant comparé sans devise ni vérification d'école
[`src/app/api/payments/webhook/subscription/route.ts:94-105`](src/app/api/payments/webhook/subscription/route.ts#L94)

```ts
const price = SUBSCRIPTION_PRICES[subRequest.requestedTier] ?? null;
if (price !== null && price > 0 && Number(transaction.amount) + 0.01 < price) { … 422 }
```
Aucun test de `transaction.currency` (contraste avec [`payments/webhook/route.ts:177`](src/app/api/payments/webhook/route.ts#L177)) ni de `transaction.schoolId === subRequest.schoolId`. `initiate-subscription` fixe `currency = platformConfig.currency || 'USD'` (l.65).
**Impact** : passerelle plateforme configurée en CDF (configuration naturelle en RDC) → 500 CDF (≈ 0,18 $) valident la formule « 500 $ ».
**Correctif** : convertir dans la devise du prix et exiger l'égalité des `schoolId`.

### BUG-15 — Le formulaire de caisse enregistre un montant USD/EUR comme s'il était en CDF
[`src/components/views/PaymentsView.tsx:274-277`](src/components/views/PaymentsView.tsx#L274)

```ts
274  let paidAmountInBase = parseInt(paidAmount || '0')
275  if (payCurrency !== 'CDF' && exchangeRate && paidAmount) {
276    paidAmountInBase = Math.round(parseFloat(paidAmount) * exchangeRate)
277  }
```
Si le taux n'a pas pu être chargé (`exchangeRate === null` : `/api/exchange-rate` en échec, ou app desktop hors-ligne), la conversion est **silencieusement ignorée** et le bouton reste actif (`disabled={submitting || allPaid}`, l.428). L'encart de conversion est simplement masqué (l.406) : rien n'indique l'absence de taux.
**Impact** : 100 USD saisis → 100 CDF enregistrés (facteur ≈ 2 800), solde et reçu faux.
**Correctif** : bloquer la soumission (ou forcer CDF) tant que le taux est absent pour une devise non-base.

### BUG-16 — Violations des règles des hooks React : écran blanc quand le forfait change
[`src/components/views/GradesView.tsx:40`](src/components/views/GradesView.tsx#L40) · [`PaymentsView.tsx:264`](src/components/views/PaymentsView.tsx#L264) · [`src/app/page.tsx:7476`](src/app/page.tsx#L7476) · [`src/app/page.tsx:9004`](src/app/page.tsx#L9004)

```tsx
// GradesView.tsx
40   if (!hasAccess || parentBlocked) return null;   // ← sortie AVANT les hooks
41   const highlightedRef = useRef<HTMLTableRowElement>(null)
47   const [grades, setGrades] = useState<GradeData[]>([])   // … puis ~30 hooks
```
ESLint (React Compiler) remonte **51 erreurs `react-hooks/rules-of-hooks`** sur ces 4 emplacements. `hasAccess`/`parentBlocked` dépendent de `userData.subscriptionTier`, **mis à jour en cours de session** par la resynchronisation du profil ([`page.tsx:10078-10093`](src/app/page.tsx#L10078) → `setUserData`) et par le rattrapage de tier manquant ([`:10058-10068`](src/app/page.tsx#L10058)).
**Impact** : dès que le forfait change pendant que la vue est montée (downgrade, fin d'abonnement, session localStorage périmée), React lève « Rendered fewer/more hooks than during the previous render » ; l'application n'a **aucun error boundary** (`grep ErrorBoundary` → 0 résultat) → écran blanc.
**Correctif** : déplacer la garde sous tous les hooks — motif déjà documenté dans [`DisciplineView.tsx:396-399`](src/components/views/DisciplineView.tsx#L396).

### BUG-17 — Les frais scolaires sont inaccessibles au SCHOOL_ADMIN (permission inexistante)
[`src/app/api/school-fees/route.ts:44`](src/app/api/school-fees/route.ts#L44) · [`school-fees/[id]/route.ts:14,51`](src/app/api/school-fees/[id]/route.ts#L14) · [`src/lib/auth.ts:384-410`](src/lib/auth.ts#L384)

```ts
44  const authResult = await requirePermission(request, 'school:update');
```
`'school:update'` n'apparaît **jamais** dans les permissions de base : seulement dans les listes de retrait (`ESSENTIEL_DENIED`, `FREEMIUM_DENIED`) et dans le bonus qui l'ajoute aux `DIRECTION_*` d'une école FREEMIUM ([`auth.ts:621-625`](src/lib/auth.ts#L621)). La liste `SCHOOL_ADMIN` ([`auth.ts:384-410`](src/lib/auth.ts#L384)) ne le contient pas.
**Impact** : le SCHOOL_ADMIN (la persona principale) reçoit **403** sur POST/PUT/DELETE des frais scolaires, alors que l'UI l'expose ([`SettingsView.tsx:1270-1272`](src/components/views/SettingsView.tsx#L1270), [`page.tsx:5726`](src/app/page.tsx#L5726)) : la configuration « Frais scolaires » est inutilisable sauf pour le SAG et les `DIRECTION_*` d'école FREEMIUM.
**Correctif** : créer une permission dédiée (`school-fees:manage`) et l'attribuer aux rôles concernés.

### BUG-18 — Recherche d'élève par nom sans `schoolId` dans la prise de paiement : fuite inter-écoles
[`src/app/api/payments/route.ts:129-152`](src/app/api/payments/route.ts#L129)

```ts
129  const students = await db.student.findMany({
130    where: { OR: [ { firstName: { contains: firstName }, … } ] },   // ← pas de schoolId
137    select: { id: true, firstName: true, lastName: true, matricule: true, photoUrl: true },
…
150    suggestions: students.map(s => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, matricule: s.matricule })),
```
Le contrôle d'appartenance (`student.schoolId !== schoolId`, l.178) intervient **après** : les suggestions sortent avant tout filtrage.
**Impact** : un caissier/secrétaire de l'école A obtient les id, noms et matricules d'élèves d'autres écoles (identité de mineurs) — et dispose d'un oracle d'existence (404 « n'existe pas » vs 403 « autre école »).
**Correctif** : ajouter `schoolId` au `where` du `findMany`.

### BUG-19 — Envoi WhatsApp/SMS de confirmation de paiement jamais attendu
[`src/app/api/payments/verify/route.ts:94`](src/app/api/payments/verify/route.ts#L94) (et `:141`)

```ts
93   const { notifyPaymentApproved } = await import('@/lib/whatsapp-agent');
94   notifyPaymentApproved(parent.phone, `…`, Number(payment.amount), payment.trimester, schoolData?.name || '', payment.schoolId);
```
`notifyPaymentApproved` est `async` ([`whatsapp-agent.ts:771`](src/lib/whatsapp-agent.ts#L771)). Le dépôt utilise `pinAfter(...)` pour ce motif exact ailleurs ([`medical/documents/route.ts:167`](src/app/api/medical/documents/route.ts#L167) : « sans épingle after(), workerd abandonne la continuation »).
**Impact** : la confirmation de paiement au parent n'est pas délivrée de façon fiable, rejet non géré possible, et le compteur d'usage WhatsApp n'est pas incrémenté.
**Correctif** : `await` (ou `pinAfter`) aux deux appels.

### BUG-20 — Quota de professeurs contournable via les comptes `EPS`
[`src/lib/subscription-server.ts:99-103`](src/lib/subscription-server.ts#L99) · [`src/lib/subscription.ts:162`](src/lib/subscription.ts#L162)

```ts
99   if (TEACHER_ROLES.includes(role)) { … }
// subscription.ts
162  export const TEACHER_ROLES = ['TEACHER','HEAD_TEACHER'];
```
Or `EPS` est traité comme un professeur ailleurs ([`api/users/route.ts:285`](src/app/api/users/route.ts#L285) : matières/classes/titulaire ; [`report-data.ts:129`](src/lib/report-data.ts#L129) : `role: { in: ['TEACHER','HEAD_TEACHER','EPS'] }`) et figure dans `SCHOOL_STAFF_CREATION_ROLES` ([`auth.ts:747`](src/lib/auth.ts#L747)).
**Impact** : FREEMIUM (`maxTeachers: 0`) et ESSENTIEL (5 profs) créent un nombre illimité d'`EPS` → quota payant sans effet.
**Correctif** : `role: { in: [...TEACHER_ROLES, 'EPS'] }`.

### BUG-21 — `custom_branding` (PREMIUM) accordé à STANDARD côté API
[`src/app/api/school/design/route.ts:19`](src/app/api/school/design/route.ts#L19)

```ts
const DESIGN_ALLOWED_TIERS = ['STANDARD', 'PREMIUM', 'ENTERPRISE', 'CORPORATE'];
```
Le client exige PREMIUM ([`page.tsx:3106-3107`](src/app/page.tsx#L3106)) et `SUBSCRIPTION_FEATURES.STANDARD` ([`subscription.ts:31`](src/lib/subscription.ts#L31)) ne contient pas `custom_branding`.
**Impact** : une école STANDARD (250 $) appelle directement `PUT /api/school/design` et obtient la personnalisation réservée à PREMIUM (500 $).
**Correctif** : dériver de `hasFeatureAccess(tier, 'custom_branding')`.

### BUG-22 — N'importe quel SCHOOL_ADMIN peut couper l'agent WhatsApp de toutes les écoles
[`src/app/api/whatsapp-status/route.ts:45-66`](src/app/api/whatsapp-status/route.ts#L45)

```ts
47   const authResult = await requireRole(request, AGENT_ROLES);   // [SAG, SCHOOL_ADMIN]
55   if (body.action === 'logout') { const data = await waFetch('/logout', 'POST'); … }
59   if (body.action === 'reset')  { const data = await waFetch('/reset',  'POST'); … }
```
Aucun `schoolId` n'est transmis : le mini-service Baileys est unique et partagé (une seule session, `mini-services/whatsapp-server`).
**Impact** : l'admin d'une école sur N déconnecte/réinitialise l'agent utilisé par toutes les écoles → panne d'envoi multi-tenant.
**Correctif** : réserver `/start|/pair|/logout|/reset` à SUPER_ADMIN_GLOBAL (ou sessions par école).

### BUG-23 — `parseInt` tronque les centimes : la dette ne s'éteint jamais
[`src/app/api/payments/route.ts:186-187`](src/app/api/payments/route.ts#L186)

```ts
186  const paymentAmount = parseInt(amount) || 0;
187  const paymentPaidAmount = parseInt(paidAmount) || 0;
```
Alors que les frais sont des `Float` (`SchoolFee.amount`) saisis avec `parseFloat` ([`school-fees/route.ts:80`](src/app/api/school-fees/route.ts#L80)).
**Impact** : frais 33,50 → encaissement 33,50 stocké 33 → reste dû 0,50 à vie ; `parseInt("0.5")` = 0 → enregistrement à 0, statut PENDING. Un `paidAmount` négatif est également accepté.
**Correctif** : `Math.round(Number(x))` après `Number.isFinite` + refus des valeurs < 0.

### BUG-24 — Matricule « count + 1 » non atomique et création hors transaction
[`src/app/api/students/route.ts:197`](src/app/api/students/route.ts#L197), [`224-232`](src/app/api/students/route.ts#L224), [`253`](src/app/api/students/route.ts#L253)

```ts
224  const existingCount = await db.student.count({ where: { schoolId, matricule: { startsWith: … } } });
230  const matricule = `${school.shortName}-${year}-${String(existingCount + 1).padStart(3, '0')}`;
232  const student = await db.student.create({ … });    // matricule est @unique
```
**Impact** : deux inscriptions simultanées → même matricule → 500 « Unique constraint failed » ; après suppression d'un élève (compteur décrémenté, matricules toujours pris) un matricule est réattribué → 500. Si `create` échoue, le compte parent créé l.197 reste orphelin.
**Correctif** : `db.$transaction` + reprise sur P2002.

### BUG-25 — Rang de classe faux, et « 1er » attribué par défaut
[`src/app/api/report-cards/route.ts:240-255`](src/app/api/report-cards/route.ts#L240)

```ts
248  const cards = await db.reportCard.findMany({ where: { studentId: { in: ids }, …, average: { not: null } } });
253  const rank = sorted.findIndex(c => c.studentId === studentId) + 1;
254  if (rank > 0) ranking = rank;                     // sinon ranking reste 1
255  totalClassStudents = Math.max(sorted.length, 1); // nb de bulletins saisis, PAS l'effectif
```
**Impact** : WhatsApp au parent « Rang : 2 sur 3 » pour une classe de 45 ; un élève sans moyenne est annoncé **1er**.
**Correctif** : `totalClassStudents = classmates.length` ; `ranking = rank > 0 ? rank : null`.

### BUG-26 — Bannière « Service WhatsApp injoignable » impossible à retirer automatiquement (closure obsolète)
[`src/app/page.tsx:4345-4352`](src/app/page.tsx#L4345) (+ `:4359`, `:4416`)

```ts
4345  useEffect(() => {
4349    checkStatus()
4350    const interval = setInterval(checkStatus, 2000)
4351    return () => clearInterval(interval)
4352  }, [])                                  // ← checkStatus du 1er rendu, figé
4359        if (serverDown) setServerDown(false)   // ← jamais exécutable (serverDown === false à vie)
4416        if (unreachableRef.current >= 4 && !serverDown) setServerDown(true)
```
Le fichier applique déjà le bon motif pour `connectionModeRef` / `pairCodeRef` (commentaires lignes 4330-4343) mais `serverDown` est lu directement dans la closure.
**Impact** : après 4 échecs consécutifs, l'alerte rouge reste affichée indéfiniment, même une fois le service revenu ; seul le bouton de fermeture manuel la retire.
**Correctif** : lire l'état via une ref (`serverDownRef`) ou ajouter la dépendance + `checkStatus` en `useCallback`.

### BUG-27 — Timers non nettoyés : étapes de progression fantômes après un échec
[`src/app/page.tsx:4450`](src/app/page.tsx#L4450) (+ `:4470`)

```ts
4450  steps.forEach((s, i) => setTimeout(() => setPairProgress(p => [...p, s]), i * 3000))
…
4470        setPairProgress([])     // branche d'échec
```
Aucune annulation : si la requête échoue avant 6 s, les timers restants réinjectent « Chargement de WhatsApp Web… » / « Génération du code de parrainage… » dans la liste vidée.
**Impact** : spinners de progression qui tournent sans fin alors qu'aucune requête n'est en cours ([rendu `:4608-4613`](src/app/page.tsx#L4608)) ; `setState` après démontage si l'utilisateur quitte la vue.
**Correctif** : conserver les ids dans une ref et les `clearTimeout` dans le `finally`.

### BUG-28 — Deux chargements sans `.catch` : écran vide silencieux (frais scolaires, classes)
[`src/components/views/SettingsView.tsx:348-349`](src/components/views/SettingsView.tsx#L348)

```ts
348  authFetch(`/api/school-fees?schoolId=${getActiveSchoolId()}`).then(r => r.json()).then(j => setFees(j.data || []))
349  authFetch(`/api/classes?schoolId=${getActiveSchoolId()}`).then(r => r.json()).then(j => setClasses(j.data || []))
```
Les autres chargements du même effet (l.333-336) ont bien un `.catch`.
**Impact** : en 403/500 ou coupure réseau, rejet non capturé et grille tarifaire / liste de classes **vides sans aucun message** — l'utilisateur croit que l'école n'a pas de frais configurés.
**Correctif** : `.catch(() => toast.error(...))`, ou vérifier `res.ok`.

---

## 3. MOYEN

| # | Bug | Fichier:ligne | Impact | Correctif |
|---|-----|---------------|--------|-----------|
| M1 | Deux chargeurs concurrents de la config devise, règles de fusion différentes | [`page.tsx:10100-10127`](src/app/page.tsx#L10100) vs [`useCurrency.ts:79`](src/hooks/useCurrency.ts#L79) | le dernier écrivain gagne → montants convertis dans une colonne et pas dans l'autre (cas hors-ligne : `exchangeRates: {}`, [`api/currency/route.ts:92-101`](src/app/api/currency/route.ts#L92)) | un seul chargeur + règle de fusion unique |
| M2 | Cloisonnement des tickets : la clé `OR` de recherche est **écrasée** ; un PARENT voit tous les tickets de son école | [`api/support/tickets/route.ts:47-54`](src/app/api/support/tickets/route.ts#L47) (idem `[id]/route.ts:35`) | fuite de contenus entre usagers d'une même école, recherche inopérante | traiter PARENT à part, combiner recherche et cloisonnement avec `AND` |
| M3 | GET des convocations sans scoping de cycle (le POST l'applique) | [`api/convocations/route.ts:35-40`](src/app/api/convocations/route.ts#L35) vs `:167` | un `DISCIPLINE_MATERNELLE` lit les convocations du secondaire | `where.student = { class: classFilterForCycle(getCycle(user.role)) }` |
| M4 | Statut calculé sur un `amount` client **jamais persisté** | [`api/payments/[id]/route.ts:55`](src/app/api/payments/[id]/route.ts#L55) | `{amount:1, paidAmount:1}` → record PAID alors que le dû stocké reste 1000 | ne calculer que depuis `existing.amount` |
| M5 | Écriture « lu » cross-tenant sans contrôle d'école | [`api/communications/[id]/read/route.ts:15`](src/app/api/communications/[id]/read/route.ts#L15) (idem grades/homework/convocations `[id]/read`) | marqueur créé sur une ressource d'une autre école + oracle d'existence | `verifySchoolAccess(user, communication.schoolId)` |
| M6 | Rattachement de parent non contrôlé et recherche par téléphone globale | [`api/students/route.ts:180-190`](src/app/api/students/route.ts#L180) | un élève peut être rattaché à un compte arbitraire (enseignant, autre école) | valider `parentId` (rôle PARENT + même école) et scoper la recherche |
| M7 | SSRF : `issuerUrl` accepté sans liste blanche, garde « desktop » = `User-Agent` forgeable | [`api/sync/send/route.ts:41-54`](src/app/api/sync/send/route.ts#L41), `:109` | requêtes serveur vers `http://localhost:<port>/api/auth` (services internes) depuis un navigateur avec un UA `Electron` | liste blanche de domaine + vrai secret d'app desktop |
| M8 | Limites par IP basées sur le premier `X-Forwarded-For` (valeur client) | [`lib/auth.ts:242`](src/lib/auth.ts#L242) + [`api/schools/route.ts:114`](src/app/api/schools/route.ts#L114) | rotation d'en-tête = contournement de `login_ip`, `reset_ip`, `school-create_ip`, `import-db`… | n'accepter l'en-tête que derrière un proxy de confiance |
| M9 | `reset-password` utilise le limiteur en mémoire au lieu du limiteur persistant | [`api/auth/reset-password/route.ts:45,57`](src/app/api/auth/reset-password/route.ts#L45) | compteurs remis à zéro entre isolates/redémarrages | `checkRateLimitDb` (comme `verify-reset-code`) |
| M10 | Mot de passe généré jamais communiqué | [`api/students/[id]/parent-account/route.ts:113,134`](src/app/api/students/[id]/parent-account/route.ts#L113) · [`api/students/route.ts:193`](src/app/api/students/route.ts#L193) · [`api/users/route.ts:281`](src/app/api/users/route.ts#L281) | compte créé (201) mais inutilisable : le secret n'existe nulle part | exiger un mot de passe, ou renvoyer/envoyer une fois le secret généré |
| M11 | Détail d'erreur interne renvoyé à un endpoint **non authentifié** | [`api/auth/route.ts:370`](src/app/api/auth/route.ts#L370) (`detail: error.message`) + `medical/*`, `whatsapp-config/custom`, `verify/document` | fuite de noms de tables/champs Prisma (reconnaissance) | `sanitizeError(error)` partout |
| M12 | « Transactions » comptées sur `createdAt`, « encaissé » sur `paidAt` | [`api/reports/route.ts:178-190`](src/app/api/reports/route.ts#L178) | « Transactions : 0 · Total encaissé : 500 » dans le même rapport | même champ de période |
| M13 | Paiements **PARTIELS** exclus de la caisse et des rapports (`paidAt` reste `null`) | [`api/payments/route.ts:206`](src/app/api/payments/route.ts#L206) · [`cashier-report.ts:154`](src/lib/cashier-report.ts#L154) · [`reports/route.ts:184`](src/app/api/reports/route.ts#L184) | 50 encaissés sur 100 : « Total encaissé : 0 » | `paidAt` renseigné dès que `paidAmount > 0` |
| M14 | Dettes calculées toutes années confondues | [`api/debts/route.ts:66-79`](src/app/api/debts/route.ts#L66) | élève à jour l'an dernier = « à jour » cette année → jamais relancé | rattacher `PaymentRecord` à l'année scolaire |
| M15 | « Total encaissé » additionne tous les statuts (REJECTED inclus) ; effectif non filtré | [`api/stats/route.ts:84,102-104`](src/app/api/stats/route.ts#L84) | tableau de bord et taux de recouvrement gonflés | `status: { in: ['PAID','PARTIAL'] }`, `isArchived: false` |
| M16 | Moyennes de rapport sans coefficients + `take: 8000` sans `orderBy` | [`lib/report-data.ts:296-311`](src/lib/report-data.ts#L296) | « TOP 3 ÉLÈVES » faussé (Maths coef. 5 ≈ Dessin coef. 1), échantillon arbitraire | pondérer par `Subject.coefficient`, paginer |
| M17 | Une dispense « du jour » est immédiatement EXPIRED | [`api/dispenses/route.ts:44,85,140`](src/app/api/dispenses/route.ts#L44) | l'élève dispensé d'EPS n'apparaît pas dans la liste active ; aucun contrôle `end >= start` | fin de journée (`T23:59:59.999Z`) + validation d'ordre |
| M18 | Une moyenne de 0 devient « pas de moyenne » | [`api/report-cards/route.ts:170,180`](src/app/api/report-cards/route.ts#L170) | élève à 0/20 stocké `average = null` → « — », exclu du rang | ne convertir en `null` que `undefined`/`null`/`''` |
| M19 | Code de document `count + 1` non atomique | [`lib/doc-codes.ts:45-49`](src/lib/doc-codes.ts#L45) | deux impressions simultanées → P2002 sur `docCode @unique`, erreur avalée → bulletin sans code | séquence transactionnelle / reprise P2002 |
| M20 | `classId` de la note jamais confronté à l'élève ni à la matière | [`api/grades/route.ts:206-215`](src/app/api/grades/route.ts#L206) | note rattachée à la mauvaise classe → classement et bulletin faux | `student.classId === classId && subject.classId === classId` |
| M21 | Date de présence invalide remplacée en silence + N upserts séquentiels | [`api/attendance/route.ts:118,134-143`](src/app/api/attendance/route.ts#L118) | `date: "29/09/2026"` → 201 « enregistré au 29/09 » alors que l'écriture porte sur le jour du serveur | 400 si format invalide ; `$transaction` |
| M22 | Repli de change silencieux sur la table USD pour toute devise non couverte | [`lib/exchange-rate-server.ts:79`](src/lib/exchange-rate-server.ts#L79) | « 1 000 NGN en CDF » répond ×1 500 trop grand, sans erreur | lever une erreur si la devise de base n'a pas de table |
| M23 | `POST /api/school-comments` sans rate-limit (P2 déjà signalé, toujours ouvert) | [`api/school-comments/route.ts:44-74`](src/app/api/school-comments/route.ts#L44) | spam illimité en base ; aucun contrôle d'existence de `schoolId` (500 au lieu de 400) | réutiliser `checkRateLimitDb` |
| M24 | Plafond « jamais plus que le reste à payer » uniquement côté client | [`api/payments/online/route.ts:38-41`](src/app/api/payments/online/route.ts#L38) vs [`OnlinePaymentView.tsx:261`](src/components/views/OnlinePaymentView.tsx#L261) | un parent appelle l'API avec n'importe quel montant (comptabilité faussée) | recalculer le dû serveur (`SchoolFee − Σ paidAmount`) |
| M25 | Quotas vérifiés en « lire puis écrire » (non atomiques) | [`api/students/route.ts:168`](src/app/api/students/route.ts#L168), [`api/users/route.ts:274`](src/app/api/users/route.ts#L274), [`api/school-photos/route.ts:53-64`](src/app/api/school-photos/route.ts#L53) | N requêtes concurrentes → limite + N (places payantes non facturées) | sérialiser (transaction / `updateMany` conditionnel) |
| M26 | `whatsappMonthlyUsed` jamais incrémenté mais affiché | [`api/whatsapp-config/custom/route.ts:57`](src/app/api/whatsapp-config/custom/route.ts#L57) | l'UI affiche `used: 0` en permanence, même quota épuisé | utiliser `getWhatsappUsage(schoolId)` |
| M27 | `PARENT_GRADES` accordé à ESSENTIEL par la matrice, refusé par les limites | [`lib/subscription.ts:30`](src/lib/subscription.ts#L30) vs `:96` et `:57-59` | `getMinTierForFeature` conseille ESSENTIEL alors que l'accès exige STANDARD (3 tables divergentes) | retirer `PARENT_GRADES` d'ESSENTIEL |
| M28 | Forfait payant sans `subscriptionEndDate` = actif à vie | [`lib/subscription-server.ts:68-69`](src/lib/subscription-server.ts#L68), [`api/auth/route.ts:21`](src/app/api/auth/route.ts#L21) | écoles seedées ou créées par le SAG sans date → ENTERPRISE gratuit à vie | imposer une date de fin à toute attribution payante |
| M29 | Le sélecteur « Statut » du formulaire de caisse n'a aucun effet | [`PaymentsView.tsx:425`](src/components/views/PaymentsView.tsx#L425) vs [`api/payments/route.ts:185-193`](src/app/api/payments/route.ts#L185) | le serveur recalcule le statut ; « En retard » n'est pas posable | retirer le champ ou l'honorer |
| M30 | `GET /api/schools` expose `_count` (élèves/classes/utilisateurs) sans authentification | [`api/schools/route.ts:68`](src/app/api/schools/route.ts#L68) | métriques internes des écoles concurrentes | retirer `_count` de la réponse publique |
| M31 | Liste d'élèves vide en silence quand l'API échoue (`res.ok` non vérifié) | [`StudentsView.tsx:89-91`](src/components/views/StudentsView.tsx#L89) | « Aucun élève » au lieu d'une erreur (403/500) | tester `res.ok` et afficher l'erreur |
| M32 | Sélecteur de classe vide en silence + pas de garde `cancelled` | [`AttendanceView.tsx:85-88`](src/components/views/AttendanceView.tsx#L85) | 403/500 → aucun message ; `setState` après démontage si l'école active change | `if (!r.ok) throw` + drapeau `cancelled` |
| M33 | Compteurs disciplinaires à 0 en cas d'erreur API | [`DisciplineDashboard.tsx:20-32`](src/components/dashboards/DisciplineDashboard.tsx#L20) | affiche « Liste Noire 0 / 0 cas » = faux « aucune infraction » | état d'erreur explicite au lieu de 0 |
| M34 | « Visites du jour » calculées en UTC | [`SchoolAdminDashboard.tsx:76-78`](src/components/dashboards/SchoolAdminDashboard.tsx#L76) | à Kinshasa (UTC+1) entre 00h et 01h, la veille est comptée comme aujourd'hui | construire la date locale (`toLocaleDateString('sv-SE')`) |
| M35 | Date de début de dispense préremplie en UTC | [`MedicalView.tsx:92`](src/components/views/MedicalView.tsx#L92) | dispense créée entre 00h et 01h datée de la veille si l'agent ne corrige pas | même correction que M34 |

---

## 4. FAIBLE / HYGIÈNE

- **Clé de planificateur par défaut** `'edugest-scheduler-key'` et comparaison non constante ([`api/reports/scheduler-run/route.ts:12,17`](src/app/api/reports/scheduler-run/route.ts#L12)) : `REPORT_SCHEDULER_KEY` est absent des env du dépôt → n'importe qui peut déclencher les rapports planifiés (envois WhatsApp/e-mail aux parents). Passer en fail-closed.
- **Aperçu d'un secret chiffré** : `accessTokenPreview: maskSensitive(row.accessToken.slice(0, 8))` ([`api/whatsapp-api/route.ts:30`](src/app/api/whatsapp-api/route.ts#L30)) — `row.accessToken` est la valeur chiffrée : l'aperçu est trompeur et expose 8 caractères du chiffré. Renvoyer seulement `hasAccessToken`.
- **`verifyParentAccess` renvoie `true` pour tout rôle non-PARENT** ([`lib/auth.ts:680-686`](src/lib/auth.ts#L680)) : inoffensif sur les appels actuels (toujours précédés d'un contrôle de rôle/école), mais piège pour une future route.
- **`checkRateLimit` en mémoire, `Map` jamais purgée** ([`lib/auth.ts:700-709`](src/lib/auth.ts#L700)) : non partagé entre isolats, croissance non bornée (clés dérivées d'entrées client) — `checkRateLimitDb` existe déjà.
- **`.env` versionné** avec `DATABASE_URL=file:/home/z/my-project/db/custom.db` (chemin Linux inexistant sous Windows) : sur un clone sans `.env.local`, l'app tente d'ouvrir une base dans un dossier absent. Aucun secret réel dedans (vérifié) ; `.env.local` (Neon + `RESET_TOKEN_SECRET`) est ignoré et n'apparaît **jamais** dans l'historique (`git log -S 'npg_'` → 0).
- **ESLint : 69 erreurs** (51 `react-hooks/rules-of-hooks`, 15 `no-require-imports` dans `scripts/`, 3 `set-state-in-effect`) + 2 avertissements. La CI tolère 109 (baseline) : aucune alerte, mais les 51 erreurs de hooks incluent BUG-16.
- **`mobile-expo/` est vide** (aucun fichier source) — cohérent avec la correction de promesse marketing déjà tracée.
- **`try { requirePermission(...) } catch {}`** dans [`api/schools/[id]/route.ts:16-21`](src/app/api/schools/[id]/route.ts#L16) : une erreur du contrôle d'accès fait basculer silencieusement en vue publique.

---

## 5. VÉRIFIÉ SAIN (pour éviter les faux positifs)

- **Aucune route mutante sans authentification** hors flux publics voulus : sur 119 routes mutantes, seules `auth/*`, `public/parent-register` et `sync/token` n'ont pas `requireAuth` — et toutes vérifient explicitement les identifiants, avec rate-limit.
- **Aucun autre IDOR sur les `?schoolId=`** : sur 51 routes lisant `schoolId` en query, seule `school-currency` (BUG-6) n'est pas vérifiée ; `parents`, `school-qr-codes`, `subscription/requests`, `corporates/*` sont scellées école ou SAG-only.
- **Matrice de rôles solide** : `canCreateRole` / `canChangeUserRole` / `canManageUserAccount` ([`auth.ts:759-816`](src/lib/auth.ts#L759)) bloquent auto-promotion et action hors école. Auto-approbation d'abonnement impossible ([`api/subscription/request/[id]/route.ts:11`](src/app/api/subscription/request/[id]/route.ts#L11) = SAG only) ; aucune promotion d'école possible via `PATCH /api/schools/[id]` ni montée de forfait via `/api/subscription/downgrade`.
- **Chiffrement AES-256-GCM correct** ([`lib/gateway-keys.ts`](src/lib/gateway-keys.ts) : IV 12 o, tag 16 o vérifié, refus de stocker en clair sans `PAYMENT_KEYS_SECRET`) ; les valeurs masquées (`****1234`) ne réécrasent jamais un secret.
- **Webhook abonnement** : fail-closed sans `PLATFORM_WEBHOOK_SECRET` (503) + HMAC `timingSafeEqual` + pas de rejeu (statut ≠ PENDING → no-op).
- **Webhook école** : signature HMAC par école, secrets déchiffrés, jamais de rétrogradation SUCCESS → FAILED, audit des écarts de devise.
- **`import-db`** borné par `maxStudents` (`studentSlots` décrémenté) — pas de contournement du quota élèves.
- **WhatsApp mini-service** : clé API obligatoire (`x-api-key`, comparaison temps constant), CORS borné.
- **Tous les handlers `[param]`** utilisent bien `await params` (Next 16) ; la liste de préchargement de [`src/instrumentation.ts`](src/instrumentation.ts) couvre **les 161 routes** (vérifié automatiquement) — pas de route oubliée susceptible de reproduire le gel d'isolat workerd.
- **Service worker** : push et clic propres, aucun cache d'application (pas de version fantôme).
- **Couche cliente (passe dédiée, 2 scanners indépendants)** : aucune autre violation des règles des hooks que les 4 de BUG-16 (les `return` de `DispensesView`, `page.tsx:3336/3394/4241/10110`, `OnlinePaymentView:264`, `PersonalizationView:224`, `GradesView:154/211/216`, `PaymentsView:180` sont tous dans des callbacks) ; aucune boucle infinie (pas de dépendance objet/tableau/fonction non mémoïsée, 44 `useMemo` avec dépendances d'état complètes) ; tous les `setInterval` nettoyés et les 3 abonnements `onDbChange` désabonnés ; `setLoading(true)` toujours couvert par un `catch`/`finally` ; aucune `key` manquante ou dupliquée ; les 34 boutons des `<form>` du périmètre ont un `type` explicite et les `preventDefault()` sont présents.

---

## 6. Ordre de correction recommandé

1. **BUG-1, BUG-2** — crédit de paiement faux / double crédit (argent réel, flux en production).
2. **BUG-3, BUG-4, BUG-10, BUG-13, BUG-14** — chaîne du paywall : expiration, preuve de paiement réutilisable, SUCCESS manuel, contrôles de montant morts ou sans devise.
3. **BUG-5, BUG-7, BUG-9** — appropriation d'élève via QR, connexion WhatsApp cassée + jeton exposé, passkey M-Pesa révélé.
4. **BUG-17, BUG-18, BUG-8** — frais scolaires bloqués pour le SCHOOL_ADMIN, fuite de noms d'élèves entre écoles, discipline sans scoping de cycle.
5. **BUG-15, BUG-23** — saisie de caisse à la source.
6. **BUG-16** (écran blanc, correctif trivial), puis le reste par gravité.

---

## 7. Pistes non confirmées (à vérifier avant action)

1. [`api/payments/subscription/renew/route.ts:95`](src/app/api/payments/subscription/renew/route.ts#L95) : `amount: amount * 100` alors que les autres routes stockent des montants bruts — convention d'unité de `PaymentRecord` non établie (risque d'inflation ×100 des rapports financiers).
2. [`api/settings-approval/route.ts:172-265`](src/app/api/settings-approval/route.ts#L172) : les `changeType` `school_fee` / `currency` / `school_info` passent APPROVED sans exécution serveur (contrairement à `qr_create` / `class_create` / `class_delete`) — possible approbation sans effet ; dépend de ce que fait le front.
3. [`api/school-fees/route.ts:72-77`](src/app/api/school-fees/route.ts#L72) : le test d'unicité ajoute `isActive: true` alors que la contrainte est `@@unique([classId, trimester, name])` — aucun code ne désactive un frais aujourd'hui, donc pas de P2002 prouvable.
4. `PaymentRecord.receiptNumber` n'est pas `@unique` et `POST /api/payments` le génère avec `Date.now()` : doublon possible par double-clic, aucune occurrence constatée.
5. [`lib/sqlite-schema-upgrade.ts:310-334`](src/lib/sqlite-schema-upgrade.ts#L310) : `PRAGMA foreign_keys` exécuté hors de la transaction — comportement du pool SQLite non vérifiable sans Electron.
6. Solidité de `PLATFORM_WEBHOOK_SECRET` et devise réellement configurée sur la passerelle plateforme (`schoolId='__PLATFORM__'`) : non lisibles depuis le code, ils conditionnent l'exploitabilité de BUG-14.
7. Aucun mécanisme d'essai gratuit dans le code (`grep TRIAL|trial|essai` : rien) : les scénarios « essai jamais expiré » ne sont pas évaluables ; l'équivalent est la règle BUG-53.

---

## 8. Limites de l'audit

- `next build` n'a pas pu être exécuté dans le bac à sable (`spawn EPERM` : capture de sortie de sous-processus bloquée). `tsc --noEmit` est propre sur `src/` ; la CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) exécute `tsc`, ESLint, le build complet et des tests de sécurité — la relancer validerait la compilation.
- Aucun test en navigateur ni appel API réel : les bugs d'interface (BUG-15, BUG-16) et les scénarios de concurrence (BUG-2, BUG-24, M25) sont établis par lecture du code, non par reproduction instrumentée.
- La passe cliente a été menée à terme (BUG-15, BUG-16, BUG-26 à BUG-28, M1, M31 à M35) : recherche exhaustive des violations de hooks (deux scanners indépendants), des dépendances d'effet non mémoïsées, des timers/abonnements non nettoyés, des `fetch` sans `.catch`, des `res.ok` non vérifiés, des `key` et des boutons de formulaire. Restent non prouvés (pistes « INCERTAIN ») : `OnlinePaymentView.tsx:305`, `PaymentsView.tsx:196`, `PersonnelView.tsx:52-56`, `page.tsx:4348`, `DettesView.tsx:119` ; `WhatsappUsageCard.tsx` (skeleton infini possible) est du **code mort**, importé nulle part ; `lib/api-limiter.ts` n'a pas été audité. La dette lint `set-state-in-effect` (3 occurrences : `AttendanceView.tsx:119,144`, `useCurrency.ts:49`) n'est pas un bug fonctionnel.
- Non audités en profondeur : `desktop/main.js` (Electron, 52 Ko), les webhooks propres à Bictorys/Flutterwave, `src/lib/pdf-medical.ts` et `report-pdf.ts` (mise en page), `mobile-expo/` (vide).

---

## 9. Note de traçabilité — modifications concurrentes détectées pendant l'audit

Pendant l'audit (10/10/2026, ~02:30), **trois fichiers ont été modifiés dans l'arbre de travail par un autre processus que cet audit** (ils étaient propres au début de l'audit et ne font pas partie des findings) :

- `src/app/api/sync/pulse/route.ts` — réécriture en une requête SQL brute unique (+ logs de diagnostic `[pulse:${iso}]`).
- `src/instrumentation.ts` — ajout de `process.on('unhandledRejection', …)` sous Workers.
- `src/lib/request-pin.ts` — journalisation du site appelant quand `after()` échoue.

Ces trois fichiers ont depuis été **commités par ce processus** (`65227553`), donc hors de mon périmètre et hors de l'arbre de travail.

⚠️ **Risque signalé pendant l'audit, désormais écarté** : la première version de `sync/pulse` utilisait du SQL PostgreSQL (`::int`, `NULL::timestamp`, `$queryRaw`) — la même route tournant sur la branche SQLite de l'app desktop, SQLite aurait rejeté la requête (500 silencieux, synchro temps réel arrêtée). Le commit `65227553` a conservé **un chemin ORM pour la branche SQLite** (`isSqlite` → Prisma classique) et ne réserve `$queryRaw` qu'à la branche Postgres : le risque est levé. À vérifier si ce fichier est de nouveau modifié.
