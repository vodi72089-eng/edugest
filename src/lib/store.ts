import { create } from 'zustand'

// ─── Persistence Helpers ─────────────────────────────────────────────────────

const VIEW_STORAGE_KEY = 'edugest_current_view';
const SIDEBAR_STORAGE_KEY = 'edugest_sidebar_open';

function getStoredView(): ViewType | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    return (stored as ViewType) || null;
  } catch {
    return null;
  }
}

function getStoredSidebar(): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

// ─── Auth Token Storage ─────────────────────────────────────────────────────

let _authToken: string | null = null;

export function setAuthToken(token: string | null) {
  _authToken = token;
  if (token) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('edugest_token', token);
    }
  } else {
    _authToken = null;
    if (typeof window !== 'undefined') {
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
export function hydrateStore(): void {
  if (typeof window === 'undefined') return;
  const storedView = getStoredView();
  const storedSidebar = getStoredSidebar();
  const token = localStorage.getItem('edugest_token');
  if (token) setAuthToken(token);
  // Note: This sets initial state, but the store's hydrate will be called from component
}

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

export const useEduGestStore = create<EduGestStore>((set, get) => ({
  currentView: 'home',
  setCurrentView: (view) => {
    set({ currentView: view });
    if (typeof window !== 'undefined') {
      try { localStorage.setItem(VIEW_STORAGE_KEY, view); } catch {}
    }
  },

  userRole: null,
  setUserRole: (role) => set({ userRole: role }),

  userData: null,
  setUserData: (data) => set({ userData: data }),

  selectedSchoolId: null,
  setSelectedSchoolId: (id) => set({ selectedSchoolId: id }),

  selectedStudentId: null,
  setSelectedStudentId: (id) => set({ selectedStudentId: id }),

  sidebarOpen: false,
  setSidebarOpen: (open) => {
    set({ sidebarOpen: open });
    if (typeof window !== 'undefined') {
      try { localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify(open)); } catch {}
    }
  },

  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),

  login: (role, data, token?: string) => {
    if (token) setAuthToken(token);
    set({
      userRole: role,
      userData: data,
      currentView: 'dashboard',
      sidebarOpen: false,
    });
  },

  logout: () => {
    setAuthToken(null);
    if (typeof window !== 'undefined') {
      try { localStorage.removeItem(VIEW_STORAGE_KEY); } catch {}
      try { localStorage.removeItem(SIDEBAR_STORAGE_KEY); } catch {}
    }
    set({
      userRole: null,
      userData: null,
      currentView: 'home',
      sidebarOpen: false,
      selectedSchoolId: null,
      selectedStudentId: null,
    });
  },

  hydrate: () => {
    if (typeof window === 'undefined') return;
    const storedView = getStoredView();
    const storedSidebar = getStoredSidebar();
    const token = localStorage.getItem('edugest_token');
    if (token) setAuthToken(token);
    if (storedView) set({ currentView: storedView });
    if (storedSidebar !== null) set({ sidebarOpen: storedSidebar });
  },
}))
