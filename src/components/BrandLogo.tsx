'use client'

/**
 * BrandLogo — LE logo officiel EduGest, centralisé (source unique).
 *
 * Deux variantes dérivées du même logo officiel :
 *  - 'full' → logo complet avec le nom « EDUC GEST » (/edugest-logo.png)
 *  - 'mark' → symbole seul, couronne + livre (/edugest-logo-mark.png),
 *    utilisé pour les petites tailles (favicon, avatars, en-têtes compacts).
 *
 * Sur fond sombre, envelopper d'une plaque claire (bg-white rounded-2xl p-…)
 * pour préserver les couleurs officielles du logo.
 */
export default function BrandLogo({
  height = 40,
  variant = 'full',
  className = '',
  style,
}: {
  height?: number
  variant?: 'full' | 'mark'
  className?: string
  style?: React.CSSProperties
}) {
  const src = variant === 'mark' ? '/edugest-logo-mark.png' : '/edugest-logo.png'
  return (
    <img
      src={src}
      alt="EduGest — logo officiel"
      className={`object-contain ${className}`}
      style={{ height, width: 'auto', ...style }}
    />
  )
}

/**
 * Logo sur plaque claire — à utiliser sur les fonds sombres (connexion,
 * splash desktop, en-têtes public) pour garder le vrai logo lisible.
 */
export function BrandLogoPlate({
  height = 96,
  className = '',
}: {
  height?: number
  className?: string
}) {
  return (
    <div
      className={`inline-flex items-center justify-center rounded-3xl bg-white shadow-[0_18px_60px_rgba(0,0,0,0.45)] ${className}`}
      style={{ padding: height * 0.22, border: '1px solid rgba(255,255,255,0.65)' }}
    >
      <BrandLogo height={height} variant="full" />
    </div>
  )
}
