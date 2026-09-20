import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { requireAuth, sanitizeError } from '@/lib/auth';

// Upload de fichiers (pièces jointes de devoirs, logos, photos de profil…).
// Les fichiers sont stockés dans <cwd>/upload/ et servis par
// GET /api/upload/[...path] — l'exécutable desktop et le serveur standalone
// utilisent donc exactement le même mécanisme, sans dépendre du dossier public.

export const UPLOAD_DIR = path.resolve(process.cwd(), 'upload');

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
const MAX_SIZE = 10 * 1024 * 1024; // 10 Mo

function sanitizeExtension(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return /^[a-z0-9.]{1,10}$/.test(ext) ? ext : '';
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request);
    if ('error' in authResult) return authResult.error;

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Fichier trop volumineux (max 10 Mo)' }, { status: 400 });
    }
    const mime = file.type || 'application/octet-stream';
    if (!ALLOWED_MIME.has(mime)) {
      return NextResponse.json({ error: 'Format de fichier non supporté' }, { status: 400 });
    }

    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const safeName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${sanitizeExtension(file.name)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(path.join(UPLOAD_DIR, safeName), buffer);

    const url = `/api/upload/${safeName}`;
    return NextResponse.json({ url, data: { url } }, { status: 201 });
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 });
  }
}
