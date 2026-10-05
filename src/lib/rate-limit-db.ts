import { db } from '@/lib/db';

// ─── Rate-limiting PERSISTANT (base de données) ──────────────────────────────
// L'ancien limiteur (checkRateLimit) vivait dans une Map mémoire : chaque
// redémarrage du serveur remettait les compteurs à zéro — un attaquant pouvait
// simplement attendre (ou provoquer) un restart pour repartir de zéro.
// Ici les compteurs vivent dans la table RateLimitBucket (fenêtre fixe) :
//   - 1er appel dans la fenêtre → autorisé, compteur = 1, resetAt = now + fenêtre
//   - compteur >= max et fenêtre non écoulée → refus (false)
//   - fenêtre écoulée → compteur réinitialisé
// Le nettoyage des seaux expirés est opportuniste (à chaque appel, faible
// probabilité) pour ne pas gonfler la table sans cron.

const CLEANUP_PROBABILITY = 0.02; // ~2 % des appels purgent les seaux expirés

export async function checkRateLimitDb(key: string, maxRequests: number, windowMs: number): Promise<boolean> {
  const now = new Date();
  try {
    const bucket = await db.rateLimitBucket.findUnique({ where: { key } });
    if (!bucket || bucket.resetAt.getTime() <= now.getTime()) {
      // Nouveau seau (ou fenêtre écoulée) : première requête est toujours autorisée.
      await db.rateLimitBucket.upsert({
        where: { key },
        create: { key, count: 1, resetAt: new Date(now.getTime() + windowMs) },
        update: { count: 1, resetAt: new Date(now.getTime() + windowMs) },
      });
      void purgeExpiredBuckets();
      return true;
    }
    if (bucket.count >= maxRequests) {
      return false;
    }
    // Increment atomique (évite la course entre deux requêtes simultanées).
    await db.rateLimitBucket.update({ where: { key }, data: { count: { increment: 1 } } });
    return true;
  } catch (e) {
    // La base indisponible ne doit PAS ouvrir le robinet silencieusement :
    // en cas d'échec du compteur on refuse par prudence (fail-closed) —
    // l'utilisateur peut réessayer une fois la base revenue.
    console.error('[rate-limit-db] compteur indisponible, refus par prudence :', (e as Error)?.message);
    return false;
  }
}

/** Purge opportuniste des seaux expirés (allège la table, non bloquant). */
async function purgeExpiredBuckets(): Promise<void> {
  try {
    if (Math.random() < CLEANUP_PROBABILITY) {
      await db.rateLimitBucket.deleteMany({ where: { resetAt: { lte: new Date() } } });
    }
  } catch { /* non critique */ }
}

/** Nombre de tentatives restantes avant refus (pour les messages d'erreur). */
export async function remainingRateLimit(key: string, maxRequests: number): Promise<number> {
  try {
    const bucket = await db.rateLimitBucket.findUnique({ where: { key } });
    if (!bucket || bucket.resetAt.getTime() <= Date.now()) return maxRequests;
    return Math.max(0, maxRequests - bucket.count);
  } catch {
    return 0;
  }
}
