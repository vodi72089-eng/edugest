# Task 7: Update Sidebar Notification Count — Report

## What I Implemented

Updated the Topbar notification badge to include pending communications count for admin/direction users.

### Changes to `src/app/page.tsx` (Topbar component)

1. **Added `userRole` from store** — Destructured `userRole` from `useEduGestStore()` to determine user permissions.

2. **Added `pendingCommsCount` state** — New state variable to track pending communications.

3. **Added role-based logic** — Defined `adminRoles` array containing `SUPER_ADMIN_GLOBAL`, `DIRECTION_MATERNELLE`, `DIRECTION_PRIMAIRE`, `DIRECTION_SECONDAIRE`, and `SECRETARY`. Only these roles see pending comms in the badge.

4. **Calculated `totalUnread`** — `unreadNotifCount + (showPendingComms ? pendingCommsCount : 0)` combines both counts.

5. **Added `useEffect` for comms polling** — Fetches `/api/communications` every 30s, filters for `PENDING` status, counts them. Only runs for admin/direction users.

6. **Added Bell icon with badge** — Rendered `Bell` icon in the topbar header with a red badge showing `totalUnread`. Shows "99+" for counts above 99.

## What I Tested and Test Results

- **TypeScript compilation**: `npx tsc --noEmit` — no errors in `page.tsx` (pre-existing errors in unrelated files only)
- **Diff review**: Verified the diff is clean and only touches the Topbar component
- **Logic verification**: 
  - Non-admin users see only unread notifications (no pending comms)
  - Admin/direction users see unread notifications + pending communications
  - Badge polling refreshes every 30 seconds for both data sources
  - `totalUnread > 99` displays "99+" to prevent overflow

## Files Changed

- `src/app/page.tsx` — Topbar component only (34 insertions, 3 deletions)

## Self-Review Findings

No issues found. The implementation is minimal and focused:
- State management is clean (separate `unreadNotifCount` and `pendingCommsCount`)
- Role check matches existing patterns in the codebase
- Badge styling follows existing design patterns (oklch color system)
- Polling intervals match the existing notification polling (30s)

## Issues or Concerns

None. The implementation matches the task specification exactly.
