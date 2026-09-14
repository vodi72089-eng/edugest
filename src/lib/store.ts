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
  useEduGestStore.setState({ currentView: view });
  saveSession({ view });
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
  | 'personnel'
  | 'settings'
  | 'school-reviews'
  | 'payment-verification'
  | 'payment-config'
  | 'online-payment'
  | 'debts'
  | 'my-subscription'
  | 'medical'
  | 'parent-qr'
  | 'parents'
  | 'personalization'

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
  | 'PARENT'
  | 'MEDICAL'

export interface UserData {
  id: string
  name: string
  role: UserRole
  schoolId: string
  schoolName: string
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

  selectedStudentId: string | null
  setSelectedStudentId: (id: string | null) => void

  highlightedId: string | null
  setHighlightedId: (id: string | null) => void

  pendingPaymentStudent: { id: string; firstName: string; lastName: string; matricule: string; classId?: string; tranche?: string; amount?: number } | null
  setPendingPaymentStudent: (student: { id: string; firstName: string; lastName: string; matricule: string; classId?: string; tranche?: string; amount?: number } | null) => void

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
  // Always return 'login' on both server and client to avoid hydration mismatch.
  // The landing page is disabled for security reasons — the app opens directly
  // on the unified login form. Session is restored in a useEffect after mount.
  return { currentView: 'login' as ViewType, userRole: null as UserRole | null, userData: null as UserData | null, sidebarOpen: false };
}

export function restoreSession() {
  if (typeof window === 'undefined') return;
  const session = getStoredSession();
  const token = localStorage.getItem('edugest_token');
  if (token) _authToken = token;
  const store = useEduGestStore.getState();

  // The URL is the first-class source of truth: a deep link like /students
  // restores the Students view directly. Without a deep link we fall back to
  // the last known view stored in localStorage (legacy 'home' → 'login' since
  // the landing page has been removed).
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
    // Not authenticated: only public screens can be shown, everything else
    // (including unknown or auth-only deep links) lands on the login form.
    const view: ViewType =
      urlView && (PUBLIC_VIEWS as readonly string[]).includes(urlView)
        ? (urlView as ViewType)
        : 'login';
    applyView(view);
    syncUrl(view, 'replace');
  }
}

// Back / forward buttons: translate the URL they land on back into a view.
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    const store = useEduGestStore.getState();
    const urlView = pathToView(window.location.pathname) as ViewType | null;
    let target: ViewType = urlView || 'login';
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
    applyView(view);
    syncUrl(view, 'push');
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

  selectedStudentId: null,
  setSelectedStudentId: (id) => set({ selectedStudentId: id }),

  highlightedId: null,
  setHighlightedId: (id) => set({ highlightedId: id }),

  pendingPaymentStudent: null,
  setPendingPaymentStudent: (student) => set({ pendingPaymentStudent: student }),

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
    const sessionData = { view: 'dashboard', role, userData: data, sidebar: false };
    set({
      userRole: role,
      userData: data,
      currentView: 'dashboard',
      sidebarOpen: false,
    });
    saveSession(sessionData);
    syncUrl('dashboard', 'replace');
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
    set({
      userRole: null,
      userData: null,
      currentView: 'login',
      sidebarOpen: false,
      selectedSchoolId: null,
      selectedStudentId: null,
    });
    syncUrl('login', 'replace');
  },
}))
