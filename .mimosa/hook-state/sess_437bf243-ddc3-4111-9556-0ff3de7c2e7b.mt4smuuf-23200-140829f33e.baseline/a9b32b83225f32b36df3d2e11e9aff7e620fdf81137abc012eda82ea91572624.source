'use client'

import { motion, useMotionValue, useSpring } from 'framer-motion'
import { useEffect, useCallback } from 'react'

interface GlowOrbProps {
  color?: string
  size?: number
  className?: string
  opacity?: number
}

export default function GlowOrb({
  color = '#4F9EFF',
  size = 400,
  className = '',
  opacity = 0.15,
}: GlowOrbProps) {
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  const springConfig = { damping: 30, stiffness: 80 }
  const springX = useSpring(mouseX, springConfig)
  const springY = useSpring(mouseY, springConfig)

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      // Parallax: orb moves slightly in opposite direction from center
      const centerX = window.innerWidth / 2
      const centerY = window.innerHeight / 2
      const distX = e.clientX - centerX
      const distY = e.clientY - centerY
      const factor = -0.05 // subtle parallax depth
      mouseX.set(distX * factor)
      mouseY.set(distY * factor)
    },
    [mouseX, mouseY]
  )

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [handleMouseMove])

  return (
    <motion.div
      className={`absolute rounded-full pointer-events-none ${className}`}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle, ${color}40 0%, ${color}15 40%, transparent 70%)`,
        filter: 'blur(80px)',
        opacity,
        x: springX,
        y: springY,
      }}
      aria-hidden="true"
    />
  )
}
