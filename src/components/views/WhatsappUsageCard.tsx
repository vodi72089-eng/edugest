'use client'

import { useEffect, useState } from 'react'
import { MessageCircle, Zap, Infinity as InfinityIcon, AlertTriangle, RotateCcw } from 'lucide-react'
import { GOLD, GOLD_SOFT, SUCCESS, WARNING, DANGER, TEXT_PRIMARY, TEXT_MUTED_LUXE } from '@/lib/constants'
import { useEduGestStore, authFetch } from '@/lib/store'

interface WhatsappUsageData {
  tier: string
  limit: number
  used: number
  remaining: number | null
  percent: number | null
  resetsAt: string
  usingCustomApi: boolean
  canUseCustomApi: boolean
}

/**
 * Carte de suivi en TEMPS RÉEL des messages WhatsApp de l'école.
 * - Agent EduGest : quota mensuel du forfait (consommé / limite / restant)
 * - API WhatsApp perso du client : illimité côté EduGest (tokens Meta)
 * Rafraîchit toutes les 10 s + quand la fenêtre redevient visible.
 */
export default function WhatsappUsageCard({ compact = false }: { compact?: boolean }) {
  const { userData } = useEduGestStore()
  const [usage, setUsage] = useState<WhatsappUsageData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userData?.schoolId) return
    let cancelled = false

    async function load() {
      try {
        const res = await authFetch(`/api/whatsapp/usage?schoolId=${userData?.schoolId}`)
        const json = await res.json()
        if (!cancelled && json.data) setUsage(json.data)
      } catch { /* silencieux */ }
      finally { if (!cancelled) setLoading(false) }
    }

    load()
    const interval = setInterval(load, 10_000)
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userData?.schoolId])

  if (loading) {
    return (
      <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-4 shadow-sm animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
        <div className="h-2 bg-gray-200 rounded w-full" />
      </div>
    )
  }
  if (!usage) return null

  const unlimited = usage.usingCustomApi || usage.limit < 0
  const percent = usage.usingCustomApi ? 0 : (usage.percent ?? 0)
  const nearLimit = !unlimited && usage.limit > 0 && percent >= 80
  const atLimit = !unlimited && usage.limit > 0 && percent >= 100
  const barColor = atLimit ? DANGER : nearLimit ? WARNING : SUCCESS
  const resetsLabel = new Date(usage.resetsAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })

  return (
    <div className="bg-white border border-[oklch(90%_0.01_175)] rounded-2xl p-4 shadow-sm" data-testid="whatsapp-usage-card">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg grid place-items-center" style={{ background: GOLD_SOFT }}>
            <MessageCircle size={15} style={{ color: GOLD }} />
          </div>
          <div>
            <div className="text-[13px] font-semibold" style={{ color: TEXT_PRIMARY }}>Messages WhatsApp</div>
            <div className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>Suivi en temps réel · ce mois-ci</div>
          </div>
        </div>
        {usage.usingCustomApi ? (
          <span className="text-[11px] px-2.5 py-1 rounded-full font-semibold flex items-center gap-1" style={{ background: 'oklch(95% 0.04 145)', color: 'oklch(40% 0.13 145)' }}>
            <Zap size={11} /> API perso · illimité
          </span>
        ) : unlimited ? (
          <span className="text-[11px] px-2.5 py-1 rounded-full font-semibold flex items-center gap-1" style={{ background: GOLD_SOFT, color: GOLD }}>
            <InfinityIcon size={12} /> Illimité
          </span>
        ) : atLimit ? (
          <span className="text-[11px] px-2.5 py-1 rounded-full font-semibold flex items-center gap-1" style={{ background: 'oklch(95% 0.04 25)', color: DANGER }}>
            <AlertTriangle size={11} /> Quota atteint
          </span>
        ) : (
          <span className="text-[11px] px-2.5 py-1 rounded-full font-semibold" style={{ background: GOLD_SOFT, color: GOLD }}>
            {usage.tier === 'FREEMIUM' ? 'Freemium' : usage.tier.charAt(0) + usage.tier.slice(1).toLowerCase()}
          </span>
        )}
      </div>

      {usage.usingCustomApi ? (
        <p className="text-xs leading-relaxed" style={{ color: TEXT_MUTED_LUXE }}>
          Vos notifications partent via <strong>votre propre API WhatsApp</strong> : aucune limite EduGest.
          Vous êtes uniquement limité par les tokens achetés auprès de Meta.
          {usage.used > 0 && <> — {usage.used} message{usage.used > 1 ? 's' : ''} envoyé{usage.used > 1 ? 's' : ''} ce mois.</>}
        </p>
      ) : (
        <>
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-xl font-bold" style={{ color: TEXT_PRIMARY }}>
              {usage.used.toLocaleString('fr-FR')}
              <span className="text-sm font-medium" style={{ color: TEXT_MUTED_LUXE }}> / {usage.limit.toLocaleString('fr-FR')}</span>
            </span>
            <span className="text-[11px] font-medium" style={{ color: barColor }}>
              {atLimit ? '0 restant' : `${usage.remaining?.toLocaleString('fr-FR')} restant${(usage.remaining ?? 1) > 1 ? 's' : ''}`}
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'oklch(93% 0.005 250)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.max(percent, usage.used > 0 ? 3 : 0)}%`, background: barColor }}
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-[11px] flex items-center gap-1" style={{ color: TEXT_MUTED_LUXE }}>
              <RotateCcw size={10} /> Réinitialise le {resetsLabel}
            </span>
            {nearLimit && !atLimit && (
              <span className="text-[11px] font-semibold" style={{ color: WARNING }}>⚠ Proche de la limite</span>
            )}
          </div>
          {atLimit && (
            <p className="text-[11px] mt-2 p-2 rounded-lg" style={{ background: 'oklch(97% 0.02 25)', color: DANGER }}>
              Les envois via l&apos;agent EduGest sont suspendus jusqu&apos;à la réinitialisation
              {usage.canUseCustomApi && <> — ou connectez votre propre API WhatsApp dans <strong>Config. Paiements → API WhatsApp</strong> pour des envois illimités</>}
              {usage.tier === 'FREEMIUM' && <> — passez à un forfait supérieur pour débloquer les envois</>}.
            </p>
          )}
        </>
      )}
      {!compact && usage.canUseCustomApi && !usage.usingCustomApi && (
        <p className="text-[11px] mt-2" style={{ color: TEXT_MUTED_LUXE }}>
          💡 Votre forfait permet de brancher votre propre API WhatsApp (messages illimités) : Config. Paiements → onglet API WhatsApp.
        </p>
      )}
    </div>
  )
}
