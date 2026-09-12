'use client'

import { motion, useInView, useMotionValue, useTransform, animate } from 'framer-motion'
import { useRef, useEffect, useState } from 'react'

interface AnimatedCounterProps {
  value: number
  suffix?: string
  prefix?: string
  duration?: number
}

export default function AnimatedCounter({
  value,
  suffix = '',
  prefix = '',
  duration = 2,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-50px' })
  const motionValue = useMotionValue(0)
  const [displayValue, setDisplayValue] = useState(0)

  // Determine if value is a decimal
  const isDecimal = value % 1 !== 0
  const decimals = isDecimal ? (value.toString().split('.')[1] || '').length : 0

  useEffect(() => {
    if (!isInView) return

    const controls = animate(motionValue, value, {
      duration,
      ease: 'easeOut',
    })

    const unsubscribe = motionValue.on('change', (latest) => {
      setDisplayValue(
        isDecimal ? parseFloat(latest.toFixed(decimals)) : Math.round(latest)
      )
    })

    return () => {
      controls.stop()
      unsubscribe()
    }
  }, [isInView, value, duration, motionValue, isDecimal, decimals])

  const formattedValue = isDecimal
    ? displayValue.toFixed(decimals)
    : displayValue.toLocaleString()

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}{formattedValue}{suffix}
    </span>
  )
}
