import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { requirePermission, requireAuth, safeParseInt, sanitizeError, AuthUser } from '@/lib/auth';
import { getClassesForSystem } from '@/lib/educational-systems';

function generateRandomPassword(length: number = 12): string {
  return crypto.randomBytes(length).toString('base64').slice(0, length);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const province = searchParams.get('province') || '';
    const schoolType = searchParams.get('schoolType') || '';
    const schoolCategory = searchParams.get('schoolCategory') || '';
    const page = safeParseInt(searchParams.get('page'), 1, 1, 1000);
    const limit = safeParseInt(searchParams.get('limit'), 20, 1, 100);

    const where: Record<string, unknown> = {
      isActive: true,
    };

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { shortName: { contains: search } },
        { city: { contains: search } },
        { email: { contains: search } },
      ];
    }

    if (province) {
      where.province = province;
    }

    if (schoolType) {
      where.schoolType = schoolType;
    }

    if (schoolCategory) {
      where.schoolCategory = schoolCategory;
    }

    // ── Sécurité (SEC-1/F2 — faille MOYENNE prouvée) : cet annuaire est public,
    // mais la réponse exposait TOUTES les colonnes School (tokens WhatsApp Meta,
    // endpoints personnalisés, abonnement, e-mails/téléphones). On ne renvoie
    // plus que les champs d'annuaire ; les champs d'administration ne sont
    // ajoutés QUE pour un appelant authentifié.
    let viewer: AuthUser | null = null;
    const authResult = await requireAuth(request);
    if (!('error' in authResult)) viewer = authResult.user;

    const baseSelect: Record<string, unknown> = {
      id: true,
      name: true,
      shortName: true,
      city: true,
      province: true,
      logo: true,
      coverImage: true,
      schoolType: true,
      schoolCategory: true,
      isActive: true,
      createdAt: true,
      _count: { select: { students: true, classes: true, users: true } },
    };
    if (viewer) {
      Object.assign(baseSelect, {
        description: true,
        email: true,
        phone: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        subscriptionEndDate: true,
        schoolSystem: true,
      });
    }

    const [schools, total] = await Promise.all([
      db.school.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: baseSelect as never,
      }),
      db.school.count({ where }),
    ]);

    return NextResponse.json({
      data: schools,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing schools:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // ── SÉCURITÉ (P1) : création d'école publique (onboarding) —
    // rate limit strict par IP (avant : spam d'écoles illimité sans auth).
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { checkRateLimit } = await import('@/lib/auth');
    if (!checkRateLimit(`school-create:${clientIp}`, 3, 60 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Trop de créations d\'écoles. Réessayez plus tard.' },
        { status: 429 }
      );
    }

    // ── SÉCURITÉ : seul un SUPER_ADMIN_GLOBAL authentifié peut choisir le
    // forfait et le mot de passe admin. Pour tout appel public, le forfait
    // est FORCÉ à FREEMIUM (avant : subscriptionTier:"ENTERPRISE" accepté
    // anonymement) et le mot de passe admin est toujours généré.
    let callerRole: string | null = null;
    try {
      const { requireAuth } = await import('@/lib/auth');
      const maybeAuth = await requireAuth(request);
      if (!('error' in maybeAuth)) callerRole = maybeAuth.user.role;
    } catch {}
    const isPlatformAdmin = callerRole === 'SUPER_ADMIN_GLOBAL';

    const body = await request.json();
    const {
      name,
      shortName,
      email,
      phone,
      address,
      city,
      province,
      country,
      latitude,
      longitude,
      description,
      schoolType,
      schoolCategory,
      schoolLevel,
      educationalSystem,
      maxStudents,
      establishmentYear,
      mission,
      subscriptionTier,
      logo,
      coverImage,
      skipDefaultClasses,
      // Admin account fields
      adminName,
      adminEmail,
      adminPhone,
      adminPassword,
    } = body;

    if (!name || !shortName || !email || !phone || !city || !province || !country) {
      return NextResponse.json(
        { error: 'Champs obligatoires manquants: name, shortName, email, phone, city, province, country' },
        { status: 400 }
      );
    }

    // Check for duplicate school email
    const existingSchool = await db.school.findFirst({ where: { email } });
    if (existingSchool) {
      return NextResponse.json(
        { error: 'Une école avec cet email existe déjà' },
        { status: 409 }
      );
    }

    const school = await db.school.create({
      data: {
        name,
        shortName,
        email,
        phone,
        address: address || '',
        city,
        province,
        country,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        description: description || null,
        schoolType: schoolType || 'MIXTE',
        schoolCategory: schoolCategory || 'PRIVEE',
        schoolLevel: schoolLevel || null,
        educationalSystem: educationalSystem || 'RDC',
        maxStudents: maxStudents || 100,
        establishmentYear: establishmentYear || null,
        mission: mission || null,
        subscriptionTier: isPlatformAdmin ? (subscriptionTier || 'FREEMIUM') : 'FREEMIUM',
        logo: logo || null,
        coverImage: coverImage || null,
      },
    });

    // Create admin user if admin info is provided
    // BUG FIX: Use role 'SECRETARY' instead of 'SUPER_ADMIN_GLOBAL'
    // BUG FIX: Generate random password instead of 'admin123'
    // BUG FIX: Use bcrypt cost factor 12
    let adminUser: any = null;
    if (adminName && (adminEmail || adminPhone)) {
      const randomPassword = adminPassword || generateRandomPassword();
      const hashedPassword = await bcrypt.hash(randomPassword, 12);

      adminUser = await db.user.create({
        data: {
          name: adminName,
          email: adminEmail || null,
          // User.phone est @unique : le compte admin ne peut pas hériter
          // tel quel du téléphone de l'école (2 écoles créées avec le même
          // numéro → crash 500). Fallback unique par école.
          phone: adminPhone || `admin-${school.id}`,
          password: hashedPassword,
          role: 'SCHOOL_ADMIN',
          isVerified: true, // Auto-verify since OTP is disabled
          schoolId: school.id,
          isActive: true,
        },
      });

      // Return user data without password
      const { password: _, ...userData } = adminUser;
      adminUser = userData;

      // OTP disabled: admin is auto-verified on creation
      // OTP sending code kept commented for future re-enablement
      // try {
      //   const { generateOtp } = await import('@/lib/otp');
      //   const { sendOtpEmail } = await import('@/lib/email');
      //   ...
      // } catch (otpError) {
      //   console.error('[Schools] OTP send error (non-blocking):', otpError);
      // }
    }

    // ── Année scolaire par défaut (ex: "2025-2026") ─────────────────────────
    // Année académique : mois >= août (8) → Y/Y+1, sinon Y-1/Y
    const nowDate = new Date();
    const startYear = nowDate.getMonth() >= 8 ? nowDate.getFullYear() : nowDate.getFullYear() - 1;
    const endYear = startYear + 1;
    const schoolYear = await db.schoolYear.create({
      data: {
        label: `${startYear}-${endYear}`,
        startDate: new Date(startYear, 9, 1),   // 1er octobre de l'année de début
        endDate: new Date(endYear, 6, 31),      // 31 juillet de l'année de fin
        isActive: true,
        schoolId: school.id,
      },
    });

    // ── Génération des classes selon le système éducatif (avec options) ────
    let classesCreated = 0;
    if (!skipDefaultClasses) {
      const templates = getClassesForSystem(educationalSystem, schoolLevel, true);
      if (templates.length > 0) {
        const result = await db.class.createMany({
          data: templates.map(t => ({
            name: t.name,
            section: t.section,
            level: t.level,
            capacity: t.capacity ?? 40,
            schoolId: school.id,
            schoolYearId: schoolYear.id,
            // NB : le modèle Class n'a pas de champ `option` — l'option
            // (Commerciale & Gestion, Pédagogie…) est encodée dans `name`.
            // (Avant : `option` envoyé à Prisma → création d'école en 500.)
          })),
        });
        classesCreated = result.count;
      }
    }

    return NextResponse.json({ data: { school, adminUser, classesCreated, generatedPassword: adminName && (adminEmail || adminPhone) && !adminPassword ? 'A random password was generated' : undefined } }, { status: 201 });
  } catch (error) {
    console.error('Error creating school:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
