import { db } from '@/lib/db'

// Static keywords for classification
const CRITICAL_KEYWORDS = [
  'violence', 'arme', 'drogue', 'vol', 'agression', 'menace',
  'harcèlement', 'incendie', 'dégradation', 'couteau', 'pistolet',
  'attaque', 'bagarre', 'meurtre', 'sexuel', 'abus'
]

const POSITIVE_KEYWORDS = [
  'excellence', 'mérite', 'brillance', 'example', 'leadership',
  'responsabilité', 'aide', 'solidarité', 'perseverance', 'resultat'
]

// Words to ignore when extracting keywords from causes
const STOP_WORDS = new Set([
  'le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'ou',
  'que', 'qui', 'dans', 'pour', 'par', 'sur', 'avec', 'ce', 'cette',
  'est', 'sont', 'a', 'au', 'aux', 'en', 'il', 'elle', 'nous',
  'vous', 'ils', 'elles', 'pas', 'ne', 'se', 'son', 'sa', 'ses',
  'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'leur', 'leurs',
  'été', 'être', 'avoir', 'faire', 'dit', 'fait', 'voir', 'tout',
  'très', 'trop', 'bien', 'mal', 'aussi', 'mais', 'donc', 'car',
  'si', 'alors', 'comme', 'même', 'encore', 'plus', 'moins'
])

export interface ClassificationResult {
  listType: 'BLACKLIST' | 'GREYLIST' | 'WHITELIST'
  reason: string
  autoClassified: boolean
  details: {
    totalPoints: number
    sanctionCount: number
    criticalCount: number
    sameTypeCount: number
    matchedKeywords: string[]
  }
}

/**
 * Extract meaningful keywords from text (title + description)
 */
export function extractKeywords(text: string): string[] {
  if (!text) return []
  return text
    .toLowerCase()
    .replace(/[^a-zàâäéèêëïîôùûüÿç\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !STOP_WORDS.has(word))
    .filter((word, i, arr) => arr.indexOf(word) === i) // unique
}

/**
 * Get total penalty points for a student (all records)
 */
async function getStudentPoints(studentId: string): Promise<number> {
  const result = await db.disciplineRecord.aggregate({
    where: { studentId },
    _sum: { points: true }
  })
  return result._sum.points || 0
}

/**
 * Count sanctions by type for a student
 */
async function getSanctionTypeCounts(studentId: string) {
  const records = await db.disciplineRecord.groupBy({
    by: ['type'],
    where: { studentId },
    _count: { id: true }
  })
  return records.map(r => ({ type: r.type, count: r._count.id }))
}

/**
 * Count critical severity sanctions
 */
async function getCriticalCount(studentId: string): Promise<number> {
  return db.disciplineRecord.count({
    where: { studentId, severity: 'CRITICAL' }
  })
}

/**
 * Get recent descriptions for keyword matching
 */
async function getRecentDescriptions(studentId: string, limit: number = 10): Promise<string[]> {
  const records = await db.disciplineRecord.findMany({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { title: true, description: true }
  })
  return records.map(r => `${r.title} ${r.description}`)
}

/**
 * Get learned keywords for a school
 */
async function getLearnedKeywords(schoolId: string, listType?: string) {
  const where: any = { schoolId }
  if (listType) where.listType = listType
  return db.disciplineKeyword.findMany({ where })
}

/**
 * Main classification function
 */
export async function classifyStudent(
  studentId: string,
  schoolId: string
): Promise<ClassificationResult> {
  // 1. Get student data
  const totalPoints = await getStudentPoints(studentId)
  const typeCounts = await getSanctionTypeCounts(studentId)
  const criticalCount = await getCriticalCount(studentId)
  const descriptions = await getRecentDescriptions(studentId)

  // 2. Check for positive sanctions → WHITELIST
  if (totalPoints > 0) {
    return {
      listType: 'WHITELIST',
      reason: 'Sanctions positives détectées',
      autoClassified: true,
      details: { totalPoints, sanctionCount: typeCounts.reduce((s, t) => s + t.count, 0), criticalCount, sameTypeCount: 0, matchedKeywords: [] }
    }
  }

  // 3. Check CRITICAL severity → direct BLACKLIST
  if (criticalCount > 0) {
    return {
      listType: 'BLACKLIST',
      reason: `${criticalCount} sanction(s) critique(s)`,
      autoClassified: true,
      details: { totalPoints, sanctionCount: typeCounts.reduce((s, t) => s + t.count, 0), criticalCount, sameTypeCount: 0, matchedKeywords: [] }
    }
  }

  // 4. Check static keywords in descriptions
  const allText = descriptions.join(' ').toLowerCase()
  const matchedStatic = CRITICAL_KEYWORDS.filter(kw => allText.includes(kw))
  if (matchedStatic.length > 0) {
    return {
      listType: 'BLACKLIST',
      reason: `Mots-clés critiques trouvés: ${matchedStatic.join(', ')}`,
      autoClassified: true,
      details: { totalPoints, sanctionCount: typeCounts.reduce((s, t) => s + t.count, 0), criticalCount, sameTypeCount: 0, matchedKeywords: matchedStatic }
    }
  }

  // 5. Check learned keywords
  const learned = await getLearnedKeywords(schoolId, 'BLACKLIST')
  const learnedWords = learned.map(k => k.keyword.toLowerCase())
  const matchedLearned = learnedWords.filter(kw => allText.includes(kw))
  if (matchedLearned.length > 0) {
    return {
      listType: 'BLACKLIST',
      reason: `Mots-clés appris trouvés: ${matchedLearned.join(', ')}`,
      autoClassified: true,
      details: { totalPoints, sanctionCount: typeCounts.reduce((s, t) => s + t.count, 0), criticalCount, sameTypeCount: 0, matchedKeywords: matchedLearned }
    }
  }

  // 6. Check points threshold (-10)
  if (totalPoints <= -10) {
    return {
      listType: 'BLACKLIST',
      reason: `Seuil de points atteint: ${totalPoints}`,
      autoClassified: true,
      details: { totalPoints, sanctionCount: typeCounts.reduce((s, t) => s + t.count, 0), criticalCount, sameTypeCount: 0, matchedKeywords: [] }
    }
  }

  // 7. Check repeated grave types (3+ VIOLENCE or TRICHERIE)
  const graveTypes = typeCounts.filter(t =>
    (t.type === 'VIOLENCE' || t.type === 'TRICHERIE') && t.count >= 3
  )
  if (graveTypes.length > 0) {
    return {
      listType: 'BLACKLIST',
      reason: `${graveTypes[0].count} sanctions de type ${graveTypes[0].type}`,
      autoClassified: true,
      details: { totalPoints, sanctionCount: typeCounts.reduce((s, t) => s + t.count, 0), criticalCount, sameTypeCount: graveTypes[0].count, matchedKeywords: [] }
    }
  }

  // 8. Default: GREYLIST for negative points
  if (totalPoints < 0) {
    return {
      listType: 'GREYLIST',
      reason: 'Sanctions modérées',
      autoClassified: true,
      details: { totalPoints, sanctionCount: typeCounts.reduce((s, t) => s + t.count, 0), criticalCount, sameTypeCount: 0, matchedKeywords: [] }
    }
  }

  // 9. No sanctions → GREYLIST (default)
  return {
    listType: 'GREYLIST',
    reason: 'Aucune sanctions',
    autoClassified: true,
    details: { totalPoints, sanctionCount: typeCounts.reduce((s, t) => s + t.count, 0), criticalCount, sameTypeCount: 0, matchedKeywords: [] }
  }
}

/**
 * Learn keywords from a manually-set blacklist entry
 */
export async function learnKeywordsFromRecord(
  recordId: string,
  title: string,
  description: string,
  schoolId: string
): Promise<string[]> {
  const text = `${title} ${description}`
  const keywords = extractKeywords(text)

  const learned: string[] = []
  for (const kw of keywords) {
    try {
      await db.disciplineKeyword.upsert({
        where: { keyword_schoolId: { keyword: kw, schoolId } },
        update: {},
        create: { keyword: kw, listType: 'BLACKLIST', schoolId, learnedFrom: recordId }
      })
      learned.push(kw)
    } catch {
      // Ignore duplicate errors
    }
  }
  return learned
}
