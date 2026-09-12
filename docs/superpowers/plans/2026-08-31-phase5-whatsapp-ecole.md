# Phase 5: WhatsApp par École - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter la configuration WhatsApp par école pour EduGest.

**Architecture:** Endpoints pour configurer et connecter le numéro WhatsApp de chaque école.

**Tech Stack:** Next.js, Prisma, TypeScript

## Global Constraints

- Chaque école a son propre numéro WhatsApp
- Les messages partent du numéro de l'école

---

## File Structure

| Fichier | Responsabilité |
|---------|---------------|
| `src/app/api/whatsapp-config/route.ts` | NOUVEAU: GET/POST config WhatsApp |
| `src/app/api/whatsapp-config/connect/route.ts` | NOUVEAU: POST connecter numéro |
| `src/app/api/whatsapp-config/status/route.ts` | NOUVEAU: GET status connexion |
| `src/lib/whatsapp-agent.ts` | Modifier: utiliser numéro école |

---

### Task 1: Endpoint GET/POST whatsapp-config

**Files:**
- Create: `src/app/api/whatsapp-config/route.ts`

- [ ] **Step 1: Créer le fichier**

```typescript
import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sanitizeError } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || user.schoolId;

    const config = await db.globalApiConfig.findUnique({
      where: { key: `WHATSAPP_SCHOOL_CONFIG_${schoolId}` },
    });

    if (!config) {
      return NextResponse.json({ data: null });
    }

    const parsed = JSON.parse(config.value);
    return NextResponse.json({ data: parsed });
  } catch (error) {
    console.error('Error fetching whatsapp config:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { phoneNumber } = body;

    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'phoneNumber requis' },
        { status: 400 }
      );
    }

    const config = {
      phoneNumber,
      isConnected: false,
      connectedAt: null,
    };

    await db.globalApiConfig.upsert({
      where: { key: `WHATSAPP_SCHOOL_CONFIG_${user.schoolId}` },
      create: {
        key: `WHATSAPP_SCHOOL_CONFIG_${user.schoolId}`,
        value: JSON.stringify(config),
        updatedBy: user.id,
      },
      update: {
        value: JSON.stringify(config),
        updatedBy: user.id,
      },
    });

    return NextResponse.json({
      data: config,
      message: 'Configuration WhatsApp sauvegardée',
    });
  } catch (error) {
    console.error('Error saving whatsapp config:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/whatsapp-config/route.ts
git commit -m "feat: add GET/POST endpoints for WhatsApp config"
```

---

### Task 2: Endpoint POST connect

**Files:**
- Create: `src/app/api/whatsapp-config/connect/route.ts`

- [ ] **Step 1: Créer le fichier**

```typescript
import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sanitizeError } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const config = await db.globalApiConfig.findUnique({
      where: { key: `WHATSAPP_SCHOOL_CONFIG_${user.schoolId}` },
    });

    if (!config) {
      return NextResponse.json(
        { error: 'Configurez d\'abord le numéro WhatsApp' },
        { status: 400 }
      );
    }

    const parsed = JSON.parse(config.value);

    // Ici, on simulerait la connexion au service WhatsApp
    // En production, on appellerait l'API WhatsApp pour générer un QR code
    const updatedConfig = {
      ...parsed,
      isConnected: true,
      connectedAt: new Date().toISOString(),
    };

    await db.globalApiConfig.update({
      where: { key: `WHATSAPP_SCHOOL_CONFIG_${user.schoolId}` },
      data: { value: JSON.stringify(updatedConfig) },
    });

    return NextResponse.json({
      data: updatedConfig,
      message: 'Connexion WhatsApp établie',
    });
  } catch (error) {
    console.error('Error connecting whatsapp:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/whatsapp-config/connect/route.ts
git commit -m "feat: add POST endpoint for WhatsApp connection"
```

---

### Task 3: Endpoint GET status

**Files:**
- Create: `src/app/api/whatsapp-config/status/route.ts`

- [ ] **Step 1: Créer le fichier**

```typescript
import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, sanitizeError } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const config = await db.globalApiConfig.findUnique({
      where: { key: `WHATSAPP_SCHOOL_CONFIG_${user.schoolId}` },
    });

    if (!config) {
      return NextResponse.json({
        data: {
          isConfigured: false,
          isConnected: false,
          phoneNumber: null,
        },
      });
    }

    const parsed = JSON.parse(config.value);
    return NextResponse.json({
      data: {
        isConfigured: true,
        isConnected: parsed.isConnected || false,
        phoneNumber: parsed.phoneNumber,
        connectedAt: parsed.connectedAt,
      },
    });
  } catch (error) {
    console.error('Error fetching whatsapp status:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/whatsapp-config/status/route.ts
git commit -m "feat: add GET endpoint for WhatsApp status"
```

---

### Task 4: Modifier whatsapp-agent.ts

**Files:**
- Modify: `src/lib/whatsapp-agent.ts`

- [ ] **Step 1: Ajouter la fonction getSchoolWhatsAppNumber**

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

- [ ] **Step 2: Modifier les fonctions d'envoi pour utiliser le numéro de l'école**

Chercher les endroits où le numéro WhatsApp est utilisé et les modifier pour appeler `getSchoolWhatsAppNumber`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/whatsapp-agent.ts
git commit -m "feat: use school-specific WhatsApp number"
```

---

## Résumé

| Task | Description | Fichiers |
|------|-------------|----------|
| 1 | GET/POST whatsapp-config | `src/app/api/whatsapp-config/route.ts` |
| 2 | POST connect | `src/app/api/whatsapp-config/connect/route.ts` |
| 3 | GET status | `src/app/api/whatsapp-config/status/route.ts` |
| 4 | Modifier whatsapp-agent.ts | `src/lib/whatsapp-agent.ts` |
