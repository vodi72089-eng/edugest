import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole, verifySchoolAccess, sanitizeError, type AuthUser } from '@/lib/auth';

// ─── Événements scolaires (onglet Événements) ───────────────────────────────
// GET  /api/events?schoolId=…&scope=upcoming|past|all  → liste scellée par école
// POST /api/events { schoolId, title, description?, category, startAt,
//                    endAt?, location?, audience? }    → création
//
// Gardes serveur :
//  - auth obligatoire (requireRole) — les PARENTS et autres rôles non listés
//    ne peuvent PAS créer/modifier, mais la lecture reste ouverte au personnel
//  - SUPER_ADMIN_GLOBAL : ?schoolId= requis + verifySchoolAccess
//  - rôles école : scellés sur user.schoolId (tout autre schoolId → 403)
//  - scope=upcoming : startAt >= début d'aujourd'hui, ordre asc, limite 100
//  - scope=past     : startAt <  début d'aujourd'hui, ordre desc, limite 50

// NB : constantes NON exportées (Next.js n'autorise que les exports de
// méthodes HTTP dans un fichier route.ts) — [id]/route.ts redéclare les siennes.
const EVENT_WRITE_ROLES = [
  'SUPER_ADMIN_GLOBAL',
  'SCHOOL_ADMIN',
  'DIRECTION_MATERNELLE',
  'DIRECTION_PRIMAIRE',
  'DIRECTION_SECONDAIRE',
  'SECRETARY',
];

const EVENT_CATEGORIES = ['REUNION', 'EXAMEN', 'FETE', 'REUNION_PARENTS', 'SORTIE', 'AUTRE'];
const EVENT_AUDIENCES = ['ALL', 'PERSONNEL', 'PARENTS'];

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Résout l'école de contexte : SAG → param requis + vérif ; rôles école → scellés. */
function resolveSchoolScope(
  user: AuthUser,
  requestedSchoolId: string | null
): { schoolId: string } | { error: NextResponse } {
  if (user.role === 'SUPER_ADMIN_GLOBAL') {
    if (!requestedSchoolId) {
      return { error: NextResponse.json({ error: 'schoolId requis' }, { status: 400 }) };
    }
    if (!verifySchoolAccess(user, requestedSchoolId)) {
      return { error: NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 }) };
    }
    return { schoolId: requestedSchoolId };
  }
  if (!user.schoolId) {
    return { error: NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 }) };
  }
  // Rôles école : scellés sur leur propre école (contournement impossible).
  if (requestedSchoolId && requestedSchoolId !== user.schoolId) {
    return { error: NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 }) };
  }
  return { schoolId: user.schoolId };
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, [
      'SUPER_ADMIN_GLOBAL',
      'SCHOOL_ADMIN',
      'SECRETARY',
      'CASHIER',
      'DIRECTION_MATERNELLE',
      'DIRECTION_PRIMAIRE',
      'DIRECTION_SECONDAIRE',
      'DISCIPLINE_MATERNELLE',
      'DISCIPLINE_PRIMAIRE',
      'DISCIPLINE_SECONDAIRE',
      'TEACHER',
      'HEAD_TEACHER',
      'EPS',
      'MEDICAL',
    ]);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    const scope = (searchParams.get('scope') || 'upcoming').toLowerCase();
    const access = resolveSchoolScope(user, searchParams.get('schoolId'));
    if ('error' in access) return access.error;

    const today = startOfToday();
    const where: Record<string, unknown> = { schoolId: access.schoolId };
    let orderBy: 'asc' | 'desc' = 'asc';
    let take = 100;

    if (scope === 'past') {
      where.startAt = { lt: today };
      orderBy = 'desc';
      take = 50;
    } else if (scope === 'all') {
      orderBy = 'desc';
      take = 100;
    } else {
      // upcoming (défaut)
      where.startAt = { gte: today };
    }

    const events = await db.schoolEvent.findMany({
      where,
      orderBy: { startAt: orderBy },
      take,
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        startAt: true,
        endAt: true,
        location: true,
        audience: true,
        createdBy: true,
        createdAt: true,
        creator: { select: { name: true } },
      },
    });

    return NextResponse.json({
      data: events.map(({ creator, ...e }) => ({ ...e, creatorName: creator?.name || null })),
    });
  } catch (error) {
    console.error('Error listing events:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, EVENT_WRITE_ROLES);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
    }
    const { schoolId, title, description, category, startAt, endAt, location, audience } = body as {
      schoolId?: string;
      title?: string;
      description?: string;
      category?: string;
      startAt?: string;
      endAt?: string | null;
      location?: string;
      audience?: string;
    };

    const access = resolveSchoolScope(user, schoolId ?? null);
    if ('error' in access) return access.error;

    const cleanTitle = (title || '').trim();
    if (!cleanTitle) {
      return NextResponse.json({ error: 'Le titre est obligatoire' }, { status: 400 });
    }
    if (!startAt) {
      return NextResponse.json({ error: 'La date de début est obligatoire' }, { status: 400 });
    }
    const startDate = new Date(startAt);
    if (isNaN(startDate.getTime())) {
      return NextResponse.json({ error: 'Date de début invalide' }, { status: 400 });
    }
    let endDate: Date | null = null;
    if (endAt) {
      const d = new Date(endAt);
      if (isNaN(d.getTime())) {
        return NextResponse.json({ error: 'Date de fin invalide' }, { status: 400 });
      }
      if (d.getTime() < startDate.getTime()) {
        return NextResponse.json({ error: 'La fin doit être après le début' }, { status: 400 });
      }
      endDate = d;
    }

    const event = await db.schoolEvent.create({
      data: {
        schoolId: access.schoolId,
        title: cleanTitle,
        description: (description || '').trim() || null,
        category: EVENT_CATEGORIES.includes(category || '') ? (category as string) : 'AUTRE',
        startAt: startDate,
        endAt: endDate,
        location: (location || '').trim() || null,
        audience: EVENT_AUDIENCES.includes(audience || '') ? (audience as string) : 'ALL',
        createdBy: user.id,
      },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        startAt: true,
        endAt: true,
        location: true,
        audience: true,
        createdBy: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ data: event }, { status: 201 });
  } catch (error) {
    console.error('Error creating event:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
