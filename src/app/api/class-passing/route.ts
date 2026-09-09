import { db } from '@/lib/db'
import { requireRole, verifySchoolAccess, sanitizeError } from '@/lib/auth'
import { getClassPassingTimeline, qualifyStudentForClassPassing } from '@/lib/class-passing'
import { NextRequest, NextResponse } from 'next/server'

const CLASS_PASSING_ROLES = [
  'SUPER_ADMIN_GLOBAL', 'ADMIN', 'SECRETARY',
  'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE',
  'HEAD_TEACHER'
]

// GET /api/class-passing?schoolId=...&forceOpen=true
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, CLASS_PASSING_ROLES)
    if ('error' in authResult) return authResult.error
    const { user } = authResult

    const { searchParams } = new URL(request.url)
    const schoolId = searchParams.get('schoolId') || user.schoolId
    const classId = searchParams.get('classId') || ''
    const forceOpen = searchParams.get('forceOpen') === 'true'

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId est requis' }, { status: 400 })
    }

    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 })
    }

    // Find active school year
    const activeSchoolYear = await db.schoolYear.findFirst({
      where: { schoolId, isActive: true },
      orderBy: { createdAt: 'desc' }
    })

    const timeline = getClassPassingTimeline(activeSchoolYear)
    if (forceOpen) {
      timeline.isOpen = true
    }

    // Build students query
    const studentWhere: any = { schoolId }
    if (activeSchoolYear) {
      studentWhere.schoolYearId = activeSchoolYear.id
    }
    if (classId) {
      studentWhere.classId = classId
    }

    // Fetch all students with discipline history and existing report card decisions
    const students = await db.student.findMany({
      where: studentWhere,
      orderBy: [{ class: { name: 'asc' } }, { lastName: 'asc' }],
      include: {
        class: { select: { id: true, name: true, section: true } },
        disciplineRecords: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, listType: true, points: true, severity: true, title: true, createdAt: true }
        },
        blacklistEntries: { select: { id: true, reason: true, addedAt: true } },
        greylistEntries: { select: { id: true, reason: true, addedAt: true } },
        whitelistEntries: { select: { id: true, reason: true, addedAt: true } },
      }
    })

    // Fetch report card decisions for active school year (T3 or annual)
    const reportCards = activeSchoolYear ? await db.reportCard.findMany({
      where: { schoolYearId: activeSchoolYear.id }
    }) : []
    const decisionsMap: Record<string, string> = {}
    for (const rc of reportCards) {
      if (rc.decision) decisionsMap[rc.studentId] = rc.decision
    }

    // Categorize students
    const qualifiedStudents = students.map(s => {
      const qualification = qualifyStudentForClassPassing(s)
      return {
        id: s.id,
        matricule: s.matricule,
        firstName: s.firstName,
        lastName: s.lastName,
        photoUrl: s.photoUrl,
        class: s.class,
        decision: decisionsMap[s.id] || 'PENDING',
        qualification,
      }
    })

    // Filter to ONLY students requiring deliberation (Blacklist & Grey-Black)
    const deliberationStudents = qualifiedStudents.filter(s => s.qualification.shouldDeliberate)
    const directPassStudents = qualifiedStudents.filter(s => !s.qualification.shouldDeliberate)

    const blacklistCount = deliberationStudents.filter(s => s.qualification.category === 'BLACKLIST').length
    const greyBlackCount = deliberationStudents.filter(s => s.qualification.category === 'GREY_BLACK').length
    const whiteCount = directPassStudents.filter(s => s.qualification.category === 'WHITELIST').length
    const greyWhiteCount = directPassStudents.filter(s => s.qualification.category === 'GREY_WHITE').length

    return NextResponse.json({
      timeline,
      activeSchoolYear: activeSchoolYear ? {
        id: activeSchoolYear.id,
        label: activeSchoolYear.label,
        startDate: activeSchoolYear.startDate,
        endDate: activeSchoolYear.endDate,
      } : null,
      stats: {
        totalStudents: students.length,
        deliberationTotal: deliberationStudents.length,
        blacklistCount,
        greyBlackCount,
        directPassTotal: directPassStudents.length,
        whiteCount,
        greyWhiteCount,
      },
      data: deliberationStudents,
    })
  } catch (error) {
    console.error('[ClassPassing] Error:', error)
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 })
  }
}
