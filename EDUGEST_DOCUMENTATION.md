# EduGest — Documentation Complète de l'Application

---

## Table des Matières

1. [Présentation Générale](#1-présentation-générale)
2. [Architecture Technique](#2-architecture-technique)
3. [Base de Données](#3-base-de-données)
4. [Système d'Authentification et Rôles](#4-système-dauthentification-et-rôles)
5. [Fonctionnalités Principales](#5-fonctionnalités-principales)
6. [Page d'Accueil (Landing Page)](#6-page-daccueil-landing-page)
7. [Tableaux de Bord](#7-tableaux-de-bord)
8. [Gestion des Élèves](#8-gestion-des-élèves)
9. [Gestion des Notes](#9-gestion-des-notes)
10. [Gestion des Paiements](#10-gestion-des-paiements)
11. [Système de Discipline](#11-système-de-discipline)
12. [Intégration WhatsApp](#12-intégration-whatsapp)
13. [Passerelles de Paiement](#13-passerelles-de-paiement)
14. [Devises et Conversion](#14-devises-et-conversion)
15. [Notifications et Communications](#15-notifications-et-communications)
16. [Génération de PDF](#16-génération-de-pdf)
17. [Sécurité](#17-sécurité)
18. [Design System "Luxe Africain"](#18-design-system-luxe-africain)
19. [Déploiement](#19-déploiement)
20. [Comptes de Démonstration](#20-comptes-de-démonstration)

---

## 1. Présentation Générale

**EduGest** est une plateforme de gestion scolaire complète, conçue pour les écoles africaines. Elle gère l'ensemble du cycle éducatif : des inscriptions aux bulletins, des paiements à la discipline, avec une intégration WhatsApp native pour les notifications.

### Caractéristiques Principales

- **Multi-écoles** : Une seule instance sert plusieurs écoles avec isolation des données
- **15 rôles** : Du super-administrateur global au parent d'élève
- **59 routes API** : CRUD complet pour toutes les entités
- **27 modèles de base de données** : Schema Prisma complet
- **7 tableaux de bord** : Un par rôle utilisateur
- **8 passerelles de paiement** : Orange Money, M-Pesa, Stripe, PayPal, etc.
- **10 devises** : USD, EUR, CDF, NGN, XOF, GHS, KES, ZAR, GBP, CAD
- **Notifications WhatsApp** : OTP, convocations, notes, paiements
- **Design "Luxe Africain"** : Esthétique premium avec motifs Kente

---

## 2. Architecture Technique

### Stack Technologique

| Couche | Technologie |
|---|---|
| **Framework** | Next.js 16 (App Router) |
| **Langage** | TypeScript |
| **Base de données** | SQLite via Prisma 6.11 |
| **Gestion d'état** | Zustand 5 |
| **Bibliothèque UI** | shadcn/ui + Radix UI + Tailwind CSS 4 |
| **Animations** | Framer Motion 12 |
| **Graphiques** | Recharts 2 |
| **Cartes** | Leaflet + react-leaflet |
| **WhatsApp** | @whiskeysockets/baileys 6 (protocole WhatsApp Web) |
| **PDF** | jsPDF 4 + html2canvas-pro |
| **Paiements** | Service passerelle personnalisé (DPO, Stripe, PayPal, Flutterwave, M-Pesa, Orange Money, Airtel Money) |
| **Authentification** | Système de session personnalisé (basé fichiers, expiration 24h) |
| **Formulaires** | react-hook-form + zod |
| **Icônes** | lucide-react |
| **Conteneurisation** | Docker + docker-compose |
| **Reverse Proxy** | Caddy |

### Structure des Fichiers

```
edugest/
├── prisma/
│   ├── schema.prisma          # Modèle de base de données
│   └── db/custom.db           # Base SQLite
├── src/
│   ├── app/
│   │   ├── page.tsx           # Page principale (Landing + App)
│   │   └── api/               # 59 routes API
│   ├── components/
│   │   ├── landing/           # Composants page d'accueil
│   │   ├── dashboards/        # 7 tableaux de bord
│   │   ├── views/             # Vues principales
│   │   └── ui/                # Composants UI (shadcn/ui)
│   └── lib/
│       ├── auth.ts            # Authentification + RBAC
│       ├── store.ts           # État global (Zustand)
│       ├── types.ts           # Types TypeScript
│       ├── constants.ts       # Constantes
│       └── helpers.ts         # Fonctions utilitaires
├── whatsapp-server.js         # Serveur WhatsApp (port 3001)
├── start-all.js               # Lanceur les deux serveurs
├── Dockerfile                 # Conteneur Docker
└── docker-compose.yml         # Orchestration Docker
```

### Ports

| Service | Port | Description |
|---|---|---|
| Next.js (Frontend) | 3000 | Application web |
| WhatsApp Server | 3001 | Serveur WhatsApp Baileys |
| SQLite | — | Fichier `prisma/db/custom.db` |

---

## 3. Base de Données

### Modèle École (`School`)

| Champ | Type | Description |
|---|---|---|
| id | String | Identifiant unique |
| name | String | Nom de l'école |
| shortName | String | Nom abrégé |
| email | String | Email de l'école |
| phone | String | Téléphone |
| address | String | Adresse |
| city | String | Ville |
| province | String | Province |
| country | String | Pays |
| latitude | Float | Latitude GPS |
| longitude | Float | Longitude GPS |
| logo | String? | URL du logo |
| coverImage | String? | URL de l'image de couverture |
| description | String? | Description de l'école |
| history | String? | Historique |
| mission | String? | Mission |
| establishmentYear | Int? | Année de fondation |
| subscriptionTier | String | Type d'abonnement (FREEMIUM/STANDARD/ESSENTIEL/PREMIUM/ENTERPRISE/CORPORATE) |
| subscriptionStatus | String | Statut de l'abonnement |
| maxStudents | Int | Nombre max d'élèves |
| isActive | Boolean | École active |
| schoolType | String | MATERNELLE/PRIMAIRE/SECONDAIRE/MIXTE |
| schoolCategory | String | PRIVEE/PUBLIQUE |

### Modèle Utilisateur (`User`)

| Champ | Type | Description |
|---|---|---|
| id | String | Identifiant unique |
| email | String | Email (unique) |
| phone | String | Téléphone (unique) |
| password | String | Mot de passe hashé (bcrypt) |
| name | String | Nom complet |
| role | String | Rôle de l'utilisateur |
| schoolId | String | ID de l'école |
| isActive | Boolean | Compte actif |
| profileImageUrl | String? | Photo de profil |
| subjectName | String? | Matière enseignée |
| isTitulaire | Boolean | Est titulaire de classe |

### Modèle Élève (`Student`)

| Champ | Type | Description |
|---|---|---|
| id | String | Identifiant unique |
| matricule | String | Matricule (unique, auto-généré) |
| firstName | String | Prénom |
| lastName | String | Nom |
| dateOfBirth | DateTime | Date de naissance |
| gender | String | MASCULIN/FÉMININ |
| address | String? | Adresse |
| phone | String? | Téléphone |
| photoUrl | String? | Photo |
| classId | String | ID de la classe |
| parentId | String? | ID du parent |
| schoolId | String | ID de l'école |
| isExcluded | Boolean | Exclu |

### Modèle Classe (`Class`)

| Champ | Type | Description |
|---|---|---|
| id | String | Identifiant unique |
| name | String | Nom (ex: "6ème A") |
| section | String? | Section |
| level | String? | Niveau |
| capacity | Int | Capacité maximale |
| schoolId | String | ID de l'école |
| headTeacherId | String? | ID du titulaire |

### Modèle Note (`Grade`)

| Champ | Type | Description |
|---|---|---|
| id | String | Identifiant unique |
| studentId | String | ID de l'élève |
| subjectId | String | ID de la matière |
| classId | String | ID de la classe |
| trimester | String | T1/T2/T3 |
| score | Float | Note sur 20 |
| comment | String? | Commentaire |
| schoolYearId | String | ID de l'année scolaire |

**Contrainte unique** : Un seul enregistrement par élève/matière/trimestre/année.

### Modèle Paiement (`PaymentRecord`)

| Champ | Type | Description |
|---|---|---|
| id | String | Identifiant unique |
| studentId | String | ID de l'élève |
| schoolId | String | ID de l'école |
| amount | Float | Montant dû |
| paidAmount | Float | Montant payé |
| trimester | String | Trimestre |
| paymentMethod | String | Méthode de paiement |
| status | String | PENDING/PAID/PARTIAL/OVERDUE/CANCELLED |
| receiptNumber | String? | Numéro de reçu |
| verifiedBy | String? | Vérifié par |
| verifiedAt | DateTime? | Date de vérification |

### Modèle Discipline (`DisciplineRecord`)

| Champ | Type | Description |
|---|---|---|
| id | String | Identifiant unique |
| studentId | String | ID de l'élève |
| type | String | Type d'incident |
| severity | String | FAIBLE/MOYENNE/FORTE/CRITIQUE |
| title | String | Titre |
| description | String? | Description |
| points | Int | Points attribués |
| listType | String | BLACKLIST/GREYLIST/WHITELIST |
| status | String | Statut |

### Modèle Frais Scolaires (`SchoolFee`)

| Champ | Type | Description |
|---|---|---|
| id | String | Identifiant unique |
| name | String | Nom du frais (texte libre) |
| amount | Float | Montant |
| currency | String | Devise (CDF/USD/FCFA) |
| trimester | String | Trimestre ou tranche |
| classId | String | ID de la classe |
| schoolId | String | ID de l'école |

### Autres Modèles

- **SchoolYear** : Année scolaire (label, dates, actif)
- **Subject** : Matière (nom, code, coefficient)
- **Blacklist / Greylist / Whitelist** : Listes de discipline
- **DisciplineKeyword** : Mots-clés appris automatiquement
- **Convocation** : Convocation de parent
- **Communication** : Annonce d'école
- **Homework** : Devoirs
- **ReportCard** : Bulletins scolaires
- **AuditLog** : Journal d'audit
- **PaymentGatewayConfig** : Configuration des passerelles
- **SchoolCurrencyConfig** : Configuration des devises
- **ExchangeRate** : Taux de change
- **PaymentTransaction** : Transactions externes
- **PricingPlan** : Plans d'abonnement

---

## 4. Système d'Authentification et Rôles

### Méthodes de Connexion

1. **Email/Mot de passe** : Authentification classique avec rate limiting (5 tentatives/15 min)
2. **WhatsApp OTP** : Code à6 chiffres envoyé via WhatsApp (valable 10 min, 3 tentatives max)

### 15 Rôles

| Rôle | Description | Permissions Principales |
|---|---|---|
| **SUPER_ADMIN_GLOBAL** | Admin plateforme | Toutes les permissions (`*`) |
| **SCHOOL_ADMIN** | Admin d'école | CRUD complet sur toutes les entités |
| **DIRECTION** | Directeur | Utilisateurs, élèves, paiements, notes, discipline |
| **DIRECTION_MATERNELLE** | Directeur maternelle | Élèves, classes, matières, notes, discipline |
| **DIRECTION_PRIMAIRE** | Directeur primaire | Même que DIRECTION + paiements |
| **DIRECTION_SECONDAIRE** | Directeur secondaire | Même que DIRECTION_PRIMAIRE |
| **SECRETARY** | Secrétaire | Utilisateurs (lecture/création), élèves, paiements, communications |
| **CASHIER** | Caissier | Élèves (lecture), paiements (CRUD + vérification) |
| **HEAD_TEACHER** | Titulaire | Élèves, notes, classes, discipline, devoirs |
| **TEACHER** | Enseignant | Élèves (lecture), notes, devoirs |
| **PARENT** | Parent | Élèves (lecture), paiements, notes, convocations |
| **DISCIPLINE** | Responsable discipline | Élèves, discipline, convocations |
| **DISCIPLINE_MATERNELLE** | Discipline maternelle | Élèves, discipline, convocations |
| **DISCIPLINE_PRIMAIRE** | Discipline primaire | Même que DISCIPLINE_MATERNELLE |
| **DISCIPLINE_SECONDAIRE** | Discipline secondaire | Même que DISCIPLINE_MATERNELLE |

### Vérification d'Accès

- **Accès école** : Les utilisateurs ne peuvent accéder qu'aux données de leur école
- **Accès parent** : Les parents ne voient que les données de leurs enfants
- **Rate limiting** : Limitation par IP sur les routes sensibles

---

## 5. Fonctionnalités Principales

### Gestion Scolaire
1. Multi-écoles avec isolation des données
2. Inscription élèves avec matricule auto-généré
3. Gestion des classes (sections, niveaux, capacités)
4. Gestion des matières avec coefficients
5. Années scolaires
6. Frais scolaires par classe/trimestre/devise

### Fonctionnalités Académiques
7. Bulletins scolaires (PDF)
8. Promotion de classe
9. Gestion des devoirs

### Fonctionnalités Financières
10. Suivi des paiements (cycle complet)
11. Vérification des paiements
12. Génération de reçus (PDF)
13. Suivi des dettes
14. Paiements en ligne
15. 8 passerelles de paiement
16. Webhooks sécurisés
17. Multi-devises avec taux de change en temps réel

### Fonctionnalités de Discipline
18. Enregistrement des incidents
19. Classification automatique (No Liste/Gliste/Blanche)
20. Classification par IA (mots-clés appris)
21. Convocations de parents

### Fonctionnalités de Communication
22. Notifications in-app
23. Annonces d'école
24. Livraison double (app + WhatsApp)

### Intégration WhatsApp
25. Connexion WhatsApp Business
26. Connexion OTP
27. Notifications parents
28. Notifications caissier
29. Appairage QR code
30. Reconnexion automatique

### Analytiques et Rapports
31. Tableau de bord par école
32. Analytiques super-admin
33. Graphiques Recharts
34. Journal d'audit

---

## 6. Page d'Accueil (Landing Page)

### Thème : "Luxe Africain"

La page d'accueil utilise un design premium combinant motifs culturels africains (motifs Kente) avec le glassmorphisme moderne.

### Sections

1. **Navigation** : Barre de navigation sticky avec logo, liens, CTA connexion
2. **Hero** : Animation typewriter, aperçu du tableau de bord, cartes de statistiques
3. **Barre de Confiance** : Nombre d'écoles, familles, taux de satisfaction
4. **Comment ça marche** : Étapes d'intégration
5. **Fonctionnalités** : Grille bento avec aperçu animé
6. **Démo Interactive** : Section démo
7. **Témoignages** : Avis utilisateurs
8. **Métriques** : Compteurs animés
9. **Tarifs** : Multi-devises (USD/EUR/GBP/XOF)
10. **FAQ** : Questions fréquentes
11. **CTA Final** : Dernier appel à l'action
12. **Pied de page** : Liens, contact, branding

### Composants UI

- **GlassCard** : Carte avec backdrop-filter blur
- **GradientButton** : Bouton avec dégradé
- **MeshGradientBg** : Arrière-plan dégradé
- **GlowOrb** : Orbe lumineux
- **ScrollReveal** : Animation au scroll
- **AnimatedCounter** : Compteur animé
- **MagneticButton** : Bouton avec effet magnétique

---

## 7. Tableaux de Bord

### 7 Tableaux de Bord par Rôle

| Rôle | Tableau de Bord | Contenu |
|---|---|---|
| SUPER_ADMIN_GLOBAL | **SuperAdminDashboard** | Écoles, revenus, dettes, blacklist, classements |
| SCHOOL_ADMIN | **SecretaryDashboard** | Élèves, paiements, communications |
| SECRETARY | **SecretaryDashboard** | Élèves, paiements, communications |
| CASHIER | **CashierDashboard** | Paiements, vérification, reçus |
| PARENT | **ParentDashboard** | Notes, paiements, convocations de l'enfant |
| TEACHER | **TeacherDashboard** | Notes, devoirs, statistiques de classe |
| HEAD_TEACHER | **HeadTeacherDashboard** | Gestion de classe, discipline |
| DISCIPLINE | **DisciplineDashboard** | Incidents, classification, convocations |

### Composants Réutilisables

- **StatCard** : Carte de statistique avec icône, valeur, delta
- **Recharts** : Graphiques à barres, secteurs, lignes

---

## 8. Gestion des Élèves

### Fonctionnalités

- **CRUD complet** : Créer, lire, modifier, supprimer
- **Matricule auto-généré** : Format unique par école
- **Photo de profil** : Upload et affichage partout
- **Recherche** : Par nom, matricule, classe
- **Affectation de classe** : Attribution à une classe
- **Lien parent** : Association à un compte parent
- **Exclusion** : Marquer un élève comme exclu

### Routes API

| Route | Méthode | Description |
|---|---|---|
| `/api/students` | GET | Liste paginée avec filtres |
| `/api/students` | POST | Créer un élève |
| `/api/students/[id]` | GET | Détail d'un élève |
| `/api/students/[id]` | PUT | Modifier un élève |
| `/api/students/[id]` | DELETE | Supprimer un élève |

---

## 9. Gestion des Notes

### Fonctionnalités

- **Saisie par classe/matière/trimestre**
- **Note sur 20** : Score avec commentaire
- **Moyenne pondérée** : Calcul automatique avec coefficients
- **Unicité** : Une seule note par élève/matière/trimestre/année
- **Export bulletins** : Génération PDF

### Routes API

| Route | Méthode | Description |
|---|---|---|
| `/api/grades` | GET | Liste des notes |
| `/api/grades` | POST | Créer une note |
| `/api/grades` | PUT | Modifier une note |
| `/api/subjects` | GET | Liste des matières |
| `/api/subjects` | POST | Créer une matière |

---

## 10. Gestion des Paiements

### Cycle de Vie d'un Paiement

```
PENDING → PAID (complet)
        → PARTIAL (partiel)
        → OVERDUE (en retard)
        → CANCELLED (annulé)
```

### Fonctionnalités

- **Création** : Montant dû, montant payé, trimestre, méthode
- **Vérification** : Le caissier approuve avec note
- **Reçus PDF** : Design "Luxe Africain" avec QR code
- **Dettes** : Vue des soldes impayés par élève
- **Paiements en ligne** : Orange Money, M-Pesa, Airtel Money
- **Multi-devises** : Conversion en temps réel

### Routes API

| Route | Méthode | Description |
|---|---|---|
| `/api/payments` | GET | Liste des paiements |
| `/api/payments` | POST | Créer un paiement |
| `/api/payments/[id]` | PUT | Modifier un paiement |
| `/api/payments/[id]` | DELETE | Supprimer un paiement |
| `/api/payments/verify` | POST | Vérifier un paiement |
| `/api/payments/receipt/[id]` | GET | Générer un reçu PDF |
| `/api/payments/online` | POST | Paiement en ligne |
| `/api/debts` | GET | Liste des dettes |

---

## 11. Système de Discipline

### Classification Automatique

Le système classe automatiquement les élèves en 3 listes basées sur les points :

| Liste | Seuil | Signification |
|---|---|---|
| **BLACKLIST** | ≥ 10 points | Élève à risque |
| **GREYLIST** | 5-9 points | Élève en surveillance |
| **WHITELIST** | < 5 points | Élève exemplaire |

### Classification par IA

Le système apprend automatiquement les mots-clés de discipline à partir des enregistrements et les utilise pour la classification future.

### Fonctionnalités

- **Enregistrement des incidents** : Type, sévérité, points
- **Classification 3-listes** : Automatique basée sur les points
- **Mots-clés appris** : Le système apprend de chaque incident
- **Convocations** : Notification parent via WhatsApp

### Routes API

| Route | Méthode | Description |
|---|---|---|
| `/api/discipline` | GET | Liste des incidents |
| `/api/discipline` | POST | Créer un incident |
| `/api/discipline/classify` | POST | Classification automatique |
| `/api/discipline/keywords` | GET | Mots-clés appris |
| `/api/convocations` | GET | Liste des convocations |
| `/api/convocations` | POST | Créer une convocation |

---

## 12. Intégration WhatsApp

### Architecture

- **Bibliothèque** : `@qwerty-xcv/baileys` (fork de Baileys)
- **Serveur** : Processus Node.js séparé (port 3001)
- **Communication** : API HTTP entre Next.js et le serveur WhatsApp
- **Authentification** : Clé API (`x-api-key`)

### Endpoints du Serveur WhatsApp

| Endpoint | Méthode | Description |
|---|---|---|
| `/pair` | POST | Connexion par code ou QR |
| `/status` | GET | Statut de connexion |
| `/logs` | GET | Derniers logs |
| `/start` | POST | Démarrer la connexion |
| `/logout` | POST | Déconnexion |
| `/generate-otp` | POST | Envoyer un code OTP |
| `/verify-otp` | POST | Vérifier un code OTP |
| `/send` | POST | Envoyer un message |

### Fonctionnalités WhatsApp

1. **Connexion QR** : Scanner le QR code avec WhatsApp
2. **Code d'appairage** : Code personnalisé `EDUGEST1`
3. **OTP** : Code à6 chiffres pour la connexion
4. **Notifications parents** : Convocations, devoirs, notes, paiements
5. **Notifications caissier** : Alertes de paiement en ligne
6. **Reconnexion auto** : Reconnexion en cas de déconnexion
7. **Session persistante** : Auth sauvegardée dans `baileys-auth/`

### Sécurité

- Rotation des fingerprints de navigateur
- Rate limiting par IP
- Circuit breaker (2 échecs en5 min = cooldown)
- Auth state nettoyé avant chaque tentative

---

## 13. Passerelles de Paiement

### 8 Passerelles Supportées

| Passerelle | Devises | Méthodes | Webhook |
|---|---|---|---|
| **DPO Group** | USD, EUR, CDF, NGN, GHS, KES, TZS, UGX, ZAR | Carte, Mobile Money | Oui |
| **Stripe** | USD, EUR, GBP, CAD | Carte | Oui (HMAC) |
| **PayPal** | USD, EUR, GBP, CAD | PayPal, Carte | Oui |
| **Flutterwave** | USD, EUR, NGN, GHS, KES, ZAR | Mobile Money, Carte, Virement | Oui |
| **M-Pesa** | KES, USD, EUR | Mobile Money | Oui |
| **Orange Money** | CDF, XOF, EUR | Mobile Money | Oui |
| **Airtel Money** | CDF, XOF, NGN | Mobile Money | Oui |
| **Manual** | Toutes | Espèces, Virement, Chèque | Non |

### Flux de Paiement

1. L'école configure la passerelle (clés API)
2. Les clés sont chiffrées avec AES-256-GCM
3. Paiement initié via `/api/payment-gateways/initiate`
4. Conversion de devise si nécessaire (taux en temps réel)
5. Transaction enregistrée dans `PaymentTransaction`
6. Webhook reçu avec vérification de signature
7. Statut mis à jour
8. Parent notifié

### Sécurité

- Chiffrement AES-256-GCM pour les clés API
- Vérification HMAC des webhooks
- Protection contre les attaques par rejeu (fenêtre5 min)

---

## 14. Devises et Conversion

### 10 Devises Supportées

| Devise | Code | Symbole |
|---|---|---|
| Dollar américain | USD | $ |
| Euro | EUR | € |
| Franc congolais | CDF | FC |
| Naira nigérian | NGN | ₦ |
| CFA franc | XOF | CFA |
| Cedi ghanéen | GHS | GH₵ |
| Shilling kenyan | KES | KSh |
| Rand sud-africain | ZAR | R |
| Livre sterling | GBP | £ |
| Dollar canadien | CAD | C$ |

### Sources de Taux de Change

1. Open Exchange Rates (API ouverte)
2. ExchangeRate-API (API ouverte)
3. Fallback : Taux fixes configurés

### Fonctionnalités

- **Taux en temps réel** : Mise à jour automatique
- **Conversion** : Entre toutes les devises supportées
- **Audit** : Historique des taux dans `ExchangeRate`
- **Config par école** : Chaque école choisit sa devise

---

## 15. Notifications et Communications

### Types de Notifications

1. **Notifications in-app** : Style push avec état lu/non-lu
2. **Communications d'école** : Annonces ciblées (tous les parents, classe spécifique, etc.)
3. **Notifications WhatsApp** : Livraison double (app + WhatsApp)

### Événements Déclencheurs

- Paiement effectué → Notification caissier
- Convocation créée → Notification parent (WhatsApp)
- Devoir assigné → Notification parent (WhatsApp)
- Note saisie → Notification parent (WhatsApp)
- Paiement en ligne → Notification caissier (WhatsApp)

### Routes API

| Route | Méthode | Description |
|---|---|---|
| `/api/notifications` | GET | Liste des notifications |
| `/api/notifications` | POST | Créer une notification |
| `/api/notifications/read-all` | POST | Marquer toutes comme lues |
| `/api/communications` | GET | Liste des communications |
| `/api/communications` | POST | Créer une communication |

---

## 16. Génération de PDF

### PDF1 : Bulletin Scolaire

**Endpoint** : `GET /api/bulletins/[studentId]?trimester=T1&schoolId=...`

**Contenu** :
- En-tête école (logo, nom, adresse) sur fond sombre
- Titre "BULLETIN SCOLAIRE" avec trimestre et année
- Informations élève (nom, matricule, classe)
- Tableau des notes (matière, coefficient, note/20, contribution pondérée)
- Notes colorisées (vert ≥10, rouge <10)
- Section Moyenne & Décision
- Mentions : Bien (≥16), Assez Bien (≥14), Passable (≥12), Admis (≥10)
- Pied de page "Généré par EduGest"

### PDF2 : Reçu de Paiement

**Endpoint** : `GET /api/payments/receipt/[id]`

**Contenu** :
- Design "Luxe Africain" avec ligne d'accent doré
- Marque de l'école (logo, nom, adresse)
- Numéro et date du reçu
- Bannière de statut (PAYÉ/PARTIEL/EN ATTENTE/EN RETARD/ANNULÉ)
- Infos élève (nom, matricule)
- Détails du paiement (trimestre, méthode)
- Montants (dû, payé, restant)
- Motif Kente en arrière-plan

---

## 17. Sécurité

### Mesures de Sécurité

1. **Sessions** : Basées sur fichiers avec empreinte de dispositif
2. **Appareils connectés** : Voir et révoquer les sessions actives
3. **Enrichissement d'appareil** : ID empreinte, écran, GPU, batterie, réseau
4. **Rate limiting** : Par IP sur connexion et OTP WhatsApp
5. **Anti-énumération** : Comptes désactivés retournent la même erreur
6. **Hachage des mots de passe** : bcryptjs
7. **RBAC** : Système de permissions granulaire (13 rôles, 40+ permissions)
8. **Vérification d'accès école** : Isolation des données
9. **Vérification d'accès parent** : Les parents ne voient que leurs enfants
10. **Chiffrement des clés API** : AES-256-GCM pour les passerelles
11. **Vérification HMAC** : Webhooks sécurisés
12. **Journal d'audit** : Traçabilité des actions

---

## 18. Design System "Luxe Africain"

### Palette de Couleurs (Espace OKLCH)

| Jeton | Valeur | Usage |
|---|---|---|
| ACCENT | `oklch(55% 0.15 175)` | Accent principal (vert-bleu) |
| GOLD | `oklch(72% 0.15 65)` | Or premium |
| DARK | `oklch(15% 0.02 250)` | Fond sombre |
| IVORY | `oklch(97% 0.005 175)` | Fond ivoire |
| SUCCESS | `oklch(60% 0.15 145)` | Succès vert |
| DANGER | `oklch(58% 0.20 25)` | Danger rouge |

### Polices

| Police | Usage |
|---|---|
| **Geist Sans** | Police principale UI |
| **Geist Mono** | Code/monospace |
| **Playfair Display** | Titres décoratifs |

### Motifs Visuels

- **Glassmorphisme** : `backdrop-filter: blur(24px)`
- **Motifs Kente** : Motifs géométriques en dégradé linéaire
- **Décors ornements** : Lignes de dégradé avec diamant central
- **Texture points ivoire** : Motif en pointillé subtil
- **Boutons dorés** : Fond doré avec effet glow au survol
- **Élévation au survol** : `translateY(-4px)` avec ombre

### Animations

- **Effet machine à écrire** : Animation caractère par caractère
- **Framer Motion** : Scroll-reveal, fade-in, scale
- **Compteurs animés** : Incrémentation de nombres
- **Boutons magnétiques** : Effet de suivi du curseur

---

## 19. Déploiement

### Docker

```bash
# Construction
docker build -t edugest .

# Exécution
docker-compose up -d
```

### Docker Compose

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./prisma/db:/app/prisma/db
    environment:
      - DATABASE_URL=file:/app/prisma/db/custom.db
```

### Lancement Local

```bash
# Installer les dépendances
npm install

# Initialiser la base de données
npx prisma db push
npx prisma db seed

# Lancer les deux serveurs
node start-all.js
```

### URLs

| Service | URL |
|---|---|
| Application | http://localhost:3000 |
| WhatsApp | http://localhost:3001 |

---

## 20. Comptes de Démonstration

| Rôle | Email | Mot de Passe |
|---|---|---|
| Super Admin Global | admin@edugest.app | admin123 |
| Secrétaire | claudine@lumiere.cd | admin123 |
| Caissier | joseph@lumiere.cd | admin123 |
| Enseignant | mwepu@lumiere.cd | admin123 |
| Parent | parent@email.com | admin123 |
| Discipline Primaire | disc.primaire@lumiere.cd | admin123 |
| Direction Secondaire | dir.secondaire@lumiere.cd | admin123 |

### Téléphones de Test

- `+243835113424` → Admin
- `+243861488447` → Numéro d'appairage WhatsApp

---

## Métriques du Projet

| Métrique | Valeur |
|---|---|
| Fichiers TypeScript/TSX | 171 |
| Routes API | 59 |
| Modèles de base de données | 27 |
| Rôles | 15 |
| Composants UI | 91 |
| Lignes de code (page.tsx) | ~5000 |
| Erreurs TypeScript | 0 |
| Tests API | 15 |

---

*Document généré le 17 août 2026*
*EduGest — Gestion Solaire Africaine*
