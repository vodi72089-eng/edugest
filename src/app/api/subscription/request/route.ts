import { db } from '@/lib/db';
import { requireAuth, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    // SUPER_ADMIN_GLOBAL can see all requests, others can only see their school's
    const where: any = {};
    if (user.role === 'SUPER_ADMIN_GLOBAL') {
      // No filter - see all
    } else if (user.schoolId) {
      where.schoolId = user.schoolId;
    } else {
      return NextResponse.json({ data: [] });
    }

    const requests = await db.subscriptionRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ data: requests });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const { requestedTier, notes } = body;

    if (!requestedTier) {
      return NextResponse.json({ error: 'requestedTier requis' }, { status: 400 });
    }

    const validTiers = ['ESSENTIEL', 'STANDARD', 'PREMIUM', 'ENTERPRISE', 'CORPORATE'];
    if (!validTiers.includes(requestedTier)) {
      return NextResponse.json({ error: 'Formule invalide' }, { status: 400 });
    }

    // Get school current tier
    const school = user.schoolId
      ? await db.school.findUnique({ where: { id: user.schoolId }, select: { subscriptionTier: true, name: true } })
      : null;

    if (!school) {
      return NextResponse.json({ error: 'École non trouvée' }, { status: 404 });
    }

    // Check if there's already a pending request
    const existing = await db.subscriptionRequest.findFirst({
      where: {
        schoolId: user.schoolId!,
        status: 'PENDING',
      },
    });

    if (existing) {
      return NextResponse.json({ error: 'Une demande est déjà en attente de traitement' }, { status: 409 });
    }

    const req = await db.subscriptionRequest.create({
      data: {
        schoolId: user.schoolId!,
        requestedTier,
        currentTier: school.subscriptionTier || 'FREEMIUM',
        requestedByName: user.name,
        requestedById: user.id,
        notes: notes || null,
      },
    });

    // Notify all SUPER_ADMIN_GLOBAL users
    const superAdmins = await db.user.findMany({
      where: { role: 'SUPER_ADMIN_GLOBAL' },
      select: { id: true },
    });

    for (const admin of superAdmins) {
      await db.notification.create({
        data: {
          userId: admin.id,
          schoolId: user.schoolId!,
          type: 'SYSTEM',
          title: 'Demande d\'upgrade d\'abonnement',
          message: `${user.name} demande un passage de ${school.subscriptionTier || 'FREEMIUM'} vers ${requestedTier} pour ${school.name}`,
          linkTo: 'schools',
          linkId: user.schoolId,
        },
      });
    }

    return NextResponse.json({ data: req }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
