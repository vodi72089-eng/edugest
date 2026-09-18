'use client'

import { motion } from 'framer-motion'
import { type ReactNode } from 'react'

interface BentoCardProps {
  children: ReactNode
  className?: string
  span?: string
  gradient?: string
}

export default function BentoCard({
  children,
  className = '',
  span = '',
  gradient = 'linear-gradient(135deg, #4F9EFF, #A78BFA, #F472B6)',
}: BentoCardProps) {
  return (
    <motion.div
      className={`relative group rounded-2xl overflow-hidden ${span} ${className}`}
      style={{
        background: '#13141A',
      }}
      whileHover={{
        y: -4,
        transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
      }}
    >
      {/* Animated gradient border */}
      <motion.div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          padding: '1px',
          background: gradient,
          backgroundSize: '200% 200%',
          WebkitMask:
            'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
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

      {/* Inner content with default border for non-hover state */}
      <div
        className="relative h-full rounded-2xl border border-white/[0.08] p-6"
        style={{
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        {children}
      </div>
    </motion.div>
  )
}
