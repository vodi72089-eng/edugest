# EduGest — Documentation Technique de Production

> **Version** : 1.4.0 | **Dernière mise à jour** : Septembre 2026
> **Statut** : Prêt pour la mise en production

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture](#2-architecture)
3. [Base de données](#3-base-de-données)
4. [Authentification et sécurité](#4-authentification-et-sécurité)
5. [Système de rôles et permissions](#5-système-de-rôles-et-permissions)
6. [API Routes](#6-api-routes)
7. [Fonctionnalités](#7-fonctionnalités)
8. [Intégrations](#8-intégrations)
9. [Déploiement](#9-déploiement)
10. [Monitoring](#10-monitoring)
11. [Maintenance](#11-maintenance)

---

## 1. Vue d'ensemble

**EduGest** est une plateforme de gestion scolaire complète conçue pour les écoles africaines. Elle gère l'intégralité du cycle éducatif — des inscriptions aux bulletins, des paiements à la discipline — avec une intégration WhatsApp native.

### Métriques du projet

| Composant | Quantité |
|-----------|----------|
| Modèles de données (Prisma) | 43 |
| Routes API | 113+ |
| Composants React (views) | 18+ |
| Rôles utilisateurs | 15 |
| Passerelles de paiement | 8 (DPO, Visa, Mastercard, M-Pesa, Orange Money, Airtel Money, Flutterwave, Bictorys) |
| Devises supportées | 10 (USD, EUR, CDF, NGN, XOF, GHS, KES, ZAR, GBP, CAD) |
| Systèmes éducatifs | Multi-pays (RDC par défaut) |

### Stack technique

| Technologie | Usage |
|-------------|-------|
| **Next.js 16** + React 19 | Framework frontend/backend |
| **Prisma 6.x** | ORM (SQLite en dev, adaptable PostgreSQL) |
| **Zustand** | State management |
| **Tailwind CSS** | Styling (thème LUXE AFRICAIN, oklch) |
| **Baileys** | Serveur WhatsApp autonome |
| **Electron 33** | Application de bureau |
| **bcryptjs** | Hachage des mots de passe |
| **Sessions fichiers** | Tokens Bearer persistés dans `.sessions/` (UUID, expiration, révocation) |
| **AES-256-GCM** | Chiffrement des clés API paiement |
| **Ant Design Icons** | Iconographie |
| **Plus Jakarta Sans** | Police principale |

---

## 2. Architecture

### Structure du projet

```
edugest/
├── prisma/
│   ├── schema.prisma          # 43 modèles de données
│   ├── db/custom.db           # Base SQLite principale
│   └── seed.ts                # Données de test/démonstration
├── src/
│   ├── app/
│   │   ├── page.tsx           # Application principale (SPA ~8000+ lignes)
│   │   ├── layout.tsx         # Layout racine
│   │   ├── globals.css        # Thème LUXE AFRICAIN
│   │   └── api/               # 113+ routes API REST
│   ├── components/
│   │   ├── animated/          # Composants d'animation (GSAP, react-bits)
│   │   ├── dashboards/        # Tableaux de bord par rôle
│   │   ├── landing/           # Sections landing page
│   │   ├── ui/                # Composants UI génériques (shadcn/ui)
│   │   └── views/             # 18+ vues métier
│   └── lib/
│       ├── auth.ts            # Auth, RBAC, 45 permissions, hiérarchie de rôles
│       ├── db.ts              # Client Prisma singleton
│       ├── store.ts           # Zustand store (session, navigation)
│       ├── subscription.ts    # Logique abonnements/tiers
│       ├── helpers.ts         # Utilitaires (formatage, calculs)
│       ├── types.ts           # Types TypeScript
│       ├── bulletin.ts        # Génération bulletins PDF
│       ├── payment-gateway.ts # Orchestrateur passerelles paiement
│       ├── whatsapp-api.ts    # Client WhatsApp Meta Cloud API
│       └── whatsapp-usage.ts  # Compteur quota WhatsApp
├── desktop/
│   ├── main.js                # Process principal Electron
│   └── package.json           # Config electron-builder
├── mini-services/
│   └── whatsapp-server/       # Serveur WhatsApp Baileys
├── public/
│   ├── logos/payment/         # Logos passerelles de paiement
│   └── school-logos/          # Logos écoles (SVG)
├── start-all.js               # Lanceur frontend + WhatsApp
└── start-all.bat              # Lanceur Windows
```

### Flux de données

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Browser   │────▶│  Next.js API │────▶│   SQLite     │
│  (React)    │◀────│  (113 routes)│◀────│  (Prisma)    │
└─────────────┘     └──────────────┘     └──────────────┘
                           │
                    ┌──────┴──────┐
                    │             │
               ┌────▼────┐  ┌────▼────┐
               │WhatsApp │  │ Passer- │
               │ Baileys │  │  elles  │
               │  :3001  │  │paiement │
               └─────────┘  └─────────┘
```

---

## 3. Base de données

### Modèles principaux (43)

| Modèle | Description | Relations clés |
|--------|-------------|----------------|
| `School` | École (multi-tenancy) | → Users, Students, Classes, Subjects, Payments |
| `User` | Compte utilisateur | → School, Students (parents), Notifications |
| `Student` | Élève inscrit | → Class, School, Parent, Grades, Discipline |
| `Class` | Classe/section | → School, Students, Subjects, SchoolFees |
| `Subject` | Matière | → Class, Grades, TeacherAssignments |
| `Grade` | Note d'un élève | → Student, Subject, Class |
| `PaymentRecord` | Paiement frais scolaires | → School |
| `SchoolFee` | Frais par classe/trimestre | → Class |
| `Homework` | Devoir | → Class |
| `Communication` | Message interne | → School |
| `Convocation` | Convocation parent | → Student |
| `DisciplineRecord` | Incident disciplinaire | → Student |
| `Dispense` | Dispense de cours | → Student |
| `PlatformEvent` | Événement plateforme | → School |
| `RepechageExam` | Examen de repêchage | → Student |
| `SchoolQrCode` | QR code inscription parent | → School |
| `DocumentVerification` | Vérification document officiel | → School |
| `PaymentGatewayConfig` | Config passerelle paiement | → School |
| `PaymentTransaction` | Transaction externe | → School |
| `WhatsappApiConfig` | Config API WhatsApp école | → School |
| `WhatsappMessageLog` | Log messages WhatsApp | (index) |
| `PricingPlan` | Plans d'abonnement | (standalone) |
| `SchoolYear` | Année scolaire | → School, Classes |
| `AuditLog` | Journal d'audit | (standalone) |
| `Notification` | Notification in-app | → User |
| `PushSubscription` | Abonnement Web Push | → User |
| `TeacherAssignment` | Affectation enseignant | → User, Class, Subject |
| `SchoolCurrencyConfig` | Config monnaie école | → School |
| `ExchangeRate` | Taux de change | (standalone) |
| `SettingsApproval` | Approbation paramètres | → School |
| `SubscriptionRequest` | Demande upgrade | → School |
| `VerificationToken` | Token OTP | → User |
| `GlobalApiConfig` | Config API globale | (standalone) |
| `SchoolComment` | Commentaire école | → School |
| `Blacklist` | Liste noire | → Student |
| `Greylist` | Liste grise | → Student |
| `Whitelist` | Liste blanche | → Student |
| `DisciplineKeyword` | Mot-clé discipline | (standalone) |
| `GradeRead` | Lecture note | → Grade, User |
| `HomeworkRead` | Lecture devoir | → Homework, User |
| `ConvocationRead` | Lecture convocation | → Convocation, User |
| `CommunicationRead` | Lecture message | → Communication, User |
| `ReportCard` | Bulletin généré | (standalone) |

### Schéma de subscription

```
FREEMIUM ──▶ STANDARD ──▶ PREMIUM ──▶ ENTERPRISE ──▶ CORPORATE
  (gratuit)   (payant)    (payant)    (payant)       (sur mesure)
```

| Tier | Élèves max | Features |
|------|------------|----------|
| FREEMIUM | 100 | Dashboard, élèves, classes, paiements, bulletin |
| STANDARD | 500 | + Devoirs, communications, convocations |
| PREMIUM | 2000 | + Tout |
| ENTERPRISE | Illimité | + Multi-écoles |
| CORPORATE | Illimité | + API, support dédié |

---

## 4. Authentification et sécurité

### Flux d'authentification

```
1. POST /api/auth { email, password }
   → Vérification bcrypt
   → Génération d'une session serveur (UUID aléatoire, fichier .sessions/, 24 h web — 30 j desktop via EDUGEST_SESSION_DAYS)
   → Réponse JSON { token } + cookie HTTP-only (edugest_token)
   → Réponse: { user, school, token }

2. Requêtes API suivantes
   → Header: Authorization: Bearer <token>
   → OU Cookie: edugest_token=<token> (web)
   → OU Authorization: Bearer <token> (web, mobile et desktop)
   → requireAuth() décode le token
   → Vérifie isActive + schoolId
```

### Sécurité

| Mesure | Implémentation |
|--------|----------------|
| Mots de passe | bcryptjs (12 rounds) |
| Tokens | UUID de session (128 bits, serveur uniquement), jamais décodable côté client |
| Cookies | HTTP-only, SameSite=Lax, Secure en prod |
| Rate limiting | 30 requêtes/15min par IP, 5 tentatives login/15min |
| Chiffrement API | AES-256-GCM pour les clés de passerelles |

| CSRF | SameSite cookies + origin checking |
| Headers | X-Frame-Options, X-Content-Type-Options, Referrer-Policy |
| Anti-énumération | Messages d'erreur identiques pour email inexistant/mot de passe faux |
| Vérification documents | QR code unique par PDF officiel |

### Modèle de sécurité serveur (RBAC & multi-tenant)

La sécurité est **imposée côté API** (`src/lib/auth.ts`, `src/lib/feature-gate.ts`) — l'interface ne fait que la refléter :

- **Hiérarchie de privilèges** (`ROLE_LEVELS`) : personne ne peut créer, promouvoir, modifier le mot de passe ni désactiver un compte d'un niveau supérieur ou égal au sien (`canCreateRole`, `canChangeUserRole`, `canManageUserAccount`).
- **Matrice de création de rôles** : seul SUPER_ADMIN_GLOBAL crée SCHOOL_ADMIN/ADMIN_FREEMIUM/SUPER_ADMIN_GLOBAL ; un SECRETARY ne peut créer que des rôles strictement inférieurs ; DISCIPLINE_* uniquement TEACHER/HEAD_TEACHER.
- **Isolation multi-écoles** : le `schoolId` envoyé par le client n'est JAMAIS considéré — chaque route force `user.schoolId` (ou `verifySchoolAccess`) ; le `schoolId` d'un compte est immuable pour tout non-SAG (PUT /api/users).
- **Parent (IDOR)** : un parent n'accède qu'aux données (`students`, `medical/records`, `payments`, `convocations`, `bulletins`) des enfants où `student.parentId === user.id`, vérifié serveur.
- **Restrictions par forfait** : `getEffectivePermissions` retire (FREEMIUM/ESSENTIEL) les permissions payantes pour TOUS les rôles rattachés à une école ; `requireFeature(feature)` (communications, convocations, homework, discipline, report_cards, medical, class-passing…) renvoie 403 + `tierRequired` si le forfait n'inclut pas la fonctionnalité. Une fonctionnalité masquée dans l'UI l'est aussi dans l'API.
- **Abonnements** : montée de forfait réservée au SUPER_ADMIN_GLOBAL (validation du paiement) ; un SCHOOL_ADMIN ne peut que rétrograder (`/api/subscription/downgrade`) ; l'activation (`/api/payments/subscription/renew`) exige une demande d'abonnement PAYÉE ; les webhooks de paiement/abonnement exigent une signature HMAC (`x-webhook-signature`, secret obligatoire en production).
- **Anti-énumération** : login/OTP/forgot-password renvoient des messages génériques ; OTP limité par IP et par compte.
- **Tests** : `node scripts/security-tests/run-security-tests.mjs <baseUrl>` — 31 vérifications (auth, escalade, isolation, IDOR parent, abonnement) ; exécutées par `.github/workflows/ci.yml`.
- **Desktop** : le serveur Next standalone embarqué exécute exactement le même code (aucun RBAC dupliqué) ; sessions dans `%APPDATA%/EduGest/.sessions` (EDUGEST_SESSIONS_DIR), SQLite par installation (`template.db` vierge généré par CI), agent WhatsApp lié à 127.0.0.1 avec clé aléatoire par installation.

### Variables d'environnement critiques

```env
DATABASE_URL=file:./db/custom.db
WHATSAPP_API_KEY=<secret>          # Partagé entre Next.js et serveur WhatsApp
PAYMENT_KEYS_SECRET=<32-chars>     # Clé AES-256-GCM pour chiffrer les clés API
WHATSAPP_CORS_ORIGINS=http://localhost:3000
```

---

## 5. Système de rôles et permissions

### Rôles (15)

| Rôle | Niveau | Description |
|------|--------|-------------|
| `SUPER_ADMIN_GLOBAL` | Plateforme | Accès total, gère toutes les écoles |
| `SCHOOL_ADMIN` | École | Admin de l'école, gère tout sauf config paiement |
| `SECRETARY` | École | Inscriptions, paiements, communications |
| `CASHIER` | École | Gestion des paiements uniquement |
| `DIRECTION_MATERNELLE` | École | Direction maternelle |
| `DIRECTION_PRIMAIRE` | École | Direction primaire |
| `DIRECTION_SECONDAIRE` | École | Direction secondaire |
| `DISCIPLINE_MATERNELLE` | École | Discipline maternelle |
| `DISCIPLINE_PRIMAIRE` | École | Discipline primaire |
| `DISCIPLINE_SECONDAIRE` | École | Discipline secondaire |
| `TEACHER` | École | Enseignant (notes, devoirs) |
| `HEAD_TEACHER` | École | Chef de classe (+ bulletins) |
| `PARENT` | École | Parent d'élève (lecture) |
| `MEDICAL` | École | Compte médical (dispenses) |
| `EPS` | École | Compte EPS/éducation physique (dispenses) |

### Permissions (43)

```typescript
// Exemples de permissions
'school:read', 'school:update'
'users:read', 'users:create', 'users:update', 'users:delete'
'students:read', 'students:create', 'students:update', 'students:delete'
'classes:read', 'classes:create', 'classes:update'
'grades:read', 'grades:create'
'payments:read', 'payments:create', 'payments:verify', 'payments:update'
'discipline:read', 'discipline:create'
'communications:read', 'communications:create'
'homework:read', 'homework:create'
'convocations:read', 'convocations:create'
'bulletin:read', 'bulletin:create'
'stats:read', 'profile:read', 'profile:update'
'payment-gateways:manage', 'currency:manage', 'transactions:read'
```

### Vues accessibles par rôle (exemples)

| Rôle | Vues principales |
|------|------------------|
| SUPER_ADMIN_GLOBAL | dashboard, schools, personnel, students, classes, grades, payments, payment-verification, payment-config, pricing, discipline, communications, homework, bulletin, convocation, whatsapp-config, parent-qr, parents, personalization, settings, profile |
| SCHOOL_ADMIN | dashboard, students, classes, grades, payments, payment-verification, discipline, homework, communications, convocation, class-passing, bulletin, parent-qr, parents, personalization, my-subscription, settings, profile |
| SECRETARY | dashboard, students, classes, communications, payment-verification, class-passing, parent-qr, my-subscription, settings, profile |
| PARENT | dashboard, grades, bulletin, online-payment, payment-verification, discipline, homework, communications, school-reviews, profile, convocation |
| TEACHER | dashboard, classes, grades, homework, communications, profile |

---

## 6. API Routes

### Routes d'authentification

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/auth` | Connexion (email/password) |
| POST | `/api/auth/whatsapp` | Connexion via WhatsApp |
| GET | `/api/auth/me` | Profil utilisateur connecté |
| POST | `/api/auth/logout` | Déconnexion |
| POST | `/api/auth/refresh` | Renouveler le token |
| POST | `/api/auth/switch-school` | Changer d'école (multi-école) |
| GET | `/api/auth/devices` | Liste des appareils connectés |
| POST | `/api/auth/revoke` | Révoquer un appareil |

### Routes CRUD principales

| Ressource | Routes | Description |
|-----------|--------|-------------|
| `/api/students` | GET, POST, PUT, DELETE | Gestion des élèves |
| `/api/classes` | GET, POST, PUT, DELETE | Gestion des classes |
| `/api/grades` | GET, POST, PUT | Saisie et consultation des notes |
| `/api/subjects` | GET, POST, PUT | Gestion des matières |
| `/api/payments` | GET, POST, PUT | Paiements frais scolaires |
| `/api/homeworks` | GET, POST, PUT | Devoirs |
| `/api/communications` | GET, POST | Messages internes |
| `/api/convocations` | GET, POST, PUT | Convocations parents |
| `/api/discipline` | GET, POST | Discipline |
| `/api/bulletins` | GET, POST | Bulletins et rapports |
| `/api/users` | GET, POST, PUT | Utilisateurs |
| `/api/schools` | GET, POST, PUT | Écoles (admin plateforme) |
| `/api/notifications` | GET, PUT | Notifications in-app |

### Routes spécialisées

| Route | Description |
|-------|-------------|
| `/api/class-passing` | Passage de classe (système scolaire) |
| `/api/class-passing/repechage` | Examens de repêchage |
| `/api/dispenses` | Élèves dispensés (EPS/médical) |
| `/api/platform-events` | Événements plateforme |
| `/api/platform-payment-gateways` | Config passerelles paiement |
| `/api/whatsapp-api` | API WhatsApp personnalisée |
| `/api/whatsapp/usage` | Compteur quota WhatsApp |
| `/api/school-qr-codes` | QR codes inscription parents |
| `/api/school/design` | Personnalisation design école |
| `/api/school/import-db` | Import de base de données |
| `/api/public/find-child` | Recherche d'enfant (parent) |
| `/api/public/parent-register` | Inscription parent |
| `/api/public/schools` | Liste publique des écoles |
| `/api/verify/document/[code]` | Vérification document officiel |
| `/api/payments/subscription/renew` | Renouvellement abonnement |
| `/api/payments/subscription/downgrade` | Downgrade abonnement |
| `/api/subscription/request` | Demande d'upgrade |
| `/api/students/[id]/parent-account` | Compte parent d'un élève |
| `/api/bulletins/[studentId]/whatsapp` | Envoi bulletin WhatsApp |

---

## 7. Fonctionnalités

### Gestion scolaire

- **Élèves** : inscriptions, profils avec photos, recherche, filtres par classe/section, matricule unique
- **Classes** : création, affectation d'enseignants, capacité, options/filières
- **Matières** : gestion par section avec coefficient
- **Affectation enseignants** : many-to-many (enseignant × classe × matière)
- **Années scolaires** : multi-années, archivage
- **Systèmes scolaires** : classes+options+horaires, passage de classe
- **Repêchage** : examens pour élèves avec moyenne < 10/20
- **Dispenses** : élèves dispensés de cours (EPS/médical)

### Notes et bulletins

- **Saisie de notes** : par matière/classe, score 0-20, commentaires
- **Moyennes** : calcul automatique, classement par moyenne
- **Bulletins** : génération PDF premium (double bordure navy/or, logos, QR code)
- **Classement** : classement par moyenne, décision (admis/ajourné/repêchage)
- **Verrouillage** : déverrouillage des bulletins par la direction
- **Fiches médicales** : PDF avec IDs uniques et vérification universelle

### Paiements

- **Frais scolaires** : tranches T1/T2/T3, montants par classe
- **Paiements en ligne** : 8 passerelles (DPO, Visa, Mastercard, M-Pesa, Orange Money, Airtel Money, Flutterwave, Bictorys)
- **Vérification de reçus** : scan QR code du reçu
- **Dettes** : suivi des arriérés par élève
- **Multi-devises** : conversion automatique, taux de change
- **Reçus PDF** : design premium avec QR code officiel

### Communication

- **Messagerie interne** : envoi aux parents/personnel
- **Notifications in-app** : cloche cliquable avec navigation directe
- **WhatsApp** : notifications automatiques (convocations, paiements, notes)
- **Web Push** : notifications push navigateur
- **Convocations** : création par la direction, réponse parent

### Discipline

- **Liste Noire** : cas graves (exclusion)
- **Liste Grise** : cas moyens
- **Liste Blanche** : cas positifs
- **Classification automatique** : mots-clés et sévérité
- **Dashboard** : statistiques par type avec navigation directe

### Application de bureau

- **Base locale** : SQLite embarquée, 100% hors ligne
- **Import de base** : import d'une base existante (fusion intelligente)
- **QR codes parents** : génération avec durée de vie paramétrable
- **Bulletins/reçus officiels** : PDF avec QR code de vérification
- **Windows** : installateur NSIS + version portable
- **Splash screen** : écran de démarrage rapide

---

## 8. Intégrations

### WhatsApp

**Option 1 : Agent WhatsApp EduGest** (recommandé pour le dev)
- Serveur Baileys sur port 3001
- Scan QR code pour connecter
- Quota mensuel configurable

**Option 2 : API WhatsApp Meta Cloud** (recommandé pour la prod)
- Configuration par école (Phone Number ID, Access Token)
- Messages via le numéro de l'école
- Pas de limite mensuelle EduGest

### Passerelles de paiement

| Passerelle | Marché | Devise |
|------------|--------|--------|
| DPO | RDC/Afrique | USD, CDF |
| M-Pesa | RDC/Afrique | CDF |
| Orange Money | RDC/Afrique | CDF |
| Airtel Money | RDC/Afrique | CDF |
| Visa | International | USD, EUR |
| Mastercard | International | USD, EUR |
| Flutterwave | Afrique | Multi-devises |
| Bictorys | RDC/Afrique | Wave, Orange Money, cartes |

### Vérification de documents

Chaque PDF généré (bulletin, reçu, fiche médicale) embarque un QR code unique pointant vers `/verify/document/{code}`. La page de vérification confirme que le document est officiel et en décrit le contenu.

---

## 9. Déploiement

### Prérequis

- Node.js 18+ (recommandé 20+)
- npm ou Bun
- Git

### Installation

```bash
# 1. Cloner
git clone https://github.com/vodi72089-eng/edugest.git
cd edugest

# 2. Installer les dépendances
npm install

# 3. Configurer l'environnement
copy .env.example .env
# Éditer .env avec les vraies valeurs

# 4. Base de données
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts  # Données de test (optionnel)

# 5. Lancer
node start-all.js
```

### Commandes

| Commande | Description |
|----------|-------------|
| `node start-all.js` | Lance frontend + WhatsApp |
| `npm run dev` | Frontend seul (port 3000) |
| `npm run whatsapp` | Serveur WhatsApp (port 3001) |
| `npm run build` | Build de production (standalone) |
| `npm run start` | Serveur production |
| `npx prisma generate` | Générer le client Prisma |
| `npx prisma db push` | Synchroniser la base |
| `npx prisma db push --force-reset` | Réinitialiser la base |

### Build de production

```bash
# Build Next.js standalone
npm run build

# Le build sort dans .next/standalone/
# Copier les assets statiques
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/

# Lancer en production
NODE_ENV=production node .next/standalone/server.js
```

### Application de bureau (Windows)

```bash
# Build automatique via GitHub Actions (Release v1.4.0)
# Ou en local :
cd desktop
npm install
npm run dist
# → desktop/dist/EduGest-Setup-x.x.x.exe
# → desktop/dist/EduGest-Portable-x.x.x.exe
```

### Docker

```bash
docker-compose up -d
```

### Variables d'environnement

| Variable | Description | Défaut |
|----------|-------------|--------|
| `DATABASE_URL` | Chemin SQLite | `file:./db/custom.db` |
| `WHATSAPP_API_KEY` | Secret WhatsApp | — |
| `PAYMENT_KEYS_SECRET` | Clé AES-256-GCM | — |
| `WHATSAPP_CORS_ORIGINS` | Origines CORS | `http://localhost:3000` |
| `NODE_ENV` | Environnement | `development` |

---

## 10. Monitoring

### Logs

| Fichier | Description |
|---------|-------------|
| `dev.log` | Logs de développement |
| `server.log` | Logs de production |
| `whatsapp-server.log` | Logs WhatsApp |
| `wa-log.txt` | Logs WhatsApp détaillés |
| `wa-err.txt` | Erreurs WhatsApp |

### Endpoints de santé

| Route | Description |
|-------|-------------|
| `GET /api/health` | État du serveur |
| `GET /api/whatsapp-status` | État WhatsApp |

### Métriques à surveiller

- Temps de réponse API (cible: < 200ms)
- Taux d'erreur 5xx
- Utilisation mémoire (Node.js)
- Espace disque SQLite
- Quota WhatsApp envoyé/restant
- Transactions paiement (succès/échec)

---

## 11. Maintenance

### Sauvegarde de la base

```bash
# Sauvegarde SQLite
copy prisma\db\custom.db prisma\db\custom.db.backup-YYYY-MM-DD

# Ou via Prisma
npx prisma db pull  # Vérifier la synchronisation
```

### Mise à jour

```bash
git pull origin main
npm install
npx prisma generate
npx prisma db push
npm run build
# Redémarrer le serveur
```

### Reset de la base

```bash
npx prisma db push --force-reset
npx tsx prisma/seed.ts
```

### Comptes de démonstration

| Email | Mot de passe | Rôle |
|-------|-------------|------|
| `admin@edugest.app` | `admin123` | SUPER_ADMIN_GLOBAL |

---

## Annexe

### A. Changelog récent

| Version | Date | Changements |
|---------|------|-------------|
| v1.4.0 | Sept 2026 | Restauration logo officiel, connexion redesignée, splash desktop, WhatsApp stable, MCP Playwright |
| v1.3.0 | Sept 2026 | Logo officiel centralisé, localisation auto, splash desktop rapide |
| v1.2.0 | Sept 2026 | Desktop app, import DB, QR parents, bulletins/reçus avec QR officiel, login unifié |
| v1.1.0 | Sept 2026 | Desktop v1.2.0, fix exports manquants |
| v1.0.0 | Août 2026 | Système d'abonnement, passerelles paiement, personnalisation design |
| v0.9.0 | Août 2026 | Systèmes scolaires v2, passage de classe, repêchage |
| v0.8.0 | Juil 2026 | Discipline classification automatique, communications, WhatsApp |
| v0.7.0 | Juil 2026 | Paiements en ligne, frais scolaires, bulletins PDF |
| v0.6.0 | Juin 2026 | Gestion élèves, classes, notes, devoirs |
| v0.5.0 | Juin 2026 | Auth RBAC, dashboards par rôle |
| v0.4.0 | Juin 2026 | Landing page premium, design LUXE AFRICAIN |

---

*Document généré automatiquement. Pour les questions, contacter l'équipe de développement.*
