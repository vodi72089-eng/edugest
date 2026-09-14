# Project Brief

## Overview
EduGest — plateforme de gestion scolaire (Écoles d'Afrique francophone) avec :
- **Application web** Next.js 16 (App Router) : 6 écoles de démonstration, rôles
  SUPER_ADMIN_GLOBAL / SCHOOL_ADMIN / SECRETARY / CASHIER / TEACHER / PARENT /
  DIRECTION_* / DISCIPLINE_* / EPS / MEDICAL / HEAD_TEACHER.
- **Application desktop** Windows (.exe, Electron + serveur Next standalone +
  base SQLite locale connectée) — publication automatique dans la Release GitHub.

## Core Requirements
- Abonnements 6 niveaux : FREEMIUM, ESSENTIEL, STANDARD, PREMIUM (Professionnel),
  ENTERPRISE, CORPORATE — limites par forfait dans `src/lib/subscription.ts`.
- Le **secrétaire n'est jamais compté** dans le forfait (aucun niveau) et ne voit
  JAMAIS « Mon Abonnement ».
- Seul l'**admin créateur** (SCHOOL_ADMIN) d'une école voit « Mon Abonnement » et
  peut demander un upgrade (paiement en ligne plateforme ou formulaire manuel).
- QR codes parents (durée de vie paramétrable) + import de base de données (.db)
  dans l'app desktop + bulletins/reçus PDF design gianelli avec QR officiel.
- Passerelles de paiement RDC (Airtel Money, M-Pesa, Orange Money, DPO,
  Flutterwave) + internationales (Visa, Mastercard).

## Goals
- Application 100 % hors ligne pour les écoles (base locale).
- Sécurité de connexion : un seul formulaire unifié (aucun indice sur le type
  de compte avant authentification).
- Démarrage desktop rapide (splash logo officiel instantané).
