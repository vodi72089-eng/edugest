import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const school = await db.school.findUnique({
      where: { id },
      include: {
        classes: {
          include: {
            _count: { select: { students: true } },
          },
          orderBy: { name: 'asc' },
        },
        schoolYears: { orderBy: { createdAt: 'desc' } },
        users: {
          select: { id: true, name: true, email: true, role: true, isActive: true },
        },
        comments: {
          where: { isApproved: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: {
          select: { students: true, classes: true, users: true },
        },
      },
    });

    if (!school) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    return NextResponse.json({ data: school });
  } catch (error) {
    console.error('Error getting school:', error);
    return NextResponse.json({ error: 'Failed to get school' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.school.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    const school = await db.school.update({
      where: { id },
      data: body,
    });

    return NextResponse.json({ data: school });
  } catch (error) {
    console.error('Error updating school:', error);
    return NextResponse.json({ error: 'Failed to update school' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.school.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    // Soft delete
    const school = await db.school.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ data: school, message: 'School deactivated successfully' });
  } catch (error) {
    console.error('Error deleting school:', error);
    return NextResponse.json({ error: 'Failed to delete school' }, { status: 500 });
  }
}
