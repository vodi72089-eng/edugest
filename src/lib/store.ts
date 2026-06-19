import { create } from 'zustand'

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

  return res;
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

export type UserRole =
  | 'SUPER_ADMIN_GLOBAL'
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

  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void

  searchQuery: string
  setSearchQuery: (q: string) => void

  login: (role: UserRole, data: UserData, token?: string) => void
  logout: () => void
}

// ─── Initial State from localStorage ─────────────────────────────────────────

function getInitialState() {
  if (typeof window === 'undefined') {
    return { currentView: 'home' as ViewType, userRole: null as UserRole | null, userData: null as UserData | null, sidebarOpen: false };
  }
  const session = getStoredSession();
  const token = localStorage.getItem('edugest_token');
  if (token) _authToken = token;
  if (!session) return { currentView: 'home' as ViewType, userRole: null, userData: null, sidebarOpen: false };
  return {
    currentView: (session.view || 'home') as ViewType,
    userRole: (session.role || null) as UserRole | null,
    userData: (session.userData || null) as UserData | null,
    sidebarOpen: session.sidebar || false,
  };
}

const initial = getInitialState();

export const useEduGestStore = create<EduGestStore>((set, get) => ({
  currentView: initial.currentView,
  setCurrentView: (view) => {
    set({ currentView: view });
    saveSession({ view });
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

  sidebarOpen: initial.sidebarOpen,
  setSidebarOpen: (open) => {
    set({ sidebarOpen: open });
    saveSession({ sidebar: open });
  },

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
  },

  logout: () => {
    setAuthToken(null);
    clearSession();
    set({
      userRole: null,
      userData: null,
      currentView: 'home',
      sidebarOpen: false,
      selectedSchoolId: null,
      selectedStudentId: null,
    });
  },
}))
