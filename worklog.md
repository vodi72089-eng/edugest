---
Task ID: 1
Agent: Main Agent
Task: Fix dashboard statistics, personnel creation, homework view, and grades API

Work Log:
- Updated Prisma schema: added `subjectName`, `classNames`, `isTitulaire` to User model; added `teacherId`, `isTitulaire`, `description @default("")` to Homework model
- Ran `prisma db push` to sync schema with database
- Updated `/api/users/route.ts`: Added select/create/update for new fields (subjectName, classNames, isTitulaire)
- Updated `/api/homework/route.ts`: Added parentId-based homework filtering, teacherId, isTitulaire fields, made description optional
- Updated `/api/grades/route.ts`: Fixed schoolYearId resolution - now auto-resolves from student record or creates default school year instead of using hardcoded 'default'
- Updated `src/lib/store.ts`: Added subjectName, classNames, isTitulaire to UserData interface
- Updated login flow in page.tsx: Pass subjectName, classNames, isTitulaire from API to store
- Fixed all dashboard views to use real API data instead of hardcoded values:
  - SecretaryDashboard: fetches from /api/stats with schoolId, shows real student/class/discipline/payment counts
  - CashierDashboard: fetches real payment stats, shows actual collection rates
  - TeacherDashboard: fetches real class/student/homework counts, shows teacher's subject and titulaire status
  - HeadTeacherDashboard: fetches actual class info, shows subject and titulaire status
  - DisciplineDashboardView: fetches real discipline stats with section level
- Updated PersonnelView: Added teacher-specific form fields (Matière/Cours, Classes occupées, Titulaire toggle), show subject+titulaire badge in table
- Updated HomeworkView: Auto-fills subject from teacher profile, sends teacherId/isTitulaire with homework, shows "Titulaire" badge, added parent-specific view with prominent course/teacher/titulaire info
- Fixed lint issues: setState in useEffect warnings using setTimeout pattern

Stage Summary:
- All dashboard views now show real database statistics instead of hardcoded values
- Personnel creation form includes teacher-specific fields when Enseignant/Prof. Principal is selected
- Homework cards show course name, teacher name, and "Titulaire" badge
- Parents see prominent homework info with subject, teacher, and titulaire status
- Grades API now properly resolves schoolYearId from student records
- Login flow preserves teacher-specific data (subjectName, classNames, isTitulaire)
---
Task ID: 1
Agent: Main Agent
Task: Fix dashboard statistics, enhance teacher creation, verify homework display

Work Log:
- Analyzed the root cause: SuperAdminDashboard was using `/api/admin-analytics` which counts ALL students globally across ALL schools. When a new school admin creates a school, they get SUPER_ADMIN_GLOBAL role and see global stats including 20 seeded students.
- Fixed SuperAdminDashboard: When user has a schoolId (school admin), now shows school-specific dashboard using `/api/stats?schoolId=...` which returns only that school's data. When no schoolId (true platform admin), shows global admin analytics.
- Enhanced PersonnelView teacher creation form: Added `availableClasses` state, fetches classes filtered by schoolId, added clickable class chip buttons for selecting/deselecting classes in addition to the text input.
- Added classNames display in personnel table for TEACHER/HEAD_TEACHER roles.
- Fixed duplicate class chips by passing schoolId to `/api/classes?schoolId=...` API call.
- Fixed dashboard greetings: SecretaryDashboard now shows "Bonjour {name}" instead of "Bonjour Secrétaire", CashierDashboard shows "Bonjour {name}" instead of "Bonjour Caissier".
- Verified homework display already correctly shows: subject/course name badges, teacher names, "Titulaire" badge, and parent-specific enhanced display with course+teacher+titulaire.
- Verified with Agent Browser: New school creation now shows 0 students, teacher form has class selection chips, homework displays correctly.

Stage Summary:
- Dashboard now shows real school-specific statistics (0 for new schools, correct counts for existing schools)
- Teacher creation form has enhanced class selection with clickable chips
- Homework display correctly shows course name, teacher name, and titulaire label
- All lint checks pass, dev server running without errors
