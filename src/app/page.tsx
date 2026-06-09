'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useEduGestStore, ViewType, UserRole, UserData } from '@/lib/store'
import { toast } from 'sonner'
import ReceiptPreview from '@/components/ReceiptPreview'
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

// Receipt preview types (matching ReceiptPreview component)
interface ReceiptPayment {
  id: string; amount: number; paidAmount: number; trimester: string;
  paymentMethod: string | null; referenceNumber: string | null;
  status: string; paidAt: string | null; receiptNumber: string | null; createdAt: string;
}

interface ReceiptStudent {
  firstName: string; lastName: string; matricule: string;
}

interface ReceiptSchool {
  name: string; shortName: string; email: string; phone: string;
  address: string; city: string; province: string; country: string;
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

// LUXE AFRICAIN Design Tokens
const GOLD = 'oklch(72% 0.15 65)'
const GOLD_SOFT = 'oklch(95% 0.05 65)'
const GOLD_GLOW = 'oklch(72% 0.15 65 / 0.35)'
const DARK = 'oklch(15% 0.02 250)'
const DARK_ALT = 'oklch(20% 0.03 175)'
const IVORY = 'oklch(97% 0.005 175)'
const IVORY_WARM = 'oklch(96% 0.008 175)'
const TEXT_PRIMARY = 'oklch(15% 0.02 250)'
const TEXT_MUTED_LUXE = 'oklch(45% 0.02 250)'
const SUCCESS_SOFT = 'oklch(95% 0.04 145)'
const SUBSCRIPTION_TIERS = ['PREMIUM', 'STANDARD', 'ESSENTIEL', 'ENTERPRISE', 'FREEMIUM', 'CORPORATE']

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
function BrandMark({ height = 36, className = '' }: { height?: number; className?: string }) {
  return (
    <img
      src="/edugest-logo.png"
      alt="EduGest"
      className={`object-contain ${className}`}
      style={{ height, width: 'auto' }}
    />
  )
}

// ===== PUBLIC HEADER =====
function PublicHeader({ dark = false }: { dark?: boolean }) {
  const { setCurrentView } = useEduGestStore()
  const [mobileMenu, setMobileMenu] = useState(false)
  const textColor = dark ? 'text-white/90' : 'text-edu-fg'
  const mutedColor = dark ? 'text-white/60' : 'text-edu-muted'
  const hoverColor = dark ? 'hover:text-white' : 'hover:text-edu-fg'
  const mobileBg = dark ? 'bg-[oklch(15%_0.02_250)]/95' : 'bg-white'
  const borderColor = dark ? 'border-white/10' : 'border-edu-border'

  return (
    <header className={`sticky top-0 z-50 ${dark ? 'bg-transparent' : 'bg-white/85 backdrop-blur-xl border-b border-edu-border'}`}>
      <div className="container-premium h-16 flex items-center justify-between">
        <button onClick={() => setCurrentView('home')} className="flex items-center gap-2.5 font-bold text-base">
          <BrandMark />
        </button>
        <nav className="hidden sm:flex items-center gap-1">
          <button onClick={() => setCurrentView('home')} className={`px-3.5 py-2 rounded-lg text-sm font-medium ${mutedColor} ${hoverColor} transition`}>Écoles</button>
          <button onClick={() => { setCurrentView('home'); setTimeout(() => document.getElementById('features-section')?.scrollIntoView({ behavior: 'smooth' }), 100) }} className={`px-3.5 py-2 rounded-lg text-sm font-medium ${mutedColor} ${hoverColor} transition`}>Fonctionnalités</button>
          <button onClick={() => setCurrentView('pricing')} className={`px-3.5 py-2 rounded-lg text-sm font-medium ${mutedColor} ${hoverColor} transition`}>Tarifs</button>
          <button onClick={() => setCurrentView('login')} className="ml-3 edu-gold-cta px-5 py-2 rounded-xl text-sm font-semibold">Se connecter</button>
        </nav>
        <button className={`sm:hidden p-2 ${textColor}`} onClick={() => setMobileMenu(!mobileMenu)}>
          {mobileMenu ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {mobileMenu && (
        <div className={`sm:hidden border-t ${borderColor} ${mobileBg} backdrop-blur-xl p-4 flex flex-col gap-2`}>
          <button onClick={() => { setCurrentView('home'); setMobileMenu(false) }} className={`text-left px-3 py-2 rounded-lg text-sm font-medium ${mutedColor}`}>Écoles</button>
          <button onClick={() => { setCurrentView('home'); setMobileMenu(false) }} className={`text-left px-3 py-2 rounded-lg text-sm font-medium ${mutedColor}`}>Fonctionnalités</button>
          <button onClick={() => { setCurrentView('pricing'); setMobileMenu(false) }} className={`text-left px-3 py-2 rounded-lg text-sm font-medium ${mutedColor}`}>Tarifs</button>
          <button onClick={() => { setCurrentView('login'); setMobileMenu(false) }} className="edu-gold-cta px-4 py-2 rounded-xl text-sm font-semibold text-center">Se connecter</button>
        </div>
      )}
    </header>
  )
}

// ===== FOOTER =====
function Footer() {
  const { setCurrentView } = useEduGestStore()
  return (
    <footer style={{ background: DARK }} className="mt-auto text-white">
      <div className="container-premium py-16 sm:py-20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
        <div>
          <div className="mb-4"><BrandMark height={40} /></div>
          <p className="text-sm text-white/50 leading-relaxed max-w-[280px]">
            La plateforme de gestion scolaire multi-écoles qui simplifie la vie des directions, enseignants et parents en Afrique francophone.
          </p>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-4">Produit</h4>
          <ul className="space-y-3">
            <li><button onClick={() => setCurrentView('home')} className="text-sm text-white/70 hover:text-[oklch(72%_0.15_65)] transition relative group">Trouver une école<span className="absolute bottom-0 left-0 w-0 h-px bg-[oklch(72%_0.15_65)] group-hover:w-full transition-all duration-300" /></button></li>
            <li><button onClick={() => setCurrentView('pricing')} className="text-sm text-white/70 hover:text-[oklch(72%_0.15_65)] transition relative group">Tarifs<span className="absolute bottom-0 left-0 w-0 h-px bg-[oklch(72%_0.15_65)] group-hover:w-full transition-all duration-300" /></button></li>
            <li><button onClick={() => setCurrentView('login')} className="text-sm text-white/70 hover:text-[oklch(72%_0.15_65)] transition relative group">Connexion<span className="absolute bottom-0 left-0 w-0 h-px bg-[oklch(72%_0.15_65)] group-hover:w-full transition-all duration-300" /></button></li>
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-4">Rôles</h4>
          <ul className="space-y-3 text-sm text-white/70">
            <li>Super Admin</li><li>Secrétaire</li><li>Parent</li><li>Enseignant</li>
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-4">Contact</h4>
          <ul className="space-y-3 text-sm text-white/50">
            <li>support@edugest.app</li><li>+243 81 234 56 78</li><li>Kinshasa · Dakar · Abidjan</li>
          </ul>
        </div>
      </div>
      <div className="container-premium pt-6 border-t border-white/10 flex flex-col sm:flex-row justify-between text-xs text-white/40 pb-8">
        <span>© 2026 EduGest · Tous droits réservés</span>
        <span className="mt-2 sm:mt-0">Conditions · Confidentialité · Cookies</span>
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

  const FEATURES = [
    { icon: <GraduationCap size={24} />, title: 'Gestion Scolaire Intégrale', desc: 'Notes, bulletins, emploi du temps — tout en un seul endroit' },
    { icon: <MessageSquare size={24} />, title: 'Communication Instantanée', desc: 'WhatsApp, SMS, notifications push pour rester connecté' },
    { icon: <CreditCard size={24} />, title: 'Paiements Simplifiés', desc: 'Mobile Money, virement, espèces — encaissez facilement' },
    { icon: <Building2 size={24} />, title: 'Multi-Écoles', desc: 'Gérez plusieurs établissements depuis un tableau de bord unique' },
    { icon: <Shield size={24} />, title: 'Sécurité & Conformité', desc: 'Données protégées, conformes aux normes africaines' },
    { icon: <BarChart3 size={24} />, title: 'Analytique Avancée', desc: 'Tableaux de bord et rapports en temps réel' },
  ]

  return (
    <div className="min-h-screen flex flex-col">
      {/* ===== HERO SECTION ===== */}
      <section className="relative overflow-hidden edu-hero-dark">
        {/* Kente pattern overlay */}
        <div className="absolute inset-0 edu-kente opacity-60" />
        {/* Radial glow - breathing animation */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] edu-animate-glow-breathe" style={{ background: 'radial-gradient(ellipse at center, oklch(55% 0.15 175 / 0.4), transparent 70%)' }} />
        {/* Floating particles */}
        <div className="edu-particle edu-particle-1" />
        <div className="edu-particle edu-particle-2" />
        <div className="edu-particle edu-particle-3" />
        <div className="edu-particle edu-particle-4" />
        <div className="edu-particle edu-particle-5" />
        {/* Decorative spinning ring */}
        <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full border border-white/5 edu-animate-spin-slow" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full border border-[oklch(72%_0.15_65)]/5 edu-animate-spin-slow" style={{ animationDirection: 'reverse' }} />

        {/* Floating nav */}
        <PublicHeader dark />

        <div className="relative container-premium py-20 sm:py-32 text-center">
          {/* Display Headline - animated entrance */}
          <h1 className="text-[40px] sm:text-[45px] lg:text-[56px] font-extrabold tracking-tight leading-[1.1] text-white mb-5 edu-animate-fade-in-up">
            Rejoignez l&apos;excellence{' '}
            <span style={{ color: GOLD }} className="edu-animate-pulse-glow inline-block rounded-lg">éducative</span>
          </h1>
          <p className="text-base sm:text-lg text-white/60 leading-relaxed mb-10 max-w-[600px] mx-auto edu-animate-fade-in-up edu-delay-200">
            La plateforme africaine de gestion scolaire qui connecte écoles, familles et enseignants pour un avenir meilleur.
          </p>

          {/* Glass morphism search bar */}
          <div className="edu-glass rounded-2xl p-2 max-w-[780px] mx-auto shadow-lg flex flex-col sm:flex-row items-stretch sm:items-center gap-2 edu-animate-fade-in-up edu-delay-400">
            <div className="flex items-center gap-2.5 px-4 flex-1">
              <Search size={18} className="text-white/50 shrink-0" />
              <input
                type="text" placeholder="Rechercher une école par nom..."
                value={search} onChange={e => setSearch(e.target.value)}
                className="flex-1 border-0 outline-none bg-transparent text-sm py-3 text-white placeholder:text-white/35"
              />
            </div>
            <select
              value={province} onChange={e => setProvince(e.target.value)}
              className="border-0 bg-white/10 py-2.5 px-3 rounded-xl text-[13px] text-white/70 border-r border-white/10 outline-none cursor-pointer"
            >
              {PROVINCES.map(p => <option key={p} value={p} className="text-edu-fg">{p}</option>)}
            </select>
            <button className="edu-gold-cta px-6 py-3 rounded-xl text-sm font-semibold edu-animate-pulse-glow">
              Rechercher
            </button>
          </div>

          {/* Stats badges - staggered entrance */}
          <div className="mt-10 flex flex-wrap justify-center gap-4 sm:gap-6">
            {[
              { value: '240+', label: 'Établissements' },
              { value: '50 000+', label: 'Familles' },
              { value: '98%', label: 'Satisfaction' },
            ].map((stat, idx) => (
              <div key={stat.label} className={`edu-glass rounded-xl px-5 py-3 sm:px-6 sm:py-4 text-center min-w-[120px] edu-animate-scale-in edu-delay-${(idx + 6) * 100}`}>
                <div className="text-xl sm:text-2xl font-extrabold text-white edu-stat-number">{stat.value}</div>
                <div className="text-[11px] sm:text-xs text-white/50 mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== TRUST SIGNALS BAR ===== */}
      <section style={{ background: IVORY }} className="border-y border-[oklch(88%_0.01_175)] edu-animate-fade-in edu-delay-800">
        <div className="container-premium py-4 text-center">
          <p className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>
            <strong className="font-semibold" style={{ color: TEXT_PRIMARY }}>240+</strong> Établissements &nbsp;•&nbsp;{' '}
            <strong className="font-semibold" style={{ color: TEXT_PRIMARY }}>50,000+</strong> Familles &nbsp;•&nbsp;{' '}
            <strong className="font-semibold" style={{ color: TEXT_PRIMARY }}>98%</strong> Satisfaction
          </p>
        </div>
      </section>

      {/* ===== SEARCH / FILTER SECTION ===== */}
      <section className="edu-ivory-texture flex-1">
        {/* Filter chips */}
        <div className="container-premium pt-8 pb-3 flex items-center gap-2 flex-wrap">
          {FILTER_CHIPS.map(chip => (
            <button
              key={chip.key}
              onClick={() => setActiveFilter(chip.key)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium transition cursor-pointer border ${
                activeFilter === chip.key
                  ? 'text-white border-transparent shadow-md'
                  : 'bg-white border-[oklch(88%_0.01_175)] hover:border-[oklch(72%_0.15_65)] hover:shadow-sm'
              }`}
              style={activeFilter === chip.key ? { background: ACCENT } : undefined}
            >
              {chip.label}
              {chip.count !== undefined && (
                <span className={`text-[11px] font-medium px-1.5 py-px rounded-full ${
                  activeFilter === chip.key ? 'bg-white/20 text-white' : 'bg-[oklch(90%_0.005_250)] text-edu-muted'
                }`}>{chip.count}</span>
              )}
            </button>
          ))}
          <div className="ml-auto hidden sm:block text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>
            Affichage {filteredSchools.length > 0 ? '1' : '0'}–{Math.min(12, filteredSchools.length)} sur {filteredSchools.length}
          </div>
          <button
            onClick={() => setShowMap(!showMap)}
            className="edu-glass-light ml-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium transition hover:shadow-md"
          >
            <MapPin size={14} /> {showMap ? 'Masquer carte' : 'Voir carte'}
          </button>
        </div>

        {/* Map */}
        {showMap && (
          <div className="container-premium mb-6">
            <div className="rounded-2xl overflow-hidden shadow-lg">
              <SchoolMap schools={filteredSchools} />
            </div>
          </div>
        )}

        {/* School Cards */}
        <div className="container-premium pb-16">
          <div className="flex items-baseline justify-between mb-5 edu-animate-fade-in-up">
            <div className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>
              <strong className="font-semibold" style={{ color: TEXT_PRIMARY }}>{filteredSchools.length} écoles</strong> correspondent à votre recherche
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="bg-white border border-[oklch(88%_0.01_175)] rounded-2xl overflow-hidden">
                  <div className="h-[120px] edu-skeleton" />
                  <div className="p-6 sm:p-10 pt-10 space-y-3">
                    <div className="h-4 edu-skeleton w-3/4" />
                    <div className="h-3 edu-skeleton w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {filteredSchools.map((school, idx) => (
                <button
                  key={school.id}
                  onClick={() => { setSelectedSchoolId(school.id); setCurrentView('school-detail') }}
                  className={`block text-left bg-white border border-[oklch(88%_0.01_175)] rounded-2xl overflow-hidden edu-card-lift edu-hover-border group edu-animate-fade-in-up ${idx < 6 ? `edu-delay-${(idx % 6) * 100 + 100}` : ''}`}
                >
                  <div className={`h-[120px] relative bg-gradient-to-br ${COVER_GRADIENTS[idx % COVER_GRADIENTS.length]} flex items-end p-4`}>
                    {/* Mesh gradient overlay */}
                    <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(ellipse at top right, oklch(72% 0.15 65 / 0.3), transparent 60%)' }} />
                    {/* Shimmer effect on hover */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 edu-animate-shimmer" />
                    <span className="absolute top-3 right-3 edu-glass px-3 py-1 rounded-full text-[11px] font-medium text-white">
                      {getSchoolTypeLabel(school.schoolType, school.schoolCategory)}
                    </span>
                    <div className={`w-12 h-12 rounded-xl bg-white grid place-items-center font-extrabold text-lg shadow-md relative top-6 group-hover:scale-110 transition-transform duration-300 ${LOGO_COLORS[idx % LOGO_COLORS.length]}`}>
                      {school.shortName.substring(0, 2)}
                    </div>
                  </div>
                  <div className="p-6 sm:p-10 pt-10">
                    <div className="text-base font-semibold tracking-tight mb-1" style={{ color: TEXT_PRIMARY }}>{school.name}</div>
                    <div className="text-[13px] flex items-center gap-1 mb-4" style={{ color: TEXT_MUTED_LUXE }}>
                      <MapPin size={12} /> {school.city} · {school.province}
                    </div>
                    <div className="flex gap-4 py-3 border-t border-b border-[oklch(88%_0.01_175)] mb-4">
                      <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>
                        <strong className="block text-[15px] font-semibold tabular-nums mb-0.5 edu-stat-number" style={{ color: TEXT_PRIMARY }}>{formatNumber(school._count?.students || school.studentCount)}</strong>élèves
                      </div>
                      <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>
                        <strong className="block text-[15px] font-semibold tabular-nums mb-0.5 edu-stat-number edu-delay-100" style={{ color: TEXT_PRIMARY }}>{school._count?.classes || school.classCount}</strong>classes
                      </div>
                      <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>
                        <strong className="block text-[15px] font-semibold tabular-nums mb-0.5 edu-stat-number edu-delay-200" style={{ color: TEXT_PRIMARY }}>{school.establishmentYear || '—'}</strong>fondée
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-[13px] font-medium">
                        <Star size={14} style={{ color: GOLD }} className="fill-current" />
                        <span style={{ color: TEXT_PRIMARY }}>{school.averageRating?.toFixed(1) || '—'}</span>
                        <span className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>· {school.totalReviews} avis</span>
                      </div>
                      <span className="edu-gold-cta text-[13px] font-semibold px-4 py-2 rounded-xl group-hover:scale-105 transition-transform duration-200">
                        Voir l&apos;école →
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ===== FEATURES SHOWCASE ===== */}
      <section id="features-section" style={{ background: IVORY }} className="py-16 sm:py-[120px]">
        <div className="container-premium text-center">
          {/* Ornament divider */}
          <div className="edu-ornament edu-ornament-draw mb-4">
            <span style={{ color: GOLD }} className="edu-animate-float">◆</span>
          </div>
          <h2 className="text-[26px] sm:text-[36px] font-extrabold tracking-tight mb-3 edu-animate-fade-in-up" style={{ color: TEXT_PRIMARY }}>
            Pourquoi choisir <span style={{ color: GOLD }}>EduGest</span>
          </h2>
          <p className="text-base max-w-[500px] mx-auto mb-12 edu-animate-fade-in-up edu-delay-200" style={{ color: TEXT_MUTED_LUXE }}>
            Une plateforme conçue pour les réalités africaines, avec les outils qu&apos;il vous faut.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {FEATURES.map((feature, idx) => (
              <div key={idx} className={`bg-white border border-[oklch(88%_0.01_175)] rounded-2xl p-8 text-left edu-card-lift edu-hover-border group edu-animate-fade-in-up edu-delay-${(idx + 1) * 100}`}>
                <div className="edu-icon-gradient w-12 h-12 rounded-xl mb-5 group-hover:scale-110 transition-transform duration-300">
                  {feature.icon}
                </div>
                <h3 className="text-[17px] sm:text-[21px] font-bold mb-2" style={{ color: TEXT_PRIMARY }}>{feature.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: TEXT_MUTED_LUXE }}>{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
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

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: IVORY }}><div className="animate-spin h-8 w-8 border-4 border-edu-accent border-t-transparent rounded-full" /></div>

  if (!school) return (
    <div className="min-h-screen flex flex-col" style={{ background: IVORY }}>
      <PublicHeader />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p style={{ color: TEXT_MUTED_LUXE }} className="mb-4">École non trouvée</p>
          <button onClick={() => setCurrentView('home')} className="font-medium" style={{ color: GOLD }}>← Retour à l&apos;accueil</button>
        </div>
      </div>
      <Footer />
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col edu-page-enter" style={{ background: IVORY }}>
      <PublicHeader />
      <div className="container-premium py-8 flex-1">
        <button onClick={() => setCurrentView('home')} className="inline-flex items-center gap-1.5 text-sm mb-6 transition hover:opacity-80 edu-animate-fade-in-left" style={{ color: TEXT_MUTED_LUXE }}>
          <ArrowLeft size={14} /> Retour aux écoles
        </button>

        <div className="bg-white border border-[oklch(88%_0.01_175)] rounded-2xl overflow-hidden shadow-sm edu-animate-fade-in-up">
          <div className={`h-48 bg-gradient-to-br ${COVER_GRADIENTS[0]} relative`}>
            {/* Darker overlay for hero */}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, oklch(15% 0.02 250 / 0.3), oklch(15% 0.02 250 / 0.5))' }} />
            {/* Decorative spinning element */}
            <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full border border-white/5 edu-animate-spin-slow" />
            <span className="absolute top-4 right-4 edu-glass px-3 py-1 rounded-full text-xs font-medium text-white">
              {getSchoolTypeLabel(school.schoolType, school.schoolCategory)}
            </span>
          </div>
          <div className="px-6 sm:px-10 pb-10 -mt-12 relative">
            <div className="w-20 h-20 rounded-2xl bg-white grid place-items-center text-2xl font-extrabold shadow-lg border border-[oklch(88%_0.01_175)] edu-animate-bounce-in" style={{ color: ACCENT }}>
              {school.shortName.substring(0, 2)}
            </div>
            <h1 className="text-[21px] sm:text-[29px] font-bold mt-4 tracking-tight edu-animate-fade-in-up edu-delay-100" style={{ color: TEXT_PRIMARY }}>{school.name}</h1>
            <div className="flex items-center gap-2 text-sm mt-2 edu-animate-fade-in-up edu-delay-200" style={{ color: TEXT_MUTED_LUXE }}>
              <MapPin size={14} /> {school.address}, {school.city} · {school.province}, {school.country}
            </div>
            <div className="flex items-center gap-4 mt-3 text-sm flex-wrap edu-animate-fade-in-up edu-delay-300">
              <span className="flex items-center gap-1"><Star size={14} style={{ color: GOLD }} className="fill-current" /> <strong style={{ color: TEXT_PRIMARY }}>{school.averageRating?.toFixed(1)}</strong> <span style={{ color: TEXT_MUTED_LUXE }}>({school.totalReviews} avis)</span></span>
              <span style={{ color: TEXT_MUTED_LUXE }}>·</span>
              <span style={{ color: TEXT_MUTED_LUXE }}>{school._count?.students || school.studentCount} élèves</span>
              <span style={{ color: TEXT_MUTED_LUXE }}>·</span>
              <span style={{ color: TEXT_MUTED_LUXE }}>{school._count?.classes || school.classCount} classes</span>
              <span style={{ color: TEXT_MUTED_LUXE }}>·</span>
              <span style={{ color: TEXT_MUTED_LUXE }}>Fondée en {school.establishmentYear}</span>
            </div>

            {school.description && (
              <div className="mt-8">
                <h3 className="font-semibold mb-2" style={{ color: TEXT_PRIMARY }}>À propos</h3>
                <p className="text-sm leading-relaxed" style={{ color: TEXT_MUTED_LUXE }}>{school.description}</p>
              </div>
            )}

            <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-xl p-5 text-center edu-animate-scale-in edu-delay-300" style={{ background: IVORY }}>
                <div className="text-2xl font-bold edu-stat-number" style={{ color: TEXT_PRIMARY }}>{formatNumber(school._count?.students || school.studentCount)}</div>
                <div className="text-xs mt-1" style={{ color: TEXT_MUTED_LUXE }}>Élèves</div>
              </div>
              <div className="rounded-xl p-5 text-center edu-animate-scale-in edu-delay-400" style={{ background: IVORY }}>
                <div className="text-2xl font-bold edu-stat-number edu-delay-100" style={{ color: TEXT_PRIMARY }}>{school._count?.classes || school.classCount}</div>
                <div className="text-xs mt-1" style={{ color: TEXT_MUTED_LUXE }}>Classes</div>
              </div>
              <div className="rounded-xl p-5 text-center edu-animate-scale-in edu-delay-500" style={{ background: IVORY }}>
                <div className="text-2xl font-bold edu-stat-number edu-delay-200" style={{ color: TEXT_PRIMARY }}>{school.establishmentYear || '—'}</div>
                <div className="text-xs mt-1" style={{ color: TEXT_MUTED_LUXE }}>Fondée</div>
              </div>
              <div className="rounded-xl p-5 text-center edu-animate-scale-in edu-delay-600" style={{ background: IVORY }}>
                <div className="text-2xl font-bold edu-stat-number edu-delay-300" style={{ color: TEXT_PRIMARY }}>{getSubscriptionLabel(school.subscriptionTier)}</div>
                <div className="text-xs mt-1" style={{ color: TEXT_MUTED_LUXE }}>Abonnement</div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <div className="flex items-center gap-2 text-sm" style={{ color: TEXT_MUTED_LUXE }}><Mail size={14} /> {school.email}</div>
              <div className="flex items-center gap-2 text-sm" style={{ color: TEXT_MUTED_LUXE }}><Phone size={14} /> {school.phone}</div>
            </div>

            {school.latitude && school.longitude && (
              <div className="mt-8">
                <h3 className="font-semibold mb-3" style={{ color: TEXT_PRIMARY }}>Localisation</h3>
                <div className="rounded-2xl overflow-hidden shadow-sm"><SchoolMap schools={[school]} /></div>
              </div>
            )}

            <div className="mt-8">
              <button onClick={() => setCurrentView('login')} className="edu-gold-cta px-8 py-3.5 rounded-xl font-semibold text-sm edu-animate-pulse-glow">
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

// ===== CREATE SCHOOL VIEW =====
function CreateSchoolView() {
  const { setCurrentView, login } = useEduGestStore()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [loading, setLoading] = useState(false)
  const [createdSchool, setCreatedSchool] = useState<SchoolData | null>(null)

  // School fields
  const [name, setName] = useState('')
  const [shortName, setShortName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [province, setProvince] = useState('Kinshasa')
  const [country, setCountry] = useState('RDC')
  const [schoolType, setSchoolType] = useState('MIXTE')
  const [schoolCategory, setSchoolCategory] = useState('PRIVEE')
  const [description, setDescription] = useState('')
  const [establishmentYear, setEstablishmentYear] = useState('')
  const [maxStudents, setMaxStudents] = useState('500')

  // Admin fields
  const [adminName, setAdminName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPhone, setAdminPhone] = useState('')
  const [adminPassword, setAdminPassword] = useState('')

  // Subscription
  const [subscriptionTier, setSubscriptionTier] = useState('FREEMIUM')

  const SCHOOL_TYPES = [
    { value: 'MATERNELLE', label: 'Maternelle' },
    { value: 'PRIMAIRE', label: 'Primaire' },
    { value: 'SECONDAIRE', label: 'Secondaire' },
    { value: 'MIXTE', label: 'Mixte' },
  ]

  const SCHOOL_CATEGORIES = [
    { value: 'PRIVEE', label: 'Privée' },
    { value: 'PUBLIQUE', label: 'Publique' },
  ]

  const COUNTRIES = [
    { value: 'RDC', label: 'RD Congo' },
    { value: 'Sénégal', label: 'Sénégal' },
    { value: 'Côte d\'Ivoire', label: 'Côte d\'Ivoire' },
    { value: 'Congo', label: 'Congo' },
    { value: 'Cameroun', label: 'Cameroun' },
    { value: 'Gabon', label: 'Gabon' },
  ]

  const SUBSCRIPTION_OPTIONS = [
    { value: 'FREEMIUM', label: 'Freemium', price: '0$/mois', desc: 'Pour découvrir', color: MUTED },
    { value: 'ESSENTIEL', label: 'Essentiel', price: '100$/mois', desc: 'Petites structures', color: INFO },
    { value: 'STANDARD', label: 'Standard', price: '250$/mois', desc: 'Le choix des écoles', color: ACCENT, popular: true },
    { value: 'PREMIUM', label: 'Professionnel', price: '500$/mois', desc: 'Grands établissements', color: WARNING },
  ]

  function validateStep1(): boolean {
    if (!name || !shortName || !email || !phone || !city || !province || !country) {
      toast.error('Veuillez remplir tous les champs obligatoires')
      return false
    }
    return true
  }

  function validateStep2(): boolean {
    if (!adminName || !adminEmail || !adminPhone || !adminPassword) {
      toast.error('Veuillez remplir tous les champs du compte administrateur')
      return false
    }
    if (adminPassword.length < 6) {
      toast.error('Le mot de passe doit contenir au moins 6 caractères')
      return false
    }
    return true
  }

  async function handleSubmit() {
    setLoading(true)
    try {
      const res = await fetch('/api/schools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          shortName,
          email,
          phone,
          address,
          city,
          province,
          country,
          description: description || null,
          schoolType,
          schoolCategory,
          maxStudents: parseInt(maxStudents) || 500,
          establishmentYear: parseInt(establishmentYear) || null,
          adminName,
          adminEmail,
          adminPhone,
          adminPassword,
        }),
      })
      const json = await res.json()

      if (!res.ok) {
        toast.error(json.error || 'Erreur lors de la création')
        return
      }

      setCreatedSchool(json.data?.school)
      toast.success('École créée avec succès !')

      // Auto-login the admin user
      if (json.data?.adminUser) {
        const loginRes = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: adminEmail, password: adminPassword }),
        })
        const loginJson = await loginRes.json()
        if (loginJson.data) {
          const apiUser = loginJson.data
          const roleMap: Record<string, UserRole> = {
            SUPER_ADMIN_GLOBAL: 'SUPER_ADMIN_GLOBAL',
            SECRETARY: 'SECRETARY',
            CASHIER: 'CASHIER',
            TEACHER: 'TEACHER',
            PARENT: 'PARENT',
          }
          const role = roleMap[apiUser.role] || 'SECRETARY'
          login(role, {
            id: apiUser.id,
            name: apiUser.name,
            role,
            schoolId: apiUser.schoolId,
            schoolName: json.data?.school?.name || name,
            initials: getInitials(apiUser.name),
            profileImageUrl: apiUser.profileImageUrl || null,
          })
        }
      }

      setStep(3)
    } catch (e) {
      toast.error('Erreur réseau. Vérifiez votre connexion.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: IVORY }}>
      <PublicHeader />
      <div className="container-premium py-8 sm:py-12 flex-1">
        <button onClick={() => setCurrentView('login')} className="inline-flex items-center gap-1.5 text-[13px] mb-6 transition hover:opacity-80" style={{ color: TEXT_MUTED_LUXE }}>
          <ArrowLeft size={14} /> Retour à la connexion
        </button>

        {step === 3 && createdSchool ? (
          /* ===== SUCCESS SCREEN ===== */
          <div className="max-w-lg mx-auto text-center">
            <div className="w-20 h-20 rounded-full mx-auto mb-6 grid place-items-center" style={{ background: SUCCESS_SOFT }}>
              <CheckCircle size={40} style={{ color: SUCCESS }} />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3" style={{ color: TEXT_PRIMARY }}>
              École créée avec succès ! 🎉
            </h1>
            <p className="text-base mb-6" style={{ color: TEXT_MUTED_LUXE }}>
              <strong style={{ color: TEXT_PRIMARY }}>{createdSchool.name}</strong> a été ajoutée à EduGest.
              Vous êtes maintenant connecté en tant qu&apos;administrateur.
            </p>
            <div className="bg-white border border-[oklch(88%_0.01_175)] rounded-2xl p-6 mb-6 text-left">
              <h3 className="font-semibold mb-3" style={{ color: TEXT_PRIMARY }}>Récapitulatif</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span style={{ color: TEXT_MUTED_LUXE }}>Nom</span><span style={{ color: TEXT_PRIMARY }}>{createdSchool.name}</span></div>
                <div className="flex justify-between"><span style={{ color: TEXT_MUTED_LUXE }}>Abréviation</span><span style={{ color: TEXT_PRIMARY }}>{createdSchool.shortName}</span></div>
                <div className="flex justify-between"><span style={{ color: TEXT_MUTED_LUXE }}>Ville</span><span style={{ color: TEXT_PRIMARY }}>{createdSchool.city}, {createdSchool.province}</span></div>
                <div className="flex justify-between"><span style={{ color: TEXT_MUTED_LUXE }}>Type</span><span style={{ color: TEXT_PRIMARY }}>{getSchoolTypeLabel(createdSchool.schoolType, createdSchool.schoolCategory)}</span></div>
                <div className="flex justify-between"><span style={{ color: TEXT_MUTED_LUXE }}>Admin</span><span style={{ color: TEXT_PRIMARY }}>{adminName}</span></div>
                <div className="flex justify-between"><span style={{ color: TEXT_MUTED_LUXE }}>Email admin</span><span style={{ color: TEXT_PRIMARY }}>{adminEmail}</span></div>
              </div>
            </div>
            <div className="bg-[oklch(95%_0.05_65)] border border-[oklch(88%_0.04_65)] rounded-xl p-4 mb-6 text-sm" style={{ color: WARNING }}>
              <div className="flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <div>
                  <strong>Important :</strong> Notez vos identifiants de connexion.<br />
                  Email : <strong>{adminEmail}</strong><br />
                  Mot de passe : celui que vous avez défini
                </div>
              </div>
            </div>
            <button
              onClick={() => {/* Already logged in, will show dashboard via store */}}
              className="edu-gold-cta w-full py-3.5 rounded-xl font-semibold text-sm"
            >
              Accéder au tableau de bord →
            </button>
          </div>
        ) : (
          /* ===== CREATION FORM ===== */
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <div className="edu-ornament mb-4">
                <span style={{ color: GOLD }}>◆</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2" style={{ color: TEXT_PRIMARY }}>
                Créer <span style={{ color: GOLD }}>mon école</span>
              </h1>
              <p className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>
                Inscrivez votre établissement sur EduGest et commencez à gérer efficacement
              </p>
            </div>

            {/* Step indicator */}
            <div className="flex items-center justify-center gap-2 mb-8">
              {[
                { n: 1, label: 'Informations' },
                { n: 2, label: 'Compte admin' },
              ].map((s, i) => (
                <div key={s.n} className="flex items-center gap-2">
                  <button
                    onClick={() => { if (s.n < step) setStep(s.n as 1 | 2) }}
                    className={`w-9 h-9 rounded-full grid place-items-center text-sm font-bold transition ${
                      step >= s.n ? 'text-white' : 'bg-white border-2 border-[oklch(88%_0.01_175)] text-edu-muted'
                    }`}
                    style={step >= s.n ? { background: GOLD } : undefined}
                  >
                    {step > s.n ? <Check size={16} /> : s.n}
                  </button>
                  <span className={`text-sm font-medium ${step >= s.n ? '' : ''}`} style={{ color: step >= s.n ? TEXT_PRIMARY : TEXT_MUTED_LUXE }}>
                    {s.label}
                  </span>
                  {i === 0 && <div className="w-8 h-0.5 mx-2" style={{ background: step > 1 ? GOLD : BORDER }} />}
                </div>
              ))}
            </div>

            <div className="bg-white border border-[oklch(88%_0.01_175)] rounded-2xl shadow-sm overflow-hidden">
              {/* Step 1: School info */}
              {step === 1 && (
                <div className="p-6 sm:p-8 space-y-5">
                  <h2 className="text-lg font-bold" style={{ color: TEXT_PRIMARY }}>Informations de l&apos;école</h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Nom complet <span style={{ color: DANGER }}>*</span></label>
                      <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Complexe Scolaire La Lumière"
                        className="w-full mt-1 px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" required />
                    </div>
                    <div>
                      <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Abréviation <span style={{ color: DANGER }}>*</span></label>
                      <input type="text" value={shortName} onChange={e => setShortName(e.target.value.toUpperCase())} placeholder="Ex: CSL" maxLength={6}
                        className="w-full mt-1 px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" required />
                    </div>
                    <div>
                      <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Année de fondation</label>
                      <input type="number" value={establishmentYear} onChange={e => setEstablishmentYear(e.target.value)} placeholder="Ex: 2005"
                        className="w-full mt-1 px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" />
                    </div>
                    <div>
                      <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Email <span style={{ color: DANGER }}>*</span></label>
                      <div className="flex items-center gap-2 mt-1 border border-[oklch(88%_0.01_175)] rounded-xl px-3 py-3 focus-within:ring-[3px] focus-within:ring-[oklch(95%_0.05_65)] focus-within:border-[oklch(72%_0.15_65)] transition">
                        <Mail size={14} style={{ color: TEXT_MUTED_LUXE }} />
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="ecole@email.com"
                          className="flex-1 border-0 bg-transparent outline-none text-sm" required />
                      </div>
                    </div>
                    <div>
                      <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Téléphone <span style={{ color: DANGER }}>*</span></label>
                      <div className="flex items-center gap-2 mt-1 border border-[oklch(88%_0.01_175)] rounded-xl px-3 py-3 focus-within:ring-[3px] focus-within:ring-[oklch(95%_0.05_65)] focus-within:border-[oklch(72%_0.15_65)] transition">
                        <Phone size={14} style={{ color: TEXT_MUTED_LUXE }} />
                        <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+243 81 234 56 78"
                          className="flex-1 border-0 bg-transparent outline-none text-sm" required />
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Adresse</label>
                      <div className="flex items-center gap-2 mt-1 border border-[oklch(88%_0.01_175)] rounded-xl px-3 py-3 focus-within:ring-[3px] focus-within:ring-[oklch(95%_0.05_65)] focus-within:border-[oklch(72%_0.15_65)] transition">
                        <MapPin size={14} style={{ color: TEXT_MUTED_LUXE }} />
                        <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Av. Independence"
                          className="flex-1 border-0 bg-transparent outline-none text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Ville <span style={{ color: DANGER }}>*</span></label>
                      <input type="text" value={city} onChange={e => setCity(e.target.value)} placeholder="Kinshasa"
                        className="w-full mt-1 px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" required />
                    </div>
                    <div>
                      <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Province <span style={{ color: DANGER }}>*</span></label>
                      <select value={province} onChange={e => setProvince(e.target.value)}
                        className="w-full mt-1 px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)] cursor-pointer">
                        {PROVINCES.filter(p => p !== 'Toutes provinces').map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Pays <span style={{ color: DANGER }}>*</span></label>
                      <select value={country} onChange={e => setCountry(e.target.value)}
                        className="w-full mt-1 px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)] cursor-pointer">
                        {COUNTRIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Capacité max</label>
                      <input type="number" value={maxStudents} onChange={e => setMaxStudents(e.target.value)} placeholder="500"
                        className="w-full mt-1 px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" />
                    </div>
                    <div>
                      <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Type d&apos;école</label>
                      <div className="flex gap-2 mt-1">
                        {SCHOOL_TYPES.map(t => (
                          <button key={t.value} type="button" onClick={() => setSchoolType(t.value)}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition ${
                              schoolType === t.value ? 'text-white shadow-md' : 'bg-white border border-[oklch(88%_0.01_175)]'
                            }`}
                            style={schoolType === t.value ? { background: GOLD } : { color: TEXT_MUTED_LUXE }}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Catégorie</label>
                      <div className="flex gap-2 mt-1">
                        {SCHOOL_CATEGORIES.map(c => (
                          <button key={c.value} type="button" onClick={() => setSchoolCategory(c.value)}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition ${
                              schoolCategory === c.value ? 'text-white shadow-md' : 'bg-white border border-[oklch(88%_0.01_175)]'
                            }`}
                            style={schoolCategory === c.value ? { background: GOLD } : { color: TEXT_MUTED_LUXE }}
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Description</label>
                      <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Décrivez brièvement votre établissement..." rows={3}
                        className="w-full mt-1 px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)] resize-none" />
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button onClick={() => validateStep1() && setStep(2)} className="edu-gold-cta px-8 py-3 rounded-xl font-semibold text-sm flex items-center gap-2">
                      Continuer <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Admin account info */}
              {step === 2 && (
                <div className="p-6 sm:p-8 space-y-5">
                  <div className="rounded-xl p-4 mb-2" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white/20 grid place-items-center text-white">
                        <Shield size={20} />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-white">Informations du compte administrateur</h2>
                        <p className="text-sm text-white/70">Ce compte vous permettra de gérer votre école</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Nom complet <span style={{ color: DANGER }}>*</span></label>
                      <div className="flex items-center gap-2 mt-1 border border-[oklch(88%_0.01_175)] rounded-xl px-3 py-3 focus-within:ring-[3px] focus-within:ring-[oklch(95%_0.05_65)] focus-within:border-[oklch(72%_0.15_65)] transition">
                        <UserCircle size={14} style={{ color: TEXT_MUTED_LUXE }} />
                        <input type="text" value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Jean Mukendi"
                          className="flex-1 border-0 bg-transparent outline-none text-sm" required />
                      </div>
                    </div>
                    <div>
                      <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Email professionnel <span style={{ color: DANGER }}>*</span></label>
                      <div className="flex items-center gap-2 mt-1 border border-[oklch(88%_0.01_175)] rounded-xl px-3 py-3 focus-within:ring-[3px] focus-within:ring-[oklch(95%_0.05_65)] focus-within:border-[oklch(72%_0.15_65)] transition">
                        <Mail size={14} style={{ color: TEXT_MUTED_LUXE }} />
                        <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="admin@ecole.com"
                          className="flex-1 border-0 bg-transparent outline-none text-sm" required />
                      </div>
                    </div>
                    <div>
                      <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Téléphone <span style={{ color: DANGER }}>*</span></label>
                      <div className="flex items-center gap-2 mt-1 border border-[oklch(88%_0.01_175)] rounded-xl px-3 py-3 focus-within:ring-[3px] focus-within:ring-[oklch(95%_0.05_65)] focus-within:border-[oklch(72%_0.15_65)] transition">
                        <Phone size={14} style={{ color: TEXT_MUTED_LUXE }} />
                        <input type="tel" value={adminPhone} onChange={e => setAdminPhone(e.target.value)} placeholder="+243 81 234 56 78"
                          className="flex-1 border-0 bg-transparent outline-none text-sm" required />
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Mot de passe <span style={{ color: DANGER }}>*</span></label>
                      <div className="flex items-center gap-2 mt-1 border border-[oklch(88%_0.01_175)] rounded-xl px-3 py-3 focus-within:ring-[3px] focus-within:ring-[oklch(95%_0.05_65)] focus-within:border-[oklch(72%_0.15_65)] transition">
                        <Lock size={14} style={{ color: TEXT_MUTED_LUXE }} />
                        <input type="password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} placeholder="Minimum 6 caractères"
                          className="flex-1 border-0 bg-transparent outline-none text-sm" required />
                      </div>
                    </div>
                  </div>

                  {/* Subscription selection */}
                  <div className="pt-4">
                    <h3 className="text-[13px] font-medium mb-3" style={{ color: TEXT_PRIMARY }}>Choisir votre formule</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {SUBSCRIPTION_OPTIONS.map(opt => (
                        <button key={opt.value} type="button" onClick={() => setSubscriptionTier(opt.value)}
                          className={`relative p-3 rounded-xl text-left transition border-2 ${
                            subscriptionTier === opt.value
                              ? 'border-[oklch(72%_0.15_65)] shadow-md'
                              : 'border-[oklch(88%_0.01_175)] hover:border-[oklch(72%_0.15_65_/_0.5)]'
                          }`}
                        >
                          {opt.popular && (
                            <span className="absolute -top-2 left-3 text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: GOLD }}>Populaire</span>
                          )}
                          <div className="text-sm font-bold" style={{ color: opt.color }}>{opt.label}</div>
                          <div className="text-lg font-extrabold mt-1" style={{ color: TEXT_PRIMARY }}>{opt.price}</div>
                          <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{opt.desc}</div>
                          {subscriptionTier === opt.value && (
                            <div className="absolute top-2 right-2 w-5 h-5 rounded-full grid place-items-center text-white" style={{ background: GOLD }}>
                              <Check size={12} />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-between pt-2">
                    <button onClick={() => setStep(1)} className="px-6 py-3 rounded-xl text-sm font-medium border border-[oklch(88%_0.01_175)] hover:bg-white/60 transition" style={{ color: TEXT_MUTED_LUXE }}>
                      ← Retour
                    </button>
                    <button onClick={() => validateStep2() && handleSubmit()} disabled={loading}
                      className="edu-gold-cta px-8 py-3 rounded-xl font-semibold text-sm flex items-center gap-2 disabled:opacity-50">
                      {loading ? <div className="h-4 w-4 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <CheckCircle size={16} />}
                      Créer mon école
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
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
    <div className="min-h-screen flex flex-col" style={{ background: IVORY }}>
      <PublicHeader />
      <div className="container-premium py-16 sm:py-[120px] flex-1">
        <div className="text-center mb-12">
          {/* Ornament divider */}
          <div className="edu-ornament mb-4">
            <span style={{ color: GOLD }}>◆</span>
          </div>
          <h1 className="text-[26px] sm:text-[36px] font-extrabold tracking-tight mb-3" style={{ color: TEXT_PRIMARY }}>
            Tarifs <span style={{ color: GOLD }}>transparents</span>
          </h1>
          <p className="max-w-[500px] mx-auto" style={{ color: TEXT_MUTED_LUXE }}>Choisissez la formule adaptée à votre établissement. Évoluez à tout moment.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {tiers.map(tier => (
            <div key={tier.name} className={`bg-white border rounded-2xl p-8 sm:p-10 relative edu-card-lift ${
              tier.popular
                ? 'border-[oklch(72%_0.15_65)] shadow-[0_0_24px_oklch(72%_0.15_65_/_0.12)]'
                : 'border-[oklch(88%_0.01_175)]'
            }`}>
              {tier.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 edu-gold-cta px-4 py-1 rounded-full text-xs font-semibold">Populaire</span>
              )}
              <h3 className="text-lg font-bold" style={{ color: TEXT_PRIMARY }}>{tier.name}</h3>
              <p className="text-sm mt-1 mb-5" style={{ color: TEXT_MUTED_LUXE }}>{tier.desc}</p>
              <div className="mb-6">
                <span className="text-3xl font-extrabold" style={{ color: TEXT_PRIMARY }}>{tier.price}</span>
                <span className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>{tier.period}</span>
              </div>
              <ul className="space-y-3 mb-6">
                {tier.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm" style={{ color: TEXT_PRIMARY }}>
                    <CheckCircle size={14} style={{ color: tier.color }} /> {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setCurrentView('create-school')}
                className={`w-full py-3 rounded-xl text-sm font-semibold transition ${
                  tier.popular
                    ? 'edu-gold-cta'
                    : 'border border-[oklch(88%_0.01_175)] hover:border-[oklch(72%_0.15_65)] hover:shadow-sm'
                }`}
                style={tier.popular ? undefined : { color: TEXT_PRIMARY }}
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
  const [showWhatsappModal, setShowWhatsappModal] = useState(false)
  const [waPhone, setWaPhone] = useState('')
  const [waCode, setWaCode] = useState('')
  const [waStep, setWaStep] = useState<'phone' | 'code'>('phone')
  const [waLoading, setWaLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const json = await res.json()
      if (json.data) {
        const apiUser = json.data
        const role = mapApiRole(apiUser.role)
        if (role) {
          login(role, {
            id: apiUser.id,
            name: apiUser.name,
            role,
            schoolId: apiUser.schoolId,
            schoolName: apiUser.school?.name || 'EduGest',
            initials: getInitials(apiUser.name),
            profileImageUrl: apiUser.profileImageUrl || null,
          })
          toast.success(`Bienvenue, ${apiUser.name}!`)
          return
        }
      }
      // If API returned an error, show it
      if (json.error) {
        toast.error(json.error === 'Invalid credentials' ? 'Email ou mot de passe incorrect' : json.error)
      } else {
        toast.error('Erreur de connexion au serveur')
      }
    } catch (e) {
      toast.error('Erreur réseau. Vérifiez votre connexion.')
    } finally {
      setLoading(false)
    }
  }

  function mapApiRole(role: string): UserRole | null {
    const map: Record<string, UserRole> = {
      SUPER_ADMIN_GLOBAL: 'SUPER_ADMIN_GLOBAL',
      SCHOOL_ADMIN: 'SECRETARY',
      SECRETARY: 'SECRETARY',
      CASHIER: 'CASHIER',
      DIRECTION_MATERNELLE: 'DIRECTION_MATERNELLE',
      DIRECTION_PRIMAIRE: 'DIRECTION_PRIMAIRE',
      DIRECTION_SECONDAIRE: 'DIRECTION_SECONDAIRE',
      DIRECTION: 'DIRECTION_PRIMAIRE',
      DISCIPLINE_MATERNELLE: 'DISCIPLINE_MATERNELLE',
      DISCIPLINE_PRIMAIRE: 'DISCIPLINE_PRIMAIRE',
      DISCIPLINE_SECONDAIRE: 'DISCIPLINE_SECONDAIRE',
      DISCIPLINE: 'DISCIPLINE_PRIMAIRE',
      TEACHER: 'TEACHER',
      HEAD_TEACHER: 'HEAD_TEACHER',
      PARENT: 'PARENT',
    }
    return map[role] || null
  }

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Left brand side - dark with Kente pattern */}
      <div className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden text-white edu-hero-dark">
        <div className="absolute inset-0 edu-kente opacity-60" />
        <div className="absolute -top-24 -right-24 w-[480px] h-[480px] rounded-full opacity-20" style={{ background: 'radial-gradient(oklch(72% 0.15 65), transparent 70%)' }} />
        <div className="relative flex items-center gap-2.5 font-bold text-lg">
          <BrandMark height={48} />
        </div>
        <div className="relative max-w-[460px]">
          <h2 className="text-[34px] font-extrabold tracking-tight leading-[1.15] mb-3.5">
            Bienvenue sur la plateforme de gestion scolaire préférée en <span style={{ color: GOLD }}>Afrique francophone</span>.
          </h2>
          <p className="text-base opacity-75 leading-relaxed">
            Notes, paiements, communications, bulletins — tout est centralisé pour vous faire gagner du temps.
          </p>
          <div className="mt-6 space-y-3.5">
            {[
              { icon: <CheckCircle size={16} />, title: 'Multi-écoles', desc: 'Gérez plusieurs établissements depuis un seul compte' },
              { icon: <MessageSquare size={16} />, title: 'Notifications WhatsApp', desc: 'Alertes instantanées pour les parents' },
              { icon: <CreditCard size={16} />, title: 'Paiement mobile', desc: 'Orange Money, M-Pesa, Airtel Money acceptés' },
            ].map((f, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/12 flex items-center justify-center shrink-0">{f.icon}</div>
                <div className="text-[13px] opacity-80 leading-relaxed"><strong className="block opacity-100">{f.title}</strong>{f.desc}</div>
              </div>
            ))}
          </div>
          <div className="mt-8 edu-glass rounded-2xl p-5">
            <p className="text-sm leading-relaxed mb-3">&ldquo;EduGest nous a fait gagner 12h par semaine sur la gestion des notes et paiements. Les parents adorent les notifications WhatsApp.&rdquo;</p>
            <div className="flex items-center gap-2.5 text-xs opacity-75">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[oklch(70%_0.15_65)] to-[oklch(55%_0.13_30)] grid place-items-center font-semibold text-xs">MK</div>
              Mme Kabongo · Directrice, Complexe Lumière
            </div>
          </div>
        </div>
        <div className="relative text-[13px] opacity-50">© 2026 EduGest · Kinshasa · Dakar · Abidjan</div>
      </div>

      {/* Right form side - ivory luxury */}
      <div className="flex items-center justify-center p-6 sm:p-12" style={{ background: IVORY }}>
        <div className="w-full max-w-[420px]">
          <button onClick={() => setCurrentView('home')} className="inline-flex items-center gap-1.5 text-[13px] mb-6 transition hover:opacity-80" style={{ color: TEXT_MUTED_LUXE }}>
            <ArrowLeft size={14} /> Retour à l&apos;accueil
          </button>
          <div className="mb-6">
            <h1 className="text-[28px] font-bold tracking-tight mb-1.5" style={{ color: TEXT_PRIMARY }}>
              {tab === 'parent' ? 'Connexion Parent' : 'Connexion Administration'}
            </h1>
            <p className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>
              {tab === 'parent' ? 'Accédez au suivi scolaire de vos enfants' : 'Personnel de l\'école, direction, enseignants'}
            </p>
          </div>

          {/* Tab switcher */}
          <div className="flex bg-white border border-[oklch(88%_0.01_175)] rounded-xl p-1 mb-6">
            <button onClick={() => setTab('parent')} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${tab === 'parent' ? 'text-white' : ''}`} style={tab === 'parent' ? { background: GOLD, boxShadow: `0 2px 8px oklch(72% 0.15 65 / .25)` } : { color: TEXT_MUTED_LUXE }}>
              Parent
            </button>
            <button onClick={() => setTab('admin')} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${tab === 'admin' ? 'text-white' : ''}`} style={tab === 'admin' ? { background: GOLD, boxShadow: `0 2px 8px oklch(72% 0.15 65 / .25)` } : { color: TEXT_MUTED_LUXE }}>
              Administration
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>{tab === 'parent' ? 'Email ou numéro WhatsApp' : 'Email professionnel'}</label>
              <input
                type="text" value={email} onChange={e => setEmail(e.target.value)}
                placeholder={tab === 'parent' ? 'ex. parent@email.com ou +243 81...' : 'ex. direction@ecole.cd'}
                className="w-full px-4 py-3.5 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]"
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Mot de passe</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3.5 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]"
                required
              />
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <label className="flex items-center gap-2 cursor-pointer" style={{ color: TEXT_MUTED_LUXE }}>
                <input type="checkbox" className="accent-[oklch(72%_0.15_65)]" /> Se souvenir de moi
              </label>
              <button type="button" className="font-medium hover:underline" style={{ color: GOLD }}>Mot de passe oublié ?</button>
            </div>
            <button type="submit" disabled={loading} className="edu-gold-cta w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
              {loading ? <div className="h-4 w-4 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : 'Se connecter'}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5 text-xs uppercase tracking-wider" style={{ color: TEXT_MUTED_LUXE }}>
            <div className="flex-1 h-px bg-[oklch(88%_0.01_175)]" /> ou <div className="flex-1 h-px bg-[oklch(88%_0.01_175)]" />
          </div>

          <button
            onClick={() => { setShowWhatsappModal(true); setWaStep('phone'); setWaPhone(''); setWaCode('') }}
            className="w-full py-3.5 rounded-xl text-white font-medium text-sm flex items-center justify-center gap-2 transition hover:opacity-90"
            style={{ background: SUCCESS }}
          >
            <MessageSquare size={18} /> Se connecter avec WhatsApp
          </button>

          <p className="text-center text-[13px] mt-6" style={{ color: TEXT_MUTED_LUXE }}>
            Pas encore de compte ? <button onClick={() => setCurrentView('create-school')} className="font-medium hover:underline" style={{ color: GOLD }}>Créer mon école</button>
          </p>
        </div>
      </div>

      {/* WhatsApp Login Modal */}
      {showWhatsappModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowWhatsappModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl grid place-items-center text-white" style={{ background: SUCCESS }}>
                  <MessageSquare size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold" style={{ color: TEXT_PRIMARY }}>WhatsApp</h2>
                  <p className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Connexion sécurisée</p>
                </div>
              </div>
              <button onClick={() => setShowWhatsappModal(false)}><X size={18} /></button>
            </div>

            {waStep === 'phone' ? (
              <div className="space-y-4">
                <p className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>Entrez votre numéro WhatsApp pour recevoir un code de vérification.</p>
                <div>
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Numéro WhatsApp</label>
                  <div className="flex items-center gap-2 mt-1 border border-[oklch(88%_0.01_175)] rounded-xl px-3 py-3 focus-within:ring-[3px] focus-within:ring-[oklch(95%_0.05_65)] focus-within:border-[oklch(72%_0.15_65)]">
                    <Phone size={16} style={{ color: TEXT_MUTED_LUXE }} />
                    <input
                      type="tel"
                      placeholder="+243 81 234 56 78"
                      value={waPhone}
                      onChange={e => setWaPhone(e.target.value)}
                      className="flex-1 border-0 outline-none text-sm bg-transparent"
                    />
                  </div>
                </div>
                <button
                  onClick={async () => {
                    if (!waPhone) { toast.error('Veuillez entrer votre numéro'); return }
                    setWaLoading(true)
                    try {
                      const res = await fetch('/api/auth/whatsapp', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone: waPhone, action: 'send' }),
                      })
                      if (res.ok) {
                        setWaStep('code')
                        toast.success('Code de vérification envoyé!')
                      } else {
                        const json = await res.json()
                        toast.error(json.error || 'Erreur lors de l\'envoi du code')
                      }
                    } catch { toast.error('Erreur réseau') }
                    finally { setWaLoading(false) }
                  }}
                  disabled={waLoading}
                  className="w-full py-3.5 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition hover:opacity-90"
                  style={{ background: SUCCESS }}
                >
                  {waLoading ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send size={16} />}
                  Envoyer le code
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>Entrez le code à 6 chiffres envoyé au <strong style={{ color: TEXT_PRIMARY }}>{waPhone}</strong></p>
                <div>
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Code de vérification</label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="000000"
                    value={waCode}
                    onChange={e => setWaCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full mt-1 px-4 py-3.5 border border-[oklch(88%_0.01_175)] rounded-xl text-center text-2xl font-bold tracking-[0.5em] outline-none focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)] focus:border-[oklch(72%_0.15_65)]"
                    style={{ color: TEXT_PRIMARY }}
                  />
                </div>
                <button
                  onClick={async () => {
                    if (waCode.length !== 6) { toast.error('Veuillez entrer le code à 6 chiffres'); return }
                    setWaLoading(true)
                    try {
                      const res = await fetch('/api/auth/whatsapp', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone: waPhone, code: waCode, action: 'verify' }),
                      })
                      const json = await res.json()
                      if (res.ok && json.data) {
                        const apiUser = json.data
                        const role = mapApiRole(apiUser.role)
                        if (role) {
                          login(role, {
                            id: apiUser.id,
                            name: apiUser.name,
                            role,
                            schoolId: apiUser.schoolId,
                            schoolName: apiUser.school?.name || 'EduGest',
                            initials: getInitials(apiUser.name),
                            profileImageUrl: apiUser.profileImageUrl || null,
                          })
                          toast.success(`Bienvenue, ${apiUser.name}!`)
                          setShowWhatsappModal(false)
                          return
                        }
                      }
                      toast.error(json.error || 'Code invalide')
                    } catch { toast.error('Erreur réseau') }
                    finally { setWaLoading(false) }
                  }}
                  disabled={waLoading}
                  className="w-full py-3.5 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition hover:opacity-90"
                  style={{ background: SUCCESS }}
                >
                  {waLoading ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle size={16} />}
                  Vérifier
                </button>
                <button
                  onClick={() => setWaStep('phone')}
                  className="w-full text-sm font-medium py-2 hover:underline"
                  style={{ color: GOLD }}
                >
                  Changer de numéro
                </button>
              </div>
            )}
          </div>
        </div>
      )}
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
      { icon: <CreditCard size={16} />, label: 'Abonnements', view: 'payments' },
      { icon: <TrendingUp size={16} />, label: 'Revenus', view: 'grades' },
      { icon: <AlertTriangle size={16} />, label: 'Dettes', view: 'discipline' },
      { icon: <BadgeDollarSign size={16} />, label: 'Tarifs', view: 'pricing' },
      { icon: <MessageSquare size={16} />, label: 'WhatsApp Config', view: 'whatsapp-config' as ViewType },
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
      <aside className={`fixed lg:sticky top-0 left-0 z-50 lg:z-auto h-screen w-[240px] flex flex-col transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`} style={{ background: DARK }}>
        <div className="p-[18px] flex items-center gap-2.5 border-b border-white/10">
          <BrandMark height={32} />
          <div className="text-[11px] text-white/50 font-medium">{getRoleLabel(userRole!)}</div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
          <div className="px-5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">Navigation</div>
          <nav className="flex flex-col gap-0.5 px-3">
            {menuItems.map(item => (
              <button
                key={item.label}
                onClick={() => { setCurrentView(item.view); setSidebarOpen(false) }}
                className={`edu-sidebar-item flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] font-medium transition relative ${
                  currentView === item.view
                    ? 'text-[oklch(72%_0.15_65)] font-semibold active'
                    : 'text-white/70 hover:text-white hover:bg-white/5'
                }`}
                style={currentView === item.view ? { background: 'oklch(72% 0.15 65 / 0.08)', borderLeft: '3px solid oklch(72% 0.15 65)' } : { borderLeft: '3px solid transparent' }}
              >
                <span className={currentView === item.view ? 'text-[oklch(72%_0.15_65)]' : ''}>{item.icon}</span>
                {item.label}
                {item.badge && <span className="ml-auto bg-[oklch(72%_0.15_65)] text-[oklch(15%_0.02_250)] text-[10px] px-1.5 py-px rounded-full font-semibold">{item.badge}</span>}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-2.5 p-2.5 rounded-xl edu-glass">
            {userData?.profileImageUrl ? (
              <img src={userData.profileImageUrl} alt="Avatar" className="w-9 h-9 rounded-full object-cover shrink-0 border border-white/20" />
            ) : (
              <div className="w-9 h-9 rounded-full grid place-items-center text-white font-semibold text-[13px] shrink-0" style={{ background: `linear-gradient(135deg, oklch(55% 0.15 175), oklch(72% 0.15 65))` }}>
                {userData?.initials || '??'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold truncate text-white/90">{userData?.name || 'Utilisateur'}</div>
              <div className="text-[11px] text-white/50 truncate">{userData?.schoolName || ''}</div>
            </div>
            <button onClick={logout} className="text-white/40 hover:text-[oklch(58%_0.20_25)] transition shrink-0"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>
    </>
  )
}

// ===== TOPBAR =====
function Topbar() {
  const { currentView, sidebarOpen, setSidebarOpen, setCurrentView } = useEduGestStore()
  const viewTitles: Record<string, string> = {
    dashboard: 'Dashboard', students: 'Élèves', classes: 'Classes', grades: 'Notes',
    payments: 'Paiements', discipline: 'Discipline', communications: 'Communications',
    homework: 'Devoirs', profile: 'Mon profil', pricing: 'Tarifs', 'class-passing': 'Passage de classe',
    bulletin: 'Bulletins', convocation: 'Convocation', schools: 'Écoles',
  }

  return (
    <header className="sticky top-0 z-20 h-16 flex items-center justify-between px-4 sm:px-6" style={{ background: IVORY }}>
      <div className="flex items-center gap-4">
        <button className="lg:hidden p-2 rounded-lg hover:bg-white/60 transition" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <div>
          <div className="text-lg font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>{viewTitles[currentView] || 'Dashboard'}</div>
          <div className="text-xs hidden sm:block" style={{ color: TEXT_MUTED_LUXE }}>EduGest · {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden md:flex items-center gap-2 bg-white border border-[oklch(90%_0.01_175)] rounded-xl px-3 py-1.5 w-[240px] focus-within:ring-2 focus-within:ring-[oklch(72%_0.15_65_/_0.3)] focus-within:border-[oklch(72%_0.15_65_/_0.5)] transition">
          <Search size={14} style={{ color: TEXT_MUTED_LUXE }} />
          <input placeholder="Rechercher..." className="flex-1 border-0 bg-transparent outline-none text-[13px]" />
        </div>
        <button className="w-9 h-9 rounded-xl bg-white border border-[oklch(90%_0.01_175)] grid place-items-center hover:shadow-sm transition relative edu-bell-shake">
          <Bell size={16} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full border-2 border-white edu-animate-pulse-glow" style={{ background: GOLD }} />
        </button>
        <button onClick={() => setCurrentView('profile')} className="w-9 h-9 rounded-xl bg-white border border-[oklch(90%_0.01_175)] grid place-items-center hover:shadow-sm transition" title="Mon profil">
          <Settings size={16} />
        </button>
      </div>
    </header>
  )
}

// ===== DASHBOARD LAYOUT =====
function DashboardLayout() {
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[240px_1fr]" style={{ background: IVORY }}>
      <Sidebar />
      <div className="flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 p-6 sm:p-8 overflow-y-auto">
          <div className="edu-page-enter">
            <MainContent />
          </div>
        </main>
      </div>
    </div>
  )
}

// ===== MAIN CONTENT ROUTER =====
// ===== WHATSAPP CONFIG VIEW =====
function WhatsAppConfigView() {
  const [config, setConfig] = useState<{ phoneNumber: string; apiKey: string; webhookUrl: string }>({ phoneNumber: '', apiKey: '', webhookUrl: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    fetch('/api/whatsapp-config')
      .then(r => r.json())
      .then(j => {
        if (j.data) setConfig({ phoneNumber: j.data.phoneNumber || '', apiKey: j.data.apiKey || '', webhookUrl: j.data.webhookUrl || '' })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/whatsapp-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      if (res.ok) {
        toast.success('Configuration WhatsApp sauvegardée!')
      } else {
        const json = await res.json()
        toast.error(json.error || 'Erreur lors de la sauvegarde')
      }
    } catch { toast.error('Erreur réseau') }
    finally { setSaving(false) }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/whatsapp-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test' }),
      })
      const json = await res.json()
      setTestResult({ ok: res.ok, msg: json.message || json.error || (res.ok ? 'Connexion réussie!' : 'Échec de la connexion') })
    } catch { setTestResult({ ok: false, msg: 'Erreur réseau' }) }
    finally { setTesting(false) }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>WhatsApp Config</h1>
      </div>

      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl max-w-xl shadow-sm overflow-hidden">
        <div className="h-28 relative" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
          <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(ellipse at top right, oklch(72% 0.15 65 / 0.3), transparent 60%)' }} />
          <div className="absolute bottom-4 left-6 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl grid place-items-center text-white bg-white/20 backdrop-blur-sm">
              <MessageSquare size={24} />
            </div>
            <div className="text-white">
              <div className="font-bold text-lg">Configuration WhatsApp</div>
              <div className="text-white/70 text-sm">API Business officielle</div>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 border-4 border-[oklch(72%_0.15_65)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div>
                <label className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>Numéro officiel WhatsApp</label>
                <div className="flex items-center gap-2 mt-1 bg-white border border-[oklch(90%_0.01_175)] rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-[oklch(72%_0.15_65_/_0.3)] focus-within:border-[oklch(72%_0.15_65_/_0.5)] transition">
                  <Phone size={14} style={{ color: TEXT_MUTED_LUXE }} />
                  <input
                    placeholder="+243 81 234 56 78"
                    value={config.phoneNumber}
                    onChange={e => setConfig({ ...config, phoneNumber: e.target.value })}
                    className="flex-1 border-0 bg-transparent outline-none text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>Clé API</label>
                <div className="flex items-center gap-2 mt-1 bg-white border border-[oklch(90%_0.01_175)] rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-[oklch(72%_0.15_65_/_0.3)] focus-within:border-[oklch(72%_0.15_65_/_0.5)] transition">
                  <Lock size={14} style={{ color: TEXT_MUTED_LUXE }} />
                  <input
                    placeholder="EAAGm0PX4ZCps..."
                    value={config.apiKey}
                    onChange={e => setConfig({ ...config, apiKey: e.target.value })}
                    type="password"
                    className="flex-1 border-0 bg-transparent outline-none text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>URL Webhook</label>
                <div className="flex items-center gap-2 mt-1 bg-white border border-[oklch(90%_0.01_175)] rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-[oklch(72%_0.15_65_/_0.3)] focus-within:border-[oklch(72%_0.15_65_/_0.5)] transition">
                  <Globe size={14} style={{ color: TEXT_MUTED_LUXE }} />
                  <input
                    placeholder="https://votre-serveur.com/api/whatsapp/webhook"
                    value={config.webhookUrl}
                    onChange={e => setConfig({ ...config, webhookUrl: e.target.value })}
                    className="flex-1 border-0 bg-transparent outline-none text-sm"
                  />
                </div>
              </div>

              {testResult && (
                <div className={`p-3 rounded-xl text-sm flex items-center gap-2 ${testResult.ok ? 'bg-[oklch(95%_0.04_145)] text-[oklch(40%_0.13_145)]' : 'bg-[oklch(95%_0.05_25)] text-[oklch(45%_0.18_25)]'}`}>
                  {testResult.ok ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                  {testResult.msg}
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button onClick={handleSave} disabled={saving} className="edu-gold-cta px-6 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
                  {saving ? <div className="h-4 w-4 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Check size={14} />}
                  Sauvegarder
                </button>
                <button onClick={handleTest} disabled={testing} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)] transition disabled:opacity-50" style={{ color: TEXT_PRIMARY }}>
                  {testing ? <div className="h-4 w-4 border-2 border-[oklch(72%_0.15_65)] border-t-transparent rounded-full animate-spin" /> : <Zap size={14} />}
                  Tester la connexion
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

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
    case 'whatsapp-config': return <WhatsAppConfigView />
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
    <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 relative overflow-hidden shadow-sm hover:shadow-md transition" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="absolute top-0 right-0 w-[60px] h-[60px] rounded-bl-[60px] opacity-50" style={{ background: `radial-gradient(closest-side, ${color}22, transparent)` }} />
      <div className="flex items-center justify-between mb-2.5">
        <div className="text-xs font-medium uppercase tracking-wider" style={{ color: TEXT_MUTED_LUXE }}>{label}</div>
        <div className="w-10 h-10 rounded-full grid place-items-center" style={{ color: 'white', background: `linear-gradient(135deg, ${color}, oklch(72% 0.15 65))` }}>{icon}</div>
      </div>
      <div className="text-[28px] font-bold tracking-tight tabular-nums" style={{ color: TEXT_PRIMARY }}>{value}</div>
      {delta && <div className="text-xs mt-0.5" style={{ color: TEXT_MUTED_LUXE }}>{delta}</div>}
    </div>
  )
}

// ===== SUPER ADMIN DASHBOARD =====
interface AdminAnalytics {
  overview: {
    totalSchools: number; totalStudents: number; totalUsers: number; totalRevenue: number;
    overdue: { amount: number; count: number }; partial: { owed: number; count: number };
    pending: { amount: number; count: number }; totalDebt: number;
  }
  schoolsWithMostStudents: { id: string; name: string; shortName: string; city: string; country: string; subscriptionTier: string; studentCount: number; classCount: number; _count: { students: number; users: number } }[]
  schoolsWithFewestStudents: { id: string; name: string; shortName: string; city: string; country: string; subscriptionTier: string; studentCount: number; classCount: number; _count: { students: number; users: number } }[]
  schoolsByCity: { city: string; _count: { id: number }; _sum: { studentCount: number | null } }[]
  subscriptionDistribution: { subscriptionTier: string; _count: { id: number } }[]
  debtStats: { schoolId: string; schoolName: string; schoolShortName: string; city: string; studentCount: number; debtCount: number; totalOwed: number; totalAmount: number; totalPaid: number }[]
  paidStats: { schoolId: string; schoolName: string; schoolShortName: string; city: string; studentCount: number; paidCount: number; totalPaid: number }[]
  blacklistStats: { schoolId: string; schoolName: string; schoolShortName: string; city: string; blacklistCount: number }[]
  blacklistEntries: { id: string; reason: string; addedAt: string; schoolId: string; student: { firstName: string; lastName: string; matricule: string } | null }[]
  greylistEntries: { id: string; reason: string; addedAt: string; schoolId: string; student: { firstName: string; lastName: string; matricule: string } | null }[]
  revenueBySchool: { schoolId: string; schoolName: string; schoolShortName: string; city: string; revenue: number; paymentCount: number }[]
  recentPayments: { id: string; amount: number; paidAmount: number; status: string; createdAt: string; student: { firstName: string; lastName: string; matricule: string } | null; school: { name: string; shortName: string; city: string } | null }[]
  recentDiscipline: { id: string; type: string; title: string; severity: string; createdAt: string; schoolId: string; student: { firstName: string; lastName: string; matricule: string } | null }[]
  recentStudents: { id: string; firstName: string; lastName: string; matricule: string; createdAt: string; school: { name: string; shortName: string; city: string } | null; class: { name: string } | null }[]
}

function SuperAdminDashboard() {
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [cityFilter, setCityFilter] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'schools' | 'debts' | 'blacklist' | 'activity'>('overview')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/admin-analytics${cityFilter ? `?city=${cityFilter}` : ''}`)
      .then(r => r.json())
      .then(j => { if (!cancelled) { setAnalytics(j.data); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [cityFilter])

  const ov = analytics?.overview

  const cityOptions = analytics?.schoolsByCity?.map(c => c.city) || ['Dakar', 'Abidjan', 'Kinshasa', 'Lubumbashi', 'Brazzaville', 'Goma']

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Administration EduGest</h1>
          </div>
          <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>Contrôle et supervision de la plateforme</p>
        </div>
        {/* City Filter */}
        <div className="flex items-center gap-2">
          <Filter size={14} style={{ color: TEXT_MUTED_LUXE }} />
          <select
            value={cityFilter}
            onChange={e => setCityFilter(e.target.value)}
            className="px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]"
          >
            <option value="">Toutes les villes</option>
            {cityOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-6">
        <StatCard label="Écoles actives" value={formatNumber(ov?.totalSchools || 0)} icon={<Building2 size={16} />} color={ACCENT} />
        <StatCard label="Élèves inscrits" value={formatNumber(ov?.totalStudents || 0)} icon={<GraduationCap size={16} />} color={SUCCESS} />
        <StatCard label="Revenus totaux" value={formatCurrency(ov?.totalRevenue || 0)} icon={<DollarSign size={16} />} color={WARNING} />
        <StatCard label="Dettes totales" value={formatCurrency(ov?.totalDebt || 0)} delta={`${ov?.overdue.count || 0} impayés`} icon={<AlertTriangle size={16} />} color={DANGER} />
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 mb-6 bg-white border border-[oklch(90%_0.01_175)] rounded-xl p-1 overflow-x-auto">
        {[
          { key: 'overview' as const, label: 'Vue d\'ensemble', icon: <LayoutDashboard size={14} /> },
          { key: 'schools' as const, label: 'Écoles', icon: <Building2 size={14} /> },
          { key: 'debts' as const, label: 'Dettes & Soldes', icon: <CreditCard size={14} /> },
          { key: 'blacklist' as const, label: 'Listes disciplinaires', icon: <Ban size={14} /> },
          { key: 'activity' as const, label: 'Activités récentes', icon: <Clock size={14} /> },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
              activeTab === tab.key ? 'text-white' : 'hover:bg-[oklch(95%_0.04_175)]'
            }`}
            style={activeTab === tab.key ? { background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` } : { color: TEXT_MUTED_LUXE }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12" style={{ color: TEXT_MUTED_LUXE }}>Chargement des données...</div>
      ) : (
        <>
          {/* ===== OVERVIEW TAB ===== */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Cities distribution */}
              <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-6">
                <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
                  <div className="mb-4">
                    <div className="text-[15px] font-semibold" style={{ color: TEXT_PRIMARY }}>Écoles par ville</div>
                    <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Répartition géographique</div>
                  </div>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analytics?.schoolsByCity?.map(c => ({ name: c.city, écoles: c._count.id, élèves: c._sum.studentCount || 0 })) || []}>
                        <CartesianGrid strokeDasharray="2 4" stroke="oklch(90% 0.01 175)" />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: TEXT_MUTED_LUXE }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: TEXT_MUTED_LUXE }} axisLine={false} tickLine={false} />
                        <Tooltip />
                        <Bar dataKey="écoles" fill={ACCENT} radius={[6, 6, 0, 0]} />
                        <Bar dataKey="élèves" fill={GOLD} radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
                  <div className="mb-4">
                    <div className="text-[15px] font-semibold" style={{ color: TEXT_PRIMARY }}>Répartition abonnements</div>
                    <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Par formule</div>
                  </div>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={analytics?.subscriptionDistribution?.map(s => ({ name: getSubscriptionLabel(s.subscriptionTier), value: s._count.id })) || SUBSCRIPTION_DATA} cx="50%" cy="50%" innerRadius={55} outerRadius={75} dataKey="value" paddingAngle={2}>
                          {(analytics?.subscriptionDistribution || SUBSCRIPTION_DATA).map((_, i) => <Cell key={i} fill={[ACCENT, GOLD, INFO, SUCCESS, DANGER][i % 5]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 mt-2">
                    {(analytics?.subscriptionDistribution || []).map(s => (
                      <div key={s.subscriptionTier} className="flex items-center justify-between text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-sm" style={{ background: [ACCENT, GOLD, INFO, SUCCESS, DANGER][SUBSCRIPTION_TIERS.indexOf(s.subscriptionTier) % 5] }} />
                          {getSubscriptionLabel(s.subscriptionTier)}
                        </div>
                        <span className="font-semibold" style={{ color: TEXT_PRIMARY }}>{s._count.id}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Revenue by school */}
              <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
                <div className="mb-4">
                  <div className="text-[15px] font-semibold" style={{ color: TEXT_PRIMARY }}>Revenus par école</div>
                  <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Montants encaissés · 12 derniers mois</div>
                </div>
                <div className="space-y-3 max-h-96 overflow-y-auto custom-scrollbar">
                  {(analytics?.revenueBySchool || []).map((s, i) => (
                    <div key={s.schoolId} className="flex items-center gap-4 p-3 rounded-xl hover:bg-[oklch(97%_0.005_175)] transition">
                      <div className="w-8 h-8 rounded-full grid place-items-center text-white font-bold text-[11px] shrink-0" style={{ background: `linear-gradient(135deg, ${[ACCENT, GOLD, INFO, SUCCESS, DANGER][i % 5]}, oklch(72% 0.15 65))` }}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm" style={{ color: TEXT_PRIMARY }}>{s.schoolName}</div>
                        <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>{s.city} · {s.paymentCount} paiements</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-sm" style={{ color: SUCCESS }}>{formatCurrency(s.revenue)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ===== SCHOOLS TAB ===== */}
          {activeTab === 'schools' && (
            <div className="space-y-6">
              {/* Schools with most students */}
              <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full grid place-items-center" style={{ background: SUCCESS_SOFT }}><TrendingUp size={14} style={{ color: SUCCESS }} /></div>
                  <div>
                    <div className="text-[15px] font-semibold" style={{ color: TEXT_PRIMARY }}>Écoles avec le plus d&apos;élèves</div>
                    <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Top 10 par effectif</div>
                  </div>
                </div>
                <div className="space-y-2.5">
                  {(analytics?.schoolsWithMostStudents || []).map((s, i) => (
                    <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-[oklch(97%_0.005_175)] transition">
                      <div className="w-8 h-8 rounded-full grid place-items-center text-white font-bold text-[11px] shrink-0" style={{ background: i < 3 ? `linear-gradient(135deg, ${GOLD}, oklch(72% 0.15 65))` : `linear-gradient(135deg, ${ACCENT}, oklch(55% 0.15 175))` }}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm" style={{ color: TEXT_PRIMARY }}>{s.name}</div>
                        <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>{s.city} · {s.country}</div>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: GOLD, background: GOLD_SOFT }}>{getSubscriptionLabel(s.subscriptionTier)}</span>
                        <span className="font-bold text-sm tabular-nums" style={{ color: TEXT_PRIMARY }}>{formatNumber(s.studentCount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Schools with fewest students */}
              <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full grid place-items-center" style={{ background: 'oklch(95% 0.03 25)' }}><AlertTriangle size={14} style={{ color: DANGER }} /></div>
                  <div>
                    <div className="text-[15px] font-semibold" style={{ color: TEXT_PRIMARY }}>Écoles avec le moins d&apos;élèves</div>
                    <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Besoin d&apos;attention</div>
                  </div>
                </div>
                <div className="space-y-2.5">
                  {(analytics?.schoolsWithFewestStudents || []).map((s, i) => (
                    <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-[oklch(97%_0.005_175)] transition">
                      <div className="w-8 h-8 rounded-full grid place-items-center text-white font-bold text-[11px] shrink-0" style={{ background: `linear-gradient(135deg, ${DANGER}, oklch(58% 0.20 25))` }}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm" style={{ color: TEXT_PRIMARY }}>{s.name}</div>
                        <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>{s.city} · {s.country}</div>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: GOLD, background: GOLD_SOFT }}>{getSubscriptionLabel(s.subscriptionTier)}</span>
                        <span className="font-bold text-sm tabular-nums" style={{ color: s.studentCount < 100 ? DANGER : TEXT_PRIMARY }}>{formatNumber(s.studentCount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ===== DEBTS & BALANCES TAB ===== */}
          {activeTab === 'debts' && (
            <div className="space-y-6">
              {/* Debt summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm" style={{ borderLeft: `4px solid ${DANGER}` }}>
                  <div className="text-xs font-medium uppercase tracking-wider" style={{ color: TEXT_MUTED_LUXE }}>Impayés en retard</div>
                  <div className="text-2xl font-bold mt-1" style={{ color: DANGER }}>{formatCurrency(ov?.overdue.amount || 0)}</div>
                  <div className="text-xs mt-0.5" style={{ color: TEXT_MUTED_LUXE }}>{ov?.overdue.count || 0} dossiers</div>
                </div>
                <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm" style={{ borderLeft: `4px solid ${WARNING}` }}>
                  <div className="text-xs font-medium uppercase tracking-wider" style={{ color: TEXT_MUTED_LUXE }}>Paiements partiels</div>
                  <div className="text-2xl font-bold mt-1" style={{ color: WARNING }}>{formatCurrency(ov?.partial.owed || 0)}</div>
                  <div className="text-xs mt-0.5" style={{ color: TEXT_MUTED_LUXE }}>{ov?.partial.count || 0} dossiers</div>
                </div>
                <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm" style={{ borderLeft: `4px solid ${INFO}` }}>
                  <div className="text-xs font-medium uppercase tracking-wider" style={{ color: TEXT_MUTED_LUXE }}>En attente</div>
                  <div className="text-2xl font-bold mt-1" style={{ color: INFO }}>{formatCurrency(ov?.pending.amount || 0)}</div>
                  <div className="text-xs mt-0.5" style={{ color: TEXT_MUTED_LUXE }}>{ov?.pending.count || 0} dossiers</div>
                </div>
              </div>

              {/* Schools with most debts */}
              <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
                <div className="mb-4">
                  <div className="text-[15px] font-semibold" style={{ color: TEXT_PRIMARY }}>Dettes par école</div>
                  <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Montants impayés classés par école</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ background: IVORY }}>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>École</th>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Ville</th>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Élèves</th>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Dossiers dette</th>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Montant dû</th>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Taux recouvrement</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(analytics?.debtStats || []).map(d => {
                        const rate = d.totalAmount > 0 ? ((d.totalPaid / d.totalAmount) * 100).toFixed(1) : '0'
                        return (
                          <tr key={d.schoolId} className="hover:bg-[oklch(97%_0.005_175)] transition border-b border-[oklch(90%_0.01_175)] last:border-0">
                            <td className="px-3 py-2.5 font-medium text-[13px]" style={{ color: TEXT_PRIMARY }}>{d.schoolName}</td>
                            <td className="px-3 py-2.5 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{d.city}</td>
                            <td className="px-3 py-2.5 text-[13px] tabular-nums" style={{ color: TEXT_PRIMARY }}>{formatNumber(d.studentCount)}</td>
                            <td className="px-3 py-2.5 text-[13px] tabular-nums" style={{ color: DANGER }}>{d.debtCount}</td>
                            <td className="px-3 py-2.5 text-[13px] font-semibold tabular-nums" style={{ color: DANGER }}>{formatCurrency(d.totalOwed)}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="h-2 flex-1 bg-[oklch(92%_0.005_175)] rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${rate}%`, background: Number(rate) >= 80 ? SUCCESS : Number(rate) >= 50 ? WARNING : DANGER }} />
                                </div>
                                <span className="text-xs font-medium tabular-nums" style={{ color: Number(rate) >= 80 ? SUCCESS : Number(rate) >= 50 ? WARNING : DANGER }}>{rate}%</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Schools with best payment records */}
              <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
                <div className="mb-4">
                  <div className="text-[15px] font-semibold" style={{ color: TEXT_PRIMARY }}>Écoles avec meilleurs soldes</div>
                  <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Montants encaissés par école</div>
                </div>
                <div className="space-y-2.5 max-h-96 overflow-y-auto custom-scrollbar">
                  {(analytics?.paidStats || []).map((s, i) => (
                    <div key={s.schoolId} className="flex items-center gap-3 p-3 rounded-xl hover:bg-[oklch(97%_0.005_175)] transition">
                      <div className="w-8 h-8 rounded-full grid place-items-center text-white font-bold text-[11px] shrink-0" style={{ background: `linear-gradient(135deg, ${SUCCESS}, oklch(60% 0.15 145))` }}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm" style={{ color: TEXT_PRIMARY }}>{s.schoolName}</div>
                        <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>{s.city} · {s.paidCount} paiements</div>
                      </div>
                      <div className="font-bold text-sm" style={{ color: SUCCESS }}>{formatCurrency(s.totalPaid)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ===== BLACKLIST TAB ===== */}
          {activeTab === 'blacklist' && (
            <div className="space-y-6">
              {/* Blacklist stats per school */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm" style={{ borderLeft: `4px solid ${DANGER}` }}>
                  <div className="flex items-center gap-2 mb-1"><Ban size={14} style={{ color: DANGER }} /><span className="text-xs font-medium uppercase tracking-wider" style={{ color: TEXT_MUTED_LUXE }}>Liste Noire</span></div>
                  <div className="text-2xl font-bold" style={{ color: DANGER }}>{analytics?.blacklistEntries?.length || 0}</div>
                </div>
                <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm" style={{ borderLeft: `4px solid ${WARNING}` }}>
                  <div className="flex items-center gap-2 mb-1"><AlertTriangle size={14} style={{ color: WARNING }} /><span className="text-xs font-medium uppercase tracking-wider" style={{ color: TEXT_MUTED_LUXE }}>Liste Grise</span></div>
                  <div className="text-2xl font-bold" style={{ color: WARNING }}>{analytics?.greylistEntries?.length || 0}</div>
                </div>
                <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm" style={{ borderLeft: `4px solid ${SUCCESS}` }}>
                  <div className="flex items-center gap-2 mb-1"><Award size={14} style={{ color: SUCCESS }} /><span className="text-xs font-medium uppercase tracking-wider" style={{ color: TEXT_MUTED_LUXE }}>Liste Blanche</span></div>
                  <div className="text-2xl font-bold" style={{ color: SUCCESS }}>—</div>
                </div>
              </div>

              {/* Blacklist by school */}
              {analytics?.blacklistStats && analytics.blacklistStats.length > 0 && (
                <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
                  <div className="mb-4">
                    <div className="text-[15px] font-semibold" style={{ color: TEXT_PRIMARY }}>Liste noire par école</div>
                    <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Nombre d&apos;élèves en liste noire</div>
                  </div>
                  <div className="space-y-2.5">
                    {analytics.blacklistStats.map(s => (
                      <div key={s.schoolId} className="flex items-center gap-3 p-3 rounded-xl hover:bg-[oklch(97%_0.005_175)] transition">
                        <div className="w-8 h-8 rounded-full grid place-items-center text-white font-bold text-[11px] shrink-0" style={{ background: `linear-gradient(135deg, ${DANGER}, oklch(58% 0.20 25))` }}>
                          {s.blacklistCount}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm" style={{ color: TEXT_PRIMARY }}>{s.schoolName}</div>
                          <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>{s.city}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Blacklist entries */}
              <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl overflow-hidden shadow-sm">
                <div className="p-6 pb-3">
                  <div className="text-[15px] font-semibold" style={{ color: TEXT_PRIMARY }}>Entrées liste noire</div>
                  <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Détails des élèves en liste noire</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ background: IVORY }}>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Élève</th>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>École</th>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Ville</th>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Motif</th>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(analytics?.blacklistEntries || []).length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Aucune entrée en liste noire</td></tr>
                      ) : (analytics?.blacklistEntries || []).map(e => {
                        const bSchool = analytics?.blacklistStats?.find(s => s.schoolId === e.schoolId)
                        return (
                        <tr key={e.id} className="hover:bg-[oklch(97%_0.005_175)] transition border-b border-[oklch(90%_0.01_175)] last:border-0">
                          <td className="px-3 py-2.5 text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>{e.student ? `${e.student.firstName} ${e.student.lastName}` : '—'}</td>
                          <td className="px-3 py-2.5 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{bSchool?.schoolName || '—'}</td>
                          <td className="px-3 py-2.5 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{bSchool?.city || '—'}</td>
                          <td className="px-3 py-2.5 text-[13px]" style={{ color: DANGER }}>{e.reason}</td>
                          <td className="px-3 py-2.5 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{formatDate(e.addedAt)}</td>
                        </tr>
                      )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Greylist entries */}
              <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl overflow-hidden shadow-sm">
                <div className="p-6 pb-3">
                  <div className="text-[15px] font-semibold" style={{ color: TEXT_PRIMARY }}>Entrées liste grise</div>
                  <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Avertissements et observations</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ background: IVORY }}>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Élève</th>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>École</th>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Ville</th>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Motif</th>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(analytics?.greylistEntries || []).length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Aucune entrée en liste grise</td></tr>
                      ) : (analytics?.greylistEntries || []).map(e => {
                        const gSchool = analytics?.blacklistStats?.find(s => s.schoolId === e.schoolId)
                        return (
                        <tr key={e.id} className="hover:bg-[oklch(97%_0.005_175)] transition border-b border-[oklch(90%_0.01_175)] last:border-0">
                          <td className="px-3 py-2.5 text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>{e.student ? `${e.student.firstName} ${e.student.lastName}` : '—'}</td>
                          <td className="px-3 py-2.5 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{gSchool?.schoolName || '—'}</td>
                          <td className="px-3 py-2.5 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{gSchool?.city || '—'}</td>
                          <td className="px-3 py-2.5 text-[13px]" style={{ color: WARNING }}>{e.reason}</td>
                          <td className="px-3 py-2.5 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{formatDate(e.addedAt)}</td>
                        </tr>
                      )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ===== ACTIVITY TAB ===== */}
          {activeTab === 'activity' && (
            <div className="space-y-6">
              {/* Recent Payments */}
              <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl overflow-hidden shadow-sm">
                <div className="p-6 pb-3">
                  <div className="flex items-center gap-2">
                    <CreditCard size={16} style={{ color: SUCCESS }} />
                    <div className="text-[15px] font-semibold" style={{ color: TEXT_PRIMARY }}>Paiements récents</div>
                  </div>
                  <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Derniers paiements enregistrés sur la plateforme</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ background: IVORY }}>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Élève</th>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>École</th>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Montant</th>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Statut</th>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(analytics?.recentPayments || []).length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Aucun paiement récent</td></tr>
                      ) : (analytics?.recentPayments || []).map(p => (
                        <tr key={p.id} className="hover:bg-[oklch(97%_0.005_175)] transition border-b border-[oklch(90%_0.01_175)] last:border-0">
                          <td className="px-3 py-2.5 text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>{p.student ? `${p.student.firstName} ${p.student.lastName}` : '—'}</td>
                          <td className="px-3 py-2.5 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{p.school?.shortName || p.school?.name || '—'}</td>
                          <td className="px-3 py-2.5 text-[13px] font-semibold tabular-nums" style={{ color: p.status === 'PAID' ? SUCCESS : DANGER }}>{formatCurrency(p.paidAmount)} / {formatCurrency(p.amount)}</td>
                          <td className="px-3 py-2.5"><span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${getStatusPill(p.status === 'PAID' ? 'Payé' : p.status === 'PARTIAL' ? 'Partiel' : p.status === 'OVERDUE' ? 'En retard' : 'En attente')}`}>{p.status === 'PAID' ? 'Payé' : p.status === 'PARTIAL' ? 'Partiel' : p.status === 'OVERDUE' ? 'En retard' : 'En attente'}</span></td>
                          <td className="px-3 py-2.5 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{formatDate(p.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent Discipline */}
              <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl overflow-hidden shadow-sm">
                <div className="p-6 pb-3">
                  <div className="flex items-center gap-2">
                    <Shield size={16} style={{ color: DANGER }} />
                    <div className="text-[15px] font-semibold" style={{ color: TEXT_PRIMARY }}>Incidents disciplinaires récents</div>
                  </div>
                  <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Derniers incidents sur toutes les écoles</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ background: IVORY }}>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Élève</th>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>École</th>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Type</th>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Titre</th>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(analytics?.recentDiscipline || []).length === 0 ? (
                        <tr><td colSpan={5} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Aucun incident récent</td></tr>
                      ) : (analytics?.recentDiscipline || []).map(d => {
                        const schoolName = analytics?.schoolsWithMostStudents?.find(s => s.id === d.schoolId)?.shortName || analytics?.revenueBySchool?.find(s => s.schoolId === d.schoolId)?.schoolShortName || d.schoolId.substring(0, 8)
                        return (
                        <tr key={d.id} className="hover:bg-[oklch(97%_0.005_175)] transition border-b border-[oklch(90%_0.01_175)] last:border-0">
                          <td className="px-3 py-2.5 text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>{d.student ? `${d.student.firstName} ${d.student.lastName}` : '—'}</td>
                          <td className="px-3 py-2.5 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{schoolName}</td>
                          <td className="px-3 py-2.5"><span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${d.type === 'VIOLENCE' || d.type === 'TRICHERIE' ? 'bg-[oklch(95%_0.03_25)] text-edu-danger' : d.type === 'RETARD' || d.type === 'ABSENCE' ? 'bg-[oklch(95%_0.05_65)] text-edu-warning' : 'bg-[oklch(95%_0.04_175)] text-edu-accent'}`}>{d.type}</span></td>
                          <td className="px-3 py-2.5 text-[13px]" style={{ color: TEXT_PRIMARY }}>{d.title}</td>
                          <td className="px-3 py-2.5 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{formatDate(d.createdAt)}</td>
                        </tr>
                      )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent Student Registrations */}
              <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl overflow-hidden shadow-sm">
                <div className="p-6 pb-3">
                  <div className="flex items-center gap-2">
                    <UserPlus size={16} style={{ color: ACCENT }} />
                    <div className="text-[15px] font-semibold" style={{ color: TEXT_PRIMARY }}>Inscriptions récentes</div>
                  </div>
                  <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Nouveaux élèves sur la plateforme</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr style={{ background: IVORY }}>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Élève</th>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>École</th>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Classe</th>
                        <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(analytics?.recentStudents || []).length === 0 ? (
                        <tr><td colSpan={4} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Aucune inscription récente</td></tr>
                      ) : (analytics?.recentStudents || []).map(s => (
                        <tr key={s.id} className="hover:bg-[oklch(97%_0.005_175)] transition border-b border-[oklch(90%_0.01_175)] last:border-0">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full grid place-items-center text-white font-semibold text-[10px] shrink-0" style={{ background: 'linear-gradient(135deg, oklch(55% 0.15 175), oklch(72% 0.15 65))' }}>
                                {getInitials(s.firstName + ' ' + s.lastName)}
                              </div>
                              <div>
                                <div className="font-medium text-[13px]" style={{ color: TEXT_PRIMARY }}>{s.firstName} {s.lastName}</div>
                                <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>{s.matricule}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{s.school?.shortName || s.school?.name || '—'}</td>
                          <td className="px-3 py-2.5 text-[13px]" style={{ color: TEXT_PRIMARY }}>{s.class?.name || '—'}</td>
                          <td className="px-3 py-2.5 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{formatDate(s.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
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
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Bonjour Secrétaire</h1>
          </div>
          <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>Gestion quotidienne du Complexe Scolaire Lumière</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-6">
        <StatCard label="Total élèves" value={formatNumber((stats?.students as Record<string, number>)?.total || 1248)} delta="+24 cette semaine" icon={<Users size={16} />} color={ACCENT} />
        <StatCard label="Classes actives" value={String((stats?.classes as Record<string, unknown>)?.total || 42)} icon={<School size={16} />} color={INFO} />
        <StatCard label="Avertissements" value="27" icon={<AlertTriangle size={16} />} color={WARNING} />
        <StatCard label="Retards" value="64" icon={<Clock size={16} />} color={DANGER} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-6 mb-6">
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
          <div className="mb-4">
            <div className="text-[15px] font-semibold" style={{ color: TEXT_PRIMARY }}>Élèves par classe</div>
            <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Année scolaire 2025-2026</div>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="2 4" stroke="oklch(90% 0.01 175)" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: TEXT_MUTED_LUXE }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: TEXT_MUTED_LUXE }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Bar dataKey="élèves" fill={ACCENT} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
          <div className="mb-4">
            <div className="text-[15px] font-semibold" style={{ color: TEXT_PRIMARY }}>Actions rapides</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: <UserPlus size={20} />, label: 'Ajouter élève', view: 'students' as ViewType, color: ACCENT },
              { icon: <MessageSquare size={20} />, label: 'Communication', view: 'communications' as ViewType, color: INFO },
              { icon: <CreditCard size={20} />, label: 'Paiement', view: 'payments' as ViewType, color: SUCCESS },
              { icon: <Megaphone size={20} />, label: 'Convocation', view: 'convocation' as ViewType, color: WARNING },
            ].map(a => (
              <button key={a.label} onClick={() => setCurrentView(a.view)} className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-[oklch(90%_0.01_175)] hover:border-[oklch(72%_0.15_65_/_0.3)] hover:shadow-md edu-card-lift transition">
                <div className="w-10 h-10 rounded-full grid place-items-center" style={{ color: 'white', background: `linear-gradient(135deg, ${a.color}, oklch(72% 0.15 65))` }}>{a.icon}</div>
                <span className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>{a.label}</span>
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
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Bonjour Caissier</h1>
          </div>
          <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>Suivi financier du Complexe Scolaire Lumière</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-6">
        <StatCard label="Encaissé T1" value={formatCurrency(312400)} delta="+12% vs T1 2024" icon={<DollarSign size={16} />} color={ACCENT} />
        <StatCard label="Encaissé T2" value={formatCurrency(286200)} icon={<DollarSign size={16} />} color={INFO} />
        <StatCard label="Recouvrement" value="87%" icon={<TrendingUp size={16} />} color={SUCCESS} />
        <StatCard label="Impayés" value={formatCurrency(42800)} delta="42 dossiers" icon={<AlertTriangle size={16} />} color={DANGER} />
      </div>

      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
        <div className="mb-4">
          <div className="text-[15px] font-semibold" style={{ color: TEXT_PRIMARY }}>Paiements par classe</div>
          <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Taux de recouvrement par classe</div>
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
                <span className="font-medium" style={{ color: TEXT_PRIMARY }}>{c.name}</span>
                <span style={{ color: TEXT_MUTED_LUXE }}>{formatNumber(c.paid)} / {formatNumber(c.total)} CDF · {c.rate}%</span>
              </div>
              <div className="h-2 bg-[oklch(92%_0.005_175)] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${c.rate}%`, background: c.rate >= 85 ? `linear-gradient(90deg, ${SUCCESS}, oklch(72% 0.15 65))` : c.rate >= 70 ? `linear-gradient(90deg, ${WARNING}, oklch(72% 0.15 65))` : `linear-gradient(90deg, ${DANGER}, oklch(58% 0.15 45))` }} />
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
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Bonjour Papa Kazadi</h1>
          </div>
          <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>Suivi scolaire de vos enfants</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
        <StatCard label="Mes enfants" value="2" icon={<Users size={16} />} color={ACCENT} />
        <StatCard label="Notifications" value="5" icon={<Bell size={16} />} color={INFO} />
        <StatCard label="Devoirs à rendre" value="3" icon={<PenTool size={16} />} color={WARNING} />
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-6 rounded-full" style={{ background: GOLD }} />
        <h3 className="text-lg font-semibold" style={{ color: TEXT_PRIMARY }}>Mes enfants</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        {[
          { name: 'Kabongo Mutombo', class: '6eA', avg: '14.2/20', initials: 'KM', color: ACCENT },
          { name: 'Nzuzi Kazadi', class: '6eA', avg: '12.8/20', initials: 'NK', color: INFO },
        ].map(child => (
          <div key={child.name} className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm edu-card-lift">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-full grid place-items-center text-white font-bold text-lg" style={{ background: `linear-gradient(135deg, ${child.color}, oklch(72% 0.15 65))` }}>
                {child.initials}
              </div>
              <div>
                <div className="font-semibold" style={{ color: TEXT_PRIMARY }}>{child.name}</div>
                <div className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>Classe {child.class} · Moyenne {child.avg}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Notes', view: 'grades' as ViewType, icon: <BookOpen size={14} /> },
                { label: 'Bulletin', view: 'bulletin' as ViewType, icon: <FileText size={14} /> },
                { label: 'Paiements', view: 'payments' as ViewType, icon: <CreditCard size={14} /> },
                { label: 'Discipline', view: 'discipline' as ViewType, icon: <Shield size={14} /> },
              ].map(chip => (
                <button key={chip.label} onClick={() => setCurrentView(chip.view)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-[oklch(90%_0.01_175)] hover:bg-[oklch(95%_0.04_175)] hover:border-[oklch(72%_0.15_65_/_0.3)] transition" style={{ color: TEXT_PRIMARY }}>
                  {chip.icon} {chip.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-6 rounded-full" style={{ background: GOLD }} />
        <h3 className="text-lg font-semibold" style={{ color: TEXT_PRIMARY }}>Notifications récentes</h3>
      </div>
      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl divide-y divide-[oklch(90%_0.01_175)] shadow-sm">
        {[
          { icon: <BookOpen size={16} className="text-edu-accent" />, text: 'Nouvelle note en Mathématiques — Kabongo: 16/20', time: 'Il y a 2h' },
          { icon: <CreditCard size={16} className="text-edu-success" />, text: 'Paiement T2 confirmé — Nzuzi Kazadi', time: 'Il y a 5h' },
          { icon: <PenTool size={16} className="text-edu-warning" />, text: 'Devoir à rendre: Exercices de calcul — 6eA', time: 'Hier' },
          { icon: <Shield size={16} className="text-edu-danger" />, text: 'Avertissement: Retard répété — Kabongo Mutombo', time: 'Il y a 2 jours' },
          { icon: <Megaphone size={16} className="text-edu-info" />, text: 'Réunion parents-professeurs le 15 octobre', time: 'Il y a 3 jours' },
        ].map((n, i) => (
          <div key={i} className="flex items-start gap-3 p-4 hover:bg-[oklch(97%_0.005_175)] transition">
            <div className="w-8 h-8 rounded-full bg-[oklch(95%_0.04_175)] grid place-items-center shrink-0">{n.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm" style={{ color: TEXT_PRIMARY }}>{n.text}</div>
              <div className="text-xs mt-0.5" style={{ color: TEXT_MUTED_LUXE }}>{n.time}</div>
            </div>
            {i === 0 && <span className="w-2 h-2 rounded-full mt-2 shrink-0" style={{ background: GOLD }} />}
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
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Bonjour Professeur</h1>
          </div>
          <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>Gestion de vos classes et notes</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-6">
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
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Bonjour Prof. Principal</h1>
          </div>
          <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>Suivi de la classe 6eA</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
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
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Dashboard Discipline</h1>
          </div>
          <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>Suivi disciplinaire</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
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
  const [classes, setClasses] = useState<ClassData[]>([])
  const [selectedClassId, setSelectedClassId] = useState('')
  const [showParentSection, setShowParentSection] = useState(false)
  const [parentName, setParentName] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [parentPassword, setParentPassword] = useState('')
  const [adding, setAdding] = useState(false)
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

  // Load classes when modal opens
  useEffect(() => {
    if (showAdd) {
      fetch('/api/classes?limit=50')
        .then(r => r.json())
        .then(j => setClasses(j.data || []))
        .catch(() => {})
    }
  }, [showAdd])

  const filtered = students.filter(s =>
    !search || s.firstName.toLowerCase().includes(search.toLowerCase()) || s.lastName.toLowerCase().includes(search.toLowerCase()) || s.matricule.toLowerCase().includes(search.toLowerCase())
  )

  async function handleAddStudent(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setAdding(true)
    const fd = new FormData(e.currentTarget)
    try {
      const body: Record<string, unknown> = {
        firstName: fd.get('firstName'), lastName: fd.get('lastName'),
        gender: fd.get('gender'), dateOfBirth: fd.get('dob'),
        classId: selectedClassId || students[0]?.classId, schoolId: userData?.schoolId || 'demo',
        schoolYearId: students[0]?.schoolYearId || 'demo',
      }
      if (showParentSection && parentName) {
        body.parentName = parentName
        body.parentEmail = parentEmail
        body.parentPhone = parentPhone
        body.parentPassword = parentPassword
      }
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        toast.success('Élève ajouté avec succès!')
        setShowAdd(false)
        setParentName(''); setParentEmail(''); setParentPhone(''); setParentPassword('')
        setSelectedClassId(''); setShowParentSection(false)
        const json = await fetch('/api/students?limit=50').then(r => r.json())
        setStudents(json.data || [])
      } else {
        toast.error('Erreur lors de l\'ajout')
      }
    } catch { toast.error('Erreur réseau') }
    finally { setAdding(false) }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Élèves</h1>
          </div>
          <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>{formatNumber(filtered.length)} élèves inscrits</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="edu-gold-cta inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold">
          <Plus size={14} /> Ajouter un élève
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2 bg-white border border-[oklch(90%_0.01_175)] rounded-xl px-3 py-2 flex-1 max-w-md focus-within:ring-2 focus-within:ring-[oklch(72%_0.15_65_/_0.3)] focus-within:border-[oklch(72%_0.15_65_/_0.5)] transition">
          <Search size={14} style={{ color: TEXT_MUTED_LUXE }} />
          <input placeholder="Rechercher un élève..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 border-0 bg-transparent outline-none text-sm" />
        </div>
      </div>

      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ background: IVORY }}>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Élève</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Matricule</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Classe</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Parent</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Statut</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Aucun élève trouvé</td></tr>
              ) : filtered.map(s => (
                <tr key={s.id} className="hover:bg-[oklch(97%_0.005_175)] transition border-b border-[oklch(90%_0.01_175)] last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full grid place-items-center text-white font-semibold text-[11px] shrink-0" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                        {getInitials(s.firstName + ' ' + s.lastName)}
                      </div>
                      <div>
                        <div className="font-medium text-[13px]" style={{ color: TEXT_PRIMARY }}>{s.firstName} {s.lastName}</div>
                        <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{s.gender === 'M' ? 'Garçon' : 'Fille'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px] font-mono" style={{ color: TEXT_MUTED_LUXE }}>{s.matricule}</td>
                  <td className="px-4 py-3 text-[13px]" style={{ color: TEXT_PRIMARY }}>{s.class?.name || '—'}</td>
                  <td className="px-4 py-3 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{s.parent?.name || '—'}</td>
                  <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${getStatusPill('Actif')}`}>Actif</span></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button className="w-8 h-8 rounded-lg grid place-items-center hover:bg-[oklch(95%_0.04_175)] transition" style={{ color: TEXT_MUTED_LUXE }}><Eye size={14} /></button>
                      <button className="w-8 h-8 rounded-lg grid place-items-center hover:bg-[oklch(95%_0.04_175)] transition" style={{ color: TEXT_MUTED_LUXE }}><Edit size={14} /></button>
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
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold" style={{ color: TEXT_PRIMARY }}>Ajouter un élève</h2>
              <button onClick={() => setShowAdd(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleAddStudent} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>Prénom</label><input name="firstName" required className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)]" /></div>
                <div><label className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>Nom</label><input name="lastName" required className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)]" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>Sexe</label><select name="gender" className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]"><option value="M">Masculin</option><option value="F">Féminin</option></select></div>
                <div><label className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>Date de naissance</label><input name="dob" type="date" className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" /></div>
              </div>
              {/* Class selector */}
              <div>
                <label className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>Classe</label>
                <select value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)} className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
                  <option value="">Sélectionner une classe</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}{c.section ? ` - ${c.section}` : ''}</option>)}
                </select>
              </div>

              {/* Parent info section */}
              <div className="border border-[oklch(90%_0.01_175)] rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowParentSection(!showParentSection)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition hover:bg-[oklch(97%_0.005_175)]"
                  style={{ color: TEXT_PRIMARY }}
                >
                  <span className="flex items-center gap-2"><Users size={14} style={{ color: GOLD }} /> Informations du parent</span>
                  <ChevronDown size={14} className={`transition-transform ${showParentSection ? 'rotate-180' : ''}`} />
                </button>
                {showParentSection && (
                  <div className="px-4 pb-4 space-y-3 border-t border-[oklch(90%_0.01_175)]">
                    <div className="pt-3">
                      <input placeholder="Nom du parent" value={parentName} onChange={e => setParentName(e.target.value)} className="w-full px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)]" />
                    </div>
                    <div><input placeholder="Email du parent" type="email" value={parentEmail} onChange={e => setParentEmail(e.target.value)} className="w-full px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)]" /></div>
                    <div><input placeholder="Téléphone du parent (ex: +243 81...)" type="tel" value={parentPhone} onChange={e => setParentPhone(e.target.value)} className="w-full px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)]" /></div>
                    <div><input placeholder="Mot de passe du parent" type="password" value={parentPassword} onChange={e => setParentPassword(e.target.value)} className="w-full px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)]" /></div>
                  </div>
                )}
              </div>

              <button type="submit" disabled={adding} className="w-full py-2.5 rounded-xl font-semibold text-sm edu-gold-cta inline-flex items-center justify-center gap-2 disabled:opacity-50">
                {adding ? <div className="h-4 w-4 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Plus size={14} />}
                Ajouter l&apos;élève
              </button>
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
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Classes</h1>
      </div>
      {loading ? <div className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</div> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {classes.map(c => (
            <div key={c.id} className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm edu-card-lift">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold" style={{ color: TEXT_PRIMARY }}>{c.name}</h3>
                <span className="text-xs px-2 py-1 rounded-full" style={{ color: GOLD, background: GOLD_SOFT }}>{c.level || c.section || ''}</span>
              </div>
              <div className="flex items-center justify-between text-sm" style={{ color: TEXT_MUTED_LUXE }}>
                <span>{c._count?.students || 0} élèves</span>
                <span>Capacité: {c.capacity}</span>
              </div>
              <div className="mt-3 h-2 bg-[oklch(92%_0.005_175)] rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, ((c._count?.students || 0) / c.capacity) * 100)}%`, background: (c._count?.students || 0) / c.capacity > 0.9 ? `linear-gradient(90deg, ${DANGER}, oklch(58% 0.15 45))` : `linear-gradient(90deg, ${ACCENT}, oklch(72% 0.15 65))` }} />
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
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Notes</h1>
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-5 bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-4 shadow-sm" style={{ background: IVORY }}>
        <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
          <option value="">Toutes les classes</option>
          {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={selectedTrimester} onChange={e => setSelectedTrimester(e.target.value)} className="px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
          <option value="T1">Trimestre 1</option>
          <option value="T2">Trimestre 2</option>
          <option value="T3">Trimestre 3</option>
        </select>
      </div>

      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ background: IVORY }}>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Élève</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Matière</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Note /20</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-3 py-2.5" style={{ color: GOLD }}>Coef.</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</td></tr>
              ) : grades.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Aucune note</td></tr>
              ) : grades.slice(0, 30).map(g => (
                <tr key={g.id} className="hover:bg-[oklch(97%_0.005_175)] transition border-b border-[oklch(90%_0.01_175)] last:border-0">
                  <td className="px-3 py-2.5 text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>{g.student?.firstName} {g.student?.lastName}</td>
                  <td className="px-3 py-2.5 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{g.subject?.name}</td>
                  <td className="px-3 py-2.5">
                    <span className="text-[13px] font-semibold" style={{ color: g.score >= 10 ? GOLD : DANGER }}>
                      {g.score.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>×{g.subject?.coefficient || 1}</td>
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
  const [selectedStudent, setSelectedStudent] = useState<{id: string; firstName: string; lastName: string; matricule: string} | null>(null)
  const [studentSuggestions, setStudentSuggestions] = useState<{id: string; firstName: string; lastName: string; matricule: string}[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [amount, setAmount] = useState('')
  const [paidAmount, setPaidAmount] = useState('')
  const [trimester, setTrimester] = useState('T1')
  const [method, setMethod] = useState('CASH')
  const [status, setStatus] = useState('PAID')
  const [submitting, setSubmitting] = useState(false)
  const [lastPaymentId, setLastPaymentId] = useState<string | null>(null)
  const { userData } = useEduGestStore()

  useEffect(() => {
    fetch('/api/payments?limit=30').then(r => r.json()).then(j => { setPayments(j.data || []); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  // Search students as user types
  useEffect(() => {
    if (studentSearch.length < 2) { setStudentSuggestions([]); setShowSuggestions(false); return }
    const timer = setTimeout(() => {
      fetch(`/api/students?search=${encodeURIComponent(studentSearch)}&limit=8`)
        .then(r => r.json())
        .then(j => { setStudentSuggestions(j.data || []); setShowSuggestions(true) })
        .catch(() => {})
    }, 300)
    return () => clearTimeout(timer)
  }, [studentSearch])

  async function handlePayment() {
    if (!selectedStudent && !studentSearch) { toast.error('Veuillez sélectionner un élève'); return }
    if (!amount) { toast.error('Veuillez entrer le montant'); return }
    setSubmitting(true)
    try {
      const body: Record<string, unknown> = {
        schoolId: userData?.schoolId || '',
        amount: parseInt(amount),
        paidAmount: parseInt(paidAmount || '0'),
        trimester,
        paymentMethod: method,
        status,
      }
      if (selectedStudent) {
        body.studentId = selectedStudent.id
      } else {
        body.studentName = studentSearch
      }
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (res.ok) {
        toast.success('Paiement enregistré avec succès!')
        setLastPaymentId(json.data.id)
        // Refresh list
        const listRes = await fetch('/api/payments?limit=30')
        const listJson = await listRes.json()
        setPayments(listJson.data || [])
        // Reset form
        setStudentSearch(''); setSelectedStudent(null); setAmount(''); setPaidAmount('')
      } else {
        toast.error(json.error || 'Erreur lors de l\'enregistrement')
        // If there are suggestions, show them
        if (json.suggestions) {
          setStudentSuggestions(json.suggestions.map((s: {id: string; name: string; matricule: string}) => ({
            id: s.id, firstName: s.name.split(' ')[0], lastName: s.name.split(' ').slice(1).join(' '), matricule: s.matricule
          })))
          setShowSuggestions(true)
        }
      }
    } catch { toast.error('Erreur réseau') }
    finally { setSubmitting(false) }
  }

  const [receiptPreview, setReceiptPreview] = useState<{
    payment: ReceiptPayment; student: ReceiptStudent; school: ReceiptSchool
  } | null>(null)

  async function downloadReceipt(paymentId: string) {
    try {
      // Fetch full payment data for the receipt preview
      const res = await fetch(`/api/payments/receipt/${paymentId}`)
      if (!res.ok) throw new Error()
      // The server returns a PDF — we'll also fetch data for the preview
      // First try the data endpoint
      const dataRes = await fetch(`/api/payments?limit=30`)
      const dataJson = await dataRes.json()
      const payment = (dataJson.data || []).find((p: PaymentData) => p.id === paymentId)
      if (payment && payment.student && userData) {
        setReceiptPreview({
          payment: {
            id: payment.id,
            amount: payment.amount,
            paidAmount: payment.paidAmount,
            trimester: payment.trimester,
            paymentMethod: payment.paymentMethod || null,
            referenceNumber: payment.receiptNumber || null,
            status: payment.status,
            paidAt: payment.paidAt || null,
            receiptNumber: payment.receiptNumber || null,
            createdAt: payment.createdAt,
          },
          student: {
            firstName: payment.student.firstName,
            lastName: payment.student.lastName,
            matricule: payment.student.matricule,
          },
          school: {
            name: userData.schoolName,
            shortName: userData.schoolName.substring(0, 3).toUpperCase(),
            email: '',
            phone: '',
            address: '',
            city: '',
            province: '',
            country: '',
          },
        })
      } else {
        // Fallback: download the server-generated PDF directly
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `recu-${paymentId}.pdf`; a.click()
        URL.revokeObjectURL(url)
      }
    } catch { toast.error('Erreur lors du téléchargement du reçu') }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Paiements</h1>
      </div>

      {/* Payment Form */}
      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 mb-6 shadow-sm" style={{ borderLeft: `4px solid ${GOLD}` }}>
        <h3 className="font-semibold mb-4" style={{ color: TEXT_PRIMARY }}>Enregistrer un paiement</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          {/* Student search with autocomplete */}
          <div className="relative sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 bg-white border border-[oklch(90%_0.01_175)] rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-[oklch(72%_0.15_65_/_0.3)] focus-within:border-[oklch(72%_0.15_65_/_0.5)] transition">
              <Search size={14} style={{ color: TEXT_MUTED_LUXE }} />
              <input
                placeholder="Rechercher un élève par nom..."
                value={selectedStudent ? `${selectedStudent.firstName} ${selectedStudent.lastName}` : studentSearch}
                onChange={e => { setStudentSearch(e.target.value); setSelectedStudent(null) }}
                onFocus={() => studentSuggestions.length > 0 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                className="flex-1 border-0 bg-transparent outline-none text-sm"
              />
              {selectedStudent && (
                <button onClick={() => { setSelectedStudent(null); setStudentSearch('') }} className="text-[oklch(45%_0.18_25)] hover:text-[oklch(35%_0.20_25)]">
                  <X size={14} />
                </button>
              )}
            </div>
            {/* Autocomplete dropdown */}
            {showSuggestions && studentSuggestions.length > 0 && (
              <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-[oklch(90%_0.01_175)] rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {studentSuggestions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => { setSelectedStudent(s); setStudentSearch(''); setShowSuggestions(false) }}
                    className="w-full text-left px-3 py-2 hover:bg-[oklch(97%_0.005_175)] transition flex items-center gap-2 border-b border-[oklch(92%_0.005_250)] last:border-0"
                  >
                    <div className="w-7 h-7 rounded-full grid place-items-center text-white text-[10px] font-semibold shrink-0" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                      {getInitials(s.firstName + ' ' + s.lastName)}
                    </div>
                    <div>
                      <div className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>{s.firstName} {s.lastName}</div>
                      <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{s.matricule}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div><label className="text-xs font-medium" style={{ color: TEXT_MUTED_LUXE }}>Montant total (CDF)</label><input placeholder="Montant" value={amount} onChange={e => setAmount(e.target.value)} type="number" className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)]" /></div>
          <div><label className="text-xs font-medium" style={{ color: TEXT_MUTED_LUXE }}>Montant payé (CDF)</label><input placeholder="Payé" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} type="number" className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)]" /></div>
          <div><label className="text-xs font-medium" style={{ color: TEXT_MUTED_LUXE }}>Trimestre</label><select value={trimester} onChange={e => setTrimester(e.target.value)} className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
            <option value="T1">Trimestre 1</option><option value="T2">Trimestre 2</option><option value="T3">Trimestre 3</option>
          </select></div>
          <div><label className="text-xs font-medium" style={{ color: TEXT_MUTED_LUXE }}>Méthode</label><select value={method} onChange={e => setMethod(e.target.value)} className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
            <option value="CASH">Espèces</option><option value="ORANGE_MONEY">Orange Money</option><option value="MPESA">M-Pesa</option><option value="AIRTEL_MONEY">Airtel Money</option>
          </select></div>
          <div><label className="text-xs font-medium" style={{ color: TEXT_MUTED_LUXE }}>Statut</label><select value={status} onChange={e => setStatus(e.target.value)} className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
            <option value="PAID">Payé</option><option value="PARTIAL">Partiel</option><option value="PENDING">En attente</option><option value="OVERDUE">En retard</option>
          </select></div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handlePayment} disabled={submitting} className="edu-gold-cta px-6 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
            {submitting ? <div className="h-4 w-4 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <CreditCard size={14} />}
            Enregistrer le paiement
          </button>
          {lastPaymentId && (
            <button onClick={() => downloadReceipt(lastPaymentId)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)] transition" style={{ color: TEXT_PRIMARY }}>
              <FileText size={14} /> Télécharger le reçu PDF
            </button>
          )}
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ background: IVORY }}>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Élève</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Trimestre</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Montant</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Payé</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Statut</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Reçu</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</td></tr>
              ) : payments.slice(0, 20).map(p => (
                <tr key={p.id} className="hover:bg-[oklch(97%_0.005_175)] transition border-b border-[oklch(90%_0.01_175)] last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full grid place-items-center text-white text-[11px] font-semibold shrink-0" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                        {p.student ? getInitials(`${p.student.firstName} ${p.student.lastName}`) : '??'}
                      </div>
                      <div>
                        <div className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>{p.student ? `${p.student.firstName} ${p.student.lastName}` : '—'}</div>
                        <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{p.student?.matricule || ''}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{p.trimester}</td>
                  <td className="px-4 py-3 text-[13px] tabular-nums font-medium" style={{ color: TEXT_PRIMARY }}>{formatNumber(p.amount)} CDF</td>
                  <td className="px-4 py-3 text-[13px] tabular-nums font-medium" style={{ color: SUCCESS }}>{formatNumber(p.paidAmount)} CDF</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${getStatusPill(p.status)}`}>
                      {p.status === 'PAID' ? '✓ Payé' : p.status === 'PARTIAL' ? '◐ Partiel' : p.status === 'OVERDUE' ? '⚠ En retard' : '○ En attente'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => downloadReceipt(p.id)} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-[oklch(95%_0.04_175)] transition" style={{ color: GOLD }} title="Télécharger le reçu PDF">
                      <FileText size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Receipt Preview Modal */}
      {receiptPreview && (
        <ReceiptPreview
          payment={receiptPreview.payment}
          student={receiptPreview.student}
          school={receiptPreview.school}
          onClose={() => setReceiptPreview(null)}
        />
      )}
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
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Discipline</h1>
      </div>

      <div className="flex gap-0.5 border-b border-[oklch(90%_0.01_175)] mb-5">
        {[
          { key: 'BLACKLIST' as const, label: 'Liste Noire', icon: <Ban size={14} />, color: DANGER },
          { key: 'GREYLIST' as const, label: 'Liste Grise', icon: <AlertTriangle size={14} />, color: WARNING },
          { key: 'WHITELIST' as const, label: 'Liste Blanche', icon: <Award size={14} />, color: SUCCESS },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setLoading(true) }}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-[13.5px] font-medium border-b-2 -mb-px transition ${
              tab === t.key ? 'border-current' : 'border-transparent hover:text-edu-fg'
            }`}
            style={tab === t.key ? { color: t.color, borderColor: t.color === WARNING ? GOLD : t.color } : { color: TEXT_MUTED_LUXE }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ background: IVORY }}>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Élève</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Motif</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Type</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Date</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Points</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Aucun enregistrement</td></tr>
              ) : records.map(r => (
                <tr key={r.id} className="hover:bg-[oklch(97%_0.005_175)] transition border-b border-[oklch(90%_0.01_175)] last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full grid place-items-center text-white text-[11px] font-semibold shrink-0" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                        {r.student ? getInitials(`${r.student.firstName} ${r.student.lastName}`) : '??'}
                      </div>
                      <div>
                        <div className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>{r.student ? `${r.student.firstName} ${r.student.lastName}` : '—'}</div>
                        <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{r.student?.matricule || ''}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{r.title}</td>
                  <td className="px-4 py-3 text-[13px]" style={{ color: TEXT_PRIMARY }}>{r.type}</td>
                  <td className="px-4 py-3 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{formatDate(r.createdAt)}</td>
                  <td className="px-4 py-3"><span className="text-[13px] font-semibold" style={{ color: r.points > 0 ? DANGER : SUCCESS }}>{r.points > 0 ? '+' : ''}{r.points}</span></td>
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
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Communications</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">
        {/* Compose */}
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4" style={{ color: TEXT_PRIMARY }}>Nouvelle communication</h3>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <select value={type} onChange={e => setType(e.target.value)} className="px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
                <option value="ANNOUNCEMENT">Annonce</option>
                <option value="NOTIFICATION">Notification</option>
                <option value="EVENT">Événement</option>
                <option value="ALERT">Alerte</option>
              </select>
              <select value={targetType} onChange={e => setTargetType(e.target.value)} className="px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
                <option value="ALL">Tout le monde</option>
                <option value="PARENTS">Parents</option>
                <option value="STAFF">Personnel</option>
                <option value="CLASS">Classe</option>
              </select>
            </div>
            <input placeholder="Titre" value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)]" />
            <textarea placeholder="Contenu du message..." value={content} onChange={e => setContent(e.target.value)} rows={4} className="w-full px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)] resize-none" />
            <div className="flex items-center gap-4 text-sm" style={{ color: TEXT_PRIMARY }}>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={whatsapp} onChange={e => setWhatsapp(e.target.checked)} className="accent-[oklch(72%_0.15_65)]" /> WhatsApp</label>
              <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={app} onChange={e => setApp(e.target.checked)} className="accent-[oklch(72%_0.15_65)]" /> App</label>
            </div>
            <button onClick={handleSend} className="edu-gold-cta w-full py-2.5 rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-2">
              <Send size={14} /> Envoyer
            </button>
          </div>
        </div>

        {/* History */}
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4" style={{ color: TEXT_PRIMARY }}>Historique</h3>
          <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar">
            {loading ? <div className="text-center py-4" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</div> :
              comms.map(c => (
                <div key={c.id} className="p-3 rounded-xl border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)] transition">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm" style={{ color: TEXT_PRIMARY }}>{c.title}</span>
                    <span className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{formatDate(c.sentAt)}</span>
                  </div>
                  <p className="text-xs line-clamp-2" style={{ color: TEXT_MUTED_LUXE }}>{c.content}</p>
                  <div className="flex items-center gap-2 mt-2 text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>
                    <span className={`px-1.5 py-0.5 rounded ${c.type === 'ANNOUNCEMENT' ? 'bg-[oklch(95%_0.04_175)] text-edu-accent' : 'bg-[oklch(95%_0.005_175)]'}`}>{c.type}</span>
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
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Devoirs</h1>
      </div>
      {loading ? <div className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</div> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {homework.map(h => (
            <div key={h.id} className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm edu-card-lift">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold" style={{ color: TEXT_PRIMARY }}>{h.title}</h3>
                <span className="text-xs px-2 py-1 rounded-full shrink-0" style={{ color: GOLD, background: GOLD_SOFT }}>{h.subjectName}</span>
              </div>
              <p className="text-sm mb-3 line-clamp-2" style={{ color: TEXT_MUTED_LUXE }}>{h.description}</p>
              <div className="flex items-center justify-between text-xs" style={{ color: TEXT_MUTED_LUXE }}>
                <span className="flex items-center gap-1" style={{ color: GOLD }}><Calendar size={12} /> Échéance: {formatDate(h.dueDate)}</span>
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
  const { userData, setUserData } = useEduGestStore()
  const [name, setName] = useState(userData?.name || '')
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(userData?.profileImageUrl || null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Sync profileImageUrl from store when userData changes
  useEffect(() => {
    if (userData?.profileImageUrl) {
      setProfileImageUrl(userData.profileImageUrl)
    }
  }, [userData?.profileImageUrl])

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Veuillez sélectionner une image'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('L\'image ne doit pas dépasser 5MB'); return }

    if (!userData?.id) {
      toast.error('Session invalide. Veuillez vous reconnecter.')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('userId', userData.id)
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const json = await res.json()
      if (res.ok) {
        setProfileImageUrl(json.profileImageUrl)
        // Also update the store so the sidebar avatar reflects the change
        setUserData({ ...userData, profileImageUrl: json.profileImageUrl })
        toast.success('Photo de profil mise à jour!')
      } else {
        toast.error(json.error || 'Erreur lors de l\'upload')
      }
    } catch { toast.error('Erreur réseau') }
    finally { setUploading(false) }
  }

  async function handleSave() {
    if (!userData?.id) {
      toast.error('Session invalide. Veuillez vous reconnecter.')
      return
    }

    if (!name.trim()) {
      toast.error('Le nom ne peut pas être vide')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userData.id, name: name.trim() }),
      })
      const json = await res.json()
      if (res.ok) {
        // Update the store with the new name and initials
        setUserData({
          ...userData,
          name: name.trim(),
          initials: getInitials(name.trim()),
        })
        toast.success('Profil sauvegardé avec succès!')
      } else {
        toast.error(json.error || 'Erreur lors de la sauvegarde')
      }
    } catch { toast.error('Erreur réseau') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Mon profil</h1>
      </div>
      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl max-w-lg overflow-hidden shadow-sm">
        <div className="h-28 relative" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
          <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(ellipse at top right, oklch(72% 0.15 65 / 0.3), transparent 60%)' }} />
        </div>
        <div className="px-6 pb-6 -mt-12">
          {/* Clickable avatar */}
          <div className="relative inline-block cursor-pointer group" onClick={() => fileInputRef.current?.click()}>
            {profileImageUrl ? (
              <img src={profileImageUrl} alt="Profile" className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-lg" />
            ) : (
              <div className="w-20 h-20 rounded-full grid place-items-center text-white font-bold text-2xl border-4 border-white shadow-lg group-hover:opacity-80 transition" style={{ background: `linear-gradient(135deg, oklch(55% 0.15 175), oklch(72% 0.15 65))` }}>
                {userData?.initials || '??'}
              </div>
            )}
            <div className="absolute bottom-0 right-0 w-7 h-7 rounded-full grid place-items-center border-2 border-white shadow-sm transition group-hover:scale-110" style={{ background: GOLD }}>
              {uploading ? <div className="h-3 w-3 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Edit size={12} className="text-[oklch(15%_0.02_250)]" />}
            </div>
            <input
              ref={fileInputRef}
              type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload}
            />
          </div>
          <div className="mt-3">
            <div className="text-lg font-bold" style={{ color: TEXT_PRIMARY }}>{userData?.name || 'Utilisateur'}</div>
            <div className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>{getRoleLabel(userData?.role || 'SECRETARY')}</div>
          </div>
          <div className="space-y-3 mt-5">
            <div>
              <label className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>Nom complet</label>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)]" />
            </div>
            <div>
              <label className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>École</label>
              <input defaultValue={userData?.schoolName} className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none bg-[oklch(97%_0.005_175)]" disabled />
            </div>
            <div>
              <label className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>Rôle</label>
              <input defaultValue={getRoleLabel(userData?.role || 'SECRETARY')} className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none bg-[oklch(97%_0.005_175)]" disabled />
            </div>
          </div>
          <button onClick={handleSave} disabled={saving} className="edu-gold-cta mt-5 px-6 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
            {saving ? <div className="h-4 w-4 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Check size={14} />}
            Sauvegarder
          </button>
        </div>
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
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Passage de classe</h1>
      </div>
      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ background: IVORY }}>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Élève</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Classe actuelle</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Décision</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</td></tr>
              ) : students.slice(0, 20).map(s => (
                <tr key={s.id} className="hover:bg-[oklch(97%_0.005_175)] transition border-b border-[oklch(90%_0.01_175)] last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full grid place-items-center text-white text-[11px] font-semibold shrink-0" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                        {getInitials(s.firstName + ' ' + s.lastName)}
                      </div>
                      <div>
                        <div className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>{s.firstName} {s.lastName}</div>
                        <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{s.matricule}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{s.class?.name || '—'}</td>
                  <td className="px-4 py-3">
                    <select className="px-2 py-1 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
                      <option>En attente</option><option>Passage</option><option>Redouble</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button className="text-sm font-medium hover:underline" style={{ color: GOLD }}>Valider</button>
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
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Bulletins</h1>
      </div>
      {loading ? <div className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</div> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.entries(studentGrades).slice(0, 12).map(([id, data]) => {
            const avg = data.grades.length > 0 ? data.grades.reduce((s, g) => s + g.score * (g.subject?.coefficient || 1), 0) / data.grades.reduce((s, g) => s + (g.subject?.coefficient || 1), 0) : 0
            return (
              <div key={id} className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm edu-card-lift">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-semibold" style={{ color: TEXT_PRIMARY }}>{data.student?.firstName} {data.student?.lastName}</div>
                    <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>{data.student?.matricule}</div>
                  </div>
                  <div className="text-2xl font-bold" style={{ color: avg >= 10 ? GOLD : DANGER }}>{avg.toFixed(1)}</div>
                </div>
                <div className="space-y-1.5 text-xs">
                  {data.grades.slice(0, 5).map(g => (
                    <div key={g.id} className="flex justify-between">
                      <span style={{ color: TEXT_MUTED_LUXE }}>{g.subject?.name}</span>
                      <span className="font-medium" style={{ color: g.score >= 10 ? GOLD : DANGER }}>{g.score.toFixed(1)}/20</span>
                    </div>
                  ))}
                </div>
                <button className="mt-3 w-full py-1.5 rounded-xl text-sm font-medium border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)] hover:shadow-sm transition inline-flex items-center justify-center gap-1.5" style={{ color: TEXT_PRIMARY }}>
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
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Convocations</h1>
      </div>
      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 max-w-lg shadow-sm">
        <h3 className="font-semibold mb-4" style={{ color: TEXT_PRIMARY }}>Nouvelle convocation</h3>
        <div className="space-y-3">
          <div><label className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>Élève concerné</label><input placeholder="Rechercher un élève..." className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" /></div>
          <div><label className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>Motif</label><textarea placeholder="Motif de la convocation..." rows={3} className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] resize-none" /></div>
          <div><label className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>Date</label><input type="date" className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" /></div>
          <button className="edu-gold-cta w-full py-2.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2">
            <Send size={14} /> Envoyer la convocation
          </button>
        </div>
      </div>
    </div>
  )
}

// ===== SCHOOLS MANAGEMENT VIEW =====
function SchoolsManagementView() {
  const { userData } = useEduGestStore()
  const [schools, setSchools] = useState<SchoolData[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingSchool, setEditingSchool] = useState<SchoolData | null>(null)
  const [saving, setSaving] = useState(false)

  // Modal form fields
  const [mName, setMName] = useState('')
  const [mShortName, setMShortName] = useState('')
  const [mEmail, setMEmail] = useState('')
  const [mPhone, setMPhone] = useState('')
  const [mAddress, setMAddress] = useState('')
  const [mCity, setMCity] = useState('')
  const [mProvince, setMProvince] = useState('Kinshasa')
  const [mCountry, setMCountry] = useState('RDC')
  const [mSchoolType, setMSchoolType] = useState('MIXTE')
  const [mSchoolCategory, setMSchoolCategory] = useState('PRIVEE')
  const [mDescription, setMDescription] = useState('')
  const [mEstablishmentYear, setMEstablishmentYear] = useState('')
  const [mMaxStudents, setMMaxStudents] = useState('500')
  const [mSubscriptionTier, setMSubscriptionTier] = useState('FREEMIUM')
  // Admin fields (only for creation)
  const [mAdminName, setMAdminName] = useState('')
  const [mAdminEmail, setMAdminEmail] = useState('')
  const [mAdminPhone, setMAdminPhone] = useState('')
  const [mAdminPassword, setMAdminPassword] = useState('')

  function loadSchools() {
    fetch('/api/schools?limit=30').then(r => r.json()).then(j => { setSchools(j.data || []); setLoading(false) }).catch(() => setLoading(false))
  }

  useEffect(() => { loadSchools() }, [])

  function openCreateModal() {
    setEditingSchool(null)
    setMName(''); setMShortName(''); setMEmail(''); setMPhone(''); setMAddress('')
    setMCity(''); setMProvince('Kinshasa'); setMCountry('RDC'); setMSchoolType('MIXTE')
    setMSchoolCategory('PRIVEE'); setMDescription(''); setMEstablishmentYear('')
    setMMaxStudents('500'); setMSubscriptionTier('FREEMIUM')
    setMAdminName(''); setMAdminEmail(''); setMAdminPhone(''); setMAdminPassword('')
    setShowModal(true)
  }

  function openEditModal(school: SchoolData) {
    setEditingSchool(school)
    setMName(school.name); setMShortName(school.shortName); setMEmail(school.email)
    setMPhone(school.phone); setMAddress(school.address); setMCity(school.city)
    setMProvince(school.province); setMCountry(school.country); setMSchoolType(school.schoolType)
    setMSchoolCategory(school.schoolCategory); setMDescription(school.description || '')
    setMEstablishmentYear(school.establishmentYear?.toString() || '')
    setMMaxStudents(school.maxStudents?.toString() || '500')
    setMSubscriptionTier(school.subscriptionTier || 'FREEMIUM')
    setMAdminName(''); setMAdminEmail(''); setMAdminPhone(''); setMAdminPassword('')
    setShowModal(true)
  }

  async function handleSave() {
    if (!mName || !mShortName || !mEmail || !mPhone || !mCity || !mProvince || !mCountry) {
      toast.error('Veuillez remplir tous les champs obligatoires')
      return
    }

    setSaving(true)
    try {
      if (editingSchool) {
        // Update existing school
        const res = await fetch(`/api/schools/${editingSchool.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: mName, shortName: mShortName, email: mEmail, phone: mPhone,
            address: mAddress, city: mCity, province: mProvince, country: mCountry,
            schoolType: mSchoolType, schoolCategory: mSchoolCategory,
            description: mDescription || null,
            establishmentYear: parseInt(mEstablishmentYear) || null,
            maxStudents: parseInt(mMaxStudents) || 500,
            subscriptionTier: mSubscriptionTier,
          }),
        })
        if (res.ok) {
          toast.success('École modifiée avec succès')
          setShowModal(false)
          loadSchools()
        } else {
          const json = await res.json()
          toast.error(json.error || 'Erreur lors de la modification')
        }
      } else {
        // Create new school
        if (!mAdminName || !mAdminEmail || !mAdminPhone) {
          toast.error('Veuillez remplir les informations du compte administrateur')
          setSaving(false)
          return
        }
        const res = await fetch('/api/schools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: mName, shortName: mShortName, email: mEmail, phone: mPhone,
            address: mAddress, city: mCity, province: mProvince, country: mCountry,
            schoolType: mSchoolType, schoolCategory: mSchoolCategory,
            description: mDescription || null,
            establishmentYear: parseInt(mEstablishmentYear) || null,
            maxStudents: parseInt(mMaxStudents) || 500,
            adminName: mAdminName, adminEmail: mAdminEmail,
            adminPhone: mAdminPhone, adminPassword: mAdminPassword || 'admin123',
          }),
        })
        if (res.ok) {
          toast.success('École créée avec succès')
          setShowModal(false)
          loadSchools()
        } else {
          const json = await res.json()
          toast.error(json.error || 'Erreur lors de la création')
        }
      }
    } catch { toast.error('Erreur réseau') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Écoles</h1>
          </div>
          <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>{formatNumber(schools.length)} écoles</p>
        </div>
        <button onClick={openCreateModal} className="edu-gold-cta inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold">
          <Plus size={14} /> Ajouter une école
        </button>
      </div>

      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ background: IVORY }}>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>École</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Abonnement</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Élèves</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}>Statut</th>
                <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-4 py-3" style={{ color: GOLD }}></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</td></tr>
              ) : schools.map(s => (
                <tr key={s.id} className="hover:bg-[oklch(97%_0.005_175)] transition border-b border-[oklch(90%_0.01_175)] last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full grid place-items-center text-white font-semibold text-[11px] shrink-0" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                        {s.shortName.substring(0, 2)}
                      </div>
                      <div>
                        <div className="font-medium text-[13px]" style={{ color: TEXT_PRIMARY }}>{s.name}</div>
                        <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{s.city} · {s.province}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px]" style={{ color: TEXT_PRIMARY }}><strong>{getSubscriptionLabel(s.subscriptionTier)}</strong> · {getSubscriptionPrice(s.subscriptionTier)}</td>
                  <td className="px-4 py-3 text-[13px] font-semibold tabular-nums" style={{ color: TEXT_PRIMARY }}>{formatNumber(s._count?.students || s.studentCount)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${getStatusPill(s.isActive ? 'Actif' : 'Suspendu')}`}>
                      {s.isActive ? 'Actif' : 'Suspendu'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button className="w-8 h-8 rounded-lg grid place-items-center hover:bg-[oklch(95%_0.04_175)] transition" style={{ color: TEXT_MUTED_LUXE }}><Eye size={14} /></button>
                      <button onClick={() => openEditModal(s)} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-[oklch(95%_0.04_175)] transition" style={{ color: TEXT_MUTED_LUXE }}><Edit size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* School Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl my-8" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="relative h-24 rounded-t-2xl overflow-hidden" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
              <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(ellipse at top right, oklch(72% 0.15 65 / 0.3), transparent 60%)' }} />
              <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">{editingSchool ? 'Modifier l\'école' : 'Ajouter une école'}</h2>
                  <p className="text-sm text-white/70">{editingSchool ? 'Modifiez les informations' : 'Créez un nouvel établissement'}</p>
                </div>
                <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg bg-white/20 grid place-items-center text-white hover:bg-white/30 transition"><X size={16} /></button>
              </div>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* School Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Nom complet <span style={{ color: DANGER }}>*</span></label>
                  <input type="text" value={mName} onChange={e => setMName(e.target.value)} placeholder="Ex: Complexe Scolaire La Lumière"
                    className="w-full mt-1 px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" />
                </div>
                <div>
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Abréviation <span style={{ color: DANGER }}>*</span></label>
                  <input type="text" value={mShortName} onChange={e => setMShortName(e.target.value.toUpperCase())} placeholder="Ex: CSL" maxLength={6}
                    className="w-full mt-1 px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" />
                </div>
                <div>
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Année de fondation</label>
                  <input type="number" value={mEstablishmentYear} onChange={e => setMEstablishmentYear(e.target.value)} placeholder="2005"
                    className="w-full mt-1 px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" />
                </div>
                <div>
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Email <span style={{ color: DANGER }}>*</span></label>
                  <input type="email" value={mEmail} onChange={e => setMEmail(e.target.value)} placeholder="ecole@email.com"
                    className="w-full mt-1 px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" />
                </div>
                <div>
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Téléphone <span style={{ color: DANGER }}>*</span></label>
                  <input type="tel" value={mPhone} onChange={e => setMPhone(e.target.value)} placeholder="+243 81 234 56 78"
                    className="w-full mt-1 px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Adresse</label>
                  <input type="text" value={mAddress} onChange={e => setMAddress(e.target.value)} placeholder="123 Av. Independence"
                    className="w-full mt-1 px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" />
                </div>
                <div>
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Ville <span style={{ color: DANGER }}>*</span></label>
                  <input type="text" value={mCity} onChange={e => setMCity(e.target.value)} placeholder="Kinshasa"
                    className="w-full mt-1 px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" />
                </div>
                <div>
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Province <span style={{ color: DANGER }}>*</span></label>
                  <select value={mProvince} onChange={e => setMProvince(e.target.value)}
                    className="w-full mt-1 px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)] cursor-pointer">
                    {PROVINCES.filter(p => p !== 'Toutes provinces').map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Pays <span style={{ color: DANGER }}>*</span></label>
                  <select value={mCountry} onChange={e => setMCountry(e.target.value)}
                    className="w-full mt-1 px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)] cursor-pointer">
                    <option value="RDC">RD Congo</option>
                    <option value="Sénégal">Sénégal</option>
                    <option value="Côte d'Ivoire">Côte d'Ivoire</option>
                    <option value="Congo">Congo</option>
                    <option value="Cameroun">Cameroun</option>
                    <option value="Gabon">Gabon</option>
                  </select>
                </div>
                <div>
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Capacité max</label>
                  <input type="number" value={mMaxStudents} onChange={e => setMMaxStudents(e.target.value)} placeholder="500"
                    className="w-full mt-1 px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)]" />
                </div>
                <div>
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Type</label>
                  <select value={mSchoolType} onChange={e => setMSchoolType(e.target.value)}
                    className="w-full mt-1 px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)] cursor-pointer">
                    <option value="MATERNELLE">Maternelle</option>
                    <option value="PRIMAIRE">Primaire</option>
                    <option value="SECONDAIRE">Secondaire</option>
                    <option value="MIXTE">Mixte</option>
                  </select>
                </div>
                <div>
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Catégorie</label>
                  <select value={mSchoolCategory} onChange={e => setMSchoolCategory(e.target.value)}
                    className="w-full mt-1 px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)] cursor-pointer">
                    <option value="PRIVEE">Privée</option>
                    <option value="PUBLIQUE">Publique</option>
                  </select>
                </div>
                <div>
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Abonnement</label>
                  <select value={mSubscriptionTier} onChange={e => setMSubscriptionTier(e.target.value)}
                    className="w-full mt-1 px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)] cursor-pointer">
                    {SUBSCRIPTION_TIERS.map(t => <option key={t} value={t}>{getSubscriptionLabel(t)}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Description</label>
                  <textarea value={mDescription} onChange={e => setMDescription(e.target.value)} placeholder="Description..." rows={2}
                    className="w-full mt-1 px-4 py-3 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[3px] focus:ring-[oklch(95%_0.05_65)] resize-none" />
                </div>
              </div>

              {/* Admin account section - only for creation */}
              {!editingSchool && (
                <div className="rounded-xl p-4 mt-2" style={{ background: `linear-gradient(135deg, ${ACCENT}20, ${GOLD}15)`, border: `1px solid ${ACCENT}30` }}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-xl grid place-items-center text-white" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                      <Shield size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold" style={{ color: TEXT_PRIMARY }}>Compte administrateur</h3>
                      <p className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>Identifiants de connexion pour le secrétariat</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="text-[12px] font-medium" style={{ color: TEXT_PRIMARY }}>Nom complet <span style={{ color: DANGER }}>*</span></label>
                      <input type="text" value={mAdminName} onChange={e => setMAdminName(e.target.value)} placeholder="Jean Mukendi"
                        className="w-full mt-1 px-3 py-2.5 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[2px] focus:ring-[oklch(95%_0.05_65)]" />
                    </div>
                    <div>
                      <label className="text-[12px] font-medium" style={{ color: TEXT_PRIMARY }}>Email <span style={{ color: DANGER }}>*</span></label>
                      <input type="email" value={mAdminEmail} onChange={e => setMAdminEmail(e.target.value)} placeholder="admin@ecole.com"
                        className="w-full mt-1 px-3 py-2.5 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[2px] focus:ring-[oklch(95%_0.05_65)]" />
                    </div>
                    <div>
                      <label className="text-[12px] font-medium" style={{ color: TEXT_PRIMARY }}>Téléphone <span style={{ color: DANGER }}>*</span></label>
                      <input type="tel" value={mAdminPhone} onChange={e => setMAdminPhone(e.target.value)} placeholder="+243 81 234 56 78"
                        className="w-full mt-1 px-3 py-2.5 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[2px] focus:ring-[oklch(95%_0.05_65)]" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[12px] font-medium" style={{ color: TEXT_PRIMARY }}>Mot de passe</label>
                      <input type="password" value={mAdminPassword} onChange={e => setMAdminPassword(e.target.value)} placeholder="Défaut: admin123"
                        className="w-full mt-1 px-3 py-2.5 border border-[oklch(88%_0.01_175)] rounded-xl text-sm bg-white outline-none transition focus:border-[oklch(72%_0.15_65)] focus:ring-[2px] focus:ring-[oklch(95%_0.05_65)]" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-[oklch(90%_0.01_175)] flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-5 py-2.5 rounded-xl text-sm font-medium border border-[oklch(88%_0.01_175)] hover:bg-[oklch(97%_0.005_175)] transition" style={{ color: TEXT_MUTED_LUXE }}>
                Annuler
              </button>
              <button onClick={handleSave} disabled={saving} className="edu-gold-cta px-6 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-50">
                {saving ? <div className="h-4 w-4 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Check size={14} />}
                {editingSchool ? 'Enregistrer' : 'Créer l\'école'}
              </button>
            </div>
          </div>
        </div>
      )}
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
      case 'create-school': return <CreateSchoolView />
      case 'pricing': return <PricingView />
      case 'school-detail': return <SchoolDetailView />
      default: return <HomeView />
    }
  }

  return <DashboardLayout />
}
