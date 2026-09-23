import { db } from '../src/lib/db';
import { archiveExcessStudents, restoreArchivedStudents, getArchivedStudents } from '../src/lib/archive';

async function testArchive() {
  console.log('=== Test Archivage ===');
  
  // Trouver une école
  const school = await db.school.findFirst();
  if (!school) {
    console.log('Aucune école trouvée. Lancez le seed d\'abord.');
    return;
  }
  
  console.log(`École: ${school.name} (Tier: ${school.subscriptionTier})`);
  
  // Compter les élèves actifs
  const activeCount = await db.student.count({
    where: { schoolId: school.id, isArchived: false },
  });
  console.log(`Élèves actifs: ${activeCount}`);
  
  // Tester archivage vers FREEMIUM (100 max)
  console.log('\n--- Test archivage vers FREEMIUM ---');
  const result = await archiveExcessStudents(school.id, 'FREEMIUM');
  console.log(`Archivés: ${result.archived}`);
  
  // Vérifier les archivés
  const archived = await getArchivedStudents(school.id);
  console.log(`Total archivés: ${archived.length}`);
  
  // Tester restauration vers ESSENTIEL (500 max)
  console.log('\n--- Test restauration vers ESSENTIEL ---');
  const restoreResult = await restoreArchivedStudents(school.id, 'ESSENTIEL');
  console.log(`Restaurés: ${restoreResult.restored}`);
  
  console.log('\n=== Tests terminés ===');
}

testArchive().catch(console.error);
