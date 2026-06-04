import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

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
      subscriptionTier,
    } = body;

    if (!name || !shortName || !email || !phone || !city || !province || !country) {
      return NextResponse.json(
        { error: 'Missing required fields: name, shortName, email, phone, city, province, country' },
        { status: 400 }
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
      },
    });

    return NextResponse.json({ data: school }, { status: 201 });
  } catch (error) {
    console.error('Error creating school:', error);
    return NextResponse.json({ error: 'Failed to create school' }, { status: 500 });
  }
}
