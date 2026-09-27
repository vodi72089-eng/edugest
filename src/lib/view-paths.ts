// ─── Centralised view ↔ URL mapping ──────────────────────────────────────────
// SINGLE SOURCE OF TRUTH shared by:
//   - src/lib/store.ts  → keeps the browser URL in sync when views change
//   - next.config.ts    → rewrites so deep links like /login or /dashboard
//                         serve the app instead of a 404 (refresh, direct link)
//
// Every screen of the application therefore has a real, readable URL
// (ex: http://localhost:3000/login, /dashboard, /students…).

export const VIEW_PATHS: Record<string, string> = {
  home: '/',
  login: '/login',
  docs: '/docs',
  'create-school': '/create-school',
  'school-detail': '/school-detail',
  dashboard: '/dashboard',
  students: '/students',
  classes: '/classes',
  grades: '/grades',
  payments: '/payments',
  finance: '/finance',
  discipline: '/discipline',
  communications: '/communications',
  homework: '/homework',
  profile: '/profile',
  pricing: '/pricing',
  'class-passing': '/class-passing',
  convocation: '/convocation',
  schools: '/schools',
  bulletin: '/bulletin',
  'admin-analytics': '/admin-analytics',
  'whatsapp-config': '/whatsapp-config',
  'platform-control': '/platform-control',
  personnel: '/personnel',
  settings: '/settings',
  'school-reviews': '/school-reviews',
  'payment-verification': '/payment-verification',
  'payment-config': '/payment-config',
  'online-payment': '/online-payment',
  debts: '/debts',
  'my-subscription': '/my-subscription',
  medical: '/medical',
  'medical-records': '/medical-records',
  'parent-qr': '/parent-qr',
  parents: '/parents',
  personalization: '/personalization',
  attendance: '/attendance',
  events: '/events',
  reports: '/reports',
};

/** Views accessible WITHOUT authentication (pre-auth screens + public landing). */
export const PUBLIC_VIEWS: readonly string[] = ['home', 'login', 'create-school', 'pricing', 'school-detail', 'docs'];

/** Pre-auth-only views that must never be restored while a session is active. */
export const PRE_AUTH_ONLY_VIEWS: readonly string[] = ['login', 'create-school', 'school-detail'];

/** Convert a view name to its canonical browser path. */
export function viewToPath(view: string, subTab?: string | null): string {
  const base = VIEW_PATHS[view] ?? '/';
  // Sous-onglets : /payment-config/transactions, /payment-config/currency…
  if (view === 'payment-config' && subTab && subTab !== 'gateways') {
    return `${base}/${subTab}`;
  }
  return base;
}

/** Convert a browser pathname to a view name (null when unknown). */
export function pathToView(pathname: string): string | null {
  return parsePath(pathname).view;
}

/**
 * Convertit un chemin en { view, subTab }.
 * /payment-config/transactions → { view: 'payment-config', subTab: 'transactions' }
 */
export function parsePath(pathname: string): { view: string | null; subTab: string | null } {
  const clean = (pathname || '/').split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  for (const [view, path] of Object.entries(VIEW_PATHS)) {
    if (path === clean) return { view, subTab: null };
    if (view === 'payment-config' && clean.startsWith(`${path}/`)) {
      const sub = clean.slice(path.length + 1).split('/')[0];
      return { view, subTab: sub || null };
    }
  }
  return { view: null, subTab: null };
}
