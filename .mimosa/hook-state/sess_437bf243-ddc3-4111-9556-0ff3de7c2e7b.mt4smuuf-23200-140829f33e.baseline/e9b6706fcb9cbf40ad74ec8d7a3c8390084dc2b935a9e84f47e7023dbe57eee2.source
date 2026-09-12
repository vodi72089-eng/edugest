'use client'

import { motion, type MotionProps } from 'framer-motion'
import { type ReactNode } from 'react'

interface GlassCardProps {
  children: ReactNode
  className?: string
  hoverable?: boolean
}

export default function GlassCard({
  children,
  className = '',
  hoverable = true,
}: GlassCardProps) {
  return (
    <motion.div
      className={`
        relative rounded-2xl overflow-hidden
        border border-white/[0.08]
        ${hoverable ? 'group' : ''}
        ${className}
      `}
      style={{
        background: '#13141A',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 0 0 1px rgba(255,255,255,0.02)',
      }}
      whileHover={
        hoverable
          ? {
              y: -4,
              transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
            }
          : undefined
      }
    >
      {/* Animated gradient border on hover */}
      {hoverable && (
        <motion.div
          className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            padding: '1px',
            background:
              'linear-gradient(135deg, #4F9EFF, #A78BFA, #F472B6, #4F9EFF)',
            backgroundSize: '300% 300%',
            WebkitMask:
              'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
          }}
          animate={{
            backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
      )}

      {/* Soft shadow on hover */}
      {hoverable && (
        <motion.div
          className="absolute inset-0 rounded-2xl pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            boxShadow:
              '0 8px 32px rgba(79,158,255,0.08), 0 4px 16px rgba(167,139,250,0.06)',
          }}
        />
      )}

      {/* Backdrop blur surface */}
      <div
        className="relative rounded-2xl"
        style={{
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        {children}
      </div>
    </motion.div>
  )
}
