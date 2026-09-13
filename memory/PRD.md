# EduGest / Destock — PRD

## Original Problem
Copie d'un dépôt GitHub (edugest) adapté en app "Destock" avec:
- Onglet "Trouver mon école" et page de connexion
- Import de base de données par les admins d'école
- QR code pour parents (accès temporaire avec durée configurable)
- Recherche enfant par classe + nom
- Création manuelle de comptes parents par élève
- PDF Bulletin et Notes avec design jsPDF luxe
- QR code unique sur chaque PDF, vérification publique
- Reçu du service médical avec QR
- Base de données MongoDB connectée
- Push vers GitHub

## Stack
- Backend: FastAPI + MongoDB (motor) + JWT + bcrypt
- Frontend: React (CRA) + Tailwind + shadcn/ui + jsPDF + qrcode
- Design: LUXE AFRICAIN (Emerald + Imperial Gold + Kente)

## Users & Roles
- SUPER_ADMIN — platform owner (vodi72089@gmail.com)
- SCHOOL_ADMIN — admin per school
- TEACHER — teacher
- PARENT — parent access via student credentials

## Implemented (Feb 2026)
- Landing avec "Trouver mon école" + recherche + cartes écoles
- Register school + JWT login (admin/teacher/parent tabs)
- Admin Dashboard: Overview, Import DB (CSV/JSON), Students CRUD, Parent creds per student, QR generation with duration (1h/24h/7j/30j/1an), Bulletin PDF, Medical PDF
- Parent QR lookup: `/parent-lookup/:token` → find child by class + name
- Public verification page `/verify/:docId` for bulletins & medical receipts
- jsPDF templates: Bulletin + Medical Receipt with unique QR pointing to /verify/:id
- Super admin seeded on startup

## Endpoints
- `/api/auth/register-school`, `/api/auth/login`, `/api/auth/parent-login`, `/api/auth/me`, `/api/auth/logout`
- `/api/schools/search`, `/api/schools/{id}`
- `/api/admin/import`, `/api/admin/students`, `/api/admin/classes`, `/api/admin/qr-tokens`
- `/api/parent/qr-info/{token}`, `/api/parent/lookup`
- `/api/documents/bulletin`, `/api/documents/medical`, `/api/documents/verify/{docId}`

## Backlog (Next)
- P1: Push GitHub via provided PAT
- P1: Excel (.xlsx) import (currently CSV/JSON)
- P2: Full parent portal with grades listing
- P2: Teacher role dashboard
- P2: Email notifications (Resend)
- P2: Batch QR generation per class
