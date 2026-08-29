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
  {
    question: 'Combien coûte EduGest ?',
    answer:
      "EduGest propose une formule gratuite pour les petits établissements (jusqu'à 50 élèves), et des formules payantes à partir de 3€ par élève par mois. Le plan annuel offre 20% de réduction. Pour les grands groupes, un devis sur mesure est établi.",
  },
  {
    question: 'Comment se passe la migration depuis notre ancien système ?',
    answer:
      "Notre équipe vous accompagne gratuitement pour importer vos données existantes (élèves, notes, paiements). La migration prend généralement entre 2 et 5 jours ouvrés selon le volume. Un interlocuteur dédié vous guide à chaque étape.",
  },
  {
    question: 'Est-ce que ça marche hors-ligne ?',
    answer:
      "Oui, EduGest fonctionne en mode hors-ligne grâce à un système de synchronisation intelligent. Les données sont enregistrées localement et se synchronisent automatiquement dès que la connexion est rétablie, sans aucune perte d'information.",
  },
  {
    question: 'Quels moyens de paiement sont supportés ?',
    answer:
      "Nous supportons les paiements Mobile Money (M-Pesa, Orange Money, Wave, Airtel Money), les virements bancaires, les cartes bancaires, et les espèces via nos partenaires. Les reçus sont générés automatiquement et envoyés par WhatsApp ou SMS.",
  },
  {
    question: 'Y a-t-il une application mobile ?',
    answer:
      "Oui, EduGest est disponible sur iOS et Android. L'application permet aux directeurs, enseignants et parents d'accéder à toutes les fonctionnalités clés : notes, communications, paiements et suivi de la scolarité, directement depuis leur téléphone.",
  },
  {
    question: 'Le support est-il disponible 24/7 ?',
    answer:
      "Le support email est disponible pour tous les plans. Les plans Pro et Enterprise bénéficient d'un support prioritaire par chat et téléphone pendant les heures ouvrées. Le plan Enterprise inclut un support dédié 24/7 avec un interlocuteur attitré.",
  },
  {
    question: 'Combien de langues sont supportées ?',
    answer:
      "EduGest est disponible en français, anglais, espagnol et portugais. Nous ajoutons régulièrement de nouvelles langues en fonction des besoins de nos utilisateurs. L'interface s'adapte automatiquement à la langue du navigateur de l'utilisateur.",
  },
  {
    question: 'Est-ce conforme au RGPD ?',
    answer:
      "Absolument. EduGest est entièrement conforme au RGPD et aux réglementations locales de protection des données. Vos données sont hébergées en Europe, chiffrées en transit et au repos. Vous pouvez exporter ou supprimer vos données à tout moment.",
  },
  {
    question: 'Puis-je essayer avant d\'acheter ?',
    answer:
      "Oui, vous pouvez créer un compte gratuit et utiliser EduGest sans engagement. Le plan Starter est gratuit pour toujours. Pour les plans supérieurs, une période d'essai de 14 jours est disponible, avec accès complet à toutes les fonctionnalités, sans carte bancaire requise.",
  },
  {
    question: 'Comment se passe l\'onboarding ?',
    answer:
      "L'onboarding est guidé et interactif. Après inscription, un assistant vous accompagne pour configurer votre établissement en quelques minutes : année scolaire, classes, matières. Des tutoriels vidéo et une documentation complète sont disponibles à chaque étape.",
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
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#FAFAFA] mb-4">
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
