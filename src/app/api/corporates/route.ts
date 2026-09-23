import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { requireRole, sanitizeError } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { sendPlatformEmail, getPlatformEmailAddresses } from '@/lib/platform-email';

// ═══════════════════════════════════════════════════════════════════════════
// COMPTE CORPORATE — client multi-écoles (structurellement différent d'un
// compte école) : une entité Corporate possède N écoles + N utilisateurs.
// Gestion réservée au SUPER_ADMIN_GLOBAL (l'admin de la plateforme).
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/corporates — liste des corporates avec écoles + utilisateurs
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL', 'SUPPORT_AGENT']);
    if ('error' in authResult) return authResult.error;

    const corporates = await db.corporate.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        schools: { include: { school: { select: { id: true, name: true, shortName: true, city: true, studentCount: true, subscriptionTier: true, isActive: true } } } },
        users: { include: { user: { select: { id: true, name: true, email: true, phone: true, isActive: true, lastLoginAt: true } } } },
        tickets: { select: { id: true, status: true } },
      },
    });

    return NextResponse.json({
      data: corporates.map(c => ({
        id: c.id,
        name: c.name,
        contactName: c.contactName,
        contactEmail: c.contactEmail,
        contactPhone: c.contactPhone,
        city: c.city,
        notes: c.notes,
        status: c.status,
        createdAt: c.createdAt,
        schools: c.schools.map(cs => cs.school),
        users: c.users.map(cu => ({ ...cu.user, corporateRole: cu.role })),
        openTickets: c.tickets.filter(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length,
      })),
    });
  } catch (error) {
    console.error('[Corporates] GET error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

// POST /api/corporates — crée un corporate (+ écoles + compte utilisateur)
// Body: { name, contactName?, contactEmail?, contactPhone?, city?, notes?,
//         schools?: string[], user?: { name, email, phone, password } }
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireRole(request, ['SUPER_ADMIN_GLOBAL']);
    if ('error' in authResult) return authResult.error;
    const { user: admin } = authResult;

    const body = await request.json();
    const { name, contactName, contactEmail, contactPhone, city, notes, schools, user } = body;

    if (!name || String(name).trim().length < 2) {
      return NextResponse.json({ error: 'Le nom de l\u2019entreprise est requis (2 caractères min.)' }, { status: 400 });
    }
    if (user && (!user.email || !user.phone || !user.name || !user.password)) {
      return NextResponse.json({ error: 'Le compte corporate nécessite nom, email, téléphone et mot de passe' }, { status: 400 });
    }

    // Email / téléphone uniques si un compte utilisateur est fourni
    if (user) {
      const exists = await db.user.findFirst({ where: { OR: [{ email: user.email }, { phone: user.phone }] } });
      if (exists) {
        return NextResponse.json({ error: 'Un compte avec cet email ou ce téléphone existe déjà' }, { status: 409 });
      }
    }

    // Écoles valides uniquement
    const schoolIds: string[] = Array.isArray(schools) ? schools : [];
    if (schoolIds.length) {
      const valid = await db.school.findMany({ where: { id: { in: schoolIds } }, select: { id: true } });
      if (valid.length !== schoolIds.length) {
        return NextResponse.json({ error: 'Une ou plusieurs écoles sont introuvables' }, { status: 400 });
      }
    }

    const corporate = await db.corporate.create({
      data: {
        name: String(name).trim(),
        contactName: contactName || null,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        city: city || null,
        notes: notes || null,
        schools: { create: schoolIds.map((schoolId: string) => ({ schoolId })) },
        ...(user ? {
          users: {
            create: {
              role: 'CORPORATE_ADMIN',
              user: {
                create: {
                  name: String(user.name).trim(),
                  email: String(user.email).trim().toLowerCase(),
                  phone: String(user.phone).trim(),
                  password: await bcrypt.hash(String(user.password), 12),
                  role: 'CORPORATE_ADMIN',
                  schoolId: null, // ← structurellement HORS école : c'est un compte corporate
                  isVerified: true,
                },
              },
            },
          },
        } : {}),
      },
      include: { schools: { include: { school: { select: { id: true, name: true } } } }, users: { include: { user: { select: { id: true, name: true, email: true } } } } },
    });

    // Email de bienvenue depuis « nos emails » (contact) — SIMULÉ en dev
    if (user?.email) {
      const addresses = await getPlatformEmailAddresses();
      const from = addresses.find(a => a.key === 'contact')?.address || 'contact@edugest.app';
      await sendPlatformEmail({
        to: user.email,
        fromKey: 'contact',
        template: 'WELCOME_CORPORATE',
        subject: 'Bienvenue sur EduGest — votre espace corporate',
        html: `<p>Bonjour ${user.name || ''},</p><p>Votre espace corporate <b>${corporate.name}</b> est prêt : ${corporate.schools.length} école(s) rattachée(s).</p><p>Connectez-vous sur EduGest avec vos identifiants.</p><p>L'équipe EduGest — ${from}</p>`,
      });
    }

    await logAudit({
      action: 'CORP_CREATED',
      userId: admin.id, userName: admin.name, userRole: admin.role,
      entityType: 'Corporate', entityId: corporate.id,
      details: `Corporate « ${corporate.name} » créé (${schoolIds.length} école(s)${user ? ', 1 compte corporate' : ''})`,
      meta: { name: corporate.name, schools: schoolIds },
    });

    return NextResponse.json({ data: { id: corporate.id } }, { status: 201 });
  } catch (error) {
    console.error('[Corporates] POST error:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
