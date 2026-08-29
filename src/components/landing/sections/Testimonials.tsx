'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Star, Quote, ChevronLeft, ChevronRight } from 'lucide-react'
import ScrollReveal from '@/components/landing/ui/ScrollReveal'
import GlassCard from '@/components/landing/ui/GlassCard'
import AnimatedCounter from '@/components/landing/ui/AnimatedCounter'

// ===== Testimonial Data =====
interface Testimonial {
  id: number
  name: string
  role: string
  establishment: string
  flag: string
  quote: string
  initials: string
  color: string
}

const TESTIMONIALS: Testimonial[] = [
  {
    id: 1,
    name: 'Marie Dubois',
    role: 'Directrice',
    establishment: 'Lycée International de Paris',
    flag: '🇫🇷',
    quote: "EduGest a transformé notre gestion quotidienne. En 3 mois, nous avons réduit le temps administratif de 40%. L'intuitivité de la plateforme a convaincu même les plus réticents.",
    initials: 'MD',
    color: '#4F9EFF',
  },
  {
    id: 2,
    name: 'John Smith',
    role: 'Principal',
    establishment: 'Boston Academy',
    flag: '🇺🇸',
    quote: "The multi-campus feature is exactly what we needed. Managing 3 schools from one dashboard is a game changer. Our staff productivity has never been higher.",
    initials: 'JS',
    color: '#A78BFA',
  },
  {
    id: 3,
    name: 'Yuki Tanaka',
    role: 'Head Teacher',
    establishment: 'Tokyo Modern School',
    flag: '🇯🇵',
    quote: "The multilingual support and WhatsApp integration make communication with parents seamless. It's the bridge we needed between school and home.",
    initials: 'YT',
    color: '#34D399',
  },
]

// ===== Logo Placeholder =====
function LogoPlaceholder({ name, delay = 0 }: { name: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center justify-center h-12 px-6 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.12] transition-all duration-300"
    >
      <span className="text-[12px] font-semibold text-[#6B7280] tracking-wider uppercase">{name}</span>
    </motion.div>
  )
}

// ===== Star Rating =====
function StarRating({ count = 5 }: { count?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <Star
          key={i}
          size={14}
          className="fill-[#F59E0B] text-[#F59E0B]"
        />
      ))}
    </div>
  )
}

// ===== Testimonial Card =====
function TestimonialCard({ testimonial, isActive }: { testimonial: Testimonial; isActive: boolean }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: isActive ? 1 : 0.5, scale: isActive ? 1 : 0.92 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-2xl mx-auto"
    >
      <GlassCard hoverable={false} className="p-6 sm:p-8">
        {/* Quote icon */}
        <div className="mb-5">
          <Quote
            size={32}
            style={{ color: testimonial.color, opacity: 0.4 }}
          />
        </div>

        {/* Quote text */}
        <p className="text-[15px] sm:text-base leading-relaxed text-[#FAFAFA] mb-6">
          &ldquo;{testimonial.quote}&rdquo;
        </p>

        {/* Rating */}
        <div className="mb-5">
          <StarRating />
        </div>

        {/* Author */}
        <div className="flex items-center gap-3.5">
          {/* Avatar */}
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0"
            style={{
              background: `linear-gradient(135deg, ${testimonial.color}30, ${testimonial.color}15)`,
              color: testimonial.color,
              border: `1.5px solid ${testimonial.color}40`,
            }}
          >
            {testimonial.initials}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[14px] font-semibold text-[#FAFAFA]">{testimonial.name}</p>
              <span className="text-base">{testimonial.flag}</span>
            </div>
            <p className="text-[12px] text-[#9CA3AF]">
              {testimonial.role} · {testimonial.establishment}
            </p>
          </div>
        </div>
      </GlassCard>
    </motion.div>
  )
}

// ===== Main Component =====
export default function Testimonials() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % TESTIMONIALS.length)
  }, [])

  const goToPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + TESTIMONIALS.length) % TESTIMONIALS.length)
  }, [])

  // Auto-scroll
  useEffect(() => {
    if (isPaused) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    intervalRef.current = setInterval(goToNext, 5000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isPaused, goToNext])

  // Progress indicator — uses ref + rAF to avoid setState in effect
  const progressRef = useRef<number>(0)
  const [progressTick, setProgressTick] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (isPaused) {
      progressRef.current = 0
      cancelAnimationFrame(rafRef.current)
      // Use microtask to avoid synchronous setState in effect body
      queueMicrotask(() => setProgressTick(0))
      return
    }

    const startTime = Date.now()
    const duration = 5000

    const tick = () => {
      const elapsed = Date.now() - startTime
      progressRef.current = Math.min(elapsed / duration, 1)
      setProgressTick(progressRef.current)
      if (progressRef.current < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [currentIndex, isPaused])

  return (
    <section className="py-24 sm:py-32 px-4 sm:px-6" style={{ background: '#0A0B0F' }}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <ScrollReveal>
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tighter edu-heading-display text-[#FAFAFA] mb-4">
              Ils nous font{' '}
              <span
                style={{
                  background: 'linear-gradient(135deg, #4F9EFF 0%, #A78BFA 50%, #F472B6 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                confiance
              </span>
            </h2>
            <p className="text-base sm:text-lg text-[#9CA3AF] max-w-xl mx-auto">
              Des établissements du monde entier nous font confiance pour transformer leur gestion scolaire.
            </p>
          </div>
        </ScrollReveal>

        {/* Carousel */}
        <ScrollReveal delay={100}>
          <div
            className="relative mb-8"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
          >
            {/* Navigation arrows */}
            <button
              onClick={goToPrev}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 sm:-translate-x-6 z-10 w-10 h-10 rounded-full border border-white/[0.08] bg-[#13141A] flex items-center justify-center text-[#6B7280] hover:text-[#FAFAFA] hover:border-white/[0.15] hover:bg-[#1A1C24] transition-all duration-200"
              aria-label="Previous testimonial"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={goToNext}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 sm:translate-x-6 z-10 w-10 h-10 rounded-full border border-white/[0.08] bg-[#13141A] flex items-center justify-center text-[#6B7280] hover:text-[#FAFAFA] hover:border-white/[0.15] hover:bg-[#1A1C24] transition-all duration-200"
              aria-label="Next testimonial"
            >
              <ChevronRight size={18} />
            </button>

            {/* Cards */}
            <div className="overflow-hidden px-4 sm:px-12">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentIndex}
                  initial={{ opacity: 0, x: 60 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -60 }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                >
                  <TestimonialCard
                    testimonial={TESTIMONIALS[currentIndex]}
                    isActive={true}
                  />
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Dots + Progress */}
            <div className="flex items-center justify-center gap-3 mt-6">
              {TESTIMONIALS.map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => setCurrentIndex(i)}
                  className="relative h-1.5 rounded-full overflow-hidden transition-all duration-300"
                  style={{
                    width: i === currentIndex ? 32 : 12,
                    background: i === currentIndex ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)',
                  }}
                  aria-label={`Go to testimonial ${i + 1}`}
                >
                  {i === currentIndex && !isPaused && (
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        background: 'linear-gradient(135deg, #4F9EFF, #A78BFA, #F472B6)',
                      }}
                      initial={{ width: '0%' }}
                      animate={{ width: `${progressTick * 100}%` }}
                      transition={{ duration: 0.05 }}
                    />
                  )}
                  {i === currentIndex && isPaused && (
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: '30%',
                        background: 'linear-gradient(135deg, #4F9EFF, #A78BFA, #F472B6)',
                        opacity: 0.5,
                      }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </ScrollReveal>

        {/* Logo placeholders */}
        <ScrollReveal delay={200}>
          <div className="mt-16 sm:mt-20 mb-12">
            <p className="text-center text-[12px] uppercase tracking-widest text-[#6B7280] mb-6">
              Ils nous font confiance
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
              <LogoPlaceholder name="EduGroup" delay={0} />
              <LogoPlaceholder name="Scola+ " delay={1} />
              <LogoPlaceholder name="LearnHub" delay={2} />
              <LogoPlaceholder name="CampusAI" delay={3} />
            </div>
          </div>
        </ScrollReveal>

        {/* Macro stats row */}
        <ScrollReveal delay={300}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-12 py-8 px-6 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
            {[
              { value: 240, suffix: '+', label: 'Écoles' },
              { value: 35, suffix: '', label: 'Pays' },
              { value: 98, suffix: '%', label: 'Satisfaction' },
            ].map((stat, i) => (
              <div key={stat.label} className="flex items-center gap-3">
                {i > 0 && (
                  <div className="hidden sm:block w-px h-8 bg-white/[0.08] -ml-6" />
                )}
                <div className="text-center">
                  <p className="text-2xl sm:text-3xl font-bold text-[#FAFAFA] tabular-nums">
                    <AnimatedCounter value={stat.value} suffix={stat.suffix} duration={2} />
                  </p>
                  <p className="text-[12px] text-[#6B7280] mt-1">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}
