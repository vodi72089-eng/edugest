import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { requireAuth, sanitizeError } from '@/lib/auth';

// Upload de fichiers (pièces jointes de devoirs, logos, photos de profil…).
// Les fichiers sont stockés dans <cwd>/upload/ et servis par
// GET /api/upload/[...path] — l'exécutable desktop et le serveur standalone
// utilisent donc exactement le même mécanisme, sans dépendre du dossier public.
//
// SÉCURITÉ (durcissement) :
//   1. Le type MIME DÉCLARÉ par le client n'est plus cru : les MAGIC BYTES du
//      contenu sont sniffés et doivent correspondre à la liste autorisée
//      (un .png contenant du PHP/HTML/exécutable est rejeté).
//   2. Limites par rôle : le PARENT ne peut déposer que des images
//      (photos de profil / justificatifs) — pas de PDF ni d'archives.
//   3. Quota par école : la somme des tailles des fichiers d'une école est
//      plafonnée (table UploadFile, synchronisée avec les suppressions).

const UPLOAD_DIR = path.resolve(process.cwd(), 'upload');

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'text/plain',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

// Quota disque par école (tous fichiers confondus) : 200 Mo.
const QUOTA_UPLOAD_PAR_ECOLE_OCTETS = 200 * 1024 * 1024;
const MAX_SIZE = 10 * 1024 * 1024; // 10 Mo par fichier

/** Détecte le VRAI type d'un buffer par magic bytes (pas le type déclaré). */
function sniffMimeType(buf: Buffer): string | null {
  if (buf.length < 8) return null;
  // Images
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.subarray(0, 6).toString('ascii') === 'GIF87a' || buf.subarray(0, 6).toString('ascii') === 'GIF89a') return 'image/gif';
  // Documents
  if (buf.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  // Conteneurs Office modernes (docx/xlsx = ZIP) : distinction par extension
  if (buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07)) {
    const ext = 'zipcontainer'; // résolu plus bas via le nom de fichier
    return 'zipcontainer';
  }
  // Texte : UTF-8 sans octets de contrôle exotiques (hors \t\r\n)
  let isText = true;
  const probe = buf.subarray(0, Math.min(buf.length, 512));
  for (const b of probe) {
    if (b === 0) { isText = false; break; }
    if (b < 0x09 || (b > 0x0d && b < 0x20)) { isText = false; break; }
  }
  if (isText) {
    const head = probe.toString('utf8').slice(0, 256).toLowerCase();
    if (head.includes('<svg')) return 'image/svg+xml';
    return 'text/plain';
  }
  return null;
}

function sanitizeExtension(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return /^[a-z0-9.]{1,10}$/.test(ext) ? ext : '';
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;

    const formData = await request.formData();
    const file = (formData as unknown as { get(name: string): unknown }).get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Fichier trop volumineux (max 10 Mo)' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'Fichier vide' }, { status: 400 });
    }

    const declaredMime = file.type || 'application/octet-stream';
    const buffer = Buffer.from(await file.arrayBuffer());

    // ── 1. SNIFF du vrai type (magic bytes) — le type déclaré n'est qu'un indice
    let sniffed = sniffMimeType(buffer);
    if (sniffed === 'zipcontainer') {
      // ZIP = docx / xlsx (conteneurs Office) — impossible de les distinguer
      // par magic bytes : l'extension sûre décide, sinon refus.
      const ext = sanitizeExtension(file.name);
      if (ext === '.docx') sniffed = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      else if (ext === '.xlsx') sniffed = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      else if (ext === '.xls') sniffed = 'application/vnd.ms-excel';
      else if (ext === '.doc') sniffed = 'application/msword';
      else sniffed = null;
    }
    if (!sniffed || !ALLOWED_MIME.has(sniffed)) {
      return NextResponse.json({ error: 'Contenu du fichier non autorisé (type réel non reconnu)' }, { status: 400 });
    }
    // Cohérence déclaré/réel : un « image/png » dont le contenu n'est pas du
    // PNG (ni un autre format autorisé) est un détournement → refus.
    if (declaredMime !== 'application/octet-stream' && ALLOWED_MIME.has(declaredMime) && declaredMime !== sniffed) {
      // Tolérance : les navigateurs envoient parfois text/plain pour le SVG.
      const compatible = (declaredMime === 'text/plain' && sniffed === 'image/svg+xml');
      if (!compatible) {
        return NextResponse.json({ error: 'Le type déclaré ne correspond pas au contenu du fichier' }, { status: 400 });
      }
    }

    // ── 2. Limites par rôle ─────────────────────────────────────────────────
    // Le parent n'a besoin que d'images (profil, justificatifs photo) :
    // toute autre pièce est refusée (pas de PDF/archives côté parent).
    const IMAGES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);
    if (user.role === 'PARENT' && !IMAGES.has(sniffed)) {
      return NextResponse.json({ error: 'En tant que parent, seules les images peuvent être envoyées' }, { status: 403 });
    }

    // ── 3. Quota par école (somme des tailles enregistrées) ─────────────────
    // L'école de contexte : celle du compte (les admins plateforme, schoolId
    // null, ne consomment pas de quota école).
    const schoolId = user.schoolId || null;
    if (schoolId) {
      const agg = await db.uploadFile.aggregate({ where: { schoolId }, _sum: { size: true } });
      const used = agg._sum.size || 0;
      if (used + file.size > QUOTA_UPLOAD_PAR_ECOLE_OCTETS) {
        const usedMo = Math.round(used / 1048576);
        const quotaMo = Math.round(QUOTA_UPLOAD_PAR_ECOLE_OCTETS / 1048576);
        return NextResponse.json(
          { error: `Quota de stockage de l'école atteint (${usedMo} Mo / ${quotaMo} Mo) — supprimez des fichiers ou contactez le support` },
          { status: 403 }
        );
      }
    }

    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const safeName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${sanitizeExtension(file.name)}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, safeName), buffer);

    // Traçabilité pour le quota (synchronisée avec les suppressions).
    try {
      await db.uploadFile.create({
        data: {
          fileName: safeName,
          size: file.size,
          mimeType: sniffed,
          uploaderId: user.id,
          schoolId,
        },
      });
    } catch (e) {
      // L'insertion du suivi ne doit pas faire perdre l'upload ; on journalise.
      console.error('[upload] suivi UploadFile impossible :', (e as Error)?.message);
    }

    const url = `/api/upload/${safeName}`;
    return NextResponse.json({ url, data: { url } }, { status: 201 });
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
