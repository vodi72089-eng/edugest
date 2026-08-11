# EduGest

Application de gestion éducative développée avec Next.js, Prisma et Tailwind CSS.

## Prérequis

- [Node.js](https://nodejs.org/) (v18+)
- [Bun](https://bun.sh/) (recommandé) ou npm/yarn
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

Ou avec npm :
```bash
npm install
```

### 3. Configurer l'environnement

Copiez `.env.example` en `.env` et renseignez les valeurs :

```bash
copy .env.example .env   # Windows
```

```
DATABASE_URL=file:./db/custom.db
```

Variables clés :
- `DATABASE_URL` — chemin SQLite (relatif au dossier `prisma/`, soit `prisma/db/custom.db`)
- `WHATSAPP_API_KEY` — secret partagé entre Next.js et le serveur WhatsApp (`openssl rand -hex 24`)
- `PAYMENT_KEYS_SECRET` — clé de chiffrement AES-256-GCM des identifiants de passerelles de paiement (`openssl rand -hex 32`) — obligatoire en production
- `WHATSAPP_CORS_ORIGINS` — origines autorisées pour le serveur WhatsApp (ex. `http://localhost:3000`)

### 4. Générer le client Prisma

```bash
bunx prisma generate
```

### 5. Créer la base de données

```bash
bunx prisma db push
```

### 6. Lancer le serveur

```bash
bun run dev
```

Ouvrez **http://localhost:3000** dans votre navigateur.

> **Note Windows** : `next dev` doit être lancé avec `--webpack` (Turbopack est
> incompatible sur Windows avec la version actuelle de next-swc). Le script
> `run-dev.sh` et `npm run dev` s'en chargent.

## Mini-services

Le projet inclut un serveur WhatsApp autonome (port 3001) :

| Service | Fichier | Lancement |
|---------|---------|-----------|
| Serveur WhatsApp (legacy, whatsapp-web.js) | `whatsapp-server.js` | `start-all.bat` |
| Serveur WhatsApp (baileys) | `whatsapp-server.ts` | `npm run whatsapp` |

Tous les endpoints du serveur WhatsApp exigent le header `x-api-key` (valeur de
`WHATSAPP_API_KEY`). Le navigateur ne parle jamais au serveur WhatsApp
directement : il passe par le proxy API `/api/whatsapp-status` de Next.js, qui
injecte la clé côté serveur. Les clés de passerelles de paiement sont chiffrées
au repos avec `PAYMENT_KEYS_SECRET`.

## Structure du projet

```
edugest/
├── prisma/          # Schema et migrations Prisma (+ prisma/db/custom.db)
├── src/             # Code source de l'application
├── public/          # Fichiers statiques
├── upload/          # Dossier d'uploads
├── .sessions/       # Sessions de connexion (tokens signés)
├── .zscripts/       # Scripts de déploiement legacy
└── package.json
```

## Commandes disponibles

| Commande | Description |
|----------|-------------|
| `bun run dev` | Lancer le serveur de développement |
| `bun run build` | Build de production |
| `bun run lint` | Vérifier le code |
| `bunx prisma db push` | Synchroniser la base de données |
| `bunx prisma migrate dev` | Créer une migration |
| `bunx prisma db reset` | Réinitialiser la base |

## Stack technique

- **Framework** : Next.js 16
- **Base de données** : SQLite (Prisma ORM)
- **Styling** : Tailwind CSS + Shadcn/UI
- **Authentification** : personnalisée (tokens signés + sessions en fichier, rôles et permissions)
- **WhatsApp** : whatsapp-web.js (legacy) + baileys (serveurs autonomes, port 3001)
- **Paiements** : DPO, Stripe, PayPal, Flutterwave, M-Pesa, Orange Money, Airtel Money (clés chiffrées au repos)
- **Languages** : TypeScript
