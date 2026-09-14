'use client'

import React, { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react'
import { motion, useInView, useMotionValue, useSpring, animate } from 'framer-motion'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────────────────────────────────────────
// AnimatedCounter — compte animé de 0 vers la cible quand il entre dans le viewport.
// Accepte `value` OU `target` comme prop numérique.
// ─────────────────────────────────────────────────────────────────────────────
interface AnimatedCounterProps {
  value?: number
  target?: number
  prefix?: string
  suffix?: string
  duration?: number
  decimals?: number
  className?: string
  separator?: boolean
}

export function AnimatedCounter({
  value,
  target,
  prefix = '',
  suffix = '',
  duration = 2,
  decimals = 0,
  className,
  separator = true,
}: AnimatedCounterProps) {
  const finalTarget = target ?? value ?? 0
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const [display, setDisplay] = useState(0)

  // Ré-anime quand la cible change (ex : stats chargées après le premier rendu)
  useEffect(() => {
    if (!inView) return
    const controls = animate(0, finalTarget, {
      duration: Math.max(0.3, duration),
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(v),
    })
    return () => controls.stop()
  }, [inView, finalTarget, duration])

  const formatted = separator
    ? display.toLocaleString('fr-FR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : display.toFixed(decimals)

  return (
    <span ref={ref} className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ScrollReveal — révèle le contenu au scroll (fade + translation directionnelle).
// `delay` accepte des secondes (< 1) ou des millisecondes (>= 1).
// ─────────────────────────────────────────────────────────────────────────────
type RevealDirection = 'up' | 'down' | 'left' | 'right' | 'none'

interface ScrollRevealProps {
  children: ReactNode
  direction?: RevealDirection
  delay?: number
  duration?: number
  className?: string
  once?: boolean
  distance?: number
}

const directionOffsets: Record<RevealDirection, { x: number; y: number }> = {
  up: { x: 0, y: 32 },
  down: { x: 0, y: -32 },
  left: { x: 32, y: 0 },
  right: { x: -32, y: 0 },
  none: { x: 0, y: 0 },
}

export function ScrollReveal({
  children,
  direction = 'up',
  delay = 0,
  duration = 0.6,
  className,
  once = true,
  distance,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once, margin: '-60px' })
  // Heuristique : delay >= 1 => millisecondes, sinon secondes
  const delaySeconds = delay >= 1 ? delay / 1000 : delay
  const offset = directionOffsets[direction] ?? directionOffsets.up
  const d = distance ?? Math.abs(offset.y || offset.x)

  const initial =
    direction === 'left'
      ? { opacity: 0, x: d }
      : direction === 'right'
        ? { opacity: 0, x: -d }
        : direction === 'down'
          ? { opacity: 0, y: -d }
          : direction === 'none'
            ? { opacity: 0 }
            : { opacity: 0, y: d }

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={initial}
      animate={inView ? { opacity: 1, x: 0, y: 0 } : initial}
      transition={{ duration, delay: delaySeconds, ease: [0.21, 0.47, 0.32, 0.98] }}
    >
      {children}
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// StaggerContainer / StaggerItem — apparition en cascade des enfants.
// ─────────────────────────────────────────────────────────────────────────────
interface StaggerContainerProps {
  children: ReactNode
  className?: string
  staggerDelay?: number
  initialDelay?: number
}

export function StaggerContainer({
  children,
  className,
  staggerDelay = 0.1,
  initialDelay = 0,
}: StaggerContainerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })

  return (
    <motion.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      variants={{
        hidden: {},
        visible: {
          transition: { staggerChildren: staggerDelay, delayChildren: initialDelay },
        },
      }}
    >
      {children}
    </motion.div>
  )
}

interface StaggerItemProps {
  children: ReactNode
  className?: string
  direction?: RevealDirection
}

export function StaggerItem({ children, className, direction = 'up' }: StaggerItemProps) {
  const offset = directionOffsets[direction] ?? directionOffsets.up
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, x: offset.x, y: offset.y },
        visible: {
          opacity: 1,
          x: 0,
          y: 0,
          transition: { duration: 0.55, ease: [0.21, 0.47, 0.32, 0.98] },
        },
      }}
    >
      {children}
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// GlowCard — carte avec halo lumineux coloré, s'intensifiant au survol.
// ─────────────────────────────────────────────────────────────────────────────
interface GlowCardProps {
  children: ReactNode
  className?: string
  glowColor?: string
  style?: CSSProperties
  onClick?: () => void
}

export function GlowCard({ children, className, glowColor, style, onClick }: GlowCardProps) {
  const glow = glowColor || 'rgba(245, 166, 35, 0.35)'
  return (
    <motion.div
      className={cn('relative rounded-2xl', onClick && 'cursor-pointer', className)}
      style={
        {
          boxShadow: `0 0 0 1px color-mix(in srgb, ${glow} 25%, transparent), 0 4px 24px -8px color-mix(in srgb, ${glow} 45%, transparent)`,
          ...style,
        } as CSSProperties
      }
      whileHover={{
        boxShadow: `0 0 0 1px color-mix(in srgb, ${glow} 60%, transparent), 0 12px 48px -12px color-mix(in srgb, ${glow} 75%, transparent)`,
        y: -4,
      }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      onClick={onClick}
    >
      {children}
    </motion.div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MagneticButton — bouton attiré par le curseur (effet magnétique).
// ─────────────���───────────────────────────────────────────────────────────────
interface MagneticButtonProps {
  children: ReactNode
  className?: string
  onClick?: () => void
  strength?: number
  type?: 'button' | 'submit'
  disabled?: boolean
}

export function MagneticButton({
  children,
  className,
  onClick,
  strength = 0.35,
  type = 'button',
  disabled,
}: MagneticButtonProps) {
  const ref = useRef<HTMLButtonElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const springX = useSpring(x, { stiffness: 200, damping: 15, mass: 0.2 })
  const springY = useSpring(y, { stiffness: 200, damping: 15, mass: 0.2 })

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current || disabled) return
    const rect = ref.current.getBoundingClientRect()
    const relX = e.clientX - (rect.left + rect.width / 2)
    const relY = e.clientY - (rect.top + rect.height / 2)
    x.set(relX * strength)
    y.set(relY * strength)
  }

  const handleMouseLeave = () => {
    x.set(0)
    y.set(0)
  }

  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled}
      className={className}
      onClick={onClick}
      style={{ x: springX, y: springY }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      whileTap={{ scale: 0.96 }}
    >
      {children}
    </motion.button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AuroraBackground — fond décoratif animé (aurores/glow doux) derrière le contenu.
// ─────────────────────────────────────────────────────────────────────────────
interface AuroraBackgroundProps {
  children: ReactNode
  className?: string
  showGrid?: boolean
}

export function AuroraBackground({ children, className, showGrid = false }: AuroraBackgroundProps) {
  return (
    <div className={cn('relative overflow-hidden', className)}>
      {/* blobs d'aurore */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <motion.div
          className="absolute -top-32 -left-24 h-96 w-96 rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(circle at center, oklch(72% 0.15 65), transparent 70%)' }}
          animate={{ x: [0, 60, 0], y: [0, 30, 0], scale: [1, 1.15, 1] }}
          transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute top-1/3 -right-24 h-[28rem] w-[28rem] rounded-full opacity-25 blur-3xl"
          style={{ background: 'radial-gradient(circle at center, oklch(55% 0.15 175), transparent 70%)' }}
          animate={{ x: [0, -50, 0], y: [0, -40, 0], scale: [1, 1.2, 1] }}
          transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-40 left-1/3 h-96 w-96 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle at center, oklch(60% 0.12 300), transparent 70%)' }}
          animate={{ x: [0, 40, 0], y: [0, -30, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
        />
        {showGrid && (
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
              backgroundSize: '56px 56px',
            }}
          />
        )}
      </div>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// BlurText — texte révélé mot par mot avec un flou qui se dissipe.
// ─────────────────────────────────────────────────────────────────────────────
interface BlurTextProps {
  text: string
  delay?: number
  stepDuration?: number
  className?: string
  once?: boolean
}

export function BlurText({
  text,
  delay = 0,
  stepDuration = 0.4,
  className,
  once = true,
}: BlurTextProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once, margin: '-40px' })
  const words = text.split(' ')
  // Heuristique ms vs secondes pour le délai initial
  const delaySeconds = delay >= 1 ? delay / 1000 : delay

  return (
    <span ref={ref} className={className} aria-label={text}>
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          aria-hidden
          className="inline-block will-change-[filter,opacity,transform]"
          initial={{ opacity: 0, filter: 'blur(10px)', y: 8 }}
          animate={inView ? { opacity: 1, filter: 'blur(0px)', y: 0 } : {}}
          transition={{
            duration: stepDuration,
            delay: delaySeconds + i * (stepDuration * 0.35),
            ease: 'easeOut',
          }}
        >
          {word}
          {i < words.length - 1 ? '\u00A0' : ''}
        </motion.span>
      ))}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// GradientText — texte en dégradé de couleurs animé (léger balayage de lumière).
// ─────────────────────────────────────────────────────────────────────────────
interface GradientTextProps {
  children: ReactNode
  colors?: string[]
  className?: string
  animated?: boolean
}

export function GradientText({
  children,
  colors,
  className,
  animated = true,
}: GradientTextProps) {
  const palette =
    colors && colors.length >= 2
      ? colors
      : ['#f5a623', '#e8962d', '#d4860f']
  const gradient = `linear-gradient(120deg, ${palette.join(', ')})`
  const backgroundSize = `${palette.length * 100}% 100%`

  return (
    <motion.span
      className={cn('inline-block bg-clip-text text-transparent', className)}
      style={{
        backgroundImage: gradient,
        backgroundSize,
        backgroundClip: 'text',
        WebkitBackgroundClip: 'text',
        color: 'transparent',
      }}
      animate={animated ? { backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] } : undefined}
      transition={
        animated
          ? { duration: 8 + palette.length * 2, repeat: Infinity, ease: 'linear' }
          : undefined
      }
    >
      {children}
    </motion.span>
  )
}
