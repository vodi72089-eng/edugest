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

Le fichier `.env` est déjà configuré pour Windows :

```
DATABASE_URL=file:./db/custom.db
```

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

## Structure du projet

```
edugest/
├── prisma/          # Schema et migrations Prisma
├── src/             # Code source de l'application
├── public/          # Fichiers statiques
├── upload/          # Dossier d'uploads
├── db/              # Base de données SQLite
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
- **Authentification** : NextAuth.js
- **Languages** : TypeScript
