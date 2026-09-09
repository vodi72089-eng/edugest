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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tableau de bord</h1>
          <p className="text-muted-foreground">Bienvenue, {userData?.name}</p>
        </div>
        <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2">
          <Crown className="h-4 w-4 mr-2" />
          Freemium
        </Badge>
      </div>

      <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpRight className="h-5 w-5 text-amber-600" />
            Passez à l'offre Essentiel
          </CardTitle>
          <CardDescription>Débloquez toutes les fonctionnalités</CardDescription>
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
            <p className="text-xs text-muted-foreground mt-1">Classes actives</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Fonctionnalités non disponibles</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-2"><span className="text-red-500">✗</span> Paiements mobiles</div>
            <div className="flex items-center gap-2"><span className="text-red-500">✗</span> Communications</div>
            <div className="flex items-center gap-2"><span className="text-red-500">✗</span> Convocations</div>
            <div className="flex items-center gap-2"><span className="text-red-500">✗</span> Devoirs</div>
            <div className="flex items-center gap-2"><span className="text-red-500">✗</span> Discipline</div>
            <div className="flex items-center gap-2"><span className="text-red-500">✗</span> Analytics</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
