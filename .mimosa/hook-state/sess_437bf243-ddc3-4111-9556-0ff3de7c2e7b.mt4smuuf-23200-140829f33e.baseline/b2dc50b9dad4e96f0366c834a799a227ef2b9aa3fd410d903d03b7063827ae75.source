'use client'

import { useCallback } from 'react'
import { useEduGestStore } from '@/lib/store'
import Nav from '@/components/landing/sections/Nav'
import Hero from '@/components/landing/sections/Hero'
import TrustBar from '@/components/landing/sections/TrustBar'
import HowItWorks from '@/components/landing/sections/HowItWorks'
import FeaturesBento from '@/components/landing/sections/FeaturesBento'
import DemoInteractive from '@/components/landing/sections/DemoInteractive'
import Testimonials from '@/components/landing/sections/Testimonials'
import Metrics from '@/components/landing/sections/Metrics'
import Pricing from '@/components/landing/sections/Pricing'
import FAQ from '@/components/landing/sections/FAQ'
import FinalCTA from '@/components/landing/sections/FinalCTA'
import Footer from '@/components/landing/sections/Footer'

export default function LandingPage() {
  const { setCurrentView } = useEduGestStore()

  const handleLogin = useCallback(() => {
    setCurrentView('login')
  }, [setCurrentView])

  const handleNavigate = useCallback((sectionId: string) => {
    const el = document.getElementById(sectionId)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' })
    }
  }, [])

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0A0B0F' }}>
      <Nav onLogin={handleLogin} onNavigate={handleNavigate} />
      <main className="flex-1">
        <Hero onLogin={handleLogin} onDemo={handleLogin} />
        <div id="trust">
          <TrustBar />
        </div>
        <div id="how-it-works">
          <HowItWorks />
        </div>
        <div id="features">
          <FeaturesBento />
        </div>
        <div id="demo">
          <DemoInteractive />
        </div>
        <div id="testimonials">
          <Testimonials />
        </div>
        <div id="metrics">
          <Metrics />
        </div>
        <div id="pricing">
          <Pricing onLogin={handleLogin} />
        </div>
        <div id="faq">
          <FAQ />
        </div>
        <FinalCTA onLogin={handleLogin} onDemo={handleLogin} />
      </main>
      <Footer onLogin={handleLogin} onNavigate={handleNavigate} />
    </div>
  )
}
