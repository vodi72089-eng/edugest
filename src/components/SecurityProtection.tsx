'use client';

/**
 * EduGest — Protection frontend contre les accès faciles aux outils de développement.
 *
 * Portée (dissuasion, PAS une protection absolue — le code envoyé au navigateur
 * reste toujours inspectable par un utilisateur déterminé) :
 *   - F12
 *   - Ctrl/Cmd + U            → « Afficher le code source »
 *   - Ctrl/Cmd + Shift + I    → DevTools (macOS : Cmd + Option + I)
 *   - Ctrl/Cmd + Shift + J    → Console   (macOS : Cmd + Option + J)
 *   - Ctrl/Cmd + Shift + C    → Inspecteur (macOS : Cmd + Option + C)
 *   - Ctrl/Cmd + Shift + K/E  → Console/Réseau Firefox (bonus)
 *   - Clic droit              → menu contextuel natif désactivé
 *
 * Garanties de compatibilité :
 *   - La saisie, le copier/coller (Ctrl+C/V/X), Ctrl+A et le menu contextuel
 *     natif (coller, correcteur orthographique) dans les champs input,
 *     textarea, select et contentEditable ne sont JAMAIS gênés.
 *   - Ctrl+U est bloqué même avec le focus dans un champ (aucune édition
 *     native n'utilise ce raccourci) ; seuls les éditeurs riches
 *     (contentEditable, ex. « souligner ») restent exemptés.
 *   - Écouteurs en phase de CAPTURE (capture = true) : intercepte les
 *     événements avant tout autre gestionnaire de l'application.
 *   - Un seul montage : `useEffect` avec tableau de dépendances vide et
 *     nettoyage complet (removeEventListener) → aucune fuite mémoire,
 *     aucun doublon, compatible Fast Refresh / navigation Next.js.
 *   - Ne rend rien (null) : zéro impact visuel, zéro décalage d'hydratation.
 *   - Fonctionne sur toutes les pages via l'intégration dans le layout racine.
 */

import { useEffect } from 'react';

/** Lettres des raccourcis DevTools (I/J/C standard + K/E Firefox). */
const DEVTOOLS_LETTERS = new Set(['I', 'J', 'C', 'K', 'E']);

/**
 * Détermine si la cible d'un événement est un champ éditable.
 * Ces éléments conservent 100 % de leur comportement natif.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

/** Lettre logique pressée (indépendante de la disposition AZERTY/QWERTY). */
function pressedLetter(event: KeyboardEvent): string {
  // `key` suit le caractère produit (fiable sur AZERTY pour les lettres),
  // `event.code` suit la touche physique (KeyI, KeyJ…) en secours.
  const fromKey = event.key.length === 1 ? event.key.toUpperCase() : '';
  if (fromKey) return fromKey;
  const code = event.code ?? '';
  return code.startsWith('Key') ? code.slice(3) : '';
}

export default function SecurityProtection() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { key, ctrlKey, metaKey, shiftKey, altKey } = event;
      const primary = ctrlKey || metaKey; // Ctrl (Windows/Linux) ou Cmd (macOS)

      // F12 — DevTools (aucun usage de saisie légitime)
      if (key === 'F12') {
        event.preventDefault();
        return;
      }

      // Ctrl/Cmd + U — « Afficher le code source ».
      // Blocage PARTOUT, y compris quand le focus est dans un input/textarea
      // (aucune édition native du navigateur n'utilise Ctrl+U — faille corrigée :
      // cliquer dans un champ puis Ctrl+U ouvrait encore la source).
      // Seuls les vrais éditeurs riches (contentEditable, ex. « souligner »)
      // restent exemptés pour ne pas casser leurs raccourcis internes.
      if (primary && !shiftKey && !altKey && pressedLetter(event) === 'U') {
        const isRichEditor =
          event.target instanceof HTMLElement && event.target.isContentEditable;
        if (!isRichEditor) {
          event.preventDefault();
        }
        return;
      }

      // Ctrl/Cmd + Shift|Alt + I/J/C/K/E — DevTools, console, inspecteur, réseau.
      // `Alt` couvre les équivalents macOS (Cmd + Option + I/J/C).
      if (primary && (shiftKey || altKey) && DEVTOOLS_LETTERS.has(pressedLetter(event))) {
        event.preventDefault();
      }
    };

    const onContextMenu = (event: MouseEvent) => {
      // Le menu contextuel natif reste disponible dans les champs éditables
      // (coller, orthographe, suggestions) et ne gêne jamais la saisie.
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
    };

    // capture = true : intercepte avant tous les autres gestionnaires.
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('contextmenu', onContextMenu, true);

    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('contextmenu', onContextMenu, true);
    };
  }, []);

  return null;
}
