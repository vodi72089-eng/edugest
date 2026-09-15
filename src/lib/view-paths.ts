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
  'create-school': '/create-school',
  'school-detail': '/school-detail',
  dashboard: '/dashboard',
  students: '/students',
  classes: '/classes',
  grades: '/grades',
  payments: '/payments',
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
};

/** Views accessible WITHOUT authentication (pre-auth screens + public landing). */
export const PUBLIC_VIEWS: readonly string[] = ['home', 'login', 'create-school', 'pricing', 'school-detail'];

/** Pre-auth-only views that must never be restored while a session is active. */
export const PRE_AUTH_ONLY_VIEWS: readonly string[] = ['login', 'create-school', 'school-detail'];

/** Convert a view name to its canonical browser path. */
export function viewToPath(view: string): string {
  return VIEW_PATHS[view] ?? '/';
}

/** Convert a browser pathname to a view name (null when unknown). */
export function pathToView(pathname: string): string | null {
  const clean = (pathname || '/').split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
  for (const [view, path] of Object.entries(VIEW_PATHS)) {
    if (path === clean) return view;
  }
  return null;
}
