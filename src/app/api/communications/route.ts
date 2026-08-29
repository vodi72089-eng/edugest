import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, verifySchoolAccess, safeParseInt, sanitizeError, requireActiveSubscription } from '@/lib/auth';

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
    const mine = searchParams.get('mine') === 'true';
    const page = safeParseInt(searchParams.get('page'), 1, 1, 1000);
    const limit = safeParseInt(searchParams.get('limit'), 20, 1, 200);

    // Verify school access if schoolId is provided
    if (schoolId && !verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès à cette école non autorisé' }, { status: 403 });
    }

    const where: Record<string, unknown> = {};

    if (schoolId) where.schoolId = schoolId;
    if (type) where.type = type;
    if (mine) where.senderId = user.id;

    // Filter by status - non-admin only see APPROVED
    if (user.role !== 'SUPER_ADMIN_GLOBAL' && user.role !== 'ADMIN') {
      where.status = 'APPROVED';
    }

    // Filter by scope - directions only see their domain
    if (user.role === 'DIRECTION_MATERNELLE') {
      where.OR = [{ scope: null }, { scope: 'MATERNELLE' }];
    } else if (user.role === 'DIRECTION_PRIMAIRE') {
      where.OR = [{ scope: null }, { scope: 'PRIMAIRE' }];
    } else if (user.role === 'DIRECTION_SECONDAIRE') {
      where.OR = [{ scope: null }, { scope: 'SECONDAIRE' }];
    }

    // Filter by targetType - teachers see ALL+STAFF, parents see ALL+PARENTS
    if (user.role === 'TEACHER' || user.role === 'HEAD_TEACHER') {
      where.targetType = { in: ['ALL', 'STAFF'] };
    } else if (user.role === 'PARENT') {
      where.targetType = { in: ['ALL', 'PARENTS'] };
    }

    const [communications, total, totalUsers] = await Promise.all([
      db.communication.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { sentAt: 'desc' },
        include: {
          reads: {
            include: { user: { select: { id: true, name: true, role: true } } },
            orderBy: { readAt: 'desc' },
          },
        },
      }),
      db.communication.count({ where }),
      db.user.count({ where: { schoolId, isActive: true } }),
    ]);

    return NextResponse.json({
      data: communications,
      totalUsers,
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
    const subCheck = await requireActiveSubscription(request);
    if ('error' in subCheck) return subCheck.error;

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

    // Determine scope from sender role
    let scope: string | null = null;
    let status = 'APPROVED';
    if (user.role === 'DIRECTION_MATERNELLE') {
      scope = 'MATERNELLE';
      status = 'PENDING';
    } else if (user.role === 'DIRECTION_PRIMAIRE') {
      scope = 'PRIMAIRE';
      status = 'PENDING';
    } else if (user.role === 'DIRECTION_SECONDAIRE') {
      scope = 'SECONDAIRE';
      status = 'PENDING';
    }

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
        status,
        scope,
      },
    });

    // Notify admin if pending
    if (status === 'PENDING') {
      const admins = await db.user.findMany({
        where: { schoolId, role: { in: ['SUPER_ADMIN_GLOBAL', 'ADMIN'] } },
      });
      for (const admin of admins) {
        await db.notification.create({
          data: {
            userId: admin.id,
            schoolId,
            type: 'COMMUNICATION_PENDING',
            title: 'Communication en attente',
            message: `${user.name} a créé une communication "${title}" qui nécessite votre approbation.`,
            isRead: false,
          },
        });
      }
    }

    return NextResponse.json({ data: communication }, { status: 201 });
  } catch (error) {
    console.error('Error creating communication:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
