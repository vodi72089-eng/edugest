# Design: Système de Tiers par Abonnement EduGest

## Vue d'ensemble

Système complet de gestion des abonnements par tier pour EduGest. Gère l'archivage automatique, les restrictions UI/API, l'upgrade/downgrade avec validation, les paiements d'abonnement, et les rôles distincts.

---

## Phase 1: Archivage + Limites Tier

### Objectif
Quand un admin change de tier (downgrade), les données excédentaires sont archivées. Les élèves archivés ne comptent que si le tier les permet.

### Modèle de données
Ajouter un champ `isArchived` à la table `Student`:
```prisma
model Student {
  // ... champs existants
  isArchived Boolean @default(false)
  archivedAt DateTime?
}
```

### Logique d'archivage
1. **Downgrade**: `archiveExcessStudents(schoolId, newTier)`
   - Compter les élèves actifs (isArchived=false)
   - Si count > limite du nouveau tier :
     - Archiver les élèves les plus anciens en premier
     - Marquer `isArchived=true`, `archivedAt=new Date()`
   - Retourner le nombre d'élèves archivés

2. **Upgrade**: `restoreArchivedStudents(schoolId, newTier)`
   - Compter les élèves actifs
   - Si count < limite du nouveau tier :
     - Restaurer les élèves archivés (un par un jusqu'à la limite)
     - Marquer `isArchived=false`, `archivedAt=null`
   - Retourner le nombre d'élèves restaurés

3. **Vérification limite**: Modifier `checkCanCreateStudent` pour exclure les archivés
   ```typescript
   const current = await db.student.count({ 
     where: { schoolId, isArchived: false } 
   });
   ```

### Endpoints
- `GET /api/schools/[id]/archived-students` - Liste des élèves archivés
- `POST /api/schools/[id]/restore-students` - Restaurer des élèves archivés

---

## Phase 2: Restrictions UI/API par Tier

### Objectif
Les admins ne voient que les fonctionnalités de leur tier. Le frontend cache + le backend vérifie (double protection).

### Fonctionnalités par tier
```typescript
export const TIER_FEATURES = {
  FREEMIUM: ['students', 'classes', 'grades'],
  ESSENTIEL: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline'],
  STANDARD: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline', 
             'report_cards', 'communications', 'convocations'],
  PREMIUM: [...STANDARD, 'analytics', 'multi_years'],
  ENTERPRISE: [...PREMIUM, 'api_access', 'priority_support', 'custom_branding'],
  CORPORATE: [...ENTERPRISE],
};
```

### Restrictions par page
| Page/Fonctionnalité | FREEMIUM | ESSENTIEL | STANDARD+ |
|---------------------|----------|-----------|-----------|
| Élèves (100 max) | ✓ | ✓ | ✓ |
| Notes/Bulletins | ✓ | ✓ | ✓ |
| Paiements mobiles | ✗ | ✗ | ✓ |
| Communications | ✗ | ✗ | ✓ |
| Convocations | ✗ | ✗ | ✓ |
| Analytics | ✗ | ✗ | ✗ (PREMIUM+) |
| Multi-années | ✗ | ✗ | ✗ (PREMIUM+) |

### Backend: Middleware `requireFeature`
```typescript
// src/lib/feature-gate.ts
export async function requireFeature(
  request: NextRequest, 
  feature: string
): Promise<{ user: AuthUser } | { error: Response }> {
  const authResult = await requireAuth(request);
  if ('error' in authResult) return authResult;
  
  const tier = await getSchoolTier(authResult.user.schoolId);
  if (!hasFeatureAccess(tier, feature)) {
    return { 
      error: Response.json({ 
        error: `Fonctionnalité non disponible dans le forfait ${tier}`,
        featureRequired: feature,
        tierRequired: getMinTierForFeature(feature),
      }, { status: 403 }) 
    };
  }
  return authResult;
}
```

### Frontend: Hook `useFeatureAccess`
```typescript
// src/hooks/useFeatureAccess.ts
export function useFeatureAccess(feature: string) {
  const { userData } = useEduGestStore();
  const tier = userData?.school?.subscriptionTier || 'FREEMIUM';
  return {
    hasAccess: hasFeatureAccess(tier, feature),
    tier,
    requiredTier: getMinTierForFeature(feature),
  };
}
```

### Pages concernées
- `GradesView` - Vérifier feature 'grades'
- `PaymentsView` - Vérifier feature 'payments'
- `CommunicationsView` - Vérifier feature 'communications'
- `ConvocationsView` - Vérifier feature 'convocations'
- `DisciplineView` - Vérifier feature 'discipline'
- `DettesView` - Vérifier feature 'payments'
- `OnlinePaymentView` - Vérifier feature 'payments' + 'canConfigPayments'
- `PersonnelView` - Vérifier feature 'users' (limité par maxAdmins/maxTeachers)

### Page de restriction
Créer une page `/subscription-required` qui affiche:
- Le tier actuel de l'admin
- La fonctionnalité demandée
- Le tier minimum requis
- Un bouton pour upgrader

---

## Phase 3: Upgrade/Downgrade + Validation SUPER_ADMIN

### Objectif
L'admin clique sur un forfait, paie via webhook. Le SUPER_ADMIN valide depuis son dashboard.

### Modèle de données
Ajouter une table `SubscriptionRequest`:
```prisma
model SubscriptionRequest {
  id            String   @id @default(cuid())
  schoolId      String
  school        School   @relation(fields: [schoolId], references: [id])
  requestedTier String   // Tier demandé
  currentTier   String   // Tier actuel
  amount        Decimal
  currency      String   @default("USD")
  status        String   @default("PENDING") // PENDING, PAID, VALIDATED, REJECTED
  paymentRef    String?  // Référence du paiement
  validatedBy   String?  // ID du SUPER_ADMIN qui valide
  validatedAt   DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

### Flux d'upgrade
1. **Admin clique** sur un forfait → `POST /api/subscription/request`
2. **Système crée** une `SubscriptionRequest` avec status=PENDING
3. **Redirection** vers la page de paiement (webhook URL)
4. **Webhook reçu** → status mis à jour = PAID
5. **Notification** au SUPER_ADMIN (in-app + email)
6. **SUPER_ADMIN valide** → `POST /api/subscription/validate` avec `requestId`
7. **Système applique** le downgrade/upgrade :
   - Si downgrade : `archiveExcessStudents()`
   - Si upgrade : `restoreArchivedStudents()`
   - Met à jour `school.subscriptionTier`
   - Met à jour `school.subscriptionStatus = 'ACTIVE'`
   - Met à jour `school.subscriptionEndDate`

### Endpoints
- `POST /api/subscription/request` - Créer une demande d'abonnement
- `GET /api/subscription/requests` - Lister les demandes (SUPER_ADMIN)
- `POST /api/subscription/validate` - Valider/Rejeter une demande (SUPER_ADMIN)
- `GET /api/subscription/status` - Voir le status de son abonnement

### Dashboard SUPER_ADMIN
Ajouter un onglet "Abonnements" dans `SuperAdminDashboard`:
- Liste des demandes en attente (status=PENDING ou PAID)
- Bouton Valider/Rejeter
- Historique des validations

---

## Phase 4: Paiement Abonnement (Webhook)

### Objectif
Le paiement d'abonnement utilise les mêmes passerelles que les paiements de scolarité.

### Endpoints
- `POST /api/payment-gateways/initiate-subscription` - Initier un paiement d'abonnement
- `POST /api/payments/webhook/subscription` - Recevoir le webhook de confirmation

### Logique
1. L'admin sélectionne un forfait → initie le paiement
2. Le système crée une `SubscriptionRequest` + `PaymentTransaction`
3. Le serveur de paiement envoie un webhook à `/api/payments/webhook/subscription`
4. Le webhook met à jour le status de la `SubscriptionRequest` = PAID
5. Une notification est envoyée au SUPER_ADMIN

---

## Phase 5: WhatsApp par École

### Objectif
Chaque école a son propre numéro WhatsApp configurable. Les messages partent du numéro de l'école.

### Modèle de données
Ajouter une config WhatsApp par école dans `GlobalApiConfig`:
```typescript
// Clé: WHATSAPP_SCHOOL_CONFIG_{schoolId}
// Valeur: { phoneNumber: "+243...", isConnected: true }
```

### Endpoints
- `GET /api/whatsapp-config?schoolId=...` - Voir la config WhatsApp de l'école
- `POST /api/whatsapp-config` - Configurer le numéro WhatsApp de l'école
- `POST /api/whatsapp-config/connect` - Connecter le numéro (générer QR)
- `GET /api/whatsapp-config/status` - Voir le status de connexion

### Logique de messagerie
Modifier `whatsapp-agent.ts` pour utiliser le numéro de l'école:
```typescript
async function getSchoolWhatsAppNumber(schoolId: string): Promise<string | null> {
  const config = await db.globalApiConfig.findUnique({
    where: { key: `WHATSAPP_SCHOOL_CONFIG_${schoolId}` },
  });
  if (!config) return null;
  const parsed = JSON.parse(config.value);
  return parsed.phoneNumber;
}
```

### Tests
1. Configurer un numéro WhatsApp pour une école
2. Envoyer un OTP via WhatsApp
3. Vérifier que le message part du bon numéro
4. Tester les notifications (paiement, discipline, etc.)

---

## Phase 6: Rôles Distincts

### Objectif
Chaque rôle a un nom et un dashboard unique. Même permissions pour des rôles similaires, mais jamais les mêmes noms.

### Rôles existants (à ne pas changer)
- SUPER_ADMIN_GLOBAL
- DIRECTION, DIRECTION_MATERNELLE, DIRECTION_PRIMAIRE, DIRECTION_SECONDAIRE
- SECRETARY, CASHIER
- TEACHER, HEAD_TEACHER
- PARENT
- DISCIPLINE, DISCIPLINE_MATERNELLE, DISCIPLINE_PRIMAIRE, DISCIPLINE_SECONDAIRE
- SCHOOL_ADMIN

### Nouveau rôle: ADMIN_FREEMIUM
- Mêmes permissions que SECRETARY
- Dashboard spécifique avec le badge "Freemium"
- Limité aux fonctionnalités FREEMIUM

### Ajout au ROLE_PERMISSIONS
```typescript
ADMIN_FREEMIUM: [
  'school:read',
  'users:read', 'users:create', 'users:update',
  'students:read', 'students:create', 'students:update',
  'classes:read', 'classes:create',
  'subjects:read', 'subjects:create',
  'grades:read',
  'profile:read', 'profile:update',
  'notifications:read',
],
```

### Dashboard ADMIN_FREEMIUM
Créer un composant `FreemiumAdminDashboard.tsx`:
- Badge "Freemium" prominent
- Limites affichées (X/100 élèves, X/1 admin)
- Bouton "Upgrader" vers ESSENTIEL
- Restrictions visuelles sur les features non disponibles

---

## Ordre d'implémentation

1. **Phase 1** - Archivage + limites ( fondation)
2. **Phase 2** - Restrictions UI/API (protection)
3. **Phase 3** - Upgrade/Downgrade + validation (workflow)
4. **Phase 4** - Paiement abonnement (webhook)
5. **Phase 5** - WhatsApp par école (messagerie)
6. **Phase 6** - Rôles distincts (finalisation)

---

## Sécurité

- Tous les endpoints sont protégés par `requireAuth` + `requirePermission`
- Le webhook de paiement vérifie la signature du serveur de paiement
- Les restrictions sont vérifiées côté backend ET frontend
- Les élèves archivés ne sont visibles que par les admins de l'école
- Le SUPER_ADMIN est le seul à pouvoir valider les abonnements

---

## Impact sur le frontend

- Ajouter `useFeatureAccess` hook dans les pages concernées
- Ajouter page `/subscription-required` pour les restrictions
- Modifier `SuperAdminDashboard` avec onglet "Abonnements"
- Créer `FreemiumAdminDashboard` pour le rôle ADMIN_FREEMIUM
- Ajouter section "Archives" dans `StudentsView`
- Ajouter badge d'abonnement dans le dashboard de chaque admin

---

## Impact sur le backend

- Ajouter champ `isArchived` à la table Student
- Créer table `SubscriptionRequest`
- Ajouter middleware `requireFeature` pour les restrictions API
- Modifier `checkCanCreateStudent` pour exclure les archivés
- Ajouter endpoints pour l'archivage/restauration
- Ajouter endpoints pour la demande/-validation d'abonnement
- Modifier `whatsapp-agent.ts` pour utiliser le numéro de l'école
- Ajouter rôle `ADMIN_FREEMIUM` aux `ROLE_PERMISSIONS`
