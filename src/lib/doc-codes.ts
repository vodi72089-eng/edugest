import { db } from './db';

/**
 * Générateur de codes uniques pour les documents officiels EduGest.
 *
 * Format lisible : {PREFIXE}-{AA}-{NNNN} — ex. DIS-26-0042.
 * Le compteur est séquentiel par préfixe et par année ; une boucle de
 * réessaie protège contre les collisions concurrentes (contrainte unique).
 */

export type DocCodePrefix = 'BUL' | 'NOT' | 'DIS' | 'FSA' | 'REG';

const YEAR = () => new Date().getFullYear().toString().slice(-2);

/**
 * Table Prisma + champ portant le code, par préfixe.
 * NB : les delegates Prisma ne sont pas appelables en union — les requêtes
 * sont donc typées par branche (même comportement, types exacts).
 */
async function countByDocCode(prefix: DocCodePrefix, yy: string): Promise<number> {
  switch (prefix) {
    case 'BUL':
      return db.reportCard.count({ where: { docCode: { startsWith: `${prefix}-${yy}-` } } });
    case 'NOT':
      return db.grade.count({ where: { docCode: { startsWith: `${prefix}-${yy}-` } } });
    default:
      return db.medicalDocument.count({ where: { docCode: { startsWith: `${prefix}-${yy}-` } } });
  }
}

async function docCodeExists(prefix: DocCodePrefix, code: string): Promise<boolean> {
  switch (prefix) {
    case 'BUL':
      return (await db.reportCard.findFirst({ where: { docCode: code }, select: { id: true } })) !== null;
    case 'NOT':
      return (await db.grade.findFirst({ where: { docCode: code }, select: { id: true } })) !== null;
    default:
      return (await db.medicalDocument.findFirst({ where: { docCode: code }, select: { id: true } })) !== null;
  }
}

export async function generateDocCode(prefix: DocCodePrefix): Promise<string> {
  const yy = YEAR();

  for (let attempt = 0; attempt < 12; attempt++) {
    const count = await countByDocCode(prefix, yy);
    const code = `${prefix}-${yy}-${String(count + 1 + attempt).padStart(4, '0')}`;
    if (!(await docCodeExists(prefix, code))) return code;
  }

  // Filet de sécurité : suffixe horodaté (quasi-impossible à collisions)
  return `${prefix}-${yy}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}
