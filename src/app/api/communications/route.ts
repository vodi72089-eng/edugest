import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || '';
    const type = searchParams.get('type') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

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
    return NextResponse.json({ error: 'Failed to list communications' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      senderId,
      senderRole,
      schoolId,
      type,
      title,
      content,
      targetType,
      targetId,
      sentToApp,
      sentToWhatsapp,
    } = body;

    if (!senderId || !senderRole || !schoolId || !type || !title || !content) {
      return NextResponse.json(
        { error: 'Missing required fields: senderId, senderRole, schoolId, type, title, content' },
        { status: 400 }
      );
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
      },
    });

    return NextResponse.json({ data: communication }, { status: 201 });
  } catch (error) {
    console.error('Error creating communication:', error);
    return NextResponse.json({ error: 'Failed to create communication' }, { status: 500 });
  }
}
