'use client'

import GradientButton from '@/components/landing/ui/GradientButton'
import MeshGradientBg from '@/components/landing/ui/MeshGradientBg'
import GlowOrb from '@/components/landing/ui/GlowOrb'
import ScrollReveal from '@/components/landing/ui/ScrollReveal'

interface FinalCTAProps {
  onLogin: () => void
  onDemo: () => void
}

export default function FinalCTA({ onLogin, onDemo }: FinalCTAProps) {
  return (
    <section
      className="relative py-24 sm:py-32 overflow-hidden"
      style={{ background: '#0A0B0F' }}
    >
      {/* Background effects */}
      <MeshGradientBg
        colors={['#4F9EFF', '#A78BFA', '#F472B6']}
        className="opacity-40"
      />
      <GlowOrb
        color="#4F9EFF"
        size={500}
        className="top-1/4 left-1/4"
        opacity={0.1}
      />
      <GlowOrb
        color="#F472B6"
        size={400}
        className="bottom-1/4 right-1/4"
        opacity={0.08}
      />

      {/* Content */}
      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <ScrollReveal>
          <h2
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-6"
            style={{ color: '#FAFAFA' }}
          >
            Prêt à transformer votre{' '}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  'linear-gradient(135deg, #4F9EFF 0%, #A78BFA 50%, #F472B6 100%)',
              }}
            >
              établissement
            </span>
            {' '}?
          </h2>
        </ScrollReveal>

        <ScrollReveal delay={100}>
          <p
            className="text-base sm:text-lg mb-10 max-w-xl mx-auto"
            style={{ color: '#9CA3AF' }}
          >
            Rejoignez 240+ établissements qui simplifient leur quotidien dans 35
            pays
          </p>
        </ScrollReveal>

        <ScrollReveal delay={200}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <GradientButton variant="primary" size="lg" onClick={onLogin}>
              Démarrer gratuitement
            </GradientButton>
            <GradientButton variant="secondary" size="lg" onClick={onDemo}>
              Parler à l&apos;équipe
            </GradientButton>
          </div>
        </ScrollReveal>

        {/* Trust signals */}
        <ScrollReveal delay={300}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-6 sm:gap-8">
            {[
              { label: 'Sans carte bancaire', check: true },
              { label: '14 jours d\'essai', check: true },
              { label: 'Annulation à tout moment', check: true },
            ].map((signal) => (
              <div
                key={signal.label}
                className="flex items-center gap-2 text-sm"
                style={{ color: '#6B7280' }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="flex-shrink-0"
                >
                  <circle
                    cx="8"
                    cy="8"
                    r="8"
                    fill="rgba(52,211,153,0.15)"
                  />
                  <path
                    d="M5 8L7 10L11 6"
                    stroke="#34D399"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {signal.label}
              </div>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}
