import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

// Limiteur simple anti-abus (par IP)
const attempts = new Map<string, { count: number; last: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function rateLimit(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (entry && now - entry.last < WINDOW_MS && entry.count >= MAX_ATTEMPTS) return false;
  if (entry && now - entry.last >= WINDOW_MS) {
    attempts.set(key, { count: 1, last: now });
  } else {
    attempts.set(key, { count: (entry?.count || 0) + 1, last: now });
  }
  return true;
}

/**
 * POST /api/public/parent-register
 * Création du compte parent depuis la page « Retrouver mon enfant »
 * (accès via QR code scanné). Body: { token, studentId, name, phone, password }
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!rateLimit(`parent-register:${ip}`)) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez plus tard.' }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const { token, studentId, name, phone, password } = body as Record<string, string>;

    if (!token || !studentId || !name?.trim() || !phone?.trim() || !password) {
      return NextResponse.json({ error: 'Tous les champs sont requis' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Le mot de passe doit contenir au moins 6 caractères' }, { status: 400 });
    }

    // ── Validation du QR code (durée de vie + révocation) ──────────────
    const qr = await db.schoolQrCode.findUnique({ where: { token } });
    if (!qr || !qr.isActive) {
      return NextResponse.json({ error: 'QR code invalide ou révoqué' }, { status: 404 });
    }
    if (qr.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: 'Ce QR code a expiré. Contactez l\'école.' }, { status: 410 });
    }

    // ── L'élève doit appartenir à l'école du QR ────────────────────────
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId: qr.schoolId, isArchived: false },
      select: { id: true, firstName: true, lastName: true, parentId: true, schoolId: true },
    });
    if (!student) {
      return NextResponse.json({ error: 'Élève non trouvé dans cette école' }, { status: 404 });
    }

    // Sécurité : si un compte parent est déjà lié, l'inscription via QR est refusée
    if (student.parentId) {
      return NextResponse.json(
        { error: 'Un compte parent est déjà associé à cet élève. Contactez l\'école pour récupérer vos identifiants.' },
        { status: 409 }
      );
    }

    // ── Unicité du téléphone ───────────────────────────────────────────
    const normalizedPhone = phone.trim().replace(/\s+/g, ' ');
    const existingPhone = await db.user.findUnique({ where: { phone: normalizedPhone } });
    if (existingPhone) {
      return NextResponse.json(
        { error: 'Ce numéro de téléphone est déjà utilisé. Connectez-vous ou utilisez un autre numéro.' },
        { status: 409 }
      );
    }

    // ── Création du compte parent + liaison à l'élève ──────────────────
    const hashed = await bcrypt.hash(password, 12);
    const parent = await db.user.create({
      data: {
        name: name.trim().slice(0, 80),
        phone: normalizedPhone,
        password: hashed,
        role: 'PARENT',
        schoolId: student.schoolId,
        isActive: true,
      },
      select: { id: true, name: true },
    });

    await db.student.update({
      where: { id: student.id },
      data: { parentId: parent.id },
    });

    return NextResponse.json({
      data: {
        ok: true,
        message: 'Compte parent créé avec succès. Vous pouvez maintenant vous connecter.',
        parentName: parent.name,
        login: normalizedPhone,
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error in parent-register:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
