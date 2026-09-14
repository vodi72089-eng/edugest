'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import { MapPin, Locate, Loader2 } from 'lucide-react'

// Fix Leaflet default marker icon issue with webpack/next
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
})
L.Marker.prototype.options.icon = defaultIcon

interface SchoolMapProps {
  latitude: number | null
  longitude: number | null
  onLocationChange: (lat: number, lng: number, address?: Partial<AddressData>) => void
}

export interface AddressData {
  address: string
  city: string
  province: string
  country: string
}

// Default center: Kinshasa, DRC
const DEFAULT_CENTER: [number, number] = [-4.4419, 15.2663]
const DEFAULT_ZOOM = 13

function MapClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

function FlyToCenter({ center }: { center: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo(center, DEFAULT_ZOOM, { duration: 1 })
  }, [center, map])
  return null
}

// Reverse geocoding using Nominatim (free, OpenStreetMap)
async function reverseGeocode(lat: number, lng: number): Promise<Partial<AddressData> | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=fr&addressdetails=1`,
      { headers: { 'User-Agent': 'EduGest/1.0' } }
    )
    if (!res.ok) return null
    const data = await res.json()
    const addr = data.address || {}
    return {
      address: [addr.road, addr.house_number, addr.suburb, addr.neighbourhood].filter(Boolean).join(', ') || '',
      city: addr.city || addr.town || addr.village || addr.municipality || '',
      province: addr.state || addr.region || addr.province || '',
      country: addr.country || '',
    }
  } catch {
    return null
  }
}

// ─── Localisation par IP (fallback fiable, y compris dans l'app desktop ─────
// Electron sous Windows où navigator.geolocation échoue faute de clé Google).
type IpLocation = { lat: number; lng: number; city?: string; province?: string; country?: string }

async function locateByIp(): Promise<IpLocation | null> {
  const endpoints: { url: string; pick: (j: Record<string, unknown>) => IpLocation | null }[] = [
    {
      // ipwho.is — HTTPS, gratuit, sans clé, CORS ouvert
      url: 'https://ipwho.is/',
      pick: (j) => {
        if (!j || j.success === false) return null
        if (typeof j.latitude !== 'number' || typeof j.longitude !== 'number') return null
        return {
          lat: j.latitude as number,
          lng: j.longitude as number,
          city: typeof j.city === 'string' ? j.city : undefined,
          province: typeof j.region === 'string' ? j.region : undefined,
          country: typeof j.country === 'string' ? j.country : undefined,
        }
      },
    },
    {
      // ipapi.co — HTTPS, gratuit, sans clé (plan de secours)
      url: 'https://ipapi.co/json/',
      pick: (j) => {
        if (!j || typeof j.latitude !== 'number' || typeof j.longitude !== 'number') return null
        return {
          lat: j.latitude as number,
          lng: j.longitude as number,
          city: typeof j.city === 'string' ? j.city : undefined,
          province: typeof j.region === 'string' ? j.region : undefined,
          country: typeof j.country_name === 'string' ? j.country_name : undefined,
        }
      },
    },
  ]
  for (const ep of endpoints) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 6000)
      const res = await fetch(ep.url, { signal: ctrl.signal })
      clearTimeout(timer)
      if (!res.ok) continue
      const loc = ep.pick(await res.json())
      if (loc) return loc
    } catch {
      // endpoint suivant
    }
  }
  return null
}

/** Tente le GPS du navigateur (délai max ~10 s). Résout null en cas d'échec/refus. */
function tryGps(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  })
}

export default function SchoolMap({ latitude, longitude, onLocationChange }: SchoolMapProps) {
  const [locating, setLocating] = useState(false)
  const [mapCenter, setMapCenter] = useState<[number, number]>(
    latitude && longitude ? [latitude, longitude] : DEFAULT_CENTER
  )
  const [markerPos, setMarkerPos] = useState<[number, number] | null>(
    latitude && longitude ? [latitude, longitude] : null
  )
  const [geocoding, setGeocoding] = useState(false)
  const [source, setSource] = useState<'gps' | 'ip' | null>(null)
  // Garde-fou : une seule localisation automatique par montage
  const autoLocatedRef = useRef(false)

  const applyPosition = useCallback(async (
    lat: number,
    lng: number,
    src: 'gps' | 'ip',
    ipInfo?: IpLocation
  ) => {
    setMapCenter([lat, lng])
    setMarkerPos([lat, lng])
    setSource(src)
    setGeocoding(true)
    const address = await reverseGeocode(lat, lng)
    setGeocoding(false)
    const finalAddress: Partial<AddressData> = address && (address.city || address.country)
      ? address
      : {
          address: address?.address || '',
          city: ipInfo?.city || address?.city || '',
          province: ipInfo?.province || address?.province || '',
          country: ipInfo?.country || address?.country || '',
        }
    onLocationChange(lat, lng, finalAddress)
  }, [onLocationChange])

  /**
   * Localisation complète : GPS d'abord, puis position par IP (l'app desktop
   * Windows n'a pas accès au GPS navigateur), puis Kinshasa par défaut.
   */
  const locate = useCallback(async () => {
    setLocating(true)
    try {
      const gps = await tryGps()
      if (gps) {
        await applyPosition(gps.lat, gps.lng, 'gps')
        return
      }
      const ip = await locateByIp()
      if (ip) {
        await applyPosition(ip.lat, ip.lng, 'ip', ip)
        return
      }
      // Hors ligne / refusé : centre par défaut (Kinshasa)
      setMapCenter(DEFAULT_CENTER)
      setSource(null)
    } finally {
      setLocating(false)
    }
  }, [applyPosition])

  // Localisation AUTOMATIQUE au montage si aucune coordonnée renseignée
  useEffect(() => {
    if (autoLocatedRef.current) return
    if (!latitude || !longitude) {
      autoLocatedRef.current = true
      locate()
    }
  }, [])

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    setMarkerPos([lat, lng])
    setGeocoding(true)
    const address = await reverseGeocode(lat, lng)
    setGeocoding(false)
    setSource(null)
    onLocationChange(lat, lng, address || undefined)
  }, [onLocationChange])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <label className="text-[13px] font-medium flex items-center gap-1.5" style={{ color: '#1e293b' }}>
          <MapPin size={14} /> Localisation sur la carte
          {geocoding && <span className="text-[11px] text-amber-600 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Recherche d&apos;adresse...</span>}
        </label>
        <button
          type="button"
          onClick={locate}
          disabled={locating}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border border-[oklch(88%_0.01_175)] hover:bg-[oklch(97%_0.005_175)] transition disabled:opacity-50"
          style={{ color: '#64748b' }}
        >
          {locating ? <Loader2 size={12} className="animate-spin" /> : <Locate size={12} />}
          {locating ? 'Localisation...' : 'Me localiser'}
        </button>
      </div>
      <div className="rounded-xl overflow-hidden border border-[oklch(88%_0.01_175)]" style={{ height: '250px' }}>
        <MapContainer
          center={mapCenter}
          zoom={DEFAULT_ZOOM}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {markerPos && <Marker position={markerPos} />}
          <MapClickHandler onClick={handleMapClick} />
          <FlyToCenter center={mapCenter} />
        </MapContainer>
      </div>
      <p className="text-[11px] flex items-center flex-wrap gap-x-1" style={{ color: '#94a3b8' }}>
        <span>Cliquez sur la carte pour positionner l&apos;école. L&apos;adresse sera remplie automatiquement.</span>
        {locating && <span className="font-medium text-[oklch(72%_0.15_65)] flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Localisation automatique en cours…</span>}
        {!locating && source === 'gps' && latitude != null && longitude != null && (
          <span className="ml-1 font-medium" style={{ color: '#64748b' }}>
            Position GPS détectée : {latitude.toFixed(4)}, {longitude.toFixed(4)}
          </span>
        )}
        {!locating && source === 'ip' && latitude != null && longitude != null && (
          <span className="ml-1 font-medium" style={{ color: '#64748b' }}>
            Position approximative détectée automatiquement : {latitude.toFixed(4)}, {longitude.toFixed(4)}
          </span>
        )}
        {!locating && !source && latitude != null && longitude != null && (
          <span className="ml-1 font-medium" style={{ color: '#64748b' }}>
            Coordonnées: {latitude.toFixed(4)}, {longitude.toFixed(4)}
          </span>
        )}
      </p>
    </div>
  )
}
