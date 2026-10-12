import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const REPO = 'vodi72089-eng/edugest';
const FALLBACK_VERSION = '1.4.25';
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

type ExeKind = 'setup' | 'portable';

async function resolveLatestVersion(): Promise<string> {
  try {
    const response = await fetch(
      `https://github.com/${REPO}/releases/latest/download/latest.yml`,
      { redirect: 'follow' }
    );
    if (!response.ok) return FALLBACK_VERSION;

    const text = await response.text();
    const match = text.match(/^version:\s*([^\r\n]+)$/m);
    const version = String(match?.[1] || '').trim().replace(/^v/, '');
    return VERSION_PATTERN.test(version) ? version : FALLBACK_VERSION;
  } catch {
    return FALLBACK_VERSION;
  }
}

/**
 * GET /api/version/exe/download?type=setup|portable&version=1.4.25
 *
 * Proxies the release asset as a streamed attachment on the Kelasi 360
 * origin. The browser never navigates to a GitHub release page, and large
 * EXE files are streamed instead of buffered in Worker memory.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const kind = url.searchParams.get('type');

  if (kind !== 'setup' && kind !== 'portable') {
    return NextResponse.json(
      { error: 'Type de téléchargement invalide. Utilisez setup ou portable.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const requestedVersion = url.searchParams.get('version');
  if (requestedVersion && !VERSION_PATTERN.test(requestedVersion)) {
    return NextResponse.json(
      { error: 'Version de téléchargement invalide.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const version = requestedVersion || await resolveLatestVersion();
  const exeKind = kind as ExeKind;
  const filename = exeKind === 'setup'
    ? `Kelasi360-Setup-${version}.exe`
    : `Kelasi360-Portable-${version}.exe`;
  const downloadUrl = `https://github.com/${REPO}/releases/download/v${version}/${filename}`;

  const requestHeaders = new Headers({
    Accept: 'application/octet-stream',
    'User-Agent': 'Kelasi360-Downloader/1.0',
  });
  // Preserve byte-range support so interrupted large downloads can resume.
  for (const name of ['range', 'if-range']) {
    const value = request.headers.get(name);
    if (value) requestHeaders.set(name, value);
  }

  let upstream: Response;
  try {
    upstream = await fetch(downloadUrl, {
      method: 'GET',
      headers: requestHeaders,
      redirect: 'follow',
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { error: 'Le serveur de téléchargement est temporairement indisponible. Réessayez dans un instant.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if ((!upstream.ok && upstream.status !== 206) || !upstream.body) {
    return NextResponse.json(
      { error: `Le fichier ${filename} n’est pas disponible dans la release v${version}.` },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const responseHeaders = new Headers({
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'private, no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
  });

  // Keep headers needed by download managers and Range/If-Range responses.
  for (const name of ['content-range', 'etag', 'last-modified']) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
