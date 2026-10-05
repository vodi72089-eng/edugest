# Application Desktop EduGest (EXE Windows)

## Vue d'ensemble

EduGest existe en deux versions qui partagent la **même base de données** :

| Version | Base de données | Usage |
|---------|-----------------|-------|
| **Web** (`edugest.eluymas82.workers.dev`) | **Neon** (cloud, PostgreSQL) | Navigateur, tout le monde |
| **Desktop** (EXE Windows) | **SQLite locale** (hors-ligne) → synchronisation Neon (phase B) | Ordinateur, fonctionne sans internet |

Le code est **commun** (`src/lib/db.ts`) : une branche détecte le type de base
(`file:` → SQLite pour l'EXE, `postgresql://` → Neon pour le web).

## Télécharger l'application

Un bouton **« Télécharger l'app (Windows) »** est présent sur la **page de connexion**
(`src/app/page.tsx`). Il pointe vers la dernière **Release GitHub** :

```
https://github.com/vodi72089-eng/edugest/releases/download/v1.4.12/EduGest-Setup-1.4.12.exe
```

- **`EduGest-Setup-<version>.exe`** — installateur Windows (recommandé).
- **`EduGest-Portable-<version>.exe`** — version portable (sans installation).

## Mise à jour automatique

L'EXE intègre **electron-updater** (provider GitHub). À chaque démarrage, il
vérifie la dernière Release GitHub via `latest.yml` et propose la mise à jour
dans l'app (bannière), sans quitter EduGest. Les données sont conservées.

## Architecture technique

```
┌─────────────────────────────────────────────────────────────┐
│ EXE Windows (Electron)                                      │
│  ├─ Serveur Next.js standalone (Node embarqué)              │
│  │   └─ src/lib/db.ts                                       │
│  │       ├─ DATABASE_URL=file:… → client SQLite (local)     │
│  │       └─ DATABASE_URL=postgresql://… → adaptateur Neon    │
│  ├─ Base SQLite locale : %APPDATA%/EduGest/edugest.db       │
│  └─ Agent WhatsApp embarqué (Baileys)                       │
└─────────────────────────────────────────────────────────────┘
```

### Branche SQLite (desktop)
- Schéma : `prisma/schema.sqlite.prisma` (60 modèles, miroir du schéma Postgres).
- Client généré : `src/generated/sqlite-client`.
- Template initiale : `db/desktop-template.db` (copiée au premier lancement).

### Branche Neon (web / Workers)
- Adaptateur hybride `NeonHybridFactory` (HTTP + pool WS éphémère par transaction).
- Voir `docs/MIGRATION-WORKERS-BLOCAGES.md`.

## Synchronisation cloud (phase B — planifiée)

**Objectif** : quand l'EXE est **en ligne**, pousser les changements locaux vers
Neon (pour que tout le monde les voie) et récupérer les changements des autres.
**Hors-ligne**, l'EXE utilise la base SQLite locale (fonctionne sans internet).

Statut : la **phase A** (EXE + bouton de téléchargement + GitHub Releases) est
livrée. La **phase B** (synchronisation hors-ligne ↔ cloud) est planifiée.

## Build & release

Le workflow GitHub Actions `.github/workflows/build-desktop.yml` construit et
publie l'EXE automatiquement à chaque push sur `main` (tag `v*`) :

1. `prisma db push` (SQLite) → template `db/desktop-template.db`.
2. `next build` → standalone.
3. `electron-builder --win` → EXE (NSIS + portable).
4. Publication sur GitHub Release (assets + `latest.yml`).

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `src/lib/db.ts` | Branche SQLite / Neon |
| `prisma/schema.sqlite.prisma` | Schéma SQLite (60 modèles) |
| `src/generated/sqlite-client` | Client Prisma SQLite généré |
| `db/desktop-template.db` | Template de base initiale |
| `desktop/main.js` | Electron (serveur local + DB) |
| `desktop/package.json` | Config electron-builder + auto-update |
| `.github/workflows/build-desktop.yml` | Build & release automatiques |
| `src/app/page.tsx` | Bouton « Télécharger l'app » |
