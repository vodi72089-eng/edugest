# EduGest Destock - Test Credentials

## Super Admin (platform owner)
- Email: `vodi72089@gmail.com`
- Password: `Admin@Destock2026`
- Role: `SUPER_ADMIN`

## Auth endpoints
- POST `/api/auth/register-school` (school signup)
- POST `/api/auth/login` (admin/teacher login)
- POST `/api/auth/parent-login` (parent portal)
- POST `/api/auth/logout`
- GET  `/api/auth/me`

## Test school admin (create via UI or endpoint)
Use `/api/auth/register-school` with body:
```json
{
  "school_name": "Lycée Test",
  "admin_name": "Directeur Test",
  "email": "school@test.com",
  "password": "School123!",
  "city": "Dakar",
  "region": "Sénégal"
}
```
