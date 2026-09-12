'use client'

import ScrollReveal from '@/components/landing/ui/ScrollReveal'

const SCHOOL_LOGOS = [
  { name: 'Lycée International de Paris', abbr: 'LIP', color: '#4F9EFF' },
  { name: 'Boston Academy', abbr: 'BA', color: '#A78BFA' },
  { name: 'Tokyo Modern School', abbr: 'TMS', color: '#34D399' },
  { name: 'Singapore International', abbr: 'SI', color: '#F472B6' },
  { name: 'Dubai Scholars', abbr: 'DS', color: '#4F9EFF' },
  { name: 'Cape Town Academy', abbr: 'CTA', color: '#A78BFA' },
  { name: 'São Paulo Colegio', abbr: 'SPC', color: '#34D399' },
  { name: 'Berlin Gymnasium', abbr: 'BG', color: '#F472B6' },
  { name: 'Melbourne Grammar', abbr: 'MG', color: '#4F9EFF' },
  { name: 'Mumbai International', abbr: 'MI', color: '#A78BFA' },
]

function LogoCard({ name, abbr, color }: { name: string; abbr: string; color: string }) {
  return (
    <div className="trustbar-logo group flex items-center gap-3 px-5 py-3 rounded-xl border border-white/[0.06] bg-[#13141A] shrink-0 cursor-default select-none">
      {/* Icon / Avatar */}
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold transition-all duration-300"
        style={{
          backgroundColor: `${color}10`,
          color: color,
          border: `1px solid ${color}25`,
        }}
      >
        {abbr}
      </div>
      {/* School name */}
      <span className="text-sm font-medium whitespace-nowrap transition-colors duration-300 text-[#6B7280] group-hover:text-[#FAFAFA]">
        {name}
      </span>
    </div>
  )
}

export default function TrustBar() {
  // Duplicate logos for seamless infinite scroll
  const doubled = [...SCHOOL_LOGOS, ...SCHOOL_LOGOS]

  return (
    <section className="relative overflow-hidden py-16 md:py-20" style={{ background: '#0A0B0F' }}>
      <ScrollReveal delay={0}>
        <p className="text-center text-sm font-medium text-[#6B7280] mb-10 tracking-wide uppercase">
          Ils nous font confiance
        </p>
      </ScrollReveal>

      {/* Scrolling track */}
      <div className="relative">
        {/* Left fade mask */}
        <div className="absolute left-0 top-0 bottom-0 w-24 md:w-40 bg-gradient-to-r from-[#0A0B0F] to-transparent z-10 pointer-events-none" />
        {/* Right fade mask */}
        <div className="absolute right-0 top-0 bottom-0 w-24 md:w-40 bg-gradient-to-l from-[#0A0B0F] to-transparent z-10 pointer-events-none" />

        {/* Infinite scroll — CSS animation */}
        <div className="flex gap-4 w-max animate-[trustbar-scroll_50s_linear_infinite]">
          {doubled.map((school, i) => (
            <LogoCard
              key={`${school.abbr}-${i}`}
              name={school.name}
              abbr={school.abbr}
              color={school.color}
            />
          ))}
        </div>
      </div>

      {/* Inline keyframes */}
      <style>{`
        @keyframes trustbar-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .trustbar-logo {
          transition: all 0.3s ease;
        }
        .trustbar-logo:hover {
          border-color: rgba(255,255,255,0.15);
          transform: scale(1.05);
        }
        .trustbar-logo:hover div:first-child {
          filter: grayscale(0%) brightness(1.1);
        }
        .trustbar-logo div:first-child {
          filter: grayscale(100%) opacity(0.6);
          transition: filter 0.3s ease;
        }
      `}</style>
    </section>
  )
}
