'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { motion, useInView } from 'framer-motion'
import { Play, Users, TrendingUp, CreditCard, MessageSquare } from 'lucide-react'
import GradientButton from '@/components/landing/ui/GradientButton'
import MeshGradientBg from '@/components/landing/ui/MeshGradientBg'
import GlowOrb from '@/components/landing/ui/GlowOrb'
import ScrollReveal from '@/components/landing/ui/ScrollReveal'

interface HeroProps {
  onLogin?: () => void
  onDemo?: () => void
}

/* ===== Stat card for the dashboard mockup ===== */
function StatCard({
  icon: Icon,
  label,
  value,
  color,
  delay,
}: {
  icon: React.ElementType
  label: string
  value: string
  color: string
  delay: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })

  return (
    <motion.div
      ref={ref}
      className="rounded-xl p-4 relative overflow-hidden"
      style={{
        background: '#1A1C24',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Subtle glow */}
      <div
        className="absolute top-0 right-0 w-20 h-20 rounded-full opacity-20 blur-2xl pointer-events-none"
        style={{ background: color }}
      />
      <div className="flex items-center gap-3 mb-2">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${color}15` }}
        >
          <Icon size={16} style={{ color }} />
        </div>
        <span className="text-xs font-medium" style={{ color: '#6B7280' }}>
          {label}
        </span>
      </div>
      <div className="text-xl font-semibold tabular-nums" style={{ color: '#FAFAFA' }}>
        {value}
      </div>
    </motion.div>
  )
}

/* ===== Mini bar chart ===== */
function MiniChart({ delay }: { delay: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })

  const bars = [
    { height: 45, color: '#4F9EFF' },
    { height: 62, color: '#4F9EFF' },
    { height: 38, color: '#4F9EFF' },
    { height: 75, color: '#A78BFA' },
    { height: 55, color: '#4F9EFF' },
    { height: 82, color: '#A78BFA' },
    { height: 68, color: '#4F9EFF' },
    { height: 90, color: '#34D399' },
    { height: 72, color: '#A78BFA' },
    { height: 60, color: '#4F9EFF' },
    { height: 85, color: '#34D399' },
    { height: 78, color: '#A78BFA' },
  ]

  return (
    <motion.div
      ref={ref}
      className="rounded-xl p-4"
      style={{
        background: '#1A1C24',
        border: '1px solid rgba(255,255,255,0.06)',
      }}
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium" style={{ color: '#6B7280' }}>
          Inscriptions
        </span>
        <span className="text-xs font-medium" style={{ color: '#34D399' }}>
          +12.5%
        </span>
      </div>
      <div className="flex items-end gap-1.5 h-16">
        {bars.map((bar, i) => (
          <motion.div
            key={i}
            className="flex-1 rounded-sm min-w-0"
            style={{
              background: bar.color,
              opacity: 0.7,
              height: `${bar.height}%`,
            }}
            initial={{ height: 0 }}
            animate={isInView ? { height: `${bar.height}%` } : {}}
            transition={{
              duration: 0.8,
              delay: delay + 0.05 * i,
              ease: [0.22, 1, 0.36, 1],
            }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-2">
        {['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'].map(
          (m, i) => (
            <span
              key={i}
              className="flex-1 text-center text-[9px]"
              style={{ color: '#4B5563' }}
            >
              {m}
            </span>
          )
        )}
      </div>
    </motion.div>
  )
}

/* ===== Student row ===== */
function StudentRow({
  name,
  class_: cls,
  grade,
  status,
  delay,
}: {
  name: string
  class_: string
  grade: string
  status: 'success' | 'warning' | 'error'
  delay: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })

  const statusColors = {
    success: '#34D399',
    warning: '#F59E0B',
    error: '#EF4444',
  }
  const statusLabels = {
    success: 'Actif',
    warning: 'En attente',
    error: 'Absent',
  }

  return (
    <motion.div
      ref={ref}
      className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-white/[0.02] transition-colors"
      initial={{ opacity: 0, x: -20 }}
      animate={isInView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Avatar */}
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0"
        style={{ background: '#252730', color: '#9CA3AF' }}
      >
        {name
          .split(' ')
          .map((w) => w[0])
          .join('')
          .substring(0, 2)}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="text-xs font-medium truncate"
          style={{ color: '#FAFAFA' }}
        >
          {name}
        </div>
        <div className="text-[10px]" style={{ color: '#6B7280' }}>
          {cls}
        </div>
      </div>
      <div className="text-xs font-medium tabular-nums" style={{ color: '#9CA3AF' }}>
        {grade}
      </div>
      <div className="flex items-center gap-1.5">
        <div
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: statusColors[status] }}
        />
        <span className="text-[10px]" style={{ color: '#6B7280' }}>
          {statusLabels[status]}
        </span>
      </div>
    </motion.div>
  )
}

/* ===== Social proof logos (SVG placeholders) ===== */
function SchoolLogo({ index }: { index: number }) {
  const colors = ['#4F9EFF', '#A78BFA', '#34D399', '#F472B6', '#F59E0B']
  const color = colors[index % colors.length]
  const shapes = [
    // Circle
    <circle key="c" cx="12" cy="12" r="10" stroke={color} strokeWidth="1.5" fill="none" />,
    // Triangle
    <path key="t" d="M12 3L22 20H2L12 3Z" stroke={color} strokeWidth="1.5" fill="none" />,
    // Square
    <rect key="s" x="3" y="3" width="18" height="18" rx="3" stroke={color} strokeWidth="1.5" fill="none" />,
    // Hexagon
    <path key="h" d="M12 2L21.5 7.5V16.5L12 22L2.5 16.5V7.5L12 2Z" stroke={color} strokeWidth="1.5" fill="none" />,
    // Star
    <path key="st" d="M12 2L14.5 8.5L21.5 9L16 13.5L17.5 20.5L12 17L6.5 20.5L8 13.5L2.5 9L9.5 8.5L12 2Z" stroke={color} strokeWidth="1.5" fill="none" />,
  ]

  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      className="opacity-40 grayscale"
    >
      {shapes[index % shapes.length]}
    </svg>
  )
}

/* ===== Main Hero component ===== */
export default function Hero({ onLogin, onDemo }: HeroProps) {
  const sectionRef = useRef<HTMLElement>(null)
  const dashboardRef = useRef<HTMLDivElement>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  // Mouse parallax for dashboard mockup
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!sectionRef.current) return
    const rect = sectionRef.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const distX = (e.clientX - centerX) / rect.width
    const distY = (e.clientY - centerY) / rect.height
    setMousePos({ x: distX, y: distY })
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [handleMouseMove])

  // Stagger animation for hero content
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.12,
        delayChildren: 0.2,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.8,
        ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
      },
    },
  }

  const schoolNames = [
    'Lycée Lumumba',
    'Collège Molière',
    'Académie Horizon',
    'École Newton',
    'Institut Pasteur',
  ]

  return (
    <section
      ref={sectionRef}
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
      style={{ background: '#0A0B0F' }}
    >
      {/* Background layers */}
      <MeshGradientBg className="z-0" />
      <GlowOrb color="#4F9EFF" size={500} className="top-[-10%] left-[10%] z-0" opacity={0.12} />
      <GlowOrb color="#A78BFA" size={400} className="top-[20%] right-[5%] z-0" opacity={0.1} />
      <GlowOrb color="#F472B6" size={350} className="bottom-[10%] left-[30%] z-0" opacity={0.08} />

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 z-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />

      {/* Content */}
      <div className="relative z-10 w-full max-w-[1280px] mx-auto px-6 md:px-10 lg:px-16 pt-32 pb-20 lg:pt-40 lg:pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-12 items-center">
          {/* Left side — Text content */}
          <motion.div
            className="text-center lg:text-left"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Eyebrow */}
            <motion.div variants={itemVariants} className="mb-6">
              <span
                className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[13px] font-medium uppercase tracking-wider"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <span className="landing-gradient-text">✦</span>
                <span className="landing-gradient-text">
                  Propulsé par l&apos;IA pour les écoles du monde entier
                </span>
              </span>
            </motion.div>

            {/* H1 */}
            <motion.h1
              variants={itemVariants}
              className="mb-6"
              style={{
                fontSize: 'clamp(48px, 7vw, 96px)',
                fontWeight: 600,
                letterSpacing: '-0.04em',
                lineHeight: 1.0,
                color: '#FAFAFA',
              }}
            >
              La gestion scolaire,{' '}
              <span className="landing-gradient-text">repensée.</span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              variants={itemVariants}
              className="text-base md:text-lg leading-relaxed mb-10 max-w-xl mx-auto lg:mx-0"
              style={{ color: '#9CA3AF' }}
            >
              Une plateforme moderne qui connecte 240+ établissements, 50&nbsp;000
              familles et leurs enseignants — partout dans le monde.
            </motion.p>

            {/* CTAs */}
            <motion.div
              variants={itemVariants}
              className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start"
            >
              <GradientButton variant="primary" size="lg" onClick={onDemo}>
                Demander une démo gratuite
              </GradientButton>
              <GradientButton
                variant="secondary"
                size="lg"
                onClick={() => {}}
              >
                <Play size={16} className="shrink-0" />
                Voir une vidéo
              </GradientButton>
            </motion.div>

            {/* Social proof */}
            <motion.div
              variants={itemVariants}
              className="mt-12"
            >
              <div className="flex items-center gap-3 justify-center lg:justify-start mb-3">
                {schoolNames.map((_, i) => (
                  <SchoolLogo key={i} index={i} />
                ))}
              </div>
              <p
                className="text-xs"
                style={{ color: '#6B7280' }}
              >
                Adopté par{' '}
                <span style={{ color: '#9CA3AF' }} className="font-medium">
                  240+
                </span>{' '}
                établissements dans{' '}
                <span style={{ color: '#9CA3AF' }} className="font-medium">
                  35 pays
                </span>
              </p>
            </motion.div>
          </motion.div>

          {/* Right side — Dashboard Mockup */}
          <ScrollReveal direction="right" delay={200} className="hidden lg:block">
            <div
              ref={dashboardRef}
              className="relative"
              style={{
                perspective: '1200px',
                transformStyle: 'preserve-3d',
              }}
            >
              <motion.div
                className="relative rounded-2xl overflow-hidden"
                style={{
                  background: '#13141A',
                  border: '1px solid rgba(255,255,255,0.08)',
                  boxShadow:
                    '0 0 0 1px rgba(255,255,255,0.02), 0 25px 50px -12px rgba(0,0,0,0.5), 0 0 80px rgba(79,158,255,0.06), 0 0 120px rgba(167,139,250,0.04)',
                  transform: `rotateY(${mousePos.x * 5}deg) rotateX(${-mousePos.y * 5}deg)`,
                  transition: 'transform 0.15s ease-out',
                }}
              >
                {/* Gradient border glow */}
                <div
                  className="absolute inset-0 rounded-2xl pointer-events-none"
                  style={{
                    padding: '1px',
                    background:
                      'linear-gradient(135deg, rgba(79,158,255,0.2), rgba(167,139,250,0.2), rgba(244,114,182,0.2))',
                    WebkitMask:
                      'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                    WebkitMaskComposite: 'xor',
                    maskComposite: 'exclude',
                  }}
                />

                {/* Dashboard header */}
                <div
                  className="flex items-center justify-between px-5 py-3 border-b"
                  style={{ borderColor: 'rgba(255,255,255,0.06)' }}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#EF4444' }} />
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#F59E0B' }} />
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#34D399' }} />
                    </div>
                    <span className="text-[11px] ml-2" style={{ color: '#4B5563' }}>
                      app.edugest.io/dashboard
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded" style={{ background: '#252730' }} />
                    <div
                      className="w-16 h-5 rounded"
                      style={{ background: '#252730' }}
                    />
                  </div>
                </div>

                {/* Dashboard body */}
                <div className="p-5">
                  {/* Top bar */}
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <div className="text-sm font-semibold" style={{ color: '#FAFAFA' }}>
                        Tableau de bord
                      </div>
                      <div className="text-[11px]" style={{ color: '#6B7280' }}>
                        Année scolaire 2025-2026
                      </div>
                    </div>
                    <div
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                      style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      <div className="w-4 h-4 rounded-full" style={{ background: '#252730' }} />
                      <span className="text-[11px]" style={{ color: '#9CA3AF' }}>
                        Lycée Lumumba
                      </span>
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <StatCard
                      icon={Users}
                      label="Élèves"
                      value="12,450"
                      color="#4F9EFF"
                      delay={0.3}
                    />
                    <StatCard
                      icon={TrendingUp}
                      label="Présence"
                      value="94.2%"
                      color="#34D399"
                      delay={0.4}
                    />
                    <StatCard
                      icon={CreditCard}
                      label="Paiements"
                      value="98.5%"
                      color="#A78BFA"
                      delay={0.5}
                    />
                    <StatCard
                      icon={MessageSquare}
                      label="Messages"
                      value="3,247"
                      color="#F472B6"
                      delay={0.6}
                    />
                  </div>

                  {/* Chart */}
                  <MiniChart delay={0.7} />

                  {/* Student list */}
                  <div
                    className="mt-4 rounded-xl p-3"
                    style={{
                      background: '#1A1C24',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <div className="flex items-center justify-between mb-2 px-3">
                      <span className="text-[11px] font-medium" style={{ color: '#6B7280' }}>
                        Élèves récents
                      </span>
                      <span className="text-[10px]" style={{ color: '#4B5563' }}>
                        Voir tout →
                      </span>
                    </div>
                    <StudentRow
                      name="Amina Diallo"
                      class_="6ème A"
                      grade="16.5"
                      status="success"
                      delay={0.9}
                    />
                    <StudentRow
                      name="Youssef Benali"
                      class_="3ème B"
                      grade="14.2"
                      status="success"
                      delay={1.0}
                    />
                    <StudentRow
                      name="Fatou Ndiaye"
                      class_="Terminale S"
                      grade="11.8"
                      status="warning"
                      delay={1.1}
                    />
                    <StudentRow
                      name="Kofi Asante"
                      class_="4ème C"
                      grade="—"
                      status="error"
                      delay={1.2}
                    />
                  </div>
                </div>
              </motion.div>

              {/* Floating badge 1 */}
              <motion.div
                className="absolute -top-4 -right-4 px-3 py-2 rounded-xl z-10"
                style={{
                  background: 'rgba(26, 28, 36, 0.9)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(12px)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                }}
                initial={{ opacity: 0, y: 20, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 1.4, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center"
                    style={{ background: 'rgba(52, 211, 153, 0.15)' }}
                  >
                    <TrendingUp size={12} style={{ color: '#34D399' }} />
                  </div>
                  <div>
                    <div className="text-[10px]" style={{ color: '#6B7280' }}>
                      Présence
                    </div>
                    <div className="text-xs font-semibold" style={{ color: '#34D399' }}>
                      +2.4% ↑
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Floating badge 2 */}
              <motion.div
                className="absolute -bottom-3 -left-3 px-3 py-2 rounded-xl z-10"
                style={{
                  background: 'rgba(26, 28, 36, 0.9)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  backdropFilter: 'blur(12px)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                }}
                initial={{ opacity: 0, y: -20, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: 1.6, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center"
                    style={{ background: 'rgba(79, 158, 255, 0.15)' }}
                  >
                    <CreditCard size={12} style={{ color: '#4F9EFF' }} />
                  </div>
                  <div>
                    <div className="text-[10px]" style={{ color: '#6B7280' }}>
                      Paiements
                    </div>
                    <div className="text-xs font-semibold" style={{ color: '#4F9EFF' }}>
                      98.5% ✓
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </ScrollReveal>
        </div>
      </div>

      {/* Bottom gradient fade */}
      <div
        className="absolute bottom-0 left-0 right-0 h-32 pointer-events-none z-10"
        style={{
          background: 'linear-gradient(to top, #0A0B0F, transparent)',
        }}
      />
    </section>
  )
}
