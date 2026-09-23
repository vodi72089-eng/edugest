/**
 * Class Passing (Passage de classe) Rules and Logic
 * 
 * Rules:
 * 1. Time Window: The interface is accessible only starting 1 week (7 days) before the end of the school year (endDate).
 * 2. Student Deliberation Filter: Only students in BLACKLIST or GREY_BLACK (alternating grey/black, severe infractions, points <= -5)
 *    are presented for deliberation. Students in WHITELIST or GREY_WHITE (alternating white/grey, good conduct) pass normally.
 */

export interface SchoolYearDateInfo {
  startDate?: Date | string | null
  endDate?: Date | string | null
  isActive?: boolean
}

export interface ClassPassingTimeline {
  isOpen: boolean
  daysRemainingUntilOpen: number
  openDate: Date | null
  endDate: Date | null
  message: string
}

/**
 * Calculates whether the class passing period is currently open (1 week before endDate)
 */
export function getClassPassingTimeline(schoolYear?: SchoolYearDateInfo | null, currentDate: Date = new Date()): ClassPassingTimeline {
  if (!schoolYear || !schoolYear.endDate) {
    // If no explicit end date, default to open so system remains functional, but inform users
    return {
      isOpen: true,
      daysRemainingUntilOpen: 0,
      openDate: null,
      endDate: null,
      message: 'Période active (Aucune date de fin d\'année configurée)',
    }
  }

  const end = new Date(schoolYear.endDate)
  // 7 days before end date
  const openDate = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000)
  
  const nowMs = currentDate.getTime()
  const openMs = openDate.getTime()
  // Keep open for 60 days after end of year to finish all deliberations
  const closeMs = end.getTime() + 60 * 24 * 60 * 60 * 1000

  const isOpen = nowMs >= openMs && nowMs <= closeMs
  const daysUntilOpen = Math.ceil((openMs - nowMs) / (1000 * 60 * 60 * 24))

  let message = ''
  if (isOpen) {
    message = 'Période de passage de classe ouverte'
  } else if (daysUntilOpen > 0) {
    message = `Ouverture dans ${daysUntilOpen} jour${daysUntilOpen > 1 ? 's' : ''} (le ${openDate.toLocaleDateString('fr-FR')})`
  } else {
    message = 'Période de passage de classe clôturée'
  }

  return {
    isOpen,
    daysRemainingUntilOpen: Math.max(0, daysUntilOpen),
    openDate,
    endDate: end,
    message,
  }
}

export type StudentDisciplineCategory = 'BLACKLIST' | 'GREY_BLACK' | 'GREY_WHITE' | 'WHITELIST'

export interface StudentPassingQualification {
  shouldDeliberate: boolean
  category: StudentDisciplineCategory
  badgeLabel: string
  badgeColor: string
  reason: string
  totalPenaltyPoints: number
  sanctionCount: number
  hasCriticalSanctions: boolean
}

/**
 * Evaluates whether a student needs disciplinary council deliberation for class passage
 */
export function qualifyStudentForClassPassing(student: {
  id: string
  disciplineRecords?: Array<{ listType: string; points: number; severity: string }>
  blacklistEntries?: any[]
  greylistEntries?: any[]
  whitelistEntries?: any[]
}): StudentPassingQualification {
  const records = student.disciplineRecords || []
  const hasBlacklistEntry = (student.blacklistEntries && student.blacklistEntries.length > 0) || false
  const hasWhitelistEntry = (student.whitelistEntries && student.whitelistEntries.length > 0) || false

  const totalPoints = records.reduce((sum, r) => sum + (r.points || 0), 0)
  const blacklistRecordCount = records.filter(r => r.listType === 'BLACKLIST').length
  const greylistRecordCount = records.filter(r => r.listType === 'GREYLIST').length
  const whitelistRecordCount = records.filter(r => r.listType === 'WHITELIST').length
  const criticalCount = records.filter(r => r.severity === 'CRITICAL' || r.severity === 'HIGH').length

  // Case 1: Pure BLACKLIST (Active blacklist entry or explicit blacklist records)
  if (hasBlacklistEntry || blacklistRecordCount >= 1 || totalPoints <= -10) {
    return {
      shouldDeliberate: true,
      category: 'BLACKLIST',
      badgeLabel: 'Liste Noire',
      badgeColor: '#e11d48',
      reason: hasBlacklistEntry
        ? 'Inscrit en Liste Noire active'
        : `${blacklistRecordCount} sanction(s) de liste noire, points: ${totalPoints}`,
      totalPenaltyPoints: totalPoints,
      sanctionCount: records.length,
      hasCriticalSanctions: criticalCount > 0,
    }
  }

  // Case 2: GREY-BLACK (Alternated between grey and black, critical severity, or points <= -5)
  // Has several greylist infractions, or repeated negative points putting them at disciplinary risk
  const isGreyBlack = (greylistRecordCount >= 2 && totalPoints <= -4) ||
                      (criticalCount >= 1 && totalPoints < 0) ||
                      (records.length >= 3 && totalPoints <= -5)

  if (isGreyBlack) {
    return {
      shouldDeliberate: true,
      category: 'GREY_BLACK',
      badgeLabel: 'Gris-Noir (À risque)',
      badgeColor: '#f97316',
      reason: `Alternance gris-noir : ${records.length} sanctions (${totalPoints} pts, ${criticalCount} critique${criticalCount > 1 ? 's' : ''})`,
      totalPenaltyPoints: totalPoints,
      sanctionCount: records.length,
      hasCriticalSanctions: criticalCount > 0,
    }
  }

  // Case 3: GREY-WHITE (Mild greylist, 0 to negative 3 points, mostly positive/neutral, passes normally)
  if (greylistRecordCount > 0 && totalPoints > -4 && criticalCount === 0) {
    return {
      shouldDeliberate: false,
      category: 'GREY_WHITE',
      badgeLabel: 'Gris-Blanc (Admis d\'office)',
      badgeColor: '#3b82f6',
      reason: 'Sanctions légères ou occasionnelles, passage direct sans délibération',
      totalPenaltyPoints: totalPoints,
      sanctionCount: records.length,
      hasCriticalSanctions: false,
    }
  }

  // Case 4: Pure WHITELIST (Clean record or only positive commendations)
  return {
    shouldDeliberate: false,
    category: 'WHITELIST',
    badgeLabel: 'Liste Blanche (Admis d\'office)',
    badgeColor: '#10b981',
    reason: hasWhitelistEntry || whitelistRecordCount > 0
      ? 'Excellence et bonne conduite'
      : 'Aucune sanction enregistrée',
    totalPenaltyPoints: totalPoints,
    sanctionCount: records.length,
    hasCriticalSanctions: false,
  }
}
