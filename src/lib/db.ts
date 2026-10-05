import { PrismaClient } from '@prisma/client';
import { PrismaNeon, PrismaNeonHTTP } from '@prisma/adapter-neon';

// Driver adapter obligatoire sur Cloudflare Workers (edge) : PrismaClient
// classique (query engine natif .so.node) y échoue.
// DATABASE_URL doit venir via env (contexte Cloudflare Workers), pas process.env.
//
// ⚠️ Architecture HYBRIDE (voir plus bas) — deux contraints workerd :
//
// 1) Requêtes simples → PrismaNeonHTTP (fetch Neon par requête, stateless).
//    L'alternative PrismaNeon (pool WebSocket persistante) est IMPOSSIBLE :
//    workerd interdit tout objet d'I/O créé dans le contexte d'une requête
//    d'être réutilisé par une autre :
//      « Cannot perform I/O on behalf of a different request »
//    constaté en local : /api/health alternait 200 / 503 (timeout 4 s).
//
// 2) Transactions → le mode HTTP les refuse (« Transactions are not supported
//    in HTTP mode »), or 5 endpoints en dépendent (webhooks paiement,
//    tickets support, parent-register). Solution : à chaque appel de
//    startTransaction, ouvrir une pool WebSocket ÉPHÉMÈRE — créée dans le
//    contexte de la requête COURANTE (donc autorisée), fermée au commit/
//    rollback. Les transactions sont rares et bornées à une requête HTTP.
const connectionString = process.env.DATABASE_URL || '';
if (!connectionString) {
  throw new Error(
    'DATABASE_URL manquante : définie dans .env.local (Neon) — requis sur Workers (pas de SQLite sur workerd).'
  );
}

class NeonHybridFactory extends PrismaNeonHTTP {
  async connect() {
    const conn = await super.connect();

    // ── DIAGNOSTIC : log chaque requête SQL (durée + SQL tronqué) ──────────
    // Permet de voir quelle requête reste bloquée (START sans OK/ERR) quand
    // workerd annule une requête « hung ». À retirer une fois le problème résolu.
    const origPerformIO = conn.performIO.bind(conn);
    let queryCount = 0;
    conn.performIO = async (query: { sql?: string }) => {
      const id = ++queryCount;
      const start = Date.now();
      const sql = (query.sql || '').replace(/\s+/g, ' ').slice(0, 90);
      console.log(`[DB] #${id} START ${sql}`);
      try {
        const result = await origPerformIO(query);
        console.log(`[DB] #${id} OK ${Date.now() - start}ms`);
        return result;
      } catch (e) {
        console.log(`[DB] #${id} ERR ${Date.now() - start}ms ${String((e as Error)?.message).slice(0, 120)}`);
        throw e;
      }
    };

    // Remplace uniquement startTransaction : tout le reste (queryRaw,
    // executeRaw, dispose…) reste en HTTP stateless.
    const startWsTransaction: typeof conn.startTransaction = async (isolationLevel) => {
      const wsFactory = new PrismaNeon({ connectionString });
      const wsConn = await wsFactory.connect();
      let closed = false;
      const close = async () => {
        if (closed) return;
        closed = true;
        await wsConn.dispose(); // termine la pool (client.end())
      };
      try {
        const tx = await wsConn.startTransaction(isolationLevel);
        const origCommit = tx.commit.bind(tx);
        const origRollback = tx.rollback.bind(tx);
        tx.commit = async () => {
          try {
            await origCommit();
          } finally {
            await close();
          }
        };
        tx.rollback = async () => {
          try {
            await origRollback();
          } finally {
            await close();
          }
        };
        return tx;
      } catch (e) {
        await close();
        throw e;
      }
    };
    conn.startTransaction = startWsTransaction;
    return conn;
  }
}

const adapter = new NeonHybridFactory(connectionString, {});

export const db = new PrismaClient({ adapter, log: ['error'] });

// ── WARM-UP au chargement du module ──────────────────────────────────────────
// Initialise la connexion au chargement du module (top-level await) pour éviter
// qu'une requête attende une promesse créée dans le contexte d'une autre
// requête (annulation « hung » sous workerd). Le $connect() HTTP est suffisant
// et sans effet de bord ; un $queryRaw au chargement casse le module (retiré).
await db.$connect();
