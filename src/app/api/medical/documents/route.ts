import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, verifySchoolAccess, sanitizeError } from '@/lib/auth';
import { hasFeatureAccess } from '@/lib/subscription';
import { generateDocCode } from '@/lib/doc-codes';
import { getMedicalDocCodePrefix } from '@/lib/pdf-medical';

/**
 * Documents médicaux officiels (dispenses, fiches de santé, registres).
 * Accès : SUPER_ADMIN_GLOBAL, SCHOOL_ADMIN et MEDICAL uniquement —
 * et seulement pour les écoles dont l'abonnement inclut le module médical
 * (PREMIUM et plus). Chaque création génère un code unique DIS-/FSA-/REG-.
 */

const ALLOWED_ROLES = ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN', 'MEDICAL'];
const ALLOWED_TYPES = ['DISPENSE_MEDICALE', 'FICHE_SANTE', 'REGISTRE_SANTE'];

async function gate(req: NextRequest) {
  const authResult = await requireAuth(req);
  if ('error' in authResult) return { error: authResult.error } as const;
  const { user } = authResult;

  if (!ALLOWED_ROLES.includes(user.role)) {
    return {
      error: NextResponse.json(
        { error: 'Accès réservé à l\'administration et au service médical' },
        { status: 403 }
      ),
    } as const;
  }

  // Gating abonnement : le module médical requiert PREMIUM+ (super admin exempté)
  if (user.role !== 'SUPER_ADMIN_GLOBAL') {
    const school = await db.school.findUnique({
      where: { id: user.schoolId! },
      select: { subscriptionTier: true },
    });
    const tier = school?.subscriptionTier || 'FREEMIUM';
    if (!hasFeatureAccess(tier, 'medical')) {
      return {
        error: NextResponse.json(
          { error: 'La gestion des fiches médicales est réservée aux offres Professionnel, Enterprise et Corporate.', tierRequired: 'PREMIUM' },
          { status: 403 }
        ),
      } as const;
    }
  }

  return { user } as const;
}

// GET /api/medical/documents?type=&studentId=&q=&limit=
export async function GET(req: NextRequest) {
  try {
    const g = await gate(req);
    if ('error' in g) return g.error;
    const { user } = g;

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const studentId = searchParams.get('studentId');
    const q = searchParams.get('q')?.trim();
    const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10) || 200, 500);

    const whereClause: any = { schoolId: user.schoolId! };
    if (type && ALLOWED_TYPES.includes(type)) whereClause.type = type;
    if (studentId) whereClause.studentId = studentId;
    if (q) {
      whereClause.OR = [
        { docCode: { contains: q } },
        { title: { contains: q } },
        { student: { is: { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }, { matricule: { contains: q } }] } } },
      ];
    }

    const documents = await db.medicalDocument.findMany({
      where: whereClause,
      include: {
        student: {
          select: {
            id: true, matricule: true, firstName: true, lastName: true,
            class: { select: { name: true } },
          },
        },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const parsed = documents.map((d) => ({
      ...d,
      content: safeParse(d.content),
    }));

    return NextResponse.json({ data: parsed });
  } catch (error: any) {
    console.error('[Medical Documents API] GET error:', error);
    return NextResponse.json({ error: sanitizeError(error) || 'Erreur serveur' }, { status: 500 });
  }
}

// POST /api/medical/documents
// body: { type, studentId?, title?, sourceId?, content: {...} }
export async function POST(req: NextRequest) {
  try {
    const g = await gate(req);
    if ('error' in g) return g.error;
    const { user } = g;

    const body = await req.json();
    const { type, studentId, title, sourceId, content } = body || {};
    let studentSchoolId: string | null = null;

    if (!type || !ALLOWED_TYPES.includes(type)) {
      return NextResponse.json(
        { error: 'Type de document invalide (DISPENSE_MEDICALE, FICHE_SANTE ou REGISTRE_SANTE attendu)' },
        { status: 400 }
      );
    }
    if (type !== 'REGISTRE_SANTE' && !studentId) {
      return NextResponse.json({ error: 'Élève requis pour ce type de document' }, { status: 400 });
    }

    if (studentId) {
      const student = await db.student.findUnique({ where: { id: studentId }, select: { schoolId: true } });
      if (!student) return NextResponse.json({ error: 'Élève non trouvé' }, { status: 404 });
      if (!verifySchoolAccess(user, student.schoolId)) {
        return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
      }
      studentSchoolId = student.schoolId;
    }

    const docCode = await generateDocCode(getMedicalDocCodePrefix(type));
    const created = await db.medicalDocument.create({
      data: {
        docCode,
        type,
        title: String(title || defaultTitle(type)).slice(0, 160),
        schoolId: user.schoolId!,
        studentId: studentId || null,
        sourceId: sourceId ? String(sourceId) : null,
        content: JSON.stringify(content || {}),
        createdById: user.id,
      },
      include: {
        student: {
          select: {
            id: true, matricule: true, firstName: true, lastName: true,
            class: { select: { name: true } },
          },
        },
        createdBy: { select: { name: true } },
      },
    });

    // Notification Parent + SCHOOL_ADMIN (resolver) — non bloquant.
    void notifyMedicalDocumentCreated(created.id, type, studentId || null, user.id, user.schoolId || studentSchoolId);

    return NextResponse.json({
      data: { ...created, content: safeParse(created.content) },
      message: `Document créé avec le code ${docCode}`,
    }, { status: 201 });
  } catch (error: any) {
    console.error('[Medical Documents API] POST error:', error);
    return NextResponse.json({ error: sanitizeError(error) || 'Erreur serveur' }, { status: 500 });
  }
}

// Notification document médical — Parent + SCHOOL_ADMIN (resolver), détails
// strictement minimaux hors application (type + élève, JAMAIS le contenu).
async function notifyMedicalDocumentCreated(docId: string, type: string, studentId: string | null, actorId: string, schoolId?: string | null) {
  try {
    const { notifyEvent } = await import('@/lib/notification-service');
    const student = studentId
      ? await db.student.findUnique({ where: { id: studentId }, select: { firstName: true, lastName: true } })
      : null;
    const label = defaultTitle(type);
    await notifyEvent(
      { type: 'MEDICAL_DOCUMENT', schoolId: schoolId ?? null, studentId, actorId },
      {
        title: 'Document médical',
        message: student
          ? `${student.firstName} ${student.lastName} — ${label} disponible`
          : `${label} disponible`,
        relatedId: docId,
      }
    );
  } catch { /* non-critical */ }
}

function defaultTitle(type: string): string {
  switch (type) {
    case 'DISPENSE_MEDICALE': return 'Dispense médicale';
    case 'FICHE_SANTE': return 'Fiche de santé';
    case 'REGISTRE_SANTE': return 'Registre de santé';
    default: return 'Document médical';
  }
}

function safeParse(json: string): Record<string, unknown> {
  try { return JSON.parse(json || '{}'); } catch { return {}; }
}
