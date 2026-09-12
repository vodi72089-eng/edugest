// Synchronise les cartes de tarifs en DB avec la nouvelle spécification produit
// (une seule exécution manuelle — n'est pas lancée au démarrage du serveur)
import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const UPDATES: Record<string, { features: string; description?: string; isPopular?: boolean }> = {
  FREEMIUM: { features: '1 admin,100 élèves max,0 msg WhatsApp,Gestion basique' },
  ESSENTIEL: {
    features: '1 admin,5 professeurs,250 élèves max,Comptes parents,500 msg WhatsApp/mois,Sans notes/bulletins aux parents',
    description: 'Pour les petites structures',
  },
  STANDARD: {
    features: '5 admins (secrétariat, admin école, caissier, direction, discipline),25 professeurs,1000 élèves max,1500 msg WhatsApp/mois,Notes & bulletins envoyés aux parents,Paiements mobiles',
    description: 'Le choix des écoles',
  },
  PREMIUM: {
    features: 'Admins illimités,Profs illimités,2500 élèves max,5000 msg WhatsApp/mois,App mobile dédiée,Personnalisation de l\'app,Support prioritaire',
    description: 'Pour les grands établissements',
  },
  ENTERPRISE: {
    features: 'Multi-écoles (3 incluses),9999 admins,99999 élèves (total écoles),Messages WhatsApp illimités,Serveur dédié,Formation équipe,SLA garanti',
    description: 'Multi-écoles',
  },
  CORPORATE: {
    features: 'Admins illimités,Élèves illimités,Écoles illimitées,Messages WhatsApp illimités,Groupes scolaires,Sur mesure,On-premise,Marque blanche,Intégration sur mesure',
    description: 'Groupes scolaires',
  },
};

async function main() {
  for (const [tier, data] of Object.entries(UPDATES)) {
    const res = await db.pricingPlan.updateMany({ where: { tier }, data });
    console.log(`${tier}: ${res.count} ligne(s) mise(s) à jour`);
  }
  // maxStudents des écoles : valeur indicative de la DB, alignée sur le forfait
  // (la limite réelle est appliquée via getTierLimits côté API)
  console.log('OK');
}

main().finally(() => db.$disconnect());
