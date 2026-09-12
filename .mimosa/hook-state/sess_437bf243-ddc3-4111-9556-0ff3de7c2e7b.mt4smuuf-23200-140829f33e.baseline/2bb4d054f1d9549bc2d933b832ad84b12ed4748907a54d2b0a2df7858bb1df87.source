'use client'

import { motion, useInView } from 'framer-motion'
import { useRef, type ReactNode } from 'react'

type ScrollRevealDirection = 'up' | 'left' | 'right'

interface ScrollRevealProps {
  children: ReactNode
  delay?: number
  direction?: ScrollRevealDirection
  className?: string
  once?: boolean
}

function getDirectionOffset(direction: ScrollRevealDirection) {
  switch (direction) {
    case 'left':
      return { x: -60, y: 0 }
    case 'right':
      return { x: 60, y: 0 }
    case 'up':
    default:
      return { x: 0, y: 60 }
  }
}

export default function ScrollReveal({
  children,
  delay = 0,
  direction = 'up',
  className = '',
  once = true,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once, margin: '-80px' })

  const offset = getDirectionOffset(direction)

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{
        opacity: 0,
        x: offset.x,
        y: offset.y,
      }}
      animate={
        isInView
          ? { opacity: 1, x: 0, y: 0 }
          : { opacity: 0, x: offset.x, y: offset.y }
      }
      transition={{
        duration: 0.8,
        delay: delay / 1000,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {children}
    </motion.div>
  )
}

/* Clip-path reveal variant for headings */
export function ClipReveal({
  children,
  delay = 0,
  className = '',
  once = true,
}: {
  children: ReactNode
  delay?: number
  className?: string
  once?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once, margin: '-80px' })

  return (
    <motion.div
      ref={ref}
      className={`overflow-hidden ${className}`}
    >
      <motion.div
        initial={{
          y: '100%',
          opacity: 0,
        }}
        animate={
          isInView
            ? { y: '0%', opacity: 1 }
            : { y: '100%', opacity: 0 }
        }
        transition={{
          duration: 0.8,
          delay: delay / 1000,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}
