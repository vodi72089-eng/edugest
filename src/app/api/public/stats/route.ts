import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET /api/public/stats — statistiques réelles de la plateforme (page d'accueil)
// Uniquement des compteurs agrégés, aucune donnée personnelle.
export async function GET() {
  try {
    const [schools, students, parents] = await Promise.all([
      db.school.count({ where: { isActive: true } }),
      db.student.count(),
      db.user.count({ where: { role: 'PARENT' } }),
    ]);

    return NextResponse.json({
      data: {
        schools,
        students,
        families: parents,
      },
    });
  } catch (error) {
    console.error('[v0] Erreur /api/public/stats:', error);
    return NextResponse.json({ data: { schools: 0, students: 0, families: 0 } });
  }
}
