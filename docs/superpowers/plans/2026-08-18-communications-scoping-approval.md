# Communications Scoping & Admin Approval Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Direction roles can only send communications to their domain (maternelle/primaire/secondaire), and admin must approve before publication.

**Architecture:** Add `status` field (PENDING/APPROVED/REJECTED) and `scope` field to Communication model. Directions create PENDING communications scoped to their domain. Admin approves → APPROVED → visible to targeted users. Notifications sent to admin on new pending communication.

**Tech Stack:** Next.js API routes, Prisma/SQLite, React (Zustand store), Lucide icons

## Global Constraints

- No touching frontend when installing frameworks
- LUXE AFRICAIN theme (oklch colors, gold/teal) — never change
- User communicates in French
- Currency: CDF/USD/FCFA
- WhatsApp server on port 3001, frontend on port 3000
- Use `npm` not `bun`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `prisma/schema.prisma` | Add `status`, `scope`, `targetLevel` to Communication |
| `src/app/api/communications/route.ts` | Filter by status, scope, approval logic |
| `src/app/api/communications/[id]/approve/route.ts` | NEW: Approve/reject endpoint |
| `src/app/api/notifications/route.ts` | Already exists — use for admin notifications |
| `src/app/page.tsx` | Update CommunicationsView UI |
| `src/lib/types.ts` | Update CommunicationData type |

---

### Task 1: Update Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add fields to Communication model**

```prisma
model Communication {
  id            String   @id @default(cuid())
  senderId      String
  senderRole    String
  schoolId      String
  type          String
  title         String
  content       String
  targetType    String
  targetId      String?
  sentToApp     Boolean  @default(true)
  sentToWhatsapp Boolean @default(true)
  status        String   @default("APPROVED")  // PENDING, APPROVED, REJECTED
  scope         String?  // MATERNELLE, PRIMAIRE, SECONDAIRE, null=ALL
  targetLevel   String?  // alias for scope, derived from sender role
  sentAt        DateTime @default(now())
  createdAt     DateTime @default(now())

  school        School   @relation(fields: [schoolId], references: [id])
  reads         CommunicationRead[]
}
```

- [ ] **Step 2: Push schema**

Run: `npx prisma db push`
Expected: "Your database is now in sync with your Prisma schema"

- [ ] **Step 3: Regenerate client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client"

---

### Task 2: Update CommunicationData Type

**Files:**
- Modify: `src/lib/types.ts:58-62`

- [ ] **Step 1: Add status and scope to type**

```typescript
export interface CommunicationData {
  id: string; type: string; title: string; content: string;
  targetType: string; sentToApp: boolean; sentToWhatsapp: boolean;
  sentAt: string; senderId: string; senderRole: string; schoolId: string;
  status?: string; scope?: string; targetLevel?: string;
  reads?: { id: string; userId: string; readAt: string; user?: { id: string; name: string; role: string } }[];
}
```

---

### Task 3: Create Approval API Endpoint

**Files:**
- Create: `src/app/api/communications/[id]/approve/route.ts`

- [ ] **Step 1: Create approve/reject endpoint**

```typescript
import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, sanitizeError } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, 'communications:create');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;
    const { id } = await params;

    if (!['SUPER_ADMIN_GLOBAL', 'ADMIN'].includes(user.role)) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    const body = await request.json();
    const { action } = body; // 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
    }

    const comm = await db.communication.findUnique({ where: { id } });
    if (!comm) {
      return NextResponse.json({ error: 'Communication non trouvée' }, { status: 404 });
    }

    if (comm.status !== 'PENDING') {
      return NextResponse.json({ error: 'Communication déjà traitée' }, { status: 400 });
    }

    const newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';
    const updated = await db.communication.update({
      where: { id },
      data: { status: newStatus },
    });

    // Create notification for the sender
    await db.notification.create({
      data: {
        userId: comm.senderId,
        schoolId: comm.schoolId,
        type: newStatus === 'APPROVED' ? 'COMMUNICATION_APPROVED' : 'COMMUNICATION_REJECTED',
        title: newStatus === 'APPROVED' ? 'Communication approuvée' : 'Communication rejetée',
        message: `Votre communication "${comm.title}" a été ${newStatus === 'APPROVED' ? 'approuvée' : 'rejetée'} par l'admin.`,
        read: false,
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('Error approving communication:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify file compiles**

No test needed — API endpoint.

---

### Task 4: Update Communications API for Scoping

**Files:**
- Modify: `src/app/api/communications/route.ts`

- [ ] **Step 1: Add scope filtering to GET**

Update the GET handler to:
1. Filter by status (APPROVED for non-admin, all for admin)
2. Filter by scope based on sender's direction role
3. Add status to POST creation (PENDING for directions, APPROVED for admin)

Key changes in GET:
```typescript
// After line 30 (where clause setup)
// Filter by status - non-admin only see APPROVED
if (user.role !== 'SUPER_ADMIN_GLOBAL' && user.role !== 'ADMIN') {
  where.status = 'APPROVED';
}

// Filter by scope - directions only see their domain
if (user.role === 'DIRECTION_MATERNELLE') {
  where.OR = [{ scope: null }, { scope: 'MATERNELLE' }];
} else if (user.role === 'DIRECTION_PRIMAIRE') {
  where.OR = [{ scope: null }, { scope: 'PRIMAIRE' }];
} else if (user.role === 'DIRECTION_SECONDAIRE') {
  where.OR = [{ scope: null }, { scope: 'SECONDAIRE' }];
}
```

Key changes in POST:
```typescript
// After line 100 (communication creation)
// Determine scope from sender role
let scope = null;
let status = 'APPROVED';
if (user.role === 'DIRECTION_MATERNELLE') {
  scope = 'MATERNELLE';
  status = 'PENDING';
} else if (user.role === 'DIRECTION_PRIMAIRE') {
  scope = 'PRIMAIRE';
  status = 'PENDING';
} else if (user.role === 'DIRECTION_SECONDAIRE') {
  scope = 'SECONDAIRE';
  status = 'PENDING';
}

const communication = await db.communication.create({
  data: {
    senderId,
    senderRole,
    schoolId,
    type,
    title,
    content,
    targetType: targetType || 'ALL',
    targetId: targetId || null,
    sentToApp: sentToApp !== undefined ? sentToApp : true,
    sentToWhatsapp: sentToWhatsapp !== undefined ? sentToWhatsapp : true,
    status,
    scope,
  },
});

// Notify admin if pending
if (status === 'PENDING') {
  const admins = await db.user.findMany({
    where: { schoolId, role: { in: ['SUPER_ADMIN_GLOBAL', 'ADMIN'] } },
  });
  for (const admin of admins) {
    await db.notification.create({
      data: {
        userId: admin.id,
        schoolId,
        type: 'COMMUNICATION_PENDING',
        title: 'Communication en attente',
        message: `${user.name} a créé une communication "${title}" qui nécessite votre approbation.`,
        read: false,
      },
    });
  }
}
```

---

### Task 5: Update CommunicationsView UI

**Files:**
- Modify: `src/app/page.tsx` (CommunicationsView function)

- [ ] **Step 1: Add scope selector for directions**

In the compose form, add a scope dropdown when the user is a direction:
```typescript
const isDirection = ['DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE'].includes(userRole || '')

// In the form, after targetType select:
{isDirection && (
  <select value={scope} onChange={e => setScope(e.target.value)} className="...">
    <option value="">Toutes les classes</option>
    <option value="MATERNELLE">Maternelle</option>
    <option value="PRIMAIRE">Primaire</option>
    <option value="SECONDAIRE">Secondaire</option>
  </select>
)}
```

- [ ] **Step 2: Add scope state**

```typescript
const [scope, setScope] = useState('')
```

- [ ] **Step 3: Update handleSend to include scope**

```typescript
body: JSON.stringify({
  senderId: userData?.id || 'demo', senderRole: userData?.role || 'SECRETARY',
  schoolId: userData?.schoolId || 'demo', type, title, content, targetType,
  sentToApp: app, sentToWhatsapp: whatsapp, scope: scope || undefined,
}),
```

- [ ] **Step 4: Add status badge in history**

For each communication card, show status:
```typescript
{c.status === 'PENDING' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[oklch(95%_0.04_25)] text-edu-warning">En attente</span>}
{c.status === 'REJECTED' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[oklch(95%_0.02_25)] text-edu-danger">Rejetée</span>}
```

- [ ] **Step 5: Add approve/reject buttons for admin**

For PENDING communications, show approve/reject buttons:
```typescript
{canCreate && c.status === 'PENDING' && (
  <div className="flex gap-2 mt-2">
    <button onClick={() => handleApprove(c.id, 'approve')} className="text-[10px] px-2 py-1 rounded-lg bg-edu-success/10 text-edu-success hover:bg-edu-success/20">
      Approuver
    </button>
    <button onClick={() => handleApprove(c.id, 'reject')} className="text-[10px] px-2 py-1 rounded-lg bg-edu-danger/10 text-edu-danger hover:bg-edu-danger/20">
      Rejeter
    </button>
  </div>
)}
```

- [ ] **Step 6: Add handleApprove function**

```typescript
async function handleApprove(id: string, action: 'approve' | 'reject') {
  try {
    const res = await authFetch(`/api/communications/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (res.ok) {
      toast.success(action === 'approve' ? 'Communication approuvée !' : 'Communication rejetée')
      // Refresh list
      const json = await (await authFetch(`/api/communications?limit=20${userData?.schoolId ? `&schoolId=${userData.schoolId}` : ''}`)).json()
      setComms(json.data || [])
      setTotalUsers(json.totalUsers || 0)
    }
  } catch { toast.error('Erreur') }
}
```

---

### Task 6: Add Notification Badge for Pending Communications

**Files:**
- Modify: `src/app/page.tsx` (CommunicationsView)

- [ ] **Step 1: Add pending count badge**

In the header, show count of pending communications:
```typescript
const pendingCount = comms.filter(c => c.status === 'PENDING').length

// In the header:
{canCreate && pendingCount > 0 && (
  <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-edu-warning/20 text-edu-warning">
    {pendingCount} en attente
  </span>
)}
```

---

### Task 7: Update Sidebar Notification Count

**Files:**
- Modify: `src/app/page.tsx` (DashboardLayout)

- [ ] **Step 1: Add pending communications to notification count**

In the sidebar, update the notification badge to include pending communications:
```typescript
// In the notification count calculation
const pendingComms = comms.filter(c => c.status === 'PENDING').length
const unreadNotifs = notifications.filter(n => !n.read).length
const totalUnread = unreadNotifs + pendingComms
```

---

### Task 8: Test & Verify

- [ ] **Step 1: Start app**

Run: `node start-all.js`

- [ ] **Step 2: Test as DIRECTION_PRIMAIRE**

1. Login as DIRECTION_PRIMAIRE
2. Go to Communications
3. Create a communication → should show "En attente" badge
4. Verify it's scoped to PRIMAIRE only

- [ ] **Step 3: Test as SUPER_ADMIN_GLOBAL**

1. Login as SUPER_ADMIN_GLOBAL
2. Go to Communications
3. See pending communication with "Approuver" / "Rejeter" buttons
4. Click "Approuver" → communication becomes visible to all
5. Verify notification badge updates

- [ ] **Step 4: Test as PARENT**

1. Login as PARENT
2. Go to Communications
3. Should only see APPROVED communications
4. Should NOT see stats or approve/reject buttons

- [ ] **Step 5: Verify build compiles**

Run: `npx next build --webpack`
Expected: "Compiled successfully"

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Update Prisma schema with status/scope fields |
| 2 | Update TypeScript type |
| 3 | Create approval API endpoint |
| 4 | Update communications API for scoping |
| 5 | Update UI with scope selector and approve/reject |
| 6 | Add pending count badge |
| 7 | Update sidebar notification count |
| 8 | Test all flows |
