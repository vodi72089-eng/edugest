import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/public/find-child?token=xxx&classId=yyy&q=nom
// Page publique « Retrouver mon enfant » : le parent a scanné le QR code de
// l'école. Le QR doit être actif et non expiré. Recherche par classe + nom.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = (searchParams.get('token') || '').trim();
    const classId = (searchParams.get('classId') || '').trim();
    const q = (searchParams.get('q') || '').trim();

    if (!token) {
      return NextResponse.json({ error: 'Token manquant' }, { status: 400 });
    }

    // ── Validation du QR code (durée de vie + révocation) ──────────────
    const qr = await db.schoolQrCode.findUnique({ where: { token } });
    if (!qr || !qr.isActive) {
      return NextResponse.json({ error: 'QR code invalide ou révoqué', expired: true }, { status: 404 });
    }
    if (qr.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: 'Ce QR code a expiré. Contactez l\'école pour en obtenir un nouveau.', expired: true }, { status: 410 });
    }

    // ── Infos école (publiques) ─────────────────────────────────────────
    const school = await db.school.findUnique({
      where: { id: qr.schoolId },
      select: { name: true, shortName: true, logo: true, city: true, address: true },
    });
    if (!school) {
      return NextResponse.json({ error: 'École non trouvée' }, { status: 404 });
    }

    // ── Année scolaire active + classes ────────────────────────────────
    const activeYear = await db.schoolYear.findFirst({
      where: { schoolId: qr.schoolId, isActive: true },
      select: { id: true },
    });

    const classes = await db.class.findMany({
      where: { schoolId: qr.schoolId, ...(activeYear ? { schoolYearId: activeYear.id } : {}) },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });

    // ── Recherche d'enfants (classe + nom), données minimales ──────────
    let students: { id: string; firstName: string; lastName: string; className: string }[] = [];
    if (classId && q.length >= 2) {
      // sécurité : la classe doit appartenir à l'école du QR
      const cls = await db.class.findFirst({
        where: { id: classId, schoolId: qr.schoolId },
        select: { id: true },
      });
      if (cls) {
        const found = await db.student.findMany({
          where: {
            classId,
            isArchived: false,
            OR: [
              { firstName: { contains: q } },
              { lastName: { contains: q } },
            ],
          },
          select: { id: true, firstName: true, lastName: true, class: { select: { name: true } } },
          take: 10,
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        });
        students = found.map(s => ({
          id: s.id,
          firstName: s.firstName,
          lastName: s.lastName,
          className: s.class?.name || '—',
        }));
      }
    }

    return NextResponse.json({
      data: {
        school,
        classes,
        students,
        qrLabel: qr.label,
      },
    });
  } catch (error) {
    console.error('Error in find-child:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
