# EduGest Desktop — Application de bureau

EduGest est disponible en **application de bureau** (Windows .exe) avec sa
**base de données locale connectée** : l'école fonctionne 100 % hors ligne,
les données (élèves, classes, notes, paiements) sont stockées localement.

## Comment ça marche

1. **Base de données connectée** : au premier lancement, une base SQLite
   (`edugest.db`) est créée dans le dossier de données de l'utilisateur
   (`%APPDATA%\EduGest\` sur Windows). Toute l'application utilise cette base.
2. **Serveur local intégré** : l'app embarque le serveur Next.js (build
   standalone) démarré automatiquement sur un port local libre.
3. **Import de votre base** : depuis l'onglet **« Trouver mon école »** de la
   page de connexion, l'administrateur importe son fichier de base de données
   EduGest (`.db`) — élèves, classes, matières, notes, professeurs et frais
   deviennent directement la base de données de son école.
4. **QR codes parents** : l'admin génère un QR code (durée de vie choisie :
   1 h → 1 an) ; le parent le scanne, retrouve son enfant (classe + nom) et
   crée son compte. Les identifiants peuvent aussi être écrits à la main,
   élève par élève, dans la fiche de l'élève.
5. **Bulletins & reçus officiels** : PDF au design premium (double bordure
   navy/or), logos de l'école **et** d'EduGest, et **QR code unique** par
   document — le scan ouvre une page qui confirme que le document est
   officiel et en décrit le contenu.

## Construire le .exe (Windows)

### Option A — Release GitHub (recommandé, zéro effort) ✅

À chaque push sur `main`, le workflow `.github/workflows/build-desktop.yml`
construit automatiquement les deux exécutables et les publie **directement
dans la Release GitHub** (`v1.2.0` = version de `desktop/package.json`) :

1. Ouvrez la page **Releases** du dépôt : https://github.com/vodi72089-eng/edugest/releases
2. Téléchargez :
   - **`EduGest-Setup-1.2.0.exe`** — installateur (recommandé)
   - **`EduGest-Portable-1.2.0.exe`** — version portable sans installation
3. Lancez l'exe : EduGest démarre avec sa base locale intégrée.

> Pour publier une nouvelle version : augmentez `version` dans
> `desktop/package.json` et poussez sur `main` — la Release est mise à jour
> automatiquement avec les nouveaux exe.

### Option B — via GitHub Actions (artefact brut)

Le workflow `.github/workflows/build-desktop.yml` construit automatiquement
l'installateur et l'exécutable portable à chaque push sur `main` (ou
manuellement via *Run workflow*) :

1. Ouvrez l'onglet **Actions** du dépôt GitHub.
2. Sélectionnez le workflow **Build Desktop (Windows exe) → Release**.
3. Téléchargez l'artefact **EduGest-Windows** (contient `EduGest Setup.exe`
   et `EduGest-Portable.exe`).

### Option C — en local (machine Windows)

```bash
# 1. Prérequis : Node.js 20+, Bun (ou npm), Git
bun install                 # dépendances Next.js
bunx prisma generate        # client Prisma (moteur Windows)
set DATABASE_URL=file:./db/desktop-template.db
bun run db:push             # crée la base template embarquée
bun run build               # build Next.js standalone (+ copie static & public)

# 2. Packager l'app desktop
cd desktop
npm install                 # electron + electron-builder
npm run dist                # → desktop/dist/EduGest-Setup-1.2.0.exe + EduGest-Portable-1.2.0.exe
```

### Option D — tester en mode dev (sans build Next)

```bash
bun run build               # le mode desktop exige le build standalone
cd desktop && npm install && npm start
```

## Fichiers

| Fichier | Rôle |
|---|---|
| `desktop/main.js` | Process principal Electron : base locale, serveur Next, fenêtre |
| `desktop/package.json` | Configuration electron-builder (cibles NSIS + portable) |
| `db/desktop-template.db` | Base SQLite embarquée (schéma complet Prisma) |
| `.github/workflows/build-desktop.yml` | Build automatique du .exe sur GitHub |

## Données & sécurité

- La base locale reste dans le dossier de l'utilisateur — désinstaller l'app
  ne supprime PAS les données (`deleteAppDataOnUninstall: false`).
- L'admin peut à tout moment importer une nouvelle base (fusion intelligente
  sans doublons : classes/élèves/notes déjà présents sont conservés).
- Les QR codes parents ont une **durée de vie** paramétrable et sont
  révocables à tout moment.
