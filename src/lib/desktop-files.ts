// Sauvegarde des PDF générés par l'application.
//
// - Application desktop (Electron) : le PDF est rangé par le processus
//   principal dans `Documents/EduGest/<Catégorie>/` (ex. « Reçus de
//   paiement ») et le chemin est retourné pour affichage.
// - Web : comportement inchangé (téléchargement navigateur).
import { toast } from 'sonner';
import { isDesktopApp } from './store';

export interface SavedPdf {
  /** Chemin complet du fichier enregistré. */
  path: string;
  /** Dossier de catégorie (ex. « Reçus de paiement »). */
  folder: string;
  /** Nom final du fichier (avec suffixe anti-écrasement éventuel). */
  filename: string;
}

interface FilesBridge {
  savePdf?: (payload: { filename: string; data: string }) => Promise<{
    ok: boolean; path?: string; folder?: string; filename?: string; error?: string;
  }>;
  showInFolder?: (path: string) => void;
}

function getFilesBridge(): FilesBridge | null {
  try {
    if (typeof window === 'undefined') return null;
    return (window as unknown as { __edugest?: { files?: FilesBridge } }).__edugest?.files || null;
  } catch {
    return null;
  }
}

function downloadViaAnchor(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      const i = res.indexOf('base64,');
      resolve(i >= 0 ? res.slice(i + 7) : res);
    };
    reader.onerror = () => reject(new Error('lecture du PDF impossible'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Enregistre un PDF : dossier categirisé sur desktop, téléchargement
 * navigateur sur le web.
 * @returns le fichier enregistré (desktop) ou null (web : téléchargé).
 */
export async function savePdfBlob(blob: Blob, filename: string): Promise<SavedPdf | null> {
  const safe = (filename || 'document.pdf').trim() || 'document.pdf';
  const bridge = getFilesBridge();
  if (isDesktopApp() && bridge?.savePdf) {
    try {
      const data = await blobToBase64(blob);
      const res = await bridge.savePdf({ filename: safe, data });
      if (res && res.ok && res.path) {
        return { path: res.path, folder: res.folder || '', filename: res.filename || safe };
      }
    } catch {
      // Repli : téléchargement navigateur ci-dessous.
    }
  }
  downloadViaAnchor(blob, safe);
  return null;
}

/** Sauvegarde à partir d'une URL blob: (cas des aperçus en iframe). */
export async function savePdfUrl(blobUrl: string, filename: string): Promise<SavedPdf | null> {
  const res = await fetch(blobUrl);
  const blob = await res.blob();
  return savePdfBlob(blob, filename);
}

/** Toast standard « enregistré » avec bouton « Ouvrir le dossier ». */
export function toastPdfSaved(saved: SavedPdf) {
  const where = saved.folder ? `« ${saved.folder} »` : 'le dossier EduGest';
  toast.success(`PDF enregistré dans ${where}`, {
    description: saved.filename,
    action: {
      label: 'Ouvrir le dossier',
      onClick: () => {
        try {
          getFilesBridge()?.showInFolder?.(saved.path);
        } catch {
          // ignoré
        }
      },
    },
    duration: 8000,
  });
}
