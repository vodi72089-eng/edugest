# Phase 1: Archivage + Limites Tier - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter le système d'archivage automatique des élèves et les limites par tier pour les abonnements EduGest.

**Architecture:** Ajouter un champ `isArchived` à la table Student, créer des fonctions d'archivage/restauration, modifier les vérifications de limites pour exclure les archivés, et ajouter les endpoints API nécessaires.

**Tech Stack:** Next.js, Prisma, TypeScript, SQLite

## Global Constraints

- Ne pas casser le backend existant
- Ne pas casser le frontend existant
- Tous les endpoints existants continuent de fonctionner
- Les élèves archivés sont invisibles par défaut
- Les limites sont vérifiées sur les élèves actifs uniquement

---

## File Structure

| Fichier | Responsabilité |
|---------|---------------|
| `prisma/schema.prisma` | Ajouter champ `isArchived` + `archivedAt` à Student |
| `src/lib/subscription.ts` | Modifier `checkCanCreateStudent` pour exclure archivés |
| `src/lib/archive.ts` | NOUVEAU: Fonctions `archiveExcessStudents`, `restoreArchivedStudents`, `getArchivedStudents` |
| `src/app/api/schools/[id]/archived-students/route.ts` | NOUVEAU: Endpoint GET pour lister les élèves archivés |
| `src/app/api/schools/[id]/restore-students/route.ts` | NOUVEAU: Endpoint POST pour restaurer des élèves |
| `src/app/api/subscription/downgrade/route.ts` | NOUVEAU: Endpoint POST pour déclencher l'archivage au downgrade |

---

### Task 1: Migration Prisma - Ajouter isArchived à Student

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: Champ `isArchived Boolean @default(false)` et `archivedAt DateTime?` sur le modèle Student

- [ ] **Step 1: Lire le schéma Prisma actuel**

Lire `prisma/schema.prisma` pour trouver le modèle Student.

- [ ] **Step 2: Ajouter les champs d'archivage au modèle Student**

Dans le bloc `model Student`, ajouter après les champs existants:

```prisma
  isArchived   Boolean  @default(false)
  archivedAt   DateTime?
```

- [ ] **Step 3: Générer le client Prisma**

Run: `npx prisma generate`

- [ ] **Step 4: Créer la migration**

Run: `npx prisma migrate dev --name add-student-archived`

- [ ] **Step 5: Vérifier que la migration a fonctionné**

Run: `npx prisma db pull` et vérifier que les champs apparaissent.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add isArchived and archivedAt fields to Student model"
```

---

### Task 2: Fonctions d'archivage/restauration

**Files:**
- Create: `src/lib/archive.ts`

**Interfaces:**
- Consumes: `db` from `@/lib/db`, `getTierLimits` from `@/lib/subscription`
- Produces:
  - `archiveExcessStudents(schoolId: string, newTier: string): Promise<{ archived: number }>`
  - `restoreArchivedStudents(schoolId: string, newTier: string): Promise<{ restored: number }>`
  - `getArchivedStudents(schoolId: string): Promise<Student[]>`

- [ ] **Step 1: Créer le fichier `src/lib/archive.ts`**

```typescript
import { db } from './db';
import { getTierLimits } from './subscription';

/**
 * Archive les élèves excédentaires quand l'admin change de tier (downgarde).
 * Archive les élèves les plus anciens en premier.
 */
export async function archiveExcessStudents(
  schoolId: string,
  newTier: string
): Promise<{ archived: number }> {
  const limits = getTierLimits(newTier);
  const currentActive = await db.student.count({
    where: { schoolId, isArchived: false },
  });

  if (currentActive <= limits.maxStudents) {
    return { archived: 0 };
  }

  const excess = currentActive - limits.maxStudents;
  
  // Trouver les élèves actifs les plus anciens à archiver
  const studentsToArchive = await db.student.findMany({
    where: { schoolId, isArchived: false },
    orderBy: { createdAt: 'asc' },
    take: excess,
    select: { id: true },
  });

  if (studentsToArchive.length === 0) {
    return { archived: 0 };
  }

  // Archiver en lot
  const ids = studentsToArchive.map(s => s.id);
  await db.student.updateMany({
    where: { id: { in: ids } },
    data: {
      isArchived: true,
      archivedAt: new Date(),
    },
  });

  return { archived: ids.length };
}

/**
 * Restaure les élèves archivés quand l'admin upgarde de tier.
 * Restaure les élèves archivés les plus récents en premier.
 */
export async function restoreArchivedStudents(
  schoolId: string,
  newTier: string
): Promise<{ restored: number }> {
  const limits = getTierLimits(newTier);
  const currentActive = await db.student.count({
    where: { schoolId, isArchived: false },
  });

  const archivedCount = await db.student.count({
    where: { schoolId, isArchived: true },
  });

  if (archivedCount === 0) {
    return { restored: 0 };
  }

  // Combien peut-on restaurer ?
  const availableSpace = limits.maxStudents - currentActive;
  const toRestore = Math.min(availableSpace, archivedCount);

  if (toRestore <= 0) {
    return { restored: 0 };
  }

  // Trouver les élèves archivés les plus récents à restaurer
  const studentsToRestore = await db.student.findMany({
    where: { schoolId, isArchived: true },
    orderBy: { archivedAt: 'desc' },
    take: toRestore,
    select: { id: true },
  });

  if (studentsToRestore.length === 0) {
    return { restored: 0 };
  }

  // Restaurer en lot
  const ids = studentsToRestore.map(s => s.id);
  await db.student.updateMany({
    where: { id: { in: ids } },
    data: {
      isArchived: false,
      archivedAt: null,
    },
  });

  return { restored: ids.length };
}

/**
 * Récupère la liste des élèves archivés d'une école.
 */
export async function getArchivedStudents(schoolId: string) {
  return db.student.findMany({
    where: { schoolId, isArchived: true },
    orderBy: { archivedAt: 'desc' },
    include: {
      class: { select: { id: true, name: true } },
      parent: { select: { id: true, name: true, email: true } },
    },
  });
}
```

- [ ] **Step 2: Vérifier que le fichier compile**

Run: `npx tsc --noEmit src/lib/archive.ts`

- [ ] **Step 3: Commit**

```bash
git add src/lib/archive.ts
git commit -m "feat: add archive/restore functions for student tier management"
```

---

### Task 3: Modifier checkCanCreateStudent pour exclure les archivés

**Files:**
- Modify: `src/lib/subscription.ts:170-180`

**Interfaces:**
- Consumes: `isArchived` field on Student
- Produces: `checkCanCreateStudent` retourne correctement le nombre d'élèves actifs (non archivés)

- [ ] **Step 1: Lire la fonction actuelle**

Lire `src/lib/subscription.ts` lignes 170-180.

- [ ] **Step 2: Modifier la requête pour exclure les archivés**

Remplacer:
```typescript
const current = await db.student.count({ where: { schoolId } });
```

Par:
```typescript
const current = await db.student.count({ where: { schoolId, isArchived: false } });
```

- [ ] **Step 3: Vérifier que le fichier compile**

Run: `npx tsc --noEmit src/lib/subscription.ts`

- [ ] **Step 4: Commit**

```bash
git add src/lib/subscription.ts
git commit -m "fix: exclude archived students from tier limit checks"
```

---

### Task 4: Endpoint GET /api/schools/[id]/archived-students

**Files:**
- Create: `src/app/api/schools/[id]/archived-students/route.ts`

**Interfaces:**
- Consumes: `getArchivedStudents` from `@/lib/archive`, `requirePermission`, `verifySchoolAccess`
- Produces: Liste des élèves archivés pour une école

- [ ] **Step 1: Créer le fichier de route**

```typescript
import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, verifySchoolAccess, sanitizeError } from '@/lib/auth';
import { getArchivedStudents } from '@/lib/archive';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, 'students:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { id } = await params;

    // Vérifier l'accès à l'école
    if (!verifySchoolAccess(user, id)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    const archivedStudents = await getArchivedStudents(id);

    return NextResponse.json({ data: archivedStudents });
  } catch (error) {
    console.error('Error fetching archived students:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Vérifier que le fichier compile**

Run: `npx tsc --noEmit src/app/api/schools/[id]/archived-students/route.ts`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/schools/[id]/archived-students/route.ts
git commit -m "feat: add GET endpoint for archived students"
```

---

### Task 5: Endpoint POST /api/schools/[id]/restore-students

**Files:**
- Create: `src/app/api/schools/[id]/restore-students/route.ts`

**Interfaces:**
- Consumes: `restoreArchivedStudents` from `@/lib/archive`, `requirePermission`, `verifySchoolAccess`
- Produces: Nombre d'élèves restaurés

- [ ] **Step 1: Créer le fichier de route**

```typescript
import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, verifySchoolAccess, sanitizeError } from '@/lib/auth';
import { restoreArchivedStudents } from '@/lib/archive';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, 'students:update');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { id } = await params;

    // Vérifier l'accès à l'école
    if (!verifySchoolAccess(user, id)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    // Récupérer le tier actuel de l'école
    const school = await db.school.findUnique({
      where: { id },
      select: { subscriptionTier: true },
    });

    if (!school) {
      return NextResponse.json({ error: 'École introuvable' }, { status: 404 });
    }

    const tier = school.subscriptionTier || 'FREEMIUM';
    const result = await restoreArchivedStudents(id, tier);

    return NextResponse.json({ 
      data: result,
      message: result.restored > 0 
        ? `${result.restored} élève(s) restauré(s)` 
        : 'Aucun élève à restaurer'
    });
  } catch (error) {
    console.error('Error restoring students:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Vérifier que le fichier compile**

Run: `npx tsc --noEmit src/app/api/schools/[id]/restore-students/route.ts`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/schools/[id]/restore-students/route.ts
git commit -m "feat: add POST endpoint to restore archived students"
```

---

### Task 6: Endpoint POST /api/subscription/downgrade

**Files:**
- Create: `src/app/api/subscription/downgrade/route.ts`

**Interfaces:**
- Consumes: `archiveExcessStudents` from `@/lib/archive`, `requireAuth`, `verifySchoolAccess`
- Produces: Déclenche l'archivage + met à jour le tier de l'école

- [ ] **Step 1: Créer le fichier de route**

```typescript
import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, verifySchoolAccess, sanitizeError } from '@/lib/auth';
import { archiveExcessStudents } from '@/lib/archive';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { schoolId, newTier } = body;

    if (!schoolId || !newTier) {
      return NextResponse.json(
        { error: 'schoolId et newTier requis' },
        { status: 400 }
      );
    }

    // Vérifier l'accès à l'école
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json(
        { error: 'Accès non autorisé à cette école' },
        { status: 403 }
      );
    }

    // Vérifier que le nouveau tier est valide
    const validTiers = ['FREEMIUM', 'ESSENTIEL', 'STANDARD', 'PREMIUM', 'ENTERPRISE', 'CORPORATE'];
    if (!validTiers.includes(newTier)) {
      return NextResponse.json(
        { error: 'Tier invalide' },
        { status: 400 }
      );
    }

    // Archiver les élèves excédentaires
    const archiveResult = await archiveExcessStudents(schoolId, newTier);

    // Mettre à jour le tier de l'école
    await db.school.update({
      where: { id: schoolId },
      data: { subscriptionTier: newTier },
    });

    return NextResponse.json({
      data: {
        newTier,
        archived: archiveResult.archived,
      },
      message: archiveResult.archived > 0
        ? `Tier changé en ${newTier}. ${archiveResult.archived} élève(s) archivé(s).`
        : `Tier changé en ${newTier}. Aucun élève à archiver.`,
    });
  } catch (error) {
    console.error('Error during downgrade:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Vérifier que le fichier compile**

Run: `npx tsc --noEmit src/app/api/subscription/downgrade/route.ts`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/subscription/downgrade/route.ts
git commit -m "feat: add POST endpoint for subscription downgrade with archiving"
```

---

### Task 7: Modifier StudentsView pour afficher les archivés

**Files:**
- Modify: `src/components/views/StudentsView.tsx`

**Interfaces:**
- Consumes: `GET /api/schools/[id]/archived-students`
- Produces: Section "Archives" dans la vue des élèves

- [ ] **Step 1: Lire StudentsView.tsx pour comprendre la structure**

Lire `src/components/views/StudentsView.tsx` pour identifier où ajouter la section archives.

- [ ] **Step 2: Ajouter un bouton "Archives" dans la barre d'actions**

Ajouter un bouton à côté du bouton existant "+ Ajouter élève":

```tsx
{archivedCount > 0 && (
  <Button
    variant="outline"
    onClick={() => setShowArchives(!showArchives)}
    className="gap-2"
  >
    <Archive className="h-4 w-4" />
    Archives ({archivedCount})
  </Button>
)}
```

- [ ] **Step 3: Ajouter la fonction pour récupérer les archivés**

Ajouter un useEffect pour récupérer le nombre d'archivés:

```tsx
const [archivedCount, setArchivedCount] = useState(0);
const [archivedStudents, setArchivedStudents] = useState([]);
const [showArchives, setShowArchives] = useState(false);

useEffect(() => {
  if (userData?.schoolId) {
    authFetch(`/api/schools/${userData.schoolId}/archived-students`)
      .then(res => res.json())
      .then(data => {
        setArchivedStudents(data.data || []);
        setArchivedCount(data.data?.length || 0);
      });
  }
}, [userData?.schoolId]);
```

- [ ] **Step 4: Ajouter la section affichage des archives**

Ajouter une section conditionnelle après le tableau principal:

```tsx
{showArchives && archivedStudents.length > 0 && (
  <div className="mt-6">
    <h3 className="text-lg font-semibold mb-4">Élèves archivés</h3>
    <div className="space-y-2">
      {archivedStudents.map((student: any) => (
        <div key={student.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <div>
            <p className="font-medium">{student.firstName} {student.lastName}</p>
            <p className="text-sm text-muted-foreground">
              {student.class?.name} • Archivé le {new Date(student.archivedAt).toLocaleDateString('fr-FR')}
            </p>
          </div>
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 5: Vérifier que le frontend compile**

Run: `npm run build` ou vérifier dans le navigateur.

- [ ] **Step 6: Commit**

```bash
git add src/components/views/StudentsView.tsx
git commit -m "feat: add archived students section in StudentsView"
```

---

### Task 8: Tests manuels

- [ ] **Step 1: Créer un script de test `scripts/test-archive.ts`**

```typescript
import { db } from '../src/lib/db';
import { archiveExcessStudents, restoreArchivedStudents, getArchivedStudents } from '../src/lib/archive';
import { getTierLimits } from '../src/lib/subscription';

async function testArchive() {
  console.log('=== Test Archivage ===');
  
  // Trouver une école
  const school = await db.school.findFirst();
  if (!school) {
    console.log('Aucune école trouvée. Lancez le seed d\'abord.');
    return;
  }
  
  console.log(`École: ${school.name} (Tier: ${school.subscriptionTier})`);
  
  // Compter les élèves actifs
  const activeCount = await db.student.count({
    where: { schoolId: school.id, isArchived: false },
  });
  console.log(`Élèves actifs: ${activeCount}`);
  
  // Tester archivage vers FREEMIUM (100 max)
  console.log('\n--- Test archivage vers FREEMIUM ---');
  const result = await archiveExcessStudents(school.id, 'FREEMIUM');
  console.log(`Archivés: ${result.archived}`);
  
  // Vérifier les archivés
  const archived = await getArchivedStudents(school.id);
  console.log(`Total archivés: ${archived.length}`);
  
  // Tester restauration vers ESSENTIEL (500 max)
  console.log('\n--- Test restauration vers ESSENTIEL ---');
  const restoreResult = await restoreArchivedStudents(school.id, 'ESSENTIEL');
  console.log(`Restaurés: ${restoreResult.restored}`);
  
  console.log('\n=== Tests terminés ===');
}

testArchive().catch(console.error);
```

- [ ] **Step 2: Lancer le script de test**

Run: `npx tsx scripts/test-archive.ts`

- [ ] **Step 3: Vérifier les résultats**

Le script doit afficher:
- Le nombre d'élèves archivés vers FREEMIUM
- Le nombre d'élèves restaurés vers ESSENTIEL

- [ ] **Step 4: Commit**

```bash
git add scripts/test-archive.ts
git commit -m "test: add archive/restore test script"
```

---

## Résumé des tâches

| Task | Description | Fichiers |
|------|-------------|----------|
| 1 | Migration Prisma | `prisma/schema.prisma` |
| 2 | Fonctions archivage | `src/lib/archive.ts` (nouveau) |
| 3 | Modifier checkCanCreateStudent | `src/lib/subscription.ts` |
| 4 | Endpoint GET archived-students | `src/app/api/schools/[id]/archived-students/route.ts` (nouveau) |
| 5 | Endpoint POST restore-students | `src/app/api/schools/[id]/restore-students/route.ts` (nouveau) |
| 6 | Endpoint POST downgrade | `src/app/api/subscription/downgrade/route.ts` (nouveau) |
| 7 | Modifier StudentsView | `src/components/views/StudentsView.tsx` |
| 8 | Tests manuels | `scripts/test-archive.ts` (nouveau) |
