import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, verifySchoolAccess, safeParseInt, sanitizeError } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'communications:read');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const { searchParams } = new URL(request.url);
    let schoolId = searchParams.get('schoolId') || '';
    if (!schoolId && user.role !== 'SUPER_ADMIN_GLOBAL') {
      schoolId = user.schoolId || '';
    }
    if (!schoolId) {
      return NextResponse.json({ error: 'School ID required' }, { status: 403 });
    }
    const type = searchParams.get('type') || '';
    const page = safeParseInt(searchParams.get('page'), 1, 1, 1000);
    const limit = safeParseInt(searchParams.get('limit'), 20, 1, 200);

    // Verify school access if schoolId is provided
    if (schoolId && !verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    const where: Record<string, unknown> = {};

    if (schoolId) where.schoolId = schoolId;
    if (type) where.type = type;

    const [communications, total] = await Promise.all([
      db.communication.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { sentAt: 'desc' },
      }),
      db.communication.count({ where }),
    ]);

    return NextResponse.json({
      data: communications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error listing communications:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'communications:create');
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const body = await request.json();
    const {
      schoolId,
      type,
      title,
      content,
      targetType,
      targetId,
      sentToApp,
      sentToWhatsapp,
    } = body;

    if (!schoolId || !type || !title || !content) {
      return NextResponse.json(
        { error: 'Missing required fields: schoolId, type, title, content' },
        { status: 400 }
      );
    }

    // Verify school access
    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    // CRITICAL: Derive senderId and senderRole from the authenticated user, NOT from request body
    // This prevents identity spoofing
    const senderId = user.id;
    const senderRole = user.role;

    const communication = await db.communication.create({
      data: {
        senderId,
        senderRole,
        schoolId,
        type,
        title,
        content,
        targetType: targetType || 'ALL',
        targetId: targetId || null,
        sentToApp: sentToApp !== undefined ? sentToApp : true,
        sentToWhatsapp: sentToWhatsapp !== undefined ? sentToWhatsapp : true,
      },
    });

    return NextResponse.json({ data: communication }, { status: 201 });
  } catch (error) {
    console.error('Error creating communication:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
