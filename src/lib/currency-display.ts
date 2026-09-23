/**
 * Devise d'affichage globale (client).
 *
 * Les montants sont stockés en monnaie de BASE. L'école choisit une monnaie
 * d'AFFICHAGE (onglet Monnaies) : ce module convertit à l'affichage via les
 * taux (manuels si activés, sinon automatiques), avec repli sur la base.
 *
 * Aucune dépendance vers le store → pas de cycle d'import.
 */

const SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  CDF: 'FC',
  NGN: '₦',
  XOF: 'CFA',
  GHS: '₵',
  KES: 'KSh',
  ZAR: 'R',
  GBP: '£',
  CAD: 'C$',
};

interface DisplayConfig {
  baseCurrency: string;
  displayCurrency: string;
  /** Taux auto : unités de [devise] pour 1 unité de base. */
  rates: Record<string, number>;
  /** Taux manuels (même sémantique), prioritaires si useManualRates. */
  manualRates: Record<string, number> | null;
  useManualRates: boolean;
}

let cfg: DisplayConfig = {
  baseCurrency: 'CDF',
  displayCurrency: 'CDF',
  rates: {},
  manualRates: null,
  useManualRates: false,
};

// ── Réactivité ──────────────────────────────────────────────────────────────
// Le module est une source de vérité hors React : on expose un compteur de
// version + subscribe pour que les composants (page.tsx, useCurrency) se
// re-rendent dès que la config change (chargement, sauvegarde immédiate).
let version = 0;
const listeners = new Set<() => void>();

export function subscribeCurrency(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getCurrencyVersion(): number {
  return version;
}

export function setCurrencyDisplay(c: Partial<DisplayConfig>): void {
  cfg = {
    baseCurrency: c.baseCurrency || 'CDF',
    displayCurrency: c.displayCurrency || c.baseCurrency || 'CDF',
    rates: c.rates || {},
    manualRates: c.manualRates || null,
    useManualRates: !!c.useManualRates,
  };
  version++;
  listeners.forEach((l) => { try { l(); } catch { /* noop */ } });
}

export function getCurrencyDisplay(): DisplayConfig {
  return cfg;
}

function symbol(code: string): string {
  return SYMBOLS[code] || code;
}

function fmt(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

/**
 * Formate un montant stocké en monnaie de base vers la monnaie d'affichage.
 * Sans config (ou taux manquant) : repli sur l'ancien comportement (base).
 */
export function formatAmount(amount: number): string {
  const n = Number(amount) || 0;
  const { baseCurrency, displayCurrency } = cfg;
  if (!displayCurrency || displayCurrency === baseCurrency) {
    return `${fmt(n)} ${symbol(baseCurrency)}`;
  }
  const table = cfg.useManualRates && cfg.manualRates ? cfg.manualRates : cfg.rates;
  const rate = table?.[displayCurrency];
  if (!rate || !(rate > 0)) {
    return `${fmt(n)} ${symbol(baseCurrency)}`;
  }
  return `${fmt(n * rate)} ${symbol(displayCurrency)}`;
}

/**
 * Conversion inverse : un montant SAISI en monnaie d'affichage (ex: filtre
 * « montant atteint ≥ 10 » tapé en USD) vers la monnaie de base (comparaison
 * avec les montants stockés). Inverse exact, SANS arrondi (sinon les petits
 * seuils tombent à 0). Taux manquant → renvoie le montant tel quel.
 */
export function convertFromDisplay(displayAmount: number): number {
  const n = Number(displayAmount) || 0;
  const { baseCurrency, displayCurrency } = cfg;
  if (!displayCurrency || displayCurrency === baseCurrency) return n;
  const table = cfg.useManualRates && cfg.manualRates ? cfg.manualRates : cfg.rates;
  const rate = table?.[displayCurrency];
  if (!rate || !(rate > 0)) return n;
  return n / rate;
}

/** Symbole de la monnaie d'affichage courante (ex: '$', 'FC', '€'). */
export function getDisplaySymbol(): string {
  return symbol(cfg.displayCurrency || cfg.baseCurrency || 'CDF');
}
