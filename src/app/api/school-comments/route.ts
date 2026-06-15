import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, requireRole, sanitizeError } from '@/lib/auth';

// GET - No auth required (public viewing of approved comments)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId') || '';
    const approvedOnly = searchParams.get('approved') !== 'false';

    const where: Record<string, unknown> = {};
    if (schoolId) where.schoolId = schoolId;
    if (approvedOnly) where.isApproved = true;

    const comments = await db.schoolComment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ data: comments });
  } catch (error) {
    console.error('Error listing school comments:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

// POST - No auth required (anyone can submit a review, but it starts as isApproved: false)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { schoolId, authorName, authorEmail, rating, comment } = body;

    if (!schoolId || !authorName || !rating || !comment) {
      return NextResponse.json(
        { error: 'Missing required fields: schoolId, authorName, rating, comment' },
        { status: 400 }
      );
    }

    if (rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: 'Rating must be between 1 and 5' },
        { status: 400 }
      );
    }

    const newComment = await db.schoolComment.create({
      data: {
        schoolId,
        authorName,
        authorEmail: authorEmail || null,
        rating,
        comment,
        isApproved: false,
      },
    });

    return NextResponse.json({ data: newComment }, { status: 201 });
  } catch (error) {
    console.error('Error creating school comment:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

// PUT - require comments:approve permission (SCHOOL_ADMIN/SUPER_ADMIN_GLOBAL)
export async function PUT(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'comments:approve');
    if ('error' in authResult) return authResult.error;

    const body = await request.json();
    const { id, isApproved } = body;

    if (!id) {
      return NextResponse.json({ error: 'Comment ID required' }, { status: 400 });
    }

    const updated = await db.schoolComment.update({
      where: { id },
      data: { isApproved: isApproved !== undefined ? isApproved : true },
    });

    // Recalculate school average rating when approving
    if (isApproved) {
      const approvedComments = await db.schoolComment.findMany({
        where: { schoolId: updated.schoolId, isApproved: true },
      });
      const avg = approvedComments.reduce((sum, c) => sum + c.rating, 0) / approvedComments.length;
      await db.school.update({
        where: { id: updated.schoolId },
        data: {
          averageRating: Math.round(avg * 10) / 10,
          totalReviews: approvedComments.length,
        },
      });
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('Error updating school comment:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}

// DELETE - require comments:delete permission (SCHOOL_ADMIN/SUPER_ADMIN_GLOBAL)
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'comments:delete');
    if ('error' in authResult) return authResult.error;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id') || '';

    if (!id) {
      return NextResponse.json({ error: 'Comment ID required' }, { status: 400 });
    }

    const deleted = await db.schoolComment.delete({ where: { id } });

    // Recalculate school average rating
    const approvedComments = await db.schoolComment.findMany({
      where: { schoolId: deleted.schoolId, isApproved: true },
    });
    const avg = approvedComments.length > 0
      ? approvedComments.reduce((sum, c) => sum + c.rating, 0) / approvedComments.length
      : 0;
    await db.school.update({
      where: { id: deleted.schoolId },
      data: {
        averageRating: Math.round(avg * 10) / 10,
        totalReviews: approvedComments.length,
      },
    });

    return NextResponse.json({ data: deleted });
  } catch (error) {
    console.error('Error deleting school comment:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
