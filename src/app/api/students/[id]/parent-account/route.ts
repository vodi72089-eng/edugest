import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, verifySchoolAccess, sanitizeError } from '@/lib/auth';
import { getTierLimits } from '@/lib/subscription';
import bcrypt from 'bcryptjs';

/**
 * POST /api/students/[id]/parent-account
 * Gestion manuelle du compte parent d'un élève, élève par élève :
 * l'admin écrit le nom, le téléphone (identifiant de connexion) et le mot de
 * passe. Si le parent existe déjà, ses identifiants sont mis à jour ;
 * sinon le compte est créé puis lié à l'élève.
 * Body: { name, phone, password?, email? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    // Seuls les administrateurs gèrent les comptes parents
    const adminRoles = ['SUPER_ADMIN_GLOBAL', 'SCHOOL_ADMIN', 'SECRETARY', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE'];
    if (!adminRoles.includes(user.role)) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const { id } = await params;
    const student = await db.student.findUnique({
      where: { id },
      select: { id: true, schoolId: true, parentId: true, firstName: true, lastName: true },
    });
    if (!student) {
      return NextResponse.json({ error: 'Élève non trouvé' }, { status: 404 });
    }
    if (!verifySchoolAccess(user, student.schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 });
    }

    // Forfait sans gestion de comptes parents (FREEMIUM) → refus, comme /api/parents
    if (user.role !== 'SUPER_ADMIN_GLOBAL') {
      const school = await db.school.findUnique({ where: { id: student.schoolId }, select: { subscriptionTier: true } });
      if (!getTierLimits(school?.subscriptionTier || 'FREEMIUM').canManageParentAccounts) {
        return NextResponse.json(
          { error: `Le forfait ${school?.subscriptionTier || 'FREEMIUM'} de votre école n'inclut pas les comptes parents. Passez à un forfait supérieur.` },
          { status: 403 }
        );
      }
    }

    const body = await request.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    const email = body.email ? String(body.email).trim() : null;
    const password = body.password ? String(body.password) : null;

    if (!name || !phone) {
      return NextResponse.json({ error: 'Le nom et le téléphone (identifiant) du parent sont requis' }, { status: 400 });
    }
    if (password && password.length < 6) {
      return NextResponse.json({ error: 'Le mot de passe doit contenir au moins 6 caractères' }, { status: 400 });
    }

    // ── Cas 1 : un compte parent existe déjà → mise à jour ─────────────
    if (student.parentId) {
      const parent = await db.user.findUnique({ where: { id: student.parentId } });
      if (!parent) {
        return NextResponse.json({ error: 'Compte parent introuvable' }, { status: 404 });
      }

      // Unicité du téléphone si modifié
      if (phone !== parent.phone) {
        const phoneTaken = await db.user.findUnique({ where: { phone } });
        if (phoneTaken && phoneTaken.id !== parent.id) {
          return NextResponse.json({ error: 'Ce numéro de téléphone est déjà utilisé par un autre compte' }, { status: 409 });
        }
      }

      const data: Record<string, unknown> = { name, phone };
      if (email !== undefined) data.email = email || null;
      if (password) data.password = await bcrypt.hash(password, 12);

      await db.user.update({ where: { id: parent.id }, data });

      return NextResponse.json({
        data: {
          ok: true,
          mode: 'updated',
          message: password
            ? 'Identifiants du parent mis à jour (nouveau mot de passe actif).'
            : 'Informations du parent mises à jour.',
          parent: { id: parent.id, name, phone },
        },
      });
    }

    // ── Cas 2 : création d'un nouveau compte parent ────────────────────
    const phoneTaken = await db.user.findUnique({ where: { phone } });
    if (phoneTaken) {
      // Un compte existe déjà avec ce numéro : on le lie simplement à l'élève
      // si c'est un parent de la même école, sinon on refuse.
      if (phoneTaken.role === 'PARENT' && phoneTaken.schoolId === student.schoolId) {
        await db.student.update({ where: { id: student.id }, data: { parentId: phoneTaken.id } });
        return NextResponse.json({
          data: { ok: true, mode: 'linked', message: 'Compte parent existant lié à cet élève.', parent: { id: phoneTaken.id, name: phoneTaken.name, phone } },
        });
      }
      return NextResponse.json({ error: 'Ce numéro de téléphone est déjà utilisé par un autre compte' }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password || `eg-${Math.random().toString(36).slice(2, 10)}`, 12);
    const parent = await db.user.create({
      data: {
        name,
        phone,
        email: email || null,
        password: hashed,
        role: 'PARENT',
        schoolId: student.schoolId,
        isActive: true,
      },
    });

    await db.student.update({ where: { id: student.id }, data: { parentId: parent.id } });

    return NextResponse.json({
      data: {
        ok: true,
        mode: 'created',
        message: password
          ? 'Compte parent créé avec les identifiants fournis.'
          : 'Compte parent créé (mot de passe généré automatiquement — communiquez-le au parent).',
        parent: { id: parent.id, name, phone },
      },
    }, { status: 201 });
  } catch (error) {
    console.error('Error managing parent account:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
