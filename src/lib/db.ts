import { PrismaClient } from '@prisma/client';
import { PrismaNeon, PrismaNeonHTTP } from '@prisma/adapter-neon';

// Driver adapter obligatoire sur Cloudflare Workers (edge) : PrismaClient
// classique (query engine natif .so.node) y échoue.
// DATABASE_URL doit venir via env (contexte Cloudflare Workers), pas process.env.
//
// ⚠️ DEUX branches de base de données (même code, deux providers) :
//
// 1) Web / Workers → DATABASE_URL = postgresql://… (Neon)
//    Adaptateur HYBRIDE (voir plus bas) — deux contraintes workerd :
//      a) Requêtes simples → PrismaNeonHTTP (fetch Neon par requête, stateless).
//         L'alternative PrismaNeon (pool WebSocket persistante) est IMPOSSIBLE :
//         workerd interdit tout objet d'I/O créé dans le contexte d'une requête
//         d'être réutilisé par une autre :
//           « Cannot perform I/O on behalf of a different request »
//      b) Transactions → le mode HTTP les refuse (« Transactions are not supported
//         in HTTP mode »), or 5 endpoints en dépendent (webhooks paiement,
//         tickets support, parent-register). Solution : à chaque appel de
//         startTransaction, ouvrir une pool WebSocket ÉPHÉMÈRE — créée dans le
//         contexte de la requête COURANTE (donc autorisée), fermée au commit/
//         rollback. Les transactions sont rares et bornées à une requête HTTP.
//
// 2) App desktop (EXE) → DATABASE_URL = file:… (SQLite locale, better-sqlite3)
//    Le client SQLite est généré depuis prisma/schema.sqlite.prisma (60 modèles,
//    miroir du schéma Postgres). L'EXE embarque le serveur Next standalone +
//    sa base SQLite → fonctionne HORS-LIGNE. La synchronisation cloud (phase B)
//    poussera les changements locaux vers Neon quand internet est disponible.
const connectionString = process.env.DATABASE_URL || '';
if (!connectionString) {
  throw new Error(
    'DATABASE_URL manquante : définie dans .env.local (Neon) — requis sur Workers (pas de SQLite sur workerd).'
  );
}

const isSqlite = connectionString.startsWith('file:');

let db: PrismaClient;

if (isSqlite) {
  // ── Branche SQLite (app desktop) ──────────────────────────────────────────
  // Client dédié généré depuis prisma/schema.sqlite.prisma. L'URL est surchargée
  // via `datasources` (la template du schéma pointe vers ../db/, l'EXE utilise
  // %APPDATA%/EduGest/edugest.db).
  const { PrismaClient: SqlitePrismaClient } = await import('../generated/sqlite-client');
  db = new SqlitePrismaClient({
    datasources: { db: { url: connectionString } },
    log: ['error'],
  }) as unknown as PrismaClient;
} else {
  // ── Branche Neon (web / Workers) ──────────────────────────────────────────
  class NeonHybridFactory extends PrismaNeonHTTP {
    async connect() {
      const conn: any = await super.connect();

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
  db = new PrismaClient({ adapter, log: ['error'] });
}

// ── WARM-UP au chargement du module ──────────────────────────────────────────
// Initialise la connexion au chargement du module (top-level await) pour éviter
// qu'une requête attende une promesse créée dans le contexte d'une autre
// requête (annulation « hung » sous workerd). Le $connect() HTTP est suffisant
// et sans effet de bord ; un $queryRaw au chargement casse le module (retiré).
await db.$connect();

export { db };
