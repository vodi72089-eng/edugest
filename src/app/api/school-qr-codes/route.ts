import { db } from '@/lib/db';
import { requireRole, sanitizeError } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// QR codes d'inscription parent — consultation/révocation pour le personnel,
// création réservée aux administrateurs et à la direction.
const QR_ADMIN_ROLES = ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN', 'SECRETARY', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE'];
// Le secrétaire doit DEMANDER l'accord de l'admin général avant toute création
// (flux d'approbation via /api/settings-approval, changeType 'qr_create').
const QR_CREATE_ROLES = ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE'];

// GET /api/school-qr-codes — liste des QR codes de l'école
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, QR_ADMIN_ROLES);
    if ('error' in auth) return auth.error;
    const { user } = auth;

    const schoolId = user.role === 'SUPER_ADMIN_GLOBAL'
      ? (new URL(request.url).searchParams.get('schoolId') || user.schoolId)
      : user.schoolId;
    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId est requis' }, { status: 400 });
    }

    const codes = await db.schoolQrCode.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ data: codes });
  } catch (error) {
    console.error('Error listing QR codes:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

// POST /api/school-qr-codes — génère un QR code avec une durée de vie choisie
// Body: { label?, durationHours?, durationDays?, expiresAt? , schoolId? }
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, QR_CREATE_ROLES);
    if ('error' in auth) return auth.error;
    const { user } = auth;

    const body = await request.json().catch(() => ({}));
    const schoolId = user.role === 'SUPER_ADMIN_GLOBAL' && body.schoolId ? body.schoolId : user.schoolId;

    // Garde-fou : un secrétaire qui contournerait l'UI reçoit l'instruction
    // de passer par la demande d'approbation (l'UI ParentQrView le fait déjà).
    if (user.role === 'SECRETARY') {
      return NextResponse.json(
        { error: 'La création d\u2019un QR code requiert l\u2019accord de l\u2019admin général.', requiresApproval: true },
        { status: 403 }
      );
    }

    // Vérifier que l'école existe
    const school = await db.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true } });
    if (!school) {
      return NextResponse.json({ error: 'École non trouvée' }, { status: 404 });
    }

    // Calcul de la date d'expiration (durée de vie du QR code)
    let expiresAt: Date | null = null;
    if (body.expiresAt) {
      expiresAt = new Date(body.expiresAt);
    } else if (body.durationHours) {
      expiresAt = new Date(Date.now() + Number(body.durationHours) * 3600 * 1000);
    } else if (body.durationDays) {
      expiresAt = new Date(Date.now() + Number(body.durationDays) * 24 * 3600 * 1000);
    }
    if (!expiresAt || isNaN(expiresAt.getTime())) {
      expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000); // défaut : 7 jours
    }
    if (expiresAt.getTime() > Date.now() + 366 * 24 * 3600 * 1000) {
      return NextResponse.json({ error: 'La durée de vie maximale d\'un QR code est d\'un an' }, { status: 400 });
    }

    const token = crypto.randomBytes(24).toString('base64url');

    const qr = await db.schoolQrCode.create({
      data: {
        schoolId,
        token,
        label: body.label ? String(body.label).slice(0, 80) : null,
        expiresAt,
        createdBy: user.name || user.id,
      },
    });

    return NextResponse.json({ data: qr }, { status: 201 });
  } catch (error) {
    console.error('Error creating QR code:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
