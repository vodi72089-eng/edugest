'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { Cpu, Globe, MapPin, Monitor } from 'lucide-react'
import { GOLD, GOLD_SOFT, TEXT_MUTED_LUXE, TEXT_PRIMARY } from '@/lib/constants'
import { detectDevice } from '@/lib/detect-device'

/**
 * Panneau « Cet appareil » : marque du PC, logiciel (OS), IP et localisation.
 *
 * Deux modes :
 * 1. APPLICATION DE BUREAU (prioritaire) — le pont Electron
 *    `window.__edugest.systemInfo()` fournit marque, hostname, IP locale/publique.
 * 2. FALLBACK WEB (navigateur) — navigateur + OS détectés via
 *    `navigator.userAgent` (detect-device), IP publique + ville/pays via le
 *    service HTTPS https://ipwho.is/ (sans IP = auto-détection ; HTTPS donc
 *    OK même en production web), secours ipapi.co.
 *
 * NOTE : ce composant est client ('use client') — il ne doit JAMAIS importer
 * `@/lib/geo` (qui tire `lib/auth` → `fs`, modules Node interdits dans le
 * bundle client). La géolocalisation IP est donc faite ici, inline.
 */
interface IpLocation {
  city: string
  region: string
  country: string
  isp: string
}

interface ClientIpInfo extends IpLocation {
  ip: string
}

const GEO_TIMEOUT_MS = 4000

async function fetchJsonHttps(url: string): Promise<Record<string, unknown> | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GEO_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null
    const j: unknown = await res.json()
    if (!j || typeof j !== 'object' || Array.isArray(j)) return null
    return j as Record<string, unknown>
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Géolocalisation + IP publique inline (ipwho.is, HTTPS, gratuit, CORS ouvert)
 * — échec silencieux. Sans `ip`, le service auto-détecte l'IP de l'appelant.
 * Fallback ipapi.co (HTTPS, gratuit, sans clé).
 */
async function lookupClientInfo(ip?: string): Promise<ClientIpInfo | null> {
  const urls = ip
    ? [`https://ipwho.is/${encodeURIComponent(ip)}?lang=fr`, `https://ipapi.co/${encodeURIComponent(ip)}/json/`]
    : ['https://ipwho.is/?lang=fr', 'https://ipapi.co/json/']
  for (const url of urls) {
    const j = await fetchJsonHttps(url)
    if (!j || j.success === false || j.error === true) continue
    const connection = j.connection as { isp?: unknown; org?: unknown } | null | undefined
    const out: ClientIpInfo = {
      ip: typeof j.ip === 'string' ? j.ip : ip || '',
      city: typeof j.city === 'string' ? j.city : '',
      region: typeof j.region === 'string' ? j.region : '',
      country: typeof j.country === 'string' ? j.country : (typeof j.country_name === 'string' ? j.country_name : ''),
      isp:
        (connection && typeof connection.isp === 'string' && connection.isp) ||
        (typeof j.org === 'string' ? j.org : ''),
    }
    if (out.ip || out.city || out.country) return out
  }
  return null
}

export default function CurrentDeviceInfo() {
  const [info, setInfo] = useState<{
    badge: string
    machineLabel: string
    machine: string
    software: string
    hostname?: string
    publicIp?: string
    localIp?: string
  } | null>(null)
  const [location, setLocation] = useState<IpLocation | null>(null)
  const [webIp, setWebIp] = useState('')

  useEffect(() => {
    let cancelled = false

    // ── Fallback web (navigateur, ou pont Electron absent/inutilisable) ────
    const startWebFallback = () => {
      const d = detectDevice(navigator.userAgent || '')
      const browserLabel =
        d.browser !== 'Navigateur inconnu'
          ? [d.browser, d.browserVersion].filter(Boolean).join(' ')
          : ''
      const osLabel =
        d.os !== 'Système inconnu'
          ? [d.os, d.osVersion].filter(Boolean).join(' ')
          : ''
      setInfo({
        badge: d.isDesktop ? 'CET ORDINATEUR' : 'CET APPAREIL',
        machineLabel: d.device === 'Ordinateur' ? 'Ordinateur' : 'Appareil',
        machine: d.deviceModel || d.device,
        software: [browserLabel, osLabel].filter(Boolean).join(' · ') || d.device,
      })
      // IP publique + ville/pays : HTTPS côté client (OK même en prod web),
      // auto-détection par le service (pas d'IP à passer).
      lookupClientInfo().then(loc => {
        if (cancelled || !loc) return
        setWebIp(loc.ip)
        setLocation({ city: loc.city, region: loc.region, country: loc.country, isp: loc.isp })
      })
    }

    // ── Application de bureau : le pont Electron est prioritaire ───────────
    const bridge = (window as any).__edugest
    if (bridge?.systemInfo) {
      bridge.systemInfo().then((i: any) => {
        if (cancelled) return
        if (i && (i.brand || i.hostname)) {
          setInfo({
            badge: 'CET ORDINATEUR',
            machineLabel: 'Ordinateur',
            machine: [i.brand, i.model].filter(Boolean).join(' ') || i.hostname || 'Ordinateur',
            software: i.osName || '—',
            hostname: i.hostname,
            publicIp: i.publicIp,
            localIp: i.localIp,
          })
          lookupClientInfo(i.publicIp).then(loc => {
            if (!cancelled && loc) setLocation({ city: loc.city, region: loc.region, country: loc.country, isp: loc.isp })
          })
        } else {
          startWebFallback()
        }
      }).catch(() => {
        if (!cancelled) startWebFallback()
      })
    } else {
      startWebFallback()
    }

    return () => { cancelled = true }
  }, [])

  // Rendu différé jusqu'à la détection (client) — évite tout mismatch SSR.
  if (!info) return null

  const ip = info.publicIp || info.localIp || webIp || ''
  const rows: { icon: ReactElement; label: string; value: string }[] = [
    { icon: <Monitor size={13} />, label: info.machineLabel, value: info.machine },
    { icon: <Cpu size={13} />, label: 'Logiciel', value: info.software },
  ]
  if (ip) rows.push({ icon: <Globe size={13} />, label: 'Adresse IP', value: ip })
  if (location) {
    const place = [location.city, location.region, location.country].filter(Boolean).join(', ')
    rows.push({
      icon: <MapPin size={13} />,
      label: 'Localisation',
      value: (place || '—') + (location.isp ? ` · ${location.isp}` : ''),
    })
  }

  return (
    <div className="mb-3 p-4 rounded-xl border" style={{ background: GOLD_SOFT + '30', borderColor: GOLD + '50' }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: GOLD, background: GOLD_SOFT }}>{info.badge}</span>
        {info.hostname && <span className="text-[11px]" style={{ color: TEXT_MUTED_LUXE }}>({info.hostname})</span>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
        {rows.map(r => (
          <div key={r.label} className="flex items-center gap-2 text-xs min-w-0">
            <span style={{ color: GOLD }} className="shrink-0">{r.icon}</span>
            <span className="font-semibold shrink-0" style={{ color: TEXT_PRIMARY }}>{r.label} :</span>
            <span className="truncate" style={{ color: TEXT_MUTED_LUXE }} title={r.value}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
