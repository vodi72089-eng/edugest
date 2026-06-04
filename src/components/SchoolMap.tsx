'use client'

import { useState, useEffect, useCallback } from 'react'
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

export default function SchoolMap({ latitude, longitude, onLocationChange }: SchoolMapProps) {
  const [locating, setLocating] = useState(false)
  const [mapCenter, setMapCenter] = useState<[number, number]>(
    latitude && longitude ? [latitude, longitude] : DEFAULT_CENTER
  )
  const [markerPos, setMarkerPos] = useState<[number, number] | null>(
    latitude && longitude ? [latitude, longitude] : null
  )
  const [geocoding, setGeocoding] = useState(false)

  async function handleGeolocate() {
    if (!navigator.geolocation) {
      // If geolocation not available, use default (Kinshasa)
      setMapCenter(DEFAULT_CENTER)
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setMapCenter([lat, lng])
        setMarkerPos([lat, lng])
        // Reverse geocode to fill address fields
        setGeocoding(true)
        const address = await reverseGeocode(lat, lng)
        setGeocoding(false)
        onLocationChange(lat, lng, address || undefined)
      },
      () => {
        // Permission denied or error - use default
        setMapCenter(DEFAULT_CENTER)
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
    setLocating(false)
  }

  // Auto-geolocate on mount if no coordinates provided
  useEffect(() => {
    if (!latitude || !longitude) {
      if (!navigator.geolocation) {
        setMapCenter(DEFAULT_CENTER)
        return
      }
      setLocating(true)
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude
          const lng = pos.coords.longitude
          setMapCenter([lat, lng])
          setMarkerPos([lat, lng])
          setGeocoding(true)
          const address = await reverseGeocode(lat, lng)
          setGeocoding(false)
          onLocationChange(lat, lng, address || undefined)
          setLocating(false)
        },
        () => {
          setMapCenter(DEFAULT_CENTER)
          setLocating(false)
        },
        { enableHighAccuracy: true, timeout: 10000 }
      )
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    setMarkerPos([lat, lng])
    setGeocoding(true)
    const address = await reverseGeocode(lat, lng)
    setGeocoding(false)
    onLocationChange(lat, lng, address || undefined)
  }, [onLocationChange])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[13px] font-medium flex items-center gap-1.5" style={{ color: '#1e293b' }}>
          <MapPin size={14} /> Localisation sur la carte
          {geocoding && <span className="text-[11px] text-amber-600 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Recherche d&apos;adresse...</span>}
        </label>
        <button
          type="button"
          onClick={handleGeolocate}
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
      <p className="text-[11px]" style={{ color: '#94a3b8' }}>
        Cliquez sur la carte pour positionner l&apos;école. L&apos;adresse sera remplie automatiquement.
        {latitude && longitude && (
          <span className="ml-1 font-medium" style={{ color: '#64748b' }}>
            Coordonnées: {latitude.toFixed(4)}, {longitude.toFixed(4)}
          </span>
        )}
      </p>
    </div>
  )
}
