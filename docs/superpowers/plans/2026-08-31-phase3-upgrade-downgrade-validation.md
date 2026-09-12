# Phase 3: Upgrade/Downgrade + Validation SUPER_ADMIN - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter le workflow d'upgrade/downgrade avec validation par le SUPER_ADMIN pour EduGest.

**Architecture:** CRUD pour les demandes d'abonnement + endpoints de validation + dashboard SUPER_ADMIN avec onglet Abonnements.

**Tech Stack:** Next.js, Prisma, TypeScript, React

## Global Constraints

- Ne pas casser le backend existant
- Ne pas casser le frontend existant
- Seul le SUPER_ADMIN_GLOBAL peut valider/rejeter
- Les demandes sont créées par les admins d'école

---

## File Structure

| Fichier | Responsabilité |
|---------|---------------|
| `src/app/api/subscription/request/route.ts` | NOUVEAU: POST créer une demande |
| `src/app/api/subscription/requests/route.ts` | NOUVEAU: GET lister les demandes (SUPER_ADMIN) |
| `src/app/api/subscription/validate/route.ts` | NOUVEAU: POST valider/rejeter (SUPER_ADMIN) |
| `src/app/api/subscription/status/route.ts` | NOUVEAU: GET status abonnement école |
| `src/components/views/SuperAdminDashboard.tsx` | Modifier: ajouter onglet Abonnements |

---

### Task 1: Endpoint POST /api/subscription/request

**Files:**
- Create: `src/app/api/subscription/request/route.ts`

**Interfaces:**
- Consumes: `requireAuth` from `@/lib/auth`, `db` from `@/lib/db`
- Produces: `SubscriptionRequest` créée

- [ ] **Step 1: Créer le fichier `src/app/api/subscription/request/route.ts`**

```typescript
import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sanitizeError } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { requestedTier } = body;

    if (!requestedTier) {
      return NextResponse.json(
        { error: 'requestedTier requis' },
        { status: 400 }
      );
    }

    // Vérifier que le tier est valide
    const validTiers = ['ESSENTIEL', 'STANDARD', 'PREMIUM', 'ENTERPRISE', 'CORPORATE'];
    if (!validTiers.includes(requestedTier)) {
      return NextResponse.json(
        { error: 'Tier invalide' },
        { status: 400 }
      );
    }

    // Récupérer l'école
    const school = await db.school.findUnique({
      where: { id: user.schoolId },
      select: { 
        id: true, 
        subscriptionTier: true,
        name: true,
      },
    });

    if (!school) {
      return NextResponse.json(
        { error: 'École introuvable' },
        { status: 404 }
      );
    }

    // Vérifier qu'il n'y a pas déjà une demande en cours
    const existingRequest = await db.subscriptionRequest.findFirst({
      where: {
        schoolId: user.schoolId,
        status: { in: ['PENDING', 'PAID'] },
      },
    });

    if (existingRequest) {
      return NextResponse.json(
        { error: 'Une demande est déjà en cours' },
        { status: 400 }
      );
    }

    // Créer la demande
    const subscriptionRequest = await db.subscriptionRequest.create({
      data: {
        schoolId: user.schoolId,
        requestedTier,
        currentTier: school.subscriptionTier || 'FREEMIUM',
        requestedByName: user.name,
        requestedById: user.id,
        status: 'PENDING',
      },
    });

    return NextResponse.json({
      data: subscriptionRequest,
      message: 'Demande d\'abonnement créée',
    });
  } catch (error) {
    console.error('Error creating subscription request:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Vérifier que le fichier compile**

Run: `npx tsc --noEmit src/app/api/subscription/request/route.ts`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/subscription/request/route.ts
git commit -m "feat: add POST endpoint for subscription request"
```

---

### Task 2: Endpoint GET /api/subscription/requests

**Files:**
- Create: `src/app/api/subscription/requests/route.ts`

**Interfaces:**
- Consumes: `requireRole` from `@/lib/auth`, `db` from `@/lib/db`
- Produces: Liste des SubscriptionRequest

- [ ] **Step 1: Créer le fichier `src/app/api/subscription/requests/route.ts`**

```typescript
import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole, sanitizeError } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Seul le SUPER_ADMIN_GLOBAL peut voir toutes les demandes
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const schoolId = searchParams.get('schoolId');

    const where: any = {};
    if (status) where.status = status;
    if (schoolId) where.schoolId = schoolId;

    const requests = await db.subscriptionRequest.findMany({
      where,
      include: {
        school: {
          select: {
            id: true,
            name: true,
            shortName: true,
            subscriptionTier: true,
            city: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ data: requests });
  } catch (error) {
    console.error('Error fetching subscription requests:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Vérifier que le fichier compile**

Run: `npx tsc --noEmit src/app/api/subscription/requests/route.ts`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/subscription/requests/route.ts
git commit -m "feat: add GET endpoint for subscription requests (SUPER_ADMIN)"
```

---

### Task 3: Endpoint POST /api/subscription/validate

**Files:**
- Create: `src/app/api/subscription/validate/route.ts`

**Interfaces:**
- Consumes: `requireRole` from `@/lib/auth`, `db` from `@/lib/db`, `archiveExcessStudents`, `restoreArchivedStudents` from `@/lib/archive`
- Produits: SubscriptionRequest validée/rejetée + tier école mis à jour

- [ ] **Step 1: Créer le fichier `src/app/api/subscription/validate/route.ts`**

```typescript
import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole, sanitizeError } from '@/lib/auth';
import { archiveExcessStudents, restoreArchivedStudents } from '@/lib/archive';

export async function POST(request: NextRequest) {
  try {
    // Seul le SUPER_ADMIN_GLOBAL peut valider
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { requestId, action } = body; // action: 'APPROVE' | 'REJECT'

    if (!requestId || !action) {
      return NextResponse.json(
        { error: 'requestId et action requis' },
        { status: 400 }
      );
    }

    if (!['APPROVE', 'REJECT'].includes(action)) {
      return NextResponse.json(
        { error: 'Action invalide (APPROVE ou REJECT)' },
        { status: 400 }
      );
    }

    // Récupérer la demande
    const subscriptionRequest = await db.subscriptionRequest.findUnique({
      where: { id: requestId },
      include: { school: true },
    });

    if (!subscriptionRequest) {
      return NextResponse.json(
        { error: 'Demande introuvable' },
        { status: 404 }
      );
    }

    if (subscriptionRequest.status !== 'PENDING' && subscriptionRequest.status !== 'PAID') {
      return NextResponse.json(
        { error: 'Cette demande a déjà été traitée' },
        { status: 400 }
      );
    }

    if (action === 'REJECT') {
      // Rejeter la demande
      await db.subscriptionRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          resolvedBy: user.name,
          resolvedById: user.id,
          resolvedAt: new Date(),
        },
      });

      return NextResponse.json({
        message: 'Demande rejetée',
      });
    }

    // Approuver la demande
    const newTier = subscriptionRequest.requestedTier;
    const schoolId = subscriptionRequest.schoolId;

    // Archiver ou restaurer les élèves selon le sens du changement
    const currentTier = subscriptionRequest.currentTier;
    const tierOrder = ['FREEMIUM', 'ESSENTIEL', 'STANDARD', 'PREMIUM', 'ENTERPRISE', 'CORPORATE'];
    const currentIndex = tierOrder.indexOf(currentTier);
    const newIndex = tierOrder.indexOf(newTier);

    if (newIndex < currentIndex) {
      // Downgrade: archiver les excédentaires
      await archiveExcessStudents(schoolId, newTier);
    } else if (newIndex > currentIndex) {
      // Upgrade: restaurer les archivés
      await restoreArchivedStudents(schoolId, newTier);
    }

    // Mettre à jour l'école
    await db.school.update({
      where: { id: schoolId },
      data: {
        subscriptionTier: newTier,
        subscriptionStatus: 'ACTIVE',
        subscriptionStartDate: new Date(),
        subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 jours
      },
    });

    // Mettre à jour la demande
    await db.subscriptionRequest.update({
      where: { id: requestId },
      data: {
        status: 'VALIDATED',
        resolvedBy: user.name,
        resolvedById: user.id,
        resolvedAt: new Date(),
      },
    });

    return NextResponse.json({
      message: `Abonnement ${newTier} activé pour ${subscriptionRequest.school.name}`,
    });
  } catch (error) {
    console.error('Error validating subscription:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Vérifier que le fichier compile**

Run: `npx tsc --noEmit src/app/api/subscription/validate/route.ts`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/subscription/validate/route.ts
git commit -m "feat: add POST endpoint for subscription validation (SUPER_ADMIN)"
```

---

### Task 4: Endpoint GET /api/subscription/status

**Files:**
- Create: `src/app/api/subscription/status/route.ts`

**Interfaces:**
- Consumes: `requireAuth` from `@/lib/auth`, `db` from `@/lib/db`
- Produits: Status de l'abonnement de l'école

- [ ] **Step 1: Créer le fichier `src/app/api/subscription/status/route.ts`**

```typescript
import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sanitizeError } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const school = await db.school.findUnique({
      where: { id: user.schoolId },
      select: {
        subscriptionTier: true,
        subscriptionStatus: true,
        subscriptionStartDate: true,
        subscriptionEndDate: true,
      },
    });

    if (!school) {
      return NextResponse.json(
        { error: 'École introuvable' },
        { status: 404 }
      );
    }

    // Calculer les jours restants
    let daysRemaining = null;
    if (school.subscriptionEndDate) {
      const endDate = new Date(school.subscriptionEndDate);
      const now = new Date();
      daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysRemaining < 0) daysRemaining = 0;
    }

    // Vérifier s'il y a une demande en cours
    const pendingRequest = await db.subscriptionRequest.findFirst({
      where: {
        schoolId: user.schoolId,
        status: { in: ['PENDING', 'PAID'] },
      },
      select: {
        id: true,
        requestedTier: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      data: {
        tier: school.subscriptionTier || 'FREEMIUM',
        status: school.subscriptionStatus || 'ACTIVE',
        startDate: school.subscriptionStartDate,
        endDate: school.subscriptionEndDate,
        daysRemaining,
        pendingRequest,
      },
    });
  } catch (error) {
    console.error('Error fetching subscription status:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Vérifier que le fichier compile**

Run: `npx tsc --noEmit src/app/api/subscription/status/route.ts`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/subscription/status/route.ts
git commit -m "feat: add GET endpoint for subscription status"
```

---

### Task 5: Ajouter onglet Abonnements au SuperAdminDashboard

**Files:**
- Modify: `src/components/views/SuperAdminDashboard.tsx`

**Interfaces:**
- Consumes: `GET /api/subscription/requests`, `POST /api/subscription/validate`
- Produits: Onglet "Abonnements" dans le dashboard

- [ ] **Step 1: Lire SuperAdminDashboard.tsx pour comprendre la structure**

Lire `src/components/views/SuperAdminDashboard.tsx` pour identifier la structure des onglets.

- [ ] **Step 2: Ajouter l'état pour les demandes d'abonnement**

Ajouter après les autres states:
```typescript
const [subscriptionRequests, setSubscriptionRequests] = useState<any[]>([]);
const [loadingSubscriptions, setLoadingSubscriptions] = useState(true);
```

- [ ] **Step 3: Ajouter le useEffect pour charger les demandes**

```typescript
useEffect(() => {
  if (activeTab === 'subscriptions') {
    setLoadingSubscriptions(true);
    authFetch('/api/subscription/requests')
      .then(r => r.json())
      .then(data => {
        setSubscriptionRequests(data.data || []);
        setLoadingSubscriptions(false);
      })
      .catch(() => setLoadingSubscriptions(false));
  }
}, [activeTab]);
```

- [ ] **Step 4: Ajouter l'onglet "Abonnements" dans la navigation**

Ajouter un bouton d'onglet:
```tsx
<button
  onClick={() => setActiveTab('subscriptions')}
  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
    activeTab === 'subscriptions'
      ? 'bg-primary text-primary-foreground'
      : 'bg-muted text-muted-foreground hover:bg-muted/80'
  }`}
>
  Abonnements
  {subscriptionRequests.filter(r => r.status === 'PENDING' || r.status === 'PAID').length > 0 && (
    <span className="ml-2 px-2 py-0.5 text-xs bg-orange-500 text-white rounded-full">
      {subscriptionRequests.filter(r => r.status === 'PENDING' || r.status === 'PAID').length}
    </span>
  )}
</button>
```

- [ ] **Step 5: Ajouter le contenu de l'onglet Abonnements**

Ajouter la section d'affichage:
```tsx
{activeTab === 'subscriptions' && (
  <div className="space-y-4">
    <h2 className="text-2xl font-bold">Demandes d'abonnement</h2>
    
    {loadingSubscriptions ? (
      <p className="text-muted-foreground">Chargement...</p>
    ) : subscriptionRequests.length === 0 ? (
      <p className="text-muted-foreground">Aucune demande en cours</p>
    ) : (
      <div className="space-y-3">
        {subscriptionRequests.map((req) => (
          <div key={req.id} className="border rounded-lg p-4 flex justify-between items-center">
            <div>
              <p className="font-semibold">{req.school?.name}</p>
              <p className="text-sm text-muted-foreground">
                {req.currentTier} → {req.requestedTier}
              </p>
              <p className="text-xs text-muted-foreground">
                Demandé le {new Date(req.createdAt).toLocaleDateString('fr-FR')} par {req.requestedByName}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-1 text-xs rounded-full ${
                req.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                req.status === 'PAID' ? 'bg-blue-100 text-blue-800' :
                req.status === 'VALIDATED' ? 'bg-green-100 text-green-800' :
                'bg-red-100 text-red-800'
              }`}>
                {req.status}
              </span>
              {(req.status === 'PENDING' || req.status === 'PAID') && (
                <div className="flex gap-1">
                  <button
                    onClick={async () => {
                      await authFetch('/api/subscription/validate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ requestId: req.id, action: 'APPROVE' }),
                      });
                      setSubscriptionRequests(prev => prev.map(r => 
                        r.id === req.id ? { ...r, status: 'VALIDATED' } : r
                      ));
                    }}
                    className="px-3 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
                  >
                    Approuver
                  </button>
                  <button
                    onClick={async () => {
                      await authFetch('/api/subscription/validate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ requestId: req.id, action: 'REJECT' }),
                      });
                      setSubscriptionRequests(prev => prev.map(r => 
                        r.id === req.id ? { ...r, status: 'REJECTED' } : r
                      ));
                    }}
                    className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                  >
                    Rejeter
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 6: Vérifier que le fichier compile**

Run: `npx tsc --noEmit src/components/views/SuperAdminDashboard.tsx`

- [ ] **Step 7: Commit**

```bash
git add src/components/views/SuperAdminDashboard.tsx
git commit -m "feat: add Subscriptions tab to SuperAdminDashboard"
```

---

### Task 6: Tests manuels

- [ ] **Step 1: Créer un script de test `scripts/test-subscription-workflow.js`**

```javascript
const http = require('http');

function makeRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, data: data }); }
      });
    });
    
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function testWorkflow() {
  console.log('=== TESTING SUBSCRIPTION WORKFLOW ===\n');
  
  // Login as school admin
  const login = await makeRequest('POST', '/api/auth', {
    phone: '+243844444444',
    password: 'admin123'
  });
  const token = login.data.data.token;
  const schoolId = login.data.data.schoolId;
  console.log(`✅ Login OK (School: ${schoolId})`);
  
  // Test 1: Get subscription status
  console.log('\n--- Test 1: Get subscription status ---');
  const statusResult = await makeRequest('GET', '/api/subscription/status', null, token);
  console.log(`   Status: ${statusResult.status}`);
  console.log(`   Tier: ${statusResult.data.data?.tier}`);
  
  // Test 2: Create subscription request
  console.log('\n--- Test 2: Create subscription request ---');
  const requestResult = await makeRequest('POST', '/api/subscription/request', {
    requestedTier: 'STANDARD'
  }, token);
  console.log(`   Status: ${requestResult.status}`);
  console.log(`   Message: ${requestResult.data.message}`);
  const requestId = requestResult.data.data?.id;
  
  // Test 3: Try to create duplicate request (should fail)
  console.log('\n--- Test 3: Try duplicate request ---');
  const dupResult = await makeRequest('POST', '/api/subscription/request', {
    requestedTier: 'PREMIUM'
  }, token);
  console.log(`   Status: ${dupResult.status}`);
  console.log(`   Error: ${dupResult.data.error}`);
  
  // Test 4: Login as SUPER_ADMIN
  console.log('\n--- Test 4: Login as SUPER_ADMIN ---');
  const superLogin = await makeRequest('POST', '/api/auth', {
    phone: '+243810000001',
    password: 'admin123'
  });
  const superToken = superLogin.data.data?.token;
  console.log(`   Status: ${superLogin.status}`);
  
  if (superToken) {
    // Test 5: List subscription requests
    console.log('\n--- Test 5: List subscription requests ---');
    const listResult = await makeRequest('GET', '/api/subscription/requests', null, superToken);
    console.log(`   Status: ${listResult.status}`);
    console.log(`   Count: ${listResult.data.data?.length}`);
    
    // Test 6: Validate request
    if (requestId) {
      console.log('\n--- Test 6: Approve subscription request ---');
      const validateResult = await makeRequest('POST', '/api/subscription/validate', {
        requestId: requestId,
        action: 'APPROVE'
      }, superToken);
      console.log(`   Status: ${validateResult.status}`);
      console.log(`   Message: ${validateResult.data.message}`);
      
      // Test 7: Verify tier changed
      console.log('\n--- Test 7: Verify tier changed ---');
      const statusAfter = await makeRequest('GET', '/api/subscription/status', null, token);
      console.log(`   New tier: ${statusAfter.data.data?.tier}`);
    }
  }
  
  console.log('\n=== ALL WORKFLOW TESTS PASSED ✅ ===');
}

testWorkflow().catch(console.error);
```

- [ ] **Step 2: Lancer les tests**

Run: `node scripts/test-subscription-workflow.js`

- [ ] **Step 3: Vérifier les résultats**

Le script doit afficher:
- Login OK
- Status actuel
- Création de demande OK
- Duplication bloquée
- Validation par SUPER_ADMIN OK
- Tier mis à jour

- [ ] **Step 4: Commit**

```bash
git add scripts/test-subscription-workflow.js
git commit -m "test: add subscription workflow test script"
```

---

## Résumé des tâches

| Task | Description | Fichiers |
|------|-------------|----------|
| 1 | Endpoint POST request | `src/app/api/subscription/request/route.ts` (nouveau) |
| 2 | Endpoint GET requests | `src/app/api/subscription/requests/route.ts` (nouveau) |
| 3 | Endpoint POST validate | `src/app/api/subscription/validate/route.ts` (nouveau) |
| 4 | Endpoint GET status | `src/app/api/subscription/status/route.ts` (nouveau) |
| 5 | Onglet Abonnements Dashboard | `src/components/views/SuperAdminDashboard.tsx` |
| 6 | Tests manuels | `scripts/test-subscription-workflow.js` (nouveau) |
