/**
 * Logo EduGest pour les PDF — 100 % compatible Node (local/exe) ET
 * Cloudflare Workers (aucun `fs`/`path` : `import fs` en tête de module fait
 * échouer TOUTE la route sur Workers, même avec un try/catch autour de
 * l'usage — d'où les 500 sur tous les PDF du site).
 *
 * Stratégie : on télécharge l'asset public depuis la même origine que la
 * requête (localhost:3000, 127.0.0.1:port de l'exe, ou domaine workers.dev).
 * En échec : null (le PDF se génère sans logo, jamais de 500 pour ça).
 */

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as number[]);
  }
  // btoa existe partout : navigateurs, Node 16+, Workers.
  return btoa(bin);
}

export interface PublicLogo {
  dataUrl: string;
  isPng: boolean;
}

/**
 * @param requestUrl `request.url` de la route (pour l'origin).
 * @param filenames noms de fichiers essayés dans l'ordre, ex.
 *   ['edugest-logo-pdf.jpg', 'edugest-logo.png'].
 */
export async function fetchPublicLogo(
  requestUrl: string,
  filenames: string[] = ['edugest-logo-pdf.jpg', 'edugest-logo.png']
): Promise<PublicLogo | null> {
  let origin = '';
  try {
    origin = new URL(requestUrl).origin;
  } catch {
    return null;
  }
  for (const name of filenames) {
    try {
      const res = await fetch(`${origin}/${name}`);
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      if (!buf.byteLength) continue;
      const isPng = name.toLowerCase().endsWith('.png');
      return {
        dataUrl: `data:image/${isPng ? 'png' : 'jpeg'};base64,${arrayBufferToBase64(buf)}`,
        isPng,
      };
    } catch {
      continue;
    }
  }
  return null;
}
