// Compression des images AVANT upload (client).
//
// Une photo de téléphone fait souvent 4 à 8 Mo : ramenée à ≤ 1920 px en WebP
// (85 %), elle passe sous la limite de 4 Mo du stockage en ligne (data URI),
// s'affiche plus vite et allège la base + la synchro EXE↔Neon.
//
// Non-image (PDF, docx…) ou SVG (vectoriel, déjà léger) : renvoyé tel quel.
// Toute erreur → fichier d'origine : le serveur reste seul juge du refus.

const MAX_DIMENSION = 1920;
const QUALITY = 0.85;
const COMPRESS_BELOW = 1.5 * 1024 * 1024; // ≤ 1,5 Mo : déjà léger, inchangé

export async function compressImage(file: File): Promise<File> {
  try {
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return file;
    if (file.size <= COMPRESS_BELOW) return file;
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;

    const bitmap = await createImageBitmap(file);
    const longSide = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, MAX_DIMENSION / longSide);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      if (typeof bitmap.close === 'function') bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    if (typeof bitmap.close === 'function') bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', QUALITY)
    );
    // Pas de WebP ou pas de gain : on garde l'original.
    if (!blob || blob.size >= file.size) return file;

    const baseName = file.name.replace(/\.[a-z0-9]+$/i, '') || 'image';
    return new File([blob], `${baseName}.webp`, {
      type: 'image/webp',
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}
