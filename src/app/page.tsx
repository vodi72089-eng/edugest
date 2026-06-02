'use client'

import { useState, useEffect, useCallback } from 'react'
import { useEduGestStore, ViewType, UserRole, UserData } from '@/lib/store'
import { toast } from 'sonner'
import {
  Search, Bell, Settings, Plus, ChevronRight, Users, GraduationCap,
  DollarSign, MessageSquare, BookOpen, Shield, LogOut, Menu, X,
  MapPin, Star, School, Phone, Mail, Eye, Edit, MoreVertical,
  ArrowLeft, CheckCircle, AlertTriangle, Clock, Send, FileText,
  BarChart3, CreditCard, UserCircle, ChevronDown, Filter,
  TrendingUp, UserPlus, Calendar, ClipboardList, AlertCircle,
  Info, Zap, Globe, Lock, Award, Ban, CircleDot, ListChecks,
  LayoutDashboard, Building2, Wallet, Megaphone, PenTool, Archive,
  UsersRound, BadgeDollarSign, Siren, Heart, Target, Briefcase,
  ChevronUp, ExternalLink, Check, Minus
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell
} from 'recharts'

// ===== Types =====
interface SchoolData {
  id: string; name: string; shortName: string; email: string; phone: string;
  address: string; city: string; province: string; country: string;
  latitude?: number; longitude?: number; description?: string;
  establishmentYear?: number; subscriptionTier: string; maxStudents: number;
  schoolType: string; schoolCategory: string; averageRating: number;
  totalReviews: number; studentCount: number; classCount: number;
  isActive: boolean; _count?: { students: number; classes: number; users: number };
}

interface StudentData {
  id: string; matricule: string; firstName: string; lastName: string;
  gender?: string; dateOfBirth?: string; classId: string;
  parentId?: string; schoolId: string; schoolYearId: string;
  class?: { id: string; name: string; section?: string };
  parent?: { id: string; name: string; email?: string; phone?: string };
}

interface ClassData {
  id: string; name: string; section?: string; level?: string;
  capacity: number; schoolId: string; schoolYearId: string;
  _count?: { students: number; subjects: number };
}

interface GradeData {
  id: string; studentId: string; subjectId: string; classId: string;
  trimester: string; score: number; comment?: string; schoolYearId: string;
  student?: { id: string; firstName: string; lastName: string; matricule: string };
  subject?: { id: string; name: string; coefficient: number };
}

interface PaymentData {
  id: string; studentId: string; schoolId: string; amount: number;
  paidAmount: number; trimester: string; paymentMethod?: string;
  status: string; receiptNumber?: string; paidAt?: string; createdAt: string;
  student?: { id: string; firstName: string; lastName: string; matricule: string };
}

interface DisciplineData {
  id: string; studentId: string; type: string; severity: string;
  title: string; description: string; points: number; listType: string;
  status: string; schoolId: string; createdAt: string;
  student?: { id: string; firstName: string; lastName: string; matricule: string };
}

interface CommunicationData {
  id: string; type: string; title: string; content: string;
  targetType: string; sentToApp: boolean; sentToWhatsapp: boolean;
  sentAt: string; senderId: string; senderRole: string; schoolId: string;
}

interface HomeworkData {
  id: string; title: string; description: string; subjectName: string;
  classId: string; teacherName: string; dueDate: string; schoolId: string;
}

// ===== CONSTANTS =====
const ACCENT = 'oklch(55% 0.15 175)'
const ACCENT2 = 'oklch(45% 0.13 200)'
const ACCENT_SOFT = 'oklch(95% 0.04 175)'
const SUCCESS = 'oklch(60% 0.15 145)'
const WARNING = 'oklch(72% 0.15 65)'
const DANGER = 'oklch(58% 0.20 25)'
const INFO = 'oklch(60% 0.13 250)'
const MUTED = 'oklch(52% 0.015 250)'
const BORDER = 'oklch(92% 0.005 250)'

const PROVINCES = ['Toutes provinces', 'Kinshasa', 'Haut-Katanga', 'Dakar', 'Abidjan', 'Brazzaville', 'Nord-Kivu']
const FILTER_CHIPS = [
  { key: 'all', label: 'Toutes', count: 248 },
  { key: 'MATERNELLE', label: 'Maternelle' },
  { key: 'PRIMAIRE', label: 'Primaire' },
  { key: 'SECONDAIRE', label: 'Secondaire' },
  { key: 'MIXTE', label: 'Mixte' },
  { key: 'PRIVEE', label: 'Privée' },
  { key: 'PUBLIQUE', label: 'Publique' },
]

const COVER_GRADIENTS = [
  'from-[oklch(55%_0.15_175)] to-[oklch(45%_0.13_200)]',
  'from-[oklch(60%_0.13_250)] to-[oklch(45%_0.15_280)]',
  'from-[oklch(60%_0.15_65)] to-[oklch(50%_0.16_30)]',
  'from-[oklch(58%_0.15_145)] to-[oklch(40%_0.15_175)]',
  'from-[oklch(55%_0.20_25)] to-[oklch(45%_0.18_0)]',
  'from-[oklch(60%_0.15_295)] to-[oklch(45%_0.15_320)]',
]

const LOGO_COLORS = [
  'text-[oklch(45%_0.13_175)]', 'text-[oklch(45%_0.13_250)]',
  'text-[oklch(50%_0.13_65)]', 'text-[oklch(40%_0.13_145)]',
  'text-[oklch(45%_0.18_25)]', 'text-[oklch(45%_0.15_295)]',
]

const ENROLLMENT_DATA = [
  { month: 'Jun', value: 3200 }, { month: 'Jul', value: 3400 },
  { month: 'Aug', value: 3800 }, { month: 'Sep', value: 5200 },
  { month: 'Oct', value: 4800 }, { month: 'Nov', value: 4600 },
  { month: 'Dec', value: 4200 }, { month: 'Jan', value: 5100 },
  { month: 'Feb', value: 5400 }, { month: 'Mar', value: 5600 },
  { month: 'Apr', value: 5900 }, { month: 'May', value: 6200 },
]

const SUBSCRIPTION_DATA = [
  { name: 'Standard', value: 35, color: ACCENT },
  { name: 'Professionnel', value: 25, color: WARNING },
  { name: 'Essentiel', value: 20, color: INFO },
  { name: 'Enterprise', value: 13, color: SUCCESS },
  { name: 'Freemium', value: 7, color: DANGER },
]

// ===== HELPER FUNCTIONS =====
function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatNumber(n: number) {
  return n.toLocaleString('fr-FR')
}

function formatCurrency(n: number) {
  return n.toLocaleString('fr-FR') + '$'
}

function getSchoolTypeLabel(type: string, category: string) {
  const t = type === 'MIXTE' ? 'Mixte' : type === 'FILLES' ? 'Filles' : 'Garçons'
  const c = category === 'PRIVEE' ? 'Privée' : 'Publique'
  return `${t} · ${c}`
}

function getSubscriptionLabel(tier: string) {
  const map: Record<string, string> = {
    FREEMIUM: 'Freemium', ESSENTIEL: 'Essentiel', STANDARD: 'Standard',
    PREMIUM: 'Professionnel', ENTERPRISE: 'Enterprise', CORPORATE: 'Corporate',
  }
  return map[tier] || tier
}

function getSubscriptionPrice(tier: string) {
  const map: Record<string, string> = {
    FREEMIUM: '0$/mois', ESSENTIEL: '100$/mois', STANDARD: '250$/mois',
    PREMIUM: '500$/mois', ENTERPRISE: '1 000$/mois', CORPORATE: 'Sur mesure',
  }
  return map[tier] || ''
}

function getRoleLabel(role: UserRole): string {
  const map: Record<UserRole, string> = {
    SUPER_ADMIN_GLOBAL: 'Super Admin',
    SECRETARY: 'Secrétaire',
    CASHIER: 'Caissier',
    DIRECTION_MATERNELLE: 'Dir. Maternelle',
    DIRECTION_PRIMAIRE: 'Dir. Primaire',
    DIRECTION_SECONDAIRE: 'Dir. Secondaire',
    DISCIPLINE_MATERNELLE: 'Disc. Maternelle',
    DISCIPLINE_PRIMAIRE: 'Disc. Primaire',
    DISCIPLINE_SECONDAIRE: 'Disc. Secondaire',
    TEACHER: 'Enseignant',
    HEAD_TEACHER: 'Prof. Principal',
    PARENT: 'Parent',
  }
  return map[role] || role
}

function getStatusPill(status: string) {
  if (status === 'PAID' || status === 'Actif' || status === 'ACTIVE') return 'bg-[oklch(94%_0.05_145)] text-[oklch(40%_0.13_145)]'
  if (status === 'PARTIAL' || status === 'À renouveler') return 'bg-[oklch(94%_0.06_65)] text-[oklch(45%_0.13_65)]'
  if (status === 'OVERDUE' || status === 'Suspendu') return 'bg-[oklch(94%_0.05_25)] text-[oklch(45%_0.18_25)]'
  return 'bg-[oklch(94%_0.005_250)] text-[oklch(52%_0.015_250)]'
}

// ===== BRAND Mark =====
function BrandMark({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="/edugest-logo.png"
      alt="EduGest"
      className={`object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  )
}

// ===== PUBLIC HEADER =====
function PublicHeader() {
  const { setCurrentView } = useEduGestStore()
  const [mobileMenu, setMobileMenu] = useState(false)
  return (
    <header className="sticky top-0 z-50 bg-white/85 backdrop-blur-xl border-b border-edu-border">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <button onClick={() => setCurrentView('home')} className="flex items-center gap-2.5 font-bold text-base">
          <BrandMark />
        </button>
        <nav className="hidden sm:flex items-center gap-1">
          <button onClick={() => setCurrentView('home')} className="px-3.5 py-2 rounded-lg text-sm font-medium text-edu-muted hover:text-edu-fg hover:bg-edu-surface2 transition">Écoles</button>
          <button onClick={() => setCurrentView('pricing')} className="px-3.5 py-2 rounded-lg text-sm font-medium text-edu-muted hover:text-edu-fg hover:bg-edu-surface2 transition">Tarifs</button>
          <button onClick={() => setCurrentView('login')} className="ml-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition hover:-translate-y-px" style={{ background: ACCENT }}>Se connecter</button>
        </nav>
        <button className="sm:hidden p-2" onClick={() => setMobileMenu(!mobileMenu)}>
          {mobileMenu ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {mobileMenu && (
        <div className="sm:hidden border-t border-edu-border bg-white p-4 flex flex-col gap-2">
          <button onClick={() => { setCurrentView('home'); setMobileMenu(false) }} className="text-left px-3 py-2 rounded-lg text-sm font-medium text-edu-muted hover:bg-edu-surface2">Écoles</button>
          <button onClick={() => { setCurrentView('pricing'); setMobileMenu(false) }} className="text-left px-3 py-2 rounded-lg text-sm font-medium text-edu-muted hover:bg-edu-surface2">Tarifs</button>
          <button onClick={() => { setCurrentView('login'); setMobileMenu(false) }} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: ACCENT }}>Se connecter</button>
        </div>
      )}
    </header>
  )
}

// ===== FOOTER =====
function Footer() {
  const { setCurrentView } = useEduGestStore()
  return (
    <footer className="border-t border-edu-border bg-white mt-auto">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
        <div>
          <div className="mb-3"><BrandMark size={32} /></div>
          <p className="text-sm text-edu-muted leading-relaxed max-w-[280px]">
            La plateforme de gestion scolaire multi-écoles qui simplifie la vie des directions, enseignants et parents.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-edu-muted mb-3.5">Produit</h4>
          <ul className="space-y-2">
            <li><button onClick={() => setCurrentView('home')} className="text-sm text-edu-fg hover:text-edu-accent transition">Trouver une école</button></li>
            <li><button onClick={() => setCurrentView('pricing')} className="text-sm text-edu-fg hover:text-edu-accent transition">Tarifs</button></li>
            <li><button onClick={() => setCurrentView('login')} className="text-sm text-edu-fg hover:text-edu-accent transition">Connexion</button></li>
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-edu-muted mb-3.5">Rôles</h4>
          <ul className="space-y-2 text-sm text-edu-fg">
            <li>Super Admin</li><li>Secrétaire</li><li>Parent</li>
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-edu-muted mb-3.5">Contact</h4>
          <ul className="space-y-2 text-sm text-edu-muted">
            <li>support@edugest.app</li><li>+243 81 234 56 78</li><li>Kinshasa · RDC</li>
          </ul>
        </div>
      </div>
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 pt-6 border-t border-edu-border flex flex-col sm:flex-row justify-between text-xs text-edu-muted pb-6">
        <span>© 2026 EduGest · Tous droits réservés</span>
        <span>Conditions · Confidentialité · Cookies</span>
      </div>
    </footer>
  )
}

// ===== MAP COMPONENT =====
function SchoolMap({ schools }: { schools: SchoolData[] }) {
  const [mounted, setMounted] = useState(false)
  const [leafletLoaded, setLeafletLoaded] = useState(false)
  const [L, setL] = useState<typeof import('leaflet') | null>(null)
  const [RL, setRL] = useState<typeof import('react-leaflet') | null>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!mounted) return
    async function loadLeaflet() {
      try {
        const leaflet = await import('leaflet')
        const reactLeaflet = await import('react-leaflet')
        // Fix default marker icons
        delete (leaflet.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
        leaflet.Icon.Default.mergeOptions({
          iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
          iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        })
        setL(() => leaflet)
        setRL(() => reactLeaflet)
        setLeafletLoaded(true)
      } catch (e) {
        console.error('Failed to load leaflet', e)
      }
    }
    loadLeaflet()
  }, [mounted])

  if (!mounted || !leafletLoaded || !RL || !L) {
    return <div className="h-[400px] bg-edu-surface2 animate-pulse rounded-xl" />
  }

  const { MapContainer, TileLayer, Marker, Popup } = RL
  const schoolsWithCoords = schools.filter(s => s.latitude && s.longitude)

  return (
    <MapContainer center={[-4.3, 15.3]} zoom={5} style={{ height: 400, borderRadius: 12 }} className="z-0">
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
      {schoolsWithCoords.map(s => (
        <Marker key={s.id} position={[s.latitude!, s.longitude!]}>
          <Popup>
            <strong>{s.name}</strong><br />{s.city} · {s.country}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}

// ===== HOME VIEW =====
function HomeView() {
  const { setCurrentView, setSelectedSchoolId } = useEduGestStore()
  const [schools, setSchools] = useState<SchoolData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [province, setProvince] = useState('Toutes provinces')
  const [activeFilter, setActiveFilter] = useState('all')
  const [showMap, setShowMap] = useState(false)

  useEffect(() => {
    async function loadData() {
      try {
        await fetch('/api/seed')
        const res = await fetch('/api/schools?limit=20')
        const json = await res.json()
        setSchools(json.data || [])
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const filteredSchools = schools.filter(s => {
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.city.toLowerCase().includes(search.toLowerCase())) return false
    if (province !== 'Toutes provinces' && s.province !== province) return false
    if (activeFilter !== 'all') {
      if (['MATERNELLE', 'PRIMAIRE', 'SECONDAIRE'].includes(activeFilter) && s.schoolType !== activeFilter && s.schoolType !== 'MIXTE') return false
      if (activeFilter === 'MIXTE' && s.schoolType !== 'MIXTE') return false
      if (activeFilter === 'PRIVEE' && s.schoolCategory !== 'PRIVEE') return false
      if (activeFilter === 'PUBLIQUE' && s.schoolCategory !== 'PUBLIQUE') return false
    }
    return true
  })

  return (
    <div className="min-h-screen flex flex-col bg-edu-bg">
      <PublicHeader />

      {/* Hero */}
      <section className="relative overflow-hidden py-16 sm:py-20" style={{ background: 'linear-gradient(180deg, oklch(96% 0.015 175) 0%, oklch(98% 0.003 220) 100%)' }}>
        <div className="absolute inset-0 opacity-40" style={{
          backgroundImage: 'radial-gradient(oklch(75% 0.1 175 / .25) 1px, transparent 1px), radial-gradient(oklch(75% 0.1 175 / .18) 1px, transparent 1px)',
          backgroundSize: '32px 32px, 32px 32px',
          backgroundPosition: '0 0, 16px 16px',
          maskImage: 'radial-gradient(ellipse at top, black, transparent 70%)',
          WebkitMaskImage: 'radial-gradient(ellipse at top, black, transparent 70%)',
        }} />
        <div className="relative max-w-[760px] mx-auto px-4 text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-extrabold tracking-tight leading-[1.05] mb-4">
            Trouvez <span className="edu-accent">votre école</span>
          </h1>
          <p className="text-base sm:text-[17px] text-edu-muted leading-relaxed mb-8 max-w-[600px] mx-auto">
            Plus de 240 établissements partenaires à travers l&apos;Afrique francophone. Comparez, contactez et inscrivez votre enfant en quelques clics.
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-white border border-edu-border rounded-[14px] p-1.5 max-w-[760px] mx-auto shadow-[0_4px_16px_-4px_rgba(15,23,42,.08)]">
            <div className="flex items-center gap-2.5 px-3 flex-1">
              <Search size={18} className="text-edu-muted shrink-0" />
              <input
                type="text" placeholder="Rechercher une école par nom..."
                value={search} onChange={e => setSearch(e.target.value)}
                className="flex-1 border-0 outline-none bg-transparent text-sm py-3 placeholder:text-[oklch(70%_0.01_250)]"
              />
            </div>
            <select
              value={province} onChange={e => setProvince(e.target.value)}
              className="border-0 bg-edu-bg py-2.5 px-3 rounded-[9px] text-[13px] border-r border-edu-border outline-none cursor-pointer"
            >
              {PROVINCES.map(p => <option key={p}>{p}</option>)}
            </select>
            <button className="px-5 py-3 rounded-[9px] text-white text-sm font-medium transition hover:opacity-90" style={{ background: ACCENT }}>
              Rechercher
            </button>
          </div>
        </div>
      </section>

      {/* Filters */}
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6 pb-3 flex items-center gap-2 flex-wrap">
        {FILTER_CHIPS.map(chip => (
          <button
            key={chip.key}
            onClick={() => setActiveFilter(chip.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-[7px] rounded-full text-[13px] font-medium transition border cursor-pointer ${
              activeFilter === chip.key
                ? 'text-white border-transparent'
                : 'bg-white border-edu-border text-edu-fg hover:border-[oklch(80%_0.04_175)]'
            }`}
            style={activeFilter === chip.key ? { background: ACCENT } : undefined}
          >
            {chip.label}
            {chip.count !== undefined && (
              <span className={`text-[11px] font-medium px-1.5 py-px rounded-full ${
                activeFilter === chip.key ? 'bg-white/20 text-white' : 'bg-[oklch(94%_0.005_250)] text-edu-muted'
              }`}>{chip.count}</span>
            )}
          </button>
        ))}
        <div className="ml-auto hidden sm:block text-[13px] text-edu-muted">
          Affichage {filteredSchools.length > 0 ? '1' : '0'}–{Math.min(12, filteredSchools.length)} sur {filteredSchools.length}
        </div>
        <button
          onClick={() => setShowMap(!showMap)}
          className="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium border border-edu-border bg-white hover:border-[oklch(80%_0.04_175)] transition"
        >
          <MapPin size={14} /> {showMap ? 'Masquer carte' : 'Voir carte'}
        </button>
      </div>

      {/* Map */}
      {showMap && (
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 mb-6">
          <SchoolMap schools={filteredSchools} />
        </div>
      )}

      {/* School Cards */}
      <section className="max-w-[1280px] mx-auto px-4 sm:px-6 pb-16 flex-1">
        <div className="flex items-baseline justify-between mb-4">
          <div className="text-sm text-edu-muted">
            <strong className="text-edu-fg font-semibold">{filteredSchools.length} écoles</strong> correspondent à votre recherche
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="bg-white border border-edu-border rounded-[14px] overflow-hidden animate-pulse">
                <div className="h-[120px] bg-edu-surface2" />
                <div className="p-5 pt-8 space-y-3"><div className="h-4 bg-edu-surface2 rounded w-3/4" /><div className="h-3 bg-edu-surface2 rounded w-1/2" /></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSchools.map((school, idx) => (
              <button
                key={school.id}
                onClick={() => { setSelectedSchoolId(school.id); setCurrentView('school-detail') }}
                className="block text-left bg-white border border-edu-border rounded-[14px] overflow-hidden transition hover:-translate-y-0.5 hover:shadow-[0_4px_16px_-4px_rgba(15,23,42,.08)] hover:border-[oklch(80%_0.04_175)] group"
              >
                <div className={`h-[120px] relative bg-gradient-to-br ${COVER_GRADIENTS[idx % COVER_GRADIENTS.length]} flex items-end p-3`}>
                  <span className="absolute top-3 right-3 bg-white/95 backdrop-blur-sm px-2.5 py-1 rounded-full text-[11px] font-medium">
                    {getSchoolTypeLabel(school.schoolType, school.schoolCategory)}
                  </span>
                  <div className={`w-12 h-12 rounded-[10px] bg-white grid place-items-center font-extrabold text-lg shadow-md relative top-6 ${LOGO_COLORS[idx % LOGO_COLORS.length]}`}>
                    {school.shortName.substring(0, 2)}
                  </div>
                </div>
                <div className="p-5 pt-8">
                  <div className="text-base font-semibold tracking-tight mb-1">{school.name}</div>
                  <div className="text-[13px] text-edu-muted flex items-center gap-1 mb-3.5">
                    <MapPin size={12} /> {school.city} · {school.province}
                  </div>
                  <div className="flex gap-3.5 py-3 border-t border-b border-edu-border mb-3.5">
                    <div className="text-xs text-edu-muted">
                      <strong className="block text-[15px] text-edu-fg font-semibold tabular-nums mb-0.5">{formatNumber(school._count?.students || school.studentCount)}</strong>élèves
                    </div>
                    <div className="text-xs text-edu-muted">
                      <strong className="block text-[15px] text-edu-fg font-semibold tabular-nums mb-0.5">{school._count?.classes || school.classCount}</strong>classes
                    </div>
                    <div className="text-xs text-edu-muted">
                      <strong className="block text-[15px] text-edu-fg font-semibold tabular-nums mb-0.5">{school.establishmentYear || '—'}</strong>fondée
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-[13px] font-medium">
                      <Star size={14} className="fill-[oklch(72%_0.15_65)] text-[oklch(72%_0.15_65)]" />
                      {school.averageRating?.toFixed(1) || '—'}
                      <span className="text-edu-muted font-normal text-xs">· {school.totalReviews} avis</span>
                    </div>
                    <span className="text-[13px] font-medium text-white px-3.5 py-[7px] rounded-lg transition" style={{ background: ACCENT }}>
                      Voir l&apos;école →
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <Footer />
    </div>
  )
}

// ===== SCHOOL DETAIL VIEW =====
function SchoolDetailView() {
  const { setCurrentView, selectedSchoolId } = useEduGestStore()
  const [school, setSchool] = useState<SchoolData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!selectedSchoolId) return
    async function load() {
      try {
        const res = await fetch(`/api/schools/${selectedSchoolId}`)
        const json = await res.json()
        setSchool(json.data || json)
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [selectedSchoolId])

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-edu-accent border-t-transparent rounded-full" /></div>

  if (!school) return (
    <div className="min-h-screen flex flex-col bg-edu-bg">
      <PublicHeader />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-edu-muted mb-4">École non trouvée</p>
          <button onClick={() => setCurrentView('home')} className="text-edu-accent font-medium">← Retour à l&apos;accueil</button>
        </div>
      </div>
      <Footer />
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col bg-edu-bg">
      <PublicHeader />
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-8 flex-1">
        <button onClick={() => setCurrentView('home')} className="inline-flex items-center gap-1.5 text-sm text-edu-muted hover:text-edu-fg mb-6 transition">
          <ArrowLeft size={14} /> Retour aux écoles
        </button>

        <div className="bg-white border border-edu-border rounded-2xl overflow-hidden">
          <div className={`h-48 bg-gradient-to-br ${COVER_GRADIENTS[0]} relative`}>
            <span className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium">
              {getSchoolTypeLabel(school.schoolType, school.schoolCategory)}
            </span>
          </div>
          <div className="px-6 sm:px-8 pb-8 -mt-12 relative">
            <div className="w-20 h-20 rounded-2xl bg-white grid place-items-center text-2xl font-extrabold shadow-lg border border-edu-border text-[oklch(45%_0.13_175)]">
              {school.shortName.substring(0, 2)}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold mt-4 tracking-tight">{school.name}</h1>
            <div className="flex items-center gap-2 text-sm text-edu-muted mt-2">
              <MapPin size={14} /> {school.address}, {school.city} · {school.province}, {school.country}
            </div>
            <div className="flex items-center gap-4 mt-3 text-sm">
              <span className="flex items-center gap-1"><Star size={14} className="fill-[oklch(72%_0.15_65)] text-[oklch(72%_0.15_65)]" /> {school.averageRating?.toFixed(1)} ({school.totalReviews} avis)</span>
              <span className="text-edu-muted">·</span>
              <span className="text-edu-muted">{school._count?.students || school.studentCount} élèves</span>
              <span className="text-edu-muted">·</span>
              <span className="text-edu-muted">{school._count?.classes || school.classCount} classes</span>
              <span className="text-edu-muted">·</span>
              <span className="text-edu-muted">Fondée en {school.establishmentYear}</span>
            </div>

            {school.description && (
              <div className="mt-6">
                <h3 className="font-semibold mb-2">À propos</h3>
                <p className="text-sm text-edu-muted leading-relaxed">{school.description}</p>
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-edu-surface2 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold">{formatNumber(school._count?.students || school.studentCount)}</div>
                <div className="text-xs text-edu-muted mt-1">Élèves</div>
              </div>
              <div className="bg-edu-surface2 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold">{school._count?.classes || school.classCount}</div>
                <div className="text-xs text-edu-muted mt-1">Classes</div>
              </div>
              <div className="bg-edu-surface2 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold">{school.establishmentYear || '—'}</div>
                <div className="text-xs text-edu-muted mt-1">Fondée</div>
              </div>
              <div className="bg-edu-surface2 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold">{getSubscriptionLabel(school.subscriptionTier)}</div>
                <div className="text-xs text-edu-muted mt-1">Abonnement</div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <div className="flex items-center gap-2 text-sm"><Mail size={14} className="text-edu-muted" /> {school.email}</div>
              <div className="flex items-center gap-2 text-sm"><Phone size={14} className="text-edu-muted" /> {school.phone}</div>
            </div>

            {school.latitude && school.longitude && (
              <div className="mt-8">
                <h3 className="font-semibold mb-3">Localisation</h3>
                <SchoolMap schools={[school]} />
              </div>
            )}

            <div className="mt-8">
              <button onClick={() => setCurrentView('login')} className="px-6 py-3 rounded-xl text-white font-medium transition hover:-translate-y-px" style={{ background: ACCENT }}>
                Contacter cette école
              </button>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  )
}

// ===== PRICING VIEW =====
function PricingView() {
  const { setCurrentView } = useEduGestStore()
  const tiers = [
    { name: 'Freemium', price: '0$', period: '/mois', desc: 'Pour découvrir EduGest', features: ['1 admin', '100 élèves max', '0 msg WhatsApp', 'Gestion basique'], color: MUTED },
    { name: 'Essentiel', price: '100$', period: '/mois', desc: 'Pour les petites structures', features: ['1 admin', 'Professeurs illimités', '500 msg WhatsApp/mois', 'Notes & bulletins'], color: INFO },
    { name: 'Standard', price: '250$', period: '/mois', desc: 'Le choix des écoles', features: ['5 admins', '10 professeurs', 'WhatsApp illimité', 'Paiements mobiles', 'Communications'], color: ACCENT, popular: true },
    { name: 'Professionnel', price: '500$', period: '/mois', desc: 'Pour les grands établissements', features: ['Admins illimités', 'Profs illimités', 'App mobile dédiée', 'Support prioritaire', 'API accès'], color: WARNING },
    { name: 'Enterprise', price: '1 000$', period: '/mois', desc: 'Multi-écoles', features: ['3 écoles incluses', 'Serveur dédié', 'Formation équipe', 'SLA garanti'], color: SUCCESS },
    { name: 'Corporate', price: 'Sur mesure', period: '', desc: 'Groupes scolaires', features: ['Écoles illimitées', 'On-premise', 'Marque blanche', 'Intégration sur mesure'], color: DANGER },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-edu-bg">
      <PublicHeader />
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-16 flex-1">
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3">Tarifs <span className="edu-accent">transparents</span></h1>
          <p className="text-edu-muted max-w-[500px] mx-auto">Choisissez la formule adaptée à votre établissement. Évoluez à tout moment.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tiers.map(tier => (
            <div key={tier.name} className={`bg-white border rounded-2xl p-6 relative transition hover:-translate-y-1 hover:shadow-lg ${tier.popular ? 'border-edu-accent ring-2 ring-edu-accent/20' : 'border-edu-border'}`}>
              {tier.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-semibold text-white" style={{ background: ACCENT }}>Populaire</span>
              )}
              <h3 className="text-lg font-bold">{tier.name}</h3>
              <p className="text-sm text-edu-muted mt-1 mb-4">{tier.desc}</p>
              <div className="mb-6">
                <span className="text-3xl font-extrabold">{tier.price}</span>
                <span className="text-sm text-edu-muted">{tier.period}</span>
              </div>
              <ul className="space-y-2.5 mb-6">
                {tier.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <CheckCircle size={14} style={{ color: tier.color }} /> {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setCurrentView('login')}
                className={`w-full py-2.5 rounded-xl text-sm font-medium transition ${
                  tier.popular ? 'text-white hover:opacity-90' : 'border border-edu-border text-edu-fg hover:bg-edu-surface2'
                }`}
                style={tier.popular ? { background: ACCENT } : undefined}
              >
                {tier.price === 'Sur mesure' ? 'Nous contacter' : 'Commencer'}
              </button>
            </div>
          ))}
        </div>
      </div>
      <Footer />
    </div>
  )
}

// ===== LOGIN VIEW =====
function LoginView() {
  const { setCurrentView, login } = useEduGestStore()
  const [tab, setTab] = useState<'parent' | 'admin'>('parent')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    try {
      // Demo login - try API first, fall back to demo accounts
      try {
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
        const json = await res.json()
        if (json.data) {
          const userData = json.data
          const role = mapApiRole(userData.role)
          if (role) {
            login(role, {
              name: userData.name,
              role,
              schoolId: userData.schoolId,
              schoolName: userData.school?.name || 'EduGest',
              initials: getInitials(userData.name),
            })
            toast.success(`Bienvenue, ${userData.name}!`)
            return
          }
        }
      } catch { /* fallback */ }

      // Demo fallback
      if (tab === 'parent') {
        login('PARENT', { name: 'Papa Kazadi', role: 'PARENT', schoolId: 'demo', schoolName: 'Complexe Scolaire Lumière', initials: 'PK' })
        toast.success('Bienvenue, Papa Kazadi!')
      } else {
        login('SUPER_ADMIN_GLOBAL', { name: 'Admin Global', role: 'SUPER_ADMIN_GLOBAL', schoolId: 'demo', schoolName: 'EduGest Platform', initials: 'AG' })
        toast.success('Bienvenue, Admin Global!')
      }
    } catch (e) {
      toast.error('Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  function mapApiRole(role: string): UserRole | null {
    const map: Record<string, UserRole> = {
      SUPER_ADMIN_GLOBAL: 'SUPER_ADMIN_GLOBAL', SECRETARY: 'SECRETARY', CASHIER: 'CASHIER',
      DIRECTION: 'DIRECTION_PRIMAIRE', DISCIPLINE: 'DISCIPLINE_PRIMAIRE',
      TEACHER: 'TEACHER', HEAD_TEACHER: 'HEAD_TEACHER', PARENT: 'PARENT',
    }
    return map[role] || null
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Left brand side */}
      <div className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden text-white" style={{ background: 'linear-gradient(160deg, oklch(50% 0.13 175) 0%, oklch(35% 0.12 220) 100%)' }}>
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(white 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }} />
        <div className="absolute -top-24 -right-24 w-[480px] h-[480px] rounded-full opacity-25" style={{ background: 'radial-gradient(oklch(75% 0.1 175), transparent 70%)' }} />
        <div className="relative flex items-center gap-2.5 font-bold text-lg">
          <BrandMark size={40} />
        </div>
        <div className="relative max-w-[460px]">
          <h2 className="text-[34px] font-extrabold tracking-tight leading-[1.15] mb-3.5">
            Bienvenue sur la plateforme de gestion scolaire préférée en Afrique francophone.
          </h2>
          <p className="text-base opacity-85 leading-relaxed">
            Notes, paiements, communications, bulletins — tout est centralisé pour vous faire gagner du temps.
          </p>
          <div className="mt-6 space-y-3.5">
            {[
              { icon: <CheckCircle size={16} />, title: 'Multi-écoles', desc: 'Gérez plusieurs établissements depuis un seul compte' },
              { icon: <MessageSquare size={16} />, title: 'Notifications WhatsApp', desc: 'Alertes instantanées pour les parents' },
              { icon: <CreditCard size={16} />, title: 'Paiement mobile', desc: 'Orange Money, M-Pesa, Airtel Money acceptés' },
            ].map((f, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/12 border border-white/15 flex items-center justify-center shrink-0">{f.icon}</div>
                <div className="text-[13px] opacity-90 leading-relaxed"><strong className="block opacity-100">{f.title}</strong>{f.desc}</div>
              </div>
            ))}
          </div>
          <div className="mt-8 bg-white/8 border border-white/12 rounded-[14px] p-4 backdrop-blur-sm">
            <p className="text-sm leading-relaxed mb-3">&ldquo;EduGest nous a fait gagner 12h par semaine sur la gestion des notes et paiements. Les parents adorent les notifications WhatsApp.&rdquo;</p>
            <div className="flex items-center gap-2.5 text-xs opacity-85">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[oklch(70%_0.15_65)] to-[oklch(55%_0.13_30)] grid place-items-center font-semibold text-xs">MK</div>
              Mme Kabongo · Directrice, Complexe Lumière
            </div>
          </div>
        </div>
        <div className="relative text-[13px] opacity-70">© 2026 EduGest · Kinshasa · Dakar · Abidjan</div>
      </div>

      {/* Right form side */}
      <div className="flex items-center justify-center p-6 sm:p-12 bg-edu-bg">
        <div className="w-full max-w-[400px]">
          <button onClick={() => setCurrentView('home')} className="inline-flex items-center gap-1.5 text-[13px] text-edu-muted hover:text-edu-fg mb-6 transition">
            <ArrowLeft size={14} /> Retour à l&apos;accueil
          </button>
          <div className="mb-6">
            <h1 className="text-[28px] font-bold tracking-tight mb-1.5">
              {tab === 'parent' ? 'Connexion Parent' : 'Connexion Administration'}
            </h1>
            <p className="text-sm text-edu-muted">
              {tab === 'parent' ? 'Accédez au suivi scolaire de vos enfants' : 'Personnel de l\'école, direction, enseignants'}
            </p>
          </div>

          <div className="flex bg-white border border-edu-border rounded-[11px] p-1 mb-6">
            <button onClick={() => setTab('parent')} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${tab === 'parent' ? 'text-white' : 'text-edu-muted hover:text-edu-fg'}`} style={tab === 'parent' ? { background: ACCENT, boxShadow: `0 2px 8px oklch(55% 0.15 175 / .25)` } : undefined}>
              Parent
            </button>
            <button onClick={() => setTab('admin')} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${tab === 'admin' ? 'text-white' : 'text-edu-muted hover:text-edu-fg'}`} style={tab === 'admin' ? { background: ACCENT, boxShadow: `0 2px 8px oklch(55% 0.15 175 / .25)` } : undefined}>
              Administration
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium">{tab === 'parent' ? 'Email ou numéro WhatsApp' : 'Email professionnel'}</label>
              <input
                type="text" value={email} onChange={e => setEmail(e.target.value)}
                placeholder={tab === 'parent' ? 'ex. parent@email.com ou +243 81...' : 'ex. direction@ecole.cd'}
                className="w-full px-3.5 py-3 border border-edu-border rounded-[9px] text-sm bg-white outline-none transition focus:border-edu-accent focus:ring-[3px] focus:ring-edu-accent-soft"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium">Mot de passe</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-3 border border-edu-border rounded-[9px] text-sm bg-white outline-none transition focus:border-edu-accent focus:ring-[3px] focus:ring-edu-accent-soft"
                required
              />
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <label className="flex items-center gap-2 cursor-pointer text-edu-muted">
                <input type="checkbox" className="accent-edu-accent" /> Se souvenir de moi
              </label>
              <button type="button" className="text-edu-accent font-medium hover:underline">Mot de passe oublié ?</button>
            </div>
            <button type="submit" disabled={loading} className="w-full py-3 rounded-[10px] text-white font-medium text-sm flex items-center justify-center gap-2 transition hover:-translate-y-px disabled:opacity-50" style={{ background: ACCENT, boxShadow: `0 2px 8px oklch(55% 0.15 175 / .25)` }}>
              {loading ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Se connecter'}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5 text-edu-muted text-xs uppercase tracking-wider">
            <div className="flex-1 h-px bg-edu-border" /> ou <div className="flex-1 h-px bg-edu-border" />
          </div>

          <button
            onClick={() => {
              if (tab === 'parent') {
                login('PARENT', { name: 'Papa Kazadi', role: 'PARENT', schoolId: 'demo', schoolName: 'Complexe Scolaire Lumière', initials: 'PK' })
              } else {
                login('SECRETARY', { name: 'Claudine Ngoie', role: 'SECRETARY', schoolId: 'demo', schoolName: 'Complexe Scolaire Lumière', initials: 'CN' })
              }
              toast.success('Connexion WhatsApp réussie!')
            }}
            className="w-full py-3 rounded-[10px] text-white font-medium text-sm flex items-center justify-center gap-2 transition hover:opacity-90"
            style={{ background: SUCCESS }}
          >
            <MessageSquare size={18} /> Se connecter avec WhatsApp
          </button>

          <p className="text-center text-[13px] text-edu-muted mt-6">
            Pas encore de compte ? <button onClick={() => setCurrentView('pricing')} className="text-edu-accent font-medium hover:underline">Découvrir les formules</button>
          </p>
        </div>
      </div>
    </div>
  )
}

// ===== SIDEBAR =====
function Sidebar() {
  const { userRole, userData, currentView, setCurrentView, logout, sidebarOpen, setSidebarOpen } = useEduGestStore()

  type MenuItem = { icon: React.ReactNode; label: string; view: ViewType; badge?: number }
  const menus: Record<string, MenuItem[]> = {
    SUPER_ADMIN_GLOBAL: [
      { icon: <LayoutDashboard size={16} />, label: 'Dashboard', view: 'dashboard' },
      { icon: <Building2 size={16} />, label: 'Écoles', view: 'schools', badge: 12 },
      { icon: <Users size={16} />, label: 'Utilisateurs', view: 'students' },
      { icon: <CreditCard size={16} />, label: 'Abonnements', view: 'payments' },
      { icon: <TrendingUp size={16} />, label: 'Revenus', view: 'payments' },
      { icon: <BadgeDollarSign size={16} />, label: 'Tarifs', view: 'pricing' },
      { icon: <UserCircle size={16} />, label: 'Mon profil', view: 'profile' },
    ],
    SECRETARY: [
      { icon: <LayoutDashboard size={16} />, label: 'Dashboard', view: 'dashboard' },
      { icon: <Users size={16} />, label: 'Élèves', view: 'students' },
      { icon: <MessageSquare size={16} />, label: 'Communications', view: 'communications' },
      { icon: <CreditCard size={16} />, label: 'Paiements', view: 'payments' },
      { icon: <ListChecks size={16} />, label: 'Passage de classe', view: 'class-passing' },
      { icon: <UserCircle size={16} />, label: 'Mon profil', view: 'profile' },
    ],
    CASHIER: [
      { icon: <LayoutDashboard size={16} />, label: 'Dashboard', view: 'dashboard' },
      { icon: <CreditCard size={16} />, label: 'Enregistrer paiement', view: 'payments' },
      { icon: <AlertTriangle size={16} />, label: 'Dettes', view: 'payments', badge: 84 },
      { icon: <BarChart3 size={16} />, label: 'Situation financière', view: 'payments' },
      { icon: <UserCircle size={16} />, label: 'Mon profil', view: 'profile' },
    ],
    PARENT: [
      { icon: <Users size={16} />, label: 'Mes enfants', view: 'dashboard' },
      { icon: <BookOpen size={16} />, label: 'Notes', view: 'grades' },
      { icon: <FileText size={16} />, label: 'Bulletins', view: 'bulletin' },
      { icon: <CreditCard size={16} />, label: 'Paiements', view: 'payments' },
      { icon: <Shield size={16} />, label: 'Discipline', view: 'discipline' },
      { icon: <PenTool size={16} />, label: 'Devoirs', view: 'homework' },
      { icon: <UserCircle size={16} />, label: 'Mon profil', view: 'profile' },
    ],
    TEACHER: [
      { icon: <LayoutDashboard size={16} />, label: 'Dashboard', view: 'dashboard' },
      { icon: <School size={16} />, label: 'Mes Classes', view: 'classes' },
      { icon: <BookOpen size={16} />, label: 'Notes', view: 'grades' },
      { icon: <PenTool size={16} />, label: 'Devoirs', view: 'homework' },
      { icon: <UserCircle size={16} />, label: 'Mon profil', view: 'profile' },
    ],
    HEAD_TEACHER: [
      { icon: <LayoutDashboard size={16} />, label: 'Dashboard', view: 'dashboard' },
      { icon: <School size={16} />, label: 'Ma Classe', view: 'classes' },
      { icon: <FileText size={16} />, label: 'Bulletins', view: 'bulletin' },
      { icon: <UserCircle size={16} />, label: 'Mon profil', view: 'profile' },
    ],
  }

  // Direction roles
  const directionRoles: UserRole[] = ['DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE']
  const disciplineRoles: UserRole[] = ['DISCIPLINE_MATERNELLE', 'DISCIPLINE_PRIMAIRE', 'DISCIPLINE_SECONDAIRE']

  let menuItems: MenuItem[] = menus[userRole || ''] || menus.SECRETARY

  if (directionRoles.includes(userRole as UserRole)) {
    menuItems = [
      { icon: <LayoutDashboard size={16} />, label: 'Dashboard', view: 'dashboard' },
      { icon: <Users size={16} />, label: 'Élèves', view: 'students' },
      { icon: <School size={16} />, label: 'Classes', view: 'classes' },
      { icon: <CreditCard size={16} />, label: 'Paiements', view: 'payments' },
      { icon: <Megaphone size={16} />, label: 'Convocation', view: 'convocation' },
      { icon: <UserCircle size={16} />, label: 'Mon profil', view: 'profile' },
    ]
  }

  if (disciplineRoles.includes(userRole as UserRole)) {
    menuItems = [
      { icon: <LayoutDashboard size={16} />, label: 'Dashboard', view: 'dashboard' },
      { icon: <Ban size={16} />, label: 'Liste Noire', view: 'discipline' },
      { icon: <AlertTriangle size={16} />, label: 'Liste Grise', view: 'discipline' },
      { icon: <Heart size={16} />, label: 'Liste Blanche', view: 'discipline' },
      { icon: <UserCircle size={16} />, label: 'Mon profil', view: 'profile' },
    ]
  }

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed lg:sticky top-0 left-0 z-50 lg:z-auto h-screen w-[240px] bg-white border-r border-edu-border flex flex-col transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-[18px] flex items-center gap-2.5 border-b border-edu-border">
          <BrandMark size={32} />
          <div className="text-[11px] text-edu-muted font-medium">{getRoleLabel(userRole!)}</div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
          <div className="px-5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-edu-muted">Navigation</div>
          <nav className="flex flex-col gap-0.5 px-3">
            {menuItems.map(item => (
              <button
                key={item.label}
                onClick={() => { setCurrentView(item.view); setSidebarOpen(false) }}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] font-medium transition relative ${
                  currentView === item.view ? 'bg-edu-accent-soft text-edu-accent font-semibold' : 'text-edu-fg hover:bg-edu-surface2'
                }`}
              >
                <span className={currentView === item.view ? 'text-edu-accent' : 'opacity-70'}>{item.icon}</span>
                {item.label}
                {item.badge && <span className="ml-auto bg-[oklch(58%_0.20_25)] text-white text-[10px] px-1.5 py-px rounded-full font-semibold">{item.badge}</span>}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-3 border-t border-edu-border">
          <div className="flex items-center gap-2.5 p-2.5 rounded-[10px] bg-edu-surface2">
            <div className="w-9 h-9 rounded-full grid place-items-center text-white font-semibold text-[13px] shrink-0" style={{ background: `linear-gradient(135deg, oklch(55% 0.15 280), oklch(45% 0.15 320))` }}>
              {userData?.initials || '??'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold truncate">{userData?.name || 'Utilisateur'}</div>
              <div className="text-[11px] text-edu-muted truncate">{userData?.schoolName || ''}</div>
            </div>
            <button onClick={logout} className="text-edu-muted hover:text-edu-danger transition shrink-0"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>
    </>
  )
}

// ===== TOPBAR =====
function Topbar() {
  const { currentView, sidebarOpen, setSidebarOpen } = useEduGestStore()
  const viewTitles: Record<string, string> = {
    dashboard: 'Dashboard', students: 'Élèves', classes: 'Classes', grades: 'Notes',
    payments: 'Paiements', discipline: 'Discipline', communications: 'Communications',
    homework: 'Devoirs', profile: 'Mon profil', pricing: 'Tarifs', 'class-passing': 'Passage de classe',
    bulletin: 'Bulletins', convocation: 'Convocation', schools: 'Écoles',
  }

  return (
    <header className="sticky top-0 z-20 bg-white border-b border-edu-border h-16 flex items-center justify-between px-4 sm:px-6">
      <div className="flex items-center gap-4">
        <button className="lg:hidden p-2 rounded-lg hover:bg-edu-surface2" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <div>
          <div className="text-lg font-bold tracking-tight">{viewTitles[currentView] || 'Dashboard'}</div>
          <div className="text-xs text-edu-muted hidden sm:block">EduGest · {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden md:flex items-center gap-2 bg-edu-surface2 border border-edu-border rounded-lg px-3 py-1.5 w-[240px]">
          <Search size={14} className="text-edu-muted" />
          <input placeholder="Rechercher..." className="flex-1 border-0 bg-transparent outline-none text-[13px]" />
        </div>
        <button className="w-9 h-9 rounded-lg bg-edu-surface2 border border-edu-border grid place-items-center hover:bg-edu-border transition relative">
          <Bell size={16} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-edu-danger border-2 border-white" />
        </button>
        <button className="w-9 h-9 rounded-lg bg-edu-surface2 border border-edu-border grid place-items-center hover:bg-edu-border transition">
          <Settings size={16} />
        </button>
      </div>
    </header>
  )
}

// ===== DASHBOARD LAYOUT =====
function DashboardLayout() {
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[240px_1fr] bg-edu-bg">
      <Sidebar />
      <div className="flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
          <MainContent />
        </main>
      </div>
    </div>
  )
}

// ===== MAIN CONTENT ROUTER =====
function MainContent() {
  const { currentView, userRole } = useEduGestStore()

  switch (currentView) {
    case 'dashboard': return <RoleDashboard />
    case 'students': return <StudentsView />
    case 'classes': return <ClassesView />
    case 'grades': return <GradesView />
    case 'payments': return <PaymentsView />
    case 'discipline': return <DisciplineView />
    case 'communications': return <CommunicationsView />
    case 'homework': return <HomeworkView />
    case 'profile': return <ProfileView />
    case 'class-passing': return <ClassPassingView />
    case 'bulletin': return <BulletinView />
    case 'convocation': return <ConvocationView />
    case 'schools': return <SchoolsManagementView />
    case 'pricing': return <PricingDashboard />
    default: return <RoleDashboard />
  }
}

// ===== ROLE-BASED DASHBOARD =====
function RoleDashboard() {
  const { userRole } = useEduGestStore()
  switch (userRole) {
    case 'SUPER_ADMIN_GLOBAL': return <SuperAdminDashboard />
    case 'SECRETARY': return <SecretaryDashboard />
    case 'CASHIER': return <CashierDashboard />
    case 'PARENT': return <ParentDashboard />
    case 'TEACHER': return <TeacherDashboard />
    case 'HEAD_TEACHER': return <HeadTeacherDashboard />
    default:
      if (userRole?.startsWith('DIRECTION')) return <DirectionDashboard />
      if (userRole?.startsWith('DISCIPLINE')) return <DisciplineDashboardView />
      return <SecretaryDashboard />
  }
}

// ===== STAT CARD =====
function StatCard({ label, value, delta, icon, color }: {
  label: string; value: string; delta?: string; icon: React.ReactNode; color: string
}) {
  return (
    <div className="bg-white border border-edu-border rounded-xl p-[18px] relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[60px] h-[60px] rounded-bl-[60px] opacity-50" style={{ background: `radial-gradient(closest-side, ${color}22, transparent)` }} />
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-xs text-edu-muted font-medium uppercase tracking-wider">{label}</div>
        <div className="w-8 h-8 rounded-lg grid place-items-center" style={{ color, background: `${color}18` }}>{icon}</div>
      </div>
      <div className="text-[26px] font-bold tracking-tight tabular-nums">{value}</div>
      {delta && <div className="text-xs text-edu-muted mt-0.5">{delta}</div>}
    </div>
  )
}

// ===== SUPER ADMIN DASHBOARD =====
function SuperAdminDashboard() {
  const [stats, setStats] = useState<{ totalSchools: number; totalStudents: number; totalUsers: number } | null>(null)

  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(j => setStats(j.data)).catch(() => {})
  }, [])

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bonjour Admin 👋</h1>
          <p className="text-[13px] text-edu-muted mt-0.5">Voici l&apos;état de la plateforme aujourd&apos;hui</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 mb-5">
        <StatCard label="Écoles actives" value={formatNumber(stats?.totalSchools || 248)} delta="+12 ce mois" icon={<Building2 size={16} />} color={ACCENT} />
        <StatCard label="Utilisateurs" value={formatNumber(stats?.totalUsers || 4832)} delta="+324 ce mois" icon={<Users size={16} />} color={INFO} />
        <StatCard label="Élèves inscrits" value={formatNumber(stats?.totalStudents || 58412)} delta="+2 184 ce mois" icon={<GraduationCap size={16} />} color={SUCCESS} />
        <StatCard label="Revenus mensuels" value={formatCurrency(94200)} delta="+18% vs avril" icon={<DollarSign size={16} />} color={WARNING} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-3.5 mb-5">
        <div className="bg-white border border-edu-border rounded-xl p-5">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <div className="text-[15px] font-semibold">Évolution des inscriptions</div>
              <div className="text-xs text-edu-muted">12 derniers mois · toutes écoles</div>
            </div>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ENROLLMENT_DATA}>
                <CartesianGrid strokeDasharray="2 4" stroke={BORDER} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: MUTED }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: MUTED }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke={ACCENT} strokeWidth={2.5} dot={{ fill: ACCENT, r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-edu-border rounded-xl p-5">
          <div className="mb-4">
            <div className="text-[15px] font-semibold">Répartition abonnements</div>
            <div className="text-xs text-edu-muted">Par formule</div>
          </div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={SUBSCRIPTION_DATA} cx="50%" cy="50%" innerRadius={55} outerRadius={75} dataKey="value" paddingAngle={2}>
                  {SUBSCRIPTION_DATA.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-2">
            {SUBSCRIPTION_DATA.map(s => (
              <div key={s.name} className="flex items-center gap-2 text-[13px]">
                <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />
                {s.name} · {s.value}%
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ===== SECRETARY DASHBOARD =====
function SecretaryDashboard() {
  const { setCurrentView } = useEduGestStore()
  const [stats, setStats] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    // Try to load school stats
    fetch('/api/stats?schoolId=demo').then(r => r.json()).then(j => setStats(j.data)).catch(() => {})
  }, [])

  const classDist = (stats?.classes as Record<string, unknown>)?.distribution as { name: string; _count: { students: number } }[] | undefined
  const barData = classDist?.map(c => ({ name: c.name, élèves: c._count.students })) || [
    { name: '6eA', élèves: 32 }, { name: '6eB', élèves: 28 }, { name: '5eA', élèves: 30 },
    { name: '4eA', élèves: 27 }, { name: '3eA', élèves: 25 }, { name: 'CP1', élèves: 35 },
  ]

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bonjour Secrétaire 👋</h1>
          <p className="text-[13px] text-edu-muted mt-0.5">Gestion quotidienne du Complexe Scolaire Lumière</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 mb-5">
        <StatCard label="Total élèves" value={formatNumber((stats?.students as Record<string, number>)?.total || 1248)} delta="+24 cette semaine" icon={<Users size={16} />} color={ACCENT} />
        <StatCard label="Classes actives" value={String((stats?.classes as Record<string, unknown>)?.total || 42)} icon={<School size={16} />} color={INFO} />
        <StatCard label="Avertissements" value="27" icon={<AlertTriangle size={16} />} color={WARNING} />
        <StatCard label="Retards" value="64" icon={<Clock size={16} />} color={DANGER} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-3.5 mb-5">
        <div className="bg-white border border-edu-border rounded-xl p-5">
          <div className="mb-4">
            <div className="text-[15px] font-semibold">Élèves par classe</div>
            <div className="text-xs text-edu-muted">Année scolaire 2025-2026</div>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="2 4" stroke={BORDER} />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: MUTED }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: MUTED }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="élèves" fill={ACCENT} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-edu-border rounded-xl p-5">
          <div className="mb-4">
            <div className="text-[15px] font-semibold">Actions rapides</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: <UserPlus size={20} />, label: 'Ajouter élève', view: 'students' as ViewType, color: ACCENT },
              { icon: <MessageSquare size={20} />, label: 'Communication', view: 'communications' as ViewType, color: INFO },
              { icon: <CreditCard size={20} />, label: 'Paiement', view: 'payments' as ViewType, color: SUCCESS },
              { icon: <Megaphone size={20} />, label: 'Convocation', view: 'convocation' as ViewType, color: WARNING },
            ].map(a => (
              <button key={a.label} onClick={() => setCurrentView(a.view)} className="flex flex-col items-center gap-2 p-4 rounded-xl border border-edu-border hover:border-edu-accent/30 hover:bg-edu-accent-soft transition">
                <span style={{ color: a.color }}>{a.icon}</span>
                <span className="text-sm font-medium">{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ===== CASHIER DASHBOARD =====
function CashierDashboard() {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bonjour Caissier 👋</h1>
          <p className="text-[13px] text-edu-muted mt-0.5">Suivi financier du Complexe Scolaire Lumière</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 mb-5">
        <StatCard label="Encaissé T1" value={formatCurrency(312400)} delta="+12% vs T1 2024" icon={<DollarSign size={16} />} color={ACCENT} />
        <StatCard label="Encaissé T2" value={formatCurrency(286200)} icon={<DollarSign size={16} />} color={INFO} />
        <StatCard label="Recouvrement" value="87%" icon={<TrendingUp size={16} />} color={SUCCESS} />
        <StatCard label="Impayés" value={formatCurrency(42800)} delta="42 dossiers" icon={<AlertTriangle size={16} />} color={DANGER} />
      </div>

      <div className="bg-white border border-edu-border rounded-xl p-5">
        <div className="mb-4">
          <div className="text-[15px] font-semibold">Paiements par classe</div>
          <div className="text-xs text-edu-muted">Taux de recouvrement par classe</div>
        </div>
        <div className="space-y-3">
          {[
            { name: '6eA', rate: 92, paid: 288000, total: 312000 },
            { name: '6eB', rate: 78, paid: 218400, total: 280000 },
            { name: '5eA', rate: 85, paid: 255000, total: 300000 },
            { name: '4eA', rate: 71, paid: 191700, total: 270000 },
            { name: '3eA', rate: 64, paid: 160000, total: 250000 },
          ].map(c => (
            <div key={c.name}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">{c.name}</span>
                <span className="text-edu-muted">{formatNumber(c.paid)} / {formatNumber(c.total)} CDF · {c.rate}%</span>
              </div>
              <div className="h-2 bg-edu-surface2 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${c.rate}%`, background: c.rate >= 85 ? SUCCESS : c.rate >= 70 ? WARNING : DANGER }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ===== PARENT DASHBOARD =====
function ParentDashboard() {
  const { setCurrentView } = useEduGestStore()
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bonjour Papa Kazadi 👋</h1>
          <p className="text-[13px] text-edu-muted mt-0.5">Suivi scolaire de vos enfants</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-5">
        <StatCard label="Mes enfants" value="2" icon={<Users size={16} />} color={ACCENT} />
        <StatCard label="Notifications" value="5" icon={<Bell size={16} />} color={INFO} />
        <StatCard label="Devoirs à rendre" value="3" icon={<PenTool size={16} />} color={WARNING} />
      </div>

      <h3 className="text-lg font-semibold mb-3">Mes enfants</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {[
          { name: 'Kabongo Mutombo', class: '6eA', avg: '14.2/20', initials: 'KM', color: ACCENT },
          { name: 'Nzuzi Kazadi', class: '6eA', avg: '12.8/20', initials: 'NK', color: INFO },
        ].map(child => (
          <div key={child.name} className="bg-white border border-edu-border rounded-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-full grid place-items-center text-white font-bold text-lg" style={{ background: `linear-gradient(135deg, ${child.color}, ${ACCENT2})` }}>
                {child.initials}
              </div>
              <div>
                <div className="font-semibold">{child.name}</div>
                <div className="text-sm text-edu-muted">Classe {child.class} · Moyenne {child.avg}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Notes', view: 'grades' as ViewType, icon: <BookOpen size={14} /> },
                { label: 'Bulletin', view: 'bulletin' as ViewType, icon: <FileText size={14} /> },
                { label: 'Paiements', view: 'payments' as ViewType, icon: <CreditCard size={14} /> },
                { label: 'Discipline', view: 'discipline' as ViewType, icon: <Shield size={14} /> },
              ].map(chip => (
                <button key={chip.label} onClick={() => setCurrentView(chip.view)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-edu-border hover:bg-edu-accent-soft hover:border-edu-accent/30 transition">
                  {chip.icon} {chip.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <h3 className="text-lg font-semibold mb-3">Notifications récentes</h3>
      <div className="bg-white border border-edu-border rounded-xl divide-y divide-edu-border">
        {[
          { icon: <BookOpen size={16} className="text-edu-accent" />, text: 'Nouvelle note en Mathématiques — Kabongo: 16/20', time: 'Il y a 2h' },
          { icon: <CreditCard size={16} className="text-edu-success" />, text: 'Paiement T2 confirmé — Nzuzi Kazadi', time: 'Il y a 5h' },
          { icon: <PenTool size={16} className="text-edu-warning" />, text: 'Devoir à rendre: Exercices de calcul — 6eA', time: 'Hier' },
          { icon: <Shield size={16} className="text-edu-danger" />, text: 'Avertissement: Retard répété — Kabongo Mutombo', time: 'Il y a 2 jours' },
          { icon: <Megaphone size={16} className="text-edu-info" />, text: 'Réunion parents-professeurs le 15 octobre', time: 'Il y a 3 jours' },
        ].map((n, i) => (
          <div key={i} className="flex items-start gap-3 p-4 hover:bg-edu-surface2/50 transition">
            <div className="w-8 h-8 rounded-full bg-edu-surface2 grid place-items-center shrink-0">{n.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm">{n.text}</div>
              <div className="text-xs text-edu-muted mt-0.5">{n.time}</div>
            </div>
            {i === 0 && <span className="w-2 h-2 rounded-full bg-edu-accent mt-2 shrink-0" />}
          </div>
        ))}
      </div>
    </div>
  )
}

// ===== TEACHER DASHBOARD =====
function TeacherDashboard() {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bonjour Professeur 👋</h1>
          <p className="text-[13px] text-edu-muted mt-0.5">Gestion de vos classes et notes</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 mb-5">
        <StatCard label="Mes classes" value="4" icon={<School size={16} />} color={ACCENT} />
        <StatCard label="Élèves total" value="112" icon={<Users size={16} />} color={INFO} />
        <StatCard label="Devoirs actifs" value="3" icon={<PenTool size={16} />} color={WARNING} />
        <StatCard label="Notes à saisir" value="24" icon={<BookOpen size={16} />} color={DANGER} />
      </div>
    </div>
  )
}

// ===== HEAD TEACHER DASHBOARD =====
function HeadTeacherDashboard() {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bonjour Prof. Principal 👋</h1>
          <p className="text-[13px] text-edu-muted mt-0.5">Suivi de la classe 6eA</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-5">
        <StatCard label="Élèves" value="32" icon={<Users size={16} />} color={ACCENT} />
        <StatCard label="Moy. classe" value="12.4/20" icon={<Target size={16} />} color={SUCCESS} />
        <StatCard label="Bulletins" value="32/32" delta="Tous générés" icon={<FileText size={16} />} color={INFO} />
      </div>
    </div>
  )
}

// ===== DIRECTION DASHBOARD =====
function DirectionDashboard() {
  return <SecretaryDashboard />
}

// ===== DISCIPLINE DASHBOARD =====
function DisciplineDashboardView() {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard Discipline 👋</h1>
          <p className="text-[13px] text-edu-muted mt-0.5">Suivi disciplinaire</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-5">
        <StatCard label="Liste Noire" value="3" icon={<Ban size={16} />} color={DANGER} />
        <StatCard label="Liste Grise" value="12" icon={<AlertTriangle size={16} />} color={WARNING} />
        <StatCard label="Liste Blanche" value="8" icon={<Award size={16} />} color={SUCCESS} />
      </div>
    </div>
  )
}

// ===== STUDENTS VIEW =====
function StudentsView() {
  const [students, setStudents] = useState<StudentData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const { userData } = useEduGestStore()

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/students?limit=50')
        const json = await res.json()
        setStudents(json.data || [])
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const filtered = students.filter(s =>
    !search || s.firstName.toLowerCase().includes(search.toLowerCase()) || s.lastName.toLowerCase().includes(search.toLowerCase()) || s.matricule.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Élèves</h1>
          <p className="text-[13px] text-edu-muted mt-0.5">{formatNumber(filtered.length)} élèves inscrits</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition hover:opacity-90" style={{ background: ACCENT }}>
          <Plus size={14} /> Ajouter un élève
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2 bg-white border border-edu-border rounded-lg px-3 py-2 flex-1 max-w-md">
          <Search size={14} className="text-edu-muted" />
          <input placeholder="Rechercher un élève..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 border-0 bg-transparent outline-none text-sm" />
        </div>
      </div>

      <div className="bg-white border border-edu-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-edu-surface2">
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">Élève</th>
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">Matricule</th>
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">Classe</th>
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">Parent</th>
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">Statut</th>
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-edu-muted">Chargement...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-edu-muted">Aucun élève trouvé</td></tr>
              ) : filtered.map(s => (
                <tr key={s.id} className="hover:bg-edu-surface2/50 transition border-b border-edu-border last:border-0">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-edu-accent to-[oklch(45%_0.13_200)] grid place-items-center text-white font-semibold text-[11px] shrink-0">
                        {getInitials(s.firstName + ' ' + s.lastName)}
                      </div>
                      <div>
                        <div className="font-medium text-[13.5px]">{s.firstName} {s.lastName}</div>
                        <div className="text-xs text-edu-muted">{s.gender === 'M' ? 'Garçon' : 'Fille'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[13px] font-mono text-edu-muted">{s.matricule}</td>
                  <td className="px-3 py-3 text-[13px]">{s.class?.name || '—'}</td>
                  <td className="px-3 py-3 text-[13px] text-edu-muted">{s.parent?.name || '—'}</td>
                  <td className="px-3 py-3"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${getStatusPill('Actif')}`}>Actif</span></td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      <button className="w-7 h-7 rounded grid place-items-center text-edu-muted hover:bg-edu-surface2 hover:text-edu-fg transition"><Eye size={14} /></button>
                      <button className="w-7 h-7 rounded grid place-items-center text-edu-muted hover:bg-edu-surface2 hover:text-edu-fg transition"><Edit size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Student Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">Ajouter un élève</h2>
              <button onClick={() => setShowAdd(false)}><X size={18} /></button>
            </div>
            <form onSubmit={async (e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              try {
                const res = await fetch('/api/students', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    firstName: fd.get('firstName'), lastName: fd.get('lastName'),
                    gender: fd.get('gender'), dateOfBirth: fd.get('dob'),
                    classId: students[0]?.classId, schoolId: userData?.schoolId || 'demo',
                    schoolYearId: students[0]?.schoolYearId || 'demo',
                  }),
                })
                if (res.ok) {
                  toast.success('Élève ajouté avec succès!')
                  setShowAdd(false)
                  const json = await fetch('/api/students?limit=50').then(r => r.json())
                  setStudents(json.data || [])
                } else {
                  toast.error('Erreur lors de l\'ajout')
                }
              } catch { toast.error('Erreur réseau') }
            }} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium">Prénom</label><input name="firstName" required className="w-full mt-1 px-3 py-2 border border-edu-border rounded-lg text-sm outline-none focus:border-edu-accent" /></div>
                <div><label className="text-sm font-medium">Nom</label><input name="lastName" required className="w-full mt-1 px-3 py-2 border border-edu-border rounded-lg text-sm outline-none focus:border-edu-accent" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium">Sexe</label><select name="gender" className="w-full mt-1 px-3 py-2 border border-edu-border rounded-lg text-sm outline-none"><option value="M">Masculin</option><option value="F">Féminin</option></select></div>
                <div><label className="text-sm font-medium">Date de naissance</label><input name="dob" type="date" className="w-full mt-1 px-3 py-2 border border-edu-border rounded-lg text-sm outline-none" /></div>
              </div>
              <button type="submit" className="w-full py-2.5 rounded-lg text-white font-medium text-sm" style={{ background: ACCENT }}>Ajouter l&apos;élève</button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ===== CLASSES VIEW =====
function ClassesView() {
  const [classes, setClasses] = useState<ClassData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/classes?limit=50').then(r => r.json()).then(j => { setClasses(j.data || []); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-5">Classes</h1>
      {loading ? <div className="text-center py-8 text-edu-muted">Chargement...</div> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map(c => (
            <div key={c.id} className="bg-white border border-edu-border rounded-xl p-5 hover:border-edu-accent/30 transition">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold">{c.name}</h3>
                <span className="text-xs text-edu-muted bg-edu-surface2 px-2 py-1 rounded-full">{c.level || c.section || ''}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-edu-muted">
                <span>{c._count?.students || 0} élèves</span>
                <span>Capacité: {c.capacity}</span>
              </div>
              <div className="mt-3 h-2 bg-edu-surface2 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, ((c._count?.students || 0) / c.capacity) * 100)}%`, background: (c._count?.students || 0) / c.capacity > 0.9 ? DANGER : ACCENT }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ===== GRADES VIEW =====
function GradesView() {
  const [grades, setGrades] = useState<GradeData[]>([])
  const [classes, setClasses] = useState<ClassData[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedTrimester, setSelectedTrimester] = useState('T1')

  useEffect(() => {
    fetch('/api/classes?limit=50').then(r => r.json()).then(j => setClasses(j.data || [])).catch(() => {})
    loadGrades()
  }, [])

  useEffect(() => {
    if (selectedClass) loadGrades()
  }, [selectedClass, selectedTrimester])

  async function loadGrades() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedClass) params.set('classId', selectedClass)
      params.set('trimester', selectedTrimester)
      params.set('limit', '50')
      const res = await fetch(`/api/grades?${params}`)
      const json = await res.json()
      setGrades(json.data || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  const uniqueStudents = [...new Map(grades.map(g => [g.studentId, g.student]).filter(Boolean)).values()]

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-5">Notes</h1>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="px-3 py-2 border border-edu-border rounded-lg text-sm bg-white outline-none">
          <option value="">Toutes les classes</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={selectedTrimester} onChange={e => setSelectedTrimester(e.target.value)} className="px-3 py-2 border border-edu-border rounded-lg text-sm bg-white outline-none">
          <option value="T1">Trimestre 1</option>
          <option value="T2">Trimestre 2</option>
          <option value="T3">Trimestre 3</option>
        </select>
      </div>

      <div className="bg-white border border-edu-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-edu-surface2">
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">Élève</th>
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">Matière</th>
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">Note /20</th>
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">Coef.</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="text-center py-8 text-edu-muted">Chargement...</td></tr>
              ) : grades.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-edu-muted">Aucune note</td></tr>
              ) : grades.slice(0, 30).map(g => (
                <tr key={g.id} className="hover:bg-edu-surface2/50 transition border-b border-edu-border last:border-0">
                  <td className="px-3 py-2.5 text-[13px] font-medium">{g.student?.firstName} {g.student?.lastName}</td>
                  <td className="px-3 py-2.5 text-[13px] text-edu-muted">{g.subject?.name}</td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[13px] font-semibold ${g.score >= 10 ? 'text-edu-success' : 'text-edu-danger'}`}>
                      {g.score.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[13px] text-edu-muted">×{g.subject?.coefficient || 1}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ===== PAYMENTS VIEW =====
function PaymentsView() {
  const [payments, setPayments] = useState<PaymentData[]>([])
  const [loading, setLoading] = useState(true)
  const [studentSearch, setStudentSearch] = useState('')
  const [amount, setAmount] = useState('')
  const [trimester, setTrimester] = useState('T1')
  const [method, setMethod] = useState('CASH')
  const { userData } = useEduGestStore()

  useEffect(() => {
    fetch('/api/payments?limit=30').then(r => r.json()).then(j => { setPayments(j.data || []); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-5">Paiements</h1>

      {/* Payment Form */}
      <div className="bg-white border border-edu-border rounded-xl p-5 mb-5">
        <h3 className="font-semibold mb-4">Enregistrer un paiement</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <input placeholder="Rechercher un élève..." value={studentSearch} onChange={e => setStudentSearch(e.target.value)} className="px-3 py-2 border border-edu-border rounded-lg text-sm outline-none focus:border-edu-accent" />
          <input placeholder="Montant (CDF)" value={amount} onChange={e => setAmount(e.target.value)} type="number" className="px-3 py-2 border border-edu-border rounded-lg text-sm outline-none focus:border-edu-accent" />
          <select value={trimester} onChange={e => setTrimester(e.target.value)} className="px-3 py-2 border border-edu-border rounded-lg text-sm bg-white outline-none">
            <option value="T1">Trimestre 1</option><option value="T2">Trimestre 2</option><option value="T3">Trimestre 3</option>
          </select>
          <select value={method} onChange={e => setMethod(e.target.value)} className="px-3 py-2 border border-edu-border rounded-lg text-sm bg-white outline-none">
            <option value="CASH">Espèces</option><option value="ORANGE_MONEY">Orange Money</option><option value="MPESA">M-Pesa</option><option value="AIRTEL_MONEY">Airtel Money</option>
          </select>
        </div>
        <button className="px-5 py-2.5 rounded-lg text-white text-sm font-medium" style={{ background: ACCENT }}>
          Enregistrer le paiement
        </button>
      </div>

      <div className="bg-white border border-edu-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-edu-surface2">
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">Élève</th>
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">Trimestre</th>
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">Montant</th>
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">Payé</th>
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">Statut</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8 text-edu-muted">Chargement...</td></tr>
              ) : payments.slice(0, 20).map(p => (
                <tr key={p.id} className="hover:bg-edu-surface2/50 transition border-b border-edu-border last:border-0">
                  <td className="px-3 py-2.5 text-[13px] font-medium">{p.student ? `${p.student.firstName} ${p.student.lastName}` : '—'}</td>
                  <td className="px-3 py-2.5 text-[13px] text-edu-muted">{p.trimester}</td>
                  <td className="px-3 py-2.5 text-[13px] tabular-nums">{formatNumber(p.amount)} CDF</td>
                  <td className="px-3 py-2.5 text-[13px] tabular-nums">{formatNumber(p.paidAmount)} CDF</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${getStatusPill(p.status)}`}>
                      {p.status === 'PAID' ? 'Payé' : p.status === 'PARTIAL' ? 'Partiel' : p.status === 'OVERDUE' ? 'En retard' : 'En attente'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ===== DISCIPLINE VIEW =====
function DisciplineView() {
  const [records, setRecords] = useState<DisciplineData[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'BLACKLIST' | 'GREYLIST' | 'WHITELIST'>('GREYLIST')

  useEffect(() => {
    fetch(`/api/discipline?listType=${tab}&limit=30`).then(r => r.json()).then(j => { setRecords(j.data || []); setLoading(false) }).catch(() => setLoading(false))
  }, [tab])

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-5">Discipline</h1>

      <div className="flex gap-0.5 border-b border-edu-border mb-4">
        {[
          { key: 'BLACKLIST' as const, label: 'Liste Noire', icon: <Ban size={14} />, color: DANGER },
          { key: 'GREYLIST' as const, label: 'Liste Grise', icon: <AlertTriangle size={14} />, color: WARNING },
          { key: 'WHITELIST' as const, label: 'Liste Blanche', icon: <Award size={14} />, color: SUCCESS },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setLoading(true) }}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-[13.5px] font-medium border-b-2 -mb-px transition ${
              tab === t.key ? 'border-current' : 'border-transparent text-edu-muted hover:text-edu-fg'
            }`}
            style={tab === t.key ? { color: t.color } : undefined}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-edu-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-edu-surface2">
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">Élève</th>
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">Motif</th>
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">Type</th>
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">Date</th>
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">Points</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8 text-edu-muted">Chargement...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-edu-muted">Aucun enregistrement</td></tr>
              ) : records.map(r => (
                <tr key={r.id} className="hover:bg-edu-surface2/50 transition border-b border-edu-border last:border-0">
                  <td className="px-3 py-2.5 text-[13px] font-medium">{r.student ? `${r.student.firstName} ${r.student.lastName}` : '—'}</td>
                  <td className="px-3 py-2.5 text-[13px] text-edu-muted">{r.title}</td>
                  <td className="px-3 py-2.5 text-[13px]">{r.type}</td>
                  <td className="px-3 py-2.5 text-[13px] text-edu-muted">{formatDate(r.createdAt)}</td>
                  <td className="px-3 py-2.5"><span className={`text-[13px] font-semibold ${r.points > 0 ? 'text-edu-danger' : 'text-edu-success'}`}>{r.points > 0 ? '+' : ''}{r.points}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ===== COMMUNICATIONS VIEW =====
function CommunicationsView() {
  const [comms, setComms] = useState<CommunicationData[]>([])
  const [loading, setLoading] = useState(true)
  const [type, setType] = useState('ANNOUNCEMENT')
  const [targetType, setTargetType] = useState('ALL')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [whatsapp, setWhatsapp] = useState(true)
  const [app, setApp] = useState(true)
  const { userData } = useEduGestStore()

  useEffect(() => {
    fetch('/api/communications?limit=20').then(r => r.json()).then(j => { setComms(j.data || []); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  async function handleSend() {
    if (!title || !content) return toast.error('Titre et contenu requis')
    try {
      const res = await fetch('/api/communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: userData?.schoolId || 'demo', senderRole: userData?.role || 'SECRETARY',
          schoolId: userData?.schoolId || 'demo', type, title, content, targetType,
          sentToApp: app, sentToWhatsapp: whatsapp,
        }),
      })
      if (res.ok) {
        toast.success('Communication envoyée!')
        setTitle(''); setContent('')
        const json = await (await fetch('/api/communications?limit=20')).json()
        setComms(json.data || [])
      }
    } catch { toast.error('Erreur lors de l\'envoi') }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-5">Communications</h1>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5">
        {/* Compose */}
        <div className="bg-white border border-edu-border rounded-xl p-5">
          <h3 className="font-semibold mb-4">Nouvelle communication</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <select value={type} onChange={e => setType(e.target.value)} className="px-3 py-2 border border-edu-border rounded-lg text-sm bg-white outline-none">
                <option value="ANNOUNCEMENT">Annonce</option>
                <option value="NOTIFICATION">Notification</option>
                <option value="EVENT">Événement</option>
                <option value="ALERT">Alerte</option>
              </select>
              <select value={targetType} onChange={e => setTargetType(e.target.value)} className="px-3 py-2 border border-edu-border rounded-lg text-sm bg-white outline-none">
                <option value="ALL">Tout le monde</option>
                <option value="PARENTS">Parents</option>
                <option value="STAFF">Personnel</option>
                <option value="CLASS">Classe</option>
              </select>
            </div>
            <input placeholder="Titre" value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3 py-2 border border-edu-border rounded-lg text-sm outline-none focus:border-edu-accent" />
            <textarea placeholder="Contenu du message..." value={content} onChange={e => setContent(e.target.value)} rows={4} className="w-full px-3 py-2 border border-edu-border rounded-lg text-sm outline-none focus:border-edu-accent resize-none" />
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={whatsapp} onChange={e => setWhatsapp(e.target.checked)} className="accent-edu-accent" /> WhatsApp</label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={app} onChange={e => setApp(e.target.checked)} className="accent-edu-accent" /> App</label>
            </div>
            <button onClick={handleSend} className="w-full py-2.5 rounded-lg text-white font-medium text-sm inline-flex items-center justify-center gap-2" style={{ background: ACCENT }}>
              <Send size={14} /> Envoyer
            </button>
          </div>
        </div>

        {/* History */}
        <div className="bg-white border border-edu-border rounded-xl p-5">
          <h3 className="font-semibold mb-4">Historique</h3>
          <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar">
            {loading ? <div className="text-center py-4 text-edu-muted">Chargement...</div> :
              comms.map(c => (
                <div key={c.id} className="p-3 rounded-lg border border-edu-border hover:bg-edu-surface2/50 transition">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{c.title}</span>
                    <span className="text-[11px] text-edu-muted">{formatDate(c.sentAt)}</span>
                  </div>
                  <p className="text-xs text-edu-muted line-clamp-2">{c.content}</p>
                  <div className="flex items-center gap-2 mt-2 text-[11px] text-edu-muted">
                    <span className={`px-1.5 py-0.5 rounded ${c.type === 'ANNOUNCEMENT' ? 'bg-edu-accent-soft text-edu-accent' : 'bg-edu-surface2'}`}>{c.type}</span>
                    {c.sentToWhatsapp && <span className="text-edu-success">WhatsApp</span>}
                    {c.sentToApp && <span className="text-edu-info">App</span>}
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      </div>
    </div>
  )
}

// ===== HOMEWORK VIEW =====
function HomeworkView() {
  const [homework, setHomework] = useState<HomeworkData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/homework?limit=30').then(r => r.json()).then(j => { setHomework(j.data || []); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-5">Devoirs</h1>
      {loading ? <div className="text-center py-8 text-edu-muted">Chargement...</div> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {homework.map(h => (
            <div key={h.id} className="bg-white border border-edu-border rounded-xl p-5 hover:border-edu-accent/30 transition">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold">{h.title}</h3>
                <span className="text-xs text-edu-muted bg-edu-surface2 px-2 py-1 rounded-full shrink-0">{h.subjectName}</span>
              </div>
              <p className="text-sm text-edu-muted mb-3 line-clamp-2">{h.description}</p>
              <div className="flex items-center justify-between text-xs text-edu-muted">
                <span className="flex items-center gap-1"><Calendar size={12} /> Échéance: {formatDate(h.dueDate)}</span>
                <span>{h.teacherName}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ===== PROFILE VIEW =====
function ProfileView() {
  const { userData } = useEduGestStore()
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-5">Mon profil</h1>
      <div className="bg-white border border-edu-border rounded-xl p-6 max-w-lg">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full grid place-items-center text-white font-bold text-xl" style={{ background: `linear-gradient(135deg, oklch(55% 0.15 280), oklch(45% 0.15 320))` }}>
            {userData?.initials || '??'}
          </div>
          <div>
            <div className="text-lg font-bold">{userData?.name || 'Utilisateur'}</div>
            <div className="text-sm text-edu-muted">{getRoleLabel(userData?.role || 'SECRETARY')}</div>
          </div>
        </div>
        <div className="space-y-3">
          <div><label className="text-sm font-medium">Nom complet</label><input defaultValue={userData?.name} className="w-full mt-1 px-3 py-2 border border-edu-border rounded-lg text-sm outline-none" /></div>
          <div><label className="text-sm font-medium">École</label><input defaultValue={userData?.schoolName} className="w-full mt-1 px-3 py-2 border border-edu-border rounded-lg text-sm outline-none bg-edu-surface2" disabled /></div>
          <div><label className="text-sm font-medium">Rôle</label><input defaultValue={getRoleLabel(userData?.role || 'SECRETARY')} className="w-full mt-1 px-3 py-2 border border-edu-border rounded-lg text-sm outline-none bg-edu-surface2" disabled /></div>
        </div>
        <button className="mt-4 px-5 py-2.5 rounded-lg text-white text-sm font-medium" style={{ background: ACCENT }}>Sauvegarder</button>
      </div>
    </div>
  )
}

// ===== CLASS PASSING VIEW =====
function ClassPassingView() {
  const [students, setStudents] = useState<StudentData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/students?limit=50').then(r => r.json()).then(j => { setStudents(j.data || []); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-5">Passage de classe</h1>
      <div className="bg-white border border-edu-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-edu-surface2">
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">Élève</th>
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">Classe actuelle</th>
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">Décision</th>
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="text-center py-8 text-edu-muted">Chargement...</td></tr>
              ) : students.slice(0, 20).map(s => (
                <tr key={s.id} className="hover:bg-edu-surface2/50 transition border-b border-edu-border last:border-0">
                  <td className="px-3 py-2.5 text-[13px] font-medium">{s.firstName} {s.lastName}</td>
                  <td className="px-3 py-2.5 text-[13px] text-edu-muted">{s.class?.name || '—'}</td>
                  <td className="px-3 py-2.5">
                    <select className="px-2 py-1 border border-edu-border rounded text-sm bg-white outline-none">
                      <option>En attente</option><option>Passage</option><option>Redouble</option>
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    <button className="text-edu-accent text-sm font-medium hover:underline">Valider</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ===== BULLETIN VIEW =====
function BulletinView() {
  const [grades, setGrades] = useState<GradeData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/grades?limit=50&trimester=T1').then(r => r.json()).then(j => { setGrades(j.data || []); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  // Group grades by student
  const studentGrades = grades.reduce<Record<string, { student: GradeData['student']; grades: GradeData[] }>>((acc, g) => {
    if (!acc[g.studentId]) acc[g.studentId] = { student: g.student, grades: [] }
    acc[g.studentId].grades.push(g)
    return acc
  }, {})

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-5">Bulletins</h1>
      {loading ? <div className="text-center py-8 text-edu-muted">Chargement...</div> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(studentGrades).slice(0, 12).map(([id, data]) => {
            const avg = data.grades.length > 0 ? data.grades.reduce((s, g) => s + g.score * (g.subject?.coefficient || 1), 0) / data.grades.reduce((s, g) => s + (g.subject?.coefficient || 1), 0) : 0
            return (
              <div key={id} className="bg-white border border-edu-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-semibold">{data.student?.firstName} {data.student?.lastName}</div>
                    <div className="text-xs text-edu-muted">{data.student?.matricule}</div>
                  </div>
                  <div className={`text-2xl font-bold ${avg >= 10 ? 'text-edu-success' : 'text-edu-danger'}`}>{avg.toFixed(1)}</div>
                </div>
                <div className="space-y-1.5 text-xs">
                  {data.grades.slice(0, 5).map(g => (
                    <div key={g.id} className="flex justify-between">
                      <span className="text-edu-muted">{g.subject?.name}</span>
                      <span className={g.score >= 10 ? 'text-edu-success font-medium' : 'text-edu-danger font-medium'}>{g.score.toFixed(1)}/20</span>
                    </div>
                  ))}
                </div>
                <button className="mt-3 w-full py-1.5 rounded-lg text-sm font-medium border border-edu-border hover:bg-edu-surface2 transition inline-flex items-center justify-center gap-1.5">
                  <FileText size={14} /> Voir bulletin
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ===== CONVOCATION VIEW =====
function ConvocationView() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-5">Convocations</h1>
      <div className="bg-white border border-edu-border rounded-xl p-6 max-w-lg">
        <h3 className="font-semibold mb-4">Nouvelle convocation</h3>
        <div className="space-y-3">
          <div><label className="text-sm font-medium">Élève concerné</label><input placeholder="Rechercher un élève..." className="w-full mt-1 px-3 py-2 border border-edu-border rounded-lg text-sm outline-none" /></div>
          <div><label className="text-sm font-medium">Motif</label><textarea placeholder="Motif de la convocation..." rows={3} className="w-full mt-1 px-3 py-2 border border-edu-border rounded-lg text-sm outline-none resize-none" /></div>
          <div><label className="text-sm font-medium">Date</label><input type="date" className="w-full mt-1 px-3 py-2 border border-edu-border rounded-lg text-sm outline-none" /></div>
          <button className="w-full py-2.5 rounded-lg text-white text-sm font-medium inline-flex items-center justify-center gap-2" style={{ background: ACCENT }}>
            <Send size={14} /> Envoyer la convocation
          </button>
        </div>
      </div>
    </div>
  )
}

// ===== SCHOOLS MANAGEMENT VIEW =====
function SchoolsManagementView() {
  const [schools, setSchools] = useState<SchoolData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/schools?limit=30').then(r => r.json()).then(j => { setSchools(j.data || []); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Écoles</h1>
          <p className="text-[13px] text-edu-muted mt-0.5">{formatNumber(schools.length)} écoles</p>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ background: ACCENT }}>
          <Plus size={14} /> Ajouter une école
        </button>
      </div>

      <div className="bg-white border border-edu-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-edu-surface2">
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">École</th>
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">Abonnement</th>
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">Élèves</th>
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5">Statut</th>
                <th className="text-left text-[11px] font-semibold text-edu-muted uppercase tracking-wider px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8 text-edu-muted">Chargement...</td></tr>
              ) : schools.map(s => (
                <tr key={s.id} className="hover:bg-edu-surface2/50 transition border-b border-edu-border last:border-0">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-edu-accent to-[oklch(45%_0.13_200)] grid place-items-center text-white font-semibold text-[11px] shrink-0">
                        {s.shortName.substring(0, 2)}
                      </div>
                      <div>
                        <div className="font-medium text-[13.5px]">{s.name}</div>
                        <div className="text-xs text-edu-muted">{s.city} · {s.province}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[13px]"><strong>{getSubscriptionLabel(s.subscriptionTier)}</strong> · {getSubscriptionPrice(s.subscriptionTier)}</td>
                  <td className="px-3 py-3 text-[13px] font-semibold tabular-nums">{formatNumber(s._count?.students || s.studentCount)}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${getStatusPill(s.isActive ? 'Actif' : 'Suspendu')}`}>
                      {s.isActive ? 'Actif' : 'Suspendu'}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      <button className="w-7 h-7 rounded grid place-items-center text-edu-muted hover:bg-edu-surface2 hover:text-edu-fg transition"><Eye size={14} /></button>
                      <button className="w-7 h-7 rounded grid place-items-center text-edu-muted hover:bg-edu-surface2 hover:text-edu-fg transition"><Edit size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ===== PRICING DASHBOARD (for sidebar) =====
function PricingDashboard() {
  return <PricingView />
}

// ===== MAIN HOME COMPONENT =====
export default function Home() {
  const { currentView, userRole } = useEduGestStore()

  if (!userRole) {
    switch (currentView) {
      case 'login': return <LoginView />
      case 'pricing': return <PricingView />
      case 'school-detail': return <SchoolDetailView />
      default: return <HomeView />
    }
  }

  return <DashboardLayout />
}
