import { db } from '@/lib/db';

/**
 * Convocations créées par un compte disciplinaire : la direction les voit
 * via ses NOTIFICATIONS mais ne les liste pas dans son onglet et ne peut
 * pas agir dessus (ni statut, ni report).
 *
 * Note d'implémentation : `Convocation.createdBy` stocke le NOM du créateur
 * (pas son rôle, pas son id) et aucune migration n'est souhaitée (bases
 * desktop existantes). On retrouve donc le rôle actuel du créateur par
 * (schoolId + nom). Limite connue et acceptée : homonymes exacts dans la
 * même école (un compte direction portant exactement le même nom qu'un
 * compte discipline verrait ses items filtrés — cas rarissime).
 */

export function isDirectionRole(role: string | null | undefined): boolean {
  return !!role && role.startsWith('DIRECTION');
}

/** Vrai si `createdBy` correspond (nom + école) à un compte DISCIPLINE_* actif. */
export async function isDisciplineCreated(
  schoolId: string,
  createdBy: string | null | undefined
): Promise<boolean> {
  if (!schoolId || !createdBy) return false;
  const creator = await db.user.findFirst({
    where: { schoolId, name: createdBy, role: { startsWith: 'DISCIPLINE' } },
    select: { id: true },
  });
  return !!creator;
}

/** Parmi des noms de créateurs, ceux qui sont des comptes DISCIPLINE_* (lot). */
export async function disciplineCreatorNames(
  schoolId: string,
  names: (string | null | undefined)[]
): Promise<Set<string>> {
  const unique = [...new Set(names.filter((n): n is string => !!n))];
  if (!schoolId || unique.length === 0) return new Set();
  const creators = await db.user.findMany({
    where: { schoolId, name: { in: unique }, role: { startsWith: 'DISCIPLINE' } },
    select: { name: true },
  });
  return new Set(creators.map((c) => c.name));
}
