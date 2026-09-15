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

/** Table Prisma + champ portant le code, par préfixe. */
function tableFor(prefix: DocCodePrefix) {
  switch (prefix) {
    case 'BUL': return { delegate: db.reportCard, field: 'docCode' as const };
    case 'NOT': return { delegate: db.grade, field: 'docCode' as const };
    default: return { delegate: db.medicalDocument, field: 'docCode' as const };
  }
}

export async function generateDocCode(prefix: DocCodePrefix): Promise<string> {
  const yy = YEAR();
  const { delegate, field } = tableFor(prefix);

  for (let attempt = 0; attempt < 12; attempt++) {
    const count = await delegate.count({
      where: { [field]: { startsWith: `${prefix}-${yy}-` } },
    });
    const code = `${prefix}-${yy}-${String(count + 1 + attempt).padStart(4, '0')}`;
    const exists = await delegate.findFirst({
      where: { [field]: code },
      select: { id: true },
    });
    if (!exists) return code;
  }

  // Filet de sécurité : suffixe horodaté (quasi-impossible à collisions)
  return `${prefix}-${yy}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}
