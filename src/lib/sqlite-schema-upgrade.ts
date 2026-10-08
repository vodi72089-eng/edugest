/**
 * Migration de schéma ADDITIVE pour la base SQLite locale de l'app desktop.
 *
 * Contexte (constaté le 07/10/2026 sur l'installation réelle) :
 * `desktop/main.js` ne recopie `template.db` que si la base N'EXISTE PAS
 * (« la base existante n'est jamais écrasée »). Une base créée par une version
 * antérieure de l'EXE conserve donc un schéma ancien à vie :
 *
 *   - `RateLimitBucket` absent  → `checkRateLimitDb` échoue → fail-closed →
 *     429 « Trop de tentatives » SUR CHAQUE tentative de connexion :
 *     impossible de se connecter à l'EXE (et la fenêtre ne se libère jamais,
 *     car la limite est rejouée à chaque essai).
 *   - `ReportSchedule` absent   → balayage du planificateur en P2021 (log).
 *   - 18 tables et 5 colonnes manquantes au total sur une base du 13/09.
 *
 * Cette module compare la base vivante au template embarqué
 * (`db/desktop-template.db`, régénéré à chaque build CI depuis
 * `prisma/schema.sqlite.prisma`) et n'exécute QUE des ajouts :
 *
 *   1. `CREATE TABLE IF NOT EXISTS`  — tables absentes (ordre topologique FK)
 *   2. `ALTER TABLE … ADD COLUMN`    — colonnes absentes
 *   2bis. Reconstruction de table   — colonnes `NOT NULL` dans la base vivante
 *         mais NULLABLE dans le template (cas `User.schoolId` : la colonne
 *         NOT NULL empêchait la réparation d'intégrité des rôles d'envoyer
 *         `schoolId = null` au SUPER_ADMIN_GLOBAL → violation de contrainte à
 *         chaque connexion). SQLite ne sait pas retirer une contrainte :
 *         on reconstruit la table (DDL du template, INSERT des colonnes
 *         communes, DROP + RENAME, index recréés) dans UNE transaction,
 *         clés étrangères désactivées, avec `integrity_check` ensuite.
 *   3. `CREATE [UNIQUE] INDEX IF NOT EXISTS` — index absents
 *
 * Aucun DROP hors de cette reconstruction contrôlée, aucune perte de ligne
 * (INSERT SELECT de toutes les colonnes communes) : les données sont
 * conservées.
 * L'opération est idempotente (relue à chaque démarrage, reprise si un
 * tour a échoué). Tout échec est journalisé EXPLICITEMENT — jamais de
 * fallback silencieux.
 */

import { db } from './db';

type SqliteMasterRow = { name: string; type: string; sql: string | null };
type TableColumn = { name: string; type: string; notnull: number; dflt_value: string | null; pk: number };
type ForeignKeyRow = { table: string; from: string };

/**
 * Découpe le corps d'un `CREATE TABLE` en fragments de colonnes en respectant
 * les guillemets et les parenthèses imbriquées (contraintes de table incluses).
 * Retourne le fragment TEXTUEL EXACT de chaque colonne (fidèle au template).
 */
function columnFragments(createSql: string): Map<string, string> {
  const out = new Map<string, string>();
  const start = createSql.indexOf('(');
  const end = createSql.lastIndexOf(')');
  if (start < 0 || end <= start) return out;

  const body = createSql.slice(start + 1, end);
  const parts: string[] = [];
  let depth = 0;
  let inString = false;
  let current = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "'") inString = !inString;
    if (!inString) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ',' && depth === 0) {
        parts.push(current);
        current = '';
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);

  for (const raw of parts) {
    const fragment = raw.trim();
    // Seules les définitions de colonnes commencent par un nom entre guillemets ;
    // `CONSTRAINT …`, `PRIMARY KEY (…)`, `FOREIGN KEY (…)`, `UNIQUE (…)` sont
    // des éléments de TABLE et n'intéressent pas un ALTER.
    const m = /^"((?:[^"]|"")+)"\s+/.exec(fragment);
    if (m) out.set(m[1].replace(/""/g, '"'), fragment);
  }
  return out;
}

/** Requête brute typée sur la base LOCALE. */
async function queryLocal<T>(sql: string): Promise<T[]> {
  return (await db.$queryRawUnsafe(sql)) as T[];
}

/** Client Prisma minimal utilisé en lecture sur le template embarqué. */
type TemplateClient = { $queryRawUnsafe: (q: string) => Promise<unknown>; $disconnect: () => Promise<unknown> };

/** Requête brute typée sur le TEMPLATE (client Prisma dédié, lecture seule). */
async function queryTemplate<T>(client: TemplateClient, sql: string): Promise<T[]> {
  return (await client.$queryRawUnsafe(sql)) as T[];
}

/**
 * Aligne la base locale courante sur le template embarqué (ajouts uniquement).
 * No-op explicite si `DATABASE_URL` n'est pas SQLite (site Neon/Workers).
 */
export async function upgradeLocalSqliteSchema(): Promise<void> {
  const url = process.env.DATABASE_URL || '';
  if (!url.startsWith('file:')) return; // site web : hors périmètre (Neon = prisma db push)

  // Template : fourni par main.js (Electron, qui dispose de fs) via
  // EDUGEST_TEMPLATE_DB ; en dev on le construit depuis process.cwd()
  // (racine du dépôt). AUCUN import node:fs / node:path dans ce module :
  // le tracing standalone de Next nommerait le chunk
  // « [externals]_node:path_….js » — le caractère « : » est invalide dans un
  // nom de fichier Windows et fait échouer le build desktop (EINVAL copyfile).
  const templatePath = process.env.EDUGEST_TEMPLATE_DB || `${process.cwd()}/db/desktop-template.db`;
  if (!templatePath) {
    console.warn(
      '[schema] Template SQLite introuvable — migration de schéma locale NON ' +
        'exécutée. Base laissée en l’état : connexion et planificateur peuvent ' +
        'échouer si le schéma est ancien.',
    );
    return;
  }

  const { PrismaClient: SqliteClient } = await import('../generated/sqlite-client');
  const tpl = new SqliteClient({
    datasources: { db: { url: `file:${templatePath}` } },
    log: [],
  });

  let createdTables = 0;
  let addedColumns = 0;
  let createdIndexes = 0;
  let realignedTables = 0;
  const failures: string[] = [];

  try {
    const tplMaster = await queryTemplate<SqliteMasterRow>(
      tpl,
      'SELECT name, type, sql FROM sqlite_master',
    );
    const liveMaster = await queryLocal<SqliteMasterRow>(
      'SELECT name, type, sql FROM sqlite_master',
    );

    const liveTableNames = new Set(liveMaster.filter((r) => r.type === 'table').map((r) => r.name));
    const tplTables = tplMaster.filter((r) => r.type === 'table' && !r.name.startsWith('sqlite_'));
    const liveIndexNames = new Set(liveMaster.filter((r) => r.type === 'index').map((r) => r.name));

    // ── 1) Tables absentes, dans l'ordre des clés étrangères ────────────────
    const missingTables = tplTables.filter((t) => !liveTableNames.has(t.name));
    if (missingTables.length > 0) {
      const missingNames = new Set(missingTables.map((t) => t.name));
      const deps = new Map<string, string[]>();
      for (const t of missingTables) {
        const fks = await queryTemplate<ForeignKeyRow>(tpl, `PRAGMA foreign_key_list("${t.name}")`);
        deps.set(t.name, [...new Set(fks.map((f) => f.table))].filter((p) => missingNames.has(p)));
      }
      // Tri topologique (Kahn) : une table référencée est créée avant sa table fille.
      const ordered: string[] = [];
      const remaining = new Set(missingNames);
      while (remaining.size > 0) {
        const ready = [...remaining].filter((n) => (deps.get(n) || []).every((d) => !remaining.has(d)));
        if (ready.length === 0) { // cycle (SQLite les autorise) : on vide dans l'ordre
          ready.push(...remaining);
        }
        for (const n of ready) {
          ordered.push(n);
          remaining.delete(n);
        }
      }

      const ddlByName = new Map(tplTables.map((t) => [t.name, t.sql || '']));
      for (const name of ordered) {
        const ddl = (ddlByName.get(name) || '').replace(/^CREATE TABLE /, 'CREATE TABLE IF NOT EXISTS ');
        if (!ddl) { failures.push(`table ${name} : DDL introuvable dans le template`); continue; }
        try {
          await db.$executeRawUnsafe(ddl);
          createdTables++;
        } catch (e) {
          failures.push(`table ${name} : ${(e as Error)?.message}`);
        }
      }
    }

    // ── 2) Colonnes absentes des tables présentes des deux côtés ────────────
    const tplDdlByTable = new Map(tplTables.map((t) => [t.name, t.sql || '']));
    const commonTables = tplTables.filter((t) => liveTableNames.has(t.name));
    for (const table of commonTables) {
      const tplCols = await queryTemplate<TableColumn>(tpl, `PRAGMA table_info("${table.name}")`);
      const liveCols = await queryLocal<TableColumn>(`PRAGMA table_info("${table.name}")`);
      const liveColNames = new Set(liveCols.map((c) => c.name));
      const missingCols = tplCols.filter((c) => !liveColNames.has(c.name));
      if (missingCols.length === 0) continue;

      const fragments = columnFragments(tplDdlByTable.get(table.name) || '');
      for (const col of missingCols) {
        const fragment = fragments.get(col.name);
        if (!fragment) {
          failures.push(`colonne ${table.name}.${col.name} : fragment DDL introuvable`);
          continue;
        }
        // SQLite refuse ADD COLUMN PRIMARY KEY, et NOT NULL sans valeur par défaut.
        if (/\bPRIMARY KEY\b/i.test(fragment)) {
          failures.push(`colonne ${table.name}.${col.name} : PRIMARY KEY non ajoutable (migration manuelle requise)`);
          continue;
        }
        if (/\bNOT NULL\b/i.test(fragment) && col.dflt_value === null) {
          failures.push(`colonne ${table.name}.${col.name} : NOT NULL sans défaut non ajoutable (migration manuelle requise)`);
          continue;
        }
        let statement = `ALTER TABLE "${table.name}" ADD COLUMN ${fragment}`;
        let uniqueIndex: string | null = null;
        if (/\bUNIQUE\b/i.test(fragment)) {
          statement = `ALTER TABLE "${table.name}" ADD COLUMN ${fragment.replace(/\bUNIQUE\b\s*/i, '')}`;
          uniqueIndex = `CREATE UNIQUE INDEX IF NOT EXISTS "${table.name}_${col.name}_key" ON "${table.name}"("${col.name}")`;
        }
        try {
          await db.$executeRawUnsafe(statement);
          addedColumns++;
          if (uniqueIndex) {
            await db.$executeRawUnsafe(uniqueIndex);
            createdIndexes++;
          }
        } catch (e) {
          failures.push(`colonne ${table.name}.${col.name} : ${(e as Error)?.message}`);
        }
      }
    }

    // ── 2bis) Colonnes NOT NULL dans la base vivante mais NULLABLE dans le
    //         template → reconstruction de table dans UNE transaction. ──────
    // Cas constaté : `User.schoolId` NOT NULL (ancien schéma) alors que
    // Prisma attend `String?` — la réparation d'intégrité des rôles envoyait
    // `schoolId: null` et se heurtait à une violation de contrainte à chaque
    // connexion SUPER_ADMIN_GLOBAL. SQLite ne sait pas altérer une contrainte.
    for (const table of commonTables) {
      const tplColsNow = await queryTemplate<TableColumn>(tpl, `PRAGMA table_info("${table.name}")`);
      const liveColsNow = await queryLocal<TableColumn>(`PRAGMA table_info("${table.name}")`);
      const liveByName = new Map(liveColsNow.map((c) => [c.name, c]));
      // Prisma/SQLite expose les INTEGER du PRAGMA en BigInt (1n !== 1) :
      // toute comparaison numérique passe par Number().
      const narrowed = tplColsNow.filter(
        (c) =>
          Number(c.pk) === 0 &&
          Number(liveByName.get(c.name)?.notnull ?? 0) === 1 &&
          Number(c.notnull) === 0,
      );
      if (narrowed.length === 0) continue;

      const ddl = tplDdlByTable.get(table.name) || '';
      const migName = `_mig_${table.name}`;
      const migDdl = ddl.replace(
        /^CREATE TABLE\s+(?:"[^"]+"|[A-Za-z_][\w]*)/,
        `CREATE TABLE "${migName}"`,
      );
      if (!ddl || migDdl === ddl) {
        failures.push(
          `contrainte ${table.name}.${narrowed.map((c) => c.name).join(',')} : DDL template introuvable ` +
            `— colonne laissée NOT NULL (migration manuelle requise)`,
        );
        continue;
      }

      const liveMasterRow = await queryLocal<SqliteMasterRow>(
        `SELECT name, type, sql FROM sqlite_master WHERE type='table' AND name = '${table.name}'`,
      );
      const liveDdl = liveMasterRow[0]?.sql || '';
      const liveFragments = columnFragments(liveDdl);
      // Colonnes présentes uniquement dans l'ancien schéma : recréées telles
      // quelles sur la table de travail pour ne JAMAIS perdre de données.
      const liveOnly = liveColsNow.filter((c) => !tplColsNow.some((t) => t.name === c.name));
      const brokenLiveOnly = liveOnly.filter((c) => /\bPRIMARY KEY\b/i.test(liveFragments.get(c.name) || ''));
      if (brokenLiveOnly.length > 0) {
        failures.push(
          `contrainte ${table.name} : colonne(s) héritée(s) ${brokenLiveOnly
            .map((c) => c.name)
            .join(',')} en PRIMARY KEY — reconstruction impossible (migration manuelle requise)`,
        );
        continue;
      }

      const liveIdxSql = (
        await queryLocal<SqliteMasterRow>(
          `SELECT name, type, sql FROM sqlite_master WHERE type = 'index' ` +
            `AND tbl_name = '${table.name}' AND sql IS NOT NULL`,
        )
      )
        .map((r) => r.sql)
        .filter((s): s is string => !!s);

      const steps: string[] = [
        `DROP TABLE IF EXISTS "${migName}"`,
        migDdl,
        ...liveOnly.map((c) => `ALTER TABLE "${migName}" ADD COLUMN ${liveFragments.get(c.name)}`),
        (() => {
          const cols = liveColsNow.map((c) => `"${c.name}"`).join(', ');
          return `INSERT INTO "${migName}" (${cols}) SELECT ${cols} FROM "${table.name}"`;
        })(),
        `DROP TABLE "${table.name}"`,
        `ALTER TABLE "${migName}" RENAME TO "${table.name}"`,
        ...liveIdxSql.map((s) => s.replace(/^CREATE (UNIQUE )?INDEX /, 'CREATE $1INDEX IF NOT EXISTS ')),
      ];

      try {
        // Clés étrangères : 16 tables peuvent référencer `User` (dont la
        // reconstruction ci-dessus) — DROP refusé sinon. Hors transaction
        // (pragma no-op à l'intérieur), remise à ON dans le `finally`.
        await db.$executeRawUnsafe('PRAGMA foreign_keys = OFF');
        await db.$transaction(steps.map((s) => db.$executeRawUnsafe(s)));
        realignedTables++;

        const integrity = await queryLocal<{ integrity_check: string }>('PRAGMA integrity_check');
        const violations = await queryLocal<unknown>('PRAGMA foreign_key_check');
        if (integrity[0]?.integrity_check !== 'ok' || violations.length > 0) {
          failures.push(
            `contrainte ${table.name} : vérification post-reconstruction échouée ` +
              `(integrity=${integrity[0]?.integrity_check}, fk=${violations.length})`,
          );
        } else {
          const aligned = (await queryLocal<TableColumn>(`PRAGMA table_info("${table.name}")`)).find(
            (c) => c.name === narrowed[0].name,
          );
          if (!aligned || Number(aligned.notnull) !== 0) {
            failures.push(`contrainte ${table.name}.${narrowed[0].name} : toujours NOT NULL après reconstruction`);
          }
        }
      } catch (e) {
        failures.push(
          `contrainte ${table.name}.${narrowed.map((c) => c.name).join(',')} : ${(e as Error)?.message}`,
        );
      } finally {
        await db.$executeRawUnsafe('PRAGMA foreign_keys = ON').catch(() => undefined);
      }
    }

    // ── 3) Index absents (tables anciennes comme nouvelles) ─────────────────
    const tplIndexes = tplMaster.filter((r) => r.type === 'index' && r.sql);
    for (const idx of tplIndexes) {
      if (liveIndexNames.has(idx.name)) continue;
      const ddl = (idx.sql as string).replace(
        /^CREATE (UNIQUE )?INDEX /,
        'CREATE $1INDEX IF NOT EXISTS ',
      );
      try {
        await db.$executeRawUnsafe(ddl);
        createdIndexes++;
      } catch (e) {
        failures.push(`index ${idx.name} : ${(e as Error)?.message}`);
      }
    }
  } finally {
    await tpl.$disconnect().catch(() => undefined);
  }

  if (createdTables || addedColumns || createdIndexes || realignedTables) {
    console.log(
      `[schema] Migration additive de la base locale : ${createdTables} table(s), ` +
        `${addedColumns} colonne(s), ${createdIndexes} index créés` +
        (realignedTables ? `, ${realignedTables} table(s) reconstruite(s) pour assouplir NOT NULL` : '') +
        ` (template : ${templatePath}).`,
    );
  }
  if (failures.length > 0) {
    // Échec PARTIEL visible dans desktop.log — la reprise est automatique au
    // prochain démarrage (l'opération est idempotente).
    console.error(
      `[schema] Migration additive INCOMPLÈTE (${failures.length} échec) — reprise au ` +
        `prochain démarrage. Détails : ${failures.join(' | ')}`,
    );
  }
}
