'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import GradientButton from '@/components/landing/ui/GradientButton'

interface NavProps {
  onLogin?: () => void
  onNavigate?: (sectionId: string) => void
}

const NAV_ITEMS = [
  { label: 'Produit', id: 'product' },
  { label: 'Solutions', id: 'solutions' },
  { label: 'Tarifs', id: 'pricing' },
  { label: 'Ressources', id: 'resources' },
  { label: 'Démo', id: 'demo' },
]

function EduGestLogo({ className = '' }: { className?: string }) {
  return (
    <img
      src="/edugest-logo-new.png"
      alt="EduGest"
      width="32"
      height="32"
      className={className}
    />
  )
}

export default function Nav({ onLogin, onNavigate }: NavProps) {
  const [isScrolled, setIsScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { scrollY } = useScroll()

  useMotionValueEvent(scrollY, 'change', (latest) => {
    setIsScrolled(latest > 50)
  })

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  const handleNavClick = useCallback(
    (id: string) => {
      setMobileOpen(false)
      onNavigate?.(id)
    },
    [onNavigate]
  )

  const handleLogin = useCallback(() => {
    setMobileOpen(false)
    onLogin?.()
  }, [onLogin])

  // Mobile menu overlay variants
  const overlayVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
    exit: { opacity: 0, transition: { duration: 0.2, ease: 'easeIn' as const } },
  }

  const menuItemsVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: 0.1 + i * 0.06,
        duration: 0.5,
        ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
      },
    }),
    exit: { opacity: 0, y: 10, transition: { duration: 0.15 } },
  }

  return (
    <>
      <motion.header
        className="fixed top-0 left-0 right-0 z-50"
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          className="mx-auto transition-all duration-500"
          style={{
            maxWidth: isScrolled ? 'calc(100% - 32px)' : '100%',
            marginTop: isScrolled ? '8px' : '0px',
            borderRadius: isScrolled ? '16px' : '0px',
          }}
        >
          <motion.nav
            className={`
              relative flex items-center justify-between
              transition-all duration-500 ease-out
              ${
                isScrolled
                  ? 'px-6 py-3'
                  : 'px-6 md:px-10 lg:px-16 py-5'
              }
            `}
            style={{
              background: isScrolled
                ? 'rgba(19, 20, 26, 0.8)'
                : 'transparent',
              backdropFilter: isScrolled ? 'blur(24px) saturate(180%)' : 'none',
              WebkitBackdropFilter: isScrolled ? 'blur(24px) saturate(180%)' : 'none',
              border: isScrolled ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
              boxShadow: isScrolled
                ? '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)'
                : 'none',
            }}
          >
            {/* Logo */}
            <button
              onClick={() => handleNavClick('hero')}
              className="flex items-center gap-2.5 group"
              aria-label="EduGest Home"
            >
              <EduGestLogo className="transition-transform duration-300 group-hover:scale-110" />
              <span
                className="text-[18px] font-semibold tracking-tight"
                style={{ color: '#FAFAFA', fontFamily: 'var(--font-geist-sans)' }}
              >
                EduGest
              </span>
            </button>

            {/* Desktop menu */}
            <div className="hidden lg:flex items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`
                    relative px-4 py-2 rounded-lg text-sm font-medium
                    transition-colors duration-200
                    text-[#9CA3AF] hover:text-[#FAFAFA]
                  `}
                >
                  <span className="relative z-10">{item.label}</span>
                  {/* Subtle hover background */}
                  <motion.div
                    className="absolute inset-0 rounded-lg bg-white/[0.04] opacity-0 transition-opacity duration-200"
                    whileHover={{ opacity: 1 }}
                  />
                </button>
              ))}
            </div>

            {/* Desktop CTAs */}
            <div className="hidden lg:flex items-center gap-3">
              <button
                onClick={handleLogin}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#9CA3AF] hover:text-[#FAFAFA] transition-colors duration-200"
              >
                Se connecter
              </button>
              <GradientButton
                variant="primary"
                size="default"
                onClick={() => handleNavClick('demo')}
              >
                Demander une démo
              </GradientButton>
            </div>

            {/* Mobile hamburger */}
            <button
              className="lg:hidden relative z-50 p-2 -mr-2 rounded-lg text-[#9CA3AF] hover:text-[#FAFAFA] transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
            >
              <AnimatePresence mode="wait">
                {mobileOpen ? (
                  <motion.div
                    key="close"
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 90, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <X size={22} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="menu"
                    initial={{ rotate: 90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: -90, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Menu size={22} />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </motion.nav>
        </motion.div>
      </motion.header>

      {/* Mobile Full-Screen Overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-0 z-40 lg:hidden"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0"
              style={{ background: 'rgba(10, 11, 15, 0.95)', backdropFilter: 'blur(40px)' }}
            />

            {/* Menu content */}
            <div className="relative flex flex-col items-center justify-center h-full px-8">
              {/* Logo at top */}
              <motion.div
                className="absolute top-6 left-6 flex items-center gap-2.5"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4 }}
              >
                <EduGestLogo />
                <span
                  className="text-lg font-semibold tracking-tight"
                  style={{ color: '#FAFAFA' }}
                >
                  EduGest
                </span>
              </motion.div>

              {/* Nav items */}
              <nav className="flex flex-col items-center gap-2">
                {NAV_ITEMS.map((item, i) => (
                  <motion.button
                    key={item.id}
                    custom={i}
                    variants={menuItemsVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    onClick={() => handleNavClick(item.id)}
                    className="text-3xl font-semibold tracking-tight py-3 px-8 rounded-xl transition-colors duration-200"
                    style={{ color: '#9CA3AF' }}
                    whileHover={{ color: '#FAFAFA', scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {item.label}
                  </motion.button>
                ))}
              </nav>

              {/* CTAs */}
              <motion.div
                className="mt-12 flex flex-col items-center gap-4 w-full max-w-xs"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                <GradientButton
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={() => handleNavClick('demo')}
                >
                  Demander une démo
                </GradientButton>
                <button
                  onClick={handleLogin}
                  className="w-full px-6 py-4 rounded-xl text-sm font-medium text-[#9CA3AF] hover:text-[#FAFAFA] border border-white/10 hover:border-white/20 transition-all duration-200"
                >
                  Se connecter
                </button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
