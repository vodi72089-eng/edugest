'use client'

import { useEffect, useState, type ReactElement } from 'react'
import { Cpu, Globe, MapPin, Monitor } from 'lucide-react'
import { GOLD, GOLD_SOFT, TEXT_MUTED_LUXE, TEXT_PRIMARY } from '@/lib/constants'

/**
 * Panneau « Cet ordinateur » : marque du PC, logiciel (OS), IP et localisation.
 * Fonctionne uniquement dans l'application de bureau (Electron) — le pont
 * `window.__edugest.systemInfo()` n'existe pas dans le navigateur web.
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

/** Géolocalisation IP inline (ip-api.com, gratuit) — échec silencieux. */
async function lookupIpLocation(ip: string): Promise<IpLocation | null> {
  try {
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?lang=fr&fields=status,city,regionName,country,isp`)
    if (!res.ok) return null
    const j = await res.json()
    if (j.status !== 'success') return null
    return {
      city: typeof j.city === 'string' ? j.city : '',
      region: typeof j.regionName === 'string' ? j.regionName : '',
      country: typeof j.country === 'string' ? j.country : '',
      isp: typeof j.isp === 'string' ? j.isp : '',
    }
  } catch {
    return null
  }
}

export default function CurrentDeviceInfo() {
  const [info, setInfo] = useState<{
    brand?: string
    model?: string
    osName?: string
    hostname?: string
    localIp?: string
    publicIp?: string
  } | null>(null)
  const [location, setLocation] = useState<IpLocation | null>(null)

  useEffect(() => {
    const bridge = (window as any).__edugest
    if (!bridge?.systemInfo) return
    let cancelled = false
    bridge.systemInfo().then((i: any) => {
      if (cancelled || !i) return
      setInfo(i)
      if (i.publicIp) {
        lookupIpLocation(i.publicIp).then(loc => {
          if (!cancelled && loc) setLocation(loc)
        })
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (!info || (!info.brand && !info.hostname)) return null

  const machine = [info.brand, info.model].filter(Boolean).join(' ') || info.hostname || '—'
  const rows: { icon: ReactElement; label: string; value: string }[] = [
    { icon: <Monitor size={13} />, label: 'Ordinateur', value: machine },
    { icon: <Cpu size={13} />, label: 'Logiciel', value: info.osName || '—' },
    { icon: <Globe size={13} />, label: 'Adresse IP', value: info.publicIp || info.localIp || '—' },
  ]
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
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: GOLD, background: GOLD_SOFT }}>CET ORDINATEUR</span>
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
