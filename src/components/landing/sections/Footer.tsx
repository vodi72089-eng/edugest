'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Twitter,
  Linkedin,
  Github,
  Youtube,
} from 'lucide-react'
import ScrollReveal from '@/components/landing/ui/ScrollReveal'

interface FooterProps {
  onLogin: () => void
  onNavigate: (sectionId: string) => void
}

interface FooterColumn {
  title: string
  links: { label: string; href: string }[]
}

const COLUMNS: FooterColumn[] = [
  {
    title: 'Produit',
    links: [
      { label: 'Fonctionnalités', href: 'features' },
      { label: 'Tarifs', href: 'pricing' },
      { label: 'Intégrations', href: 'integrations' },
      { label: 'Mises à jour', href: 'updates' },
      { label: 'API', href: 'api' },
    ],
  },
  {
    title: 'Solutions',
    links: [
      { label: 'Écoles primaires', href: 'primary' },
      { label: 'Secondaires', href: 'secondary' },
      { label: 'Lycées', href: 'highschool' },
      { label: 'Multi-écoles', href: 'multi' },
      { label: 'Districts', href: 'districts' },
    ],
  },
  {
    title: 'Ressources',
    links: [
      { label: 'Blog', href: 'blog' },
      { label: 'Documentation', href: 'docs' },
      { label: 'Webinaires', href: 'webinars' },
      { label: "Centre d'aide", href: 'help' },
      { label: 'Communauté', href: 'community' },
    ],
  },
  {
    title: 'Entreprise',
    links: [
      { label: 'À propos', href: 'about' },
      { label: 'Carrières', href: 'careers' },
      { label: 'Partenaires', href: 'partners' },
      { label: 'Presse', href: 'press' },
      { label: 'Contact', href: 'contact' },
    ],
  },
  {
    title: 'Légal',
    links: [
      { label: 'Confidentialité', href: 'privacy' },
      { label: 'Conditions', href: 'terms' },
      { label: 'RGPD', href: 'gdpr' },
      { label: 'Cookies', href: 'cookies' },
      { label: 'Sécurité', href: 'security' },
    ],
  },
]

const LANGUAGES = [
  { code: 'fr', label: 'FR', flag: '🇫🇷' },
  { code: 'en', label: 'EN', flag: '🇬🇧' },
  { code: 'es', label: 'ES', flag: '🇪🇸' },
  { code: 'pt', label: 'PT', flag: '🇵🇹' },
]

const SOCIAL_LINKS = [
  { icon: Twitter, href: '#', label: 'Twitter' },
  { icon: Linkedin, href: '#', label: 'LinkedIn' },
  { icon: Github, href: '#', label: 'GitHub' },
  { icon: Youtube, href: '#', label: 'YouTube' },
]

export default function Footer({ onLogin, onNavigate }: FooterProps) {
  const [language, setLanguage] = useState('fr')

  return (
    <footer style={{ background: '#0A0B0F' }} className="relative">
      {/* Subtle top border */}
      <div
        className="h-px w-full"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(79,158,255,0.3) 20%, rgba(167,139,250,0.3) 50%, rgba(244,114,182,0.3) 80%, transparent 100%)',
        }}
      />

      {/* "Available in 120+ countries" band */}
      <div
        className="py-3 text-center text-xs font-medium tracking-wider uppercase"
        style={{
          color: '#6B7280',
          background: 'rgba(255,255,255,0.02)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        Available in 120+ countries
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Logo + tagline */}
        <ScrollReveal>
          <div className="pt-16 sm:pt-20 pb-12 sm:pb-16 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-3 mb-3">
              <img
                src="/edugest-logo-new.png"
                alt="EduGest"
                width="32"
                height="32"
                className="object-contain"
              />
              <span
                className="text-xl font-bold"
                style={{ color: '#FAFAFA' }}
              >
                EduGest
              </span>
            </div>
            <p
              className="text-sm max-w-md mx-auto sm:mx-0"
              style={{ color: '#6B7280' }}
            >
              EduGest — La gestion scolaire, repensée.
            </p>
          </div>
        </ScrollReveal>

        {/* Columns grid */}
        <ScrollReveal delay={100}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8 sm:gap-10 pb-12 sm:pb-16">
            {COLUMNS.map((column) => (
              <div key={column.title}>
                <h4
                  className="text-xs font-semibold uppercase tracking-wider mb-4"
                  style={{ color: '#6B7280' }}
                >
                  {column.title}
                </h4>
                <ul className="space-y-3">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <button
                        onClick={() => onNavigate(link.href)}
                        className="text-sm transition-colors duration-200 relative group"
                        style={{ color: '#9CA3AF' }}
                        onMouseEnter={(e) => {
                          ;(e.target as HTMLElement).style.color = '#FAFAFA'
                        }}
                        onMouseLeave={(e) => {
                          ;(e.target as HTMLElement).style.color = '#9CA3AF'
                        }}
                      >
                        {link.label}
                        <span
                          className="absolute bottom-0 left-0 w-0 h-px transition-all duration-300 group-hover:w-full"
                          style={{
                            background:
                              'linear-gradient(90deg, #4F9EFF, #A78BFA)',
                          }}
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </ScrollReveal>

        {/* Divider */}
        <div
          className="h-px w-full"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        />

        {/* Bottom section */}
        <div className="py-8 sm:py-10 flex flex-col lg:flex-row items-center justify-between gap-6">
          {/* Language selector */}
          <div className="flex items-center gap-2">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => setLanguage(lang.code)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200"
                style={{
                  background:
                    language === lang.code ? '#1A1C24' : 'transparent',
                  border: `1px solid ${
                    language === lang.code
                      ? 'rgba(255,255,255,0.15)'
                      : 'rgba(255,255,255,0.08)'
                  }`,
                  color: language === lang.code ? '#FAFAFA' : '#6B7280',
                }}
              >
                <span>{lang.flag}</span>
                <span>{lang.label}</span>
              </button>
            ))}
          </div>

          {/* Social icons */}
          <div className="flex items-center gap-3">
            {SOCIAL_LINKS.map((social) => {
              const Icon = social.icon
              return (
                <motion.a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-200"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    color: '#6B7280',
                  }}
                  whileHover={{
                    scale: 1.08,
                    borderColor: 'rgba(255,255,255,0.2)',
                  }}
                  whileTap={{ scale: 0.95 }}
                  onMouseEnter={(e) => {
                    ;(e.target as HTMLElement).style.color = '#FAFAFA'
                    ;(
                      e.target as HTMLElement
                    ).parentElement!.style.color = '#FAFAFA'
                  }}
                  onMouseLeave={(e) => {
                    ;(e.target as HTMLElement).style.color = '#6B7280'
                    ;(
                      e.target as HTMLElement
                    ).parentElement!.style.color = '#6B7280'
                  }}
                >
                  <Icon size={16} />
                </motion.a>
              )
            })}
          </div>

          {/* CTA */}
          <button
            onClick={onLogin}
            className="text-sm font-medium px-5 py-2 rounded-lg transition-colors duration-200"
            style={{
              color: '#4F9EFF',
              border: '1px solid rgba(79,158,255,0.2)',
              background: 'rgba(79,158,255,0.05)',
            }}
            onMouseEnter={(e) => {
              ;(e.target as HTMLElement).style.background =
                'rgba(79,158,255,0.12)'
            }}
            onMouseLeave={(e) => {
              ;(e.target as HTMLElement).style.background =
                'rgba(79,158,255,0.05)'
            }}
          >
            Se connecter →
          </button>
        </div>

        {/* Final divider */}
        <div
          className="h-px w-full"
          style={{ background: 'rgba(255,255,255,0.05)' }}
        />

        {/* Bottom bar */}
        <div className="py-6 sm:py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-center sm:text-left" style={{ color: '#4B5563' }}>
          <span>© 2026 EduGest · Tous droits réservés</span>
          <span>Bureaux à Paris, New York, Singapore</span>
          <span>Made with care for schools worldwide</span>
        </div>
      </div>
    </footer>
  )
}
