import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { requirePermission, safeParseInt, sanitizeError } from '@/lib/auth';

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

    const [schools, total] = await Promise.all([
      db.school.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { students: true, classes: true, users: true },
          },
        },
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
      maxStudents,
      establishmentYear,
      mission,
      subscriptionTier,
      logo,
      coverImage,
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
        maxStudents: maxStudents || 100,
        establishmentYear: establishmentYear || null,
        mission: mission || null,
        subscriptionTier: subscriptionTier || 'FREEMIUM',
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
          phone: adminPhone || phone,
          password: hashedPassword,
          role: 'SUPER_ADMIN_GLOBAL',
          schoolId: school.id,
          isActive: true,
        },
      });

      // Return user data without password
      const { password: _, ...userData } = adminUser;
      adminUser = userData;

      // Send OTP automatically via WhatsApp + Email for verification
      try {
        const { generateOtp } = await import('@/lib/otp');
        const { sendOtpEmail } = await import('@/lib/email');

        // WhatsApp OTP
        if (adminUser.phone) {
          const waOtp = await generateOtp(adminUser.id, 'whatsapp', 'registration');
          if (waOtp.success && waOtp.code) {
            const WA_SERVER = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3001';
            const WA_API_KEY = process.env.WHATSAPP_API_KEY || 'edugest-wa-dev-key';
            const msg = `🔐 Code de vérification EduGest: ${waOtp.code}\n\nCe code expire dans 10 minutes.`;
            fetch(`${WA_SERVER}/send`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-api-key': WA_API_KEY },
              body: JSON.stringify({ phone: adminUser.phone, message: msg }),
            }).catch(() => {});
          }
        }

        // Email OTP
        if (adminUser.email) {
          const emailOtp = await generateOtp(adminUser.id, 'email', 'registration');
          if (emailOtp.success && emailOtp.code) {
            sendOtpEmail(adminUser.email, emailOtp.code, school.name).catch(() => {});
          }
        }
      } catch (otpError) {
        console.error('[Schools] OTP send error (non-blocking):', otpError);
      }
    }

    return NextResponse.json({ data: { school, adminUser, generatedPassword: adminName && (adminEmail || adminPhone) && !adminPassword ? 'A random password was generated' : undefined } }, { status: 201 });
  } catch (error) {
    console.error('Error creating school:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
