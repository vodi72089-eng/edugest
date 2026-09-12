'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, GraduationCap, TrendingUp, Calendar, CheckCircle,
  BookOpen, ClipboardList, Award, DollarSign, CreditCard,
  BarChart3, Bell, ArrowRight, Clock, FileText, MessageSquare,
  ChevronRight, Eye, Star, Activity, PieChart, Receipt,
  Wallet, AlertCircle, Check, X, Plus, Search, Filter,
  UserCheck, UserX, UserPlus, School, Building2, Mail, Phone, Lock
} from 'lucide-react'
import ScrollReveal from '@/components/landing/ui/ScrollReveal'
import GlassCard from '@/components/landing/ui/GlassCard'
import AnimatedCounter from '@/components/landing/ui/AnimatedCounter'

// ===== Types =====
type RoleKey = 'direction' | 'enseignant' | 'parent' | 'comptable'

// ===== Tab Config =====
const ROLES: { key: RoleKey; label: string; icon: React.ReactNode }[] = [
  { key: 'direction', label: 'Direction', icon: <School size={16} /> },
  { key: 'enseignant', label: 'Enseignant', icon: <BookOpen size={16} /> },
  { key: 'parent', label: 'Parent', icon: <Users size={16} /> },
  { key: 'comptable', label: 'Comptable', icon: <Wallet size={16} /> },
]

// ===== Mini Stat Component =====
function MiniStat({
  icon,
  label,
  value,
  sub,
  color = '#4F9EFF',
  delay = 0,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  sub?: string
  color?: string
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative group rounded-xl p-4 border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12] transition-all duration-300 cursor-default"
    >
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${color}15` }}
        >
          <span style={{ color }}>{icon}</span>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-[#6B7280] uppercase tracking-wider mb-1">{label}</p>
          <p className="text-lg font-semibold text-[#FAFAFA] tabular-nums">{value}</p>
          {sub && <p className="text-[11px] text-[#6B7280] mt-0.5">{sub}</p>}
        </div>
      </div>
    </motion.div>
  )
}

// ===== CSS Bar Chart =====
function CssBarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...data.map(d => d.value))
  return (
    <div className="flex items-end gap-2 h-28 px-1">
      {data.map((d, i) => (
        <motion.div
          key={d.label}
          className="flex flex-col items-center gap-1.5 flex-1"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            className="w-full rounded-t-md relative overflow-hidden"
            style={{ background: `${d.color}30` }}
            initial={{ height: 0 }}
            animate={{ height: `${(d.value / max) * 100}%` }}
            transition={{ delay: i * 0.06 + 0.2, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              className="absolute inset-x-0 bottom-0 rounded-t-md"
              style={{ background: d.color, height: '100%' }}
            />
          </motion.div>
          <span className="text-[9px] text-[#6B7280]">{d.label}</span>
        </motion.div>
      ))}
    </div>
  )
}

// ===== CSS Ring Chart =====
function CssRingChart({
  percentage,
  color,
  size = 64,
  strokeWidth = 6,
}: {
  percentage: number
  color: string
  size?: number
  strokeWidth?: number
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percentage / 100) * circumference

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-semibold text-[#FAFAFA] tabular-nums">{percentage}%</span>
      </div>
    </div>
  )
}

// ===== Activity Row =====
function ActivityRow({
  icon,
  text,
  time,
  color = '#4F9EFF',
  delay = 0,
}: {
  icon: React.ReactNode
  text: string
  time: string
  color?: string
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: delay * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-white/[0.03] transition-colors cursor-default group"
    >
      <div
        className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
        style={{ background: `${color}18` }}
      >
        <span style={{ color }} className="scale-90">{icon}</span>
      </div>
      <span className="text-[13px] text-[#9CA3AF] group-hover:text-[#FAFAFA] transition-colors flex-1 truncate">{text}</span>
      <span className="text-[11px] text-[#6B7280] shrink-0">{time}</span>
    </motion.div>
  )
}

// ===== Quick Action Button =====
function QuickAction({
  icon,
  label,
  color = '#4F9EFF',
  delay = 0,
  onHover,
}: {
  icon: React.ReactNode
  label: string
  color?: string
  delay?: number
  onHover?: (text: string | null) => void
}) {
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: delay * 0.08, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={() => onHover?.(label)}
      onMouseLeave={() => onHover?.(null)}
      className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/[0.15] transition-all duration-200 text-[12px] text-[#9CA3AF] hover:text-[#FAFAFA]"
    >
      <span style={{ color }}>{icon}</span>
      {label}
    </motion.button>
  )
}

// ===== Grade Row =====
function GradeRow({
  name,
  subject,
  grade,
  max,
  delay = 0,
}: {
  name: string
  subject: string
  grade: number
  max: number
  delay?: number
}) {
  const pct = (grade / max) * 100
  const color = pct >= 80 ? '#34D399' : pct >= 60 ? '#4F9EFF' : pct >= 40 ? '#F59E0B' : '#EF4444'
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: delay * 0.06, duration: 0.3 }}
      className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-white/[0.03] transition-colors group"
    >
      <div className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center text-[10px] font-medium text-[#9CA3AF] shrink-0">
        {name.split(' ').map(n => n[0]).join('')}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-[#FAFAFA] truncate">{name}</p>
        <p className="text-[10px] text-[#6B7280]">{subject}</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-16 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: color }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ delay: delay * 0.06 + 0.3, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
        <span className="text-[11px] tabular-nums font-medium" style={{ color }}>{grade}/{max}</span>
      </div>
    </motion.div>
  )
}

// ===== Payment Row =====
function PaymentRow({
  name,
  amount,
  status,
  delay = 0,
}: {
  name: string
  amount: string
  status: 'paid' | 'pending' | 'overdue'
  delay?: number
}) {
  const statusConfig = {
    paid: { label: 'Payé', color: '#34D399', bg: '#34D39918' },
    pending: { label: 'En attente', color: '#F59E0B', bg: '#F59E0B18' },
    overdue: { label: 'En retard', color: '#EF4444', bg: '#EF444418' },
  }
  const s = statusConfig[status]
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: delay * 0.06, duration: 0.3 }}
      className="flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-white/[0.03] transition-colors"
    >
      <div className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center text-[10px] font-medium text-[#9CA3AF] shrink-0">
        {name.split(' ').map(n => n[0]).join('')}
      </div>
      <span className="text-[12px] text-[#FAFAFA] flex-1">{name}</span>
      <span className="text-[12px] text-[#9CA3AF] tabular-nums">{amount}</span>
      <span
        className="text-[10px] px-2 py-0.5 rounded-full font-medium"
        style={{ color: s.color, background: s.bg }}
      >
        {s.label}
      </span>
    </motion.div>
  )
}

// ===== Dashboard: Direction =====
function DirectionDashboard() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Left: Stats + Activity */}
      <div className="lg:col-span-2 space-y-4">
        {/* Stat cards row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MiniStat
            icon={<Users size={15} />}
            label="Élèves"
            value={<AnimatedCounter value={1247} duration={2} />}
            sub="+12 ce mois"
            color="#4F9EFF"
            delay={0}
          />
          <MiniStat
            icon={<GraduationCap size={15} />}
            label="Classes"
            value={<AnimatedCounter value={42} duration={1.5} />}
            sub="6 niveaux"
            color="#A78BFA"
            delay={1}
          />
          <MiniStat
            icon={<UserCheck size={15} />}
            label="Présence"
            value={<><AnimatedCounter value={94} duration={2} />%</>}
            sub="+2.3% vs mois dernier"
            color="#34D399"
            delay={2}
          />
          <MiniStat
            icon={<AlertCircle size={15} />}
            label="Alertes"
            value={<AnimatedCounter value={3} duration={1} />}
            sub="1 critique"
            color="#F472B6"
            delay={3}
          />
        </div>

        {/* Attendance chart */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[13px] font-medium text-[#FAFAFA]">Taux de présence hebdomadaire</h4>
            <span className="text-[10px] text-[#6B7280] px-2 py-1 rounded-md bg-white/[0.04]">Cette semaine</span>
          </div>
          <CssBarChart
            data={[
              { label: 'Lun', value: 96, color: '#4F9EFF' },
              { label: 'Mar', value: 93, color: '#4F9EFF' },
              { label: 'Mer', value: 91, color: '#A78BFA' },
              { label: 'Jeu', value: 94, color: '#4F9EFF' },
              { label: 'Ven', value: 88, color: '#F472B6' },
            ]}
          />
        </div>

        {/* Activity feed */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h4 className="text-[13px] font-medium text-[#FAFAFA] mb-2">Activité récente</h4>
          <div className="divide-y divide-white/[0.04]">
            <ActivityRow icon={<UserPlus size={13} />} text="Nouvel élève inscrit : Amina Diallo" time="il y a 12min" color="#34D399" delay={0} />
            <ActivityRow icon={<FileText size={13} />} text="Bulletins T2 générés pour 6ème A" time="il y a 45min" color="#4F9EFF" delay={1} />
            <ActivityRow icon={<DollarSign size={13} />} text="Paiement reçu : Famille Koné — 250$" time="il y a 1h" color="#34D399" delay={2} />
            <ActivityRow icon={<AlertCircle size={13} />} text="3 absences non justifiées — 3ème B" time="il y a 2h" color="#F472B6" delay={3} />
            <ActivityRow icon={<MessageSquare size={13} />} text="Message envoyé à 48 parents" time="il y a 3h" color="#A78BFA" delay={4} />
          </div>
        </div>
      </div>

      {/* Right: Quick actions + Ring chart */}
      <div className="space-y-4">
        {/* Ring chart */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h4 className="text-[13px] font-medium text-[#FAFAFA] mb-4">Recouvrement scolaire</h4>
          <div className="flex items-center gap-4">
            <CssRingChart percentage={78} color="#4F9EFF" size={72} strokeWidth={7} />
            <div>
              <p className="text-2xl font-semibold text-[#FAFAFA] tabular-nums">78%</p>
              <p className="text-[11px] text-[#6B7280]">Objectif: 95%</p>
              <p className="text-[11px] text-[#34D399] mt-1">↑ +5% ce mois</p>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h4 className="text-[13px] font-medium text-[#FAFAFA] mb-3">Actions rapides</h4>
          <div className="grid grid-cols-2 gap-2">
            <QuickAction icon={<UserPlus size={13} />} label="Inscrire" color="#4F9EFF" delay={0} />
            <QuickAction icon={<FileText size={13} />} label="Bulletins" color="#A78BFA" delay={1} />
            <QuickAction icon={<MessageSquare size={13} />} label="Notifier" color="#34D399" delay={2} />
            <QuickAction icon={<BarChart3 size={13} />} label="Rapports" color="#F472B6" delay={3} />
          </div>
        </div>

        {/* Upcoming */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h4 className="text-[13px] font-medium text-[#FAFAFA] mb-3">À venir</h4>
          <div className="space-y-2.5">
            {[
              { date: '15 Mars', label: 'Conseil de classe', color: '#4F9EFF' },
              { date: '18 Mars', label: 'Réunion parents', color: '#A78BFA' },
              { date: '22 Mars', label: 'Examens blancs', color: '#F472B6' },
            ].map((ev, i) => (
              <motion.div
                key={ev.label}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1, duration: 0.3 }}
                className="flex items-center gap-2.5 py-1.5"
              >
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ev.color }} />
                <span className="text-[11px] text-[#6B7280] shrink-0 w-14">{ev.date}</span>
                <span className="text-[12px] text-[#9CA3AF]">{ev.label}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ===== Dashboard: Enseignant =====
function EnseignantDashboard() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        {/* Class list */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { name: '6ème A', students: 32, color: '#4F9EFF' },
            { name: '6ème B', students: 28, color: '#A78BFA' },
            { name: '5ème C', students: 35, color: '#34D399' },
          ].map((c, i) => (
            <motion.div
              key={c.name}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
              className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 hover:bg-white/[0.04] hover:border-white/[0.12] transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[12px] font-bold"
                  style={{ background: `${c.color}20`, color: c.color }}
                >
                  {c.name}
                </div>
                <div>
                  <p className="text-[12px] text-[#FAFAFA] font-medium">{c.name}</p>
                  <p className="text-[10px] text-[#6B7280]">{c.students} élèves</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <div className="flex -space-x-1.5">
                  {[0, 1, 2].map(j => (
                    <div
                      key={j}
                      className="w-5 h-5 rounded-full border border-[#13141A]"
                      style={{ background: `${c.color}${20 + j * 15}` }}
                    />
                  ))}
                </div>
                <span className="text-[10px] text-[#6B7280] ml-1">+{c.students - 3}</span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Grade input table */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[13px] font-medium text-[#FAFAFA]">Saisie des notes — Mathématiques</h4>
            <span className="text-[10px] px-2 py-1 rounded-md bg-[#4F9EFF]15 text-[#4F9EFF]">6ème A</span>
          </div>
          <div className="space-y-0.5">
            <GradeRow name="Amina Diallo" subject="Devoir 3" grade={17} max={20} delay={0} />
            <GradeRow name="Youssouf Koné" subject="Devoir 3" grade={14} max={20} delay={1} />
            <GradeRow name="Fatou Ndiaye" subject="Devoir 3" grade={12} max={20} delay={2} />
            <GradeRow name="Moussa Traoré" subject="Devoir 3" grade={9} max={20} delay={3} />
            <GradeRow name="Aïcha Bamba" subject="Devoir 3" grade={16} max={20} delay={4} />
            <GradeRow name="Ibrahim Sow" subject="Devoir 3" grade={11} max={20} delay={5} />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Average distribution */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h4 className="text-[13px] font-medium text-[#FAFAFA] mb-3">Moyenne de la classe</h4>
          <div className="flex items-center gap-4">
            <CssRingChart percentage={68} color="#A78BFA" size={72} strokeWidth={7} />
            <div>
              <p className="text-2xl font-semibold text-[#FAFAFA] tabular-nums">13.6<span className="text-sm text-[#6B7280]">/20</span></p>
              <p className="text-[11px] text-[#6B7280]">6ème A — Devoir 3</p>
              <p className="text-[11px] text-[#34D399] mt-1">↑ +1.2 vs Devoir 2</p>
            </div>
          </div>
        </div>

        {/* Homework assignments */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h4 className="text-[13px] font-medium text-[#FAFAFA] mb-3">Devoirs à corriger</h4>
          <div className="space-y-2.5">
            {[
              { class: '6ème A', title: 'Exercices p.45', due: '12 Mars', done: 28, total: 32, color: '#4F9EFF' },
              { class: '6ème B', title: 'Problème 3', due: '14 Mars', done: 15, total: 28, color: '#A78BFA' },
              { class: '5ème C', title: 'DM Géométrie', due: '16 Mars', done: 8, total: 35, color: '#F472B6' },
            ].map((hw, i) => (
              <motion.div
                key={hw.title}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08, duration: 0.3 }}
                className="py-2 border-b border-white/[0.04] last:border-0"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium" style={{ color: hw.color }}>{hw.class}</span>
                  <span className="text-[10px] text-[#6B7280]">{hw.due}</span>
                </div>
                <p className="text-[12px] text-[#FAFAFA] mb-1.5">{hw.title}</p>
                <div className="w-full h-1 rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${(hw.done / hw.total) * 100}%`, background: hw.color }}
                  />
                </div>
                <p className="text-[10px] text-[#6B7280] mt-1">{hw.done}/{hw.total} rendus</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ===== Dashboard: Parent =====
function ParentDashboard() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        {/* Child info */}
        <div className="grid grid-cols-2 gap-3">
          <MiniStat
            icon={<Award size={15} />}
            label="Moyenne"
            value={<><AnimatedCounter value={14.2} duration={2} /><span className="text-sm text-[#6B7280]">/20</span></>}
            sub="6ème A — Trimestre 2"
            color="#34D399"
            delay={0}
          />
          <MiniStat
            icon={<UserCheck size={15} />}
            label="Présence"
            value={<><AnimatedCounter value={96} duration={2} />%</>}
            sub="2 absences ce mois"
            color="#4F9EFF"
            delay={1}
          />
        </div>

        {/* Grades overview */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[13px] font-medium text-[#FAFAFA]">Notes récentes — Amina Diallo</h4>
            <span className="text-[10px] text-[#6B7280] px-2 py-1 rounded-md bg-white/[0.04]">T2</span>
          </div>
          <div className="space-y-0.5">
            <GradeRow name="Mathématiques" subject="Devoir 3" grade={17} max={20} delay={0} />
            <GradeRow name="Français" subject="Rédaction" grade={14} max={20} delay={1} />
            <GradeRow name="SVT" subject="Contrôle" grade={15} max={20} delay={2} />
            <GradeRow name="Histoire-Géo" subject="Exposé" grade={12} max={20} delay={3} />
            <GradeRow name="Anglais" subject="Oral" grade={16} max={20} delay={4} />
          </div>
        </div>

        {/* Upcoming events */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h4 className="text-[13px] font-medium text-[#FAFAFA] mb-3">Événements à venir</h4>
          <div className="space-y-2.5">
            {[
              { date: '15 Mars', label: 'Conseil de classe', desc: 'Salle des profs, 14h', color: '#4F9EFF' },
              { date: '18 Mars', label: 'Réunion parents-professeurs', desc: 'Hall principal, 9h-12h', color: '#A78BFA' },
              { date: '22 Mars', label: 'Examens blancs', desc: 'Toutes matières', color: '#F472B6' },
              { date: '2 Avril', label: 'Voyage scolaire', desc: 'Musée national', color: '#34D399' },
            ].map((ev, i) => (
              <motion.div
                key={ev.label}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.07, duration: 0.3 }}
                className="flex items-start gap-3 py-2 border-b border-white/[0.04] last:border-0"
              >
                <div
                  className="w-10 h-10 rounded-lg flex flex-col items-center justify-center shrink-0"
                  style={{ background: `${ev.color}15` }}
                >
                  <span className="text-[11px] font-bold" style={{ color: ev.color }}>
                    {ev.date.split(' ')[0]}
                  </span>
                  <span className="text-[8px] text-[#6B7280]">{ev.date.split(' ')[1]}</span>
                </div>
                <div>
                  <p className="text-[12px] text-[#FAFAFA]">{ev.label}</p>
                  <p className="text-[10px] text-[#6B7280]">{ev.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Payment status */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h4 className="text-[13px] font-medium text-[#FAFAFA] mb-3">Paiements</h4>
          <div className="space-y-2.5">
            <PaymentRow name="Scolarité T2" amount="250$" status="paid" delay={0} />
            <PaymentRow name="Cantine Mars" amount="45$" status="pending" delay={1} />
            <PaymentRow name="Sortie scolaire" amount="15$" status="paid" delay={2} />
          </div>
          <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between">
            <span className="text-[11px] text-[#6B7280]">Solde restant</span>
            <span className="text-[13px] font-semibold text-[#F59E0B]">45$</span>
          </div>
        </div>

        {/* Messages */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h4 className="text-[13px] font-medium text-[#FAFAFA] mb-3">Messages</h4>
          <div className="space-y-2">
            {[
              { from: 'M. Dupont', text: 'Amina a obtenu la meilleure note...', time: '14h', unread: true, color: '#4F9EFF' },
              { from: 'Direction', text: 'Réunion parents reportée au...', time: 'Hier', unread: true, color: '#A78BFA' },
              { from: 'Cantine', text: 'Menu de la semaine disponible', time: 'Lun', unread: false, color: '#6B7280' },
            ].map((msg, i) => (
              <motion.div
                key={msg.from + msg.time}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08, duration: 0.3 }}
                className="flex items-start gap-2.5 py-2 cursor-default hover:bg-white/[0.02] rounded-lg px-1.5 transition-colors"
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5"
                  style={{ background: `${msg.color}20`, color: msg.color }}
                >
                  {msg.from[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[#FAFAFA]">{msg.from}</span>
                    <span className="text-[9px] text-[#6B7280]">{msg.time}</span>
                  </div>
                  <p className="text-[11px] text-[#6B7280] truncate">{msg.text}</p>
                </div>
                {msg.unread && (
                  <div className="w-2 h-2 rounded-full bg-[#4F9EFF] shrink-0 mt-2" />
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ===== Dashboard: Comptable =====
function ComptableDashboard() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        {/* Overview stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MiniStat
            icon={<DollarSign size={15} />}
            label="Revenu total"
            value={<><AnimatedCounter value={284} duration={2} />k$</>}
            sub="Ce trimestre"
            color="#34D399"
            delay={0}
          />
          <MiniStat
            icon={<Clock size={15} />}
            label="En attente"
            value={<><AnimatedCounter value={42} duration={1.5} />k$</>}
            sub="23 factures"
            color="#F59E0B"
            delay={1}
          />
          <MiniStat
            icon={<AlertCircle size={15} />}
            label="En retard"
            value={<><AnimatedCounter value={18} duration={1.5} />k$</>}
            sub="8 familles"
            color="#EF4444"
            delay={2}
          />
          <MiniStat
            icon={<TrendingUp size={15} />}
            label="Taux recouvrement"
            value={<><AnimatedCounter value={82} duration={2} />%</>}
            sub="↑ +6% vs T1"
            color="#4F9EFF"
            delay={3}
          />
        </div>

        {/* Collection rate chart */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[13px] font-medium text-[#FAFAFA]">Évolution du recouvrement</h4>
            <span className="text-[10px] text-[#6B7280] px-2 py-1 rounded-md bg-white/[0.04]">6 derniers mois</span>
          </div>
          <CssBarChart
            data={[
              { label: 'Oct', value: 65, color: '#F472B6' },
              { label: 'Nov', value: 72, color: '#A78BFA' },
              { label: 'Déc', value: 68, color: '#A78BFA' },
              { label: 'Jan', value: 76, color: '#4F9EFF' },
              { label: 'Fév', value: 80, color: '#4F9EFF' },
              { label: 'Mars', value: 82, color: '#34D399' },
            ]}
          />
        </div>

        {/* Recent receipts */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h4 className="text-[13px] font-medium text-[#FAFAFA] mb-3">Reçus récents</h4>
          <div className="space-y-0.5">
            <PaymentRow name="Famille Diallo" amount="250$" status="paid" delay={0} />
            <PaymentRow name="Famille Koné" amount="250$" status="paid" delay={1} />
            <PaymentRow name="Famille Ndiaye" amount="125$" status="pending" delay={2} />
            <PaymentRow name="Famille Traoré" amount="250$" status="overdue" delay={3} />
            <PaymentRow name="Famille Bamba" amount="250$" status="paid" delay={4} />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Collection ring */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h4 className="text-[13px] font-medium text-[#FAFAFA] mb-4">Taux de recouvrement</h4>
          <div className="flex items-center gap-4">
            <CssRingChart percentage={82} color="#34D399" size={80} strokeWidth={8} />
            <div>
              <p className="text-2xl font-semibold text-[#FAFAFA] tabular-nums">82%</p>
              <p className="text-[11px] text-[#6B7280]">284k$ / 344k$</p>
              <p className="text-[11px] text-[#34D399] mt-1">↑ +6% ce trimestre</p>
            </div>
          </div>
        </div>

        {/* Payment method breakdown */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h4 className="text-[13px] font-medium text-[#FAFAFA] mb-3">Méthodes de paiement</h4>
          <div className="space-y-3">
            {[
              { method: 'Mobile Money', pct: 45, color: '#4F9EFF' },
              { method: 'Virement', pct: 30, color: '#A78BFA' },
              { method: 'Espèces', pct: 20, color: '#34D399' },
              { method: 'Carte', pct: 5, color: '#F472B6' },
            ].map((m, i) => (
              <motion.div
                key={m.method}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08, duration: 0.3 }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-[#9CA3AF]">{m.method}</span>
                  <span className="text-[11px] tabular-nums font-medium" style={{ color: m.color }}>{m.pct}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/[0.06]">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: m.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${m.pct}%` }}
                    transition={{ delay: i * 0.08 + 0.3, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Pending payments */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <h4 className="text-[13px] font-medium text-[#FAFAFA] mb-2">Rappels à envoyer</h4>
          <p className="text-[11px] text-[#6B7280] mb-3">8 familles en attente de paiement</p>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="w-full py-2.5 rounded-lg border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-[12px] text-[#9CA3AF] hover:text-[#FAFAFA] transition-colors flex items-center justify-center gap-2"
          >
            <MessageSquare size={13} className="text-[#4F9EFF]" />
            Envoyer des rappels WhatsApp
          </motion.button>
        </div>
      </div>
    </div>
  )
}

// ===== Main Component =====
export default function DemoInteractive() {
  const [activeRole, setActiveRole] = useState<RoleKey>('direction')
  const dashboards: Record<RoleKey, React.ReactNode> = {
    direction: <DirectionDashboard />,
    enseignant: <EnseignantDashboard />,
    parent: <ParentDashboard />,
    comptable: <ComptableDashboard />,
  }

  return (
    <section className="py-24 sm:py-32 px-4 sm:px-6" style={{ background: '#0A0B0F' }}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <ScrollReveal>
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#FAFAFA] mb-4">
              <span
                style={{
                  background: 'linear-gradient(135deg, #4F9EFF 0%, #A78BFA 50%, #F472B6 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Voyez
              </span>{' '}
              par vous-même
            </h2>
            <p className="text-base sm:text-lg text-[#9CA3AF] max-w-xl mx-auto">
              Explorez le tableau de bord adapté à chaque rôle. Le même outil, des perspectives différentes.
            </p>
          </div>
        </ScrollReveal>

        {/* Tab switcher */}
        <ScrollReveal delay={100}>
          <div className="flex items-center justify-center mb-8 sm:mb-10">
            <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-white/[0.08] bg-[#13141A]">
              {ROLES.map((role) => (
                <button
                  key={role.key}
                  onClick={() => setActiveRole(role.key)}
                  className={`
                    relative flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-300
                    ${activeRole === role.key
                      ? 'text-[#FAFAFA]'
                      : 'text-[#6B7280] hover:text-[#9CA3AF]'
                    }
                  `}
                >
                  {activeRole === role.key && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute inset-0 rounded-lg border border-white/[0.12]"
                      style={{ background: 'rgba(255,255,255,0.06)' }}
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    {role.icon}
                    <span className="hidden sm:inline">{role.label}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </ScrollReveal>

        {/* Dashboard mockup */}
        <ScrollReveal delay={200}>
          <div
            className="rounded-2xl border border-white/[0.08] overflow-hidden"
            style={{ background: '#0D0E14' }}
          >
            {/* Fake browser chrome */}
            <div
              className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]"
              style={{ background: '#0A0B0F' }}
            >
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-[#EF4444]/60" />
                <div className="w-3 h-3 rounded-full bg-[#F59E0B]/60" />
                <div className="w-3 h-3 rounded-full bg-[#34D399]/60" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="flex items-center gap-2 px-4 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] text-[11px] text-[#6B7280] max-w-xs w-full justify-center">
                  <Lock size={10} />
                  app.edugest.africa/dashboard
                </div>
              </div>
              <div className="w-16" />
            </div>

            {/* Dashboard top bar */}
            <div
              className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-white/[0.06]"
              style={{ background: '#0A0B0F' }}
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#4F9EFF] to-[#A78BFA] flex items-center justify-center">
                  <span className="text-[10px] font-bold text-white">EG</span>
                </div>
                <div>
                  <p className="text-[12px] font-medium text-[#FAFAFA]">
                    {activeRole === 'direction' && 'Lycée International de Paris'}
                    {activeRole === 'enseignant' && 'M. Dupont — Mathématiques'}
                    {activeRole === 'parent' && 'Famille Diallo'}
                    {activeRole === 'comptable' && 'Comptabilité — LIP'}
                  </p>
                  <p className="text-[10px] text-[#6B7280]">
                    {activeRole === 'direction' && 'Tableau de bord directeur'}
                    {activeRole === 'enseignant' && '6 classes · 168 élèves'}
                    {activeRole === 'parent' && 'Amina Diallo · 6ème A'}
                    {activeRole === 'comptable' && 'Trimestre 2 · 2024-2025'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="w-8 h-8 rounded-lg border border-white/[0.06] bg-white/[0.02] flex items-center justify-center text-[#6B7280] hover:text-[#FAFAFA] hover:bg-white/[0.06] transition-colors">
                  <Search size={14} />
                </button>
                <button className="w-8 h-8 rounded-lg border border-white/[0.06] bg-white/[0.02] flex items-center justify-center text-[#6B7280] hover:text-[#FAFAFA] hover:bg-white/[0.06] transition-colors relative">
                  <Bell size={14} />
                  <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#EF4444] rounded-full border border-[#0A0B0F]" />
                </button>
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#4F9EFF] to-[#A78BFA] flex items-center justify-center text-[10px] font-bold text-white ml-1">
                  {ROLES.find(r => r.key === activeRole)?.label[0] || 'U'}
                </div>
              </div>
            </div>

            {/* Dashboard content */}
            <div className="p-4 sm:p-6 min-h-[480px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeRole}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                >
                  {dashboards[activeRole]}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </ScrollReveal>

        {/* CTA Link */}
        <ScrollReveal delay={300}>
          <div className="text-center mt-10 sm:mt-12">
            <a
              href="#"
              className="inline-flex items-center gap-2 text-[15px] font-medium transition-colors duration-300 group"
              style={{
                background: 'linear-gradient(135deg, #4F9EFF 0%, #A78BFA 50%, #F472B6 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Vous voulez tester ?
              <ArrowRight
                size={16}
                className="transition-transform group-hover:translate-x-1"
                style={{
                  color: '#A78BFA',
                }}
              />
              <span
                style={{
                  background: 'linear-gradient(135deg, #4F9EFF 0%, #A78BFA 50%, #F472B6 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Demander un accès
              </span>
            </a>
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}
