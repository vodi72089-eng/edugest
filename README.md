# EduGest

Application de gestion éducative complète pour écoles africaines — multi-rôles, WhatsApp, paiements mobiles, discipline, bulletins, convocations.

## Prérequis

- [Node.js](https://nodejs.org/) (v20+) — build Next.js et exécution du serveur de production
- [Bun](https://bun.sh/) (v1.1+) — **requis** : gestionnaire de dépendances (lockfile `bun.lock`) et runtime du serveur WhatsApp
- [Git](https://git-scm.com/)

## Installation

### 1. Cloner le dépôt

```bash
git clone https://github.com/vodi72089-eng/edugest.git
cd edugest
```

### 2. Installer les dépendances

```bash
bun install
```

> Le lockfile canonique est `bun.lock`. Le serveur WhatsApp (mini-service) a son propre lockfile dans `mini-services/whatsapp-server/`.

### 3. Configurer l'environnement

Copiez `.env.example` en `.env` et renseignez les valeurs :

```bash
copy .env.example .env
```

```
DATABASE_URL=file:./db/custom.db
```

Variables clés :
- `DATABASE_URL` — chemin SQLite (relatif au dossier `prisma/`)
- `WHATSAPP_API_KEY` — secret partagé entre Next.js et le serveur WhatsApp
- `PAYMENT_KEYS_SECRET` — clé de chiffrement AES-256-GCM des identifiants de passerelles de paiement
- `WHATSAPP_CORS_ORIGINS` — origines autorisées pour le serveur WhatsApp

### 4. Générer le client Prisma et créer la base

```bash
bunx prisma generate
bunx prisma db push
```

> **Données de démonstration** (écoles, utilisateurs, notes…) : lancez l'app puis appelez `GET http://localhost:3000/api/seed` (dev uniquement — bloqué en production). Compte super admin : `admin@edugest.app` / `admin123`.

### 5. Lancer l'application

```bash
node start-all.js        # Windows : ouvre 2 fenêtres (Next.js + WhatsApp)
```

Ou manuellement :

```bash
bun run dev              # Frontend (port 3000)
bun run whatsapp         # Serveur WhatsApp (port 3001)
```

Ouvrez **http://localhost:3000** dans votre navigateur — la connexion unifiée se trouve à la racine (`/`, pas de page `/login`).

> **Note Windows** : `next dev` doit être lancé avec `--webpack` (Turbopack incompatible sur win32/x64). `start-all.bat` et `start-all.js` le font déjà pour vous.

## Intégration WhatsApp (Baileys)

### Architecture

```
App Next.js (src/lib/whatsapp-agent.ts)
   │  HTTP + en-tête x-api-key (WHATSAPP_API_KEY)
   ▼
mini-services/whatsapp-server/index.ts  ← runtime Bun, port 3001
   │  @trashcore/baileys (4.2.2, épinglée)
   ▼
WhatsApp (session liée via pairing code ou QR)
```

- **Une seule implémentation Baileys** : `@trashcore/baileys` dans le mini-service. L'ancien client in-process (`@whiskeysockets/baileys`) a été supprimé.
- **Session persistante** : credentials stockés dans `whatsapp-auth/` (racine du projet, gitigné). Un redémarrage du serveur réutilise la session — pas de nouveau pairing nécessaire.
- **Anti-logout natsu** : reconnexion automatique sur 401/405/408/411/428/440/500/502/503/515/516 ; seul 403 (bannissement) est fatal.
- **Anti-boucles** : après 5 déconnexions `loggedOut` consécutives ou 3 cycles sans connexion, la reconnexion automatique s'arrête ou la session est réinitialisée. Backoff exponentiel plafonné à 60 s.
- **Version WA** : `fetchLatestBaileysVersion()` est appelé **une seule fois** par process puis mis en cache.
- **Socket unique** : un garde-fou empêche toute création de socket concurrent (démarrage simultané `/pair` ↔ reconnexion).

### Endpoints (en-tête `x-api-key` requis)

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/status` | GET | Statut, QR (data URL), téléphone connecté, code de pairing |
| `/start` | POST | Démarre le client WhatsApp |
| `/pair` | POST | `{ "phone": "243812345678" }` → génère un code de pairing `XXXX-XXXX` |
| `/send` | POST | `{ "phone", "message" }` → envoi texte (session connectée requise) |
| `/send-document` | POST | `{ "phone", "fileBase64", "filename", "mimetype", "caption?" }` → envoi document (≤16 Mo) |
| `/logout` | POST | Déconnecte et **efface** la session |
| `/reset` | POST | Efface la session et redémarre un client neuf |

### Flux de liaison (pairing code)

1. Dans l'app : **Connexion WhatsApp** → saisir le numéro au **format international sans `+`** (ex : `243812345678`).
2. L'app appelle `POST /pair` → validation du numéro → démarrage du socket → `requestPairingCode()`.
3. Un code `XXXX-XXXX` est renvoyé ; **saisissez-le dans WhatsApp mobile** (Appareils connectés → Connecter un appareil → Connecter avec le numéro de téléphone) sous ~2 minutes.
4. La connexion s'établit (`connection.update: open`), les credentials sont sauvegardés automatiquement.

> ⚠️ **Rate-limit** : une seule demande de code toutes les 30 s (réponse 429 sinon). Si WhatsApp répond 428 (limite serveur), patientez quelques minutes.

### Runtime

Le serveur WhatsApp tourne **sous Bun** (`bun --hot` en dev). `patch.mjs` applique un correctif idempotent à `@trashcore/baileys` 4.2.2 (const → let dans `luxu.js`, refusé par le transpileur Bun) — il s'exécute automatiquement à chaque démarrage.

En Docker, le service `whatsapp` (docker-compose) embarque Baileys avec sa session persistée dans le volume `./whatsapp-auth`.

## Rôles et permissions

| Rôle | Description |
|------|-------------|
| `SUPER_ADMIN_GLOBAL` | Administrateur global plateforme — gestion SaaS et multi-écoles |
| `SCHOOL_ADMIN` | Administrateur principal d'école — gestion 360° de l'établissement |
| `MEDICAL` | Service Médical / Infirmier(ère) — santé scolaire, infirmerie, allergies, dispenses (dès Professionnel) |
| `SECRETARY` | Secrétaire — inscriptions, paiements (lecture seule), communications |
| `CASHIER` | Caisse — gestion des paiements et des dettes |
| `DIRECTION_MATERNELLE` | Direction maternelle — convocations, discipline, notes, communications |
| `DIRECTION_PRIMAIRE` | Direction primaire — idem |
| `DIRECTION_SECONDAIRE` | Direction secondaire — idem |
| `DISCIPLINE_MATERNELLE` | Discipline maternelle — gestion des listes disciplinaires |
| `DISCIPLINE_PRIMAIRE` | Discipline primaire — idem |
| `DISCIPLINE_SECONDAIRE` | Discipline secondaire — idem |
| `TEACHER` | Enseignant — notes, devoirs, classes |
| `HEAD_TEACHER` | Chef de classe / Titulaire — idem + bulletins |
| `PARENT` | Parent — bulletins, discipline, devoirs, convocations, paiements (notes selon abonnement) |

## Fonctionnalités

### Gestion scolaire
- **Élèves** — inscriptions, profils avec photos, recherche, filtres par classe/section, matricule unique
- **Classes** — création, affectation d'enseignants, capacité, options/filières
- **Matières** — gestion par section avec coefficient
- **Affectation enseignants** — many-to-many (enseignant × classe × matière)
- **Années scolaires** — multi-années, archivage
- **Systèmes scolaires** — classes+options+horaires, passage de classe
- **Repêchage** — examens pour élèves avec moyenne < 10/20
- **Dispenses** — élèves dispensés de cours (EPS/médical)
- **Notes** — saisie par matière/classe, moyennes, classement, filtres trimestre
- **Bulletins** — génération PDF premium (double bordure navy/or, logos, QR code officiel)
- **Fiches médicales** — PDF avec IDs uniques et vérification universelle
- **Devoirs** — création, soumission, correction, suivi de lecture

### Communication
- **Messagerie interne** — envoi aux parents/personnel, statut PENDING/APPROVED/REJECTED
- **Notifications in-app** — cloche cliquable avec navigation directe
- **WhatsApp** — notifications automatiques (convocations, paiements, notes)
- **Convocations** — création par la direction, réponse parent (présent/absent/reporter)

### Paiements
- **Frais scolaires** — tranches T1/T2/T3, suivi des paiements
- **Paiements en ligne** — DPO, Visa, Mastercard, Flutterwave, M-Pesa, Orange Money, Airtel Money, Bictorys
- **Multi-devises** — conversion automatique, 10 devises supportées
- **Vérification de reçus** — scan code QR du reçu (document officiel)
- **Reçus PDF** — design premium avec QR code de vérification
- **Dettes** — suivi des arriérés par élève
- **Notifications paiement** — alertes pour la caisse et l'administration

### Discipline
- **Liste Noire** — cas graves
- **Liste Grise** — cas moyens
- **Liste Blanche** — cas positifs
- **Classification automatique** — mots-clés et sévérité
- **Dashboard** — statistiques par type avec navigation directe

### Administration
- **Paramètres** — configuration école, couleurs, langue, design personnalisable
- **Approbation paramètres** — les non-admins soumettent, les admins valident
- **Statistiques** — dashboards par rôle avec données en temps réel
- **Affectation enseignants** — gestion admin des matières/classes par enseignant
- **Abonnements** — FREEMIUM/STANDARD/PREMIUM/ENTERPRISE/CORPORATE

### Application de bureau
- **Base locale** — SQLite embarquée, 100% hors ligne
- **Import de base** — import d'une base existante (fusion intelligente)
- **QR codes parents** — génération avec durée de vie paramétrable
- **Bulletins/reçus officiels** — PDF avec QR code de vérification
- **Windows** — installateur NSIS + version portable

### Sécurité
- **Auth RBAC** — 15 rôles, 43 permissions, tokens JWT
- **Chiffrement** — AES-256-GCM pour les clés API
- **Vérification documents** — QR code unique par PDF officiel
- **Rate limiting** — protection brute-force

## Structure du projet

```
edugest/
├── prisma/
│   ├── schema.prisma          # Modèles de données
│   ├── db/custom.db           # Base SQLite
│   └── migrations/            # Migrations Prisma
├── src/
│   ├── app/
│   │   ├── page.tsx           # Application principale (connexion unifiée à la racine)
│   │   └── api/               # 50+ routes API
│   ├── components/
│   │   ├── dashboards/        # Dashboards par rôle
│   │   └── views/             # Vues métier (30+ composants)
│   └── lib/
│   │   ├── store.ts           # Zustand store
│   │   ├── auth.ts            # Authentification & permissions
│   │   ├── db.ts              # Client Prisma
│   │   ├── whatsapp-agent.ts  # Client HTTP vers le serveur WhatsApp
│   │   └── types.ts           # Types TypeScript
├── mini-services/
│   └── whatsapp-server/       # Serveur WhatsApp Baileys (port 3001, Bun)
│       ├── index.ts           # Implémentation (pairing, anti-logout, envoi)
│       ├── patch.mjs          # Patch idempotent de la lib Baileys
│       └── Dockerfile         # Image du service WhatsApp (docker compose)
├── whatsapp-auth/             # Session Baileys (gitigné, persistante)
├── start-all.js / .bat        # Lance les deux serveurs
├── Dockerfile                 # Image Next.js (build Bun, runtime Node 20)
└── package.json
```

## Commandes disponibles

| Commande | Description |
|----------|-------------|
| `node start-all.js` | Lance frontend + WhatsApp (Windows : fenêtres séparées) |
| `bun run dev` | Frontend seul (port 3000) |
| `bun run whatsapp` | Serveur WhatsApp (port 3001, patch + hot reload) |
| `bun run whatsapp:start` | Serveur WhatsApp sans hot reload |
| `bun run build` | Build de production (standalone) |
| `bunx prisma generate` | Générer le client Prisma |
| `bunx prisma db push` | Synchroniser la base |
| `bunx prisma db push --force-reset` | Réinitialiser la base |
| `GET /api/seed` (dev) | Peupler la base de démonstration |

## Stack technique

- **Framework** : Next.js 16 + React 19
- **Base de données** : SQLite (Prisma ORM, 43 modèles)
- **State** : Zustand
- **Styling** : Tailwind CSS — thème LUXE AFRICAIN (oklch, or/vert, motifs Kente, glassmorphism)
- **Authentification** : tokens JWT signés + RBAC complet (15 rôles, 43 permissions)
- **WhatsApp** : Baileys (`@trashcore/baileys` 4.2.2, serveur autonome Bun, port 3001) + Meta Cloud API
- **Paiements** : DPO, Visa, Mastercard, Flutterwave, M-Pesa, Orange Money, Airtel Money, Bictorys
- **Desktop** : Electron 33 (Windows .exe, NSIS + portable)
- **Devise** : sélection multi-devises avec conversion (10 devises)
- **Languages** : TypeScript

## Documentation

- **[Documentation technique complète](docs/PRODUCTION.md)** — architecture, API, déploiement, maintenance
- **[Application de bureau](DESKTOP.md)** —构建 .exe, import DB, QR parents
- **Languages** : TypeScript
