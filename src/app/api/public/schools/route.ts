import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/public/schools?q=... — recherche publique d'écoles (onglet « Trouver mon école »)
// Ne renvoie que des informations publiques (nom, ville, logo, description).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();

    const schools = await db.school.findMany({
      where: {
        isActive: true,
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { shortName: { contains: q } },
                { city: { contains: q } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        shortName: true,
        city: true,
        province: true,
        country: true,
        logo: true,
        studentCount: true,
        classCount: true,
        averageRating: true,
        schoolType: true,
      },
      orderBy: { name: 'asc' },
      take: 20,
    });

    return NextResponse.json({ data: schools });
  } catch (error) {
    console.error('Error searching public schools:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
