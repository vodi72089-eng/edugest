import { authFetch } from './store'

// ─── Device fingerprint reporting (once per page load) ────────────────────
// Uses the official open-source FingerprintJS agent (works in browsers and
// Tauri webviews). Best-effort: failures are silent.
let reported = false

function getGpu(): string {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl') as WebGLRenderingContext | null || canvas.getContext('experimental-webgl') as WebGLRenderingContext | null
    if (!gl) return ''
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    if (!ext) return ''
    return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '')
  } catch {
    return ''
  }
}

async function getBattery(): Promise<string> {
  try {
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean } | null> }
    if (typeof nav.getBattery !== 'function') return ''
    const b = await nav.getBattery()
    if (!b) return ''
    return `${Math.round(b.level * 100)}%${b.charging ? ' (charge)' : ''}`
  } catch {
    return ''
  }
}

function getScreen(): string {
  try {
    const dpr = typeof window !== 'undefined' ? Math.round(window.devicePixelRatio || 1) : 1
    return `${screen.width}×${screen.height} (dpr ${dpr})`
  } catch {
    return ''
  }
}

async function collectSignals(): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  try {
    const screenInfo = getScreen()
    if (screenInfo) out.screen = screenInfo
    const gpu = getGpu()
    if (gpu) out.gpu = gpu
    const battery = await getBattery()
    if (battery) out.battery = battery
    if (navigator.languages?.length) out.languages = navigator.languages.join(', ')
    if (navigator.hardwareConcurrency) out.cores = String(navigator.hardwareConcurrency)
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { effectiveType?: string; downlink?: number } }
    if (nav.deviceMemory) out.memory = `${nav.deviceMemory} Go`
    if (nav.connection?.effectiveType) {
      out.network = nav.connection.downlink ? `${nav.connection.effectiveType} (${nav.connection.downlink} Mb/s)` : nav.connection.effectiveType
    }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz) out.timezone = tz
  } catch {
    // keep whatever was collected
  }
  return out
}

export async function reportDeviceFingerprint(): Promise<void> {
  if (typeof window === 'undefined' || reported) return
  reported = true
  try {
    const mod = await import('@fingerprintjs/fingerprintjs')
    const fp = await mod.load()
    const { visitorId } = await fp.get()
    const signals = await collectSignals()
    await authFetch('/api/sessions/device', {
      method: 'POST',
      body: JSON.stringify({ fingerprintId: visitorId, ...signals }),
    })
  } catch {
    // silent — enrichment is best-effort
  }
}
