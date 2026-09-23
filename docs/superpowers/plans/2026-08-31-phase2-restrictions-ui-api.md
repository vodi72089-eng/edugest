# Phase 2: Restrictions UI/API par Tier - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter les restrictions UI/API par tier pour EduGest - le frontend cache + le backend vérifie les fonctionnalités selon le tier de l'abonnement.

**Architecture:** Double protection : un hook React `useFeatureAccess` pour le frontend, un middleware `requireFeature` pour le backend. Page `/subscription-required` pour afficher les restrictions.

**Tech Stack:** Next.js, React, TypeScript, Zustand

## Global Constraints

- Ne pas casser le backend existant
- Ne pas casser le frontend existant
- Tous les endpoints existants continuent de fonctionner
- Les restrictions sont vérifiées côté backend ET frontend
- La page `/subscription-required` informe l'utilisateur

---

## File Structure

| Fichier | Responsabilité |
|---------|---------------|
| `src/lib/subscription.ts` | Ajouter `TIER_FEATURES`, `hasFeatureAccess`, `getMinTierForFeature` |
| `src/lib/feature-gate.ts` | NOUVEAU: Middleware `requireFeature` pour les endpoints |
| `src/hooks/useFeatureAccess.ts` | NOUVEAU: Hook React pour vérifier les accès |
| `src/app/subscription-required/page.tsx` | NOUVEAU: Page de restriction |
| `src/components/views/GradesView.tsx` | Modifier: vérifier feature 'grades' |
| `src/components/views/PaymentsView.tsx` | Modifier: vérifier feature 'payments' |
| `src/components/views/CommunicationsView.tsx` | Modifier: vérifier feature 'communications' |
| `src/components/views/ConvocationsView.tsx` | Modifier: vérifier feature 'convocations' |
| `src/components/views/DisciplineView.tsx` | Modifier: vérifier feature 'discipline' |

---

### Task 1: Ajouter TIER_FEATURES et helpers à subscription.ts

**Files:**
- Modify: `src/lib/subscription.ts`

**Interfaces:**
- Produces: `TIER_FEATURES`, `hasFeatureAccess(tier, feature)`, `getMinTierForFeature(feature)`

- [ ] **Step 1: Lire subscription.ts pour comprendre la structure**

Lire `src/lib/subscription.ts` pour trouver où ajouter les nouvelles constantes.

- [ ] **Step 2: Ajouter TIER_FEATURES après les constantes existantes**

```typescript
// Fonctionnalités disponibles par tier
export const TIER_FEATURES: Record<string, string[]> = {
  FREEMIUM: ['students', 'classes', 'grades'],
  ESSENTIEL: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline'],
  STANDARD: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline', 
             'report_cards', 'communications', 'convocations'],
  PREMIUM: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline', 
            'report_cards', 'communications', 'convocations', 'analytics', 'multi_years'],
  ENTERPRISE: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline', 
               'report_cards', 'communications', 'convocations', 'analytics', 'multi_years',
               'api_access', 'priority_support', 'custom_branding'],
  CORPORATE: ['students', 'classes', 'grades', 'parents', 'payments', 'homework', 'discipline', 
              'report_cards', 'communications', 'convocations', 'analytics', 'multi_years',
              'api_access', 'priority_support', 'custom_branding'],
};

// Ordre des tiers pour déterminer le minimum requis
const TIER_ORDER = ['FREEMIUM', 'ESSENTIEL', 'STANDARD', 'PREMIUM', 'ENTERPRISE', 'CORPORATE'];

/**
 * Vérifie si un tier a accès à une fonctionnalité
 */
export function hasFeatureAccess(tier: string, feature: string): boolean {
  const features = TIER_FEATURES[tier] || TIER_FEATURES['FREEMIUM'];
  return features.includes(feature);
}

/**
 * Retourne le tier minimum requis pour une fonctionnalité
 */
export function getMinTierForFeature(feature: string): string {
  for (const tier of TIER_ORDER) {
    if (TIER_FEATURES[tier]?.includes(feature)) {
      return tier;
    }
  }
  return 'FREEMIUM';
}
```

- [ ] **Step 3: Vérifier que le fichier compile**

Run: `npx tsc --noEmit src/lib/subscription.ts`

- [ ] **Step 4: Commit**

```bash
git add src/lib/subscription.ts
git commit -m "feat: add TIER_FEATURES and feature access helpers"
```

---

### Task 2: Créer le middleware requireFeature

**Files:**
- Create: `src/lib/feature-gate.ts`

**Interfaces:**
- Consumes: `requireAuth` from `@/lib/auth`, `hasFeatureAccess`, `getMinTierForFeature`, `getSchoolTier` from `@/lib/subscription`
- Produces: `requireFeature(request, feature)` - middleware pour les endpoints

- [ ] **Step 1: Créer le fichier `src/lib/feature-gate.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sanitizeError } from './auth';
import { hasFeatureAccess, getMinTierForFeature, getSchoolTier } from './subscription';

/**
 * Middleware pour vérifier qu'un utilisateur a accès à une fonctionnalité
 * basé sur le tier de son école.
 * 
 * Usage dans les routes API:
 * ```typescript
 * const authResult = await requireFeature(request, 'grades');
 * if ('error' in authResult) return authResult.error;
 * ```
 */
export async function requireFeature(
  request: NextRequest,
  feature: string
): Promise<{ user: NonNullable<ReturnType<typeof requireAuth> extends Promise<infer R> ? R extends { user: infer U } ? U : never : never> } | { error: NextResponse }> {
  // D'abord vérifier l'authentification
  const authResult = await requireAuth(request);
  if ('error' in authResult) return authResult;

  const { user } = authResult;

  // Vérifier l'accès à la fonctionnalité
  const tier = await getSchoolTier(user.schoolId);
  if (!hasFeatureAccess(tier, feature)) {
    return {
      error: NextResponse.json({
        error: `Fonctionnalité non disponible dans le forfait ${tier}`,
        featureRequired: feature,
        tierRequired: getMinTierForFeature(feature),
        currentTier: tier,
      }, { status: 403 })
    };
  }

  return { user };
}
```

- [ ] **Step 2: Vérifier que le fichier compile**

Run: `npx tsc --noEmit src/lib/feature-gate.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/feature-gate.ts
git commit -m "feat: add requireFeature middleware for tier-based access control"
```

---

### Task 3: Créer le hook useFeatureAccess

**Files:**
- Create: `src/hooks/useFeatureAccess.ts`

**Interfaces:**
- Consumes: `useEduGestStore` from `@/lib/store`, `hasFeatureAccess`, `getMinTierForFeature` from `@/lib/subscription`
- Produces: `useFeatureAccess(feature)` hook React

- [ ] **Step 1: Créer le dossier hooks si nécessaire**

Vérifier si `src/hooks/` existe, sinon le créer.

- [ ] **Step 2: Créer le fichier `src/hooks/useFeatureAccess.ts`**

```typescript
import { useEduGestStore } from '@/lib/store';
import { hasFeatureAccess, getMinTierForFeature } from '@/lib/subscription';

/**
 * Hook pour vérifier l'accès à une fonctionnalité basé sur le tier
 * 
 * Usage:
 * ```tsx
 * const { hasAccess, tier, requiredTier } = useFeatureAccess('grades');
 * if (!hasAccess) return <SubscriptionRequired />;
 * ```
 */
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

- [ ] **Step 3: Vérifier que le fichier compile**

Run: `npx tsc --noEmit src/hooks/useFeatureAccess.ts`

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useFeatureAccess.ts
git commit -m "feat: add useFeatureAccess hook for frontend feature gating"
```

---

### Task 4: Créer la page /subscription-required

**Files:**
- Create: `src/app/subscription-required/page.tsx`

**Interfaces:**
- Consumes: `useEduGestStore` from `@/lib/store`
- Produces: Page de restriction affichant le tier actuel et le tier requis

- [ ] **Step 1: Créer le dossier si nécessaire**

Vérifier si `src/app/subscription-required/` existe.

- [ ] **Step 2: Créer le fichier `src/app/subscription-required/page.tsx`**

```tsx
'use client';

import { useSearchParams } from 'next/navigation';
import { useEduGestStore } from '@/lib/store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Lock, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

function SubscriptionRequiredContent() {
  const searchParams = useSearchParams();
  const { userData } = useEduGestStore();
  
  const feature = searchParams.get('feature') || 'cette fonctionnalité';
  const requiredTier = searchParams.get('requiredTier') || 'STANDARD';
  const currentTier = userData?.school?.subscriptionTier || 'FREEMIUM';

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 p-3 bg-muted rounded-full w-fit">
            <Lock className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle className="text-xl">Fonctionnalité non disponible</CardTitle>
          <CardDescription>
            Cette fonctionnalité n&apos;est pas incluse dans votre forfait actuel
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
            <span className="text-sm text-muted-foreground">Votre forfait</span>
            <Badge variant="outline">{currentTier}</Badge>
          </div>
          
          <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
            <span className="text-sm text-muted-foreground">Fonctionnalité demandée</span>
            <span className="font-medium">{feature}</span>
          </div>
          
          <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
            <span className="text-sm text-muted-foreground">Forfait minimum requis</span>
            <Badge variant="default">{requiredTier}</Badge>
          </div>
          
          <Button asChild className="w-full">
            <Link href="/pricing">
              Upgrader mon forfait
              <ArrowUpRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SubscriptionRequiredPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Chargement...</div>}>
      <SubscriptionRequiredContent />
    </Suspense>
  );
}
```

- [ ] **Step 3: Vérifier que le fichier compile**

Run: `npx tsc --noEmit src/app/subscription-required/page.tsx`

- [ ] **Step 4: Commit**

```bash
git add src/app/subscription-required/page.tsx
git commit -m "feat: add /subscription-required page for feature restriction messages"
```

---

### Task 5: Modifier GradesView avec useFeatureAccess

**Files:**
- Modify: `src/components/views/GradesView.tsx`

**Interfaces:**
- Consumes: `useFeatureAccess` from `@/hooks/useFeatureAccess`
- Produces: GradesView vérifie l'accès à la feature 'grades'

- [ ] **Step 1: Lire GradesView.tsx pour comprendre la structure**

Lire `src/components/views/GradesView.tsx` pour identifier où ajouter la vérification.

- [ ] **Step 2: Ajouter l'import et la vérification au début du composant**

Ajouter après les imports existants:
```typescript
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
```

Dans le composant, ajouter la vérification:
```typescript
const { hasAccess, requiredTier } = useFeatureAccess('grades');
const router = useRouter();

useEffect(() => {
  if (!hasAccess) {
    router.push(`/subscription-required?feature=notes&requiredTier=${requiredTier}`);
  }
}, [hasAccess, requiredTier, router]);

if (!hasAccess) return null;
```

- [ ] **Step 3: Vérifier que le fichier compile**

Run: `npx tsc --noEmit src/components/views/GradesView.tsx`

- [ ] **Step 4: Commit**

```bash
git add src/components/views/GradesView.tsx
git commit -m "feat: add feature gate to GradesView"
```

---

### Task 6: Modifier PaymentsView avec useFeatureAccess

**Files:**
- Modify: `src/components/views/PaymentsView.tsx`

**Interfaces:**
- Consumes: `useFeatureAccess` from `@/hooks/useFeatureAccess`
- Produces: PaymentsView vérifie l'accès à la feature 'payments'

- [ ] **Step 1: Lire PaymentsView.tsx pour comprendre la structure**

Lire `src/components/views/PaymentsView.tsx`.

- [ ] **Step 2: Ajouter l'import et la vérification**

Ajouter après les imports:
```typescript
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
```

Dans le composant:
```typescript
const { hasAccess, requiredTier } = useFeatureAccess('payments');
const router = useRouter();

useEffect(() => {
  if (!hasAccess) {
    router.push(`/subscription-required?feature=paiements&requiredTier=${requiredTier}`);
  }
}, [hasAccess, requiredTier, router]);

if (!hasAccess) return null;
```

- [ ] **Step 3: Vérifier que le fichier compile**

Run: `npx tsc --noEmit src/components/views/PaymentsView.tsx`

- [ ] **Step 4: Commit**

```bash
git add src/components/views/PaymentsView.tsx
git commit -m "feat: add feature gate to PaymentsView"
```

---

### Task 7: Modifier CommunicationsView avec useFeatureAccess

**Files:**
- Modify: `src/components/views/CommunicationsView.tsx`

**Interfaces:**
- Consumes: `useFeatureAccess` from `@/hooks/useFeatureAccess`
- Produces: CommunicationsView vérifie l'accès à la feature 'communications'

- [ ] **Step 1: Lire CommunicationsView.tsx**

Lire `src/components/views/CommunicationsView.tsx`.

- [ ] **Step 2: Ajouter l'import et la vérification**

Ajouter après les imports:
```typescript
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
```

Dans le composant:
```typescript
const { hasAccess, requiredTier } = useFeatureAccess('communications');
const router = useRouter();

useEffect(() => {
  if (!hasAccess) {
    router.push(`/subscription-required?feature=communications&requiredTier=${requiredTier}`);
  }
}, [hasAccess, requiredTier, router]);

if (!hasAccess) return null;
```

- [ ] **Step 3: Vérifier que le fichier compile**

Run: `npx tsc --noEmit src/components/views/CommunicationsView.tsx`

- [ ] **Step 4: Commit**

```bash
git add src/components/views/CommunicationsView.tsx
git commit -m "feat: add feature gate to CommunicationsView"
```

---

### Task 8: Modifier ConvocationsView avec useFeatureAccess

**Files:**
- Modify: `src/components/views/ConvocationsView.tsx`

**Interfaces:**
- Consumes: `useFeatureAccess` from `@/hooks/useFeatureAccess`
- Produces: ConvocationsView vérifie l'accès à la feature 'convocations'

- [ ] **Step 1: Lire ConvocationsView.tsx**

Lire `src/components/views/ConvocationsView.tsx`.

- [ ] **Step 2: Ajouter l'import et la vérification**

Ajouter après les imports:
```typescript
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
```

Dans le composant:
```typescript
const { hasAccess, requiredTier } = useFeatureAccess('convocations');
const router = useRouter();

useEffect(() => {
  if (!hasAccess) {
    router.push(`/subscription-required?feature=convocations&requiredTier=${requiredTier}`);
  }
}, [hasAccess, requiredTier, router]);

if (!hasAccess) return null;
```

- [ ] **Step 3: Vérifier que le fichier compile**

Run: `npx tsc --noEmit src/components/views/ConvocationsView.tsx`

- [ ] **Step 4: Commit**

```bash
git add src/components/views/ConvocationsView.tsx
git commit -m "feat: add feature gate to ConvocationsView"
```

---

### Task 9: Modifier DisciplineView avec useFeatureAccess

**Files:**
- Modify: `src/components/views/DisciplineView.tsx`

**Interfaces:**
- Consumes: `useFeatureAccess` from `@/hooks/useFeatureAccess`
- Produces: DisciplineView vérifie l'accès à la feature 'discipline'

- [ ] **Step 1: Lire DisciplineView.tsx**

Lire `src/components/views/DisciplineView.tsx`.

- [ ] **Step 2: Ajouter l'import et la vérification**

Ajouter après les imports:
```typescript
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
```

Dans le composant:
```typescript
const { hasAccess, requiredTier } = useFeatureAccess('discipline');
const router = useRouter();

useEffect(() => {
  if (!hasAccess) {
    router.push(`/subscription-required?feature=discipline&requiredTier=${requiredTier}`);
  }
}, [hasAccess, requiredTier, router]);

if (!hasAccess) return null;
```

- [ ] **Step 3: Vérifier que le fichier compile**

Run: `npx tsc --noEmit src/components/views/DisciplineView.tsx`

- [ ] **Step 4: Commit**

```bash
git add src/components/views/DisciplineView.tsx
git commit -m "feat: add feature gate to DisciplineView"
```

---

### Task 10: Tests manuels

- [ ] **Step 1: Créer un script de test `scripts/test-feature-gate.js`**

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

async function testFeatureGate() {
  console.log('=== TESTING FEATURE GATE ===\n');
  
  // Login
  const login = await makeRequest('POST', '/api/auth', {
    phone: '+243844444444',
    password: 'admin123'
  });
  const token = login.data.data.token;
  const schoolId = login.data.data.schoolId;
  console.log(`✅ Login OK (School: ${schoolId})`);
  
  // Test 1: Try to access convocations (requires STANDARD+)
  console.log('\n--- Test 1: Access convocations (FREEMIUM school) ---');
  const convResult = await makeRequest('GET', `/api/schools/${schoolId}/convocations`, null, token);
  console.log(`   Status: ${convResult.status}`);
  if (convResult.status === 403) {
    console.log(`   ✅ Correctly blocked: ${convResult.data.error}`);
    console.log(`   Required tier: ${convResult.data.tierRequired}`);
  } else {
    console.log(`   ❌ Should have been blocked`);
  }
  
  // Test 2: Upgrade to STANDARD
  console.log('\n--- Test 2: Upgrade to STANDARD ---');
  const upgradeResult = await makeRequest('POST', '/api/subscription/downgrade', {
    schoolId: schoolId,
    newTier: 'STANDARD'
  }, token);
  console.log(`   Status: ${upgradeResult.status}`);
  console.log(`   Message: ${upgradeResult.data.message}`);
  
  // Test 3: Try convocations again (should work now)
  console.log('\n--- Test 3: Access convocations (STANDARD school) ---');
  const convResult2 = await makeRequest('GET', `/api/schools/${schoolId}/convocations`, null, token);
  console.log(`   Status: ${convResult2.status}`);
  if (convResult2.status === 200) {
    console.log(`   ✅ Access granted`);
  } else {
    console.log(`   ❌ Access denied: ${convResult2.data}`);
  }
  
  // Test 4: Downgrade back to FREEMIUM
  console.log('\n--- Test 4: Downgrade back to FREEMIUM ---');
  await makeRequest('POST', '/api/subscription/downgrade', {
    schoolId: schoolId,
    newTier: 'FREEMIUM'
  }, token);
  console.log(`   ✅ Downgraded to FREEMIUM`);
  
  console.log('\n=== ALL FEATURE GATE TESTS PASSED ✅ ===');
}

testFeatureGate().catch(console.error);
```

- [ ] **Step 2: Lancer le serveur**

Run: `npm run dev`

- [ ] **Step 3: Lancer les tests**

Run: `node scripts/test-feature-gate.js`

- [ ] **Step 4: Vérifier les résultats**

Le script doit afficher:
- Login OK
- Convocations bloquées en FREEMIUM (403)
- Upgrade à STANDARD
- Convocations autorisées en STANDARD (200)
- Downgrade retour à FREEMIUM

- [ ] **Step 5: Commit**

```bash
git add scripts/test-feature-gate.js
git commit -m "test: add feature gate test script"
```

---

## Résumé des tâches

| Task | Description | Fichiers |
|------|-------------|----------|
| 1 | Ajouter TIER_FEATURES et helpers | `src/lib/subscription.ts` |
| 2 | Créer middleware requireFeature | `src/lib/feature-gate.ts` (nouveau) |
| 3 | Créer hook useFeatureAccess | `src/hooks/useFeatureAccess.ts` (nouveau) |
| 4 | Créer page /subscription-required | `src/app/subscription-required/page.tsx` (nouveau) |
| 5 | Modifier GradesView | `src/components/views/GradesView.tsx` |
| 6 | Modifier PaymentsView | `src/components/views/PaymentsView.tsx` |
| 7 | Modifier CommunicationsView | `src/components/views/CommunicationsView.tsx` |
| 8 | Modifier ConvocationsView | `src/components/views/ConvocationsView.tsx` |
| 9 | Modifier DisciplineView | `src/components/views/DisciplineView.tsx` |
| 10 | Tests manuels | `scripts/test-feature-gate.js` (nouveau) |
