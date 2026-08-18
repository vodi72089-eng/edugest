'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useEduGestStore, ViewType, UserRole, UserData, authFetch, setAuthToken, restoreSession } from '@/lib/store'
import { toast } from 'sonner'
import { reportDeviceFingerprint } from '@/lib/device-fingerprint'
import type { SchoolData, StudentData, ClassData, GradeData, PaymentData, DisciplineData, CommunicationData, HomeworkData } from '@/lib/types'
import { ACCENT, ACCENT2, ACCENT_SOFT, SUCCESS, WARNING, DANGER, INFO, MUTED, BORDER, GOLD, GOLD_SOFT, GOLD_GLOW, DARK, DARK_ALT, IVORY, IVORY_WARM, TEXT_PRIMARY, TEXT_MUTED_LUXE, SUCCESS_SOFT, SUBSCRIPTION_TIERS, PROVINCES, FILTER_CHIPS, COVER_GRADIENTS, LOGO_COLORS, ENROLLMENT_DATA, SUBSCRIPTION_DATA } from '@/lib/constants'
import { getInitials, formatDate, formatNumber, formatCurrency, getSchoolTypeLabel, getSubscriptionLabel, getSubscriptionPrice, getRoleLabel, getStatusPill } from '@/lib/helpers'
import StudentAvatar from '@/components/ui/StudentAvatar'
import dynamic from 'next/dynamic'
const SchoolMap = dynamic(() => import('@/components/SchoolMap'), { ssr: false })
import SuperAdminDashboard from '@/components/dashboards/SuperAdminDashboard'
import SecretaryDashboard from '@/components/dashboards/SecretaryDashboard'
import CashierDashboard from '@/components/dashboards/CashierDashboard'
import ParentDashboard from '@/components/dashboards/ParentDashboard'
import TeacherDashboard from '@/components/dashboards/TeacherDashboard'
import HeadTeacherDashboard from '@/components/dashboards/HeadTeacherDashboard'
import DisciplineDashboardView from '@/components/dashboards/DisciplineDashboard'
import StudentsView from '@/components/views/StudentsView'
import GradesView from '@/components/views/GradesView'
import PaymentsView from '@/components/views/PaymentsView'
import DisciplineView from '@/components/views/DisciplineView'
import PersonnelView from '@/components/views/PersonnelView'
import ProfileView from '@/components/views/ProfileView'
import SettingsView from '@/components/views/SettingsView'
import OnlinePaymentView from '@/components/views/OnlinePaymentView'
import DettesView from '@/components/views/DettesView'
import SchoolsManagementView from '@/components/views/SchoolsManagementView'
import {
  Search, Bell, Settings, Plus, ChevronRight, Users, GraduationCap,
  DollarSign, MessageSquare, BookOpen, Shield, LogOut, Menu, X,
  MapPin, Star, School, Phone, Mail, Eye, Edit, MoreVertical,
  ArrowLeft, CheckCircle, AlertTriangle, Clock, Send, FileText,
  BarChart3, CreditCard, UserCircle, ChevronDown, Filter,
   TrendingUp, UserPlus, Calendar, ClipboardList,
  Info, Zap, Globe, Lock, Award, Ban, CircleDot, ListChecks,
  LayoutDashboard, Building2, Wallet, Megaphone, PenTool, Archive,
  UsersRound, BadgeDollarSign, Siren, Heart, Target, Briefcase,
  ChevronUp, ExternalLink, Check, Minus, PanelLeftClose, PanelLeftOpen, ImagePlus, Upload, Camera, RotateCcw, EyeOff, Download, Save, MessageCircle, Trash2, RefreshCw, QrCode, Hash
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell
} from 'recharts'

// ===== Types (imported from @/lib/types) =====
// ===== CONSTANTS (imported from @/lib/constants) =====
// ===== HELPERS (imported from @/lib/helpers) =====

// ===== SEARCH AUTOCOMPLETE COMPONENT =====
interface AutocompleteItem {
  id: string
  label: string
  sublabel?: string
  photoUrl?: string
}

function SearchAutocomplete({
  label,
  placeholder,
  items,
  selectedId,
  onSelect,
  onClear,
  searchQuery,
  onSearchChange,
  loading = false,
  emptyMessage = 'Aucun résultat',
  itemTypeName = 'résultat',
  className = '',
}: {
  label?: string
  placeholder?: string
  items: AutocompleteItem[]
  selectedId: string | null
  onSelect: (item: AutocompleteItem) => void
  onClear: () => void
  searchQuery: string
  onSearchChange: (value: string) => void
  loading?: boolean
  emptyMessage?: string
  itemTypeName?: string
  className?: string
}) {
  const [showDropdown, setShowDropdown] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const selectedItem = selectedId ? items.find(i => i.id === selectedId) : null
  const displayValue = selectedItem ? selectedItem.label : searchQuery

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (item: AutocompleteItem) => {
    onSelect(item)
    setShowDropdown(false)
  }

  const handleClear = () => {
    onClear()
    setShowDropdown(false)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSearchChange(e.target.value)
    setShowDropdown(true)
  }

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>{label}</label>
      )}
      <div className="flex items-center gap-2 bg-white border border-[oklch(90%_0.01_175)] rounded-xl px-3 py-2.5 focus-within:ring-2 focus-within:ring-[oklch(72%_0.15_65_/_0.3)] focus-within:border-[oklch(72%_0.15_65_/_0.5)] transition">
        <Search size={14} style={{ color: TEXT_MUTED_LUXE }} />
        <input
          placeholder={placeholder || 'Rechercher...'}
          value={displayValue}
          onChange={handleInputChange}
          onFocus={() => { if (items.length > 0 || searchQuery.length >= 2) setShowDropdown(true) }}
          className="flex-1 border-0 bg-transparent outline-none text-sm"
        />
        {(selectedId || searchQuery) && (
          <button onClick={handleClear} className="text-[oklch(45%_0.18_25)] hover:text-[oklch(35%_0.20_25)] shrink-0">
            <X size={14} />
          </button>
        )}
      </div>
      {/* Selected item chip */}
      {selectedId && selectedItem && (
        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium" style={{ background: GOLD_SOFT, color: GOLD }}>
          <StudentAvatar firstName={selectedItem.label.split(' ')[0] || ''} lastName={selectedItem.label.split(' ').slice(1).join(' ') || ''} photoUrl={selectedItem.photoUrl} size={24} className="text-white font-semibold" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }} />
          {selectedItem.label}
          {selectedItem.sublabel && <span className="text-[10px] opacity-70">({selectedItem.sublabel})</span>}
        </div>
      )}
      {/* Autocomplete dropdown */}
      {showDropdown && (
        <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-[oklch(90%_0.01_175)] rounded-xl shadow-xl max-h-56 overflow-y-auto">
          {loading ? (
            <div className="px-4 py-4 text-center text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>
              <div className="h-5 w-5 border-2 border-[oklch(90%_0.01_175)] border-t-[oklch(72%_0.15_65)] rounded-full animate-spin mx-auto mb-2" />
              Recherche...
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-4 text-center text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>
              {searchQuery.length < 2 ? 'Tapez au moins 2 caractères...' : emptyMessage}
            </div>
          ) : (
            <>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider border-b border-[oklch(92%_0.005_250)]" style={{ color: TEXT_MUTED_LUXE }}>
                {items.length} {itemTypeName}{items.length > 1 ? 's' : ''} trouvé{items.length > 1 ? 's' : ''}
              </div>
              {items.map(item => (
                <button
                  key={item.id}
                  onClick={() => handleSelect(item)}
                  className="w-full text-left px-3 py-2.5 hover:bg-[oklch(97%_0.02_65)] transition flex items-center gap-3 border-b border-[oklch(94%_0.005_250)] last:border-0 cursor-pointer group"
                >
                  <StudentAvatar firstName={item.label.split(' ')[0] || ''} lastName={item.label.split(' ').slice(1).join(' ') || ''} photoUrl={item.photoUrl} size={32} className="text-white font-semibold" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold group-hover:text-[oklch(55%_0.15_65)] transition" style={{ color: TEXT_PRIMARY }}>{item.label}</div>
                    {item.sublabel && <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{item.sublabel}</div>}
                  </div>
                  <ChevronRight size={14} className="text-[oklch(80%_0.01_175)] group-hover:text-[oklch(72%_0.15_65)] transition shrink-0" />
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
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
function SchoolsOverviewMap({ schools }: { schools: SchoolData[] }) {
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
  const [typewriterLine1, setTypewriterLine1] = useState('')
  const [typewriterLine2, setTypewriterLine2] = useState('')
  const [typewriterActiveLine, setTypewriterActiveLine] = useState<1 | 2 | null>(1)

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

  // Typewriter animation
  useEffect(() => {
    const title1 = "Rejoignez"
    const title2 = "l'excellence éducative"
    let charIndex = 0
    let currentLine = 1
    let timeoutId: ReturnType<typeof setTimeout>

    function type() {
      if (currentLine === 1) {
        if (charIndex < title1.length) {
          setTypewriterLine1(title1.substring(0, charIndex + 1))
          setTypewriterActiveLine(1)
          charIndex++
          timeoutId = setTimeout(type, 80 + Math.random() * 60)
        } else {
          currentLine = 2
          charIndex = 0
          setTypewriterActiveLine(2)
          timeoutId = setTimeout(type, 400)
        }
      } else {
        if (charIndex < title2.length) {
          setTypewriterLine2(title2.substring(0, charIndex + 1))
          setTypewriterActiveLine(2)
          charIndex++
          timeoutId = setTimeout(type, 80 + Math.random() * 60)
        } else {
          // Typing complete — keep cursor briefly then hide
          setTypewriterActiveLine(2)
          setTimeout(() => setTypewriterActiveLine(null), 1500)
        }
      }
    }

    timeoutId = setTimeout(type, 800)
    return () => clearTimeout(timeoutId)
  }, [])

  // Floating parallax icons
  useEffect(() => {
    const container = document.getElementById('stitch-parallax-container')
    if (!container) return

    const educationIcons = [
      '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>',
      '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>',
      '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>',
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>',
      '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>',
      '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>',
      '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>',
      '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18h8"></path><path d="M3 22h18"></path><path d="M14 22a7 7 0 1 0 0-14h-1"></path><path d="M9 14h2"></path><path d="M9 12a2 2 0 1 1-4 0V7a2 2 0 1 1 4 0v5Z"></path><path d="M12 7V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4"></path></svg>',
    ]

    const elements: { el: HTMLDivElement; x: number; y: number; originX: number; originY: number; vx: number; vy: number; depth: number; scale: number; rotation: number; rotationSpeed: number; phase: number }[] = []
    const numIcons = 20
    let mouseX = window.innerWidth / 2
    let mouseY = window.innerHeight / 2
    let targetMouseX = mouseX
    let targetMouseY = mouseY
    let animFrameId: number

    for (let i = 0; i < numIcons; i++) {
      const el = document.createElement('div')
      el.style.position = 'absolute'
      el.style.pointerEvents = 'none'
      el.style.userSelect = 'none'
      el.style.zIndex = '1'
      el.style.willChange = 'transform'
      el.innerHTML = educationIcons[i % educationIcons.length]

      const startX = Math.random() * window.innerWidth
      const startY = Math.random() * (window.innerHeight * 0.9)
      const depth = 0.02 + Math.random() * 0.1
      const sizeScale = 0.7 + Math.random() * 1.3

      const colorRoll = Math.random()
      if (colorRoll > 0.85) el.style.color = '#f5a623'
      else if (colorRoll > 0.70) el.style.color = '#10b981'
      else el.style.color = 'rgba(255,255,255,0.25)'

      el.style.opacity = (0.05 + Math.random() * 0.15).toString()

      container.appendChild(el)
      elements.push({
        el, x: startX, y: startY, originX: startX, originY: startY,
        vx: 0, vy: 0, depth, scale: sizeScale,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 0.3,
        phase: Math.random() * Math.PI * 2,
      })
    }

    // Fade icons in
    setTimeout(() => {
      elements.forEach(item => {
        const baseOp = parseFloat(item.el.style.opacity)
        item.el.style.opacity = (baseOp * 1.5).toString()
      })
    }, 500)

    const handleMouseMove = (e: MouseEvent) => {
      targetMouseX = e.clientX
      targetMouseY = e.clientY
    }
    window.addEventListener('mousemove', handleMouseMove)

    function lerp(start: number, end: number, amt: number) {
      return (1 - amt) * start + amt * end
    }

    function update() {
      mouseX = lerp(mouseX, targetMouseX, 0.08)
      mouseY = lerp(mouseY, targetMouseY, 0.08)
      const time = Date.now() * 0.001

      elements.forEach(item => {
        const dx = targetMouseX - (item.x + (targetMouseX - window.innerWidth / 2) * item.depth)
        const dy = targetMouseY - (item.y + (targetMouseY - window.innerHeight / 2) * item.depth)
        const dist = Math.sqrt(dx * dx + dy * dy)
        const mouseRange = 400
        const attractionStrength = 0.08

        if (dist < mouseRange) {
          const force = (1 - dist / mouseRange) * attractionStrength
          item.vx += dx * force * 0.2
          item.vy += dy * force * 0.2
        }

        item.vx += (item.originX - item.x) * 0.01
        item.vy += (item.originY - item.y) * 0.01
        item.vx *= 0.92
        item.vy *= 0.92
        item.x += item.vx
        item.y += item.vy

        const driftX = Math.sin(time + item.phase) * 0.6
        const driftY = Math.cos(time + item.phase * 0.7) * 0.6
        const px = (mouseX - window.innerWidth / 2) * item.depth
        const py = (mouseY - window.innerHeight / 2) * item.depth
        item.rotation += item.rotationSpeed

        item.el.style.transform = `translate3d(${item.x + px + driftX}px, ${item.y + py + driftY}px, 0) rotate(${item.rotation}deg) scale(${item.scale})`
      })

      animFrameId = requestAnimationFrame(update)
    }
    update()

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      cancelAnimationFrame(animFrameId)
      // Clean up icons
      while (container.firstChild) container.removeChild(container.firstChild)
    }
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

  const chipCounts: Record<string, number> = {
    all: schools.length,
    MATERNELLE: schools.filter(s => s.schoolType === 'MATERNELLE' || s.schoolType === 'MIXTE').length,
    PRIMAIRE: schools.filter(s => s.schoolType === 'PRIMAIRE' || s.schoolType === 'MIXTE').length,
    SECONDAIRE: schools.filter(s => s.schoolType === 'SECONDAIRE' || s.schoolType === 'MIXTE').length,
    MIXTE: schools.filter(s => s.schoolType === 'MIXTE').length,
    PRIVEE: schools.filter(s => s.schoolCategory === 'PRIVEE').length,
    PUBLIQUE: schools.filter(s => s.schoolCategory === 'PUBLIQUE').length,
  }

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
      {/* ===== HERO SECTION — Institutional Excellence ===== */}
      <section className="relative w-full min-h-[700px] sm:min-h-[900px] flex flex-col overflow-hidden" style={{ background: 'linear-gradient(160deg, #0a0f0d 0%, #0b1613 40%, #0d1f1a 100%)' }}>
        {/* Parallax floating icons container */}
        <div id="stitch-parallax-container" className="absolute inset-0 pointer-events-none overflow-hidden z-0" />

        {/* Gradient overlay at bottom */}
        <div className="absolute bottom-0 left-0 w-full h-48 bg-gradient-to-t from-[#0a0f0d] via-[#0b1613]/50 to-transparent pointer-events-none z-10" />

        {/* Floating nav */}
        <nav className="relative z-50 flex items-center justify-between px-6 sm:px-8 md:px-16 py-5 sm:py-6 w-full">
          <button onClick={() => setCurrentView('home')} className="flex items-center shrink-0 min-w-max">
            <BrandMark height={56} className="brightness-110 hover:scale-105 transition-all duration-300" />
          </button>
          <div className="hidden md:flex items-center gap-12">
            <button onClick={() => setCurrentView('home')} className="text-gray-400 hover:text-white transition-colors text-xs font-bold uppercase tracking-[0.2em]">Écoles</button>
            <button onClick={() => { setCurrentView('home'); setTimeout(() => document.getElementById('features-section')?.scrollIntoView({ behavior: 'smooth' }), 100) }} className="text-gray-400 hover:text-white transition-colors text-xs font-bold uppercase tracking-[0.2em]">Fonctionnalités</button>
            <button onClick={() => setCurrentView('pricing')} className="text-gray-400 hover:text-white transition-colors text-xs font-bold uppercase tracking-[0.2em]">Tarifs</button>
          </div>
          <button onClick={() => setCurrentView('login')} className="bg-[#f5a623] hover:bg-[#ffb643] hover:shadow-[0_0_30px_rgba(245,166,35,0.4)] text-[#0a0f0d] px-8 sm:px-10 py-3 sm:py-3.5 rounded-full font-extrabold text-sm transition-all shadow-[0_10px_30px_rgba(245,166,35,0.2)] active:scale-95 cursor-pointer">
            Se connecter
          </button>
        </nav>

        {/* Main hero content */}
        <main className="relative z-10 flex flex-col items-center justify-center flex-grow px-4 text-center mt-[-40px]">
          {/* Typewriter title */}
          <div className="mb-10 sm:mb-14 flex flex-col items-center relative">
            <h1 className="text-5xl sm:text-6xl md:text-[6.5rem] font-black text-white leading-[1.05] tracking-tighter mb-6 sm:mb-8 relative inline-block mx-auto select-none" style={{ minHeight: '140px' }}>
              <span id="typewriter-line-1" className="inline-block relative">{typewriterLine1}{typewriterActiveLine === 1 && <span className="animate-pulse">|</span>}</span>
              <br />
              <span className="italic font-playfair inline-block relative" style={{ color: '#f5a623', textShadow: '0 0 25px rgba(245, 166, 35, 0.5), 0 0 50px rgba(245, 166, 35, 0.2)' }}>{typewriterLine2}{typewriterActiveLine === 2 && <span className="animate-pulse">|</span>}</span>
            </h1>
            <p className="text-gray-300 text-base sm:text-lg md:text-xl max-w-2xl mx-auto font-medium leading-relaxed opacity-80">
              La plateforme africaine de gestion scolaire qui connecte écoles, familles et enseignants pour un avenir meilleur.
            </p>
          </div>

          {/* Glass morphism search bar */}
          <div className="w-full max-w-4xl mb-16 sm:mb-24 relative z-20">
            <div className="p-2 rounded-2xl flex flex-col md:flex-row items-center gap-3 shadow-2xl border-white/10" style={{ background: 'rgba(26, 37, 32, 0.4)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(255, 255, 255, 0.08)', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.4)' }}>
              <div className="flex items-center flex-grow w-full px-4 sm:px-6 gap-4">
                <Search size={20} className="text-gray-400 shrink-0" />
                <input
                  type="text" placeholder="Rechercher une école par nom..."
                  value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full bg-transparent border-none text-white py-4 text-base sm:text-lg font-medium placeholder-gray-500 tracking-tight outline-none"
                />
              </div>
              <div className="hidden md:block h-10 w-px bg-white/10 mx-1" />
              <div className="flex items-center w-full md:w-auto gap-3 px-2 md:px-0">
                <div className="relative flex-grow md:flex-grow-0">
                  <select
                    value={province} onChange={e => setProvince(e.target.value)}
                    className="w-full md:w-48 bg-white/5 text-white border border-white/10 rounded-xl px-5 py-4 text-sm font-bold cursor-pointer hover:bg-white/10 transition-all appearance-none outline-none backdrop-blur-md"
                  >
                    {PROVINCES.map(p => <option key={p} value={p} className="bg-[#0a0f0d] text-white">{p}</option>)}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                  </div>
                </div>
                <button className="w-full md:w-auto bg-[#f5a623] text-[#0a0f0d] px-10 py-4 rounded-xl font-extrabold text-sm uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-[0_10px_20px_rgba(245,166,35,0.2)] whitespace-nowrap cursor-pointer">
                  Rechercher
                </button>
              </div>
            </div>
          </div>

          {/* Stats cards with tilt */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full max-w-3xl px-4 relative z-20">
            {[
              { value: '240+', label: 'Établissements', glow: 'bg-[#f5a623]/5 group-hover:bg-[#f5a623]/10', pos: '-top-10 -right-10' },
              { value: '50 000+', label: 'Familles', glow: 'bg-emerald-500/5 group-hover:bg-emerald-500/10', pos: '-bottom-10 -left-10' },
              { value: '98%', label: 'Satisfaction', glow: 'bg-cyan-500/5 group-hover:bg-cyan-500/10', pos: 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2' },
            ].map((stat) => (
              <div key={stat.label} className="p-5 rounded-2xl flex flex-col items-center justify-center group cursor-default border-white/5 overflow-hidden relative" style={{ background: 'rgba(26, 37, 32, 0.4)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid rgba(255, 255, 255, 0.08)', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.4)', transformStyle: 'preserve-3d', transition: 'transform 0.4s cubic-bezier(0.23, 1, 0.32, 1)' }}>
                <div className={`absolute ${stat.pos} w-32 h-32 ${stat.glow} blur-3xl rounded-full transition-colors`} />
                <span className="text-3xl font-black text-white tracking-tighter mb-1.5 group-hover:text-[#f5a623] transition-colors duration-500">{stat.value}</span>
                <span className="text-[9px] text-gray-400 uppercase tracking-[0.3em] font-extrabold group-hover:text-white transition-colors duration-500">{stat.label}</span>
              </div>
            ))}
          </div>
        </main>
      </section>

      {/* ===== TRUST SIGNALS BAR ===== */}
      <section style={{ background: IVORY }} className="border-y border-[oklch(88%_0.01_175)]">
        <div className="container-premium py-4 text-center">
          <p className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>
            <strong className="font-semibold" style={{ color: TEXT_PRIMARY }}>{schools.length}+</strong> Établissement{schools.length > 1 ? 's' : ''} &nbsp;•&nbsp;{' '}
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
              <span className={`text-[11px] font-medium px-1.5 py-px rounded-full ${
                activeFilter === chip.key ? 'bg-white/20 text-white' : 'bg-[oklch(90%_0.005_250)] text-edu-muted'
              }`}>{chipCounts[chip.key] ?? 0}</span>
            </button>
          ))}
          <div className="ml-auto hidden sm:block text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>
            Affichage {filteredSchools.length > 0 ? '1' : '0'}—{Math.min(12, filteredSchools.length)} sur {filteredSchools.length}
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
              <SchoolsOverviewMap schools={filteredSchools} />
            </div>
          </div>
        )}

        {/* School Cards */}
        <div className="container-premium pb-16">
          <div className="flex items-baseline justify-between mb-5">
            <div className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>
              <strong className="font-semibold" style={{ color: TEXT_PRIMARY }}>{filteredSchools.length} écoles</strong> correspondent à votre recherche
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="bg-white border border-[oklch(88%_0.01_175)] rounded-2xl overflow-hidden animate-pulse">
                  <div className="h-[120px] bg-[oklch(94%_0.005_175)]" />
                  <div className="p-6 sm:p-10 pt-10 space-y-3"><div className="h-4 bg-[oklch(94%_0.005_175)] rounded w-3/4" /><div className="h-3 bg-[oklch(94%_0.005_175)] rounded w-1/2" /></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {filteredSchools.map((school, idx) => (
                <button
                  key={school.id}
                  onClick={() => { setSelectedSchoolId(school.id); setCurrentView('school-detail') }}
                  className="block text-left bg-white border border-[oklch(88%_0.01_175)] rounded-2xl overflow-hidden edu-card-lift group"
                >
                  <div className={`h-[120px] relative bg-gradient-to-br ${COVER_GRADIENTS[idx % COVER_GRADIENTS.length]} flex items-end p-4`}>
                    {/* Mesh gradient overlay */}
                    <div className="absolute inset-0 opacity-20" style={{ background: 'radial-gradient(ellipse at top right, oklch(72% 0.15 65 / 0.3), transparent 60%)' }} />
                    <span className="absolute top-3 right-3 edu-glass px-3 py-1 rounded-full text-[11px] font-medium text-white">
                      {getSchoolTypeLabel(school.schoolType, school.schoolCategory)}
                    </span>
                    {school.logo ? (
                      <img src={school.logo} alt={school.shortName} className={`w-12 h-12 rounded-xl object-cover shadow-md relative top-6 bg-white`} />
                    ) : (
                      <div className={`w-12 h-12 rounded-xl bg-white grid place-items-center font-extrabold text-lg shadow-md relative top-6 ${LOGO_COLORS[idx % LOGO_COLORS.length]}`}>
                        {school.shortName.substring(0, 2)}
                      </div>
                    )}
                  </div>
                  <div className="p-6 sm:p-10 pt-10">
                    <div className="text-base font-semibold tracking-tight mb-1" style={{ color: TEXT_PRIMARY }}>{school.name}</div>
                    <div className="text-[13px] flex items-center gap-1 mb-4" style={{ color: TEXT_MUTED_LUXE }}>
                      <MapPin size={12} /> {school.city} · {school.province}
                    </div>
                    <div className="flex gap-4 py-3 border-t border-b border-[oklch(88%_0.01_175)] mb-4">
                      <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>
                        <strong className="block text-[15px] font-semibold tabular-nums mb-0.5" style={{ color: TEXT_PRIMARY }}>{formatNumber(school._count?.students || school.studentCount)}</strong>élèves
                      </div>
                      <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>
                        <strong className="block text-[15px] font-semibold tabular-nums mb-0.5" style={{ color: TEXT_PRIMARY }}>{school._count?.classes || school.classCount}</strong>classes
                      </div>
                      <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>
                        <strong className="block text-[15px] font-semibold tabular-nums mb-0.5" style={{ color: TEXT_PRIMARY }}>{school.establishmentYear || '—'}</strong>fondée
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-[13px] font-medium">
                        <Star size={14} style={{ color: GOLD }} className="fill-current" />
                        <span style={{ color: TEXT_PRIMARY }}>{school.averageRating?.toFixed(1) || '—'}</span>
                        <span className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>· {school.totalReviews} avis</span>
                      </div>
                      <span className="edu-gold-cta text-[13px] font-semibold px-4 py-2 rounded-xl">
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
          <div className="edu-ornament mb-4">
            <span style={{ color: GOLD }}>►</span>
          </div>
          <h2 className="text-[26px] sm:text-[36px] font-extrabold tracking-tight mb-3" style={{ color: TEXT_PRIMARY }}>
            Pourquoi choisir <span style={{ color: GOLD }}>EduGest</span>
          </h2>
          <p className="text-base max-w-[500px] mx-auto mb-12" style={{ color: TEXT_MUTED_LUXE }}>
            Une plateforme conçue pour les réalités africaines, avec les outils qu&apos;il vous faut.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {FEATURES.map((feature, idx) => (
              <div key={idx} className="bg-white border border-[oklch(88%_0.01_175)] rounded-2xl p-8 text-left edu-card-lift group">
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
    <div className="min-h-screen flex flex-col" style={{ background: IVORY }}>
      <PublicHeader />
      <div className="container-premium py-8 flex-1">
        <button onClick={() => setCurrentView('home')} className="inline-flex items-center gap-1.5 text-sm mb-6 transition hover:opacity-80" style={{ color: TEXT_MUTED_LUXE }}>
          <ArrowLeft size={14} /> Retour aux écoles
        </button>

        <div className="bg-white border border-[oklch(88%_0.01_175)] rounded-2xl overflow-hidden shadow-sm">
          <div className={`h-48 bg-gradient-to-br ${COVER_GRADIENTS[0]} relative`}>
            {/* Darker overlay for hero */}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, oklch(15% 0.02 250 / 0.3), oklch(15% 0.02 250 / 0.5))' }} />
            <span className="absolute top-4 right-4 edu-glass px-3 py-1 rounded-full text-xs font-medium text-white">
              {getSchoolTypeLabel(school.schoolType, school.schoolCategory)}
            </span>
          </div>
          <div className="px-6 sm:px-10 pb-10 -mt-12 relative">
            <div className="w-20 h-20 rounded-2xl bg-white grid place-items-center text-2xl font-extrabold shadow-lg border border-[oklch(88%_0.01_175)]" style={{ color: ACCENT }}>
              {school.shortName.substring(0, 2)}
            </div>
            <h1 className="text-[21px] sm:text-[29px] font-bold mt-4 tracking-tight" style={{ color: TEXT_PRIMARY }}>{school.name}</h1>
            <div className="flex items-center gap-2 text-sm mt-2" style={{ color: TEXT_MUTED_LUXE }}>
              <MapPin size={14} /> {school.address}, {school.city} · {school.province}, {school.country}
            </div>
            <div className="flex items-center gap-4 mt-3 text-sm flex-wrap">
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
              <div className="rounded-xl p-5 text-center" style={{ background: IVORY }}>
                <div className="text-2xl font-bold" style={{ color: TEXT_PRIMARY }}>{formatNumber(school._count?.students || school.studentCount)}</div>
                <div className="text-xs mt-1" style={{ color: TEXT_MUTED_LUXE }}>Élèves</div>
              </div>
              <div className="rounded-xl p-5 text-center" style={{ background: IVORY }}>
                <div className="text-2xl font-bold" style={{ color: TEXT_PRIMARY }}>{school._count?.classes || school.classCount}</div>
                <div className="text-xs mt-1" style={{ color: TEXT_MUTED_LUXE }}>Classes</div>
              </div>
              <div className="rounded-xl p-5 text-center" style={{ background: IVORY }}>
                <div className="text-2xl font-bold" style={{ color: TEXT_PRIMARY }}>{school.establishmentYear || '—'}</div>
                <div className="text-xs mt-1" style={{ color: TEXT_MUTED_LUXE }}>Fondée</div>
              </div>
              <div className="rounded-xl p-5 text-center" style={{ background: IVORY }}>
                <div className="text-2xl font-bold" style={{ color: TEXT_PRIMARY }}>{getSubscriptionLabel(school.subscriptionTier)}</div>
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
                <div className="rounded-2xl overflow-hidden shadow-sm"><SchoolsOverviewMap schools={[school]} /></div>
              </div>
            )}

            <div className="mt-8">
              <button onClick={() => setCurrentView('login')} className="edu-gold-cta px-8 py-3.5 rounded-xl font-semibold text-sm">
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
// ===== PRICING PLAN TYPE =====
interface PricingPlanData {
  id: string; tier: string; name: string; price: number; originalPrice: number | null;
  period: string; description: string; features: string; color: string;
  isPopular: boolean; isActive: boolean; sortOrder: number;
  updatedAt: string; createdAt: string;
}

function PricingView() {
  const { setCurrentView, userRole } = useEduGestStore()
  const [plans, setPlans] = useState<PricingPlanData[]>([])
  const [loading, setLoading] = useState(true)
  const [editingPlan, setEditingPlan] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ price: string; originalPrice: string; name: string; description: string; features: string; period: string }>({ price: '', originalPrice: '', name: '', description: '', features: '', period: '' })
  const [saving, setSaving] = useState(false)

  const isAdmin = userRole === 'SUPER_ADMIN_GLOBAL'

  useEffect(() => {
    async function loadPlans() {
      try {
        const res = await fetch('/api/pricing')
        const json = await res.json()
        setPlans(json.data || [])
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    loadPlans()
  }, [])

  function formatPrice(price: number) {
    if (price === -1) return 'Sur mesure'
    return price.toLocaleString('fr-FR') + '$'
  }

  function startEdit(plan: PricingPlanData) {
    setEditingPlan(plan.id)
    setEditForm({
      price: plan.price === -1 ? '' : String(plan.price),
      originalPrice: plan.originalPrice != null ? String(plan.originalPrice) : '',
      name: plan.name,
      description: plan.description,
      features: plan.features,
      period: plan.period,
    })
  }

  async function saveEdit(planId: string) {
    setSaving(true)
    try {
      const priceVal = editForm.price === '' ? -1 : parseInt(editForm.price, 10)
      const originalPriceVal = editForm.originalPrice === '' ? null : parseInt(editForm.originalPrice, 10)
      const res = await authFetch('/api/pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: planId,
          price: priceVal,
          originalPrice: originalPriceVal,
          name: editForm.name,
          description: editForm.description,
          features: editForm.features,
          period: editForm.period,
        }),
      })
      const json = await res.json()
      if (json.data) {
        setPlans(prev => prev.map(p => p.id === planId ? json.data : p))
        toast.success(`Prix de ${editForm.name} mis à jour !`)
      } else {
        toast.error('Erreur lors de la mise à jour')
      }
    } catch {
      toast.error('Erreur réseau')
    } finally {
      setSaving(false)
      setEditingPlan(null)
    }
  }

  async function resetPrices() {
    if (!confirm('Réinitialiser tous les prix aux valeurs par défaut ?')) return
    try {
      const res = await authFetch('/api/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      })
      const json = await res.json()
      setPlans(json.data || [])
      toast.success('Prix réinitialisés !')
    } catch {
      toast.error('Erreur lors de la réinitialisation')
    }
  }

  const tierColors: Record<string, string> = {
    FREEMIUM: MUTED, ESSENTIEL: INFO, STANDARD: ACCENT,
    PREMIUM: WARNING, ENTERPRISE: SUCCESS, CORPORATE: DANGER,
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: IVORY }}>
      <PublicHeader />
      <div className="container-premium py-16 sm:py-[120px] flex-1">
        <div className="text-center mb-12">
          <div className="edu-ornament mb-4">
            <span style={{ color: GOLD }}>►</span>
          </div>
          <h1 className="text-[26px] sm:text-[36px] font-extrabold tracking-tight mb-3" style={{ color: TEXT_PRIMARY }}>
            Tarifs <span style={{ color: GOLD }}>transparents</span>
          </h1>
          <p className="max-w-[500px] mx-auto" style={{ color: TEXT_MUTED_LUXE }}>Choisissez la formule adaptée à votre établissement. Évoluez à tout moment.</p>
          {isAdmin && (
            <button onClick={resetPrices} className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border border-[oklch(88%_0.01_175)] hover:border-[oklch(72%_0.15_65)] hover:shadow-sm transition" style={{ color: TEXT_MUTED_LUXE }}>
              <RotateCcw size={14} /> Réinitialiser les prix
            </button>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="bg-white border border-[oklch(88%_0.01_175)] rounded-2xl p-8 sm:p-10 animate-pulse">
                <div className="h-5 bg-[oklch(94%_0.005_175)] rounded w-1/2 mb-3" />
                <div className="h-3 bg-[oklch(94%_0.005_175)] rounded w-3/4 mb-5" />
                <div className="h-8 bg-[oklch(94%_0.005_175)] rounded w-1/3 mb-6" />
                <div className="space-y-3"><div className="h-3 bg-[oklch(94%_0.005_175)] rounded w-full" /><div className="h-3 bg-[oklch(94%_0.005_175)] rounded w-4/5" /><div className="h-3 bg-[oklch(94%_0.005_175)] rounded w-3/5" /></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {plans.map(plan => {
              const color = plan.color || tierColors[plan.tier] || MUTED
              const featureList = plan.features ? plan.features.split(',').map(f => f.trim()) : []
              const isCustom = plan.price === -1
              const hasDiscount = plan.originalPrice != null && plan.originalPrice > plan.price && plan.price >= 0
              const discountPct = hasDiscount ? Math.round((1 - plan.price / plan.originalPrice!) * 100) : 0
              const isEditing = editingPlan === plan.id

              return (
                <div key={plan.id} className={`bg-white border rounded-2xl p-8 sm:p-10 relative edu-card-lift ${
                  plan.isPopular
                    ? 'border-[oklch(72%_0.15_65)] shadow-[0_0_24px_oklch(72%_0.15_65_/_0.12)]'
                    : 'border-[oklch(88%_0.01_175)]'
                }`}>
                  {plan.isPopular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 edu-gold-cta px-4 py-1 rounded-full text-xs font-semibold">Populaire</span>
                  )}
                  {hasDiscount && !isEditing && (
                    <span className="absolute -top-3 right-4 bg-red-500 text-white px-3 py-1 rounded-full text-xs font-bold">-{discountPct}%</span>
                  )}

                  {isEditing ? (
                    /* ===== EDIT MODE ===== */
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: TEXT_MUTED_LUXE }}>Nom du plan</label>
                        <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2.5 border border-[oklch(88%_0.01_175)] rounded-lg text-sm outline-none focus:border-[oklch(72%_0.15_65)] focus:ring-2 focus:ring-[oklch(95%_0.05_65)]" style={{ color: TEXT_PRIMARY }} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: TEXT_MUTED_LUXE }}>Prix ($/mois) — laisser vide pour « Sur mesure »</label>
                        <input type="number" value={editForm.price} onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))} placeholder="Ex: 250" className="w-full px-3 py-2.5 border border-[oklch(88%_0.01_175)] rounded-lg text-sm outline-none focus:border-[oklch(72%_0.15_65)] focus:ring-2 focus:ring-[oklch(95%_0.05_65)]" style={{ color: TEXT_PRIMARY }} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: TEXT_MUTED_LUXE }}>Prix original barré (optionnel, pour réduction)</label>
                        <input type="number" value={editForm.originalPrice} onChange={e => setEditForm(f => ({ ...f, originalPrice: e.target.value }))} placeholder="Ex: 350" className="w-full px-3 py-2.5 border border-[oklch(88%_0.01_175)] rounded-lg text-sm outline-none focus:border-[oklch(72%_0.15_65)] focus:ring-2 focus:ring-[oklch(95%_0.05_65)]" style={{ color: TEXT_PRIMARY }} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: TEXT_MUTED_LUXE }}>Période</label>
                        <input value={editForm.period} onChange={e => setEditForm(f => ({ ...f, period: e.target.value }))} className="w-full px-3 py-2.5 border border-[oklch(88%_0.01_175)] rounded-lg text-sm outline-none focus:border-[oklch(72%_0.15_65)] focus:ring-2 focus:ring-[oklch(95%_0.05_65)]" style={{ color: TEXT_PRIMARY }} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: TEXT_MUTED_LUXE }}>Description</label>
                        <input value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2.5 border border-[oklch(88%_0.01_175)] rounded-lg text-sm outline-none focus:border-[oklch(72%_0.15_65)] focus:ring-2 focus:ring-[oklch(95%_0.05_65)]" style={{ color: TEXT_PRIMARY }} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: TEXT_MUTED_LUXE }}>Fonctionnalités (séparées par virgules)</label>
                        <textarea value={editForm.features} onChange={e => setEditForm(f => ({ ...f, features: e.target.value }))} rows={3} className="w-full px-3 py-2.5 border border-[oklch(88%_0.01_175)] rounded-lg text-sm outline-none focus:border-[oklch(72%_0.15_65)] focus:ring-2 focus:ring-[oklch(95%_0.05_65)] resize-none" style={{ color: TEXT_PRIMARY }} />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => saveEdit(plan.id)} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50" style={{ background: GOLD, color: DARK }}>
                          {saving ? <div className="h-4 w-4 border-2 border-[#0a0f0d] border-t-transparent rounded-full animate-spin" /> : <><Check size={14} /> Enregistrer</>}
                        </button>
                        <button onClick={() => setEditingPlan(null)} className="px-4 py-2.5 rounded-xl text-sm font-medium border border-[oklch(88%_0.01_175)] hover:bg-gray-50 transition" style={{ color: TEXT_MUTED_LUXE }}>
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ===== DISPLAY MODE ===== */
                    <>
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-lg font-bold" style={{ color: TEXT_PRIMARY }}>{plan.name}</h3>
                          <p className="text-sm mt-1" style={{ color: TEXT_MUTED_LUXE }}>{plan.description}</p>
                        </div>
                        {isAdmin && (
                          <button onClick={() => startEdit(plan)} className="shrink-0 ml-2 p-2 rounded-lg border border-[oklch(88%_0.01_175)] hover:border-[oklch(72%_0.15_65)] hover:shadow-sm transition group" title="Modifier le prix">
                            <Edit size={14} style={{ color: TEXT_MUTED_LUXE }} className="group-hover:text-[oklch(72%_0.15_65)]" />
                          </button>
                        )}
                      </div>
                      <div className="my-5">
                        {hasDiscount && (
                          <span className="text-base line-through mr-2" style={{ color: TEXT_MUTED_LUXE }}>{formatPrice(plan.originalPrice!)}</span>
                        )}
                        <span className="text-3xl font-extrabold" style={{ color: hasDiscount ? DANGER : TEXT_PRIMARY }}>{formatPrice(plan.price)}</span>
                        <span className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>{plan.period}</span>
                      </div>
                      <ul className="space-y-3 mb-6">
                        {featureList.map(f => (
                          <li key={f} className="flex items-center gap-2 text-sm" style={{ color: TEXT_PRIMARY }}>
                            <CheckCircle size={14} style={{ color }} /> {f}
                          </li>
                        ))}
                      </ul>
                      <button
                        onClick={() => setCurrentView('create-school')}
                        className={`w-full py-3 rounded-xl text-sm font-semibold transition ${
                          plan.isPopular
                            ? 'edu-gold-cta'
                            : 'border border-[oklch(88%_0.01_175)] hover:border-[oklch(72%_0.15_65)] hover:shadow-sm'
                        }`}
                        style={plan.isPopular ? undefined : { color: TEXT_PRIMARY }}
                      >
                        {isCustom ? 'Nous contacter' : 'Commencer'}
                      </button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
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
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [showAdminPassword, setShowAdminPassword] = useState(false)
  const [form, setForm] = useState({
    name: '', shortName: '', email: '', phone: '', address: '', city: '',
    province: 'Kinshasa', country: 'RD Congo', description: '', schoolType: 'MIXTE',
    schoolCategory: 'PRIVEE', maxStudents: '200', establishmentYear: '', mission: '',
    subscriptionTier: 'FREEMIUM',
    adminName: '', adminEmail: '', adminPhone: '', adminPassword: '',
    latitude: null as number | null, longitude: null as number | null,
    logo: '',
  })

  const updateForm = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }))

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoUploading(true)
    try {
      // Client-side preview
      const reader = new FileReader()
      reader.onload = (ev) => setLogoPreview(ev.target?.result as string)
      reader.readAsDataURL(file)
      // Server upload
      const formData = new FormData()
      formData.append('file', file)
      formData.append('category', 'schools')
      const res = await authFetch('/api/upload', { method: 'POST', body: formData })
      const json = await res.json()
      if (json.url) updateForm('logo', json.url)
    } catch (err) {
      console.error('Logo upload error', err)
    } finally {
      setLogoUploading(false)
    }
  }

  async function handleSubmit() {
    if (!form.name || !form.shortName || !form.email || !form.phone || !form.city || !form.province || !form.country) {
      toast.error('Veuillez remplir tous les champs obligatoires')
      return
    }
    if (step === 1) { setStep(2); return }
    if (step === 2) {
      if (!form.adminName || !form.adminEmail) {
        toast.error('Veuillez remplir les informations du compte administrateur')
        return
      }
    }
    setLoading(true)
    try {
      const res = await fetch('/api/schools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          maxStudents: parseInt(form.maxStudents) || 200,
          establishmentYear: form.establishmentYear ? parseInt(form.establishmentYear) : null,
          latitude: form.latitude, longitude: form.longitude,
          logo: form.logo || null,
        }),
      })
      const json = await res.json()
      if (json.data?.school) {
        // Auto-login with admin credentials
        const loginRes = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.adminEmail, password: form.adminPassword || 'admin123' }),
        })
        const loginJson = await loginRes.json()
        if (loginJson.data) {
          const apiUser = loginJson.data
          const roleMap: Record<string, UserRole> = {
            SUPER_ADMIN_GLOBAL: 'SUPER_ADMIN_GLOBAL',
            SCHOOL_ADMIN: 'SUPER_ADMIN_GLOBAL',
            SECRETARY: 'SECRETARY',
            CASHIER: 'CASHIER',
            DIRECTION_MATERNELLE: 'DIRECTION_MATERNELLE',
            DIRECTION_PRIMAIRE: 'DIRECTION_PRIMAIRE',
            DIRECTION_SECONDAIRE: 'DIRECTION_SECONDAIRE',
            DISCIPLINE_MATERNELLE: 'DISCIPLINE_MATERNELLE',
            DISCIPLINE_PRIMAIRE: 'DISCIPLINE_PRIMAIRE',
            DISCIPLINE_SECONDAIRE: 'DISCIPLINE_SECONDAIRE',
            TEACHER: 'TEACHER',
            HEAD_TEACHER: 'HEAD_TEACHER',
            PARENT: 'PARENT',
          }
          const role = roleMap[apiUser.role] || 'SUPER_ADMIN_GLOBAL'
          login(role, {
            id: apiUser.id, name: apiUser.name, role,
            schoolId: apiUser.schoolId, schoolName: json.data.school.name,
            initials: form.adminName.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase(),
            profileImageUrl: null,
          }, loginJson.data.token)
          toast.success('École crée avec succès ! Bienvenue !')
          setStep(3)
        } else {
          toast.success('École crée ! Connectez-vous avec vos identifiants.')
          setCurrentView('login')
        }
      } else {
        toast.error(json.error || 'Erreur lors de la création')
      }
    } catch (e) {
      toast.error('Erreur réseau')
    } finally {
      setLoading(false)
    }
  }

  // Success screen
  if (step === 3) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'linear-gradient(160deg, #0a0f0d 0%, #0b1613 40%, #0d1f1a 100%)' }}>
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 rounded-full mx-auto mb-6 grid place-items-center" style={{ background: 'oklch(60% 0.15 145)' }}>
            <CheckCircle size={40} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">École crée avec succès !</h1>
          <p className="text-white/60 mb-8">Votre école <strong className="text-[#f5a623]">{form.name}</strong> est prête. Vous êtes maintenant connecté en tant qu&apos;administrateur.</p>
          <button onClick={() => setCurrentView('dashboard')} className="bg-[#f5a623] hover:bg-[#ffb643] text-[#0a0f0d] px-8 py-3 rounded-xl font-bold text-sm transition-all shadow-[0_10px_20px_rgba(245,166,35,0.2)]">
            Accéder au tableau de bord
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(160deg, #0a0f0d 0%, #0b1613 40%, #0d1f1a 100%)' }}>
      {/* Nav */}
      <nav className="relative z-50 flex items-center justify-between px-6 sm:px-8 py-5">
        <button onClick={() => setCurrentView('home')} className="flex items-center"><BrandMark height={48} className="brightness-110" /></button>
        <button onClick={() => setCurrentView('login')} className="text-white/50 hover:text-white text-sm font-medium transition flex items-center gap-2">
          <ArrowLeft size={16} /> Retour
        </button>
      </nav>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-2xl">
          {/* Step indicator */}
          <div className="flex items-center gap-3 mb-8">
            {[
              { n: 1, label: 'Informations' },
              { n: 2, label: 'Compte admin' },
            ].map(s => (
              <div key={s.n} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full grid place-items-center text-xs font-bold transition ${step >= s.n ? 'bg-[#f5a623] text-[#0a0f0d]' : 'bg-white/10 text-white/40'}`}>{s.n}</div>
                <span className={`text-xs font-medium ${step >= s.n ? 'text-white' : 'text-white/40'}`}>{s.label}</span>
                {s.n < 2 && <div className={`w-12 h-px ${step > s.n ? 'bg-[#f5a623]' : 'bg-white/10'}`} />}
              </div>
            ))}
          </div>

          <div className="rounded-2xl p-6 sm:p-8" style={{ background: 'rgba(26, 37, 32, 0.4)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255, 255, 255, 0.08)', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.4)' }}>
            {step === 1 && (
              <>
                <h2 className="text-xl font-bold text-white mb-1">Créer votre école</h2>
                <p className="text-white/50 text-sm mb-6">Renseignez les informations de votre établissement</p>

                {/* Logo upload */}
                <div className="mb-6 flex items-center gap-4">
                  <label className="w-20 h-20 rounded-xl border-2 border-dashed border-white/20 hover:border-[#f5a623]/50 flex items-center justify-center cursor-pointer transition group overflow-hidden">
                    {logoPreview ? (
                      <img src={logoPreview} alt="Logo" className="w-full h-full object-cover rounded-xl" />
                    ) : logoUploading ? (
                      <div className="h-5 w-5 border-2 border-white/30 border-t-[#f5a623] rounded-full animate-spin" />
                    ) : (
                      <div className="text-center text-white/30 group-hover:text-white/50 transition">
                        <ImagePlus size={20} />
                        <span className="text-[9px] block mt-1">Logo</span>
                      </div>
                    )}
                    <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                  </label>
                  <div className="text-xs text-white/40">Logo de l&apos;école<br /><span className="text-white/25">JPG, PNG max 5MB</span></div>
                </div>

                {/* Auto-geolocation map */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin size={14} className="text-[#f5a623]" />
                    <label className="text-xs font-medium text-white/60">Localisation automatique</label>
                    <span className="text-[10px] text-[#f5a623]/70">• Cliquez sur la carte ou activez la géolocalisation</span>
                  </div>
                  <div className="rounded-xl overflow-hidden border border-white/10">
                    <SchoolMap
                      latitude={form.latitude}
                      longitude={form.longitude}
                      onLocationChange={(lat, lng, address) => {
                        setForm(prev => ({
                          ...prev,
                          latitude: lat,
                          longitude: lng,
                          ...(address ? {
                            address: address.address || prev.address,
                            city: address.city || prev.city,
                            province: address.province || prev.province,
                            country: address.country || prev.country,
                          } : {}),
                        }))
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-white/60 mb-1.5 block">Nom de l&apos;école *</label>
                    <input value={form.name} onChange={e => updateForm('name', e.target.value)} placeholder="Ex: Complexe Scolaire Lumière" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#f5a623]/50 transition" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/60 mb-1.5 block">Sigle *</label>
                    <input value={form.shortName} onChange={e => updateForm('shortName', e.target.value)} placeholder="Ex: CSL" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#f5a623]/50 transition" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/60 mb-1.5 block">Email *</label>
                    <input type="email" value={form.email} onChange={e => updateForm('email', e.target.value)} placeholder="contact@ecole.cd" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#f5a623]/50 transition" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/60 mb-1.5 block">Téléphone *</label>
                    <input value={form.phone} onChange={e => updateForm('phone', e.target.value)} placeholder="+243 81 234 56 78" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#f5a623]/50 transition" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/60 mb-1.5 block">Adresse</label>
                    <input value={form.address} onChange={e => updateForm('address', e.target.value)} placeholder="Auto-remplie par la carte" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#f5a623]/50 transition" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/60 mb-1.5 block">Ville *</label>
                    <input value={form.city} onChange={e => updateForm('city', e.target.value)} placeholder="Auto-remplie par la carte" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#f5a623]/50 transition" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/60 mb-1.5 block">Province *</label>
                    <input value={form.province} onChange={e => updateForm('province', e.target.value)} placeholder="Auto-remplie par la carte" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#f5a623]/50 transition" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/60 mb-1.5 block">Pays *</label>
                    <input value={form.country} onChange={e => updateForm('country', e.target.value)} placeholder="Auto-remplie par la carte" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#f5a623]/50 transition" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/60 mb-1.5 block">Type</label>
                    <select value={form.schoolType} onChange={e => updateForm('schoolType', e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#f5a623]/50 transition appearance-none cursor-pointer">
                      <option value="MIXTE" className="bg-[#0a0f0d]">Mixte</option>
                      <option value="FILLES" className="bg-[#0a0f0d]">Filles</option>
                      <option value="GARCONS" className="bg-[#0a0f0d]">Garçons</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/60 mb-1.5 block">Catégorie</label>
                    <select value={form.schoolCategory} onChange={e => updateForm('schoolCategory', e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#f5a623]/50 transition appearance-none cursor-pointer">
                      <option value="PRIVEE" className="bg-[#0a0f0d]">Privée</option>
                      <option value="PUBLIQUE" className="bg-[#0a0f0d]">Publique</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/60 mb-1.5 block">Capacité max</label>
                    <input type="number" value={form.maxStudents} onChange={e => updateForm('maxStudents', e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#f5a623]/50 transition" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-white/60 mb-1.5 block">Description</label>
                    <textarea value={form.description} onChange={e => updateForm('description', e.target.value)} rows={3} placeholder="Décrivez votre école..." className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#f5a623]/50 transition resize-none" />
                  </div>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="text-xl font-bold text-white mb-1">Compte administrateur</h2>
                <p className="text-white/50 text-sm mb-6">Créez votre compte pour gérer l&apos;école</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-white/60 mb-1.5 block">Nom complet *</label>
                    <input value={form.adminName} onChange={e => updateForm('adminName', e.target.value)} placeholder="Jean Mukendi" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#f5a623]/50 transition" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/60 mb-1.5 block">Email *</label>
                    <input type="email" value={form.adminEmail} onChange={e => updateForm('adminEmail', e.target.value)} placeholder="admin@ecole.cd" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#f5a623]/50 transition" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/60 mb-1.5 block">Téléphone</label>
                    <input value={form.adminPhone} onChange={e => updateForm('adminPhone', e.target.value)} placeholder="+243 81 234 56 78" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#f5a623]/50 transition" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium text-white/60 mb-1.5 block">Mot de passe</label>
                    <div className="relative">
                      <input type={showAdminPassword ? 'text' : 'password'} value={form.adminPassword} onChange={e => updateForm('adminPassword', e.target.value)} placeholder="Laissez vide pour le mot de passe par défaut" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-11 text-white text-sm outline-none focus:border-[#f5a623]/50 transition" />
                      <button type="button" onClick={() => setShowAdminPassword(!showAdminPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition p-1">
                        {showAdminPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Subscription tier selector */}
                <div className="mt-6">
                  <label className="text-xs font-medium text-white/60 mb-3 block">Formule d&apos;abonnement</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {SUBSCRIPTION_TIERS.slice(0, 5).map(tier => (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => updateForm('subscriptionTier', tier)}
                        className={`p-3 rounded-xl border text-left transition ${form.subscriptionTier === tier ? 'border-[#f5a623]/50 bg-[#f5a623]/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                      >
                        <div className="text-sm font-bold text-white">{getSubscriptionLabel(tier)}</div>
                        <div className="text-xs text-white/40 mt-0.5">{getSubscriptionPrice(tier)}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between mt-8">
              {step > 1 && (
                <button onClick={() => setStep((step - 1) as 1 | 2)} className="text-white/50 hover:text-white text-sm font-medium transition flex items-center gap-2">
                  <ArrowLeft size={16} /> Retour
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="bg-[#f5a623] hover:bg-[#ffb643] text-[#0a0f0d] px-8 py-3 rounded-xl font-bold text-sm transition-all shadow-[0_10px_20px_rgba(245,166,35,0.2)] disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? <><div className="h-4 w-4 border-2 border-[#0a0f0d] border-t-transparent rounded-full animate-spin" /> Création...</> : step === 1 ? 'Suivant' : 'Créer l\'école'}
              </button>
            </div>
          </div>
        </div>
      </main>
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
  const [showPassword, setShowPassword] = useState(false)
  const [showWhatsappModal, setShowWhatsappModal] = useState(false)
  const [waPhone, setWaPhone] = useState('')
  const [waCode, setWaCode] = useState('')
  const [waStep, setWaStep] = useState<'phone' | 'code'>('phone')
  const [waLoading, setWaLoading] = useState(false)
  const [typewriterLine1, setTypewriterLine1] = useState('')
  const [typewriterLine2, setTypewriterLine2] = useState('')
  const [typewriterActiveLine, setTypewriterActiveLine] = useState<1 | 2 | null>(1)

  // Vérifie que le rôle correspond à l'onglet sélectionné
  function validateRoleForTab(role: UserRole | null): { valid: boolean; message?: string } {
    if (!role) return { valid: false, message: 'Rôle non reconnu. Contactez l\'administration.' }
    if (role === 'SUPER_ADMIN_GLOBAL') return { valid: true }
    if (tab === 'parent') {
      if (role !== 'PARENT') {
        return { valid: false, message: 'Ce compte n\'est pas un compte parent. Veuillez utiliser l\'onglet Administration.' }
      }
    } else {
      if (role === 'PARENT') {
        return { valid: false, message: 'Ce compte est un compte parent. Veuillez utiliser l\'onglet Parent.' }
      }
    }
    return { valid: true }
  }

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
        const validation = validateRoleForTab(role)
        if (!validation.valid) {
          toast.error(validation.message || 'Accès non autorisé pour ce type de compte.')
          return
        }
        if (role) {
          login(role, {
            id: apiUser.id,
            name: apiUser.name,
            role,
            schoolId: apiUser.schoolId,
            schoolName: apiUser.school?.name || 'EduGest',
            initials: getInitials(apiUser.name),
            profileImageUrl: apiUser.profileImageUrl || null,
            subjectName: apiUser.subjectName || null,
            classNames: apiUser.classNames || null,
            isTitulaire: apiUser.isTitulaire || false,
          }, json.data.token)
          toast.success(`Bienvenue, ${apiUser.name}!`)
          return
        }
      }
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
      SCHOOL_ADMIN: 'SUPER_ADMIN_GLOBAL',
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

  // Typewriter animation — same as hero
  useEffect(() => {
    const title1 = "Rejoignez"
    const title2 = "l'excellence éducative"
    let charIndex = 0
    let currentLine = 1
    let timeoutId: ReturnType<typeof setTimeout>

    function type() {
      if (currentLine === 1) {
        if (charIndex < title1.length) {
          setTypewriterLine1(title1.substring(0, charIndex + 1))
          setTypewriterActiveLine(1)
          charIndex++
          timeoutId = setTimeout(type, 80 + Math.random() * 60)
        } else {
          currentLine = 2
          charIndex = 0
          setTypewriterActiveLine(2)
          timeoutId = setTimeout(type, 400)
        }
      } else {
        if (charIndex < title2.length) {
          setTypewriterLine2(title2.substring(0, charIndex + 1))
          setTypewriterActiveLine(2)
          charIndex++
          timeoutId = setTimeout(type, 80 + Math.random() * 60)
        } else {
          setTypewriterActiveLine(2)
          setTimeout(() => setTypewriterActiveLine(null), 1500)
        }
      }
    }

    timeoutId = setTimeout(type, 800)
    return () => clearTimeout(timeoutId)
  }, [])

  // Floating parallax icons — full screen, same as hero
  useEffect(() => {
    const container = document.getElementById('login-parallax-container')
    if (!container) return

    const educationIcons = [
      '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>',
      '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>',
      '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>',
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>',
      '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>',
      '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>',
      '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>',
      '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18h8"></path><path d="M3 22h18"></path><path d="M14 22a7 7 0 1 0 0-14h-1"></path><path d="M9 14h2"></path><path d="M9 12a2 2 0 1 1-4 0V7a2 2 0 1 1 4 0v5Z"></path><path d="M12 7V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4"></path></svg>',
    ]

    const elements: { el: HTMLDivElement; x: number; y: number; originX: number; originY: number; vx: number; vy: number; depth: number; scale: number; rotation: number; rotationSpeed: number; phase: number }[] = []
    const numIcons = 20
    let mouseX = window.innerWidth / 2
    let mouseY = window.innerHeight / 2
    let targetMouseX = mouseX
    let targetMouseY = mouseY
    let animFrameId: number

    for (let i = 0; i < numIcons; i++) {
      const el = document.createElement('div')
      el.style.position = 'absolute'
      el.style.pointerEvents = 'none'
      el.style.userSelect = 'none'
      el.style.zIndex = '1'
      el.style.willChange = 'transform'
      el.innerHTML = educationIcons[i % educationIcons.length]

      const startX = Math.random() * window.innerWidth
      const startY = Math.random() * (window.innerHeight * 0.9)
      const depth = 0.02 + Math.random() * 0.1
      const sizeScale = 0.7 + Math.random() * 1.3

      const colorRoll = Math.random()
      if (colorRoll > 0.85) el.style.color = '#f5a623'
      else if (colorRoll > 0.70) el.style.color = '#10b981'
      else el.style.color = 'rgba(255,255,255,0.25)'

      el.style.opacity = (0.05 + Math.random() * 0.15).toString()

      container.appendChild(el)
      elements.push({
        el, x: startX, y: startY, originX: startX, originY: startY,
        vx: 0, vy: 0, depth, scale: sizeScale,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 0.3,
        phase: Math.random() * Math.PI * 2,
      })
    }

    // Fade icons in
    setTimeout(() => {
      elements.forEach(item => {
        const baseOp = parseFloat(item.el.style.opacity)
        item.el.style.opacity = (baseOp * 1.5).toString()
      })
    }, 500)

    const handleMouseMove = (e: MouseEvent) => {
      targetMouseX = e.clientX
      targetMouseY = e.clientY
    }
    window.addEventListener('mousemove', handleMouseMove)

    function lerp(start: number, end: number, amt: number) {
      return (1 - amt) * start + amt * end
    }

    function update() {
      mouseX = lerp(mouseX, targetMouseX, 0.08)
      mouseY = lerp(mouseY, targetMouseY, 0.08)
      const time = Date.now() * 0.001

      elements.forEach(item => {
        const dx = targetMouseX - (item.x + (targetMouseX - window.innerWidth / 2) * item.depth)
        const dy = targetMouseY - (item.y + (targetMouseY - window.innerHeight / 2) * item.depth)
        const dist = Math.sqrt(dx * dx + dy * dy)
        const mouseRange = 400
        const attractionStrength = 0.08

        if (dist < mouseRange) {
          const force = (1 - dist / mouseRange) * attractionStrength
          item.vx += dx * force * 0.2
          item.vy += dy * force * 0.2
        }

        item.vx += (item.originX - item.x) * 0.01
        item.vy += (item.originY - item.y) * 0.01
        item.vx *= 0.92
        item.vy *= 0.92
        item.x += item.vx
        item.y += item.vy

        const driftX = Math.sin(time + item.phase) * 0.6
        const driftY = Math.cos(time + item.phase * 0.7) * 0.6
        const px = (mouseX - window.innerWidth / 2) * item.depth
        const py = (mouseY - window.innerHeight / 2) * item.depth
        item.rotation += item.rotationSpeed

        item.el.style.transform = `translate3d(${item.x + px + driftX}px, ${item.y + py + driftY}px, 0) rotate(${item.rotation}deg) scale(${item.scale})`
      })

      animFrameId = requestAnimationFrame(update)
    }
    update()

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      cancelAnimationFrame(animFrameId)
      while (container.firstChild) container.removeChild(container.firstChild)
    }
  }, [])

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ background: 'linear-gradient(160deg, #0a0f0d 0%, #0b1613 40%, #0d1f1a 100%)' }}>
      {/* Full-screen parallax floating icons — same as hero */}
      <div id="login-parallax-container" className="absolute inset-0 pointer-events-none overflow-hidden z-0" />
      {/* Gradient overlays */}
      <div className="absolute bottom-0 left-0 w-full h-48 bg-gradient-to-t from-[#0a0f0d] via-[#0b1613]/50 to-transparent pointer-events-none z-10" />
      <div className="absolute top-0 right-0 w-[500px] h-[500px] opacity-15 pointer-events-none z-0" style={{ background: 'radial-gradient(circle, rgba(245, 166, 35, 0.3), transparent 70%)' }} />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] opacity-10 pointer-events-none z-0" style={{ background: 'radial-gradient(circle, rgba(16, 185, 129, 0.2), transparent 70%)' }} />

      {/* Top nav bar */}
      <nav className="relative z-50 flex items-center justify-between px-6 sm:px-8 md:px-16 py-5 w-full">
        <button onClick={() => setCurrentView('home')} className="flex items-center shrink-0 min-w-max">
          <BrandMark height={48} className="brightness-110 hover:scale-105 transition-all duration-300" />
        </button>
        <button onClick={() => setCurrentView('home')} className="text-gray-400 hover:text-white transition-colors text-xs font-bold uppercase tracking-[0.2em] flex items-center gap-1.5">
          <ArrowLeft size={14} /> Retour
        </button>
      </nav>

      {/* Main content: typewriter title + glass login card */}
      <main className="relative z-20 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-4 sm:py-8 gap-8 sm:gap-10">
        {/* Typewriter title — same as hero */}
        <div className="text-center flex flex-col items-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-white leading-[1.05] tracking-tighter mb-4 sm:mb-5 relative inline-block mx-auto select-none" style={{ minHeight: '120px' }}>
            <span className="inline-block relative">{typewriterLine1}{typewriterActiveLine === 1 && <span className="animate-pulse">|</span>}</span>
            <br />
            <span className="italic font-playfair inline-block relative" style={{ color: '#f5a623', textShadow: '0 0 25px rgba(245, 166, 35, 0.5), 0 0 50px rgba(245, 166, 35, 0.2)' }}>{typewriterLine2}{typewriterActiveLine === 2 && <span className="animate-pulse">|</span>}</span>
          </h1>
          <p className="text-gray-300 text-sm sm:text-base md:text-lg max-w-lg mx-auto font-medium leading-relaxed opacity-80">
            La plateforme africaine de gestion scolaire qui connecte écoles, familles et enseignants.
          </p>
        </div>

        {/* Glass morphism login card */}
        <div className="w-full max-w-[440px] rounded-2xl p-6 sm:p-8" style={{ background: 'rgba(26, 37, 32, 0.55)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255, 255, 255, 0.1)', boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.5), 0 0 80px rgba(245, 166, 35, 0.05)' }}>
          {/* Tab switcher */}
          <div className="flex rounded-xl p-1 mb-6" style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <button onClick={() => setTab('parent')} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${tab === 'parent' ? 'text-[#0a0f0d] shadow-lg' : 'text-white/60 hover:text-white/80'}`} style={tab === 'parent' ? { background: '#f5a623', boxShadow: '0 4px 16px rgba(245, 166, 35, 0.35)' } : undefined}>
              Parent
            </button>
            <button onClick={() => setTab('admin')} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${tab === 'admin' ? 'text-[#0a0f0d] shadow-lg' : 'text-white/60 hover:text-white/80'}`} style={tab === 'admin' ? { background: '#f5a623', boxShadow: '0 4px 16px rgba(245, 166, 35, 0.35)' } : undefined}>
              Administration
            </button>
          </div>

          <div className="mb-5">
            <h2 className="text-xl font-bold text-white tracking-tight mb-1">
              {tab === 'parent' ? 'Connexion Parent' : 'Connexion Administration'}
            </h2>
            <p className="text-sm text-white/50">
              {tab === 'parent' ? 'Accédez au suivi scolaire de vos enfants' : 'Personnel de l\'école, direction, enseignants'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-white/70">{tab === 'parent' ? 'Email ou numéro WhatsApp' : 'Email professionnel'}</label>
              <input
                type="text" value={email} onChange={e => setEmail(e.target.value)}
                placeholder={tab === 'parent' ? 'ex. parent@email.com ou +243 81...' : 'ex. direction@ecole.cd'}
                className="w-full px-4 py-3.5 rounded-xl text-sm text-white outline-none transition focus:ring-[3px] focus:ring-[rgba(245,166,35,0.2)] focus:border-[rgba(245,166,35,0.5)]"
                style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-white/70">Mot de passe</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3.5 pr-11 rounded-xl text-sm text-white outline-none transition focus:ring-[3px] focus:ring-[rgba(245,166,35,0.2)] focus:border-[rgba(245,166,35,0.5)]"
                  style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition p-1"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <label className="flex items-center gap-2 cursor-pointer text-white/50">
                <input type="checkbox" className="accent-[#f5a623] rounded" /> Se souvenir de moi
              </label>
              <button type="button" className="font-medium hover:underline text-[#f5a623]/80 hover:text-[#f5a623]">Mot de passe oublié ?</button>
            </div>
            <button type="submit" disabled={loading} className="w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-all hover:shadow-[0_0_30px_rgba(245,166,35,0.4)] active:scale-[0.98]" style={{ background: '#f5a623', color: '#0a0f0d', boxShadow: '0 4px 16px rgba(245, 166, 35, 0.25)' }}>
              {loading ? <div className="h-4 w-4 border-2 border-[#0a0f0d] border-t-transparent rounded-full animate-spin" /> : 'Se connecter'}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5 text-xs uppercase tracking-wider text-white/40">
            <div className="flex-1 h-px bg-white/10" /> ou <div className="flex-1 h-px bg-white/10" />
          </div>

          <button
            onClick={() => { setShowWhatsappModal(true); setWaStep('phone'); setWaPhone(''); setWaCode('') }}
            className="w-full py-3.5 rounded-xl text-white font-medium text-sm flex items-center justify-center gap-2 transition hover:opacity-90 hover:shadow-lg"
            style={{ background: 'oklch(60% 0.15 145)', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)' }}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> Se connecter avec WhatsApp
          </button>

          <p className="text-center text-[13px] mt-5 text-white/50">
            Pas encore de compte ? <button onClick={() => setCurrentView('create-school')} className="font-medium hover:underline text-[#f5a623]/80 hover:text-[#f5a623]">Créer mon école</button>
          </p>
        </div>

        {/* Trust indicators below form */}
        <div className="flex items-center gap-6 sm:gap-8 text-white/30 text-xs font-medium">
          <div className="flex items-center gap-1.5"><Shield size={14} /> Sécurisé</div>
          <div className="flex items-center gap-1.5"><Globe size={14} /> Afrique</div>
          <div className="flex items-center gap-1.5"><Award size={14} /> Certifié</div>
        </div>
      </main>

      {/* Footer */}
      <div className="relative z-20 text-center text-[13px] text-white/30 py-5">
        © 2026 EduGest · Kinshasa · Dakar · Abidjan
      </div>

      {/* WhatsApp Login Modal */}
      {showWhatsappModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowWhatsappModal(false)}>
          <div className="rounded-2xl p-6 w-full max-w-sm shadow-2xl" style={{ background: 'rgba(26, 37, 32, 0.9)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255, 255, 255, 0.1)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl grid place-items-center" style={{ background: SUCCESS }}>
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="white">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">WhatsApp</h2>
                  <p className="text-xs text-white/50">Connexion sécurisée</p>
                </div>
              </div>
              <button onClick={() => setShowWhatsappModal(false)} className="text-white/50 hover:text-white transition"><X size={18} /></button>
            </div>

            {waStep === 'phone' ? (
              <div className="space-y-4">
                <p className="text-sm text-white/60">Entrez votre numéro WhatsApp pour recevoir un code de vérification.</p>
                <div>
                  <label className="text-[13px] font-medium text-white/70">Numéro WhatsApp</label>
                  <div className="flex items-center gap-2 mt-1 px-3 py-3 rounded-xl focus-within:ring-[3px] focus-within:ring-[rgba(245,166,35,0.2)] focus-within:border-[rgba(245,166,35,0.5)]" style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    <Phone size={16} className="text-white/40" />
                    <input
                      type="tel"
                      placeholder="+243 81 234 56 78"
                      value={waPhone}
                      onChange={e => setWaPhone(e.target.value)}
                      className="flex-1 border-0 outline-none text-sm bg-transparent text-white placeholder-white/30"
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
                <p className="text-sm text-white/60">Entrez le code à 6 chiffres envoyé au <strong className="text-white">{waPhone}</strong></p>
                <div>
                  <label className="text-[13px] font-medium text-white/70">Code de vérification</label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="000000"
                    value={waCode}
                    onChange={e => setWaCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full mt-1 px-4 py-3.5 rounded-xl text-center text-2xl font-bold tracking-[0.5em] outline-none focus:ring-[3px] focus:ring-[rgba(245,166,35,0.2)] text-white"
                    style={{ background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.1)' }}
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
                        const validation = validateRoleForTab(role)
                        if (!validation.valid) {
                          toast.error(validation.message || 'Accès non autorisé pour ce type de compte.')
                          return
                        }
                        if (role) {
                          login(role, {
                            id: apiUser.id,
                            name: apiUser.name,
                            role,
                            schoolId: apiUser.schoolId,
                            schoolName: apiUser.school?.name || 'EduGest',
                            initials: getInitials(apiUser.name),
                            profileImageUrl: apiUser.profileImageUrl || null,
                          }, json.data.token)
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
                  className="w-full text-sm font-medium py-2 hover:underline text-[#f5a623]/80 hover:text-[#f5a623]"
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
      { icon: <Building2 size={16} />, label: 'Écoles', view: 'schools' },
      { icon: <UsersRound size={16} />, label: 'Personnel', view: 'personnel' as ViewType },
      { icon: <Users size={16} />, label: 'Élèves', view: 'students' },
      { icon: <School size={16} />, label: 'Classes', view: 'classes' },
      { icon: <BookOpen size={16} />, label: 'Notes', view: 'grades' },
      { icon: <CreditCard size={16} />, label: 'Paiements', view: 'payments' },
      { icon: <CheckCircle size={16} />, label: 'Vérification paiements', view: 'payment-verification' as ViewType },
      { icon: <CreditCard size={16} />, label: 'Config. Paiements', view: 'payment-config' as ViewType },
      { icon: <DollarSign size={16} />, label: 'Tarifs', view: 'pricing' as ViewType },
      { icon: <Shield size={16} />, label: 'Discipline', view: 'discipline' },
      { icon: <MessageSquare size={16} />, label: 'Communications', view: 'communications' },
      { icon: <PenTool size={16} />, label: 'Devoirs', view: 'homework' },
      { icon: <ListChecks size={16} />, label: 'Passage de classe', view: 'class-passing' },
      { icon: <FileText size={16} />, label: 'Bulletins', view: 'bulletin' },
      { icon: <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>, label: 'Connexion WhatsApp', view: 'whatsapp-config' as ViewType },
      { icon: <Settings size={16} />, label: 'Paramètres', view: 'settings' as ViewType },
      { icon: <UserCircle size={16} />, label: 'Mon profil', view: 'profile' },
    ],
    SECRETARY: [
      { icon: <LayoutDashboard size={16} />, label: 'Dashboard', view: 'dashboard' },
      { icon: <Users size={16} />, label: 'Élèves', view: 'students' },
      { icon: <MessageSquare size={16} />, label: 'Communications', view: 'communications' },
      { icon: <CreditCard size={16} />, label: 'Paiements', view: 'payments' },
      { icon: <CheckCircle size={16} />, label: 'Vérification paiements', view: 'payment-verification' as ViewType },
      { icon: <ListChecks size={16} />, label: 'Passage de classe', view: 'class-passing' },
      { icon: <Settings size={16} />, label: 'Paramètres', view: 'settings' as ViewType },
      { icon: <UserCircle size={16} />, label: 'Mon profil', view: 'profile' },
    ],
    CASHIER: [
      { icon: <LayoutDashboard size={16} />, label: 'Dashboard', view: 'dashboard' },
      { icon: <CreditCard size={16} />, label: 'Enregistrer paiement', view: 'payments' },
      { icon: <CheckCircle size={16} />, label: 'Vérification paiements', view: 'payment-verification' as ViewType },
      { icon: <AlertTriangle size={16} />, label: 'Dettes', view: 'debts' as ViewType },
      { icon: <BarChart3 size={16} />, label: 'Situation financière', view: 'payments' },
      { icon: <MessageSquare size={16} />, label: 'Communications', view: 'communications' },
      { icon: <UserCircle size={16} />, label: 'Mon profil', view: 'profile' },
    ],
    PARENT: [
      { icon: <Users size={16} />, label: 'Mes enfants', view: 'dashboard' },
      { icon: <BookOpen size={16} />, label: 'Notes', view: 'grades' },
      { icon: <FileText size={16} />, label: 'Bulletins', view: 'bulletin' },
      { icon: <CreditCard size={16} />, label: 'Payer en ligne', view: 'online-payment' as ViewType },
      { icon: <CheckCircle size={16} />, label: 'Vérifier reçu', view: 'payment-verification' as ViewType },
      { icon: <Shield size={16} />, label: 'Discipline', view: 'discipline' },
      { icon: <PenTool size={16} />, label: 'Devoirs', view: 'homework' },
      { icon: <MessageSquare size={16} />, label: 'Communications', view: 'communications' },
      { icon: <Star size={16} />, label: 'Avis école', view: 'school-reviews' as ViewType },
      { icon: <UserCircle size={16} />, label: 'Mon profil', view: 'profile' },
    ],
    TEACHER: [
      { icon: <LayoutDashboard size={16} />, label: 'Dashboard', view: 'dashboard' },
      { icon: <School size={16} />, label: 'Mes Classes', view: 'classes' },
      { icon: <BookOpen size={16} />, label: 'Notes', view: 'grades' },
      { icon: <PenTool size={16} />, label: 'Devoirs', view: 'homework' },
      { icon: <MessageSquare size={16} />, label: 'Communications', view: 'communications' },
      { icon: <UserCircle size={16} />, label: 'Mon profil', view: 'profile' },
    ],
    HEAD_TEACHER: [
      { icon: <LayoutDashboard size={16} />, label: 'Dashboard', view: 'dashboard' },
      { icon: <School size={16} />, label: 'Ma Classe', view: 'classes' },
      { icon: <FileText size={16} />, label: 'Bulletins', view: 'bulletin' },
      { icon: <MessageSquare size={16} />, label: 'Communications', view: 'communications' },
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
      { icon: <MessageSquare size={16} />, label: 'Communications', view: 'communications' },
      { icon: <UserCircle size={16} />, label: 'Mon profil', view: 'profile' },
    ]
  }

  if (disciplineRoles.includes(userRole as UserRole)) {
    menuItems = [
      { icon: <LayoutDashboard size={16} />, label: 'Dashboard', view: 'dashboard' },
      { icon: <Ban size={16} />, label: 'Liste Noire', view: 'discipline' },
      { icon: <AlertTriangle size={16} />, label: 'Liste Grise', view: 'discipline' },
      { icon: <Heart size={16} />, label: 'Liste Blanche', view: 'discipline' },
      { icon: <MessageSquare size={16} />, label: 'Communications', view: 'communications' },
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
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] font-medium transition relative ${
                  currentView === item.view
                    ? 'text-[oklch(72%_0.15_65)] font-semibold'
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
function Topbar({ sidebarVisible, onToggleSidebar }: { sidebarVisible: boolean; onToggleSidebar: () => void }) {
  const { currentView, sidebarOpen, setSidebarOpen, setCurrentView, userData, userRole } = useEduGestStore()
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadNotifCount, setUnreadNotifCount] = useState(0)
  const [pendingCommsCount, setPendingCommsCount] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)

  const adminRoles = ['SUPER_ADMIN_GLOBAL', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE', 'SECRETARY']
  const showPendingComms = adminRoles.includes(userRole || '')

  const totalUnread = unreadNotifCount + (showPendingComms ? pendingCommsCount : 0)

  useEffect(() => {
    if (!userData?.id) return;
    const load = () => authFetch('/api/notifications?limit=20').then(r => r.json()).then(j => {
      setNotifications(j.data || []);
      setUnreadNotifCount(j.unreadCount || 0);
    }).catch(() => {});
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [userData?.id]);

  useEffect(() => {
    if (!userData?.id || !showPendingComms) return;
    const loadComms = () => {
      const schoolParam = userData?.schoolId ? `&schoolId=${userData.schoolId}` : ''
      authFetch(`/api/communications?limit=100${schoolParam}`).then(r => r.json()).then(j => {
        const data = j.data || []
        setPendingCommsCount(data.filter((c: any) => c.status === 'PENDING').length)
      }).catch(() => {})
    }
    loadComms()
    const interval = setInterval(loadComms, 30000)
    return () => clearInterval(interval)
  }, [userData?.id, userData?.schoolId, showPendingComms])

  const viewTitles: Record<string, string> = {
    dashboard: 'Dashboard', students: 'Élèves', classes: 'Classes', grades: 'Notes',
    payments: 'Paiements', discipline: 'Discipline', communications: 'Communications',
    homework: 'Devoirs', profile: 'Mon profil', pricing: 'Tarifs', 'class-passing': 'Passage de classe',
    bulletin: 'Bulletins', convocation: 'Convocation', schools: 'Écoles',
    'admin-analytics': 'Statistiques', 'whatsapp-config': 'Connexion WhatsApp',
    personnel: 'Personnel', settings: 'Paramètres', 'school-reviews': 'Avis',
    'payment-verification': 'Vérification', 'payment-config': 'Config. Paiement',
    'online-payment': 'Payer en ligne',
    'debts': 'Dettes',
  }

  return (
    <header className="sticky top-0 z-20 h-16 flex items-center justify-between px-4 sm:px-6" style={{ background: IVORY }}>
      <div className="flex items-center gap-4">
        <button className="lg:hidden p-2 rounded-lg hover:bg-white/60 transition" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <button
          onClick={onToggleSidebar}
          className="hidden lg:flex p-2 rounded-lg hover:bg-white/60 transition items-center gap-1.5"
          title={sidebarVisible ? 'Masquer le menu' : 'Afficher le menu'}
        >
          {sidebarVisible ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
        <div>
          <div className="text-lg font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>{viewTitles[currentView] || 'Dashboard'}</div>
          <div className="text-xs hidden sm:block" style={{ color: TEXT_MUTED_LUXE }}>EduGest · {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowNotifications(!showNotifications)}
          className="relative p-2 rounded-lg hover:bg-white/60 transition"
        >
          <Bell size={18} style={{ color: TEXT_MUTED_LUXE }} />
          {totalUnread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-[oklch(60%_0.25_25)] text-white text-[10px] font-bold px-1 rounded-full">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </button>
      </div>
    </header>
  )
}

// ===== DASHBOARD LAYOUT =====
function DashboardLayout() {
  const [sidebarVisible, setSidebarVisible] = useState(true)
  return (
    <div className={`min-h-screen grid grid-cols-1 ${sidebarVisible ? 'lg:grid-cols-[240px_1fr]' : ''}`} style={{ background: IVORY }}>
      {sidebarVisible && <Sidebar />}
      <div className="flex flex-col min-w-0">
        <Topbar sidebarVisible={sidebarVisible} onToggleSidebar={() => setSidebarVisible(v => !v)} />
        <main className="flex-1 p-6 sm:p-8 overflow-y-auto">
          <MainContent />
        </main>
      </div>
    </div>
  )
}

// ===== MAIN CONTENT ROUTER =====
// ===== WHATSAPP CONFIG VIEW =====
function WhatsAppConfigView() {
  const [whatsappStatus, setWhatsappStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected')
  const [connectionMode, setConnectionMode] = useState<'qr' | 'phone' | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [pairCode, setPairCode] = useState<string | null>(null)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [requestingPair, setRequestingPair] = useState(false)
  const [pairProgress, setPairProgress] = useState<string[]>([])

  useEffect(() => {
    checkStatus()
    const interval = setInterval(checkStatus, 3000)
    return () => clearInterval(interval)
  }, [])

  async function checkStatus() {
    try {
      const res = await authFetch('/api/whatsapp-status')
      if (res.ok) {
        const json = await res.json()
        setWhatsappStatus(json.data?.status || 'disconnected')
        if (connectionMode === 'qr') setQrCode(json.data?.qr || null)
        if (json.data?.status === 'connected') { setPairCode(null); setPairProgress([]) }
      }
    } catch {}
    finally { setLoading(false) }
  }

  async function handleStartQR() {
    setConnectionMode('qr')
    setStarting(true)
    setPairCode(null)
    try {
      await authFetch('/api/whatsapp-status', { method: 'POST' })
    } catch { toast.error('Erreur lors du démarrage') }
    finally { setStarting(false) }
  }

  async function handleStartPhone() {
    if (!phoneNumber.trim()) { toast.error('Entrez votre numéro de téléphone'); return }
    setConnectionMode('phone')
    setRequestingPair(true)
    setPairProgress([])
    const steps = [
      'Démarrage du client WhatsApp...',
      'Chargement de WhatsApp Web...',
      'Génération du code de parrainage...',
    ]
    steps.forEach((s, i) => setTimeout(() => setPairProgress(p => [...p, s]), i * 3000))

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 90000)
    try {
      const res = await fetch('http://localhost:3001/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': '8d98caceba0ee17db42233ee61aab69b733d8ab706e5c160' },
        body: JSON.stringify({ phone: phoneNumber.trim().replace(/[^0-9]/g, '') }),
        signal: controller.signal,
      })
      const json = await res.json()
      if (json.ok && json.pairingCode) {
        setPairCode(json.pairingCode)
        setPairProgress(p => [...p, 'Code généré !'])
        toast.success('Code de parrainage généré !')
      } else {
        toast.error(json.error || 'Impossible de générer le code')
        setPairProgress([])
      }
    } catch (e: any) {
      if (e.name === 'AbortError') toast.error('Délai dépassé (90s). Vérifiez que le serveur WhatsApp fonctionne.')
      else toast.error('Erreur de connexion au serveur WhatsApp')
      setPairProgress([])
    } finally { clearTimeout(timeoutId); setRequestingPair(false) }
  }

  async function handleDisconnect() {
    try {
      const res = await fetch('http://localhost:3001/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': '8d98caceba0ee17db42233ee61aab69b733d8ab706e5c160' },
      })
      const json = await res.json()
      if (json.ok) {
        toast.success('Déconnecté')
        setWhatsappStatus('disconnected')
        setQrCode(null)
        setPairCode(null)
        setConnectionMode(null)
        setPairProgress([])
      }
    } catch { toast.error('Erreur lors de la déconnexion') }
  }

  const statusColors: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    connected: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Connecté' },
    connecting: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', label: connectionMode === 'phone' ? 'Préparation du code...' : connectionMode === 'qr' ? 'En attente du scan...' : 'En cours...' },
    disconnected: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', label: 'Déconnecté' },
  }
  const st = statusColors[whatsappStatus]

  const GOLD_COLOR = 'oklch(72% 0.15 65)'
  const TEAL_COLOR = 'oklch(55% 0.15 175)'

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Connexion WhatsApp</h1>
      </div>

      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl max-w-lg shadow-sm overflow-hidden">
        <div className="h-28 relative" style={{ background: `linear-gradient(135deg, ${TEAL_COLOR}, ${GOLD_COLOR})` }}>
          <div className="absolute bottom-4 left-6 flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl grid place-items-center bg-white/20 backdrop-blur-sm">
              <svg viewBox="0 0 24 24" width="28" height="28" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            </div>
            <div className="text-white">
              <div className="font-bold text-lg">WhatsApp Bot</div>
              <div className="text-white/70 text-sm">Liez votre téléphone pour envoyer des OTP</div>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 border-4 border-[oklch(72%_0.15_65)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className={`flex items-center gap-3 p-3 rounded-xl ${st.bg}`}>
                <div className={`w-2.5 h-2.5 rounded-full ${st.dot} ${whatsappStatus === 'connecting' ? 'animate-pulse' : ''}`} />
                <span className={`text-sm font-semibold ${st.text}`}>{st.label}</span>
              </div>

              {whatsappStatus === 'connected' && (
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 grid place-items-center">
                    <CheckCircle size={32} className="text-emerald-600" />
                  </div>
                  <p className="text-sm font-semibold text-emerald-700">WhatsApp est connecté !</p>
                  <p className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Les codes OTP seront envoyés via ce téléphone.</p>
                  <button onClick={handleDisconnect} className="w-full py-3 rounded-xl font-semibold text-sm border border-red-200 text-red-600 hover:bg-red-50 transition">Déconnecter</button>
                </div>
              )}

              {whatsappStatus === 'connecting' && connectionMode === 'qr' && qrCode && (
                <div className="text-center space-y-3">
                  <p className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>Scannez ce QR code avec WhatsApp sur votre téléphone :</p>
                  <div className="inline-block p-4 bg-white border-2 border-[oklch(88%_0.01_175)] rounded-2xl shadow-inner">
                    <img src={qrCode} alt="QR Code WhatsApp" className="w-56 h-56" />
                  </div>
                  <p className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>WhatsApp &rarr; Paramètres &rarr; Appareils connectés &rarr; Connecter un appareil</p>
                  <button onClick={() => { setConnectionMode(null); setQrCode(null) }} className="text-xs underline" style={{ color: TEXT_MUTED_LUXE }}>Annuler</button>
                </div>
              )}

              {whatsappStatus === 'connecting' && connectionMode === 'phone' && (
                <div className="space-y-3">
                  {pairProgress.map((step, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm" style={{ color: TEXT_PRIMARY }}>
                      <div className="h-4 w-4 border-2 border-[oklch(72%_0.15_65)] border-t-transparent rounded-full animate-spin shrink-0" />
                      {step}
                    </div>
                  ))}
                  {pairCode && (
                    <div className="text-center space-y-2 pt-2">
                      <div className="inline-block px-6 py-3 bg-[oklch(97%_0.02_175)] border border-[oklch(88%_0.01_175)] rounded-xl">
                        <span className="text-2xl font-mono font-bold tracking-[0.3em]" style={{ color: TEXT_PRIMARY }}>{pairCode}</span>
                      </div>
                      <p className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Entrez ce code sur votre téléphone WhatsApp</p>
                      <p className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>WhatsApp &rarr; Appareils connectés &rarr; Connecter avec un numéro</p>
                    </div>
                  )}
                  {!pairCode && (
                    <button onClick={() => { setConnectionMode(null); setRequestingPair(false); setPairProgress([]) }} className="text-xs underline" style={{ color: TEXT_MUTED_LUXE }}>Annuler</button>
                  )}
                </div>
              )}

              {(!connectionMode && whatsappStatus !== 'connected') && (
                <div className="space-y-4">
                  {whatsappStatus !== 'disconnected' && (
                    <button onClick={handleDisconnect} className="w-full py-2.5 rounded-xl font-semibold text-sm border border-red-200 text-red-600 hover:bg-red-50 transition">
                      Déconnecter / Recommencer
                    </button>
                  )}

                  <div>
                    <label className="text-xs font-medium mb-1.5 block" style={{ color: TEXT_MUTED_LUXE }}>Numéro de téléphone</label>
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={e => setPhoneNumber(e.target.value)}
                      placeholder="+243 8XX XXX XXX"
                      className="w-full px-3 py-2.5 border border-[oklch(88%_0.01_175)] rounded-lg text-sm outline-none focus:border-[oklch(72%_0.15_65)] focus:ring-2 focus:ring-[oklch(95%_0.05_65)]"
                      style={{ color: TEXT_PRIMARY }}
                    />
                  </div>

                  <button
                    onClick={handleStartQR}
                    disabled={starting}
                    className="w-full py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition hover:opacity-90"
                    style={{ background: `linear-gradient(135deg, ${TEAL_COLOR}, ${GOLD_COLOR})` }}
                  >
                    {starting ? (
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <QrCode size={16} />
                    )}
                    {starting ? 'Démarrage...' : 'Option 1 : Scanner le QR Code'}
                  </button>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-[oklch(88%_0.01_175)]" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="px-2 bg-white" style={{ color: TEXT_MUTED_LUXE }}>ou</span>
                    </div>
                  </div>

                  <button
                    onClick={handleStartPhone}
                    disabled={requestingPair || !phoneNumber.trim()}
                    className="w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition border border-[oklch(88%_0.01_175)] hover:border-[oklch(72%_0.15_65)] hover:shadow-sm"
                    style={{ color: TEXT_PRIMARY }}
                  >
                    {requestingPair ? (
                      <div className="h-4 w-4 border-2 border-[oklch(72%_0.15_65)] border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Hash size={16} />
                    )}
                    {requestingPair ? 'Génération...' : 'Option 2 : Code de parrainage'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function MainContent() {
  const { currentView, userRole, userData, setCurrentView } = useEduGestStore()

  switch (currentView) {
    case 'dashboard': return <RoleDashboard />
    case 'students': return <StudentsView />
    case 'classes': return <ClassesView />
    case 'grades': return <GradesView />
    case 'payments': return <PaymentsView />
    case 'payment-verification': return <PaymentVerificationView />
    case 'online-payment': return <OnlinePaymentView />
    case 'debts': return <DettesView onNavigate={(v) => setCurrentView(v as ViewType)} schoolId={userData?.schoolId || ''} />
    case 'payment-config': return <PaymentConfigView />
    case 'discipline': return <DisciplineView />
    case 'communications': return <CommunicationsView />
    case 'homework': return <HomeworkView />
    case 'profile': return <ProfileView />
    case 'class-passing': return <ClassPassingView />
    case 'bulletin': return <BulletinView />
    case 'convocation': return <ConvocationView />
    case 'schools': return <SchoolsManagementView />
    case 'personnel': return <PersonnelView />
    case 'pricing': return <PricingDashboard />
    case 'whatsapp-config': return <WhatsAppConfigView />
    case 'settings': return <SettingsView />
    case 'school-reviews': return <SchoolReviewsView />
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

// SuperAdminDashboard imported from @/components/dashboards/SuperAdminDashboard

// SecretaryDashboard imported from @/components/dashboards/SecretaryDashboard

// CashierDashboard imported from @/components/dashboards/CashierDashboard

// ParentDashboard imported from @/components/dashboards/ParentDashboard

// TeacherDashboard imported from @/components/dashboards/TeacherDashboard

// HeadTeacherDashboard imported from @/components/dashboards/HeadTeacherDashboard

// ===== DIRECTION DASHBOARD =====
function DirectionDashboard() {
  return <SecretaryDashboard />
}

// DisciplineDashboardView imported from @/components/dashboards/DisciplineDashboard

// StudentsView imported from @/components/views/StudentsView

// ===== CLASSES VIEW =====
function ClassesView() {
  const [classes, setClasses] = useState<ClassData[]>([])
  const [loading, setLoading] = useState(true)
  const [classSearch, setClassSearch] = useState('')
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null)
  const { userData, userRole } = useEduGestStore()
  const [showAddClass, setShowAddClass] = useState(false)
  const [newClassName, setNewClassName] = useState('')
  const [newClassSection, setNewClassSection] = useState('PRIMAIRE')
  const [newClassCapacity, setNewClassCapacity] = useState('40')
  const [addingClass, setAddingClass] = useState(false)
  const [deletingClassId, setDeletingClassId] = useState<string | null>(null)
  const [pendingApprovals, setPendingApprovals] = useState<{id: string; name: string; type: string; requestedBy: string}[]>([])
  const [viewingClassId, setViewingClassId] = useState<string | null>(null)
  const [viewingClassName, setViewingClassName] = useState('')
  const [classStudents, setClassStudents] = useState<StudentData[]>([])
  const [loadingStudents, setLoadingStudents] = useState(false)
  const canManage = userRole === 'SUPER_ADMIN_GLOBAL' || (userRole && userRole.startsWith('DIRECTION'))

  useEffect(() => {
    authFetch(`/api/classes?limit=50${userData?.schoolId ? `&schoolId=${userData.schoolId}` : ''}`).then(r => r.json()).then(j => { setClasses(j.data || []); setLoading(false) }).catch(() => setLoading(false))
  }, [userData?.schoolId])

  // Class search autocomplete - computed from local data
  const classSuggestions = useMemo(() => {
    if (classSearch.length < 1) return classes.map(c => ({ id: c.id, label: c.name, sublabel: `${c._count?.students || 0} élèves · Cap. ${c.capacity}${c.section ? ` · ${c.section}` : ''}` }))
    return classes.filter(c => c.name.toLowerCase().includes(classSearch.toLowerCase()) || (c.section || '').toLowerCase().includes(classSearch.toLowerCase())).map(c => ({
      id: c.id, label: c.name, sublabel: `${c._count?.students || 0} élèves · Cap. ${c.capacity}${c.section ? ` · ${c.section}` : ''}`
    }))
  }, [classSearch, classes])

  const filteredClasses = selectedClassId
    ? classes.filter(c => c.id === selectedClassId)
    : classSearch.length >= 2
      ? classes.filter(c => c.name.toLowerCase().includes(classSearch.toLowerCase()) || (c.section || '').toLowerCase().includes(classSearch.toLowerCase()))
      : classes

  async function handleAddClass() {
    if (!newClassName.trim()) { toast.error('Le nom est requis'); return }
    setAddingClass(true)
    try {
      const res = await authFetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newClassName.trim(),
          section: newClassSection,
          capacity: parseInt(newClassCapacity) || 40,
          schoolId: userData?.schoolId,
        }),
      })
      if (res.ok) {
        toast.success('Classe créée avec succès!')
        setShowAddClass(false)
        setNewClassName('')
        const j = await authFetch(`/api/classes?limit=50${userData?.schoolId ? `&schoolId=${userData.schoolId}` : ''}`).then(r => r.json())
        setClasses(j.data || [])
      } else {
        const j = await res.json()
        toast.error(j.error || 'Erreur lors de la création')
      }
    } catch { toast.error('Erreur réseau') }
    finally { setAddingClass(false) }
  }

  async function handleDeleteClass(classId: string, className: string) {
    if (!confirm(`Supprimer la classe "${className}" ? Cette action est irréversible.`)) return
    setDeletingClassId(classId)
    try {
      const res = await authFetch(`/api/classes/${classId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Classe supprimée!')
        setClasses(prev => prev.filter(c => c.id !== classId))
      } else {
        const j = await res.json()
        toast.error(j.error || 'Erreur lors de la suppression')
      }
    } catch { toast.error('Erreur réseau') }
    finally { setDeletingClassId(null) }
  }

  async function handleViewClass(classId: string, className: string) {
    setViewingClassId(classId)
    setViewingClassName(className)
    setLoadingStudents(true)
    try {
      const res = await authFetch(`/api/students?classId=${classId}&limit=50`)
      const json = await res.json()
      setClassStudents(json.data || [])
    } catch { setClassStudents([]) }
    finally { setLoadingStudents(false) }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Classes</h1>
          </div>
          <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>{formatNumber(filteredClasses.length)} classes</p>
        </div>
        <div className="flex items-center gap-3">
          {canManage && (
            <button onClick={() => setShowAddClass(true)} className="edu-gold-cta px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2">
              <span className="text-lg leading-none">+</span> Créer une classe
            </button>
          )}
          <SearchAutocomplete
            placeholder="Tapez le nom de la classe..."
            items={classSuggestions}
            selectedId={selectedClassId}
            onSelect={(item) => setSelectedClassId(item.id)}
            onClear={() => { setSelectedClassId(null); setClassSearch('') }}
            searchQuery={classSearch}
            onSearchChange={setClassSearch}
            itemTypeName="classe"
            className="w-full max-w-sm"
          />
        </div>
      </div>
      {loading ? <div className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</div> : filteredClasses.length === 0 ? (
        <div className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Aucune classe trouvée</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClasses.map(c => (
            <div key={c.id} className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm edu-card-lift cursor-pointer" onClick={() => handleViewClass(c.id, c.name)}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold" style={{ color: TEXT_PRIMARY }}>{c.name}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2 py-1 rounded-full" style={{ color: GOLD, background: GOLD_SOFT }}>{c.level || c.section || ''}</span>
                  {canManage && (
                    <button
                      onClick={() => handleDeleteClass(c.id, c.name)}
                      disabled={deletingClassId === c.id}
                      className="w-7 h-7 rounded-lg grid place-items-center hover:bg-[oklch(95%_0.04_175)] transition disabled:opacity-50"
                      style={{ color: DANGER }}
                      title="Supprimer"
                    >
                      {deletingClassId === c.id ? <div className="h-3 w-3 border border-[oklch(58%_0.15_25)] border-t-transparent rounded-full animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  )}
                </div>
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

      {showAddClass && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowAddClass(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold" style={{ color: TEXT_PRIMARY }}>Créer une classe</h3>
              <button onClick={() => setShowAddClass(false)} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-gray-100 transition"><X size={16} className="text-gray-500" /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Nom de la classe *</label>
                <input value={newClassName} onChange={e => setNewClassName(e.target.value)} placeholder="Ex: 6ème A" className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" style={{ color: TEXT_PRIMARY }} />
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Section</label>
                <select value={newClassSection} onChange={e => setNewClassSection(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
                  <option value="MATERNELLE">Maternelle</option>
                  <option value="PRIMAIRE">Primaire</option>
                  <option value="SECONDAIRE">Secondaire</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Capacité</label>
                <input type="number" value={newClassCapacity} onChange={e => setNewClassCapacity(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" style={{ color: TEXT_PRIMARY }} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowAddClass(false)} className="px-5 py-2.5 rounded-xl text-sm font-medium border border-[oklch(90%_0.01_175)]" style={{ color: TEXT_PRIMARY }}>Annuler</button>
              <button onClick={handleAddClass} disabled={addingClass} className="edu-gold-cta px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50">
                {addingClass ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check size={14} />}
                Créer
              </button>
            </div>
          </div>
        </div>
      )}

      {viewingClassId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setViewingClassId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-[oklch(90%_0.01_175)] flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-semibold text-sm" style={{ color: TEXT_PRIMARY }}>Élèves de {viewingClassName}</h3>
                <p className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{classStudents.length} élève{classStudents.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setViewingClassId(null)} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-[oklch(95%_0.005_175)] transition">
                <X size={16} style={{ color: TEXT_MUTED_LUXE }} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingStudents ? (
                <div className="text-center py-12" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</div>
              ) : classStudents.length === 0 ? (
                <div className="text-center py-12" style={{ color: TEXT_MUTED_LUXE }}>Aucun élève dans cette classe</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ background: IVORY }}>
                      <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-5 py-3" style={{ color: GOLD }}>Élève</th>
                      <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-5 py-3" style={{ color: GOLD }}>Matricule</th>
                      <th className="text-left text-[11px] font-semibold uppercase tracking-wider px-5 py-3" style={{ color: GOLD }}>Parent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classStudents.map(s => (
                      <tr key={s.id} className="hover:bg-[oklch(97%_0.005_175)] transition border-b border-[oklch(90%_0.01_175)] last:border-0">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2.5">
                            <StudentAvatar firstName={s.firstName} lastName={s.lastName} photoUrl={s.photoUrl} size={32} className="text-white font-semibold" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }} />
                            <div>
                              <div className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>{s.firstName} {s.lastName}</div>
                              <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{s.gender === 'M' ? 'Garçon' : 'Fille'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-[13px] font-mono" style={{ color: TEXT_MUTED_LUXE }}>{s.matricule}</td>
                        <td className="px-5 py-3 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{s.parent?.name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// GradesView imported from @/components/views/GradesView

// PaymentsView imported from @/components/views/PaymentsView

// ===== PAYMENT CONFIGURATION VIEW =====
const GATEWAY_SVG_LOGOS: Record<string, string> = {
  ORANGE_MONEY: '/logos/orange-money.svg',
  MPESA: '/logos/m-pesa.svg',
  AIRTEL_MONEY: '/logos/airtel-money.svg',
  DPO: '/logos/dpo.svg',
  STRIPE: '/logos/stripe.svg',
  PAYPAL: '/logos/paypal.svg',
  FLUTTERWAVE: '/logos/flutterwave.svg',
  MANUAL: '/logos/manual.svg',
}

function PaymentConfigView() {
  const { userData } = useEduGestStore()
  const [activeTab, setActiveTab] = useState<'gateways' | 'currency' | 'transactions'>('gateways')
  const [gateways, setGateways] = useState<any[]>([])
  const [availableGateways, setAvailableGateways] = useState<any[]>([])
  const [currencyConfig, setCurrencyConfig] = useState<any>(null)
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({})
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showGatewayModal, setShowGatewayModal] = useState<string | null>(null)
  const [gatewayForm, setGatewayForm] = useState<any>({})
  const [currencyForm, setCurrencyForm] = useState<any>({
    baseCurrency: 'CDF',
    displayCurrency: 'CDF',
    enabledCurrencies: ['CDF', 'USD'],
    useManualRates: false,
    manualRates: {},
  })
  const [convertForm, setConvertForm] = useState({ amount: 100, from: 'CDF', to: 'USD' })
  const [convertResult, setConvertResult] = useState<any>(null)
  const [supportedCurrencies, setSupportedCurrencies] = useState<any[]>([])

  useEffect(() => {
    if (!userData?.schoolId) return
    loadGateways()
    loadCurrencyConfig()
    loadTransactions()
  }, [userData?.schoolId])

  async function loadGateways() {
    try {
      const res = await authFetch(`/api/payment-gateways${userData?.schoolId ? `?schoolId=${userData.schoolId}` : ''}`)
      const json = await res.json()
      if (json.data) {
        setAvailableGateways(json.data.catalog || [])
        setGateways(json.data.configured || [])
      }
    } catch (e) { console.error('[PaymentConfig] loadGateways:', e) }
    finally { setLoading(false) }
  }

  async function loadCurrencyConfig() {
    try {
      const res = await authFetch(`/api/currency${userData?.schoolId ? `?schoolId=${userData.schoolId}` : ''}`)
      const json = await res.json()
      if (json.data) {
        setCurrencyConfig(json.data.config)
        setExchangeRates(json.data.exchangeRates || {})
        setSupportedCurrencies(json.data.supportedCurrencies || [])
        if (json.data.config) {
          setCurrencyForm({
            baseCurrency: json.data.config.baseCurrency || 'USD',
            displayCurrency: json.data.config.displayCurrency || 'USD',
            enabledCurrencies: (json.data.config.enabledCurrencies || 'USD,EUR,CDF').split(','),
            useManualRates: json.data.config.useManualRates || false,
            manualRates: json.data.config.manualRates ? JSON.parse(json.data.config.manualRates) : {},
          })
        }
      }
    } catch (e) { console.error(e) }
  }

  async function loadTransactions() {
    try {
      const params = new URLSearchParams({ limit: '10' })
      if (userData?.schoolId) params.set('schoolId', userData.schoolId)
      const res = await authFetch(`/api/payment-transactions?${params.toString()}`)
      const json = await res.json()
      if (json.data) setTransactions(json.data.transactions || json.data)
    } catch (e) { console.error(e) }
  }

  async function refreshRates() {
    try {
      const res = await authFetch(`/api/currency/exchange-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseCurrency: currencyForm.baseCurrency }),
      })
      const json = await res.json()
      if (json.data) {
        setExchangeRates(json.data.rates || {})
        toast.success('Taux de change mis à jour !')
        loadCurrencyConfig()
      }
    } catch (e) { toast.error('Erreur lors de la mise à jour') }
  }

  async function saveCurrencyConfig() {
    setSaving(true)
    try {
      const res = await authFetch(`/api/currency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: userData?.schoolId,
          ...currencyForm,
          enabledCurrencies: currencyForm.enabledCurrencies.join(','),
          manualRates: JSON.stringify(currencyForm.manualRates),
        }),
      })
      const json = await res.json()
      if (json.data) {
        toast.success('Configuration de monnaie sauvegardée !')
        loadCurrencyConfig()
      } else {
        toast.error(json.error || 'Erreur')
      }
    } catch (e) { toast.error('Erreur réseau') }
    finally { setSaving(false) }
  }

  async function saveGatewayConfig() {
    setSaving(true)
    try {
      const res = await authFetch(`/api/payment-gateways`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: userData?.schoolId,
          ...gatewayForm,
        }),
      })
      const json = await res.json()
      if (json.data) {
        toast.success('Passerelle configurée avec succès !')
        setShowGatewayModal(null)
        loadGateways()
      } else {
        toast.error(json.error || 'Erreur')
      }
    } catch (e) { toast.error('Erreur réseau') }
    finally { setSaving(false) }
  }

  async function toggleGateway(gateway: any) {
    try {
      const res = await authFetch(`/api/payment-gateways/${gateway.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !gateway.isActive }),
      })
      if (res.ok) {
        toast.success(gateway.isActive ? 'Passerelle désactivée' : 'Passerelle activée')
        loadGateways()
      }
    } catch (e) { toast.error('Erreur') }
  }

  async function convertCurrency() {
    try {
      const res = await authFetch(`/api/currency/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(convertForm),
      })
      const json = await res.json()
      if (json.data) setConvertResult(json.data)
      else toast.error(json.error || 'Erreur')
    } catch (e) { toast.error('Erreur réseau') }
  }

  function openGatewayEditor(gatewayType: string, existing?: any) {
    setGatewayForm({
      schoolId: userData?.schoolId,
      gatewayType,
      isActive: existing?.isActive ?? false,
      isTestMode: existing?.isTestMode ?? true,
      merchantId: existing?.merchantId || '',
      apiKey: existing?.apiKey || '',
      secretKey: existing?.secretKey || '',
      publicKey: existing?.publicKey || '',
      webhookSecret: existing?.webhookSecret || '',
      phoneNumber: existing?.phoneNumber || '',
      accountEmail: existing?.accountEmail || '',
      currency: existing?.currency || 'USD',
      feePercent: existing?.feePercent || 0,
    })
    setShowGatewayModal(gatewayType)
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuration des Paiements</h1>
        <p className="text-gray-500 text-sm mt-1">Gérez les passerelles de paiement et les monnaies</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setActiveTab('gateways')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === 'gateways' ? 'border-[#f5a623] text-[#f5a623]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Passerelles de Paiement
        </button>
        <button
          onClick={() => setActiveTab('currency')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === 'currency' ? 'border-[#f5a623] text-[#f5a623]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Monnaies & Taux de Change
        </button>
        <button
          onClick={() => setActiveTab('transactions')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
            activeTab === 'transactions' ? 'border-[#f5a623] text-[#f5a623]' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Transactions
        </button>
      </div>

      {/* Gateways Tab */}
      {activeTab === 'gateways' && (
        <div className="space-y-4">
          {availableGateways.length === 0 && !loading && (
            <div className="text-center py-8 bg-white border border-[oklch(90%_0.01_175)] rounded-2xl">
              <p className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>Aucune passerelle disponible</p>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {availableGateways.map((gw: any) => {
              const configured = gateways.find((g: any) => g.gatewayType === gw.gatewayType)
              const svgLogo = GATEWAY_SVG_LOGOS[gw.gatewayType]
              return (
                <div key={gw.gatewayType} className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {svgLogo ? (
                        <img src={svgLogo} alt={gw.displayName} className="w-10 h-10 rounded-xl object-cover shrink-0" />
                      ) : (
                        <span className="text-2xl">{gw.icon}</span>
                      )}
                      <div>
                        <h3 className="font-semibold text-sm" style={{ color: TEXT_PRIMARY }}>{gw.displayName}</h3>
                        {configured ? (
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${configured.isActive ? 'bg-[oklch(94%_0.05_145)] text-[oklch(40%_0.13_145)]' : 'bg-[oklch(94%_0.005_250)] text-[oklch(52%_0.015_250)]'}`}>
                            {configured.isActive ? 'Actif' : 'Inactif'}
                          </span>
                        ) : (
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-[oklch(94%_0.06_65)] text-[oklch(45%_0.13_65)]">
                            Non configuré
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-[12px] mb-3" style={{ color: TEXT_MUTED_LUXE }}>{gw.description}</p>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {gw.supportedCurrencies.slice(0, 4).map((c: string) => (
                      <span key={c} className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: GOLD_SOFT, color: GOLD }}>{c}</span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openGatewayEditor(gw.gatewayType, configured)}
                      className="flex-1 text-[12px] py-2 px-3 rounded-xl font-semibold transition edu-gold-cta"
                    >
                      {configured ? 'Configurer' : 'Activer'}
                    </button>
                    {configured && (
                      <button
                        onClick={() => toggleGateway(configured)}
                        className={`text-[12px] py-2 px-3 rounded-xl font-semibold transition ${
                          configured.isActive ? 'bg-[oklch(95%_0.04_25)] text-[oklch(55%_0.18_25)] hover:bg-[oklch(93%_0.04_25)]' : 'bg-[oklch(94%_0.05_145)] text-[oklch(40%_0.13_145)] hover:bg-[oklch(92%_0.05_145)]'
                        }`}
                      >
                        {configured.isActive ? 'Désactiver' : 'Activer'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Currency Tab */}
      {activeTab === 'currency' && (
        <div className="space-y-6">
          {/* Currency Configuration */}
          <div className="border rounded-xl p-5 bg-white">
            <h3 className="font-semibold mb-4">Configuration des monnaies</h3>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Monnaie de base</label>
                <select
                  value={currencyForm.baseCurrency}
                  onChange={(e) => setCurrencyForm({ ...currencyForm, baseCurrency: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  {supportedCurrencies.map((c: any) => (
                    <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Monnaie d&apos;affichage</label>
                <select
                  value={currencyForm.displayCurrency}
                  onChange={(e) => setCurrencyForm({ ...currencyForm, displayCurrency: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  {supportedCurrencies.map((c: any) => (
                    <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-gray-600 mb-2">Monnaies acceptées</label>
              <div className="flex flex-wrap gap-2">
                {supportedCurrencies.map((c: any) => (
                  <button
                    key={c.code}
                    onClick={() => {
                      const enabled = currencyForm.enabledCurrencies.includes(c.code)
                      setCurrencyForm({
                        ...currencyForm,
                        enabledCurrencies: enabled
                          ? currencyForm.enabledCurrencies.filter((x: string) => x !== c.code)
                          : [...currencyForm.enabledCurrencies, c.code],
                      })
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      currencyForm.enabledCurrencies.includes(c.code)
                        ? 'bg-[#f5a623] text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {c.symbol} {c.code}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <input
                type="checkbox"
                id="manualRates"
                checked={currencyForm.useManualRates}
                onChange={(e) => setCurrencyForm({ ...currencyForm, useManualRates: e.target.checked })}
                className="rounded"
              />
              <label htmlFor="manualRates" className="text-sm text-gray-600">
                Utiliser des taux manuels (au lieu des taux automatiques)
              </label>
            </div>
            <button
              onClick={saveCurrencyConfig}
              disabled={saving}
              className="mt-5 px-5 py-2 bg-[#f5a623] text-white rounded-lg text-sm font-medium hover:bg-[#ffb643] transition disabled:opacity-50"
            >
              {saving ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
          </div>

          {/* Exchange Rates */}
          <div className="border rounded-xl p-5 bg-white">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold">Taux de change en temps réel</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Source: APIs open source (Frankfurter/BCE, ExchangeRate.host, Open ER API)
                </p>
              </div>
              <button
                onClick={refreshRates}
                className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition flex items-center gap-2"
              >
                <RefreshCw size={14} /> Actualiser
              </button>
            </div>
            {currencyConfig?.lastRateUpdate && (
              <p className="text-xs text-gray-400 mb-3">
                Dernière mise à jour: {new Date(currencyConfig.lastRateUpdate).toLocaleString('fr-FR')}
              </p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(exchangeRates).slice(0, 12).map(([currency, rate]) => (
                <div key={currency} className="border rounded-lg p-3 bg-gray-50">
                  <div className="text-xs text-gray-500">{currency}/ {currencyForm.baseCurrency}</div>
                  <div className="text-lg font-bold text-gray-900">{Number(rate).toFixed(4)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Currency Converter */}
          <div className="border rounded-xl p-5 bg-white">
            <h3 className="font-semibold mb-4">Convertisseur de monnaies</h3>
            <div className="grid md:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Montant</label>
                <input
                  type="number"
                  value={convertForm.amount}
                  onChange={(e) => setConvertForm({ ...convertForm, amount: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">De</label>
                <select
                  value={convertForm.from}
                  onChange={(e) => setConvertForm({ ...convertForm, from: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  {supportedCurrencies.map((c: any) => (
                    <option key={c.code} value={c.code}>{c.code}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Vers</label>
                <select
                  value={convertForm.to}
                  onChange={(e) => setConvertForm({ ...convertForm, to: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                >
                  {supportedCurrencies.map((c: any) => (
                    <option key={c.code} value={c.code}>{c.code}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={convertCurrency}
                className="px-4 py-2 bg-[#f5a623] text-white rounded-lg text-sm font-medium hover:bg-[#ffb643] transition"
              >
                Convertir
              </button>
            </div>
            {convertResult && (
              <div className="mt-4 p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="text-sm text-gray-600">
                  {convertForm.amount} {convertForm.from} = 
                </div>
                <div className="text-2xl font-bold text-green-700">
                  {convertResult.convertedAmount.toFixed(2)} {convertForm.to}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Taux: 1 {convertForm.from} = {convertResult.rate.toFixed(4)} {convertForm.to} (Source: {convertResult.source})
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transactions Tab */}
      {activeTab === 'transactions' && (
        <div className="border rounded-xl bg-white overflow-hidden">
          <div className="p-4 border-b">
            <h3 className="font-semibold">Transactions récentes</h3>
          </div>
          {transactions.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">
              Aucune transaction enregistrée
            </div>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left p-3 font-medium text-xs text-gray-600">RÉFÉRENCE</th>
                    <th className="text-left p-3 font-medium text-xs text-gray-600">PASSERELLE</th>
                    <th className="text-right p-3 font-medium text-xs text-gray-600">MONTANT</th>
                    <th className="text-center p-3 font-medium text-xs text-gray-600">STATUT</th>
                    <th className="text-left p-3 font-medium text-xs text-gray-600">DATE</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx: any) => (
                    <tr key={tx.id} className="border-t hover:bg-gray-50">
                      <td className="p-3 font-mono text-xs">{tx.reference}</td>
                      <td className="p-3 text-xs">{tx.gatewayType}</td>
                      <td className="p-3 text-right">
                        {tx.amount.toFixed(2)} {tx.currency}
                        {tx.convertedAmount && tx.currency !== tx.baseCurrency && (
                          <div className="text-xs text-gray-400">
                            ≈ {tx.convertedAmount.toFixed(2)} {tx.baseCurrency}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          tx.status === 'SUCCESS' ? 'bg-green-100 text-green-700' :
                          tx.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                          tx.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-gray-500">
                        {new Date(tx.initiatedAt).toLocaleString('fr-FR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Gateway Configuration Modal */}
      {showGatewayModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowGatewayModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-[oklch(90%_0.01_175)] flex items-center justify-between sticky top-0 bg-white rounded-t-2xl">
              <div className="flex items-center gap-3">
                {GATEWAY_SVG_LOGOS[showGatewayModal] ? (
                  <img src={GATEWAY_SVG_LOGOS[showGatewayModal]} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                ) : null}
                <h3 className="font-semibold text-sm" style={{ color: TEXT_PRIMARY }}>
                  Configuration - {availableGateways.find((g: any) => g.gatewayType === showGatewayModal)?.displayName}
                </h3>
              </div>
              <button onClick={() => setShowGatewayModal(null)} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-[oklch(95%_0.005_175)] transition">
                <X size={16} style={{ color: TEXT_MUTED_LUXE }} />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={gatewayForm.isActive} onChange={(e) => setGatewayForm({ ...gatewayForm, isActive: e.target.checked })} className="w-4 h-4 rounded accent-[oklch(72%_0.15_65)]" />
                  <span className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Activer</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={gatewayForm.isTestMode} onChange={(e) => setGatewayForm({ ...gatewayForm, isTestMode: e.target.checked })} className="w-4 h-4 rounded accent-[oklch(72%_0.15_65)]" />
                  <span className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>Mode test</span>
                </label>
              </div>

              {showGatewayModal !== 'MANUAL' && (
                <>
                  <div>
                    <label className="text-[11px] font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Merchant ID</label>
                    <input type="text" value={gatewayForm.merchantId || ''} onChange={(e) => setGatewayForm({ ...gatewayForm, merchantId: e.target.value })} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" placeholder="Identifiant marchand" style={{ color: TEXT_PRIMARY }} />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>API Key</label>
                    <input type="password" value={gatewayForm.apiKey || ''} onChange={(e) => setGatewayForm({ ...gatewayForm, apiKey: e.target.value })} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" placeholder="Clé API" style={{ color: TEXT_PRIMARY }} />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Secret Key</label>
                    <input type="password" value={gatewayForm.secretKey || ''} onChange={(e) => setGatewayForm({ ...gatewayForm, secretKey: e.target.value })} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" placeholder="Clé secrète" style={{ color: TEXT_PRIMARY }} />
                  </div>
                  {(showGatewayModal === 'MPESA' || showGatewayModal === 'ORANGE_MONEY' || showGatewayModal === 'AIRTEL_MONEY') && (
                    <div>
                      <label className="text-[11px] font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Numéro de téléphone du marchand</label>
                      <input type="text" value={gatewayForm.phoneNumber || ''} onChange={(e) => setGatewayForm({ ...gatewayForm, phoneNumber: e.target.value })} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" placeholder="+243..." style={{ color: TEXT_PRIMARY }} />
                    </div>
                  )}
                  {(showGatewayModal === 'PAYPAL' || showGatewayModal === 'STRIPE') && (
                    <div>
                      <label className="text-[11px] font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Email du compte</label>
                      <input type="email" value={gatewayForm.accountEmail || ''} onChange={(e) => setGatewayForm({ ...gatewayForm, accountEmail: e.target.value })} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" placeholder="email@example.com" style={{ color: TEXT_PRIMARY }} />
                    </div>
                  )}
                  <div>
                    <label className="text-[11px] font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Monnaie</label>
                    <select value={gatewayForm.currency} onChange={(e) => setGatewayForm({ ...gatewayForm, currency: e.target.value })} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" style={{ color: TEXT_PRIMARY }}>
                      {(availableGateways.find((g: any) => g.gatewayType === showGatewayModal)?.supportedCurrencies || []).map((c: string) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Frais de transaction (%)</label>
                    <input type="number" step="0.1" value={gatewayForm.feePercent || 0} onChange={(e) => setGatewayForm({ ...gatewayForm, feePercent: Number(e.target.value) })} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" style={{ color: TEXT_PRIMARY }} />
                  </div>
                </>
              )}

              <div className="pt-2 flex gap-3">
                <button onClick={saveGatewayConfig} disabled={saving} className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition edu-gold-cta disabled:opacity-50">
                  {saving ? 'Sauvegarde...' : 'Sauvegarder'}
                </button>
                <button onClick={() => setShowGatewayModal(null)} className="px-5 py-2.5 rounded-xl text-sm font-medium border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)] transition" style={{ color: TEXT_PRIMARY }}>
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ===== PAYMENT VERIFICATION VIEW =====
function PaymentVerificationView() {
  const { userData, userRole } = useEduGestStore()
  const isParent = userRole === 'PARENT'

  const [payments, setPayments] = useState<PaymentData[]>([])
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [receiptLoading, setReceiptLoading] = useState(false)
  // Parent-specific: search by receipt number
  const [receiptSearch, setReceiptSearch] = useState('')
  const [searchResult, setSearchResult] = useState<PaymentData | null>(null)
  const [searching, setSearching] = useState(false)

  // Staff: receipt ID search
  const [staffReceiptSearch, setStaffReceiptSearch] = useState('')
  const [staffSearchResult, setStaffSearchResult] = useState<PaymentData | null>(null)
  const [staffSearching, setStaffSearching] = useState(false)
  const [scanning, setScanning] = useState(false)

  async function handleViewReceipt(paymentId: string) {
    setReceiptLoading(true)
    try {
      const res = await authFetch(`/api/payments/receipt/${paymentId}`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      setReceiptUrl(url)
    } catch {
      toast.error('Erreur lors du chargement du reçu')
    }
    finally { setReceiptLoading(false) }
  }

  async function handleParentReceiptSearch() {
    if (!receiptSearch.trim()) { toast.error('Entrez un numéro de reçu'); return }
    setSearching(true)
    setSearchResult(null)
    try {
      // Search in children's payments
      if (userData?.id) {
        const childrenRes = await authFetch(`/api/students?parentId=${userData.id}&limit=20`)
        const childrenJson = await childrenRes.json()
        const children: { id: string }[] = childrenJson.data || []

        let found: PaymentData | null = null
        for (const child of children) {
          const pRes = await authFetch(`/api/payments?studentId=${child.id}&limit=50`)
          const pJson = await pRes.json()
          const childPayments: PaymentData[] = pJson.data || []
          const match = childPayments.find(p =>
            (p.receiptNumber && p.receiptNumber.toLowerCase() === receiptSearch.trim().toLowerCase()) ||
            (p.referenceNumber && p.referenceNumber.toLowerCase() === receiptSearch.trim().toLowerCase()) ||
            p.id.slice(-8).toLowerCase() === receiptSearch.trim().toLowerCase()
          )
          if (match) { found = match; break }
        }
        setSearchResult(found)
        if (!found) {
          toast.error('Aucun reçu trouvé avec ce numéro. Vérifiez le numéro et réessayez.')
        }
      }
    } catch {
      toast.error('Erreur lors de la recherche')
    }
    finally { setSearching(false) }
  }

  // ===== PARENT VIEW =====
  if (isParent) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Vérifier un reçu</h1>
        </div>

        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl grid place-items-center" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
              <CheckCircle size={20} className="text-white" />
            </div>
            <div>
              <h3 className="font-semibold" style={{ color: TEXT_PRIMARY }}>Vérification de reçu</h3>
              <p className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Entrez le numéro de reçu pour vérifier son authenticité</p>
            </div>
          </div>

          <div className="flex gap-3 mb-4">
            <input
              placeholder="Ex: REC-M1A2B3C4 ou numéro du reçu"
              value={receiptSearch}
              onChange={e => setReceiptSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleParentReceiptSearch()}
              className="flex-1 px-4 py-3 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)]"
            />
            <button
              onClick={handleParentReceiptSearch}
              disabled={searching}
              className="edu-gold-cta px-6 py-3 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
            >
              {searching ? <div className="h-4 w-4 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Search size={14} />}
              Vérifier
            </button>
          </div>

          {searchResult && (
            <div className="border border-[oklch(90%_0.01_175)] rounded-2xl overflow-hidden mt-4">
              {/* Receipt Found Banner */}
              <div className="px-5 py-4 flex items-center gap-3" style={{ background: `${SUCCESS}10` }}>
                <div className="w-10 h-10 rounded-full grid place-items-center" style={{ background: SUCCESS }}>
                  <CheckCircle size={20} className="text-white" />
                </div>
                <div>
                  <div className="font-semibold" style={{ color: SUCCESS }}>Reçu vérifié ✓</div>
                  <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Ce reçu est authentique et a été enregistré dans le système</div>
                </div>
              </div>

              {/* Receipt Details */}
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs font-medium mb-1" style={{ color: TEXT_MUTED_LUXE }}>N° du reçu</div>
                    <div className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>{searchResult.receiptNumber || `REC-${searchResult.id.slice(-8).toUpperCase()}`}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium mb-1" style={{ color: TEXT_MUTED_LUXE }}>Élève</div>
                    <div className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>
                      {searchResult.student ? `${searchResult.student.firstName} ${searchResult.student.lastName}` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium mb-1" style={{ color: TEXT_MUTED_LUXE }}>Montant total</div>
                    <div className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>{formatNumber(searchResult.amount)} CDF</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium mb-1" style={{ color: TEXT_MUTED_LUXE }}>Montant payé</div>
                    <div className="text-sm font-semibold" style={{ color: SUCCESS }}>{formatNumber(searchResult.paidAmount)} CDF</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium mb-1" style={{ color: TEXT_MUTED_LUXE }}>Trimestre</div>
                    <div className="text-sm" style={{ color: TEXT_PRIMARY }}>{searchResult.trimester}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium mb-1" style={{ color: TEXT_MUTED_LUXE }}>Statut</div>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${getStatusPill(searchResult.status)}`}>
                      {searchResult.status === 'PAID' ? '✓ Payé' : searchResult.status === 'PARTIAL' ? '◯ Partiel' : searchResult.status === 'OVERDUE' ? '⚠ En retard' : '◯ En attente'}
                    </span>
                  </div>
                  {searchResult.verifiedBy && (
                    <>
                      <div>
                        <div className="text-xs font-medium mb-1" style={{ color: TEXT_MUTED_LUXE }}>Vérifié par</div>
                        <div className="text-sm font-semibold" style={{ color: SUCCESS }}>{String(searchResult.verifiedBy)}</div>
                      </div>
                      <div>
                        <div className="text-xs font-medium mb-1" style={{ color: TEXT_MUTED_LUXE }}>Date de vérification</div>
                        <div className="text-sm" style={{ color: TEXT_PRIMARY }}>
                          {searchResult.verifiedAt ? new Date(String(searchResult.verifiedAt)).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {searchResult.verificationNote && (
                  <div className="bg-[oklch(97%_0.005_175)] rounded-xl p-3">
                    <div className="text-xs font-medium mb-1" style={{ color: TEXT_MUTED_LUXE }}>Note du vérificateur</div>
                    <div className="text-sm" style={{ color: TEXT_PRIMARY }}>{String(searchResult.verificationNote)}</div>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => handleViewReceipt(searchResult.id)}
                    disabled={receiptLoading}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)' }}
                  >
                    {receiptLoading ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FileText size={14} />}
                    Voir le reçu PDF
                  </button>
                  <button
                    onClick={() => { downloadReceiptFile(searchResult.id) }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)] transition"
                    style={{ color: TEXT_PRIMARY }}
                  >
                    <Download size={14} /> Télécharger
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Receipt PDF Viewer Modal */}
        {receiptUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => { URL.revokeObjectURL(receiptUrl); setReceiptUrl(null) }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl grid place-items-center text-white" style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)' }}>
                    <FileText size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Reçu de Paiement</h2>
                    <p className="text-xs text-gray-500">Reçu vérifié</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a href={receiptUrl} download className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition hover:opacity-90" style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)' }}>
                    <Download size={14} /> Télécharger
                  </a>
                  <button onClick={() => { URL.revokeObjectURL(receiptUrl); setReceiptUrl(null) }} className="w-9 h-9 rounded-lg grid place-items-center hover:bg-gray-100 transition">
                    <X size={18} className="text-gray-500" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden rounded-b-2xl">
                <iframe src={receiptUrl} className="w-full h-[70vh] border-0" title="Reçu PDF" />
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ===== STAFF VIEW (Admin, Cashier, Secretary) =====
  async function downloadReceiptFile(paymentId: string) {
    try {
      const res = await authFetch(`/api/payments/receipt/${paymentId}`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const payment = payments.find(p => p.id === paymentId)
      a.download = `recu-${payment?.receiptNumber || paymentId.slice(-8)}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Erreur lors du téléchargement du reçu')
    }
  }

  async function handleStaffReceiptSearch() {
    if (!staffReceiptSearch.trim()) { toast.error('Entrez un numéro de reçu'); return }
    setStaffSearching(true)
    setStaffSearchResult(null)
    try {
      const res = await authFetch(`/api/payments?schoolId=${userData?.schoolId}&limit=500`)
      const json = await res.json()
      const allPayments: PaymentData[] = json.data || []
      const q = staffReceiptSearch.trim().toLowerCase()
      const qNoHyphens = q.replace(/-/g, '')
      const match = allPayments.find(p => {
        if (p.receiptNumber && p.receiptNumber.toLowerCase() === q) return true
        if (p.referenceNumber && p.referenceNumber.toLowerCase() === q) return true
        if (p.id.toLowerCase() === q) return true
        if (p.id.toLowerCase().replace(/-/g, '') === qNoHyphens) return true
        if (p.id.slice(-8).toLowerCase() === q.slice(-8)) return true
        if (q.includes(p.id.toLowerCase()) || q.includes(p.id.slice(-8).toLowerCase())) return true
        if (p.receiptNumber && q.includes(p.receiptNumber.toLowerCase())) return true
        if (p.referenceNumber && q.includes(p.referenceNumber.toLowerCase())) return true
        return false
      })
      setStaffSearchResult(match || null)
      if (!match) toast.error('Aucun reçu trouvé avec ce numéro')
    } catch {
      toast.error('Erreur lors de la recherche')
    }
    finally { setStaffSearching(false) }
  }

  async function handleScanReceipt() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*,.pdf'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      setScanning(true)
      const rawName = file.name.replace(/\.[^.]+$/, '')
      const cleanedName = rawName.replace(/^recu[-_]?/i, '').replace(/^receipt[-_]?/i, '').replace(/^facture[-_]?/i, '')
      setStaffReceiptSearch(cleanedName)
      toast.success('Fichier importé. Recherche du reçu...')
      setTimeout(() => {
        setScanning(false)
        setStaffReceiptSearch(cleanedName)
        setStaffSearching(true)
        authFetch(`/api/payments?schoolId=${userData?.schoolId}&limit=500`)
          .then(r => r.json())
          .then(json => {
            const allPayments: PaymentData[] = json.data || []
            const searchLower = cleanedName.toLowerCase()
            const rawLower = rawName.toLowerCase()
            const searchNoHyphens = searchLower.replace(/-/g, '')
            const match = allPayments.find(p => {
              if (p.receiptNumber && (p.receiptNumber.toLowerCase() === searchLower || p.receiptNumber.toLowerCase() === rawLower)) return true
              if (p.referenceNumber && (p.referenceNumber.toLowerCase() === searchLower || p.referenceNumber.toLowerCase() === rawLower)) return true
              if (p.id.toLowerCase() === rawLower || p.id.toLowerCase() === searchLower) return true
              if (p.id.toLowerCase().replace(/-/g, '') === searchNoHyphens) return true
              if (p.id.slice(-8).toLowerCase() === searchLower.slice(-8) || p.id.slice(-8).toLowerCase() === rawLower.slice(-8)) return true
              if (rawLower.includes(p.id.toLowerCase()) || rawLower.includes(p.id.slice(-8).toLowerCase())) return true
              if (searchLower.includes(p.id.toLowerCase()) || searchLower.includes(p.id.slice(-8).toLowerCase())) return true
              if (p.receiptNumber && (rawLower.includes(p.receiptNumber.toLowerCase()) || searchLower.includes(p.receiptNumber.toLowerCase()))) return true
              if (p.referenceNumber && (rawLower.includes(p.referenceNumber.toLowerCase()) || searchLower.includes(p.referenceNumber.toLowerCase()))) return true
              return false
            })
            setStaffSearchResult(match || null)
            if (!match) toast.error('Aucun reçu trouvé pour ce fichier')
          })
          .catch(() => toast.error('Erreur lors de la recherche'))
          .finally(() => setStaffSearching(false))
      }, 500)
    }
    input.click()
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Vérification des paiements</h1>
      </div>

      {/* Search Card */}
      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl grid place-items-center" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
            <CheckCircle size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-semibold" style={{ color: TEXT_PRIMARY }}>Vérifier un reçu</h3>
            <p className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Entrez le numéro du reçu ou importez un fichier</p>
          </div>
        </div>

        <div className="flex gap-3">
          <input
            placeholder="Ex: REC-M1A2B3C4 ou les 8 derniers caractères de l'ID"
            value={staffReceiptSearch}
            onChange={e => setStaffReceiptSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleStaffReceiptSearch()}
            className="flex-1 px-4 py-3 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] focus:border-[oklch(72%_0.15_65_/_0.5)]"
            style={{ color: TEXT_PRIMARY }}
          />
          <button
            onClick={handleStaffReceiptSearch}
            disabled={staffSearching}
            className="edu-gold-cta px-6 py-3 rounded-xl text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
          >
            {staffSearching ? <div className="h-4 w-4 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Search size={14} />}
            Vérifier
          </button>
          <button
            onClick={handleScanReceipt}
            disabled={scanning}
            className="px-4 py-3 rounded-xl text-sm font-semibold inline-flex items-center gap-2 border border-[oklch(90%_0.01_175)] hover:border-[oklch(72%_0.15_65)] hover:shadow-sm transition disabled:opacity-50"
            style={{ color: TEXT_PRIMARY }}
          >
            {scanning ? <div className="h-4 w-4 border-2 border-[oklch(72%_0.15_65)] border-t-transparent rounded-full animate-spin" /> : <Upload size={14} />}
            Importer
          </button>
        </div>
      </div>

      {/* Search Result */}
      {staffSearchResult && (
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 flex items-center gap-3" style={{ background: `${SUCCESS}10` }}>
            <div className="w-10 h-10 rounded-full grid place-items-center" style={{ background: SUCCESS }}>
              <CheckCircle size={20} className="text-white" />
            </div>
            <div>
              <div className="font-semibold" style={{ color: SUCCESS }}>Reçu trouvé</div>
              <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>{staffSearchResult.receiptNumber || `REC-${staffSearchResult.id.slice(-8).toUpperCase()}`}</div>
            </div>
            <div className="ml-auto">
              {staffSearchResult.status === 'PAID' && !staffSearchResult.verifiedBy && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium" style={{ background: `${WARNING}15`, color: WARNING }}>Non vérifié</span>
              )}
              {staffSearchResult.verifiedBy && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium" style={{ background: `${SUCCESS}15`, color: SUCCESS }}>Vérifié</span>
              )}
            </div>
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <div className="text-xs font-medium mb-1" style={{ color: TEXT_MUTED_LUXE }}>Élève</div>
                <div className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>
                  {staffSearchResult.student ? `${staffSearchResult.student.firstName} ${staffSearchResult.student.lastName}` : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium mb-1" style={{ color: TEXT_MUTED_LUXE }}>Matricule</div>
                <div className="text-sm" style={{ color: TEXT_PRIMARY }}>{staffSearchResult.student?.matricule || '—'}</div>
              </div>
              <div>
                <div className="text-xs font-medium mb-1" style={{ color: TEXT_MUTED_LUXE }}>Trimestre</div>
                <div className="text-sm" style={{ color: TEXT_PRIMARY }}>{staffSearchResult.trimester}</div>
              </div>
              <div>
                <div className="text-xs font-medium mb-1" style={{ color: TEXT_MUTED_LUXE }}>Montant total</div>
                <div className="text-sm font-semibold" style={{ color: TEXT_PRIMARY }}>{formatNumber(staffSearchResult.amount)} CDF</div>
              </div>
              <div>
                <div className="text-xs font-medium mb-1" style={{ color: TEXT_MUTED_LUXE }}>Montant payé</div>
                <div className="text-sm font-semibold" style={{ color: SUCCESS }}>{formatNumber(staffSearchResult.paidAmount)} CDF</div>
              </div>
              <div>
                <div className="text-xs font-medium mb-1" style={{ color: TEXT_MUTED_LUXE }}>Reste à payer</div>
                <div className="text-sm font-semibold" style={{ color: staffSearchResult.amount - staffSearchResult.paidAmount > 0 ? DANGER : SUCCESS }}>
                  {formatNumber(staffSearchResult.amount - staffSearchResult.paidAmount)} CDF
                </div>
              </div>
              <div>
                <div className="text-xs font-medium mb-1" style={{ color: TEXT_MUTED_LUXE }}>Mode de paiement</div>
                <div className="text-sm" style={{ color: TEXT_PRIMARY }}>{staffSearchResult.paymentMethod || '—'}</div>
              </div>
              <div>
                <div className="text-xs font-medium mb-1" style={{ color: TEXT_MUTED_LUXE }}>Statut</div>
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${getStatusPill(staffSearchResult.status)}`}>
                  {staffSearchResult.status === 'PAID' ? '✓ Payé' : staffSearchResult.status === 'PARTIAL' ? '◯ Partiel' : staffSearchResult.status === 'REJECTED' ? '✗ Rejeté' : '◯ En attente'}
                </span>
              </div>
              {staffSearchResult.verifiedBy && (
                <>
                  <div>
                    <div className="text-xs font-medium mb-1" style={{ color: TEXT_MUTED_LUXE }}>Vérifié par</div>
                    <div className="text-sm font-semibold" style={{ color: SUCCESS }}>{String(staffSearchResult.verifiedBy)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium mb-1" style={{ color: TEXT_MUTED_LUXE }}>Date de vérification</div>
                    <div className="text-sm" style={{ color: TEXT_PRIMARY }}>
                      {staffSearchResult.verifiedAt ? new Date(String(staffSearchResult.verifiedAt)).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </div>
                  </div>
                </>
              )}
            </div>

            {staffSearchResult.verificationNote && (
              <div className="bg-[oklch(97%_0.005_175)] rounded-xl p-3">
                <div className="text-xs font-medium mb-1" style={{ color: TEXT_MUTED_LUXE }}>Note du vérificateur</div>
                <div className="text-sm" style={{ color: TEXT_PRIMARY }}>{String(staffSearchResult.verificationNote)}</div>
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={() => handleViewReceipt(staffSearchResult.id)}
                disabled={receiptLoading}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)' }}
              >
                {receiptLoading ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FileText size={14} />}
                Voir le reçu PDF
              </button>
              <button
                onClick={() => downloadReceiptFile(staffSearchResult.id)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)] transition"
                style={{ color: TEXT_PRIMARY }}
              >
                <Download size={14} /> Télécharger
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt PDF Viewer Modal */}
      {receiptUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => { URL.revokeObjectURL(receiptUrl); setReceiptUrl(null) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl grid place-items-center text-white" style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)' }}>
                  <FileText size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Reçu de Paiement</h2>
                  <p className="text-xs text-gray-500">Vérification du reçu</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a href={receiptUrl} download className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition hover:opacity-90" style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)' }}>
                  <Download size={14} /> Télécharger
                </a>
                <button onClick={() => { URL.revokeObjectURL(receiptUrl); setReceiptUrl(null) }} className="w-9 h-9 rounded-lg grid place-items-center hover:bg-gray-100 transition">
                  <X size={18} className="text-gray-500" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden rounded-b-2xl">
              <iframe src={receiptUrl} className="w-full h-[70vh] border-0" title="Reçu PDF" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// DisciplineView imported from @/components/views/DisciplineView

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
  const [scope, setScope] = useState('')
  const { userData, userRole } = useEduGestStore()
  const [totalUsers, setTotalUsers] = useState(0)
  const [expandedComm, setExpandedComm] = useState<string | null>(null)
  const canCreate = ['SUPER_ADMIN_GLOBAL', 'SECRETARY', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE'].includes(userRole || '')
  const isDirection = ['DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE'].includes(userRole || '')
  const pendingCount = comms.filter(c => c.status === 'PENDING').length

  useEffect(() => {
    authFetch(`/api/communications?limit=20${userData?.schoolId ? `&schoolId=${userData.schoolId}` : ''}`).then(r => r.json()).then(j => {
      const data = j.data || []
      setComms(data)
      setTotalUsers(j.totalUsers || 0)
      setLoading(false)
      if (userData?.id && !canCreate) {
        data.forEach((c: CommunicationData) => {
          authFetch(`/api/communications/${c.id}/read`, { method: 'POST' }).catch(() => {})
        })
      }
    }).catch(() => setLoading(false))
  }, [userData?.schoolId, userData?.id, canCreate])

  async function handleSend() {
    if (!title || !content) return toast.error('Titre et contenu requis')
    try {
      const res = await authFetch('/api/communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderId: userData?.id || 'demo', senderRole: userData?.role || 'SECRETARY',
          schoolId: userData?.schoolId || 'demo', type, title, content, targetType,
          sentToApp: app, sentToWhatsapp: whatsapp, scope: scope || undefined,
        }),
      })
      if (res.ok) {
        toast.success('Communication envoyée!')
        setTitle(''); setContent('')
        const json = await (await authFetch(`/api/communications?limit=20${userData?.schoolId ? `&schoolId=${userData.schoolId}` : ''}`)).json()
        setComms(json.data || [])
        setTotalUsers(json.totalUsers || 0)
      }
    } catch { toast.error('Erreur lors de l\'envoi') }
  }

  async function handleApprove(id: string, action: 'approve' | 'reject') {
    try {
      const res = await authFetch(`/api/communications/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.ok) {
        toast.success(action === 'approve' ? 'Communication approuvée !' : 'Communication rejetée')
        const json = await (await authFetch(`/api/communications?limit=20${userData?.schoolId ? `&schoolId=${userData.schoolId}` : ''}`)).json()
        setComms(json.data || [])
        setTotalUsers(json.totalUsers || 0)
      }
    } catch { toast.error('Erreur') }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Communications</h1>
        {canCreate && pendingCount > 0 && (
          <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-edu-warning/20 text-edu-warning">
            {pendingCount} en attente
          </span>
        )}
      </div>

      <div className={`grid grid-cols-1 gap-6 ${canCreate ? 'lg:grid-cols-[1fr_1fr]' : ''}`}>
        {/* Compose */}
        {canCreate && (
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
            {isDirection && (
              <select value={scope} onChange={e => setScope(e.target.value)} className="px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
                <option value="">Toutes les classes</option>
                <option value="MATERNELLE">Maternelle</option>
                <option value="PRIMAIRE">Primaire</option>
                <option value="SECONDAIRE">Secondaire</option>
              </select>
            )}
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
        )}

        {/* History */}
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4" style={{ color: TEXT_PRIMARY }}>Historique</h3>
          <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar">
            {loading ? <div className="text-center py-4" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</div> :
              comms.map(c => {
                const readCount = c.reads?.length || 0
                const readRate = totalUsers > 0 ? Math.round(readCount / totalUsers * 100) : 0
                const isExpanded = expandedComm === c.id
                return (
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
                      {c.status === 'PENDING' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[oklch(95%_0.04_25)] text-edu-warning">En attente</span>}
                      {c.status === 'REJECTED' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[oklch(95%_0.02_25)] text-edu-danger">Rejetée</span>}
                    </div>
                    {canCreate && c.status === 'PENDING' && (
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => handleApprove(c.id, 'approve')} className="text-[10px] px-2 py-1 rounded-lg bg-edu-success/10 text-edu-success hover:bg-edu-success/20">
                          Approuver
                        </button>
                        <button onClick={() => handleApprove(c.id, 'reject')} className="text-[10px] px-2 py-1 rounded-lg bg-edu-danger/10 text-edu-danger hover:bg-edu-danger/20">
                          Rejeter
                        </button>
                      </div>
                    )}
                    {/* Read stats - only for admin/direction roles */}
                    {canCreate && (
                    <div className="mt-2 pt-2 border-t border-[oklch(93%_0.01_175)]">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: readRate >= 80 ? SUCCESS : readRate >= 50 ? WARNING : DANGER }} />
                          <span className="text-xs font-medium" style={{ color: TEXT_PRIMARY }}>{readCount}/{totalUsers} lu{readCount > 1 ? 's' : ''}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: readRate >= 80 ? `${SUCCESS}15` : readRate >= 50 ? `${WARNING}15` : `${DANGER}15`, color: readRate >= 80 ? SUCCESS : readRate >= 50 ? WARNING : DANGER }}>{readRate}%</span>
                        </div>
                        <button onClick={() => {
                          const newExpanded = isExpanded ? null : c.id
                          setExpandedComm(newExpanded)
                        }} className="text-[10px] px-2 py-0.5 rounded-lg hover:bg-[oklch(95%_0.01_175)] transition" style={{ color: TEXT_MUTED_LUXE }}>
                          {isExpanded ? 'Masquer' : 'Détails'}
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="mt-2 space-y-1">
                          {c.reads && c.reads.length > 0 ? (
                            c.reads.map(r => (
                              <div key={r.id} className="flex items-center justify-between text-[11px] py-1 px-2 rounded-lg bg-[oklch(97%_0.005_175)]">
                                <div className="flex items-center gap-2">
                                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold" style={{ background: `${ACCENT}20`, color: ACCENT }}>{r.user?.name?.charAt(0) || '?'}</div>
                                  <span style={{ color: TEXT_PRIMARY }}>{r.user?.name || 'Inconnu'}</span>
                                  <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: `${INFO}15`, color: INFO }}>{r.user?.role}</span>
                                </div>
                                <span style={{ color: TEXT_MUTED_LUXE }}>{r.readAt ? new Date(r.readAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                              </div>
                            ))
                          ) : (
                            <div className="text-[11px] py-2 text-center" style={{ color: TEXT_MUTED_LUXE }}>Aucune lecture pour le moment</div>
                          )}
                        </div>
                      )}
                    </div>
                    )}
                  </div>
                )
              })
            }
          </div>
        </div>
      </div>
    </div>
  )
}

// ===== HOMEWORK VIEW =====
function HomeworkView() {
  const { userData, userRole } = useEduGestStore()
  const [homework, setHomework] = useState<HomeworkData[]>([])
  const [loading, setLoading] = useState(true)
  const isTeacher = userRole === 'TEACHER' || userRole === 'HEAD_TEACHER'
  const isParent = userRole === 'PARENT'
  const [showForm, setShowForm] = useState(false)
  const [hwTitle, setHwTitle] = useState('')
  const [hwDesc, setHwDesc] = useState('')
  const [hwSubject, setHwSubject] = useState('')
  const [hwClassId, setHwClassId] = useState('')
  const [hwDueDate, setHwDueDate] = useState('')
  const [classes, setClasses] = useState<{ id: string; name: string; level?: string }[]>([])
  const [submitting, setSubmitting] = useState(false)

  // Auto-fill subject from teacher's profile
  useEffect(() => {
    if (isTeacher && userData?.subjectName) {
      setTimeout(() => setHwSubject(userData.subjectName || ''), 0)
    }
  }, [isTeacher, userData])

  useEffect(() => {
    if (isParent && userData?.id) {
      authFetch(`/api/homework?parentId=${userData.id}&limit=30`).then(r => r.json()).then(j => { setHomework(j.data || []); setLoading(false) }).catch(() => setLoading(false))
    } else if (userData?.schoolId) {
      authFetch(`/api/homework?schoolId=${userData.schoolId}&limit=30`).then(r => r.json()).then(j => { setHomework(j.data || []); setLoading(false) }).catch(() => setLoading(false))
    } else {
      authFetch('/api/homework?limit=30').then(r => r.json()).then(j => { setHomework(j.data || []); setLoading(false) }).catch(() => setLoading(false))
    }
  }, [isParent, userData?.id, userData?.schoolId])

  useEffect(() => {
    if (isTeacher && userData?.schoolId) {
      authFetch(`/api/classes?limit=50&schoolId=${userData.schoolId}`).then(r => r.json()).then(j => setClasses(j.data || [])).catch(() => {})
    }
  }, [isTeacher, userData?.schoolId])

  async function handleAddHomework() {
    if (!hwTitle || !hwSubject || !hwClassId || !hwDueDate || !userData?.schoolId) {
      toast.error('Veuillez remplir tous les champs obligatoires')
      return
    }
    setSubmitting(true)
    try {
      const res = await authFetch('/api/homework', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: hwTitle,
          description: hwDesc,
          subjectName: hwSubject,
          classId: hwClassId,
          teacherName: userData?.name || 'Professeur',
          teacherId: userData?.id,
          isTitulaire: userData?.isTitulaire || false,
          dueDate: hwDueDate,
          schoolId: userData.schoolId,
        }),
      })
      if (res.ok) {
        toast.success('Devoir ajouté avec succès !')
        setShowForm(false)
        setHwTitle(''); setHwDesc(''); setHwClassId(''); setHwDueDate('')
        // Don't reset hwSubject - keep it for the teacher
        // Refresh
        authFetch(`/api/homework?schoolId=${userData.schoolId}&limit=30`).then(r => r.json()).then(j => setHomework(j.data || [])).catch(() => {})
      } else {
        toast.error('Erreur lors de l\'ajout')
      }
    } catch {
      toast.error('Erreur de connexion')
    }
    setSubmitting(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Devoirs</h1>
        </div>
        {isTeacher && (
          <button onClick={() => setShowForm(!showForm)} className="edu-gold-cta px-4 py-2 rounded-xl text-sm font-semibold inline-flex items-center gap-2">
            <Plus size={14} /> Nouveau devoir
          </button>
        )}
      </div>

      {/* Add Homework Form */}
      {isTeacher && showForm && (
        <div className="bg-white border-2 border-[oklch(72%_0.15_65_/_0.3)] rounded-2xl p-6 shadow-md mb-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: TEXT_PRIMARY }}>
            <PenTool size={16} style={{ color: GOLD }} /> Nouveau devoir
            {(userData?.isTitulaire) && (
              <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ background: GOLD_SOFT, color: GOLD }}>Titulaire</span>
            )}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Titre *</label>
              <input value={hwTitle} onChange={e => setHwTitle(e.target.value)} placeholder="Ex: Exercices de calcul" className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Matière *</label>
              <input value={hwSubject} onChange={e => setHwSubject(e.target.value)} placeholder="Ex: Mathématiques" className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Classe *</label>
              <select value={hwClassId} onChange={e => setHwClassId(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
                <option value="">Sélectionner une classe</option>
                {(() => {
                  // Filter classes by teacher's classNames assignment (if available)
                  const myClassNames = (userData?.classNames || '').split(',').map((s: string) => s.trim()).filter(Boolean);
                  const filtered = myClassNames.length > 0
                    ? classes.filter(c => myClassNames.includes(c.name))
                    : classes;
                  return filtered.map(c => <option key={c.id} value={c.id}>{c.name}</option>);
                })()}
              </select>
              {userData?.classNames && (
                <p className="text-[11px] mt-1" style={{ color: TEXT_MUTED_LUXE }}>
                  Classes assignées: {userData.classNames}
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Date limite *</label>
              <input type="date" value={hwDueDate} onChange={e => setHwDueDate(e.target.value)} className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Description</label>
              <textarea value={hwDesc} onChange={e => setHwDesc(e.target.value)} rows={3} placeholder="Instructions pour le devoir..." className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] resize-none" />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleAddHomework} disabled={submitting || !hwTitle || !hwSubject || !hwClassId || !hwDueDate} className="edu-gold-cta px-6 py-2.5 rounded-xl font-semibold text-sm inline-flex items-center gap-2 disabled:opacity-50">
              {submitting ? <div className="h-4 w-4 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Check size={14} />}
              Ajouter le devoir
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2.5 rounded-xl text-sm font-medium border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)]" style={{ color: TEXT_MUTED_LUXE }}>Annuler</button>
          </div>
        </div>
      )}

      {loading ? <div className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</div> : homework.length === 0 ? (
        <div className="text-center py-8">
          <PenTool size={32} className="mx-auto mb-3" style={{ color: TEXT_MUTED_LUXE }} />
          <p className="font-medium" style={{ color: TEXT_PRIMARY }}>Aucun devoir</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {homework.map(h => (
            <div key={h.id} className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-5 shadow-sm edu-card-lift">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold" style={{ color: TEXT_PRIMARY }}>{h.title}</h3>
                <span className="text-xs px-2 py-1 rounded-full shrink-0" style={{ color: GOLD, background: GOLD_SOFT }}>{h.subjectName}</span>
              </div>
              <p className="text-sm mb-3 line-clamp-2" style={{ color: TEXT_MUTED_LUXE }}>{h.description}</p>
              <div className="flex items-center justify-between text-xs" style={{ color: TEXT_MUTED_LUXE }}>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1" style={{ color: GOLD }}><Calendar size={12} /> Échéance: {formatDate(h.dueDate)}</span>
                  {h.class?.name && <span className="px-1.5 py-0.5 rounded-md text-[10px] font-medium" style={{ background: IVORY, color: TEXT_MUTED_LUXE }}>{h.class.name}</span>}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-medium" style={{ color: TEXT_PRIMARY }}>{h.teacherName}</span>
                  {h.isTitulaire && (
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: GOLD_SOFT, color: GOLD }}>Titulaire</span>
                  )}
                </div>
              </div>
              {/* For parents: show course + teacher + titulaire prominently */}
              {isParent && (
                <div className="mt-3 pt-3 border-t border-[oklch(90%_0.01_175)]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold" style={{ background: GOLD_SOFT, color: GOLD }}>
                      <BookOpen size={10} /> {h.subjectName}
                    </span>
                    <span className="text-[11px] font-medium" style={{ color: TEXT_PRIMARY }}>
                      Par {h.teacherName}
                    </span>
                    {h.isTitulaire && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold" style={{ background: 'oklch(94% 0.05 145)', color: SUCCESS }}>
                        <Award size={10} /> Titulaire
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ProfileView imported from @/components/views/ProfileView

// ===== CLASS PASSING VIEW =====
function ClassPassingView() {
  const { userData, userRole } = useEduGestStore()
  const allowedRoles = ['SUPER_ADMIN_GLOBAL', 'ADMIN', 'SECRETARY', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE', 'HEAD_TEACHER']
  const canAccess = allowedRoles.includes(userRole || '')
  const [students, setStudents] = useState<StudentData[]>([])
  const [loading, setLoading] = useState(true)
  const [studentSearch, setStudentSearch] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [studentSuggestions, setStudentSuggestions] = useState<AutocompleteItem[]>([])
  const [studentSearchLoading, setStudentSearchLoading] = useState(false)
  const [decisions, setDecisions] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [selectedTrimester, setSelectedTrimester] = useState('T1')

  useEffect(() => {
    const params = new URLSearchParams({ limit: '50' })
    if (userData?.schoolId) params.set('schoolId', userData.schoolId)
    authFetch(`/api/students?${params}`).then(r => r.json()).then(j => { setStudents(j.data || []); setLoading(false) }).catch(() => setLoading(false))
  }, [userData?.schoolId])

  // Load existing decisions
  useEffect(() => {
    if (!userData?.schoolId) return
    authFetch(`/api/report-cards?trimester=${selectedTrimester}&schoolId=${userData.schoolId}`)
      .then(r => r.json())
      .then(j => {
        const existing: Record<string, string> = {}
        for (const rc of (j.data || [])) {
          if (rc.decision) existing[rc.studentId] = rc.decision
        }
        setDecisions(prev => ({ ...existing, ...prev }))
      })
      .catch(() => {})
  }, [userData?.schoolId, selectedTrimester])

  // Student search autocomplete
  useEffect(() => {
    if (studentSearch.length < 2) return
    const timer = setTimeout(() => {
      setStudentSearchLoading(true)
      authFetch(`/api/students?search=${encodeURIComponent(studentSearch)}&limit=8${userData?.schoolId ? `&schoolId=${userData.schoolId}` : ''}`)
        .then(r => r.json())
        .then(j => {
          setStudentSuggestions((j.data || []).map((s: StudentData) => ({
            id: s.id, label: `${s.firstName} ${s.lastName}`, sublabel: `${s.matricule} · ${s.class?.name || ''}`, photoUrl: s.photoUrl
          })))
          setStudentSearchLoading(false)
        })
        .catch(() => setStudentSearchLoading(false))
    }, 300)
    return () => { clearTimeout(timer); setStudentSearchLoading(false) }
  }, [studentSearch, userData?.schoolId])

  const filteredStudents = selectedStudentId
    ? students.filter(s => s.id === selectedStudentId)
    : studentSearch.length >= 2
      ? students.filter(s => `${s.firstName} ${s.lastName}`.toLowerCase().includes(studentSearch.toLowerCase()) || s.matricule.toLowerCase().includes(studentSearch.toLowerCase()))
      : students

  return (
    <div>
      {!canAccess ? (
        <div className="text-center py-12 bg-white border border-[oklch(90%_0.01_175)] rounded-2xl">
          <p className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>Vous n&apos;avez pas accès à cette page</p>
        </div>
      ) : (
      <>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Passage de classe</h1>
          </div>
          <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>{formatNumber(filteredStudents.length)} élèves</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={selectedTrimester} onChange={e => setSelectedTrimester(e.target.value)} className="px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
            <option value="T1">Trimestre 1</option><option value="T2">Trimestre 2</option><option value="T3">Trimestre 3</option>
          </select>
          <SearchAutocomplete
            placeholder="Tapez le nom de l'élève..."
            items={studentSuggestions}
            selectedId={selectedStudentId}
            onSelect={(item) => { setSelectedStudentId(item.id); setStudentSearch('') }}
            onClear={() => { setSelectedStudentId(null); setStudentSearch('') }}
            searchQuery={studentSearch}
            onSearchChange={setStudentSearch}
            loading={studentSearchLoading}
            itemTypeName="élève"
            className="w-full max-w-sm"
          />
        </div>
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
              ) : filteredStudents.slice(0, 50).map(s => (
                <tr key={s.id} className="hover:bg-[oklch(97%_0.005_175)] transition border-b border-[oklch(90%_0.01_175)] last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <StudentAvatar firstName={s.firstName} lastName={s.lastName} photoUrl={s.photoUrl} size={32} className="text-white font-semibold" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }} />
                      <div>
                        <div className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>{s.firstName} {s.lastName}</div>
                        <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{s.matricule}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[13px]" style={{ color: TEXT_MUTED_LUXE }}>{s.class?.name || '—'}</td>
                  <td className="px-4 py-3">
                    <select value={decisions[s.id] || 'PENDING'} onChange={e => setDecisions(prev => ({ ...prev, [s.id]: e.target.value }))} className="px-2 py-1 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
                      <option value="PENDING">En attente</option><option value="PASSED">Passage</option><option value="REPEAT">Redouble</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={async () => {
                      const decision = decisions[s.id]
                      if (!decision || decision === 'PENDING') { toast.error('Sélectionnez une décision'); return }
                      setSavingId(s.id)
                      try {
                        const res = await authFetch('/api/report-cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: s.id, decision, trimester: selectedTrimester, schoolId: userData?.schoolId }) })
                        if (res.ok) toast.success('Décision enregistrée!')
                        else toast.error('Erreur lors de l\'enregistrement')
                      } catch { toast.error('Erreur réseau') }
                      finally { setSavingId(null) }
                    }} disabled={savingId === s.id} className="text-sm font-medium hover:underline disabled:opacity-50" style={{ color: GOLD }}>
                      {savingId === s.id ? '...' : 'Valider'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}
    </div>
  )
}

// ===== BULLETIN VIEW =====
function BulletinView() {
  const { userData, userRole } = useEduGestStore()
  const [grades, setGrades] = useState<GradeData[]>([])
  const [classes, setClasses] = useState<ClassData[]>([])
  const [loading, setLoading] = useState(true)
  const [studentSearch, setStudentSearch] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [studentSuggestions, setStudentSuggestions] = useState<AutocompleteItem[]>([])
  const [studentSearchLoading, setStudentSearchLoading] = useState(false)
  const [selectedTrimester, setSelectedTrimester] = useState('T1')
  const [selectedClassId, setSelectedClassId] = useState<string>('all')
  const isParent = userRole === 'PARENT'

  useEffect(() => {
    const params = new URLSearchParams({ limit: '200', trimester: selectedTrimester })
    if (isParent && userData?.id) {
      params.set('parentId', userData.id)
      if (selectedStudentId) { params.delete('parentId'); params.set('studentId', selectedStudentId) }
    } else {
      if (userData?.schoolId) params.set('schoolId', userData.schoolId)
    }
    authFetch(`/api/grades?${params}`).then(r => r.json()).then(j => { setGrades(j.data || []); setLoading(false) }).catch(() => setLoading(false))
  }, [selectedTrimester, userData?.schoolId, userData?.id, isParent, selectedStudentId])

  useEffect(() => {
    const params = new URLSearchParams()
    if (userData?.schoolId) params.set('schoolId', userData.schoolId)
    authFetch(`/api/classes?${params}`).then(r => r.json()).then(j => setClasses(j.data || [])).catch(() => {})
  }, [userData?.schoolId])

  useEffect(() => {
    if (studentSearch.length < 2) return
    const timer = setTimeout(() => {
      setStudentSearchLoading(true)
      authFetch(`/api/students?search=${encodeURIComponent(studentSearch)}&limit=8${userData?.schoolId ? `&schoolId=${userData.schoolId}` : ''}`)
        .then(r => r.json())
        .then(j => {
          setStudentSuggestions((j.data || []).map((s: StudentData) => ({
            id: s.id, label: `${s.firstName} ${s.lastName}`, sublabel: s.matricule, photoUrl: s.photoUrl
          })))
          setStudentSearchLoading(false)
        })
        .catch(() => setStudentSearchLoading(false))
    }, 300)
    return () => { clearTimeout(timer); setStudentSearchLoading(false) }
  }, [studentSearch, userData?.schoolId])

  const classMap = useMemo(() => Object.fromEntries(classes.map(c => [c.id, c])), [classes])

  const studentGrades = useMemo(() => {
    const map: Record<string, { student: GradeData['student']; grades: GradeData[]; classId: string }> = {}
    for (const g of grades) {
      if (!map[g.studentId]) map[g.studentId] = { student: g.student, grades: [], classId: g.classId }
      map[g.studentId].grades.push(g)
    }
    return map
  }, [grades])

  const filtered = useMemo(() => {
    let entries = Object.entries(studentGrades)
    if (selectedStudentId) entries = entries.filter(([id]) => id === selectedStudentId)
    else if (studentSearch.length >= 2) entries = entries.filter(([_, d]) => `${d.student?.firstName} ${d.student?.lastName}`.toLowerCase().includes(studentSearch.toLowerCase()))
    if (selectedClassId !== 'all') entries = entries.filter(([_, d]) => d.classId === selectedClassId)
    return entries
  }, [studentGrades, selectedStudentId, studentSearch, selectedClassId])

  const byClass = useMemo(() => {
    const groups: Record<string, { classId: string; className: string; students: { id: string; student: GradeData['student']; grades: GradeData[]; avg: number }[] }> = {}
    for (const [id, data] of filtered) {
      const cid = data.classId
      if (!groups[cid]) groups[cid] = { classId: cid, className: classMap[cid]?.name || 'Classe inconnue', students: [] }
      const avg = data.grades.length > 0 ? data.grades.reduce((s, g) => s + g.score * (g.subject?.coefficient || 1), 0) / data.grades.reduce((s, g) => s + (g.subject?.coefficient || 1), 0) : 0
      groups[cid].students.push({ id, student: data.student, grades: data.grades, avg })
    }
    for (const g of Object.values(groups)) g.students.sort((a, b) => b.avg - a.avg)
    return Object.values(groups).sort((a, b) => a.className.localeCompare(b.className, 'fr'))
  }, [filtered, classMap])

  const totalStudents = byClass.reduce((s, c) => s + c.students.length, 0)

  const handleDownload = async (id: string, lastName?: string) => {
    try {
      const res = await authFetch(`/api/bulletins/${id}?trimester=${selectedTrimester}${userData?.schoolId ? `&schoolId=${userData.schoolId}` : ''}`)
      if (!res.ok) { toast.error('Erreur lors du téléchargement'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `bulletin-${lastName || 'eleve'}-${selectedTrimester}.pdf`
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
      toast.success('Bulletin téléchargé !')
    } catch { toast.error('Erreur réseau') }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Bulletins</h1>
          </div>
          <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>{formatNumber(totalStudents)} bulletin{totalStudents > 1 ? 's' : ''} · {byClass.length} classe{byClass.length > 1 ? 's' : ''}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={selectedTrimester} onChange={e => { setSelectedTrimester(e.target.value); setLoading(true) }} className="px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
            <option value="T1">Trimestre 1</option><option value="T2">Trimestre 2</option><option value="T3">Trimestre 3</option>
          </select>
          <select value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)} className="px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]">
            <option value="all">Toutes les classes</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <SearchAutocomplete
            placeholder="Tapez le nom de l'élève..."
            items={studentSuggestions}
            selectedId={selectedStudentId}
            onSelect={(item) => { setSelectedStudentId(item.id); setStudentSearch('') }}
            onClear={() => { setSelectedStudentId(null); setStudentSearch('') }}
            searchQuery={studentSearch}
            onSearchChange={setStudentSearch}
            loading={studentSearchLoading}
            itemTypeName="élève"
            className="w-full max-w-xs"
          />
        </div>
      </div>
      {loading ? <div className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</div> : byClass.length === 0 ? (
        <div className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Aucun bulletin trouvé</div>
      ) : (
        <div className="space-y-6">
          {byClass.map(group => {
            const classAvg = group.students.length > 0 ? group.students.reduce((s, st) => s + st.avg, 0) / group.students.length : 0
            const passCount = group.students.filter(st => st.avg >= 10).length
            const passRate = group.students.length > 0 ? Math.round(passCount / group.students.length * 100) : 0
            return (
              <div key={group.classId} className="rounded-2xl border border-[oklch(90%_0.01_175)] bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-[oklch(93%_0.01_175)] flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${GOLD}15, ${ACCENT}15)` }}>
                      <GraduationCap size={18} style={{ color: GOLD }} />
                    </div>
                    <div>
                      <div className="font-bold" style={{ color: TEXT_PRIMARY }}>{group.className}</div>
                      <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{group.students.length} élève{group.students.length > 1 ? 's' : ''}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <div className="text-center">
                      <div className="font-bold text-sm" style={{ color: classAvg >= 10 ? GOLD : DANGER }}>{classAvg.toFixed(1)}%</div>
                      <div style={{ color: TEXT_MUTED_LUXE }}>Moy. classe</div>
                    </div>
                    <div className="text-center">
                      <div className="font-bold text-sm" style={{ color: SUCCESS }}>{passRate}%</div>
                      <div style={{ color: TEXT_MUTED_LUXE }}>Taux réussite</div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
                  {group.students.map((st, idx) => (
                    <div key={st.id} className="rounded-xl border border-[oklch(92%_0.01_175)] p-4 hover:shadow-md transition-all" style={{ background: idx === 0 && st.avg >= 10 ? `linear-gradient(135deg, ${GOLD}06, ${GOLD}03)` : undefined }}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: idx === 0 && st.avg >= 10 ? `linear-gradient(135deg, ${GOLD}, ${ACCENT})` : '#f3f4f6', color: idx === 0 && st.avg >= 10 ? '#fff' : TEXT_MUTED_LUXE }}>
                            {idx + 1}
                          </div>
                          <div>
                            <div className="font-semibold text-sm" style={{ color: TEXT_PRIMARY }}>{st.student?.firstName} {st.student?.lastName}</div>
                            <div className="text-[10px]" style={{ color: TEXT_MUTED_LUXE }}>{st.student?.matricule}</div>
                          </div>
                        </div>
                        <div className="text-xl font-bold" style={{ color: st.avg >= 10 ? GOLD : DANGER }}>{st.avg.toFixed(1)}%</div>
                      </div>
                      <div className="space-y-1 text-[11px] mb-3">
                        {st.grades.slice(0, 4).map(g => (
                          <div key={g.id} className="flex justify-between">
                            <span style={{ color: TEXT_MUTED_LUXE }}>{g.subject?.name}</span>
                            <span className="font-medium" style={{ color: g.score >= 10 ? GOLD : DANGER }}>{g.score.toFixed(1)}/20</span>
                          </div>
                        ))}
                        {st.grades.length > 4 && <div className="text-[10px]" style={{ color: TEXT_MUTED_LUXE }}>+{st.grades.length - 4} matière{st.grades.length - 4 > 1 ? 's' : ''}</div>}
                      </div>
                      <button onClick={() => handleDownload(st.id, st.student?.lastName)} className="w-full py-1.5 rounded-lg text-xs font-medium border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)] hover:shadow-sm transition inline-flex items-center justify-center gap-1.5" style={{ color: TEXT_PRIMARY }}>
                        <FileText size={12} /> Voir bulletin
                      </button>
                    </div>
                  ))}
                </div>
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
  const { userData, userRole } = useEduGestStore()
  const allowedRoles = ['SUPER_ADMIN_GLOBAL', 'ADMIN', 'SECRETARY', 'DIRECTION_MATERNELLE', 'DIRECTION_PRIMAIRE', 'DIRECTION_SECONDAIRE', 'DISCIPLINE_MATERNELLE', 'DISCIPLINE_PRIMAIRE', 'DISCIPLINE_SECONDAIRE']
  const canAccess = allowedRoles.includes(userRole || '')
  const [studentSearch, setStudentSearch] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [studentSuggestions, setStudentSuggestions] = useState<AutocompleteItem[]>([])
  const [studentSearchLoading, setStudentSearchLoading] = useState(false)
  const [motif, setMotif] = useState('')
  const [date, setDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [convocations, setConvocations] = useState<{ id: string; motif: string; date: string; status: string; student: { firstName: string; lastName: string; matricule: string; photoUrl?: string | null } }[]>([])
  const [loadingConvocations, setLoadingConvocations] = useState(true)

  // Student search autocomplete
  useEffect(() => {
    if (studentSearch.length < 2) return
    const timer = setTimeout(() => {
      setStudentSearchLoading(true)
      authFetch(`/api/students?search=${encodeURIComponent(studentSearch)}&schoolId=${userData?.schoolId || ''}&limit=8`)
        .then(r => r.json())
        .then(j => {
          setStudentSuggestions((j.data || []).map((s: StudentData) => ({
            id: s.id, label: `${s.firstName} ${s.lastName}`, sublabel: s.matricule, photoUrl: s.photoUrl
          })))
          setStudentSearchLoading(false)
        })
        .catch(() => setStudentSearchLoading(false))
    }, 300)
    return () => { clearTimeout(timer); setStudentSearchLoading(false) }
  }, [studentSearch, userData?.schoolId])

  // Load existing convocations
  useEffect(() => {
    if (userData?.schoolId) {
      authFetch(`/api/convocations?schoolId=${userData.schoolId}&limit=30`)
        .then(r => r.json())
        .then(j => { setConvocations(j.data || []); setLoadingConvocations(false) })
        .catch(() => setLoadingConvocations(false))
    } else {
      // eslint-disable-next-line react-hooks/purity
      queueMicrotask(() => setLoadingConvocations(false))
    }
  }, [userData?.schoolId])

  async function handleSendConvocation() {
    if (!selectedStudentId) { toast.error('Veuillez sélectionner un élève'); return }
    if (!motif) { toast.error('Veuillez entrer le motif'); return }
    if (!date) { toast.error('Veuillez entrer la date'); return }
    if (!userData?.schoolId) { toast.error('Erreur: école non trouvée'); return }
    setSubmitting(true)
    try {
      // Look up student to get parentId
      let parentId = null
      try {
        const studentRes = await authFetch(`/api/students/${selectedStudentId}`)
        const studentData = await studentRes.json()
        parentId = studentData.data?.parentId || null
      } catch { /* continue without parentId */ }

      const res = await authFetch('/api/convocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudentId,
          parentId,
          motif,
          date,
          schoolId: userData.schoolId,
          createdBy: userData.id,
        }),
      })
      if (res.ok) {
        toast.success('Convocation envoyée avec succès !')
        setMotif('')
        setDate('')
        setSelectedStudentId(null)
        setStudentSearch('')
        // Refresh convocations list
        const listRes = await authFetch(`/api/convocations?schoolId=${userData.schoolId}&limit=30`)
        const listJson = await listRes.json()
        setConvocations(listJson.data || [])
      } else {
        const json = await res.json()
        toast.error(json.error || 'Erreur lors de l\'envoi')
      }
    } catch {
      toast.error('Erreur de connexion')
    }
    setSubmitting(false)
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Convocations</h1>
      </div>
      {!canAccess ? (
        <div className="text-center py-12 bg-white border border-[oklch(90%_0.01_175)] rounded-2xl">
          <p className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>Vous n&apos;avez pas accès à cette page</p>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4" style={{ color: TEXT_PRIMARY }}>Nouvelle convocation</h3>
          <div className="space-y-3">
            <SearchAutocomplete
              label="Élève concerné"
              placeholder="Tapez le nom de l'élève..."
              items={studentSuggestions}
              selectedId={selectedStudentId}
              onSelect={(item) => { setSelectedStudentId(item.id); setStudentSearch('') }}
              onClear={() => { setSelectedStudentId(null); setStudentSearch('') }}
              searchQuery={studentSearch}
              onSearchChange={setStudentSearch}
              loading={studentSearchLoading}
              itemTypeName="élève"
            />
            <div><label className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>Motif</label><textarea placeholder="Motif de la convocation..." value={motif} onChange={e => setMotif(e.target.value)} rows={3} className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] resize-none" /></div>
            <div><label className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full mt-1 px-3 py-2 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)]" /></div>
            <button onClick={handleSendConvocation} disabled={submitting || !selectedStudentId || !motif || !date} className="edu-gold-cta w-full py-2.5 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50">
              {submitting ? <div className="h-4 w-4 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Send size={14} />} Envoyer la convocation
            </button>
          </div>
        </div>
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4" style={{ color: TEXT_PRIMARY }}>Convocations existantes</h3>
          {loadingConvocations ? (
            <div className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</div>
          ) : convocations.length === 0 ? (
            <div className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>
              <Megaphone size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Aucune convocation</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {convocations.map(c => (
                <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)] transition">
                  <StudentAvatar firstName={c.student.firstName} lastName={c.student.lastName} photoUrl={c.student.photoUrl} size={36} className="text-white font-semibold" style={{ background: `linear-gradient(135deg, ${WARNING}, ${GOLD})` }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium" style={{ color: TEXT_PRIMARY }}>{c.student.firstName} {c.student.lastName}</div>
                    <div className="text-[11px] truncate" style={{ color: TEXT_MUTED_LUXE }}>{c.motif}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${c.status === 'PENDING' ? 'bg-[oklch(94%_0.06_65)] text-[oklch(45%_0.13_65)]' : c.status === 'CONFIRMED' ? 'bg-[oklch(94%_0.05_145)] text-[oklch(40%_0.13_145)]' : 'bg-[oklch(94%_0.005_250)] text-[oklch(52%_0.015_250)]'}`}>{c.status === 'PENDING' ? 'En attente' : c.status === 'CONFIRMED' ? 'Confirmée' : c.status}</span>
                    <div className="text-[10px] mt-0.5" style={{ color: TEXT_MUTED_LUXE }}>{formatDate(c.date)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  )
}

// PersonnelView imported from @/components/views/PersonnelView

// SchoolsManagementView imported from @/components/views/SchoolsManagementView

// ===== SETTINGS VIEW (Admin - School Settings) =====
// SettingsView imported from @/components/views/SettingsView

// ===== SCHOOL REVIEWS VIEW (Parent) =====
function SchoolReviewsView() {
  const { userData } = useEduGestStore()
  const [school, setSchool] = useState<SchoolData | null>(null)
  const [comments, setComments] = useState<{ id: string; authorName: string; rating: number; comment: string; createdAt: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (userData?.schoolId) {
      authFetch(`/api/schools/${userData.schoolId}`)
        .then(r => r.json())
        .then(j => { if (j.data) setSchool(j.data); setLoading(false) })
        .catch(() => setLoading(false))
      authFetch(`/api/school-comments?schoolId=${userData.schoolId}`)
        .then(r => r.json())
        .then(j => setComments(j.data || []))
        .catch(() => {})
    }
  }, [userData?.schoolId])

  async function handleSubmitReview() {
    if (!userData?.schoolId || rating === 0 || !comment.trim()) {
      toast.error('Veuillez donner une note et un commentaire')
      return
    }
    setSubmitting(true)
    try {
      const res = await authFetch('/api/school-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: userData.schoolId,
          authorName: userData?.name || 'Parent',
          authorEmail: (userData as any)?.email || '',
          rating,
          comment: comment.trim(),
        }),
      })
      if (res.ok) {
        toast.success('Votre avis a été soumis ! Il sera visible après approbation.')
        setRating(0)
        setComment('')
      } else {
        toast.error('Erreur lors de l\'envoi')
      }
    } catch {
      toast.error('Erreur de connexion')
    }
    setSubmitting(false)
  }

  if (loading) return <div className="text-center py-8" style={{ color: TEXT_MUTED_LUXE }}>Chargement...</div>

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Avis sur l&apos;école</h1>
      </div>

      {/* School Header Card */}
      {school && (
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl overflow-hidden shadow-sm mb-6">
          <div className="relative h-32" style={{ background: school.coverImage ? `url(${school.coverImage}) center/cover` : `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            <div className="absolute bottom-4 left-5 flex items-center gap-3">
              {school.logo ? (
                <img src={school.logo} alt="Logo" className="w-14 h-14 rounded-xl object-cover border-3 border-white shadow-md" />
              ) : (
                <div className="w-14 h-14 rounded-xl grid place-items-center text-white text-lg font-bold border-3 border-white shadow-md" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                  {getInitials(school.name)}
                </div>
              )}
              <div>
                <h2 className="text-white text-lg font-bold drop-shadow">{school.name}</h2>
                <p className="text-white/80 text-sm">{school.city}, {school.province}</p>
              </div>
            </div>
          </div>
          <div className="p-5 flex items-center gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold" style={{ color: GOLD }}>{school.averageRating || 0}</div>
              <div className="flex items-center gap-0.5 justify-center mt-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={14} fill={i < Math.round(school.averageRating || 0) ? GOLD : 'none'} style={{ color: i < Math.round(school.averageRating || 0) ? GOLD : 'oklch(85%_0.01_175)' }} />
                ))}
              </div>
              <div className="text-[11px] mt-1" style={{ color: TEXT_MUTED_LUXE }}>{school.totalReviews || 0} avis</div>
            </div>
            <div className="flex-1 space-y-1.5">
              {[5, 4, 3, 2, 1].map(star => {
                const count = comments.filter(c => c.rating === star).length
                const pct = comments.length > 0 ? (count / comments.length) * 100 : 0
                return (
                  <div key={star} className="flex items-center gap-2 text-xs">
                    <span className="w-3 text-right" style={{ color: TEXT_MUTED_LUXE }}>{star}</span>
                    <Star size={10} fill={GOLD} style={{ color: GOLD }} />
                    <div className="flex-1 h-2 rounded-full bg-[oklch(95%_0.01_175)]">
                      <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: GOLD }} />
                    </div>
                    <span className="w-6 text-right" style={{ color: TEXT_MUTED_LUXE }}>{count}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Write a review */}
        <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4 flex items-center gap-2" style={{ color: TEXT_PRIMARY }}>
            <MessageCircle size={16} style={{ color: GOLD }} /> Donner votre avis
          </h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium mb-2 block" style={{ color: TEXT_MUTED_LUXE }}>Votre note *</label>
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <button
                    key={i}
                    onMouseEnter={() => setHoverRating(i + 1)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(i + 1)}
                    className="transition-transform hover:scale-110"
                  >
                    <Star
                      size={28}
                      fill={(hoverRating || rating) > i ? GOLD : 'none'}
                      style={{ color: (hoverRating || rating) > i ? GOLD : 'oklch(85%_0.01_175)', cursor: 'pointer' }}
                    />
                  </button>
                ))}
                {rating > 0 && <span className="ml-2 text-sm font-semibold" style={{ color: GOLD }}>{rating}/5</span>}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block" style={{ color: TEXT_MUTED_LUXE }}>Votre commentaire *</label>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={4}
                placeholder="Partagez votre expérience avec cette école..."
                className="w-full px-3 py-2.5 border border-[oklch(90%_0.01_175)] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[oklch(72%_0.15_65_/_0.3)] resize-none"
              />
            </div>
            <button
              onClick={handleSubmitReview}
              disabled={submitting || rating === 0 || !comment.trim()}
              className="edu-gold-cta w-full py-2.5 rounded-xl font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? <div className="h-4 w-4 border-2 border-[oklch(15%_0.02_250)] border-t-transparent rounded-full animate-spin" /> : <Send size={14} />}
              Soumettre mon avis
            </button>
            <p className="text-[11px] text-center" style={{ color: TEXT_MUTED_LUXE }}>Votre avis sera visible après approbation par l&apos;administration</p>
          </div>
        </div>

        {/* Existing reviews */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
            <h3 className="font-semibold mb-4" style={{ color: TEXT_PRIMARY }}>Avis des parents ({comments.length})</h3>
            {comments.length === 0 ? (
              <div className="text-center py-8">
                <MessageCircle size={32} className="mx-auto mb-3" style={{ color: TEXT_MUTED_LUXE }} />
                <p className="font-medium" style={{ color: TEXT_PRIMARY }}>Aucun avis pour le moment</p>
                <p className="text-sm mt-1" style={{ color: TEXT_MUTED_LUXE }}>Soyez le premier à donner votre avis !</p>
              </div>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto custom-scrollbar">
                {comments.map(c => (
                  <div key={c.id} className="p-4 rounded-xl border border-[oklch(90%_0.01_175)] hover:bg-[oklch(97%_0.005_175)] transition">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-full grid place-items-center text-white text-xs font-bold" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }}>
                          {getInitials(c.authorName)}
                        </div>
                        <div>
                          <div className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>{c.authorName}</div>
                          <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>{formatDate(c.createdAt)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} size={12} fill={i < c.rating ? GOLD : 'none'} style={{ color: i < c.rating ? GOLD : 'oklch(85%_0.01_175)' }} />
                        ))}
                      </div>
                    </div>
                    <p className="text-sm" style={{ color: TEXT_MUTED_LUXE }}>{c.comment}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
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
  const { currentView, userRole, logout, setCurrentView } = useEduGestStore()

  // Restore session from localStorage after first render (avoids hydration mismatch)
  useEffect(() => {
    restoreSession()
  }, [])

  // Report device fingerprint once when authenticated (best-effort)
  useEffect(() => {
    if (userRole) {
      reportDeviceFingerprint()
    }
  }, [userRole])

  // Handle 401 unauthorized events from authFetch
  useEffect(() => {
    const handler = () => {
      logout()
      setCurrentView('login')
    }
    window.addEventListener('auth:unauthorized', handler)
    return () => window.removeEventListener('auth:unauthorized', handler)
  }, [logout, setCurrentView])

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