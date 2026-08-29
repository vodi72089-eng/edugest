'use client'

import { motion, useMotionValue, useSpring } from 'framer-motion'
import { useRef, useCallback, type ReactNode } from 'react'

type GradientButtonVariant = 'primary' | 'secondary'
type GradientButtonSize = 'default' | 'lg'

interface GradientButtonProps {
  children: ReactNode
  variant?: GradientButtonVariant
  size?: GradientButtonSize
  className?: string
  onClick?: () => void
  href?: string
}

export default function GradientButton({
  children,
  variant = 'primary',
  size = 'default',
  className = '',
  onClick,
  href,
}: GradientButtonProps) {
  const ref = useRef<HTMLDivElement>(null)
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  const springConfig = { damping: 20, stiffness: 300 }
  const springX = useSpring(mouseX, springConfig)
  const springY = useSpring(mouseY, springConfig)

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const distX = e.clientX - centerX
      const distY = e.clientY - centerY
      const maxDist = 20
      const factor = Math.min(1, maxDist / Math.sqrt(distX * distX + distY * distY + 1))
      mouseX.set(distX * factor * 0.4)
      mouseY.set(distY * factor * 0.4)
    },
    [mouseX, mouseY]
  )

  const handleMouseLeave = useCallback(() => {
    mouseX.set(0)
    mouseY.set(0)
  }, [mouseX, mouseY])

  const sizeClasses =
    size === 'lg'
      ? 'px-8 py-4 text-base'
      : 'px-6 py-3 text-sm'

  const primaryClasses = `
    relative overflow-hidden rounded-xl font-medium
    text-white cursor-pointer
    ${sizeClasses}
  `

  const secondaryClasses = `
    relative rounded-xl font-medium cursor-pointer
    bg-transparent border border-white/20 text-white
    hover:bg-white/[0.06] hover:border-white/30
    transition-colors duration-300
    ${sizeClasses}
  `

  const content = (
    <motion.div
      ref={ref}
      className={`${variant === 'primary' ? primaryClasses : secondaryClasses} ${className}`}
      style={{
        x: springX,
        y: springY,
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
    >
      {variant === 'primary' && (
        <>
          {/* Animated gradient background */}
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(135deg, #4F9EFF 0%, #A78BFA 50%, #F472B6 100%)',
            }}
            animate={{
              backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
          {/* Shimmer overlay */}
          <motion.div
            className="absolute inset-0 opacity-0 group-hover:opacity-100"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
              backgroundSize: '200% 100%',
            }}
            animate={{
              backgroundPosition: ['-200% 0', '200% 0'],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
          {/* Glow shadow on hover */}
          <motion.div
            className="absolute inset-0 rounded-xl"
            animate={{
              boxShadow: [
                '0 0 0px rgba(79,158,255,0)',
                '0 0 30px rgba(79,158,255,0.3), 0 0 60px rgba(167,139,250,0.15)',
              ],
            }}
            whileHover={{
              boxShadow:
                '0 0 30px rgba(79,158,255,0.3), 0 0 60px rgba(167,139,250,0.15)',
            }}
            transition={{ duration: 0.4 }}
          />
        </>
      )}
      <span className="relative z-10 flex items-center justify-center gap-2">
        {children}
      </span>
    </motion.div>
  )

  if (href) {
    return (
      <a href={href} className="inline-block">
        {content}
      </a>
    )
  }

  return content
}
