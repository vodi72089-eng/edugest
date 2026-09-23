import { create } from 'zustand'
import { viewToPath, pathToView, PUBLIC_VIEWS, PRE_AUTH_ONLY_VIEWS } from './view-paths'

// ─── Persistence Keys ────────────────────────────────────────────────────────

const STORAGE_KEY = 'edugest_session';

function getStoredSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveSession(data: { view?: string; sidebar?: boolean; role?: string | null; userData?: UserData | null }) {
  if (typeof window === 'undefined') return;
  try {
    const existing = getStoredSession() || {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...existing, ...data }));
  } catch {}
}

function clearSession() {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

// ─── Auth Token Storage ─────────────────────────────────────────────────────

let _authToken: string | null = null;

export function setAuthToken(token: string | null) {
  _authToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('edugest_token', token);
    } else {
      localStorage.removeItem('edugest_token');
    }
  }
}

export function getAuthToken(): string | null {
  if (_authToken) return _authToken;
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('edugest_token');
    if (stored) {
      _authToken = stored;
      return stored;
    }
  }
  return null;
}

/**
 * Helper to make authenticated API requests
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    setAuthToken(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
  }

  if (res.status === 403) {
    try {
      const cloned = res.clone();
      const body = await cloned.json();
      if (body.subscriptionRequired) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('subscription:required', { detail: body }));
        }
      }
    } catch { /* not JSON */ }
  }

  return res;
}

// ─── Desktop app (Electron) : pas de landing page ──────────────────────────
// L'application de bureau démarre directement sur l'écran de connexion.
// Détection au runtime via le user-agent Electron (les variables
// NEXT_PUBLIC_* sont figées au build et ne peuvent pas servir ici).
// Toute navigation vers 'home' (landing) est rabattue sur 'login'.
export function isDesktopApp(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /electron/i.test(navigator.userAgent || '');
}

function resolveView(view: ViewType): ViewType {
  if (view === 'home' && isDesktopApp()) return 'login';
  return view;
}

// ─── Browser URL sync ────────────────────────────────────────────────────
// The whole app is a single-page application driven by `currentView`.
// These helpers keep the browser address bar synchronised with real paths
// (/login, /dashboard, /students…) so every screen has a readable URL,
// deep links work and back/forward behave like normal navigation.
// The mapping itself lives in src/lib/view-paths.ts (shared with next.config).

function syncUrl(view: ViewType, mode: 'push' | 'replace') {
  if (typeof window === 'undefined') return;
  const target = viewToPath(view);
  if (window.location.pathname === target) return;
  try {
    if (mode === 'push') {
      window.history.pushState({ edugestView: view }, '', target);
    } else {
      window.history.replaceState({ edugestView: view }, '', target);
    }
  } catch { /* ignore */ }
}

function applyView(view: ViewType) {
  const resolved = resolveView(view);
  useEduGestStore.setState({ currentView: resolved });
  saveSession({ view: resolved });
}

export type ViewType =
  | 'home'
  | 'login'
  | 'create-school'
  | 'school-detail'
  | 'dashboard'
  | 'students'
  | 'classes'
  | 'grades'
  | 'payments'
  | 'finance'
  | 'discipline'
  | 'communications'
  | 'homework'
  | 'profile'
  | 'pricing'
  | 'class-passing'
  | 'convocation'
  | 'schools'
  | 'bulletin'
  | 'admin-analytics'
  | 'whatsapp-config'
  | 'platform-control'
  | 'personnel'
  | 'settings'
  | 'school-reviews'
  | 'payment-verification'
  | 'payment-config'
  | 'medical-records'
  | 'online-payment'
  | 'debts'
  | 'my-subscription'
  | 'medical'
  | 'parent-qr'
  | 'parents'
  | 'personalization'
  | 'attendance'
  | 'events'
  | 'reports'
  | 'corporate'
  | 'corporates'
  | 'support'
  | 'docs'
  | 'platform-emails'
  | 'activity-logs'

export type UserRole =
  | 'SUPER_ADMIN_GLOBAL'
  | 'SCHOOL_ADMIN'
  | 'SECRETARY'
  | 'CASHIER'
  | 'DIRECTION_MATERNELLE'
  | 'DIRECTION_PRIMAIRE'
  | 'DIRECTION_SECONDAIRE'
  | 'DISCIPLINE_MATERNELLE'
  | 'DISCIPLINE_PRIMAIRE'
  | 'DISCIPLINE_SECONDAIRE'
  | 'TEACHER'
  | 'HEAD_TEACHER'
  | 'EPS'
  | 'PARENT'
  | 'MEDICAL'
  | 'CORPORATE_ADMIN'
  | 'SUPPORT_AGENT'

export interface UserData {
  id: string
  name: string
  role: UserRole
  // null = admin plateforme (SUPER_ADMIN_GLOBAL) : rattaché à aucune école
  schoolId: string | null
  schoolName: string
  schoolLogo?: string | null
  schoolDesign?: { primary: string; accent: string; gold: string } | null
  initials: string
  profileImageUrl?: string | null
  subjectName?: string | null
  classNames?: string | null
  isTitulaire?: boolean
  subscriptionTier?: string
}

interface EduGestStore {
  currentView: ViewType
  setCurrentView: (view: ViewType) => void

  userRole: UserRole | null
  setUserRole: (role: UserRole | null) => void

  userData: UserData | null
  setUserData: (data: UserData | null) => void

  selectedSchoolId: string | null
  setSelectedSchoolId: (id: string | null) => void

  // École ACTIVE pour l'admin plateforme (SUPER_ADMIN_GLOBAL) : le super
  // admin n'appartient à aucune école — quand il parcourt une vue scolaire
  // (élèves, paiements, discipline…), il choisit explicitement l'école de
  // contexte. Toujours null pour les autres rôles (ils utilisent userData.schoolId).
  activeSchoolId: string | null
  setActiveSchoolId: (id: string | null) => void

  selectedStudentId: string | null
  setSelectedStudentId: (id: string | null) => void

  highlightedId: string | null
  setHighlightedId: (id: string | null) => void

  pendingPaymentStudent: { id: string; firstName: string; lastName: string; matricule: string; classId?: string; tranche?: string; amount?: number } | null
  setPendingPaymentStudent: (student: { id: string; firstName: string; lastName: string; matricule: string; classId?: string; tranche?: string; amount?: number } | null) => void

  // Enfant ciblé depuis le dashboard parent (puce Notes/Bulletin/Paiements/Discipline)
  // → consommé UNE fois par la vue de destination pour présélectionner l'enfant.
  pendingStudentFocus: { id: string; firstName: string; lastName: string; matricule: string; classId?: string; photoUrl?: string } | null
  setPendingStudentFocus: (student: { id: string; firstName: string; lastName: string; matricule: string; classId?: string; photoUrl?: string } | null) => void

  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void

  disciplineTab: 'BLACKLIST' | 'GREYLIST' | 'WHITELIST'
  setDisciplineTab: (tab: 'BLACKLIST' | 'GREYLIST' | 'WHITELIST') => void

  searchQuery: string
  setSearchQuery: (q: string) => void

  login: (role: UserRole, data: UserData, token?: string) => void
  logout: () => void
}

// ─── Initial State from localStorage ─────────────────────────────────────────

function getInitialState() {
  // Always return 'home' (landing publique restaurée) on both server and client
  // to avoid hydration mismatch. Session is restored in a useEffect after mount.
  return { currentView: 'home' as ViewType, userRole: null as UserRole | null, userData: null as UserData | null, sidebarOpen: false };
}

/**
 * École de contexte pour les requêtes scolaires :
 * - SUPER_ADMIN_GLOBAL → activeSchoolId (choisie explicitement, sinon null)
 * - tous les autres rôles → leur propre école (userData.schoolId)
 * À utiliser dans les vues à portée école — renvoie null tant que le super
 * admin n'a pas choisi d'école (les vues affichent alors un état vide,
 * JAMAIS les données de la 1re école par effet de bord).
 */
export function getActiveSchoolId(): string | null {
  const s = useEduGestStore.getState();
  if (!s.userData) return null;
  if (s.userData.role === 'SUPER_ADMIN_GLOBAL') return s.activeSchoolId;
  return s.userData.schoolId ?? null;
}

export function restoreSession() {
  if (typeof window === 'undefined') return;
  const session = getStoredSession();
  const token = localStorage.getItem('edugest_token');
  if (token) _authToken = token;
  const store = useEduGestStore.getState();

  // The URL is the first-class source of truth: a deep link like /students
  // restores the Students view directly. Without a deep link, authenticated
  // users land on the dashboard; anonymous users see the public landing.
  const urlView = pathToView(window.location.pathname) as ViewType | null;
  const authed = !!(session && (session.role || session.userData));

  if (authed) {
    let view: ViewType = 'dashboard';
    if (
      urlView &&
      urlView !== 'home' &&
      urlView !== 'login' &&
      !(PRE_AUTH_ONLY_VIEWS as readonly string[]).includes(urlView)
    ) {
      view = urlView;
    } else if (session.view && session.view !== 'home') {
      view = session.view as ViewType;
    }
    if (session.role) store.setUserRole(session.role as UserRole);
    if (session.userData) store.setUserData(session.userData as UserData);
    if (session.sidebar) store.setSidebarOpen(true);
    applyView(view);
    syncUrl(view, 'replace');
  } else {
    // Not authenticated: public screens can be shown. With no deep link we
    // land on the public landing (restored at user request); auth-only or
    // unknown deep links still fall back to the login form.
    const view: ViewType =
      urlView && (PUBLIC_VIEWS as readonly string[]).includes(urlView)
        ? (urlView as ViewType)
        : urlView
          ? 'login'
          : resolveView('home');
    applyView(view);
    syncUrl(view, 'replace');
  }
}

// ─── Session-restore watchdog ────────────────────────────────────────────────
// If the initial React hydration fails (slow network, stale/truncated JS chunk
// under heavy load), `restoreSession()` may never run and an authenticated
// user silently lands on the public landing even though localStorage still
// holds a valid session. The watchdog re-runs the (idempotent) restore a few
// times during the first seconds until the session is actually applied.
export function startSessionRestoreWatchdog() {
  if (typeof window === 'undefined') return () => {};
  let tries = 0;
  const iv = setInterval(() => {
    tries++;
    if (useEduGestStore.getState().userRole) {
      clearInterval(iv);
      return;
    }
    // Only act when a stored session exists — anonymous visitors are untouched.
    if (getStoredSession()) restoreSession();
    if (tries >= 10) clearInterval(iv);
  }, 1000);
  return () => clearInterval(iv);
}

// Back / forward buttons: translate the URL they land on back into a view.
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    const store = useEduGestStore.getState();
    const urlView = pathToView(window.location.pathname) as ViewType | null;
    let target: ViewType = resolveView(urlView || 'home');
    if (!store.userRole && !(PUBLIC_VIEWS as readonly string[]).includes(target)) {
      // Anonymous users can never land on an auth-only view.
      target = 'login';
    } else if (store.userRole && target === 'login') {
      // Authenticated users never fall back to the pre-auth login screen.
      target = store.currentView;
    }
    applyView(target);
    syncUrl(target, 'replace');
  });
}

const initial = getInitialState();

export const useEduGestStore = create<EduGestStore>((set, get) => ({
  currentView: initial.currentView,
  setCurrentView: (view) => {
    const resolved = resolveView(view);
    applyView(resolved);
    syncUrl(resolved, 'push');
  },

  userRole: initial.userRole,
  setUserRole: (role) => {
    set({ userRole: role });
    saveSession({ role });
  },

  userData: initial.userData,
  setUserData: (data) => {
    set({ userData: data });
    saveSession({ userData: data });
  },

  selectedSchoolId: null,
  setSelectedSchoolId: (id) => set({ selectedSchoolId: id }),

  activeSchoolId: null,
  setActiveSchoolId: (id) => set({ activeSchoolId: id }),

  selectedStudentId: null,
  setSelectedStudentId: (id) => set({ selectedStudentId: id }),

  highlightedId: null,
  setHighlightedId: (id) => set({ highlightedId: id }),

  pendingPaymentStudent: null,
  setPendingPaymentStudent: (student) => set({ pendingPaymentStudent: student }),

  pendingStudentFocus: null,
  setPendingStudentFocus: (student) => set({ pendingStudentFocus: student }),

  sidebarOpen: initial.sidebarOpen,
  setSidebarOpen: (open) => {
    set({ sidebarOpen: open });
    saveSession({ sidebar: open });
  },

  disciplineTab: 'GREYLIST',
  setDisciplineTab: (tab) => set({ disciplineTab: tab }),

  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),

  login: (role, data, token?: string) => {
    if (token) setAuthToken(token);
    // Vue d'entrée selon le rôle : le compte corporate arrive dans SON espace
    // (multi-écoles), le support dans sa file de tickets — pas de dashboard école
    // qui n'a aucun sens pour ces comptes hors établissement (schoolId null).
    const DEFAULT_VIEW_BY_ROLE: Partial<Record<UserRole, ViewType>> = {
      CORPORATE_ADMIN: 'corporate',
      SUPPORT_AGENT: 'support',
    };
    const startView = DEFAULT_VIEW_BY_ROLE[role] || 'dashboard';
    const sessionData = { view: startView, role, userData: data, sidebar: false } as never;
    set({
      userRole: role,
      userData: data,
      currentView: startView,
      sidebarOpen: false,
    });
    saveSession(sessionData);
    syncUrl(startView, 'replace');
  },

  logout: () => {
    // Best-effort: notify the server to revoke the session file so the token
    // can't be reused. We don't await — the local state is cleared
    // immediately so the UI is responsive even if the network is slow.
    const token = getAuthToken();
    if (token) {
      try {
        fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        }).catch(() => { /* best effort */ });
      } catch {
        /* ignore */
      }
    }
    setAuthToken(null);
    clearSession();
    const homeView = resolveView('home');
    set({
      userRole: null,
      userData: null,
      currentView: homeView,
      sidebarOpen: false,
      selectedSchoolId: null,
      activeSchoolId: null,
      selectedStudentId: null,
      pendingStudentFocus: null,
      pendingPaymentStudent: null,
    });
    syncUrl(homeView, 'replace');
  },
}))
