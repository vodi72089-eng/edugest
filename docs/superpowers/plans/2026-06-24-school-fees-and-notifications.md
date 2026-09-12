# School Fees + Payment Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add school fee configuration per class and send in-app + WhatsApp notifications for payment events.

**Architecture:** New `SchoolFee` model for fee config, new `Notification` model for in-app notifications, extend `whatsapp-agent.ts` for payment WhatsApp messages. SettingsView gets a new tab for fee management. Bell icon in topbar becomes functional.

**Tech Stack:** Prisma/SQLite, Next.js API routes, React (sonner toasts, Zustand), whatsapp-web.js

## Global Constraints

- Design system: oklch colors, LUXE AFRICAIN theme (GOLD, ACCENT, IVORY, TEXT_PRIMARY, TEXT_MUTED_LUXE)
- WhatsApp server: localhost:3001
- SUPER_ADMIN_GLOBAL never receives payment notifications
- French language for all UI text
- Build command: `npx next build --webpack`

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | Modify | Add SchoolFee + Notification models |
| `src/app/api/school-fees/route.ts` | Create | SchoolFee CRUD (GET, POST) |
| `src/app/api/school-fees/[id]/route.ts` | Create | SchoolFee update/delete |
| `src/app/api/notifications/route.ts` | Create | Notification list + mark read |
| `src/app/api/notifications/read-all/route.ts` | Create | Mark all as read |
| `src/components/views/SettingsView.tsx` | Modify | Add "Frais scolaires" tab |
| `src/app/page.tsx` | Modify | Bell icon + notification panel |
| `src/app/api/payments/route.ts` | Modify | Trigger notifications on create |
| `src/app/api/payments/verify/route.ts` | Modify | Trigger notifications on approve/reject |
| `src/lib/whatsapp-agent.ts` | Modify | Add payment notification functions |
| `src/components/views/PaymentsView.tsx` | Modify | Auto-populate fees from config |

---

### Task 1: Database Schema — SchoolFee + Notification Models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add SchoolFee model to schema.prisma**

Add after the `Class` model (around line 123):

```prisma
model SchoolFee {
  id          String   @id @default(cuid())
  name        String
  amount      Float
  trimester   String
  classId     String
  class       Class    @relation(fields: [classId], references: [id], onDelete: Cascade)
  schoolId    String
  school      School   @relation(fields: [schoolId], references: [id], onDelete: Cascade)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([classId, trimester, name])
  @@index([schoolId])
  @@index([classId])
}
```

- [ ] **Step 2: Add Notification model to schema.prisma**

Add after the new SchoolFee model:

```prisma
model Notification {
  id          String   @id @default(cuid())
  type        String
  title       String
  message     String
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  schoolId    String?
  relatedId   String?
  isRead      Boolean  @default(false)
  createdAt   DateTime @default(now())

  @@index([userId, isRead])
  @@index([schoolId])
}
```

- [ ] **Step 3: Add reverse relations to existing models**

In the `Class` model, add: `schoolFees SchoolFee[]`
In the `School` model, add: `schoolFees SchoolFee[]` and `notifications Notification[]`
In the `User` model, add: `notifications Notification[]`

- [ ] **Step 4: Push schema and generate**

Run: `npx prisma generate && npx prisma db push`

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(db): add SchoolFee and Notification models"
```

---

### Task 2: SchoolFee API Routes

**Files:**
- Create: `src/app/api/school-fees/route.ts`
- Create: `src/app/api/school-fees/[id]/route.ts`

**Interfaces:**
- Consumes: SchoolFee model from Task 1
- Produces: `GET /api/school-fees`, `POST /api/school-fees`, `PUT /api/school-fees/[id]`, `DELETE /api/school-fees/[id]`

- [ ] **Step 1: Create GET/POST route**

Create `src/app/api/school-fees/route.ts`:

```typescript
import { db } from '@/lib/db';
import { requirePermission, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'school:read');
    if ('error' in authResult) return authResult.error;

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || '';
    const classId = searchParams.get('classId') || '';
    const trimester = searchParams.get('trimester') || '';

    const where: Record<string, unknown> = { isActive: true };
    if (schoolId) where.schoolId = schoolId;
    if (classId) where.classId = classId;
    if (trimester) where.trimester = trimester;

    const fees = await db.schoolFee.findMany({
      where,
      include: { class: { select: { id: true, name: true } } },
      orderBy: [{ class: { name: 'asc' } }, { trimester: 'asc' }],
    });

    return NextResponse.json({ data: fees });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'school:update');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    if (!['SUPER_ADMIN_GLOBAL', 'SECRETARY'].includes(user.role)) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const body = await request.json();
    const { name, amount, trimester, classId, schoolId } = body;

    if (!name || !amount || !trimester || !classId || !schoolId) {
      return NextResponse.json({ error: 'Tous les champs sont requis' }, { status: 400 });
    }

    const fee = await db.schoolFee.create({
      data: { name, amount: parseFloat(amount), trimester, classId, schoolId },
      include: { class: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ data: fee }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create PUT/DELETE route**

Create `src/app/api/school-fees/[id]/route.ts`:

```typescript
import { db } from '@/lib/db';
import { requirePermission, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, 'school:update');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    if (!['SUPER_ADMIN_GLOBAL', 'SECRETARY'].includes(user.role)) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { name, amount, trimester } = body;

    const fee = await db.schoolFee.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(amount && { amount: parseFloat(amount) }),
        ...(trimester && { trimester }),
      },
      include: { class: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ data: fee });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requirePermission(request, 'school:update');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    if (!['SUPER_ADMIN_GLOBAL', 'SECRETARY'].includes(user.role)) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const { id } = await params;
    await db.schoolFee.delete({ where: { id } });

    return NextResponse.json({ message: 'Frais supprimé' });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
```

- [ ] **Step 3: Test API**

Run: `curl http://localhost:3000/api/school-fees` (should return empty list)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/school-fees/
git commit -m "feat(api): SchoolFee CRUD endpoints"
```

---

### Task 3: SettingsView — Frais Scolaires Tab

**Files:**
- Modify: `src/components/views/SettingsView.tsx`

**Interfaces:**
- Consumes: `GET /api/school-fees`, `POST /api/school-fees`, `PUT /api/school-fees/[id]`, `DELETE /api/school-fees/[id]`, `GET /api/classes`

- [ ] **Step 1: Add tab state and imports**

In SettingsView.tsx, add at top:
```typescript
import { Plus, Trash2, Edit, GraduationCap } from 'lucide-react'
```

Add state after existing states:
```typescript
const [activeTab, setActiveTab] = useState<'info' | 'fees'>('info')
const [fees, setFees] = useState<any[]>([])
const [classes, setClasses] = useState<any[]>([])
const [showFeeModal, setShowFeeModal] = useState(false)
const [feeForm, setFeeForm] = useState({ name: '', amount: '', trimester: 'T1', classId: '' })
const [editingFee, setEditingFee] = useState<any>(null)
```

- [ ] **Step 2: Add fee data loading**

Add useEffect to load fees and classes:
```typescript
useEffect(() => {
  if (userData?.schoolId) {
    authFetch(`/api/school-fees?schoolId=${userData.schoolId}`).then(r => r.json()).then(j => setFees(j.data || []))
    authFetch(`/api/classes?schoolId=${userData.schoolId}`).then(r => r.json()).then(j => setClasses(j.data || []))
  }
}, [userData?.schoolId])
```

- [ ] **Step 3: Add tab navigation UI**

Before the form section, add tabs:
```tsx
<div className="flex gap-2 mb-6">
  <button onClick={() => setActiveTab('info')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${activeTab === 'info' ? 'text-white' : ''}`} style={activeTab === 'info' ? { background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` } : { color: TEXT_MUTED_LUXE }}>
    Informations
  </button>
  <button onClick={() => setActiveTab('fees')} className={`px-4 py-2 rounded-xl text-sm font-medium transition ${activeTab === 'fees' ? 'text-white' : ''}`} style={activeTab === 'fees' ? { background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` } : { color: TEXT_MUTED_LUXE }}>
    <GraduationCap size={14} className="inline mr-1" /> Frais scolaires
  </button>
</div>
```

- [ ] **Step 4: Add fees table section**

After the existing form (when `activeTab === 'fees'`), add:
```tsx
{activeTab === 'fees' && (
  <div className="space-y-4">
    <div className="flex justify-between items-center">
      <h3 className="text-lg font-bold" style={{ color: TEXT_PRIMARY }}>Frais scolaires</h3>
      <button onClick={() => { setEditingFee(null); setFeeForm({ name: '', amount: '', trimester: 'T1', classId: '' }); setShowFeeModal(true) }} className="edu-gold-cta inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold">
        <Plus size={14} /> Ajouter
      </button>
    </div>
    <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl overflow-hidden">
      <table className="w-full">
        <thead><tr style={{ background: IVORY }}>
          <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Nom</th>
          <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Montant</th>
          <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Trimestre</th>
          <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Classe</th>
          <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}></th>
        </tr></thead>
        <tbody>
          {fees.map(f => (
            <tr key={f.id} className="border-b border-[oklch(90%_0.01_175)] last:border-0">
              <td className="px-4 py-3 text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>{f.name}</td>
              <td className="px-4 py-3 text-[13px] font-semibold" style={{ color: ACCENT }}>{formatNumber(f.amount)} CDF</td>
              <td className="px-4 py-3 text-[13px]" style={{ color: TEXT_PRIMARY }}>{f.trimester}</td>
              <td className="px-4 py-3 text-[13px]" style={{ color: TEXT_PRIMARY }}>{f.class?.name}</td>
              <td className="px-4 py-3">
                <div className="flex gap-1">
                  <button onClick={() => { setEditingFee(f); setFeeForm({ name: f.name, amount: String(f.amount), trimester: f.trimester, classId: f.classId }); setShowFeeModal(true) }} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-[oklch(95%_0.04_175)]" style={{ color: TEXT_MUTED_LUXE }}><Edit size={14} /></button>
                  <button onClick={async () => { if (confirm('Supprimer ce frais ?')) { await authFetch(`/api/school-fees/${f.id}`, { method: 'DELETE' }); setFees(fees.filter(x => x.id !== f.id)); toast.success('Frais supprimé') } }} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-red-50" style={{ color: DANGER }}><Trash2 size={14} /></button>
                </div>
              </td>
            </tr>
          ))}
          {fees.length === 0 && <tr><td colSpan={5} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Aucun frais configuré</td></tr>}
        </tbody>
      </table>
    </div>
  </div>
)}
```

- [ ] **Step 5: Add fee modal**

Add after the fees table (inside the `{activeTab === 'fees'}` block):
```tsx
{showFeeModal && (
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowFeeModal(false)}>
    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl" onClick={e => e.stopPropagation()}>
      <h3 className="text-lg font-bold mb-4" style={{ color: TEXT_PRIMARY }}>{editingFee ? 'Modifier' : 'Ajouter'} un frais</h3>
      <div className="space-y-3">
        <input type="text" placeholder="Nom du frais" value={feeForm.name} onChange={e => setFeeForm({...feeForm, name: e.target.value})} className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm" />
        <input type="number" placeholder="Montant (CDF)" value={feeForm.amount} onChange={e => setFeeForm({...feeForm, amount: e.target.value})} className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm" />
        <select value={feeForm.trimester} onChange={e => setFeeForm({...feeForm, trimester: e.target.value})} className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm">
          <option value="T1">Trimestre 1</option>
          <option value="T2">Trimestre 2</option>
          <option value="T3">Trimestre 3</option>
        </select>
        <select value={feeForm.classId} onChange={e => setFeeForm({...feeForm, classId: e.target.value})} className="w-full px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm">
          <option value="">Choisir une classe</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="flex justify-end gap-3 mt-6">
        <button onClick={() => setShowFeeModal(false)} className="px-5 py-2.5 rounded-xl text-sm font-medium border" style={{ color: TEXT_MUTED_LUXE }}>Annuler</button>
        <button onClick={async () => {
          const url = editingFee ? `/api/school-fees/${editingFee.id}` : '/api/school-fees';
          const method = editingFee ? 'PUT' : 'POST';
          const res = await authFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...feeForm, schoolId: userData?.schoolId }) });
          if (res.ok) { toast.success(editingFee ? 'Frais modifié' : 'Frais ajouté'); setShowFeeModal(false); /* reload fees */ }
        }} className="edu-gold-cta px-6 py-2.5 rounded-xl text-sm font-semibold">Enregistrer</button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/views/SettingsView.tsx
git commit -m "feat(ui): add school fees tab in SettingsView"
```

---

### Task 4: Notification Model + API

**Files:**
- Create: `src/app/api/notifications/route.ts`
- Create: `src/app/api/notifications/read-all/route.ts`

**Interfaces:**
- Consumes: Notification model from Task 1
- Produces: `GET /api/notifications`, `PATCH /api/notifications/[id]`, `PATCH /api/notifications/read-all`

- [ ] **Step 1: Create notifications list + mark-read route**

Create `src/app/api/notifications/route.ts`:

```typescript
import { db } from '@/lib/db';
import { requirePermission, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'stats:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

    const notifications = await db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const unreadCount = await db.notification.count({
      where: { userId: user.id, isRead: false },
    });

    return NextResponse.json({ data: notifications, unreadCount });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'stats:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { notificationId } = body;

    if (notificationId) {
      await db.notification.update({
        where: { id: notificationId, userId: user.id },
        data: { isRead: true },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create read-all route**

Create `src/app/api/notifications/read-all/route.ts`:

```typescript
import { db } from '@/lib/db';
import { requirePermission, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'stats:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    await db.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/notifications/
git commit -m "feat(api): notification endpoints (list, mark read, read all)"
```

---

### Task 5: WhatsApp Payment Notifications

**Files:**
- Modify: `src/lib/whatsapp-agent.ts`

**Interfaces:**
- Consumes: existing `sendWhatsAppMessage()`, `isWhatsAppConnected()`
- Produces: `notifyPaymentCreated()`, `notifyPaymentApproved()`, `notifyPaymentRejected()`

- [ ] **Step 1: Add payment notification functions**

Add at the end of `whatsapp-agent.ts`:

```typescript
export async function notifyPaymentCreated(
  recipients: { phone: string; name: string }[],
  studentName: string,
  className: string,
  amount: number,
  trimester: string,
  schoolName: string
) {
  if (!(await isWhatsAppConnected())) return;
  const msg = `💰 *Nouveau paiement enregistré*\n\n` +
    `Élève: ${studentName}\nClasse: ${className}\n` +
    `Montant: ${amount.toLocaleString('fr-FR')} CDF\n` +
    `Trimestre: ${trimester}\nÉcole: ${schoolName}\n\n` +
    `Statut: En attente de vérification`;
  for (const r of recipients) {
    if (isRecipientAdmin(r.phone)) continue;
    await sendWhatsAppMessage(r.phone, msg);
  }
}

export async function notifyPaymentApproved(
  recipientPhone: string,
  studentName: string,
  amount: number,
  trimester: string,
  schoolName: string
) {
  if (!(await isWhatsAppConnected())) return;
  const msg = `✅ *Paiement approuvé*\n\n` +
    `Élève: ${studentName}\nMontant: ${amount.toLocaleString('fr-FR')} CDF\n` +
    `Trimestre: ${trimester}\nÉcole: ${schoolName}\n\n` +
    `Votre paiement a été confirmé. Merci!`;
  await sendWhatsAppMessage(recipientPhone, msg);
}

export async function notifyPaymentRejected(
  recipientPhone: string,
  studentName: string,
  amount: number,
  trimester: string,
  schoolName: string,
  reason?: string
) {
  if (!(await isWhatsAppConnected())) return;
  const msg = `❌ *Paiement rejeté*\n\n` +
    `Élève: ${studentName}\nMontant: ${amount.toLocaleString('fr-FR')} CDF\n` +
    `Trimestre: ${trimester}\nÉcole: ${schoolName}\n` +
    (reason ? `Raison: ${reason}\n\n` : `\n`) +
    `Veuillez contacter l'administration.`;
  await sendWhatsAppMessage(recipientPhone, msg);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/whatsapp-agent.ts
git commit -m "feat(whatsapp): add payment notification functions"
```

---

### Task 6: Trigger Notifications on Payment Events

**Files:**
- Modify: `src/app/api/payments/route.ts`
- Modify: `src/app/api/payments/verify/route.ts`

**Interfaces:**
- Consumes: `notifyPaymentCreated()` from Task 5, `Notification` model from Task 1
- Produces: Notifications created on payment create/approve/reject

- [ ] **Step 1: Add notification creation + WhatsApp on payment POST**

In `src/app/api/payments/route.ts`, after the payment is created (after line ~210 where `return NextResponse.json` is), add before the return:

```typescript
// Create in-app notifications for school admin + cashier
const schoolUsers = await db.user.findMany({
  where: { schoolId: user.schoolId, role: { in: ['SUPER_ADMIN_GLOBAL', 'SECRETARY', 'CASHIER'] }, id: { not: user.id } },
  select: { id: true, phone: true, name: true },
});

const studentName = `${student.firstName} ${student.lastName}`;
const className = studentClass?.name || '';
const trimesterLabel = trimester || 'N/A';

// In-app notifications
for (const u of schoolUsers) {
  await db.notification.create({
    data: {
      type: 'PAYMENT_CREATED',
      title: 'Nouveau paiement',
      message: `${studentName} - ${Number(amount).toLocaleString('fr-FR')} CDF - ${trimesterLabel}`,
      userId: u.id,
      schoolId: user.schoolId,
      relatedId: payment.id,
    },
  });
}

// WhatsApp notifications
const recipients = schoolUsers.filter(u => u.phone).map(u => ({ phone: u.phone!, name: u.name }));
import { notifyPaymentCreated } from '@/lib/whatsapp-agent';
const parentUser = resolvedStudentId ? await db.student.findUnique({ where: { id: resolvedStudentId }, select: { parent: { select: { phone: true, name: true } } } }) : null;
if (parentUser?.parent?.phone) {
  recipients.push({ phone: parentUser.parent.phone, name: parentUser.parent.name });
}
const schoolData = await db.school.findUnique({ where: { id: user.schoolId! }, select: { name: true } });
notifyPaymentCreated(recipients, studentName, className, Number(amount), trimesterLabel, schoolData?.name || '');
```

- [ ] **Step 2: Add notification on payment verify (approve/reject)**

In `src/app/api/payments/verify/route.ts`, after the approve/reject logic, add:

For approve (after status set to 'PAID'):
```typescript
// Notify parent
const parent = await db.student.findUnique({ where: { id: payment.studentId }, select: { parent: { select: { phone: true } } } });
if (parent?.parent?.phone) {
  const studentData = await db.student.findUnique({ where: { id: payment.studentId }, select: { firstName: true, lastName: true } });
  const schoolData = await db.school.findUnique({ where: { id: payment.schoolId }, select: { name: true } });
  import { notifyPaymentApproved } from '@/lib/whatsapp-agent';
  notifyPaymentApproved(parent.parent.phone, `${studentData?.firstName} ${studentData?.lastName}`, Number(payment.amount), payment.trimester, schoolData?.name || '');
}
// Also create in-app notification for parent
if (parent?.parent) {
  await db.notification.create({
    data: {
      type: 'PAYMENT_APPROVED',
      title: 'Paiement approuvé',
      message: `Votre paiement de ${Number(payment.amount).toLocaleString('fr-FR')} CDF a été confirmé`,
      userId: parent.parent.id,
      schoolId: payment.schoolId,
      relatedId: payment.id,
    },
  });
}
```

For reject (similar pattern with `notifyPaymentRejected`).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/payments/route.ts src/app/api/payments/verify/route.ts
git commit -m "feat(api): trigger notifications on payment create/approve/reject"
```

---

### Task 7: Bell Icon + Notification Panel in Topbar

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `GET /api/notifications`, `PATCH /api/notifications` (mark read), `PATCH /api/notifications/read-all`
- Produces: Functional bell icon with unread count, notification dropdown

- [ ] **Step 1: Add notification state and loading**

In the Home component, add state:
```typescript
const [notifications, setNotifications] = useState<any[]>([])
const [unreadCount, setUnreadCount] = useState(0)
const [showNotifications, setShowNotifications] = useState(false)
```

Add useEffect to load notifications (every 30 seconds):
```typescript
useEffect(() => {
  if (!userData?.id) return;
  const load = () => authFetch('/api/notifications?limit=20').then(r => r.json()).then(j => {
    setNotifications(j.data || []);
    setUnreadCount(j.unreadCount || 0);
  }).catch(() => {});
  load();
  const interval = setInterval(load, 30000);
  return () => clearInterval(interval);
}, [userData?.id]);
```

- [ ] **Step 2: Replace static bell icon with functional one**

Find the static bell button (around line 2209) and replace:
```tsx
<div className="relative">
  <button onClick={() => setShowNotifications(!showNotifications)} className="w-9 h-9 rounded-xl bg-white border border-[oklch(90%_0.01_175)] grid place-items-center hover:shadow-sm transition relative">
    <Bell size={16} />
    {unreadCount > 0 && (
      <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-white text-[10px] font-bold grid place-items-center" style={{ background: DANGER }}>
        {unreadCount > 9 ? '9+' : unreadCount}
      </span>
    )}
  </button>
  {showNotifications && (
    <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-xl border border-[oklch(90%_0.01_175)] z-50 max-h-96 overflow-y-auto">
      <div className="flex items-center justify-between p-4 border-b border-[oklch(90%_0.01_175)]">
        <h3 className="font-bold text-sm" style={{ color: TEXT_PRIMARY }}>Notifications</h3>
        {unreadCount > 0 && (
          <button onClick={async () => { await authFetch('/api/notifications/read-all', { method: 'PATCH' }); setUnreadCount(0); setNotifications(n => n.map(x => ({ ...x, isRead: true }))); }} className="text-[11px] font-medium" style={{ color: ACCENT }}>Tout lire</button>
        )}
      </div>
      {notifications.length === 0 ? (
        <div className="p-8 text-center" style={{ color: TEXT_MUTED_LUXE }}>Aucune notification</div>
      ) : notifications.map(n => (
        <div key={n.id} className={`px-4 py-3 border-b border-[oklch(90%_0.01_175)] last:border-0 cursor-pointer hover:bg-[oklch(97%_0.005_175)] transition ${!n.isRead ? 'bg-[oklch(97%_0.005_175)]' : ''}`}
          onClick={async () => {
            if (!n.isRead) { await authFetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notificationId: n.id }) }); setUnreadCount(c => Math.max(0, c - 1)); setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, isRead: true } : x)); }
          }}>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg grid place-items-center shrink-0" style={{ background: n.type.includes('APPROVED') ? `${SUCCESS}20` : n.type.includes('REJECTED') ? `${DANGER}20` : `${ACCENT}20`, color: n.type.includes('APPROVED') ? SUCCESS : n.type.includes('REJECTED') ? DANGER : ACCENT }}>
              {n.type.includes('APPROVED') ? '✓' : n.type.includes('REJECTED') ? '✗' : '💰'}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>{n.title}</div>
              <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{n.message}</div>
              <div className="text-[10px] mt-1" style={{ color: TEXT_MUTED_LUXE }}>{new Date(n.createdAt).toLocaleString('fr-FR')}</div>
            </div>
            {!n.isRead && <div className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: ACCENT }} />}
          </div>
        </div>
      ))}
    </div>
  )}
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(ui): functional bell icon with notification panel"
```

---

### Task 8: Auto-populate Fees in PaymentsView

**Files:**
- Modify: `src/components/views/PaymentsView.tsx`

**Interfaces:**
- Consumes: `GET /api/school-fees` (from Task 2)
- Produces: Auto-filled amount when student is selected

- [ ] **Step 1: Add fee loading and auto-fill logic**

In PaymentsView, after student is selected via SearchAutocomplete, add logic to fetch and sum fees:

```typescript
const [classFees, setClassFees] = useState<any[]>([])

// When student is selected, fetch their class fees
useEffect(() => {
  if (selectedStudent?.classId && userData?.schoolId) {
    authFetch(`/api/school-fees?schoolId=${userData.schoolId}&classId=${selectedStudent.classId}&trimester=${form.trimester}`)
      .then(r => r.json())
      .then(j => {
        setClassFees(j.data || [])
        if (j.data?.length > 0) {
          const total = j.data.reduce((sum: number, f: any) => sum + f.amount, 0)
          setForm(prev => ({ ...prev, amount: String(total) }))
        }
      })
      .catch(() => setClassFees([]))
  }
}, [selectedStudent?.classId, form.trimester])
```

- [ ] **Step 2: Show fee breakdown below amount field**

After the amount input, add:
```tsx
{classFees.length > 0 && (
  <div className="mt-1 text-[11px] px-3 py-2 rounded-lg" style={{ background: `${ACCENT}10`, color: TEXT_MUTED_LUXE }}>
    {classFees.map((f: any) => `${f.name}: ${formatNumber(f.amount)}`).join(' + ')} = <strong style={{ color: ACCENT }}>{formatNumber(classFees.reduce((s: number, f: any) => s + f.amount, 0))} CDF</strong>
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/views/PaymentsView.tsx
git commit -m "feat: auto-populate payment amounts from school fees config"
```

---

### Task 9: Final Build + Integration Test

- [ ] **Step 1: Run build**

```bash
npx next build --webpack
```

Expected: Build passes with no errors.

- [ ] **Step 2: Manual test checklist**

1. Go to Settings → Frais scolaires → Add a fee (e.g., "Frais de scolarité" 100000 CDF, T1, a class)
2. Go to Payments → Select a student from that class → Amount should auto-fill
3. Record a payment → Check bell icon shows notification
4. Go to Payment Verification → Approve/Reject → Check parent receives WhatsApp
5. Click bell icon → See notification list → Click to mark as read

- [ ] **Step 3: Commit all changes**

```bash
git add -A
git commit -m "feat: school fees configuration + payment notifications (in-app + WhatsApp)"
git push
```
