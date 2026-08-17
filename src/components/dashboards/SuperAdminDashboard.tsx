'use client'

import { useState, useEffect } from 'react'
import { useEduGestStore, authFetch, ViewType } from '@/lib/store'
import {
  Users, School, AlertTriangle, Clock, BarChart3, UserPlus, MessageSquare,
  CreditCard, Megaphone, Filter, Building2, GraduationCap, DollarSign, Ban,
  LayoutDashboard, TrendingUp, Award, Shield
} from 'lucide-react'
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts'
import { ACCENT, SUCCESS, WARNING, DANGER, INFO, GOLD, GOLD_SOFT, TEXT_PRIMARY, TEXT_MUTED_LUXE, SUCCESS_SOFT, SUBSCRIPTION_TIERS, IVORY, SUBSCRIPTION_DATA } from '@/lib/constants'
import { formatNumber, formatCurrency, getInitials, formatDate, getSubscriptionLabel, getStatusPill } from '@/lib/helpers'
import StudentAvatar from '@/components/ui/StudentAvatar'
import StatCard from './StatCard'

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
  recentStudents: { id: string; firstName: string; lastName: string; matricule: string; photoUrl?: string; createdAt: string; school: { name: string; shortName: string; city: string } | null; class: { name: string } | null }[]
}

export default function SuperAdminDashboard() {
  const { userData, setCurrentView } = useEduGestStore()
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [cityFilter, setCityFilter] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'schools' | 'debts' | 'blacklist' | 'activity'>('overview')
  const [schoolStats, setSchoolStats] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    let cancelled = false
    function fetchAnalytics() {
      authFetch(`/api/admin-analytics${cityFilter ? `?city=${cityFilter}` : ''}`)
        .then(r => r.json())
        .then(j => { if (!cancelled) { setAnalytics(j.data); setLoading(false) } })
        .catch(() => { if (!cancelled) setLoading(false) })
    }
    fetchAnalytics()
    const interval = setInterval(fetchAnalytics, 30000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [cityFilter])

  useEffect(() => {
    if (userData?.schoolId) {
      authFetch(`/api/stats?schoolId=${userData.schoolId}`).then(r => r.json()).then(j => { setSchoolStats(j.data) }).catch(() => {})
    }
  }, [userData?.schoolId])

  // School-admin specific dashboard
  if (userData?.schoolId) {
    const totalStudents = (schoolStats?.students as Record<string, number>)?.total || 0
    const totalClasses = (schoolStats?.classes as Record<string, unknown>)?.total as number || 0
    const classDist = (schoolStats?.classes as Record<string, unknown>)?.distribution as { name: string; _count: { students: number } }[] | undefined
    const barData = classDist?.map(c => ({ name: c.name, élèves: c._count.students })) || []
    const disciplineStats = schoolStats?.discipline as { total: number; blacklist: number; greylist: number; whitelist: number } | undefined
    const paymentStats = schoolStats?.payments as { total: number; paid: number; pending: number; partial: number; overdue: number; expectedAmount: number; collectedAmount: number; collectionRate: number } | undefined

    return (
      <div>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-1 h-8 rounded-full" style={{ background: GOLD }} />
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" style={{ color: TEXT_PRIMARY }}>Bonjour {userData.name}</h1>
            </div>
            <p className="text-[13px] ml-7" style={{ color: TEXT_MUTED_LUXE }}>{userData.schoolName || 'Gestion scolaire'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-6">
          <StatCard label="Total élèves" value={formatNumber(totalStudents)} icon={<Users size={16} />} color={ACCENT} onClick={() => setCurrentView('students')} />
          <StatCard label="Classes actives" value={String(totalClasses)} icon={<School size={16} />} color={INFO} onClick={() => setCurrentView('classes')} />
          <StatCard label="Avertissements" value={String(disciplineStats?.greylist || 0)} icon={<AlertTriangle size={16} />} color={WARNING} onClick={() => setCurrentView('discipline')} />
          <StatCard label="Impayés" value={String(paymentStats?.overdue || 0)} icon={<Clock size={16} />} color={DANGER} onClick={() => setCurrentView('payments')} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-6 mb-6">
          <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-6 shadow-sm">
            <div className="mb-4">
              <div className="text-[15px] font-semibold" style={{ color: TEXT_PRIMARY }}>Élèves par classe</div>
              <div className="text-xs" style={{ color: TEXT_MUTED_LUXE }}>Année scolaire en cours</div>
            </div>
            {barData.length > 0 ? (
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
            ) : (
              <div className="h-[240px] flex items-center justify-center" style={{ color: TEXT_MUTED_LUXE }}>
                <div className="text-center">
                  <BarChart3 size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Aucune donnée de classe disponible</p>
                </div>
              </div>
            )}
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
                <button key={a.label} onClick={() => useEduGestStore.getState().setCurrentView(a.view)} className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-[oklch(90%_0.01_175)] hover:border-[oklch(72%_0.15_65_/_0.3)] hover:shadow-md edu-card-lift transition">
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
                              <StudentAvatar firstName={s.firstName} lastName={s.lastName} photoUrl={s.photoUrl} size={28} className="text-white font-semibold" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${GOLD})` }} />
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
