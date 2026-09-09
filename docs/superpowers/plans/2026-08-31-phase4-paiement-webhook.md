# Phase 4: Paiement Abonnement (Webhook) - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter le paiement d'abonnement via webhook pour EduGest.

**Architecture:** Endpoints pour initier le paiement et recevoir les webhooks des passerelles.

**Tech Stack:** Next.js, Prisma, TypeScript

## Global Constraints

- Utiliser les mêmes passerelles que les paiements de scolarité
- Vérifier la signature du webhook

---

## File Structure

| Fichier | Responsabilité |
|---------|---------------|
| `src/app/api/payment-gateways/initiate-subscription/route.ts` | NOUVEAU: Initier paiement abonnement |
| `src/app/api/payments/webhook/subscription/route.ts` | NOUVEAU: Recevoir webhook confirmation |

---

### Task 1: Endpoint POST initiate-subscription

**Files:**
- Create: `src/app/api/payment-gateways/initiate-subscription/route.ts`

- [ ] **Step 1: Créer le fichier**

```typescript
import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sanitizeError } from '@/lib/auth';
import { initiatePayment } from '@/lib/payment-gateway';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { subscriptionRequestId, gatewayType } = body;

    if (!subscriptionRequestId || !gatewayType) {
      return NextResponse.json(
        { error: 'subscriptionRequestId et gatewayType requis' },
        { status: 400 }
      );
    }

    // Récupérer la demande
    const subscriptionRequest = await db.subscriptionRequest.findUnique({
      where: { id: subscriptionRequestId },
      include: { school: true },
    });

    if (!subscriptionRequest) {
      return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
    }

    if (subscriptionRequest.schoolId !== user.schoolId) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    // Initier le paiement
    const paymentResult = await initiatePayment({
      schoolId: user.schoolId,
      amount: 0, // Montant à définir selon le tier
      currency: 'USD',
      gatewayType,
      reference: `SUB-${subscriptionRequest.id}`,
      metadata: {
        subscriptionRequestId: subscriptionRequest.id,
        requestedTier: subscriptionRequest.requestedTier,
      },
    });

    return NextResponse.json({
      data: paymentResult,
      message: 'Paiement initié',
    });
  } catch (error) {
    console.error('Error initiating subscription payment:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/payment-gateways/initiate-subscription/route.ts
git commit -m "feat: add POST endpoint for subscription payment initiation"
```

---

### Task 2: Endpoint POST webhook/subscription

**Files:**
- Create: `src/app/api/payments/webhook/subscription/route.ts`

- [ ] **Step 1: Créer le fichier**

```typescript
import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reference, status, transactionId } = body;

    if (!reference || !status) {
      return NextResponse.json(
        { error: 'reference et status requis' },
        { status: 400 }
      );
    }

    // Extraire l'ID de la demande d'abonnement de la référence
    const subscriptionRequestId = reference.replace('SUB-', '');

    // Mettre à jour la demande
    const subscriptionRequest = await db.subscriptionRequest.findUnique({
      where: { id: subscriptionRequestId },
    });

    if (!subscriptionRequest) {
      return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
    }

    if (status === 'SUCCESS' || status === 'COMPLETED') {
      await db.subscriptionRequest.update({
        where: { id: subscriptionRequestId },
        data: {
          status: 'PAID',
          paymentRef: transactionId,
        },
      });

      // Notifier les SUPER_ADMIN_GLOBAL
      const superAdmins = await db.user.findMany({
        where: { role: 'SUPER_ADMIN_GLOBAL' },
      });

      for (const admin of superAdmins) {
        await db.notification.create({
          data: {
            type: 'SUBSCRIPTION_PAYMENT',
            title: 'Paiement d\'abonnement reçu',
            message: `Un paiement a été reçu pour l'école ${subscriptionRequest.schoolId}. En attente de validation.`,
            userId: admin.id,
          },
        });
      }

      return NextResponse.json({ message: 'Paiement enregistré' });
    }

    return NextResponse.json({ message: 'Statut non traité' });
  } catch (error) {
    console.error('Error processing subscription webhook:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/payments/webhook/subscription/route.ts
git commit -m "feat: add POST endpoint for subscription payment webhook"
```

---

## Résumé

| Task | Description | Fichiers |
|------|-------------|----------|
| 1 | Endpoint initiate-subscription | `src/app/api/payment-gateways/initiate-subscription/route.ts` |
| 2 | Endpoint webhook/subscription | `src/app/api/payments/webhook/subscription/route.ts` |
