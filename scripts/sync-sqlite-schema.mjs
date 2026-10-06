/**
 * EduGest — synchronisation du schéma SQLite miroir (app desktop).
 *
 * prisma/schema.sqlite.prisma est le miroir SQLite de prisma/schema.prisma
 * (source de vérité, provider postgresql). Lors de la conversion initiale,
 * deux attributs ont été perdus :
 *
 *   - @default(cuid()) : géré par le CLIENT Prisma (valable sous sqlite).
 *     Sans lui, `id String @id` n'a aucun default → tout create() sans id
 *     explicite est refusé (« Argument id is missing ») : élèves, paiements,
 *     seed CI, etc. cassés en local/desktop.
 *   - @updatedAt : géré aussi par le client → sans lui, updatedAt reste null.
 *
 * Ce script réintroduit ces attributs (et contrôle @default(now()) /
 * @unique / @relation / @index, déjà alignés) sans toucher aux règles de
 * conversion appliquées une fois (Json?→String?, etc.).
 *
 * Usage :
 *   node scripts/sync-sqlite-schema.mjs
 *   bunx prisma generate --schema prisma/schema.sqlite.prisma
 *   bunx prisma db push --schema prisma/schema.sqlite.prisma   (template desktop)
 */
import { readFileSync, writeFileSync } from 'node:fs';

const PG_PATH = 'prisma/schema.prisma';
const SQLITE_PATH = 'prisma/schema.sqlite.prisma';

const SYNCED_ATTRS = ['@default(cuid())', '@updatedAt'];

function parseModels(src) {
  const models = new Map();
  const re = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let m;
  while ((m = re.exec(src))) {
    const fields = new Map();
    for (const line of m[2].split('\n')) {
      const fm = line.match(/^\s+(\w+)\s+\S/);
      if (fm) fields.set(fm[1], line);
    }
    models.set(m[1], fields);
  }
  return models;
}

/** Insère `attr` avant le commentaire de fin de ligne (ou en fin de ligne). */
function insertAttr(line, attr) {
  if (line.includes(attr)) return line;
  const cm = line.match(/\s\/\/.*$/);
  if (cm) {
    const idx = line.lastIndexOf(cm[0]);
    return `${line.slice(0, idx)} ${attr}${line.slice(idx)}`;
  }
  return `${line.replace(/\s+$/, '')} ${attr}`;
}

const pgSrc = readFileSync(PG_PATH, 'utf8');
const sqSrc = readFileSync(SQLITE_PATH, 'utf8');
const pgModels = parseModels(pgSrc);

let added = 0;
const missingModels = [];

const out = sqSrc.replace(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm, (full, name, body) => {
  const pgFields = pgModels.get(name);
  if (!pgFields) {
    missingModels.push(name);
    return full;
  }
  const newBody = body
    .split('\n')
    .map((line) => {
      const fm = line.match(/^\s+(\w+)\s+\S/);
      if (!fm) return line;
      const pgLine = pgFields.get(fm[1]);
      if (!pgLine) return line;
      let res = line;
      for (const attr of SYNCED_ATTRS) {
        if (pgLine.includes(attr) && !res.includes(attr)) {
          res = insertAttr(res, attr);
          added += 1;
        }
      }
      return res;
    })
    .join('\n');
  return `model ${name} {${newBody}}`;
});

if (missingModels.length) {
  console.warn(`⚠ Modèles présents dans SQLite mais absents de Postgres : ${missingModels.join(', ')}`);
}

if (added === 0) {
  console.log('✔ schema.sqlite.prisma déjà aligné (aucun attribut à ajouter)');
} else {
  writeFileSync(SQLITE_PATH, out, 'utf8');
  console.log(`✔ ${added} attribut(s) réintroduit(s) dans ${SQLITE_PATH}`);
  console.log('→ suivre de : bunx prisma generate --schema prisma/schema.sqlite.prisma');
}
