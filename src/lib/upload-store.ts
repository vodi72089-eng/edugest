// ── Stockage des fichiers uploadés — 3 modes ───────────────────────────────
//
//   1. DATA URI (≤ 4 Mo) — prioritaire partout : l'URL contient le fichier
//      lui-même (base64). Elle est stockée dans la colonne (logo, url, …),
//      s'affiche sur le web comme dans l'EXE, et suit la synchro
//      colonne→colonne sans dépendre d'aucun stockage externe.
//   2. R2 (fichiers > 4 Mo, web) — si le bucket est lié (binding UPLOADS).
//      R2 nécessite une activation du compte Cloudflare (dashboard) : tant
//      qu'il n'est pas là, un fichier > 4 Mo est refusé côté web.
//   3. DISQUE (fichiers > 4 Mo, EXE desktop) — historique <cwd>/upload/,
//      servi par GET /api/upload/[...path].
//
// Détection : on tente l'import dynamique du module natif workerd
// « cloudflare:workers ».
//   - Workers → résolu → { onWorkers: true, bucket: env.UPLOADS | null }
//   - Node (EXE, next dev --webpack) → échoue → { onWorkers: false, bucket: null }
//     (webpackIgnore: true évite que webpack tente de résoudre le module au
//      build desktop ; il reste tel quel et échoue au runtime → catch.)

/** Plafond du mode data URI (octets du fichier, avant encodage base64). */
export const DATA_URI_MAX_OCTETS = 4 * 1024 * 1024;

/** Sous-ensemble de l'API R2Bucket utilisé par les routes d'upload. */
export interface UploadsBucket {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | string,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<unknown>;
  get(key: string): Promise<UploadedObject | null>;
}

export interface UploadedObject {
  body: ReadableStream<Uint8Array>;
  httpMetadata?: { contentType?: string };
}

export interface UploadStorageMode {
  /** true = on s'exécute dans workerd (web) ; false = Node (EXE desktop). */
  onWorkers: boolean;
  /** Bucket R2 lié via le binding UPLOADS, ou null si absent. */
  bucket: UploadsBucket | null;
}

let modePromise: Promise<UploadStorageMode> | null = null;

function detectUploadStorage(): Promise<UploadStorageMode> {
  if (!modePromise) {
    modePromise = (async () => {
      try {
        // webpackIgnore: le build desktop (webpack) laisse l'import intact →
        // il échoue au runtime en Node → mode disque. Sous vinext (rolldown),
        // le commentaire est ignoré : « cloudflare:workers » reste externe et
        // est résolu nativement par workerd.
        const mod = await import(/* webpackIgnore: true */ 'cloudflare:workers');
        return {
          onWorkers: true,
          bucket: (mod.env.UPLOADS as UploadsBucket | undefined) ?? null,
        };
      } catch {
        // Node (EXE desktop / dev local) : pas de workerd, pas de bindings.
        return { onWorkers: false, bucket: null };
      }
    })();
  }
  return modePromise;
}

/** Mode de stockage courant (mémoïsé par isolate). */
export async function getUploadStorage(): Promise<UploadStorageMode> {
  return detectUploadStorage();
}

/** Encode un buffer en data URI autoportant (le fichier EST l'URL). */
export function toDataUri(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}
