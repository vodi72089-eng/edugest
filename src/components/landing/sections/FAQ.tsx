'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import ScrollReveal from '@/components/landing/ui/ScrollReveal'

// FAQ component — no required props

interface FAQItem {
  question: string
  answer: string
}

const FAQ_DATA: FAQItem[] = [
  // ⚠️ Prix et limites RÉELS (source : src/lib/subscription.ts getTierLimits
  // et src/lib/helpers.ts getSubscriptionPrice) — aucune affirmation
  // marketing non prouvée (RGPD, iOS/Android, support 24/7) ici.
  {
    question: 'Combien coûte EduGest ?',
    answer:
      "EduGest propose une formule gratuite (Freemium) pour découvrir la plateforme avec jusqu'à 100 élèves. Les formules payantes sont : Essentiel à 100 $/mois (250 élèves), Standard à 250 $/mois (1 000 élèves), Professionnel à 500 $/mois et Enterprise à 1 000 $/mois (élèves illimités). Pour les grands groupes multi-écoles, la formule Corporate est établie sur mesure.",
  },
  {
    question: 'Comment se passe la migration depuis notre ancien système ?',
    answer:
      "L'application Windows EduGest intègre un outil d'import de base de données : vos élèves, classes et notes peuvent être importés depuis un fichier, directement depuis l'écran de configuration. L'assistant de création d'école vous guide ensuite pour l'année scolaire, les classes et les matières.",
  },
  {
    question: 'Est-ce que ça marche hors-ligne ?',
    answer:
      "Oui. L'application de bureau EduGest (Windows) embarque une base de données locale : la saisie des notes, paiements et discipline fonctionne sans internet. Vos données restent sur votre machine, dans votre établissement.",
  },
  {
    question: 'Quels moyens de paiement sont supportés ?',
    answer:
      "EduGest enregistre les paiements en espèces, les virements et les passerelles de paiement mobile que vous configurez (configurateur intégré réservé aux formules Standard et supérieures). Les reçus sont générés automatiquement et les notifications peuvent partir par WhatsApp.",
  },
  {
    question: 'Y a-t-il une application pour l\'établissement ?',
    answer:
      "Oui, une application Windows est téléchargeable (installateur et version portable). Elle embarque le serveur et la base de données locaux : directeurs, secrétaires, caissiers, enseignants et service médical y travaillent en réseau local, même sans internet.",
  },
  {
    question: 'Le support est-il inclus ?',
    answer:
      "Un module de support est intégré à l'application : ouvrez un ticket depuis l'onglet Aide, notre équipe y répond et en est notifiée en temps réel. Les formules supérieures bénéficient d'un traitement prioritaire.",
  },
  {
    question: 'Où sont hébergées mes données ?',
    answer:
      "Avec l'application de bureau, vos données restent chez vous (base locale, chiffrée au niveau des secrets sensibles). Les formules Enterprise et Corporate peuvent héberger sur serveur dédié ou sur site (on-premise), selon votre choix.",
  },
  {
    question: 'Puis-je essayer avant d\'acheter ?',
    answer:
      "Oui : la formule Freemium est gratuite et sans engagement, jusqu'à 100 élèves, sans carte bancaire. Quand votre établissement grandit, la mise à niveau vers Essentiel, Standard, Professionnel ou Enterprise se fait depuis l'écran « Mon Abonnement » de l'application.",
  },
  {
    question: 'Comment se passe l\'onboarding ?',
    answer:
      "La création d'école est guidée : nom, niveau d'enseignement, système éducatif, année de fondation… puis les classes et matières sont créées automatiquement. Un compte administrateur d'école est créé avec le mot de passe que vous choisissez.",
  },
]

function FAQAccordionItem({
  item,
  isOpen,
  onToggle,
  index,
}: {
  item: FAQItem
  isOpen: boolean
  onToggle: () => void
  index: number
}) {
  return (
    <motion.div
      initial={false}
      className="border-b"
      style={{ borderColor: 'rgba(255,255,255,0.08)' }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-5 sm:py-6 text-left group"
        aria-expanded={isOpen}
      >
        <span
          className="text-base sm:text-lg font-medium pr-4 transition-colors duration-200"
          style={{ color: isOpen ? '#FAFAFA' : '#9CA3AF' }}
        >
          <span
            className="inline-block mr-3 text-sm font-mono"
            style={{ color: '#6B7280' }}
          >
            {String(index + 1).padStart(2, '0')}
          </span>
          {item.question}
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 25,
          }}
          className="flex-shrink-0"
        >
          <ChevronDown
            size={20}
            style={{ color: isOpen ? '#4F9EFF' : '#6B7280' }}
          />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: {
                type: 'spring',
                stiffness: 300,
                damping: 30,
              },
              opacity: {
                duration: 0.2,
              },
            }}
            className="overflow-hidden"
          >
            <p
              className="pb-5 sm:pb-6 text-sm sm:text-base leading-relaxed pl-8 sm:pl-10"
              style={{ color: '#9CA3AF' }}
            >
              {item.answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  const handleToggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <section className="py-24 sm:py-32" style={{ background: '#0A0B0F' }}>
      <div className="max-w-[800px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <ScrollReveal>
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tighter edu-heading-display text-[#FAFAFA] mb-4">
              Questions{' '}
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    'linear-gradient(135deg, #4F9EFF 0%, #A78BFA 50%, #F472B6 100%)',
                }}
              >
                fréquentes
              </span>
            </h2>
            <p className="text-[#9CA3AF] text-base sm:text-lg">
              Tout ce que vous devez savoir sur EduGest.
            </p>
          </div>
        </ScrollReveal>

        {/* Accordion */}
        <ScrollReveal delay={100}>
          <div
            className="rounded-2xl p-6 sm:p-8"
            style={{
              background: '#13141A',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            {FAQ_DATA.map((item, index) => (
              <FAQAccordionItem
                key={index}
                item={item}
                isOpen={openIndex === index}
                onToggle={() => handleToggle(index)}
                index={index}
              />
            ))}
          </div>
        </ScrollReveal>

        {/* Bottom CTA */}
        <ScrollReveal delay={200}>
          <p
            className="text-center text-sm mt-8"
            style={{ color: '#6B7280' }}
          >
            Vous avez d&apos;autres questions ?{' '}
            <button
              className="font-medium transition-colors duration-200 hover:underline"
              style={{ color: '#4F9EFF' }}
            >
              Contactez notre équipe
            </button>
          </p>
        </ScrollReveal>
      </div>
    </section>
  )
}
