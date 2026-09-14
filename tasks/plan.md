# Plan: Vérification Email + WhatsApp pour EduGest

## Objectif
Ajouter la vérification d'identité par OTP (WhatsApp + Email) lors de l'inscription et de la connexion. L'email utilise Nodemailer (open source, SMTP).

## Architecture
- **WhatsApp OTP** : déjà implémenté (in-memory Map), à migrer vers Prisma pour persistence
- **Email OTP** : Nodemailer + SMTP (Gmail/Outlook/auto-hosted), même pattern OTP
- **Prisma** : nouveau modèle `VerificationToken` pour stocker les codes OTP
- **User model** : ajouter `isVerified`, `emailVerifiedAt`, `phoneVerifiedAt`
- **Flux** : inscription → envoie OTP WhatsApp + Email → vérifie → compte activé

## Tâches

### Phase 1 : Base de données
1. Ajouter `VerificationToken` model + champs User dans Prisma schema
2. `npx prisma db push` + `npx prisma generate`

### Phase 2 : Backend OTP
3. Créer `src/lib/otp.ts` — utilitaire OTP (génération, stockage, vérification)
4. Créer `src/lib/email.ts` — envoi email via Nodemailer (open source)
5. Créer API `POST /api/auth/send-otp` — envoie OTP via WhatsApp + Email
6. Créer API `POST /api/auth/verify-otp` — vérifie OTP et active le compte

### Phase 3 : Frontend
7. Composant OTP Input (6 chiffres) — already exists with `input-otp`
8. Page/Modal de vérification dans le flux d'inscription
9. Forcer la vérification avant premier login

### Phase 4 : Intégration
10. Modifier `POST /api/schools` — après création, envoyer OTP automatiquement
11. Modifier `POST /api/auth` — vérifier `isVerified` avant de permettre le login
12. Ajouter resend OTP endpoint
