'use client'

import { motion, useInView } from 'framer-motion'
import { useRef, useEffect, useState } from 'react'
import {
  Shield, CreditCard, BarChart3, Globe, Lock, GraduationCap,
} from 'lucide-react'
import BentoCard from '@/components/landing/ui/BentoCard'
import ScrollReveal from '@/components/landing/ui/ScrollReveal'
import AnimatedCounter from '@/components/landing/ui/AnimatedCounter'

/* ========================================
   DASHBOARD MOCKUP — "Gestion Scolaire Intégrale"
   ======================================== */

function DashboardMockup() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-50px' })

  return (
    <div ref={ref} className="w-full space-y-4">
      {/* Top stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Élèves', value: 2847, color: '#4F9EFF', delta: '+12%' },
          { label: 'Présence', value: 94.2, suffix: '%', color: '#34D399', delta: '+2.3%' },
          { label: 'Moyenne', value: 13.8, suffix: '/20', color: '#A78BFA', delta: '+0.7' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            className="rounded-xl p-3 border border-white/[0.06]"
            style={{ background: '#1A1C24' }}
            initial={{ opacity: 0, y: 12 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
            transition={{ duration: 0.5, delay: 0.3 + i * 0.15 }}
          >
            <p className="text-[10px] uppercase tracking-wider text-[#6B7280] mb-1">{stat.label}</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-[#FAFAFA]">
                <AnimatedCounter value={stat.value} suffix={stat.suffix || ''} duration={1.5} />
              </span>
              <span className="text-[10px] font-medium" style={{ color: stat.color }}>
                {stat.delta}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Attendance chart mockup */}
      <motion.div
        className="rounded-xl p-4 border border-white/[0.06]"
        style={{ background: '#1A1C24' }}
        initial={{ opacity: 0, y: 12 }}
        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        transition={{ duration: 0.5, delay: 0.7 }}
      >
        <p className="text-[10px] uppercase tracking-wider text-[#6B7280] mb-3">Présences cette semaine</p>
        <div className="flex items-end gap-2 h-20">
          {[72, 88, 65, 94, 82, 91, 78].map((h, i) => (
            <motion.div
              key={i}
              className="flex-1 rounded-sm"
              style={{
                background: `linear-gradient(to top, #4F9EFF, #4F9EFF60)`,
                minHeight: 4,
              }}
              initial={{ height: 4 }}
              animate={isInView ? { height: `${h}%` } : { height: 4 }}
              transition={{ duration: 0.6, delay: 0.9 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            />
          ))}
        </div>
        <div className="flex justify-between mt-2">
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
            <span key={i} className="flex-1 text-center text-[9px] text-[#6B7280]">{d}</span>
          ))}
        </div>
      </motion.div>

      {/* Mini grades list */}
      <motion.div
        className="rounded-xl p-3 border border-white/[0.06]"
        style={{ background: '#1A1C24' }}
        initial={{ opacity: 0, y: 12 }}
        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
        transition={{ duration: 0.5, delay: 1.1 }}
      >
        <p className="text-[10px] uppercase tracking-wider text-[#6B7280] mb-2">Dernières notes</p>
        {[
          { name: 'Mathématiques', grade: '16/20', color: '#34D399' },
          { name: 'Français', grade: '14/20', color: '#4F9EFF' },
          { name: 'Physique', grade: '11/20', color: '#F472B6' },
        ].map((item, i) => (
          <div key={i} className="flex items-center justify-between py-1.5">
            <span className="text-xs text-[#9CA3AF]">{item.name}</span>
            <span className="text-xs font-semibold" style={{ color: item.color }}>{item.grade}</span>
          </div>
        ))}
      </motion.div>
    </div>
  )
}

/* ========================================
   CHAT MOCKUP — "Communication multilingue"
   ======================================== */

const CHAT_MESSAGES = [
  { flag: '🇫🇷', name: 'Mme. Dupont', text: 'Réunion parents ce vendredi à 14h', time: '14:02', side: 'left' as const },
  { flag: '🇬🇧', name: 'Mr. Smith', text: 'Meeting rescheduled to 3 PM', time: '14:15', side: 'right' as const },
  { flag: '🇪🇸', name: 'Sra. López', text: 'Informe trimestral disponible', time: '14:22', side: 'left' as const },
  { flag: '🇫🇷', name: 'M. Konaté', text: 'Paiement scolarité reçu ✓', time: '14:30', side: 'right' as const },
]

function ChatMockup() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-50px' })
  const [visibleMsgs, setVisibleMsgs] = useState(0)

  useEffect(() => {
    if (!isInView) return
    const timers: ReturnType<typeof setTimeout>[] = []
    CHAT_MESSAGES.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleMsgs(i + 1), 600 + i * 700))
    })
    return () => timers.forEach(clearTimeout)
  }, [isInView])

  return (
    <div ref={ref} className="w-full space-y-3">
      {/* Chat header */}
      <div className="flex items-center gap-2 pb-2 border-b border-white/[0.06]">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#4F9EFF] to-[#A78BFA] flex items-center justify-center text-[10px] font-bold text-white">
          EG
        </div>
        <div>
          <p className="text-xs font-semibold text-[#FAFAFA]">EduGest Chat</p>
          <p className="text-[9px] text-[#34D399]">● En ligne — 3 langues</p>
        </div>
        <div className="ml-auto flex gap-1.5">
          {['🇫🇷', '🇬🇧', '🇪🇸'].map((f, i) => (
            <span key={i} className="text-xs opacity-60 hover:opacity-100 transition-opacity cursor-default">{f}</span>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="space-y-2.5 min-h-[160px]">
        {CHAT_MESSAGES.map((msg, i) => (
          <motion.div
            key={i}
            className={`flex gap-2 ${msg.side === 'right' ? 'flex-row-reverse' : ''}`}
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={i < visibleMsgs ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                msg.side === 'right' ? 'bg-[#4F9EFF]/20' : 'bg-[#A78BFA]/20'
              }`}
            >
              {msg.flag}
            </div>
            <div
              className={`max-w-[80%] rounded-xl px-3 py-2 ${
                msg.side === 'right'
                  ? 'bg-[#4F9EFF]/15 border border-[#4F9EFF]/20'
                  : 'bg-[#1A1C24] border border-white/[0.06]'
              }`}
            >
              <p className="text-[10px] font-medium text-[#9CA3AF] mb-0.5">{msg.name}</p>
              <p className="text-xs text-[#FAFAFA]">{msg.text}</p>
              <p className="text-[8px] text-[#6B7280] mt-1 text-right">{msg.time}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Typing indicator */}
      {visibleMsgs >= CHAT_MESSAGES.length && (
        <motion.div
          className="flex items-center gap-1.5 px-3 py-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-[#6B7280]"
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
              />
            ))}
          </div>
          <span className="text-[9px] text-[#6B7280]">Traduction automatique...</span>
        </motion.div>
      )}

      {/* Input bar */}
      <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
        <div className="flex-1 h-8 rounded-lg bg-[#1A1C24] border border-white/[0.06] px-3 flex items-center">
          <span className="text-[10px] text-[#6B7280]">Écrire un message...</span>
        </div>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#4F9EFF] to-[#A78BFA] flex items-center justify-center">
          <span className="text-white text-xs">→</span>
        </div>
      </div>
    </div>
  )
}

/* ========================================
   PAYMENT MOCKUP — "Paiements"
   ======================================== */

function PaymentMockup() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-50px' })

  return (
    <div ref={ref} className="w-full space-y-3">
      {/* Payment badge */}
      <div className="flex items-center gap-2">
        <div className="w-10 h-7 rounded bg-gradient-to-br from-[#34D399] to-[#4F9EFF] flex items-center justify-center">
          <CreditCard size={14} className="text-white" />
        </div>
        <div>
          <p className="text-xs font-semibold text-[#FAFAFA]">Paiement reçu</p>
          <p className="text-[9px] text-[#34D399]">● Confirmé</p>
        </div>
      </div>

      {/* Amount */}
      <motion.div
        className="rounded-xl p-4 border border-white/[0.06]"
        style={{ background: '#1A1C24' }}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={isInView ? { opacity: 1, scale: 1 } : {}}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <p className="text-[10px] text-[#6B7280] mb-1">Montant</p>
        <p className="text-2xl font-bold text-[#FAFAFA]">250 <span className="text-sm text-[#9CA3AF]">$</span></p>
        <div className="flex gap-2 mt-3">
          {['Mobile Money', 'Virement', 'Espèces'].map((method, i) => (
            <span
              key={i}
              className="text-[8px] px-2 py-1 rounded-full border border-white/[0.08] text-[#9CA3AF]"
              style={i === 0 ? { borderColor: '#34D39940', color: '#34D399', background: '#34D39910' } : {}}
            >
              {method}
            </span>
          ))}
        </div>
      </motion.div>

      {/* Receipt */}
      <motion.div
        className="flex items-center gap-2 text-[10px] text-[#6B7280]"
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ delay: 0.6 }}
      >
        <span>Reçu #EDG-2847</span>
        <span className="text-[#34D399]">✓</span>
      </motion.div>
    </div>
  )
}

/* ========================================
   WORLD MAP MOCKUP — "Multi-Établissements"
   ======================================== */

const MAP_PINS = [
  { name: 'Paris', x: '48%', y: '28%', color: '#4F9EFF' },
  { name: 'New York', x: '25%', y: '35%', color: '#A78BFA' },
  { name: 'Singapore', x: '76%', y: '55%', color: '#34D399' },
  { name: 'Dakar', x: '42%', y: '45%', color: '#F472B6' },
  { name: 'Abidjan', x: '44%', y: '50%', color: '#4F9EFF' },
]

function WorldMapMockup() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-50px' })

  return (
    <div ref={ref} className="w-full">
      {/* Simplified world map SVG */}
      <div className="relative w-full h-28">
        <svg viewBox="0 0 400 150" className="w-full h-full" fill="none">
          {/* Continent outlines — simplified */}
          <ellipse cx="180" cy="60" rx="50" ry="35" fill="#1A1C24" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
          <ellipse cx="310" cy="70" rx="55" ry="40" fill="#1A1C24" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
          <ellipse cx="80" cy="55" rx="40" ry="45" fill="#1A1C24" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
          <ellipse cx="130" cy="110" rx="25" ry="20" fill="#1A1C24" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
          <ellipse cx="340" cy="110" rx="30" ry="18" fill="#1A1C24" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
        </svg>

        {/* Pulsing dots */}
        {MAP_PINS.map((pin, i) => (
          <motion.div
            key={pin.name}
            className="absolute"
            style={{ left: pin.x, top: pin.y, transform: 'translate(-50%, -50%)' }}
            initial={{ scale: 0, opacity: 0 }}
            animate={isInView ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
            transition={{ duration: 0.4, delay: 0.5 + i * 0.15 }}
          >
            {/* Pulse ring */}
            <motion.div
              className="absolute inset-0 w-4 h-4 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ backgroundColor: `${pin.color}30`, left: '50%', top: '50%' }}
              animate={{ scale: [1, 2.5], opacity: [0.6, 0] }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
            />
            {/* Dot */}
            <div
              className="w-2 h-2 rounded-full relative z-10"
              style={{ backgroundColor: pin.color, boxShadow: `0 0 6px ${pin.color}60` }}
            />
            {/* Label */}
            <span className="absolute top-3 left-1/2 -translate-x-1/2 text-[7px] whitespace-nowrap text-[#9CA3AF]">
              {pin.name}
            </span>
          </motion.div>
        ))}
      </div>
      <p className="text-[10px] text-center text-[#6B7280] mt-1">5 campus · 3 continents</p>
    </div>
  )
}

/* ========================================
   SECURITY MOCKUP — "Sécurité"
   ======================================== */

function SecurityMockup() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-50px' })

  return (
    <div ref={ref} className="w-full flex flex-col items-center justify-center py-2">
      {/* Shield with encryption visual */}
      <div className="relative w-16 h-16 mb-3">
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={isInView ? { scale: 1, rotate: 0 } : { scale: 0, rotate: -20 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="w-full h-full flex items-center justify-center"
        >
          <Shield size={40} className="text-[#4F9EFF]" strokeWidth={1.5} />
        </motion.div>

        {/* Orbiting lock */}
        <motion.div
          className="absolute inset-0"
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        >
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1"
            style={{ color: '#34D399' }}
          >
            <Lock size={10} />
          </div>
        </motion.div>

        {/* Encryption lines */}
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: 60 + i * 16,
              height: 60 + i * 16,
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              border: `1px dashed ${['#4F9EFF20', '#A78BFA15', '#34D39910'][i]}`,
            }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.5, delay: 0.3 + i * 0.15 }}
          />
        ))}
      </div>

      <p className="text-[10px] text-[#6B7280] text-center">AES-256 · RGPD · ISO 27001</p>
    </div>
  )
}

/* ========================================
   ANALYTICS MOCKUP — "Analytique"
   ======================================== */

function AnalyticsMockup() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-50px' })

  const bars = [
    { height: 45, color: '#4F9EFF' },
    { height: 72, color: '#4F9EFF' },
    { height: 58, color: '#A78BFA' },
    { height: 85, color: '#4F9EFF' },
    { height: 64, color: '#A78BFA' },
    { height: 92, color: '#34D399' },
    { height: 78, color: '#4F9EFF' },
    { height: 55, color: '#A78BFA' },
  ]

  return (
    <div ref={ref} className="w-full">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={14} className="text-[#A78BFA]" />
        <span className="text-[10px] font-medium text-[#9CA3AF]">Performance mensuelle</span>
      </div>
      <div className="flex items-end gap-1.5 h-20">
        {bars.map((bar, i) => (
          <motion.div
            key={i}
            className="flex-1 rounded-t-sm relative overflow-hidden"
            style={{ minHeight: 4, background: '#1A1C24' }}
          >
            <motion.div
              className="absolute inset-x-0 bottom-0 rounded-t-sm"
              style={{
                background: `linear-gradient(to top, ${bar.color}, ${bar.color}40)`,
              }}
              initial={{ height: 0 }}
              animate={isInView ? { height: `${bar.height}%` } : { height: 0 }}
              transition={{ duration: 0.5, delay: 0.3 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
            />
          </motion.div>
        ))}
      </div>
      <div className="flex justify-between mt-2">
        {['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A'].map((m, i) => (
          <span key={i} className="flex-1 text-center text-[8px] text-[#6B7280]">{m}</span>
        ))}
      </div>
    </div>
  )
}

/* ========================================
   MAIN: FEATURES BENTO SECTION
   ======================================== */

export default function FeaturesBento() {
  return (
    <section
      className="relative py-24 md:py-32 px-6 md:px-8"
      style={{ background: '#0A0B0F' }}
    >
      {/* Background glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full opacity-[0.03] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse, #4F9EFF, transparent 70%)',
          filter: 'blur(100px)',
        }}
      />

      <div className="max-w-6xl mx-auto relative">
        {/* Heading */}
        <ScrollReveal>
          <div className="text-center mb-16 md:mb-20">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-[#FAFAFA]">
              Tout ce qu&apos;il vous faut.{' '}
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage: 'linear-gradient(135deg, #4F9EFF 0%, #A78BFA 50%, #F472B6 100%)',
                }}
              >
                Rien de superflu.
              </span>
            </h2>
            <p className="mt-4 text-base md:text-lg text-[#6B7280] max-w-lg mx-auto">
              Six piliers essentiels pour transformer la gestion de votre établissement.
            </p>
          </div>
        </ScrollReveal>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
          {/* Large card 1: Gestion Scolaire Intégrale — spans 2 cols */}
          <ScrollReveal delay={0} className="md:col-span-2">
            <BentoCard
              span="md:col-span-2"
              gradient="linear-gradient(135deg, #4F9EFF, #A78BFA)"
            >
              <div className="flex flex-col h-full">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-lg bg-[#4F9EFF]/15 border border-[#4F9EFF]/20 flex items-center justify-center">
                    <GraduationCap size={18} className="text-[#4F9EFF]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[#FAFAFA]">Gestion Scolaire Intégrale</h3>
                    <p className="text-xs text-[#6B7280]">Notes, présences, bulletins — un seul dashboard</p>
                  </div>
                </div>
                <DashboardMockup />
              </div>
            </BentoCard>
          </ScrollReveal>

          {/* Small card 1: Paiements */}
          <ScrollReveal delay={100}>
            <BentoCard gradient="linear-gradient(135deg, #34D399, #4F9EFF)">
              <div className="flex flex-col h-full">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-lg bg-[#34D399]/15 border border-[#34D399]/20 flex items-center justify-center">
                    <CreditCard size={18} className="text-[#34D399]" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#FAFAFA]">Paiements</h3>
                    <p className="text-[10px] text-[#6B7280]">Mobile Money · Virement · Espèces</p>
                  </div>
                </div>
                <PaymentMockup />
              </div>
            </BentoCard>
          </ScrollReveal>

          {/* Small card 2: Multi-Établissements */}
          <ScrollReveal delay={200}>
            <BentoCard gradient="linear-gradient(135deg, #A78BFA, #4F9EFF)">
              <div className="flex flex-col h-full">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-lg bg-[#A78BFA]/15 border border-[#A78BFA]/20 flex items-center justify-center">
                    <Globe size={18} className="text-[#A78BFA]" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#FAFAFA]">Multi-Établissements</h3>
                    <p className="text-[10px] text-[#6B7280]">Gérez vos campus partout dans le monde</p>
                  </div>
                </div>
                <WorldMapMockup />
              </div>
            </BentoCard>
          </ScrollReveal>

          {/* Large card 2: Communication multilingue — spans 2 cols */}
          <ScrollReveal delay={150} className="md:col-span-2">
            <BentoCard
              span="md:col-span-2"
              gradient="linear-gradient(135deg, #A78BFA, #F472B6)"
            >
              <div className="flex flex-col h-full">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-lg bg-[#A78BFA]/15 border border-[#A78BFA]/20 flex items-center justify-center text-lg">
                    💬
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[#FAFAFA]">Communication multilingue</h3>
                    <p className="text-xs text-[#6B7280]">Français, Anglais, Espagnol — traduction automatique</p>
                  </div>
                </div>
                <ChatMockup />
              </div>
            </BentoCard>
          </ScrollReveal>

          {/* Small card 3: Sécurité */}
          <ScrollReveal delay={250} className="md:col-span-1">
            <BentoCard gradient="linear-gradient(135deg, #4F9EFF, #34D399)">
              <div className="flex flex-col h-full min-h-[200px]">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-[#4F9EFF]/15 border border-[#4F9EFF]/20 flex items-center justify-center">
                    <Lock size={18} className="text-[#4F9EFF]" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#FAFAFA]">Sécurité</h3>
                    <p className="text-[10px] text-[#6B7280]">Chiffrement de bout en bout</p>
                  </div>
                </div>
                <div className="flex-1 flex items-center justify-center">
                  <SecurityMockup />
                </div>
              </div>
            </BentoCard>
          </ScrollReveal>

          {/* Small card 4: Analytique */}
          <ScrollReveal delay={300} className="md:col-span-1">
            <BentoCard gradient="linear-gradient(135deg, #A78BFA, #34D399)">
              <div className="flex flex-col h-full">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg bg-[#A78BFA]/15 border border-[#A78BFA]/20 flex items-center justify-center">
                    <BarChart3 size={18} className="text-[#A78BFA]" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#FAFAFA]">Analytique</h3>
                    <p className="text-[10px] text-[#6B7280]">Rapports en temps réel</p>
                  </div>
                </div>
                <AnalyticsMockup />
              </div>
            </BentoCard>
          </ScrollReveal>

          {/* Additional spacer card to balance the grid (3 cols) */}
          <ScrollReveal delay={350} className="md:col-span-1">
            <BentoCard gradient="linear-gradient(135deg, #F472B6, #4F9EFF)">
              <div className="flex flex-col h-full items-center justify-center text-center py-8">
                <motion.div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                  style={{
                    background: 'linear-gradient(135deg, #4F9EFF20, #A78BFA20, #F472B620)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                  whileHover={{ scale: 1.05, rotate: 5 }}
                  transition={{ duration: 0.3 }}
                >
                  <span className="text-2xl">🚀</span>
                </motion.div>
                <h3 className="text-base font-bold text-[#FAFAFA] mb-1">Et plus encore</h3>
                <p className="text-[10px] text-[#6B7280] max-w-[180px]">
                  API ouverte, webhooks, intégrations SSO et bien d&apos;autres fonctionnalités
                </p>
              </div>
            </BentoCard>
          </ScrollReveal>
        </div>
      </div>
    </section>
  )
}
