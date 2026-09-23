import { db } from '@/lib/db'
import { requireRole, verifySchoolAccess, sanitizeError } from '@/lib/auth'
import { getClassPassingTimeline, qualifyStudentForClassPassing, StudentDisciplineCategory } from '@/lib/class-passing'
import { resolveEventVisibility } from '@/lib/platform-events'
import { getSchoolTier } from '@/lib/subscription'
import { hasFeatureGrant } from '@/lib/platform-email'
import { NextRequest, NextResponse } from 'next/server'

// Passage de classe : administrateurs d'école (SCHOOL_ADMIN) + super admin plateforme
const CLASS_PASSING_ROLES = ['SCHOOL_ADMIN', 'SUPER_ADMIN_GLOBAL']

const PREMIUM_TIERS = ['PREMIUM', 'ENTERPRISE', 'CORPORATE']

const VALID_DECISIONS = ['PENDING', 'PASSED', 'REPEAT', 'RATTRAPAGE'] as const
type Decision = (typeof VALID_DECISIONS)[number]

const RISK_ORDER: Record<string, number> = { CRITIQUE: 0, ELEVE: 1, MODERE: 2, FAIBLE: 3 }

const round2 = (n: number) => Math.round(n * 100) / 100

// GET /api/class-passing?schoolId=...&classId=...
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(request, CLASS_PASSING_ROLES)
    if ('error' in authResult) return authResult.error
    const { user } = authResult

    const { searchParams } = new URL(request.url)
    const schoolId = searchParams.get('schoolId') || user.schoolId
    const classId = searchParams.get('classId') || ''

    if (!schoolId) {
      return NextResponse.json({ error: 'schoolId est requis' }, { status: 400 })
    }

    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 })
    }

    // ── Gate forfait : PREMIUM minimum (le super admin plateforme passe toujours) ──
    if (user.role !== 'SUPER_ADMIN_GLOBAL') {
      const tier = await getSchoolTier(schoolId)
      if (!PREMIUM_TIERS.includes(tier)) {
        return NextResponse.json(
          {
            error: `La fonctionnalité Passage de classe requiert le forfait PREMIUM ou supérieur (forfait actuel : ${tier}).`,
            featureRequired: 'passage de classe',
            tierRequired: 'PREMIUM',
            currentTier: tier,
          },
          { status: 403 }
        )
      }
      // ── Gate activation : le passage d'école n'est disponible QUE lorsque
      // l'admin de la plateforme l'envoie à l'école (FeatureGrant) ──
      if (!(await hasFeatureGrant('CLASS_PASSING', schoolId))) {
        return NextResponse.json(
          {
            error: "Le passage de classe n'est pas encore activé pour votre école — l'administrateur de la plateforme vous l'enverra.",
            grantRequired: true,
            feature: 'CLASS_PASSING',
          },
          { status: 403 }
        )
      }
    }

    // ── Année scolaire active + fenêtre d'ouverture ─────────────────────────
    const activeSchoolYear = await db.schoolYear.findFirst({
      where: { schoolId, isActive: true },
      orderBy: { createdAt: 'desc' }
    })

    const timeline = getClassPassingTimeline(activeSchoolYear)
    const visibility = await resolveEventVisibility('CLASS_PASSING', schoolId, activeSchoolYear)

    const activeSchoolYearPayload = activeSchoolYear
      ? {
          id: activeSchoolYear.id,
          label: activeSchoolYear.label,
          startDate: activeSchoolYear.startDate,
          endDate: activeSchoolYear.endDate,
        }
      : null

    // ── Fenêtre fermée : ne pas fuiter les données élèves ────────────────────
    if (!visibility.visible) {
      return NextResponse.json({
        timeline,
        visibility,
        activeSchoolYear: activeSchoolYearPayload,
        stats: {
          totalStudents: 0,
          deliberationTotal: 0,
          blacklistCount: 0,
          greyBlackCount: 0,
          directPassTotal: 0,
          whiteCount: 0,
          greyWhiteCount: 0,
          atRiskCount: 0,
          repechageCount: 0,
        },
        data: [],
      })
    }

    // ── Élèves (avec historique disciplinaire) ───────────────────────────────
    const studentWhere: Record<string, unknown> = { schoolId }
    if (activeSchoolYear) {
      studentWhere.schoolYearId = activeSchoolYear.id
    }
    if (classId) {
      studentWhere.classId = classId
    }

    const students = await db.student.findMany({
      where: studentWhere,
      orderBy: [{ class: { name: 'asc' } }, { lastName: 'asc' }],
      select: {
        id: true,
        matricule: true,
        firstName: true,
        lastName: true,
        photoUrl: true,
        classId: true,
        class: { select: { id: true, name: true, section: true } },
        disciplineRecords: {
          orderBy: { createdAt: 'desc' },
          select: { listType: true, points: true, severity: true },
        },
        blacklistEntries: { select: { id: true, reason: true, addedAt: true } },
        greylistEntries: { select: { id: true, reason: true, addedAt: true } },
        whitelistEntries: { select: { id: true, reason: true, addedAt: true } },
      }
    })

    // ── Décisions de passage existantes (bulletins) ──────────────────────────
    const reportCards = activeSchoolYear ? await db.reportCard.findMany({
      where: { schoolYearId: activeSchoolYear.id },
      select: { studentId: true, decision: true },
    }) : []
    const decisionsMap: Record<string, string> = {}
    for (const rc of reportCards) {
      if (rc.decision) decisionsMap[rc.studentId] = rc.decision
    }

    // ── Notes + matières : 2 requêtes, agrégation en JS ─────────────────────
    const subjects = await db.subject.findMany({
      where: activeSchoolYear
        ? { schoolId, schoolYearId: activeSchoolYear.id }
        : { schoolId },
      select: { id: true, name: true, coefficient: true, classId: true },
    })
    const subjectsById = new Map(subjects.map(s => [s.id, s]))

    const grades = await db.grade.findMany({
      where: activeSchoolYear
        ? { schoolYearId: activeSchoolYear.id }
        : { student: { schoolId } },
      select: { studentId: true, subjectId: true, trimester: true, score: true },
    })

    // Moyenne pondérée par trimestre : Σ(score×coef)/Σcoef
    // trimesterAcc[studentId][trimester] = { sum, coef }
    const trimesterAcc: Record<string, Record<string, { sum: number; coef: number }>> = {}
    // Moyenne par matière sur T1-T3 : subjectAvg[studentId][subjectId] = { total, count }
    const subjectAvg: Record<string, Record<string, { total: number; count: number }>> = {}

    for (const g of grades) {
      const subject = subjectsById.get(g.subjectId)
      if (!subject) continue
      const coef = subject.coefficient || 1

      if (!trimesterAcc[g.studentId]) trimesterAcc[g.studentId] = {}
      const t = trimesterAcc[g.studentId][g.trimester] || { sum: 0, coef: 0 }
      t.sum += g.score * coef
      t.coef += coef
      trimesterAcc[g.studentId][g.trimester] = t

      if (!subjectAvg[g.studentId]) subjectAvg[g.studentId] = {}
      const s = subjectAvg[g.studentId][g.subjectId] || { total: 0, count: 0 }
      s.total += g.score
      s.count += 1
      subjectAvg[g.studentId][g.subjectId] = s
    }

    // ── Construction des lignes élèves ───────────────────────────────────────
    const rows = students.map(s => {
      // Moyennes par trimestre (pondérées)
      const trimesterAverages: { T1: number | null; T2: number | null; T3: number | null } = { T1: null, T2: null, T3: null }
      for (const t of ['T1', 'T2', 'T3'] as const) {
        const acc = trimesterAcc[s.id]?.[t]
        trimesterAverages[t] = acc && acc.coef > 0 ? round2(acc.sum / acc.coef) : null
      }
      const tValues = Object.values(trimesterAverages).filter((v): v is number => v !== null)
      const annualAverage = tValues.length > 0 ? round2(tValues.reduce((a, b) => a + b, 0) / tValues.length) : null

      // Matières échouées (moyenne annuelle de la matière < 10/20)
      // Basé sur les matières où l'élève a réellement des notes (robuste même si
      // les matières sont rattachées à une autre classe ou sans classe)
      const studentSubjectIds = Object.keys(subjectAvg[s.id] || {})
      const failingSubjects: Array<{ subjectId: string; name: string; score: number }> = []
      for (const subId of studentSubjectIds) {
        const sub = subjectsById.get(subId)
        if (!sub) continue
        const agg = subjectAvg[s.id][subId]
        if (!agg || agg.count === 0) continue
        const avg = agg.total / agg.count
        if (avg < 10) {
          failingSubjects.push({ subjectId: sub.id, name: sub.name, score: round2(avg) })
        }
      }

      // Discipline
      const disciplinePoints = s.disciplineRecords.reduce((sum, r) => sum + (r.points || 0), 0)
      const sanctionCount = s.disciplineRecords.length
      const hasCriticalSanctions = s.disciplineRecords.some(r => r.severity === 'CRITICAL' || r.severity === 'HIGH')

      // Score de risque 0-100 :
      //  70% déficit de notes : (10 - min(moyenne, 10)) / 10 × 70 (plafonné)
      //  30% discipline : min(|points|, 10) / 10 × 30 (+ bonus 15 si sanction critique)
      const gradeDeficit = annualAverage !== null
        ? Math.min(70, Math.max(0, ((10 - Math.min(annualAverage, 10)) / 10) * 70))
        : 0
      const disciplineRisk = (Math.min(Math.abs(disciplinePoints), 10) / 10) * 30 + (hasCriticalSanctions ? 15 : 0)
      const riskScore = Math.min(100, Math.round(gradeDeficit + disciplineRisk))
      const riskLevel = riskScore >= 60 ? 'CRITIQUE' : riskScore >= 35 ? 'ELEVE' : riskScore >= 15 ? 'MODERE' : 'FAIBLE'

      const decisionRaw = decisionsMap[s.id] || 'PENDING'
      const decision: Decision = (VALID_DECISIONS as readonly string[]).includes(decisionRaw)
        ? (decisionRaw as Decision)
        : 'PENDING'

      const qualification = qualifyStudentForClassPassing(s)

      return {
        id: s.id,
        matricule: s.matricule,
        firstName: s.firstName,
        lastName: s.lastName,
        photoUrl: s.photoUrl,
        class: s.class,
        annualAverage,
        trimesterAverages,
        failingSubjects,
        disciplinePoints,
        sanctionCount,
        hasCriticalSanctions,
        riskScore,
        riskLevel,
        decision,
        qualification: {
          category: qualification.category as StudentDisciplineCategory,
          badgeLabel: qualification.badgeLabel,
          reason: qualification.reason,
        },
        _shouldDeliberate: qualification.shouldDeliberate,
        _category: qualification.category,
      }
    })

    // Tri : CRITIQUE d'abord, puis moyenne annuelle croissante (nulls en dernier),
    // puis points de discipline croissants
    rows.sort((a, b) => {
      const riskDiff = (RISK_ORDER[a.riskLevel] ?? 4) - (RISK_ORDER[b.riskLevel] ?? 4)
      if (riskDiff !== 0) return riskDiff
      const aAvg = a.annualAverage === null ? Number.POSITIVE_INFINITY : a.annualAverage
      const bAvg = b.annualAverage === null ? Number.POSITIVE_INFINITY : b.annualAverage
      if (aAvg !== bAvg) return aAvg - bAvg
      return a.disciplinePoints - b.disciplinePoints
    })

    const publicRows = rows.map(({ _shouldDeliberate, _category, ...rest }) => rest)

    // ── Statistiques ─────────────────────────────────────────────────────────
    const deliberationStudents = rows.filter(r => r._shouldDeliberate)
    const directPassStudents = rows.filter(r => !r._shouldDeliberate)

    const stats = {
      totalStudents: rows.length,
      deliberationTotal: deliberationStudents.length,
      blacklistCount: deliberationStudents.filter(r => r._category === 'BLACKLIST').length,
      greyBlackCount: deliberationStudents.filter(r => r._category === 'GREY_BLACK').length,
      directPassTotal: directPassStudents.length,
      whiteCount: directPassStudents.filter(r => r._category === 'WHITELIST').length,
      greyWhiteCount: directPassStudents.filter(r => r._category === 'GREY_WHITE').length,
      atRiskCount: rows.filter(r => r.riskLevel === 'CRITIQUE' || r.riskLevel === 'ELEVE').length,
      repechageCount: rows.filter(r => r.failingSubjects.length > 0).length,
    }

    return NextResponse.json({
      timeline,
      visibility,
      activeSchoolYear: activeSchoolYearPayload,
      stats,
      data: publicRows,
    })
  } catch (error) {
    console.error('[ClassPassing] Error:', error)
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 })
  }
}
