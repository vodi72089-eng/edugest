# Design: Frais Scolaires + Notifications Paiements

**Date:** 2026-06-24
**Status:** Approved

## Context

The app currently has no way to configure school fees per class. Payments are entered manually with arbitrary amounts. There are also no notifications when payments are made — neither in-app nor via WhatsApp.

## Goals

1. Allow school admins to configure fees per class (name, amount, trimester)
2. Auto-populate payment amounts when creating payments for a student
3. Send notifications (in-app + WhatsApp) when a payment is created or paid
4. Admin global must NOT receive these notifications (security: no global data access)

## Design

### Part 1: School Fees Configuration

#### New Prisma Model: `SchoolFee`

```prisma
model SchoolFee {
  id          String   @id @default(cuid())
  name        String   // "Frais de scolarité", "Minerval", "Uniforme", etc.
  amount      Float    // Montant en CDF
  trimester   String   // "T1", "T2", "T3"
  classId     String
  class       Class    @relation(fields: [classId], references: [id])
  schoolId    String
  school      School   @relation(fields: [schoolId], references: [id])
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([classId, trimester, name])
}
```

Add reverse relations in `Class` and `School` models.

#### API Routes

- `GET /api/school-fees?schoolId=X&classId=Y&trimester=Z` — List fees (filtered)
- `POST /api/school-fees` — Create fee (SUPER_ADMIN_GLOBAL, SECRETARY)
- `PUT /api/school-fees/[id]` — Update fee
- `DELETE /api/school-fees/[id]` — Delete fee

#### UI: SettingsView New Tab

Add a "Frais scolaires" tab in SettingsView (accessible to SUPER_ADMIN_GLOBAL and SECRETARY):

- Table: Name | Amount (CDF) | Trimester | Class | Actions (Edit/Delete)
- "Ajouter un frais" button → Modal form:
  - Name (text input)
  - Amount (number input, CDF)
  - Trimester (select: T1, T2, T3)
  - Class (select from school's classes)
- Quick actions: Duplicate fee to another trimester/class

#### Auto-populate in PaymentsView

When a cashier selects a student in PaymentsView:
1. Fetch the student's class
2. Fetch `SchoolFee` records for that class + current trimester
3. Auto-fill the "Montant total" field with the sum of fees
4. Show a breakdown below the field: "Frais de scolarité: 100$ + Minerval: 50$ = 150$"

### Part 2: Payment Notifications

#### New Prisma Model: `Notification`

```prisma
model Notification {
  id          String   @id @default(cuid())
  type        String   // "PAYMENT_CREATED", "PAYMENT_APPROVED", "PAYMENT_REJECTED"
  title       String
  message     String
  userId      String   // Recipient
  user        User     @relation(fields: [userId], references: [id])
  schoolId    String?
  school      School?  @relation(fields: [schoolId], references: [id])
  relatedId   String?  // PaymentRecord ID
  isRead      Boolean  @default(false)
  createdAt   DateTime @default(now())

  @@index([userId, isRead])
}
```

#### Notification Trigger Points

| Event | Recipients | In-App | WhatsApp |
|-------|-----------|--------|----------|
| Payment created (by cashier/parent) | School admin, Cashier | Yes | Yes |
| Payment approved (by verifier) | Parent | Yes | Yes |
| Payment rejected (by verifier) | Parent | Yes | Yes |

**NOT sent to:** SUPER_ADMIN_GLOBAL (security rule)

#### In-App Notifications

1. **Bell icon** in topbar: Shows unread count badge (red dot with number)
2. **Click bell** → Opens notification panel (dropdown or page) showing:
   - List of recent notifications with title, message, time, read/unread status
   - Click to mark as read
   - "Tout marquer comme lu" button
3. **Toast** on new notification: Brief toast with title + message

#### WhatsApp Notifications

Use existing `whatsapp-agent.ts` pattern. Add new functions:

- `notifyPaymentCreated(schoolAdmin, cashier, parent, student, amount, trimester)`
- `notifyPaymentApproved(parent, student, amount, trimester)`
- `notifyPaymentRejected(parent, student, amount, trimester, reason?)`

Message format:
```
💰 Paiement enregistré
Élève: [firstName] [lastName]
Classe: [className]
Montant: [amount] CDF
Trimestre: [trimester]
Statut: En attente de vérification
```

#### API Changes

- `POST /api/payments` — After creating PaymentRecord, also create Notification records and send WhatsApp
- `POST /api/payments/verify` — After approve/reject, create Notification and send WhatsApp to parent

#### Notification API

- `GET /api/notifications?userId=X` — List notifications (paginated)
- `PATCH /api/notifications/[id]` — Mark as read
- `PATCH /api/notifications/read-all` — Mark all as read for user

### Part 3: Payment View Enhancements

Add status filter to PaymentsView: Tous, En attente, Payé, Rejeté
Add "Valider" / "Rejeter" buttons directly in the payment table for PENDING payments (currently only in PaymentVerificationView).

## Security Rules

- Notifications are only sent within the same school context
- SUPER_ADMIN_GLOBAL never receives payment notifications
- Only SUPER_ADMIN_GLOBAL and SECRETARY can configure school fees
- Only SUPER_ADMIN_GLOBAL can configure payment gateways (existing)

## Implementation Order

1. Database: Create `SchoolFee` and `Notification` models
2. API: SchoolFee CRUD
3. UI: SettingsView "Frais scolaires" tab
4. API: Payment creation triggers notifications + WhatsApp
5. UI: Bell icon with unread count + notification panel
6. API: Notification read/mark endpoints
7. Integration: Auto-populate payment amounts from SchoolFee
