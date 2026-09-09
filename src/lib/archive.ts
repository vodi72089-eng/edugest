import { db } from './db';
import { getTierLimits } from './subscription';

/**
 * Archive les élèves excédentaires quand l'admin change de tier (downgarde).
 * Archive les élèves les plus anciens en premier.
 */
export async function archiveExcessStudents(
  schoolId: string,
  newTier: string
): Promise<{ archived: number }> {
  const limits = getTierLimits(newTier);
  const currentActive = await db.student.count({
    where: { schoolId, isArchived: false },
  });

  if (currentActive <= limits.maxStudents) {
    return { archived: 0 };
  }

  const excess = currentActive - limits.maxStudents;
  
  // Trouver les élèves actifs les plus anciens à archiver
  const studentsToArchive = await db.student.findMany({
    where: { schoolId, isArchived: false },
    orderBy: { createdAt: 'asc' },
    take: excess,
    select: { id: true },
  });

  if (studentsToArchive.length === 0) {
    return { archived: 0 };
  }

  // Archiver en lot
  const ids = studentsToArchive.map(s => s.id);
  await db.student.updateMany({
    where: { id: { in: ids } },
    data: {
      isArchived: true,
      archivedAt: new Date(),
    },
  });

  return { archived: ids.length };
}

/**
 * Restaure les élèves archivés quand l'admin upgarde de tier.
 * Restaure les élèves archivés les plus récents en premier.
 */
export async function restoreArchivedStudents(
  schoolId: string,
  newTier: string
): Promise<{ restored: number }> {
  const limits = getTierLimits(newTier);
  const currentActive = await db.student.count({
    where: { schoolId, isArchived: false },
  });

  const archivedCount = await db.student.count({
    where: { schoolId, isArchived: true },
  });

  if (archivedCount === 0) {
    return { restored: 0 };
  }

  // Combien peut-on restaurer ?
  const availableSpace = limits.maxStudents - currentActive;
  const toRestore = Math.min(availableSpace, archivedCount);

  if (toRestore <= 0) {
    return { restored: 0 };
  }

  // Trouver les élèves archivés les plus récents à restaurer
  const studentsToRestore = await db.student.findMany({
    where: { schoolId, isArchived: true },
    orderBy: { archivedAt: 'desc' },
    take: toRestore,
    select: { id: true },
  });

  if (studentsToRestore.length === 0) {
    return { restored: 0 };
  }

  // Restaurer en lot
  const ids = studentsToRestore.map(s => s.id);
  await db.student.updateMany({
    where: { id: { in: ids } },
    data: {
      isArchived: false,
      archivedAt: null,
    },
  });

  return { restored: ids.length };
}

/**
 * Récupère la liste des élèves archivés d'une école.
 */
export async function getArchivedStudents(schoolId: string) {
  return db.student.findMany({
    where: { schoolId, isArchived: true },
    orderBy: { archivedAt: 'desc' },
    include: {
      class: { select: { id: true, name: true } },
      parent: { select: { id: true, name: true, email: true } },
    },
  });
}
