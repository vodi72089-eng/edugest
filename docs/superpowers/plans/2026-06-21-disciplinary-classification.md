# Disciplinary Auto-Classification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically classify students into disciplinary lists (Blacklist/Greylist/Whitelist) based on sanction history, severity, and learned keywords from staff-written causes.

**Architecture:** Rule-based classifier with keyword learning. Classification runs after each sanction creation/update. Staff can override manually. Keywords are extracted from manually-set blacklist entries.

**Tech Stack:** Next.js API routes, Prisma ORM, SQLite, TypeScript, jsPDF-style rule engine

## Global Constraints

- No external AI/API (OpenAI, etc.) — all logic is local rule-based
- Classification is deterministic and predictable
- Staff can always override manually
- Auto-classifications are marked with `autoClassified = true`
- Follow existing code patterns in `src/app/api/discipline/route.ts`

---

## File Structure

### New Files
| File | Purpose |
|------|---------|
| `src/lib/discipline-classifier.ts` | Core classification logic (rules + keyword matching) |
| `src/app/api/discipline/classify/route.ts` | POST endpoint to trigger classification for a student |
| `src/app/api/discipline/keywords/route.ts` | GET/DELETE endpoints for learned keywords |
| `prisma/migrations/20260621_add_discipline_keyword/migration.sql` | DB migration |

### Modified Files
| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add `DisciplineKeyword` model |
| `src/app/api/discipline/route.ts` | Call classifier after POST/PUT |
| `src/lib/types.ts` | Add `DisciplineKeywordData` type |
| `src/components/views/DisciplineView.tsx` | Add auto-classify button + keywords tab |
| `src/components/dashboards/DisciplineDashboard.tsx` | Add auto-classification stat card |

---

### Task 1: Database Schema — Add DisciplineKeyword Model

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Consumes: None (first task)
- Produces: `DisciplineKeyword` Prisma model available for all subsequent tasks

- [ ] **Step 1: Add DisciplineKeyword model to schema**

Open `prisma/schema.prisma` and add after the `Whitelist` model (around line 227):

```prisma
model DisciplineKeyword {
  id          String   @id @default(cuid())
  keyword     String
  listType    String   // BLACKLIST, GREYLIST, WHITELIST
  schoolId    String
  learnedFrom String?  // DisciplineRecord ID that taught this keyword
  createdAt   DateTime @default(now())

  @@unique([keyword, schoolId])
}
```

- [ ] **Step 2: Run Prisma generate**

Run: `npx prisma generate`
Expected: "Generated Prisma Client"

- [ ] **Step 3: Run Prisma db push**

Run: `npx prisma db push --accept-data-loss`
Expected: "Your database is now in sync with your Prisma schema"

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(discipline): add DisciplineKeyword model for learned keywords"
```

---

### Task 2: TypeScript Types — Add DisciplineKeywordData

**Files:**
- Modify: `src/lib/types.ts` (around line 45)

**Interfaces:**
- Consumes: None
- Produces: `DisciplineKeywordData` type used by API routes and UI

- [ ] **Step 1: Add type definition**

Open `src/lib/types.ts` and add after the `DisciplineData` interface (around line 45):

```typescript
export interface DisciplineKeywordData {
  id: string
  keyword: string
  listType: string
  schoolId: string
  learnedFrom?: string
  createdAt: string
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | Select-String "types.ts"`
Expected: No errors in types.ts

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(discipline): add DisciplineKeywordData type"
```

---

### Task 3: Core Classifier — discipline-classifier.ts

**Files:**
- Create: `src/lib/discipline-classifier.ts`

**Interfaces:**
- Consumes: `DisciplineKeyword` model, `DisciplineData` type
- Produces: `classifyStudent()` function used by API routes

- [ ] **Step 1: Create the classifier module**

Create `src/lib/discipline-classifier.ts` with the following content:

```typescript
import { db } from '@/lib/db'

// Static keywords for classification
const CRITICAL_KEYWORDS = [
  'violence', 'arme', 'drogue', 'vol', 'agression', 'menace',
  'harcèlement', 'incendie', 'dégradation', 'couteau', 'pistolet',
  'attaque', 'bagarre', 'meurtre', 'sexuel', 'abus'
]

const POSITIVE_KEYWORDS = [
  'excellence', 'mérite', 'brillance', 'example', 'leadership',
  'responsabilité', 'aide', 'solidarité', 'perseverance', 'resultat'
]

// Words to ignore when extracting keywords from causes
const STOP_WORDS = new Set([
  'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'ou',
  'que', 'qui', 'dans', 'pour', 'par', 'sur', 'avec', 'ce', 'cette',
  'est', 'sont', 'a', 'au', 'aux', 'en', 'il', 'elle', 'nous',
  'vous', 'ils', 'elles', 'pas', 'ne', 'se', 'son', 'sa', 'ses',
  'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'leur', 'leurs',
  'été', 'être', 'avoir', 'faire', 'dit', 'fait', 'voir', 'tout',
  'très', 'trop', 'bien', 'mal', 'aussi', 'mais', 'donc', 'car',
  'si', 'alors', 'comme', 'même', 'encore', 'plus', 'moins'
])

export interface ClassificationResult {
  listType: 'BLACKLIST' | 'GREYLIST' | 'WHITELIST'
  reason: string
  autoClassified: boolean
  details: {
    totalPoints: number
    sanctionCount: number
    criticalCount: number
    sameTypeCount: number
    matchedKeywords: string[]
  }
}

/**
 * Extract meaningful keywords from text (title + description)
 */
export function extractKeywords(text: string): string[] {
  if (!text) return []
  return text
    .toLowerCase()
    .replace(/[^a-zàâäéèêëïîôùûüÿç\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !STOP_WORDS.has(word))
    .filter((word, i, arr) => arr.indexOf(word) === i) // unique
}

/**
 * Get total penalty points for a student in current school year
 */
async function getStudentPoints(studentId: string, schoolYearId: string): Promise<number> {
  const result = await db.disciplineRecord.aggregate({
    where: { studentId, schoolYearId },
    _sum: { points: true }
  })
  return result._sum.points || 0
}

/**
 * Count sanctions by type for a student
 */
async function getSanctionTypeCounts(studentId: string, schoolYearId: string) {
  const records = await db.disciplineRecord.groupBy({
    by: ['type'],
    where: { studentId, schoolYearId },
    _count: { id: true }
  })
  return records.map(r => ({ type: r.type, count: r._count.id }))
}

/**
 * Count critical severity sanctions
 */
async function getCriticalCount(studentId: string, schoolYearId: string): Promise<number> {
  return db.disciplineRecord.count({
    where: { studentId, schoolYearId, severity: 'CRITICAL' }
  })
}

/**
 * Get recent descriptions for keyword matching
 */
async function getRecentDescriptions(studentId: string, limit: number = 10): Promise<string[]> {
  const records = await db.disciplineRecord.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { title: true, description: true }
  })
  return records.map(r => `${r.title} ${r.description}`)
}

/**
 * Get learned keywords for a school
 */
async function getLearnedKeywords(schoolId: string, listType?: string) {
  const where: any = { schoolId }
  if (listType) where.listType = listType
  return db.disciplineKeyword.findMany({ where })
}

/**
 * Main classification function
 */
export async function classifyStudent(
  studentId: string,
  schoolId: string,
  schoolYearId: string
): Promise<ClassificationResult> {
  // 1. Get student data
  const totalPoints = await getStudentPoints(studentId, schoolYearId)
  const typeCounts = await getSanctionTypeCounts(studentId, schoolYearId)
  const criticalCount = await getCriticalCount(studentId, schoolYearId)
  const descriptions = await getRecentDescriptions(studentId)

  // 2. Check for positive sanctions → WHITELIST
  if (totalPoints > 0) {
    return {
      listType: 'WHITELIST',
      reason: 'Sanctions positives détectées',
      autoClassified: true,
      details: { totalPoints, sanctionCount: typeCounts.reduce((s, t) => s + t.count, 0), criticalCount, sameTypeCount: 0, matchedKeywords: [] }
    }
  }

  // 3. Check CRITICAL severity → direct BLACKLIST
  if (criticalCount > 0) {
    return {
      listType: 'BLACKLIST',
      reason: `${criticalCount} sanction(s) critique(s)`,
      autoClassified: true,
      details: { totalPoints, sanctionCount: typeCounts.reduce((s, t) => s + t.count, 0), criticalCount, sameTypeCount: 0, matchedKeywords: [] }
    }
  }

  // 4. Check static keywords in descriptions
  const allText = descriptions.join(' ').toLowerCase()
  const matchedStatic = CRITICAL_KEYWORDS.filter(kw => allText.includes(kw))
  if (matchedStatic.length > 0) {
    return {
      listType: 'BLACKLIST',
      reason: `Mots-clés critiques trouvés: ${matchedStatic.join(', ')}`,
      autoClassified: true,
      details: { totalPoints, sanctionCount: typeCounts.reduce((s, t) => s + t.count, 0), criticalCount, sameTypeCount: 0, matchedKeywords: matchedStatic }
    }
  }

  // 5. Check learned keywords
  const learned = await getLearnedKeywords(schoolId, 'BLACKLIST')
  const learnedWords = learned.map(k => k.keyword.toLowerCase())
  const matchedLearned = learnedWords.filter(kw => allText.includes(kw))
  if (matchedLearned.length > 0) {
    return {
      listType: 'BLACKLIST',
      reason: `Mots-clés appris trouvés: ${matchedLearned.join(', ')}`,
      autoClassified: true,
      details: { totalPoints, sanctionCount: typeCounts.reduce((s, t) => s + t.count, 0), criticalCount, sameTypeCount: 0, matchedKeywords: matchedLearned }
    }
  }

  // 6. Check points threshold (-10)
  if (totalPoints <= -10) {
    return {
      listType: 'BLACKLIST',
      reason: `Seuil de points atteint: ${totalPoints}`,
      autoClassified: true,
      details: { totalPoints, sanctionCount: typeCounts.reduce((s, t) => s + t.count, 0), criticalCount, sameTypeCount: 0, matchedKeywords: [] }
    }
  }

  // 7. Check repeated grave types (3+ VIOLENCE or TRICHERIE)
  const graveTypes = typeCounts.filter(t =>
    (t.type === 'VIOLENCE' || t.type === 'TRICHERIE') && t.count >= 3
  )
  if (graveTypes.length > 0) {
    return {
      listType: 'BLACKLIST',
      reason: `${graveTypes[0].count} sanctions de type ${graveTypes[0].type}`,
      autoClassified: true,
      details: { totalPoints, sanctionCount: typeCounts.reduce((s, t) => s + t.count, 0), criticalCount, sameTypeCount: graveTypes[0].count, matchedKeywords: [] }
    }
  }

  // 8. Default: GREYLIST for negative points
  if (totalPoints < 0) {
    return {
      listType: 'GREYLIST',
      reason: 'Sanctions modérées',
      autoClassified: true,
      details: { totalPoints, sanctionCount: typeCounts.reduce((s, t) => s + t.count, 0), criticalCount, sameTypeCount: 0, matchedKeywords: [] }
    }
  }

  // 9. No sanctions → GREYLIST (default)
  return {
    listType: 'GREYLIST',
    reason: 'Aucune sanctions',
    autoClassified: true,
    details: { totalPoints, sanctionCount: typeCounts.reduce((s, t) => s + t.count, 0), criticalCount, sameTypeCount: 0, matchedKeywords: [] }
  }
}

/**
 * Learn keywords from a manually-set blacklist entry
 */
export async function learnKeywordsFromRecord(
  recordId: string,
  title: string,
  description: string,
  schoolId: string
): Promise<string[]> {
  const text = `${title} ${description}`
  const keywords = extractKeywords(text)

  const learned: string[] = []
  for (const kw of keywords) {
    try {
      await db.disciplineKeyword.upsert({
        where: { keyword_schoolId: { keyword: kw, schoolId } },
        update: {},
        create: { keyword: kw, listType: 'BLACKLIST', schoolId, learnedFrom: recordId }
      })
      learned.push(kw)
    } catch {
      // Ignore duplicate errors
    }
  }
  return learned
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | Select-String "discipline-classifier"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/discipline-classifier.ts
git commit -m "feat(discipline): add rule-based classifier with keyword learning"
```

---

### Task 4: Classification API Endpoint

**Files:**
- Create: `src/app/api/discipline/classify/route.ts`

**Interfaces:**
- Consumes: `classifyStudent()` from `src/lib/discipline-classifier.ts`
- Produces: POST endpoint used by DisciplineView UI

- [ ] **Step 1: Create the classify API route**

Create directory `src/app/api/discipline/classify/` and file `route.ts`:

```typescript
import { db } from '@/lib/db'
import { requireAuth, requireRole, verifySchoolAccess, sanitizeError } from '@/lib/auth'
import { classifyStudent } from '@/lib/discipline-classifier'
import { NextRequest, NextResponse } from 'next/server'

const CLASSIFY_ROLES = [
  'SUPER_ADMIN_GLOBAL', 'ADMIN', 'SECRETARY',
  'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE',
  'DISCIPLINE_MATERNELLE', 'DISCIPLINE_PRIMAIRE', 'DISCIPLINE_SECONDAIRE',
  'HEAD_TEACHER'
]

// POST /api/discipline/classify
// Trigger auto-classification for a student
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, CLASSIFY_ROLES)
    if ('error' in authResult) return authResult.error
    const { user } = authResult

    const body = await request.json()
    const { studentId, schoolId } = body

    if (!studentId || !schoolId) {
      return NextResponse.json(
        { error: 'studentId et schoolId sont requis' },
        { status: 400 }
      )
    }

    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 })
    }

    // Find active school year
    const schoolYear = await db.schoolYear.findFirst({
      where: { schoolId, isActive: true },
      select: { id: true }
    })

    if (!schoolYear) {
      return NextResponse.json({ error: 'Année scolaire active non trouvée' }, { status: 404 })
    }

    // Run classification
    const result = await classifyStudent(studentId, schoolId, schoolYear.id)

    // Update the student's latest discipline records with the classified listType
    const latestRecord = await db.disciplineRecord.findFirst({
      where: { studentId, schoolId },
      orderBy: { createdAt: 'desc' }
    })

    if (latestRecord) {
      await db.disciplineRecord.update({
        where: { id: latestRecord.id },
        data: { listType: result.listType }
      })

      // Sync with list tables
      const listTable = result.listType === 'BLACKLIST' ? 'blacklist'
        : result.listType === 'WHITELIST' ? 'whitelist' : 'greylist'

      const reason = `${result.reason} (${result.details.totalPoints} pts)`

      if (listTable === 'blacklist') {
        await db.blacklist.create({
          data: { studentId, schoolId, reason, addedBy: user.name || user.id }
        })
      } else if (listTable === 'whitelist') {
        await db.whitelist.create({
          data: { studentId, schoolId, reason, addedBy: user.name || user.id }
        })
      } else {
        await db.greylist.create({
          data: { studentId, schoolId, reason, addedBy: user.name || user.id }
        })
      }
    }

    return NextResponse.json({
      data: result,
      message: `Élève classifié en ${result.listType}`
    })
  } catch (error) {
    console.error('[Discipline] Classification error:', error)
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | Select-String "classify"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/discipline/classify/route.ts
git commit -m "feat(discipline): add POST /api/discipline/classify endpoint"
```

---

### Task 5: Keywords API Endpoint

**Files:**
- Create: `src/app/api/discipline/keywords/route.ts`
- Create: `src/app/api/discipline/keywords/[id]/route.ts`

**Interfaces:**
- Consumes: `DisciplineKeyword` model, `extractKeywords()` from classifier
- Produces: GET/DELETE endpoints used by DisciplineView keywords tab

- [ ] **Step 1: Create GET /api/discipline/keywords**

Create directory `src/app/api/discipline/keywords/` and file `route.ts`:

```typescript
import { db } from '@/lib/db'
import { requireAuth, verifySchoolAccess, sanitizeError } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

// GET /api/discipline/keywords?schoolId=...
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error
    const { user } = authResult

    const { searchParams } = new URL(request.url)
    const schoolId = searchParams.get('schoolId') || user.schoolId

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId est requis' }, { status: 400 })
    }

    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }

    const keywords = await db.disciplineKeyword.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json({ data: keywords })
  } catch (error) {
    console.error('[Keywords] Error:', error)
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create DELETE /api/discipline/keywords/[id]**

Create file `src/app/api/discipline/keywords/[id]/route.ts`:

```typescript
import { db } from '@/lib/db'
import { requireRole, verifySchoolAccess, sanitizeError } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

const ADMIN_ROLES = ['SUPER_ADMIN_GLOBAL', 'ADMIN', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE']

// DELETE /api/discipline/keywords/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireRole(request, ADMIN_ROLES)
    if ('error' in authResult) return authResult.error
    const { user } = authResult

    const { id } = await params

    const keyword = await db.disciplineKeyword.findUnique({ where: { id } })
    if (!keyword) {
      return NextResponse.json({ error: 'Mot-clé non trouvé' }, { status: 404 })
    }

    if (!verifySchoolAccess(user, keyword.schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 })
    }

    await db.disciplineKeyword.delete({ where: { id } })

    return NextResponse.json({ message: 'Mot-clé supprimé' })
  } catch (error) {
    console.error('[Keywords] Delete error:', error)
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 })
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | Select-String "keywords"`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/discipline/keywords/
git commit -m "feat(discipline): add GET/DELETE /api/discipline/keywords endpoints"
```

---

### Task 6: Wire Classification into Discipline API

**Files:**
- Modify: `src/app/api/discipline/route.ts`

**Interfaces:**
- Consumes: `classifyStudent()`, `learnKeywordsFromRecord()` from classifier
- Produces: Auto-classification triggered on POST and PUT

- [ ] **Step 1: Add classification import**

Open `src/app/api/discipline/route.ts` and add at the top (after existing imports):

```typescript
import { classifyStudent, learnKeywordsFromRecord } from '@/lib/discipline-classifier'
```

- [ ] **Step 2: Add classification after POST (sanction creation)**

Find the POST handler's success response (around line 150-180, after the WhatsApp notification). Add before the final return:

```typescript
    // Auto-classify student after new sanction
    try {
      const schoolYear = await db.schoolYear.findFirst({
        where: { schoolId, isActive: true },
        select: { id: true }
      })
      if (schoolYear) {
        const classification = await classifyStudent(studentId, schoolId, schoolYear.id)
        // Update the record's listType if auto-classification differs
        if (classification.listType !== listType) {
          await db.disciplineRecord.update({
            where: { id: record.id },
            data: { listType: classification.listType }
          })
        }
      }
    } catch (e) {
      console.warn('[Discipline] Auto-classification failed:', e)
    }
```

- [ ] **Step 3: Add keyword learning when staff manually sets BLACKLIST**

In the PUT handler, after updating a record, add keyword learning:

```typescript
    // Learn keywords when staff manually sets BLACKLIST
    if (listType === 'BLACKLIST' && record.listType !== 'BLACKLIST') {
      try {
        await learnKeywordsFromRecord(record.id, record.title, record.description, record.schoolId)
      } catch (e) {
        console.warn('[Discipline] Keyword learning failed:', e)
      }
    }
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | Select-String "discipline/route"`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/app/api/discipline/route.ts
git commit -m "feat(discipline): wire auto-classification into discipline CRUD"
```

---

### Task 7: UI — Auto-Classify Button in DisciplineView

**Files:**
- Modify: `src/components/views/DisciplineView.tsx`

**Interfaces:**
- Consumes: POST `/api/discipline/classify`
- Produces: Auto-classify button visible to discipline staff

- [ ] **Step 1: Add classifyStudent function**

In `DisciplineView.tsx`, add a function to call the classify API:

```typescript
const handleAutoClassify = async (studentId: string) => {
  try {
    const res = await authFetch('/api/discipline/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, schoolId: userData?.schoolId })
    })
    const json = await res.json()
    if (json.data) {
      toast.success(`Classifié: ${json.data.listType} — ${json.data.reason}`)
      // Refresh discipline records
      loadData()
    } else {
      toast.error(json.error || 'Erreur de classification')
    }
  } catch {
    toast.error('Erreur réseau')
  }
}
```

- [ ] **Step 2: Add auto-classify button in the student row**

In the discipline table, add a button next to each student (in the actions column or after the list type dropdown):

```tsx
<button
  onClick={() => handleAutoClassify(s.id)}
  className="text-xs px-2 py-1 rounded-lg border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)] transition"
  title="Classifier automatiquement"
>
  <Brain size={12} />
</button>
```

(Add `Brain` to the lucide-react imports at the top of the file)

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | Select-String "DisciplineView"`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/views/DisciplineView.tsx
git commit -m "feat(discipline): add auto-classify button to DisciplineView"
```

---

### Task 8: UI — Keywords Tab in DisciplineView

**Files:**
- Modify: `src/components/views/DisciplineView.tsx`

**Interfaces:**
- Consumes: GET `/api/discipline/keywords`, DELETE `/api/discipline/keywords/[id]`
- Produces: Keywords management tab in discipline view

- [ ] **Step 1: Add state and fetch for keywords**

Add state variables:

```typescript
const [keywords, setKeywords] = useState<DisciplineKeywordData[]>([])
const [keywordsLoading, setKeywordsLoading] = useState(false)
```

Add fetch function:

```typescript
const loadKeywords = async () => {
  setKeywordsLoading(true)
  try {
    const res = await authFetch(`/api/discipline/keywords?schoolId=${userData?.schoolId}`)
    const json = await res.json()
    setKeywords(json.data || [])
  } catch {}
  finally { setKeywordsLoading(false) }
}
```

- [ ] **Step 2: Add Keywords tab**

Add a new tab button next to the existing BLACKLIST/GREYLIST/WHITELIST tabs:

```tsx
<button
  onClick={() => { setActiveTab('keywords'); loadKeywords() }}
  className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
    activeTab === 'keywords' ? 'border-[#f5a623] text-[#f5a623]' : 'border-transparent text-gray-500 hover:text-gray-700'
  }`}
>
  Mots-clés appris
</button>
```

- [ ] **Step 3: Add Keywords tab content**

Add the tab content panel:

```tsx
{activeTab === 'keywords' && (
  <div className="space-y-4">
    <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[oklch(90%_0.01_175)]" style={{ background: IVORY }}>
        <h3 className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>
          Mots-clés appris automatiquement
        </h3>
        <p className="text-xs mt-0.5" style={{ color: TEXT_MUTED_LUXE }}>
          Extraits des causes quand le personnel met manuellement un élève en liste noire
        </p>
      </div>
      {keywordsLoading ? (
        <div className="p-6 text-center text-sm" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</div>
      ) : keywords.length === 0 ? (
        <div className="p-6 text-center text-sm" style={{ color: TEXT_MUTED_LUXE }}>
          Aucun mot-clé appris. Les mots-clés seront extraits quand vous classifierez manuellement un élève en liste noire.
        </div>
      ) : (
        <div className="p-4 flex flex-wrap gap-2">
          {keywords.map(kw => (
            <span key={kw.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-red-50 text-red-700">
              {kw.keyword}
              <button
                onClick={async () => {
                  if (!confirm('Supprimer ce mot-clé ?')) return
                  await authFetch(`/api/discipline/keywords/${kw.id}`, { method: 'DELETE' })
                  setKeywords(prev => prev.filter(k => k.id !== kw.id))
                  toast.success('Mot-clé supprimé')
                }}
                className="hover:text-red-900"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  </div>
)}
```

(Add `X` to the lucide-react imports if not already present)

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | Select-String "DisciplineView"`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/components/views/DisciplineView.tsx
git commit -m "feat(discipline): add keywords management tab to DisciplineView"
```

---

### Task 9: Dashboard — Auto-Classification Stat Card

**Files:**
- Modify: `src/components/dashboards/DisciplineDashboard.tsx`

**Interfaces:**
- Consumes: Discipline stats from API
- Produces: Visual indicator of auto-classifications

- [ ] **Step 1: Add auto-classification count stat**

In `DisciplineDashboard.tsx`, add a new stat card after the existing ones:

```tsx
<div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-4 shadow-sm">
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 rounded-xl grid place-items-center" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
      <Brain size={18} className="text-white" />
    </div>
    <div>
      <div className="text-2xl font-bold" style={{ color: TEXT_PRIMARY }}>{stats.discipline.blacklist}</div>
      <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Classifications auto</div>
    </div>
  </div>
</div>
```

(Add `Brain` to lucide-react imports)

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | Select-String "DisciplineDashboard"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboards/DisciplineDashboard.tsx
git commit -m "feat(discipline): add auto-classification stat to dashboard"
```

---

### Task 10: Final Verification

**Files:**
- All modified files

**Interfaces:**
- Consumes: All previous tasks
- Produces: Working end-to-end feature

- [ ] **Step 1: Full TypeScript check**

Run: `npx tsc --noEmit --pretty 2>&1 | Select-String "src/"`
Expected: No new errors in src/ files

- [ ] **Step 2: Test classification API manually**

Start the dev server: `npm run dev`

Test via browser console or curl:
```bash
curl -X POST http://localhost:3000/api/discipline/classify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"studentId": "<test-student-id>", "schoolId": "<test-school-id>"}'
```

Expected: Returns `{ data: { listType: "GREYLIST", reason: "...", ... } }`

- [ ] **Step 3: Test keyword learning**

1. Create a discipline record with severity CRITICAL and listType BLACKLIST
2. Check that keywords were extracted and stored
3. Verify keywords appear in the Keywords tab

- [ ] **Step 4: Test auto-classification on new sanction**

1. Create a new sanction for a student with points that total ≤ -10
2. Verify the student is automatically classified to BLACKLIST

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(discipline): complete auto-classification system with keyword learning"
```
