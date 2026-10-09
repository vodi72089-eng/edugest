// Lecture du registre de vérification des documents — module VOLONTAIREMENT
// séparé de document-verify.ts.
//
// Pourquoi : la page publique /verify/document/[code] importait directement
// document-verify.ts, ce qui embarquait QRCode (lourd, inutile ici — le QR n'est
// généré que par les routes PDF). Sur Cloudflare Workers, chaque import de module
// dynamique s'évalue dans le contexte de la PREMIÈRE requête qui le déclenche :
// si cette requête est annulée par workerd (« your Worker's code had hung »),
// la promesse d'import reste pendante à jamais et l'ISOLAT EST DÉFINITIVEMENT
// BLOQUÉ pour cette route (toutes les requêtes suivantes retournent 500/1101
// jusqu'au recyclage). En ne gardant que `db` (déjà chargé par TOUTES les routes
// API dès le premier appel authentifié), le graphe de la page devient minuscule
// et s'évalue en quelques ms : fenêtre d'annulation quasi nulle.
//
// Référence : même mécanisme documenté sur prisma/prisma#30255,
// Effect-TS/effect#6319 et cloudflare/workerd#210 (promesse mémoïsée créée
// dans une requête annulée → isolat « wedged »).
import { db } from '@/lib/db';

/** Lit un enregistrement de vérification par son code (utilisé par la page publique). */
export async function getVerificationRecord(code: string) {
  return db.documentVerification.findUnique({
    where: { id: code },
    include: {
      school: {
        select: { name: true, shortName: true, logo: true, address: true, city: true, country: true },
      },
    },
  });
}
