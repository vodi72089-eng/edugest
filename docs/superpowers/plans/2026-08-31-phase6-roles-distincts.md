# Phase 6: Rôles Distincts - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter le rôle ADMIN_FREEMIUM avec dashboard spécifique pour EduGest.

**Architecture:** Nouveau rôle avec permissions SECRETARY + dashboard dédié avec badge Freemium.

**Tech Stack:** Next.js, TypeScript, React

## Global Constraints

- Le rôle ADMIN_FREEMIUM a les mêmes permissions que SECRETARY
- Dashboard spécifique avec badge "Freemium"
- Limité aux fonctionnalités FREEMIUM

---

## File Structure

| Fichier | Responsabilité |
|---------|---------------|
| `src/lib/auth.ts` | Modifier: ajouter ADMIN_FREEMIUM aux ROLE_PERMISSIONS |
| `src/components/dashboards/FreemiumAdminDashboard.tsx` | NOUVEAU: Dashboard ADMIN_FREEMIUM |

---

### Task 1: Ajouter ADMIN_FREEMIUM aux ROLE_PERMISSIONS

**Files:**
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Lire auth.ts pour trouver ROLE_PERMISSIONS**

Lire `src/lib/auth.ts` pour trouver la section ROLE_PERMISSIONS.

- [ ] **Step 2: Ajouter ADMIN_FREEMIUM après SECRETARY**

```typescript
ADMIN_FREEMIUM: [
  'school:read',
  'users:read', 'users:create', 'users:update',
  'students:read', 'students:create', 'students:update',
  'classes:read', 'classes:create',
  'subjects:read', 'subjects:create',
  'grades:read',
  'profile:read', 'profile:update',
  'notifications:read',
],
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat: add ADMIN_FREEMIUM role with SECRETARY permissions"
```

---

### Task 2: Créer FreemiumAdminDashboard

**Files:**
- Create: `src/components/dashboards/FreemiumAdminDashboard.tsx`

- [ ] **Step 1: Créer le fichier**

```tsx
'use client';

import { useEduGestStore } from '@/lib/store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Crown, ArrowUpRight, Users, GraduationCap } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function FreemiumAdminDashboard() {
  const { userData } = useEduGestStore();
  const [stats, setStats] = useState({
    studentCount: 0,
    maxStudents: 100,
    classCount: 0,
  });

  useEffect(() => {
    // Charger les stats de l'école
    if (userData?.schoolId) {
      fetch(`/api/schools/${userData.schoolId}/stats`)
        .then(r => r.json())
        .then(data => {
          setStats({
            studentCount: data.studentCount || 0,
            maxStudents: 100,
            classCount: data.classCount || 0,
          });
        })
        .catch(() => {});
    }
  }, [userData?.schoolId]);

  const studentPercentage = Math.min((stats.studentCount / stats.maxStudents) * 100, 100);

  return (
    <div className="space-y-6">
      {/* Header avec badge Freemium */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tableau de bord</h1>
          <p className="text-muted-foreground">
            Bienvenue, {userData?.name}
          </p>
        </div>
        <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2">
          <Crown className="h-4 w-4 mr-2" />
          Freemium
        </Badge>
      </div>

      {/* Card Upgrade */}
      <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpRight className="h-5 w-5 text-amber-600" />
            Passez à l'offre Essentiel
          </CardTitle>
          <CardDescription>
            Débloquez toutes les fonctionnalités pour votre école
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm mb-4">
            <li>✓ Paiements mobiles (Orange Money, M-Pesa)</li>
            <li>✓ Communications et notifications</li>
            <li>✓ Convocations parentales</li>
            <li>✓ Devoirs et discipline</li>
            <li>✓ Jusqu'à 500 élèves</li>
          </ul>
          <Button asChild className="w-full bg-amber-600 hover:bg-amber-700">
            <Link href="/pricing">
              Voir les offres
              <ArrowUpRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Élèves</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.studentCount}/{stats.maxStudents}</div>
            <Progress value={studentPercentage} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {stats.maxStudents - stats.studentCount} places restantes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Classes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.classCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Classes actives
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Restrictions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Fonctionnalités non disponibles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="text-red-500">✗</span>
              Paiements mobiles
            </div>
            <div className="flex items-center gap-2">
              <span className="text-red-500">✗</span>
              Communications
            </div>
            <div className="flex items-center gap-2">
              <span className="text-red-500">✗</span>
              Convocations
            </div>
            <div className="flex items-center gap-2">
              <span className="text-red-500">✗</span>
              Devoirs
            </div>
            <div className="flex items-center gap-2">
              <span className="text-red-500">✗</span>
              Discipline
            </div>
            <div className="flex items-center gap-2">
              <span className="text-red-500">✗</span>
              Analytics
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboards/FreemiumAdminDashboard.tsx
git commit -m "feat: create FreemiumAdminDashboard component"
```

---

## Résumé

| Task | Description | Fichiers |
|------|-------------|----------|
| 1 | Ajouter ADMIN_FREEMIUM | `src/lib/auth.ts` |
| 2 | FreemiumAdminDashboard | `src/components/dashboards/FreemiumAdminDashboard.tsx` |
