'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Sparkles } from 'lucide-react'
import GlassCard from '@/components/landing/ui/GlassCard'
import GradientButton from '@/components/landing/ui/GradientButton'
import ScrollReveal from '@/components/landing/ui/ScrollReveal'

type BillingPeriod = 'monthly' | 'annual'
type Currency = 'EUR' | 'USD' | 'GBP' | 'XOF'

interface PricingProps {
  onLogin: () => void
}

const CURRENCIES: { code: Currency; symbol: string; flag: string }[] = [
  { code: 'USD', symbol: '$', flag: '🇺🇸' },
  { code: 'EUR', symbol: '€', flag: '🇪🇺' },
  { code: 'GBP', symbol: '£', flag: '🇬🇧' },
  { code: 'XOF', symbol: 'CFA', flag: '🇸🇳' },
]

const EXCHANGE_RATES: Record<Currency, number> = {
  USD: 1,
  EUR: 0.93,
  GBP: 0.79,
  XOF: 607.5,
}

interface PlanFeature {
  text: string
  included: boolean
}

interface Plan {
  name: string
  subtitle: string
  badge?: string
  monthlyPrice: number | null  // null = custom pricing
  features: PlanFeature[]
  cta: string
  ctaVariant: 'primary' | 'secondary'
  highlighted: boolean
}

const PLANS: Plan[] = [
  {
    name: 'Freemium',
    subtitle: 'Pour découvrir EduGest',
    monthlyPrice: 0,
    features: [
      { text: '1 admin', included: true },
      { text: '100 élèves max', included: true },
      { text: '0 msg WhatsApp', included: true },
      { text: 'Gestion basique', included: true },
    ],
    cta: 'Commencer',
    ctaVariant: 'secondary',
    highlighted: false,
  },
  {
    name: 'Essentiel',
    subtitle: 'Pour les petites structures',
    monthlyPrice: 100,
    features: [
      { text: '1 admin', included: true },
      { text: 'Professeurs illimités', included: true },
      { text: '500 msg WhatsApp/mois', included: true },
      { text: 'Notes & bulletins', included: true },
    ],
    cta: 'Commencer',
    ctaVariant: 'secondary',
    highlighted: false,
  },
  {
    name: 'Standard',
    subtitle: 'Le choix des écoles',
    badge: 'Populaire',
    monthlyPrice: 250,
    features: [
      { text: '5 admins', included: true },
      { text: '10 professeurs', included: true },
      { text: 'WhatsApp illimité', included: true },
      { text: 'Paiements mobiles', included: true },
      { text: 'Communications', included: true },
    ],
    cta: 'Commencer',
    ctaVariant: 'primary',
    highlighted: true,
  },
  {
    name: 'Professionnel',
    subtitle: 'Pour les grands établissements',
    monthlyPrice: 500,
    features: [
      { text: 'Admins illimités', included: true },
      { text: 'Profs illimités', included: true },
      { text: 'App mobile dédiée', included: true },
      { text: 'Support prioritaire', included: true },
      { text: 'API accès', included: true },
    ],
    cta: 'Commencer',
    ctaVariant: 'secondary',
    highlighted: false,
  },
  {
    name: 'Enterprise',
    subtitle: 'Multi-écoles',
    monthlyPrice: 1000,
    features: [
      { text: '3 écoles incluses', included: true },
      { text: 'Serveur dédié', included: true },
      { text: 'Formation équipe', included: true },
      { text: 'SLA garanti', included: true },
    ],
    cta: 'Commencer',
    ctaVariant: 'secondary',
    highlighted: false,
  },
  {
    name: 'Corporate',
    subtitle: 'Groupes scolaires',
    monthlyPrice: null,
    features: [
      { text: 'Écoles illimitées', included: true },
      { text: 'On-premise', included: true },
      { text: 'Marque blanche', included: true },
      { text: 'Intégration sur mesure', included: true },
    ],
    cta: 'Nous contacter',
    ctaVariant: 'secondary',
    highlighted: false,
  },
]

function formatPrice(
  price: number | null,
  currency: Currency,
  period: BillingPeriod
): string {
  if (price === null) return 'Sur mesure'
  if (price === 0) return '0'

  const rate = EXCHANGE_RATES[currency]
  const curr = CURRENCIES.find((c) => c.code === currency)!
  const multiplier = period === 'annual' ? 0.8 : 1
  const converted = price * rate * multiplier

  if (currency === 'XOF') {
    return Math.round(converted).toLocaleString('fr-FR')
  }
  return converted.toFixed(0).replace(/\.00$/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

function getCurrencySymbol(currency: Currency): string {
  return CURRENCIES.find((c) => c.code === currency)?.symbol || '$'
}

export default function Pricing({ onLogin }: PricingProps) {
  const [period, setPeriod] = useState<BillingPeriod>('monthly')
  const [currency, setCurrency] = useState<Currency>('USD')

  const savings = useMemo(() => {
    if (period === 'annual') return 20
    return 0
  }, [period])

  return (
    <section className="py-24 sm:py-32" style={{ background: '#0A0B0F' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <ScrollReveal>
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#FAFAFA] mb-4">
              Des tarifs adaptés à{' '}
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    'linear-gradient(135deg, #D4A017 0%, #F5C542 50%, #D4A017 100%)',
                }}
              >
                chaque établissement
              </span>
            </h2>
            <p className="text-[#9CA3AF] text-base sm:text-lg max-w-xl mx-auto">
              Des formules flexibles qui grandissent avec vous. Pas de frais cachés, pas d&apos;engagement.
            </p>
          </div>
        </ScrollReveal>

        {/* Billing toggle */}
        <ScrollReveal delay={100}>
          <div className="flex items-center justify-center mb-8">
            <div
              className="inline-flex items-center gap-1 p-1 rounded-full border"
              style={{
                background: '#13141A',
                borderColor: 'rgba(255,255,255,0.08)',
              }}
            >
              <button
                onClick={() => setPeriod('monthly')}
                className="relative px-5 py-2 rounded-full text-sm font-medium transition-colors duration-200"
                style={{
                  color: period === 'monthly' ? '#FAFAFA' : '#6B7280',
                }}
              >
                {period === 'monthly' && (
                  <motion.div
                    layoutId="billing-toggle"
                    className="absolute inset-0 rounded-full"
                    style={{ background: '#1A1C24' }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
                <span className="relative z-10">Mensuel</span>
              </button>
              <button
                onClick={() => setPeriod('annual')}
                className="relative px-5 py-2 rounded-full text-sm font-medium transition-colors duration-200 flex items-center gap-2"
                style={{
                  color: period === 'annual' ? '#FAFAFA' : '#6B7280',
                }}
              >
                {period === 'annual' && (
                  <motion.div
                    layoutId="billing-toggle"
                    className="absolute inset-0 rounded-full"
                    style={{ background: '#1A1C24' }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
                <span className="relative z-10">Annuel</span>
                <span
                  className="relative z-10 text-[11px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    background:
                      'linear-gradient(135deg, #D4A017 0%, #F5C542 50%, #D4A017 100%)',
                    color: '#0A0B0F',
                  }}
                >
                  -20%
                </span>
              </button>
            </div>
          </div>
        </ScrollReveal>

        {/* Currency selector */}
        <ScrollReveal delay={150}>
          <div className="flex items-center justify-center gap-2 mb-12 sm:mb-16">
            {CURRENCIES.map((c) => (
              <button
                key={c.code}
                onClick={() => setCurrency(c.code)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200"
                style={{
                  background:
                    currency === c.code ? '#1A1C24' : 'transparent',
                  border: `1px solid ${
                    currency === c.code
                      ? 'rgba(212,160,23,0.4)'
                      : 'rgba(255,255,255,0.08)'
                  }`,
                  color: currency === c.code ? '#F5C542' : '#6B7280',
                }}
              >
                <span>{c.flag}</span>
                <span>{c.code}</span>
              </button>
            ))}
          </div>
        </ScrollReveal>

        {/* Plans grid - 3 columns on desktop, 2 on tablet, 1 on mobile */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {PLANS.map((plan, idx) => (
            <ScrollReveal key={plan.name} delay={idx * 80}>
              <div className="relative h-full">
                {/* Animated gradient border for highlighted plan */}
                {plan.highlighted && (
                  <div
                    className="absolute -inset-px rounded-2xl overflow-hidden"
                    style={{ zIndex: 0 }}
                  >
                    <motion.div
                      className="absolute inset-0"
                      style={{
                        background:
                          'linear-gradient(135deg, #D4A017, #F5C542, #D4A017, #F5C542)',
                        backgroundSize: '300% 300%',
                      }}
                      animate={{
                        backgroundPosition: [
                          '0% 0%',
                          '100% 100%',
                          '0% 0%',
                        ],
                      }}
                      transition={{
                        duration: 6,
                        repeat: Infinity,
                        ease: 'linear',
                      }}
                    />
                  </div>
                )}
                <GlassCard
                  className="h-full"
                  hoverable={!plan.highlighted}
                >
                  <div
                    className="relative z-10 p-6 sm:p-8 flex flex-col h-full"
                    style={{
                      background: plan.highlighted ? '#13141A' : undefined,
                    }}
                  >
                    {/* Badge */}
                    {plan.badge && (
                      <motion.div
                        className="inline-flex items-center gap-1.5 self-start mb-4 px-3 py-1 rounded-full text-xs font-semibold"
                        style={{
                          background:
                            'linear-gradient(135deg, #D4A017 0%, #F5C542 50%, #D4A017 100%)',
                          color: '#0A0B0F',
                        }}
                        animate={{
                          boxShadow: [
                            '0 0 0px rgba(212,160,23,0)',
                            '0 0 16px rgba(212,160,23,0.4)',
                            '0 0 0px rgba(212,160,23,0)',
                          ],
                        }}
                        transition={{
                          duration: 3,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                      >
                        <Sparkles size={12} />
                        {plan.badge}
                      </motion.div>
                    )}

                    {/* Plan name */}
                    <h3
                      className="text-xl font-bold mb-1"
                      style={{ color: '#FAFAFA' }}
                    >
                      {plan.name}
                    </h3>

                    {/* Subtitle */}
                    <p
                      className="text-sm mb-5"
                      style={{ color: '#6B7280' }}
                    >
                      {plan.subtitle}
                    </p>

                    {/* Price */}
                    <div className="mb-6">
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={`${period}-${currency}-${plan.name}`}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.25 }}
                          className="flex items-baseline gap-1"
                        >
                          {plan.monthlyPrice !== null ? (
                            <>
                              <span
                                className="text-4xl sm:text-5xl font-extrabold"
                                style={{ color: '#FAFAFA' }}
                              >
                                {formatPrice(
                                  plan.monthlyPrice,
                                  currency,
                                  period
                                )}
                              </span>
                              <span
                                className="text-sm font-medium"
                                style={{ color: '#9CA3AF' }}
                              >
                                {getCurrencySymbol(currency)}
                                {plan.monthlyPrice > 0 && '/mois'}
                              </span>
                            </>
                          ) : (
                            <span
                              className="text-4xl sm:text-5xl font-extrabold"
                              style={{ color: '#FAFAFA' }}
                            >
                              Sur mesure
                            </span>
                          )}
                        </motion.div>
                      </AnimatePresence>
                      {plan.monthlyPrice !== null &&
                        plan.monthlyPrice > 0 &&
                        period === 'annual' && (
                          <p
                            className="text-xs mt-1"
                            style={{ color: '#6B7280' }}
                          >
                            Facturé annuellement ·{' '}
                            {formatPrice(
                              plan.monthlyPrice,
                              currency,
                              'monthly'
                            )}
                            {getCurrencySymbol(currency)}/mois habituellement
                          </p>
                        )}
                      {plan.monthlyPrice === 0 && (
                        <p
                          className="text-xs mt-1"
                          style={{ color: '#6B7280' }}
                        >
                          Gratuit pour toujours
                        </p>
                      )}
                    </div>

                    {/* Features */}
                    <ul className="space-y-3 mb-8 flex-1">
                      {plan.features.map((feature) => (
                        <li
                          key={feature.text}
                          className="flex items-start gap-3"
                        >
                          <div
                            className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                            style={{
                              background: feature.included
                                ? 'rgba(212,160,23,0.15)'
                                : 'rgba(255,255,255,0.05)',
                            }}
                          >
                            {feature.included && (
                              <Check
                                size={12}
                                style={{ color: '#F5C542' }}
                              />
                            )}
                          </div>
                          <span
                            className="text-sm"
                            style={{
                              color: feature.included
                                ? '#9CA3AF'
                                : '#4B5563',
                            }}
                          >
                            {feature.text}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <GradientButton
                      variant={plan.ctaVariant}
                      size="lg"
                      className="w-full"
                      onClick={onLogin}
                    >
                      {plan.cta}
                    </GradientButton>
                  </div>
                </GlassCard>
              </div>
            </ScrollReveal>
          ))}
        </div>

        {/* Bottom note */}
        <ScrollReveal delay={300}>
          <p
            className="text-center text-xs mt-12"
            style={{ color: '#6B7280' }}
          >
            Tous les prix sont HT. La TVA applicable sera ajoutée lors de la
            facturation. Vous pouvez changer de formule à tout moment.
          </p>
        </ScrollReveal>
      </div>
    </section>
  )
}
