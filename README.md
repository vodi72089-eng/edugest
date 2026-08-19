# EduGest

Application de gestion éducative complète pour écoles africaines — multi-rôles, WhatsApp, paiements mobiles, discipline, bulletins, convocations.

## Prérequis

- [Node.js](https://nodejs.org/) (v18+)
- npm (recommandé sur Windows)
- [Git](https://git-scm.com/)

## Installation

### 1. Cloner le dépôt

```bash
git clone https://github.com/vodi72089-eng/edugest.git
cd edugest
```

### 2. Installer les dépendances

```bash
npm install
```

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
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts
```

### 5. Lancer l'application

```bash
node start-all.js
```

Ou manuellement :

```bash
npm run dev          # Frontend (port 3000)
npm run whatsapp     # Serveur WhatsApp (port 3001)
```

Ouvrez **http://localhost:3000** dans votre navigateur.

> **Note Windows** : `next dev` doit être lancé avec `--webpack` (Turbopack incompatible sur win32/x64).

## Rôles et permissions

| Rôle | Description |
|------|-------------|
| `SUPER_ADMIN_GLOBAL` | Administrateur global — accès total |
| `SECRETARY` | Secrétaire — inscriptions, paiements (lecture seule), communications |
| `CASHIER` | Caisse — gestion des paiements |
| `DIRECTION_MATERNELLE` | Direction maternelle — convocations, discipline, notes, communications |
| `DIRECTION_PRIMAIRE` | Direction primaire — idem |
| `DIRECTION_SECONDAIRE` | Direction secondaire — idem |
| `DISCIPLINE_MATERNELLE` | Discipline maternelle — gestion des listes disciplinaires |
| `DISCIPLINE_PRIMAIRE` | Discipline primaire — idem |
| `DISCIPLINE_SECONDAIRE` | Discipline secondaire — idem |
| `TEACHER` | Enseignant — notes, devoirs, classes |
| `HEAD_TEACHER` | Chef de classe — idem + bulletins |
| `PARENT` | Parent — notes, bulletins, discipline, devoirs, convocations, paiements |

## Fonctionnalités

### Gestion scolaire
- **Élèves** — inscriptions, profils avec photos, recherche, filtres par classe/section
- **Classes** — création, affectation d'enseignants, effectifs
- **Matières** — gestion par section (Maternelle/Primaire/Secondaire)
- **Enseignants** — affectation matières/classes via le système d'affectation
- **Notes** — saisie par matière/classe, moyennes, classement, filtres trimestre
- **Bulletins** — génération PDF, commentaires, classement par moyenne
- **Devoirs** — création, soumission, correction, suivi de lecture

### Communication
- **Messagerie interne** — envoi aux parents/personnel, statut PENDING/APPROVED/REJECTED
- **Notifications in-app** — cloche cliquable avec navigation directe
- **WhatsApp** — notifications automatiques (convocations, paiements, notes)
- **Convocations** — création par la direction, réponse parent (présent/absent/reporter)

### Paiements
- **Frais scolaires** — tranches T1/T2/T3, suivi des paiements
- **Paiements en ligne** — DPO, Stripe, PayPal, Flutterwave, M-Pesa, Orange Money
- **Vérification de reçus** — scan code QR du reçu
- **Dettes** — suivi des arriérés par élève
- **Notifications paiement** — alertes pour la caisse et l'administration

### Discipline
- **Liste Noire** — cas graves
- **Liste Grise** — cas moyens
- **Liste Blanche** — cas positifs
- **Classification automatique** — mots-clés et sévérité
- **Dashboard** — statistiques par type avec navigation directe

### Administration
- **Paramètres** — configuration école, couleurs, langue
- **Approbation paramètres** — les non-admins soumettent, les admins valident
- **Statistiques** — dashboards par rôle avec données en temps réel
- **Affectation enseignants** — gestion admin des matières/classes par enseignant

## Structure du projet

```
edugest/
├── prisma/
│   ├── schema.prisma          # Modèles de données
│   ├── db/custom.db           # Base SQLite
│   └── seed.ts                # Données de test
├── src/
│   ├── app/
│   │   ├── page.tsx           # Application principale (5700+ lignes)
│   │   └── api/               # 50+ routes API
│   ├── components/
│   │   ├── dashboards/        # Dashboards par rôle
│   │   └── views/             # Vues métier (30+ composants)
│   └── lib/
│       ├── store.ts           # Zustand store
│       ├── auth.ts            # Authentification & permissions
│       ├── db.ts              # Client Prisma
│       ├── helpers.ts         # Utilitaires
│       └── types.ts           # Types TypeScript
├── whatsapp-server.ts         # Serveur WhatsApp (Baileys)
├── start-all.js               # Lance les deux serveurs
└── package.json
```

## Commandes disponibles

| Commande | Description |
|----------|-------------|
| `node start-all.js` | Lance frontend + WhatsApp |
| `npm run dev` | Frontend seul (port 3000) |
| `npm run whatsapp` | Serveur WhatsApp (port 3001) |
| `npm run build` | Build de production |
| `npx prisma generate` | Générer le client Prisma |
| `npx prisma db push` | Synchroniser la base |
| `npx prisma db push --force-reset` | Réinitialiser la base |
| `npx tsx prisma/seed.ts` | Peupler la base de test |

## Stack technique

- **Framework** : Next.js 16 + React 19
- **Base de données** : SQLite (Prisma ORM)
- **State** : Zustand
- **Styling** : Tailwind CSS — thème LUXE AFRICAIN (oklch, or/vert, motifs Kente, glassmorphism)
- **Authentification** : tokens JWT signés + sessions fichier, RBAC complet
- **WhatsApp** : Baileys (serveur autonome, port 3001)
- **Paiements** : DPO, Stripe, PayPal, Flutterwave, M-Pesa, Orange Money, Airtel Money
- **Devise** : sélection multi-devises avec conversion
- **Languages** : TypeScript
