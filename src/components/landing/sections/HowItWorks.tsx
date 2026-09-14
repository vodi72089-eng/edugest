'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { Settings, Users, LayoutDashboard } from 'lucide-react'
import ScrollReveal from '@/components/landing/ui/ScrollReveal'

const STEPS = [
  {
    number: '01',
    title: 'Configurez',
    highlight: 'Configurez',
    description: 'votre établissement en 5 minutes',
    icon: Settings,
    color: '#4F9EFF',
    gradient: 'from-[#4F9EFF]/20 to-[#4F9EFF]/5',
  },
  {
    number: '02',
    title: 'Connectez',
    highlight: 'Connectez',
    description: 'familles et enseignants',
    icon: Users,
    color: '#A78BFA',
    gradient: 'from-[#A78BFA]/20 to-[#A78BFA]/5',
  },
  {
    number: '03',
    title: 'Gérez',
    highlight: 'Gérez',
    description: 'tout depuis un tableau de bord',
    icon: LayoutDashboard,
    color: '#F472B6',
    gradient: 'from-[#F472B6]/20 to-[#F472B6]/5',
  },
]

/* ---- Animated Icon Components ---- */

function SpinningGear({ color }: { color: string }) {
  return (
    <motion.div
      className="relative w-14 h-14 flex items-center justify-center"
      animate={{ rotate: 360 }}
      transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
    >
      <Settings size={32} style={{ color }} strokeWidth={1.5} />
    </motion.div>
  )
}

function ConvergingUsers({ color, isInView }: { color: string; isInView: boolean }) {
  return (
    <div className="relative w-14 h-14 flex items-center justify-center">
      {/* Left user dot */}
      <motion.div
        className="absolute w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: color, top: '50%', y: '-50%' }}
        initial={{ left: '0%', opacity: 0 }}
        animate={isInView ? { left: '35%', opacity: 1 } : { left: '0%', opacity: 0 }}
        transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      />
      {/* Right user dot */}
      <motion.div
        className="absolute w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: color, top: '50%', y: '-50%' }}
        initial={{ right: '0%', opacity: 0 }}
        animate={isInView ? { right: '35%', opacity: 1 } : { right: '0%', opacity: 0 }}
        transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      />
      {/* Top user dot */}
      <motion.div
        className="absolute w-2.5 h-2.5 rounded-full"
        style={{ backgroundColor: color, left: '50%', x: '-50%' }}
        initial={{ top: '0%', opacity: 0 }}
        animate={isInView ? { top: '28%', opacity: 1 } : { top: '0%', opacity: 0 }}
        transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      />
      {/* Center icon */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={isInView ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
        transition={{ duration: 0.6, delay: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <Users size={28} style={{ color }} strokeWidth={1.5} />
      </motion.div>
    </div>
  )
}

function AppearingDashboard({ color, isInView }: { color: string; isInView: boolean }) {
  return (
    <div className="relative w-14 h-14 flex items-center justify-center">
      <motion.div
        initial={{ scale: 0.3, opacity: 0, rotateY: -90 }}
        animate={isInView ? { scale: 1, opacity: 1, rotateY: 0 } : { scale: 0.3, opacity: 0, rotateY: -90 }}
        transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <LayoutDashboard size={28} style={{ color }} strokeWidth={1.5} />
      </motion.div>
      {/* Pulse ring */}
      <motion.div
        className="absolute inset-0 rounded-xl border"
        style={{ borderColor: `${color}40` }}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={isInView ? { scale: [0.8, 1.3, 0.8], opacity: [0, 0.5, 0] } : { scale: 0.8, opacity: 0 }}
        transition={{ duration: 2, delay: 1, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}

/* ---- SVG Connector Line ---- */

function ConnectorLine({ isInView, color, direction = 'horizontal' }: { isInView: boolean; color: string; direction?: 'horizontal' | 'vertical' }) {
  if (direction === 'vertical') {
    return (
      <div className="flex justify-center py-2 md:hidden">
        <svg width="2" height="48" viewBox="0 0 2 48" fill="none" className="overflow-visible">
          <motion.line
            x1="1" y1="0" x2="1" y2="48"
            stroke={color}
            strokeWidth="2"
            strokeDasharray="4 4"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={isInView ? { pathLength: 1, opacity: 0.5 } : { pathLength: 0, opacity: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
      </div>
    )
  }

  return (
    <div className="hidden md:flex items-center px-2">
      <svg width="80" height="2" viewBox="0 0 80 2" fill="none" className="overflow-visible">
        <motion.line
          x1="0" y1="1" x2="80" y2="1"
          stroke={color}
          strokeWidth="2"
          strokeDasharray="6 4"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={isInView ? { pathLength: 1, opacity: 0.5 } : { pathLength: 0, opacity: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        />
        {/* Arrow tip */}
        <motion.circle
          cx="80" cy="1" r="3"
          fill={color}
          initial={{ opacity: 0, scale: 0 }}
          animate={isInView ? { opacity: 0.7, scale: 1 } : { opacity: 0, scale: 0 }}
          transition={{ duration: 0.3, delay: 1 }}
        />
      </svg>
    </div>
  )
}

/* ---- Step Card ---- */

function StepCard({
  step,
  index,
  isInView,
}: {
  step: typeof STEPS[number]
  index: number
  isInView: boolean
}) {
  const IconComponent = step.icon

  return (
    <ScrollReveal delay={index * 200} direction="up">
      <div
        className="relative flex-1 group rounded-2xl border border-white/[0.08] bg-[#13141A] p-8 transition-all duration-300 hover:border-white/[0.15]"
        style={{
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        {/* Gradient glow on hover */}
        <div
          className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at 50% 0%, ${step.color}10, transparent 70%)`,
          }}
        />

        {/* Step number */}
        <span
          className="text-xs font-mono font-bold tracking-widest mb-4 block"
          style={{ color: step.color }}
        >
          ÉTAPE {step.number}
        </span>

        {/* Animated icon */}
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
          style={{
            background: `linear-gradient(135deg, ${step.color}15, ${step.color}05)`,
            border: `1px solid ${step.color}20`,
          }}
        >
          {index === 0 && <SpinningGear color={step.color} />}
          {index === 1 && <ConvergingUsers color={step.color} isInView={isInView} />}
          {index === 2 && <AppearingDashboard color={step.color} isInView={isInView} />}
        </div>

        {/* Title */}
        <h3 className="text-xl font-bold text-[#FAFAFA] mb-2">
          {step.highlight}{' '}
          <span className="text-[#9CA3AF] font-normal text-base">{step.description}</span>
        </h3>

        {/* Decorative bottom accent */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 h-px w-0 group-hover:w-1/2 transition-all duration-500"
          style={{ background: `linear-gradient(90deg, transparent, ${step.color}, transparent)` }}
        />
      </div>
    </ScrollReveal>
  )
}

/* ---- Main Component ---- */

export default function HowItWorks() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' })

  return (
    <section
      ref={sectionRef}
      className="relative py-24 md:py-32 px-6 md:px-8"
      style={{ background: '#0A0B0F' }}
    >
      {/* Background glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full opacity-[0.04] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse, #A78BFA, transparent 70%)',
          filter: 'blur(80px)',
        }}
      />

      <div className="max-w-6xl mx-auto relative">
        {/* Heading */}
        <ScrollReveal>
          <div className="text-center mb-16 md:mb-20">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tighter edu-heading-display text-[#FAFAFA]">
              Simple comme{' '}
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage: 'linear-gradient(135deg, #4F9EFF 0%, #A78BFA 50%, #F472B6 100%)',
                }}
              >
                1, 2, 3
              </span>
            </h2>
            <p className="mt-4 text-base md:text-lg text-[#6B7280] max-w-lg mx-auto">
              En trois étapes, votre établissement est opérationnel sur EduGest.
            </p>
          </div>
        </ScrollReveal>

        {/* Steps — Desktop: horizontal with connectors */}
        <div className="hidden md:flex items-stretch">
          {STEPS.map((step, i) => (
            <div key={step.number} className="flex items-stretch flex-1">
              <StepCard step={step} index={i} isInView={isInView} />
              {i < STEPS.length - 1 && (
                <ConnectorLine
                  isInView={isInView}
                  color={STEPS[i + 1].color}
                  direction="horizontal"
                />
              )}
            </div>
          ))}
        </div>

        {/* Steps — Mobile: vertical with connectors */}
        <div className="md:hidden flex flex-col">
          {STEPS.map((step, i) => (
            <div key={step.number}>
              <StepCard step={step} index={i} isInView={isInView} />
              {i < STEPS.length - 1 && (
                <ConnectorLine
                  isInView={isInView}
                  color={STEPS[i + 1].color}
                  direction="vertical"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
