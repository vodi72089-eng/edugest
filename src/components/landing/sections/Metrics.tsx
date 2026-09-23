'use client'

import { motion, useInView } from 'framer-motion'
import { useRef } from 'react'
import { Building2, Users, Heart, Clock } from 'lucide-react'
import ScrollReveal from '@/components/landing/ui/ScrollReveal'
import GlassCard from '@/components/landing/ui/GlassCard'
import AnimatedCounter from '@/components/landing/ui/AnimatedCounter'

// ===== Stat Card =====
function StatCard({
  icon,
  value,
  suffix,
  label,
  color,
  delay = 0,
}: {
  icon: React.ReactNode
  value: number
  suffix?: string
  label: string
  color: string
  delay?: number
}) {
  return (
    <ScrollReveal delay={delay}>
      <GlassCard hoverable={true} className="p-6 sm:p-8 text-center relative overflow-hidden">
        {/* Subtle glow behind the icon */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full blur-3xl opacity-20 pointer-events-none"
          style={{ background: color }}
        />

        {/* Icon */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: delay / 1000 + 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative mx-auto mb-4 w-12 h-12 rounded-xl flex items-center justify-center"
          style={{
            background: `linear-gradient(135deg, ${color}20, ${color}08)`,
            border: `1px solid ${color}30`,
          }}
        >
          <span style={{ color }}>{icon}</span>
        </motion.div>

        {/* Value */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: delay / 1000 + 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative"
        >
          <p className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#FAFAFA] tabular-nums mb-2">
            <AnimatedCounter value={value} suffix={suffix} duration={2} />
          </p>
        </motion.div>

        {/* Label */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: delay / 1000 + 0.4, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative text-[13px] sm:text-[14px] text-[#9CA3AF]"
        >
          {label}
        </motion.p>

        {/* Decorative bottom line */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: delay / 1000 + 0.6, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 w-12 rounded-full"
          style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
        />
      </GlassCard>
    </ScrollReveal>
  )
}

// ===== Main Component =====
export default function Metrics() {
  const sectionRef = useRef<HTMLElement>(null)
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' })

  const stats = [
    {
      icon: <Building2 size={22} />,
      value: 240,
      suffix: '+',
      label: 'Établissements',
      color: '#4F9EFF',
    },
    {
      icon: <Users size={22} />,
      value: 50000,
      suffix: '+',
      label: 'Élèves suivis',
      color: '#A78BFA',
    },
    {
      icon: <Heart size={22} />,
      value: 98,
      suffix: '%',
      label: 'Taux de satisfaction',
      color: '#34D399',
    },
    {
      icon: <Clock size={22} />,
      value: 12,
      suffix: 'h/semaine',
      label: 'De temps administratif gagné',
      color: '#F472B6',
    },
  ]

  return (
    <section
      ref={sectionRef}
      className="py-24 sm:py-32 px-4 sm:px-6 relative overflow-hidden"
      style={{ background: '#0D0E14' }}
    >
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Top gradient fade */}
        <div
          className="absolute top-0 left-0 right-0 h-24"
          style={{
            background: 'linear-gradient(180deg, #0A0B0F, transparent)',
          }}
        />
        {/* Bottom gradient fade */}
        <div
          className="absolute bottom-0 left-0 right-0 h-24"
          style={{
            background: 'linear-gradient(0deg, #0A0B0F, transparent)',
          }}
        />
        {/* Central glow */}
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full blur-[120px] opacity-[0.03]"
          style={{
            background: 'linear-gradient(135deg, #4F9EFF, #A78BFA, #F472B6)',
          }}
          animate={isInView ? { opacity: 0.06 } : { opacity: 0.03 }}
          transition={{ duration: 2, ease: 'easeOut' }}
        />
      </div>

      <div className="max-w-6xl mx-auto relative">
        {/* Header */}
        <ScrollReveal>
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tighter edu-heading-display text-[#FAFAFA] mb-4">
              L&apos;impact EduGest en{' '}
              <span
                style={{
                  background: 'linear-gradient(135deg, #4F9EFF 0%, #A78BFA 50%, #F472B6 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                chiffres
              </span>
            </h2>
            <p className="text-base sm:text-lg text-[#9CA3AF] max-w-xl mx-auto">
              Des résultats mesurables qui parlent d&apos;eux-mêmes.
            </p>
          </div>
        </ScrollReveal>

        {/* Stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {stats.map((stat, i) => (
            <StatCard
              key={stat.label}
              icon={stat.icon}
              value={stat.value}
              suffix={stat.suffix}
              label={stat.label}
              color={stat.color}
              delay={i * 100}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
