'use client'

import { FR, GB, BE, CD } from 'country-flag-icons/react/3x2'

const FLAG_COMPONENTS: Record<string, React.ComponentType<{ className?: string }>> = {
  CD,
  BE,
  FR,
  GB,
}

interface FlagIconProps {
  countryCode: string
  className?: string
}

export function FlagIcon({ countryCode, className = 'w-6 h-5' }: FlagIconProps) {
  const FlagComponent = FLAG_COMPONENTS[countryCode.toUpperCase()]

  if (!FlagComponent) {
    // Fallback to emoji or a placeholder
    return (
      <div className={`${className} rounded bg-white/10 flex items-center justify-center text-[10px] font-bold text-white/60`}>
        {countryCode}
      </div>
    )
  }

  return (
    <div className={`${className} overflow-hidden`}>
      <FlagComponent className="w-full h-full" />
    </div>
  )
}
