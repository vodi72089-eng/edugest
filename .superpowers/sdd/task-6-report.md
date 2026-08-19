# Task 6 Report: Add Notification Badge for Pending

## What I Implemented

Added a pending communications badge to the CommunicationsView header:

1. **pendingCount calculation** (`src/app/page.tsx:4005`): Computed `comms.filter(c => c.status === 'PENDING').length` after `canCreate`/`isDirection` declarations.

2. **Badge in header** (`src/app/page.tsx:4064-4068`): A warning-colored badge (`bg-edu-warning/20 text-edu-warning`) that shows the count and "en attente" text, conditionally rendered only when `canCreate` is true and `pendingCount > 0`.

## Testing

- **TypeScript**: `npx tsc --noEmit` — no errors in `src/app/page.tsx` (pre-existing errors in other files unrelated to this change)
- **Visual verification**: Badge renders conditionally with proper Tailwind styling and warning colors
- **Logic**: Badge only visible to admin/secretary users (`canCreate` guard) and only when pending communications exist

## Files Changed

- `src/app/page.tsx` — Added `pendingCount` variable and badge JSX in CommunicationsView header

## Self-Review Findings

No issues found. The implementation matches the task specification exactly.

## Commit

- `6e86bc8` — feat: add notification badge for pending communications
