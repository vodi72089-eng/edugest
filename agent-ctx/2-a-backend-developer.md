---
Task ID: 2-a
Agent: backend-developer
Task: Build EduGest API routes

Work Log:
- Analyzed existing Prisma schema (15 models: School, User, Student, Class, SchoolYear, Subject, Grade, DisciplineRecord, Blacklist, Greylist, Whitelist, SchoolComment, Communication, PaymentRecord, Homework, ReportCard, AuditLog, GlobalApiConfig)
- Created 14 API route files covering all required endpoints
- Fixed CSS @import ordering issue (leaflet import needed to precede tailwindcss)
- Fixed Subject unique constraint issue (name+schoolYearId means one subject per name per school year, not per class)
- Fixed PaymentRecord student relation issue (schema has no student relation on PaymentRecord, only school)
- Successfully seeded database with demo data: 6 schools, 6 school years, 19 users, 30 classes, 6 subjects, 20 students, 360 grades, 7 discipline records, 60 payment records, 5 communications, 5 homework entries
- All API endpoints tested and working

Stage Summary:
- Files created:
  - /src/app/api/seed/route.ts - Seeds database with comprehensive demo data (6 African schools, 20 students, grades, payments, discipline, etc.)
  - /src/app/api/schools/route.ts - GET (list with search/filter/pagination), POST (create)
  - /src/app/api/schools/[id]/route.ts - GET (detail with classes, users, comments), PUT (update), DELETE (soft delete)
  - /src/app/api/students/route.ts - GET (list with search/filter/pagination), POST (create with auto matricule generation SHORTNAME-YYYY-NNN)
  - /src/app/api/students/[id]/route.ts - GET (detail with grades, discipline, payments), PUT (update), DELETE (soft delete via isExcluded)
  - /src/app/api/classes/route.ts - GET (list with filter), POST (create with duplicate check)
  - /src/app/api/grades/route.ts - GET (list with filter), POST (upsert by unique constraint studentId+subjectId+trimester+schoolYearId)
  - /src/app/api/payments/route.ts - GET (list with filter and manual student enrichment), POST (create)
  - /src/app/api/payments/[id]/route.ts - PUT (update status/amount with auto paidAt)
  - /src/app/api/discipline/route.ts - GET (list with filter), POST (create with auto list table entries)
  - /src/app/api/communications/route.ts - GET (list with filter), POST (create)
  - /src/app/api/homework/route.ts - GET (list with filter), POST (create)
  - /src/app/api/auth/route.ts - POST (login with bcrypt password verification)
  - /src/app/api/stats/route.ts - GET (dashboard stats: student counts, payment totals, discipline counts, class distribution, collection rate)

- Key decisions:
  - Subject model unique constraint (name, schoolYearId) means subjects are shared across classes within a school year
  - PaymentRecord has no student relation in Prisma schema, so student data is manually enriched
  - Soft delete for schools (isActive=false) and students (isExcluded=true)
  - Idempotent seed route (checks if schools exist before seeding)
  - All routes include pagination support (page, limit)
  - Auth endpoint returns user data with school info but no password
