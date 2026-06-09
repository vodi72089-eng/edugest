import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const province = searchParams.get('province') || '';
    const schoolType = searchParams.get('schoolType') || '';
    const schoolCategory = searchParams.get('schoolCategory') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

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
    return NextResponse.json({ error: 'Failed to list schools' }, { status: 500 });
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
      },
    });

    // Create admin user if admin info is provided
    let adminUser = null;
    if (adminName && (adminEmail || adminPhone)) {
      const hashedPassword = await bcrypt.hash(adminPassword || 'admin123', 10);

      adminUser = await db.user.create({
        data: {
          name: adminName,
          email: adminEmail || null,
          phone: adminPhone || adminPhone || phone,
          password: hashedPassword,
          role: 'SECRETARY',
          schoolId: school.id,
          isActive: true,
        },
      });

      // Return user data without password
      const { password: _, ...userData } = adminUser;
      adminUser = userData;
    }

    return NextResponse.json({ data: { school, adminUser } }, { status: 201 });
  } catch (error) {
    console.error('Error creating school:', error);
    return NextResponse.json({ error: 'Failed to create school' }, { status: 500 });
  }
}
