import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

// Limiteur simple anti-abus (par IP)
const attempts = new Map<string, { count: number; last: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

// Garde-fou serveur : nombre maximal d'enfants liés en une seule inscription
const MAX_STUDENT_IDS = 10;

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

/** Erreur métier avec code HTTP (renvoyée telle quelle au client). */
class RegisterError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Message nominatif listant les élèves déjà liés à un autre compte parent. */
function takenStudentsMessage(taken: Array<{ firstName: string; lastName: string }>): string {
  const names = taken.map((s) => `« ${s.firstName} ${s.lastName} »`);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
  const verb = taken.length === 1 ? 'est déjà associé à un compte parent' : 'sont déjà associés à un compte parent';
  return `${list} ${verb}. Contactez l'école pour récupérer vos identifiants.`;
}

/**
 * POST /api/public/parent-register
 * Création du compte parent depuis la page « Retrouver mon enfant »
 * (accès via QR code scanné).
 *
 * Nouveau flux multi-enfants : Body { token, studentIds: string[], firstName, lastName, phone, password? }
 * Rétrocompatibilité (1 enfant) : Body { token, studentId, name, phone, password }
 *
 * Un enfant ne peut appartenir qu'à UN seul compte parent : la vérification
 * `parentId == null` ET la liaison sont faites dans une transaction Prisma —
 * si un seul élève est déjà pris, TOUTE l'inscription échoue (409 nominatif).
 */
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!rateLimit(`parent-register:${ip}`)) {
      return NextResponse.json({ error: 'Trop de tentatives. Réessayez plus tard.' }, { status: 429 });
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;

    // ── Normalisation du payload (multi-enfants + rétrocompatibilité) ──
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    let studentIds: string[] = [];
    if (Array.isArray(body.studentIds)) {
      studentIds = body.studentIds.map((id) => String(id).trim()).filter(Boolean);
    } else if (typeof body.studentId === 'string' && body.studentId.trim()) {
      studentIds = [body.studentId.trim()]; // ancien client : un seul élève
    }
    studentIds = [...new Set(studentIds)]; // dédoublonnage défensif

    const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
    const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
    const name =
      typeof body.name === 'string' && body.name.trim()
        ? body.name.trim().slice(0, 80)
        : [firstName, lastName].filter(Boolean).join(' ').slice(0, 80);
    const phone = typeof body.phone === 'string' ? body.phone : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!token || studentIds.length === 0 || !name || !phone.trim()) {
      return NextResponse.json({ error: 'Tous les champs sont requis' }, { status: 400 });
    }
    if (password && password.length < 6) {
      return NextResponse.json({ error: 'Le mot de passe doit contenir au moins 6 caractères' }, { status: 400 });
    }
    if (studentIds.length > MAX_STUDENT_IDS) {
      return NextResponse.json(
        { error: `Vous ne pouvez pas lier plus de ${MAX_STUDENT_IDS} enfants en une seule inscription.` },
        { status: 400 }
      );
    }

    // ── Validation du QR code (durée de vie + révocation) ──────────────
    const qr = await db.schoolQrCode.findUnique({ where: { token } });
    if (!qr || !qr.isActive) {
      return NextResponse.json({ error: 'QR code invalide ou révoqué' }, { status: 404 });
    }
    if (qr.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: 'Ce QR code a expiré. Contactez l\'école.' }, { status: 410 });
    }

    const normalizedPhone = phone.trim().replace(/\s+/g, ' ');
    // Convention existante (cf. /api/students/[id]/parent-account) : si aucun
    // mot de passe n'est fourni (nouveau flux), un mot de passe par défaut est
    // généré puis haché — le parent pourra le définir via « Mot de passe oublié ».
    const plainPassword = password || `eg-${Math.random().toString(36).slice(2, 10)}`;
    const hashed = await bcrypt.hash(plainPassword, 12);

    // ── Transaction atomique : tout échoue si UN SEUL élève est pris ───
    const { parent, students } = await db.$transaction(async (tx) => {
      // Unicité du téléphone (identifiant de connexion)
      const existingPhone = await tx.user.findUnique({ where: { phone: normalizedPhone } });
      if (existingPhone) {
        throw new RegisterError(
          'Ce numéro de téléphone est déjà utilisé. Connectez-vous ou utilisez un autre numéro.',
          409
        );
      }

      // Chaque élève doit appartenir à l'école du QR et ne pas être archivé
      const found = await tx.student.findMany({
        where: { id: { in: studentIds }, schoolId: qr.schoolId, isArchived: false },
        select: { id: true, firstName: true, lastName: true, parentId: true },
      });
      if (found.length !== studentIds.length) {
        throw new RegisterError(
          'Un ou plusieurs enfants sélectionnés n\'ont pas été trouvés dans cette école. Veuillez recommencer.',
          404
        );
      }

      // Garde-fou STRICT : un enfant = UN seul compte parent (nominatif)
      const taken = found.filter((s) => s.parentId);
      if (taken.length > 0) {
        throw new RegisterError(takenStudentsMessage(taken), 409);
      }

      // Création du compte parent (rôle PARENT, école du QR)
      const created = await tx.user.create({
        data: {
          name,
          phone: normalizedPhone,
          password: hashed,
          role: 'PARENT',
          schoolId: qr.schoolId,
          isActive: true,
        },
        select: { id: true, name: true },
      });

      // Liaison de TOUS les élèves — conditionnelle à parentId encore null
      // (anti-race : si un autre compte a lié un élève entre-temps, on échoue)
      const linked = await tx.student.updateMany({
        where: { id: { in: studentIds }, parentId: null },
        data: { parentId: created.id },
      });
      if (linked.count !== studentIds.length) {
        throw new RegisterError(
          'Un des enfants vient d\'être associé à un autre compte parent. Veuillez contacter l\'école.',
          409
        );
      }

      return { parent: created, students: found };
    });

    return NextResponse.json({
      data: {
        ok: true,
        message: `Compte parent créé : ${studentIds.length} enfant${studentIds.length > 1 ? 's sont liés' : ' est lié'} à votre compte. Vous pouvez maintenant vous connecter.`,
        parentName: parent.name,
        login: normalizedPhone,
        linkedCount: studentIds.length,
        children: students
          .sort((a, b) => studentIds.indexOf(a.id) - studentIds.indexOf(b.id))
          .map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` })),
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof RegisterError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('Error in parent-register:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
