import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getUploadStorage } from '@/lib/upload-store';

// Sert les fichiers uploadés via POST /api/upload (modes R2 et disque ; les
// data URI ≤ 4 Mo sont autoportants et ne transitent pas par cette route).
// Accès public (comme un dossier statique) : logos et pièces jointes de
// devoirs doivent être consultables par les parents. Le chemin est
// strictement assaini contre toute traversal (pas de "..", pas de
// sous-dossiers, nom borné).

const UPLOAD_DIR = path.resolve(process.cwd(), 'upload');

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

// SÉCURITÉ (XSS/XST) : un SVG peut embarquer du JavaScript exécutable à
// l'ouverture directe (same-origin). Il est donc servi en pièce jointe
// (téléchargement) + sandbox CSP au lieu d'un rendu inline. Les usages
// <img src> restent fonctionnels.
function fileHeaders(contentType: string, name: string, isSvg: boolean): Record<string, string> {
  return {
    'Content-Type': contentType,
    'Content-Disposition': `${isSvg ? 'attachment' : 'inline'}; filename="${name}"`,
    'Cache-Control': 'public, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
    ...(isSvg ? { 'Content-Security-Policy': "sandbox; default-src 'none'" } : {}),
  };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const { path: segments } = await params;
    if (!segments || segments.length !== 1) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const name = segments[0];
    // Nom assaini : uniquement alphanumérique + . _ - (jamais de traversal)
    if (!/^[a-zA-Z0-9._-]{1,120}$/.test(name) || name.includes('..')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // ── Mode R2 (web, fichiers > 4 Mo) ──────────────────────────────────────
    const storage = await getUploadStorage();
    if (storage.bucket) {
      const object = await storage.bucket.get(name);
      if (!object) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      const ext = path.extname(name).toLowerCase();
      const contentType = object.httpMetadata?.contentType || MIME_BY_EXT[ext] || 'application/octet-stream';
      return new NextResponse(object.body, {
        headers: fileHeaders(contentType, name, contentType === 'image/svg+xml'),
      });
    }

    // ── Mode disque (EXE desktop / serveur Node local) ──────────────────────
    const filePath = path.join(UPLOAD_DIR, name);
    if (!filePath.startsWith(UPLOAD_DIR) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const ext = path.extname(name).toLowerCase();
    const contentType = MIME_BY_EXT[ext] || 'application/octet-stream';
    const buffer = fs.readFileSync(filePath);
    return new NextResponse(new Uint8Array(buffer), {
      headers: fileHeaders(contentType, name, ext === '.svg'),
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
