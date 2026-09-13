# EduGest / Destock

Plateforme scolaire d'excellence adaptée du dépôt [edugest](https://github.com/vodi72089-eng/edugest/) — Stack Emergent (React + FastAPI + MongoDB).

## Fonctionnalités livrées
- **Trouver mon école** (recherche publique) + **Login** (Admin / Enseignant / Parent)
- **Enregistrer une école** (auto-création admin + école)
- **Admin Dashboard** avec 6 onglets :
  - Vue d'ensemble
  - **Import Base** (CSV / JSON) — synchronise directement la DB Destock
  - **Élèves & Parents** — CRUD élèves, création manuelle du compte parent (nom + mot de passe par élève)
  - **QR Parent** — génération QR code avec durée personnalisée (1h, 24h, 7j, 30j, 1 an) + révocation
  - **Bulletin PDF** — jsPDF luxe avec QR code unique
  - **Reçu Médical** — génération PDF officiel avec QR
- **Parent QR flow** : scan → sélection classe + nom → résultats
- **Page publique de vérification** `/verify/:docId` — affiche "DOCUMENT OFFICIEL HOMOLOGUÉ"

## Stack
- Backend : FastAPI + MongoDB (motor) + JWT + bcrypt
- Frontend : React 19 + Tailwind + shadcn/ui + jsPDF + qrcode

## Design
LUXE AFRICAIN — Royal Emerald `#061F17` + Imperial Gold `#D4AF37` + motifs Kente + glassmorphism.

## Comptes seed
- Super Admin : `vodi72089@gmail.com` / `Admin@Destock2026`

## Démarrage local
```
cp .env.example backend/.env
cd backend && pip install -r requirements.txt && uvicorn server:app --reload
cd frontend && yarn && yarn start
```
