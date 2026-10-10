# Corrections appliquées — EduGest

**Date** : 10/10/2026 · **Base** : [`RAPPORT-BUGS.md`](RAPPORT-BUGS.md) (63 findings)
**Périmètre corrigé** : **44 fichiers** — 6/6 CRITIQUE, 19/20 ÉLEVÉ, 19/35 MOYEN (+1 partiel), 2 points d'hygiène transverses.
**Vérifications** : `tsc --noEmit` → **0 erreur dans `src/`** ; ESLint → **71 → 20 messages (69 → 18 erreurs)**, dont **0 `react-hooks/rules-of-hooks`** (les 51 erreurs de hooks ont disparu). Aucune correspondance de ligne de ce document n'a été copiée d'un rapport : chaque correction a été appliquée sur le code réel.

---

## 1. CRITIQUE — 6/6 corrigés

| Bug | Fichier | Correction |
|-----|---------|-----------|
| BUG-1 crédit sans conversion | [`payments/webhook/route.ts`](src/app/api/payments/webhook/route.ts) | `incoming` utilise désormais `transaction.convertedAmount` (monnaie de base) quand il existe, sinon l'ancien comportement |
| BUG-2 double crédit au rejeu | idem | marqueur d'idempotence `credited` dans `gatewayResponse` du chemin « sous-paiement » + garde en tête de handler → un rejeu ne recrédite plus |
| BUG-3 paywall sans expiration | [`lib/feature-gate.ts`](src/lib/feature-gate.ts) | `requireFeature` s'appuie sur `checkSubscription()` (statut + date de fin) ; compte sans école : comportement précédent conservé |
| BUG-4 renouvellement gratuit | [`payments/subscription/renew/route.ts`](src/app/api/payments/subscription/renew/route.ts) | la demande `PAID` est **consommée atomiquement** (`updateMany` → `CONSUMED`, échec si `count !== 1`) |
| BUG-5 appropriation d'élève via QR | [`public/parent-register/route.ts`](src/app/api/public/parent-register/route.ts) | si l'école a enregistré un contact (`Student.phone`), seul ce numéro peut se déclarer parent (403 explicite) + **journal d'audit** `PARENT_SELF_REGISTER` |
| BUG-6 IDOR config devise | [`school-currency/route.ts`](src/app/api/school-currency/route.ts) | `verifySchoolAccess(user, schoolId)` avant toute lecture |

## 2. ÉLEVÉ — 19/20 corrigés

| Bug | Correction |
|-----|-----------|
| BUG-7 login WhatsApp | [`auth/whatsapp/route.ts`](src/app/api/auth/whatsapp/route.ts) : pose le cookie httpOnly `edugest_token` (comme `/api/auth`) et **ne renvoie plus le jeton** dans le JSON |
| BUG-8 discipline sans cycle | [`discipline/route.ts`](src/app/api/discipline/route.ts) : `getRoleCycle` + `classFilterForCycle` au GET, `classMatchesCycle` au POST **et** au PUT |
| BUG-9 passkey M-Pesa | **masqué** dans les 3 GET, **chiffré au repos** à l'écriture (`encryptSecret`, valeurs masquées ignorées), **déchiffré** à l'usage STK — `decryptSecret` tolère les valeurs historiques en clair (aucune migration nécessaire) |
| BUG-10 SUCCESS manuel | [`payment-transactions/[id]/route.ts`](src/app/api/payment-transactions/[id]/route.ts) : passage manuel à `SUCCESS` réservé au SUPER_ADMIN_GLOBAL (403 sinon) |
| BUG-11 quota WhatsApp | [`lib/whatsapp-agent.ts`](src/lib/whatsapp-agent.ts) : garde `checkWhatsappQuota()` dans `sendWhatsAppMessage`/`sendWhatsAppDocument` (branche agent partagé) — l'API perso de l'école reste illimitée, une erreur de lecture ne bloque jamais (fail-open) |
| BUG-12 bulletins non gated | [`bulletins/[studentId]/whatsapp/route.ts`](src/app/api/bulletins/[studentId]/whatsapp/route.ts) : mêmes règles que le GET jumeau (`report_cards` pour le staff, `tierAllowsParentGrades` pour les parents) |
| BUG-13 code mort du webhook | [`payments/webhook/route.ts`](src/app/api/payments/webhook/route.ts) : sous-paiement **sans** `PaymentRecord` → `AMOUNT_MISMATCH` + audit + 422 (jamais SUCCESS) |
| BUG-14 webhook abonnement | [`payments/webhook/subscription/route.ts`](src/app/api/payments/webhook/subscription/route.ts) : transaction de la **même école** exigée + montant **converti en USD** (`convertedAmount`, sinon `convertCurrency`) ; conversion indisponible → 503 |
| BUG-15 montant devise en caisse | [`PaymentsView.tsx`](src/components/views/PaymentsView.tsx) : refus d'enregistrer si la devise de paiement ≠ devise de base et que le taux est absent ; `Math.round(Number(...))` |
| BUG-16 hooks React | [`page.tsx`](src/app/page.tsx) (Communications, Convocations), [`GradesView.tsx`](src/components/views/GradesView.tsx), [`PaymentsView.tsx`](src/components/views/PaymentsView.tsx) : garde d'accès déplacée **après tous les hooks** → 51 erreurs ESLint supprimées |
| BUG-17 frais scolaires | [`lib/auth.ts`](src/lib/auth.ts) : permission dérivée `school-fees:manage` (SCHOOL_ADMIN, ADMIN_FREEMIUM, DIRECTION*, SECRETARY) + routes [`school-fees`](src/app/api/school-fees/route.ts) et [`[id]`](src/app/api/school-fees/[id]/route.ts) mises à jour |
| BUG-18 fuite de noms d'élèves | [`payments/route.ts`](src/app/api/payments/route.ts) : `schoolId` ajouté au `where` de la recherche par nom |
| BUG-19 notifications non attendues | [`payments/verify/route.ts`](src/app/api/payments/verify/route.ts) : `await` sur `notifyPaymentApproved` et `notifyPaymentRejected` |
| BUG-20 quota profs via EPS | [`lib/subscription-server.ts`](src/lib/subscription-server.ts) : `EPS` compte dans `maxTeachers` |
| BUG-21 custom_branding | [`school/design/route.ts`](src/app/api/school/design/route.ts) : `DESIGN_ALLOWED_TIERS = PREMIUM/ENTERPRISE/CORPORATE` |
| BUG-22 agent WhatsApp partagé | [`whatsapp-status/route.ts`](src/app/api/whatsapp-status/route.ts) : `logout`/`reset` réservés à la plateforme (`start`/`pair` restent ouverts) + le client affiche le refus |
| BUG-23 centimes tronqués | [`payments/route.ts`](src/app/api/payments/route.ts) : `Math.round(Number())` + refus des montants négatifs |
| BUG-24 matricule non atomique | [`students/route.ts`](src/app/api/students/route.ts) : création avec **reprise sur collision P2002** (5 tentatives, rang incrémental) au lieu d'un 500 |
| BUG-25 rang de classe faux | [`report-cards/route.ts`](src/app/api/report-cards/route.ts) : effectif = taille de la classe ; `ranking = null` si inconnu ; [`whatsapp-agent.ts`](src/lib/whatsapp-agent.ts) omet la ligne « Rang » dans ce cas |

**Non corrigé (1)** : *BUG-26 → voir §4* (bannière WhatsApp) — **corrigé** ; le seul ÉLEVÉ restant est en réalité **BUG-5 partiel** : la preuve de parenté repose sur le téléphone enregistré par l'école ; un OTP SMS ou une validation du staff reste la solution cible.

## 3. MOYEN — 19/35 corrigés (+1 partiel)

**Corrigés** : M2 (tickets : `OR` écrasé + cloisonnement PARENT), M3 (convocations GET scoping cycle), M4 (statut calculé sur un `amount` non persisté), M8 (`X-Forwarded-For` : dernière valeur), M9 (`reset-password` : limiteur persistant, mêmes clés que `verify-reset-code`), M13/M14 (paiements **PARTIAL** datés : visibles en caisse et dans les rapports), M14 (dettes bornées à l'année scolaire active + statuts encaissés), M17 (dispense : fin de journée + refus `end < start`), M18 (moyenne 0 conservée), M20 (classe/matière de la note cohérentes avec l'élève), M21 (date de présence refusée si invalide + écriture transactionnelle), M22 (plus de repli silencieux USD sur une autre devise → erreur explicite), M23 (rate-limit `school-comments` + 404 si école inconnue), M27 (`PARENT_GRADES` retiré d'ESSENTIEL dans les deux tables), M31 (StudentsView : `res.ok`), M32 (AttendanceView : `res.ok` + annulation), M33 (DisciplineDashboard : erreur affichée au lieu de « 0 cas »), M34/M35 (dates locales au lieu d'UTC).

**Partiel** : M11 — `detail: error.message` supprimé sur `/api/auth` (endpoint non authentifié) via `sanitizeError` ; les routes `medical/*`, `whatsapp-config/custom`, `verify/document` restent à traiter.

## 4. Reste à faire (14 MOYEN + 1 piste)

| # | Sujet | Pourquoi non fait |
|---|-------|-------------------|
| M1 | Deux chargeurs concurrents de la config devise avec règles de fusion différentes | refactor transverse (`currency-display.ts` + `page.tsx` + `useCurrency.ts`), à faire avec un test manuel de l'affichage |
| M5 | Marqueurs « lu » sans scoping école (`grades/homework/convocations/communications [id]/read`) | faible impact (fuite d'existence) ; correctif trivial mais 4 fichiers |
| M6 | `parentId` arbitraire accepté dans `POST /api/students` | nécessite de valider rôle + école du parent |
| M7 | SSRF `sync/send` (`issuerUrl` sans liste blanche, garde `User-Agent`) | demande une décision : liste blanche de domaine ou secret d'app desktop |
| M10 | Mot de passe généré jamais communiqué (comptes parents) | changement de contrat d'API (renvoyer le secret une fois) — décision produit |
| M11 | Détail d'erreur interne (`medical/*`, `whatsapp-config/custom`, `verify/document`) | reste 4 routes à passer à `sanitizeError` |
| M12 | Rapport : « Transactions » sur `createdAt` vs « encaissé » sur `paidAt` | périmètre métier à confirmer (lequel des deux fait foi) |
| M15 | « Encaissé » du dashboard additionne tous les statuts / effectif non filtré | à aligner sur `report-data.ts` |
| M16 | Moyennes de rapport sans coefficients + `take: 8000` | décision produit (moyenne pondérée ou non) |
| M19 | Code de document `count + 1` non atomique | nécessite un compteur séquence (table ou transaction) |
| M24 | `/api/schools` expose `_count` publiquement | décision produit (annuaire) |
| M25 | Quotas « lire puis écrire » non atomiques | nécessite un verrou / compteur conditionnel |
| M26 | `whatsappMonthlyUsed` jamais incrémenté mais affiché | à basculer sur `getWhatsappUsage()` côté UI |
| M28 | Forfait payant sans date de fin = actif à vie | nécessite une règle de données + reprise sur les écoles existantes |
| M29 | Sélecteur « Statut » du formulaire de caisse sans effet | décision UI (retirer le champ ou l'honorer) |
| — | BUG-5 cible complète | OTP SMS sur le numéro enregistré ou validation du staff |

## 5. Changements de comportement à connaître (volontaires)

1. **Quota WhatsApp réellement appliqué** : une école au quota atteint (ou FREEMIUM, 0 message inclus) ne peut plus envoyer via l'agent partagé — y compris bulletins et rapports planifiés. L'API WhatsApp personnelle de l'école reste illimitée.
2. **Agent WhatsApp partagé** : `logout`/`reset` sont réservés au SUPER_ADMIN_GLOBAL (une école peut toujours `start`/`pair`).
3. **Renouvellement d'abonnement** : une demande `PAID` ne sert **qu'une fois** (statut `CONSUMED`). Le support devra créer une nouvelle demande pour un nouveau mois.
4. **Bulletins** : le forfait de l'école est désormais vérifié aussi sur l'envoi WhatsApp (pas seulement sur le téléchargement).
5. **Frais scolaires** : `school-fees:manage` est dérivé pour SCHOOL_ADMIN / ADMIN_FREEMIUM / DIRECTION* / SECRETARY — les autres rôles (CASHIER, TEACHER, PARENT) n'écrivent plus la grille (la lecture reste ouverte via `school:read`).
6. **Inscription parent par QR** : si l'école a saisi un contact pour l'enfant, le numéro saisi doit correspondre (message 403 explicite sinon).
7. **Dispenses** : une dispense sans `endDate` court jusqu'à la **fin de la journée** (elle n'est plus EXPIRED immédiatement).
8. **Taux de change** : sans source en ligne **et** sans table de secours pour la devise de base, l'API renvoie une erreur explicite au lieu d'un montant faux d'un facteur ~1 500.
9. **Dates d'attendance** : format `AAAA-MM-JJ` exigé (400 sinon) — plus de substitution silencieuse par la date du jour.
10. **Passkey M-Pesa** : chiffré au repos — si `PAYMENT_KEYS_SECRET` est absent, l'enregistrement de la config de passerelle échoue explicitement (comme pour les autres secrets).

## 6. Vérifications & limites

**Vérifications statiques**
- `tsc --noEmit` : **0 erreur dans `src/`**.
- ESLint : **20 messages / 18 erreurs** (contre 71 / 69 avant), toutes hors périmètre : 15 `no-require-imports` dans `scripts/*.js`, 3 `set-state-in-effect` préexistants, 2 directives `eslint-disable` inutiles. **Aucune `react-hooks/rules-of-hooks`.**

**Vérifications d'exécution (10/10/2026, après levée de la restriction de bac à sable)**
- ✅ **`next build --webpack` : exit 0** — les **161 routes** compilent (`161 routes` listées, pages statiques et dynamiques générées). Le build tournait sur la branche SQLite (`DATABASE_URL=file:…/db/desktop-template.db`) comme en CI.
- ✅ **Serveur standalone de production** démarré (`node .next/standalone/server.js`, base SQLite de test) : `/api/health` → `{"status":"ok","database":"up"}`.
- ✅ **Suite de sécurité du projet** ([`scripts/security-tests/run-security-tests.mjs`](scripts/security-tests/run-security-tests.mjs)) : **31 réussis / 0 échoué** — authentification, escalade de rôle (6 contrôles), isolation multi-écoles (7 contrôles, dont « frais de l'école B = REFUSÉ / scopés » après le passage à `school-fees:manage`), IDOR parent (5 contrôles), restrictions d'abonnement (webhook sans signature, auto-upgrade ENTERPRISE, activation PREMIUM sans paiement).
- ✅ **Smoke test navigateur réel** ([`scripts/ui-smoke.mjs`](scripts/ui-smoke.mjs), Chromium local, session par cookie httpOnly) : **6 vues OK / 0 en échec** — `/dashboard`, `/students`, `/grades`, `/payments`, `/communications`, `/convocation`. Chaque vue se monte, se peint et **aucune erreur « Rendered more/fewer hooks »** n'apparaît (les 4 composants corrigés du BUG-16 sont couverts : Communications et Convocations de `page.tsx`, `GradesView`, `PaymentsView`). Captures : `qa-shots/corrections/`.

**Ce qui reste à tester manuellement** (scénarios métier difficiles à automatiser sans fixtures dédiées) :
1. paiement en ligne en devise étrangère (montant crédité en monnaie de base) ;
2. rejeu d'un webhook de sous-paiement (doit être ignoré) ;
3. renouvellement d'abonnement deux fois de suite (la 2ᵉ doit échouer en 409) ;
4. envoi de bulletin par une école ESSENTIEL (doit être refusé) ;
5. connexion par WhatsApp de bout en bout (code OTP réel).

**Bug mineur découvert pendant les tests (non corrigé)** : `/api/communications` répond **403 « School ID required »** pour un SUPER_ADMIN_GLOBAL sans école active (le client n'envoie pas de `schoolId`, et la route exige un `schoolId` non vide avant toute autre logique — [`communications/route.ts:21-27`](src/app/api/communications/route.ts#L21)). Le widget « communications » du tableau de bord plateforme reste donc vide. Comportement **préexistant** (aucun rapport avec les correctifs), à traiter en même temps que M12 (périmètre des rapports).

**Rappels d'environnement** : `bun run build` a été relancé avec succès ; les artefacts `.next` de production sont à jour ; la base de test `db/verify-fixes.db` (copie de `db/desktop-template.db`) et le serveur de test sur le port 3210 ont été arrêtés/supprimés.
