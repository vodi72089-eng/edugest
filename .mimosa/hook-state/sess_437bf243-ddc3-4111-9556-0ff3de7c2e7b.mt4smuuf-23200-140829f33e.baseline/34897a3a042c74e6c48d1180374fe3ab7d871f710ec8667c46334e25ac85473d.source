'use client'

import { motion } from 'framer-motion'

interface MeshGradientBgProps {
  className?: string
  colors?: string[]
}

export default function MeshGradientBg({
  className = '',
  colors = ['#4F9EFF', '#A78BFA', '#F472B6'],
}: MeshGradientBgProps) {
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {/* Blob 1 */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '50vw',
          height: '50vw',
          maxWidth: '600px',
          maxHeight: '600px',
          background: `radial-gradient(circle, ${colors[0]}33 0%, transparent 70%)`,
          filter: 'blur(80px)',
          top: '-10%',
          left: '-10%',
        }}
        animate={{
          x: [0, 80, -40, 0],
          y: [0, -60, 40, 0],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Blob 2 */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '45vw',
          height: '45vw',
          maxWidth: '550px',
          maxHeight: '550px',
          background: `radial-gradient(circle, ${colors[1]}33 0%, transparent 70%)`,
          filter: 'blur(80px)',
          top: '30%',
          right: '-10%',
        }}
        animate={{
          x: [0, -60, 40, 0],
          y: [0, 80, -40, 0],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Blob 3 */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '40vw',
          height: '40vw',
          maxWidth: '500px',
          maxHeight: '500px',
          background: `radial-gradient(circle, ${colors[2]}33 0%, transparent 70%)`,
          filter: 'blur(80px)',
          bottom: '-10%',
          left: '20%',
        }}
        animate={{
          x: [0, 50, -70, 0],
          y: [0, -50, 30, 0],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </div>
  )
}
