export interface DeviceInfo {
  browser: string
  browserVersion: string
  os: string
  osVersion: string
  device: string
  deviceModel: string
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
}

const BROWSER_PATTERNS: [RegExp, string][] = [
  [/Edg\/([\d.]+)/i, 'Microsoft Edge'],
  [/OPR\/([\d.]+)/i, 'Opera'],
  [/Chrome\/([\d.]+)/i, 'Google Chrome'],
  [/Firefox\/([\d.]+)/i, 'Mozilla Firefox'],
  [/Safari\/([\d.]+)/i, 'Safari'],
  [/Trident\/.*rv:([\d.]+)/i, 'Internet Explorer'],
  [/UCBrowser\/([\d.]+)/i, 'UC Browser'],
  [/SamsungBrowser\/([\d.]+)/i, 'Samsung Internet'],
  [/Brave\/([\d.]+)/i, 'Brave'],
  [/Vivaldi\/([\d.]+)/i, 'Vivaldi'],
]

const OS_PATTERNS: [RegExp, string, string][] = [
  [/Windows NT 10\.(\d+)/i, 'Windows', '11'],
  [/Windows NT (\d+\.\d+)/i, 'Windows', ''],
  [/Mac OS X (\d+[._]\d+(?:[._]\d+)?)/i, 'macOS', ''],
  [/Android (\d+(?:\.\d+)?)/i, 'Android', ''],
  [/iPhone OS (\d+[._]\d+(?:[._]\d+)?)/i, 'iOS', ''],
  [/CPU (?:iPhone )?OS (\d+[._]\d+(?:[._]\d+)?)/i, 'iOS', ''],
  [/iPad.*?(\d+[._]\d+(?:[._]\d+)?)/i, 'iPadOS', ''],
  [/CrOS/i, 'ChromeOS', ''],
  [/Linux/i, 'Linux', ''],
]

const MOBILE_PATTERNS: [RegExp, string, string][] = [
  [/iPhone/i, 'Apple', 'iPhone'],
  [/iPad/i, 'Apple', 'iPad'],
  [/iPod/i, 'Apple', 'iPod'],
  [/SM-[A-Z0-9]+/i, 'Samsung', 'Galaxy'],
  [/GT-[A-Z0-9]+/i, 'Samsung', 'Galaxy'],
  [/Pixel (\d+)/i, 'Google', 'Pixel'],
  [/Pixel [a-zA-Z]+/i, 'Google', 'Pixel'],
  [/MI (\d+)/i, 'Xiaomi', 'Mi'],
  [/Redmi/i, 'Xiaomi', 'Redmi'],
  [/POCO/i, 'Xiaomi', 'POCO'],
  [/HUAWEI/i, 'Huawei', 'Huawei'],
  [/honor/i, 'Honor', 'Honor'],
  [/OPPO/i, 'OPPO', 'OPPO'],
  [/vivo/i, 'vivo', 'vivo'],
  [/OnePlus/i, 'OnePlus', 'OnePlus'],
  [/TECNO/i, 'Tecno', 'Tecno'],
  [/Infinix/i, 'Infinix', 'Infinix'],
  [/itel/i, 'Itel', 'itel'],
  [/Nokia/i, 'Nokia', 'Nokia'],
  [/BB10|BlackBerry/i, 'BlackBerry', 'BlackBerry'],
]

export function detectDevice(ua: string): DeviceInfo {
  if (!ua) {
    return {
      browser: 'Inconnu',
      browserVersion: '',
      os: 'Inconnu',
      osVersion: '',
      device: 'Inconnu',
      deviceModel: '',
      isMobile: false,
      isTablet: false,
      isDesktop: true,
    }
  }

  let browser = 'Navigateur inconnu'
  let browserVersion = ''
  for (const [pattern, name] of BROWSER_PATTERNS) {
    const m = ua.match(pattern)
    if (m) {
      browser = name
      if (name === 'Google Chrome' && ua.match(/Edg\//i)) continue
      if (name === 'Google Chrome' && ua.match(/OPR\//i)) continue
      if (name === 'Safari' && ua.match(/Chrome\//i)) continue
      if (name === 'Safari' && ua.match(/CriOS\//i)) { browser = 'Chrome (iOS)'; browserVersion = ua.match(/CriOS\/([\d.]+)/i)?.[1] || ''; break }
      browserVersion = m[1] || ''
      break
    }
  }

  if (browserVersion) {
    browserVersion = browserVersion.replace(/_/g, '.')
  }

  let os = 'Système inconnu'
  let osVersion = ''
  for (const [pattern, name, defaultVersion] of OS_PATTERNS) {
    const m = ua.match(pattern)
    if (m) {
      os = name
      osVersion = m[1] ? m[1].replace(/_/g, '.') : defaultVersion
      if (name === 'Windows') {
        const ver = parseFloat(osVersion)
        if (ver >= 10) osVersion = '10/11'
        else if (ver >= 6.2) osVersion = '8/8.1'
        else if (ver >= 6.0) osVersion = 'Vista/7'
        else osVersion = 'Ancienne'
      }
      break
    }
  }

  if (ua.includes('Android') && !ua.includes('Mobile')) {
    os = 'Android'
  }
  if ((ua.includes('iPad') || ua.includes('iPad;')) && os === 'iOS') {
    os = 'iPadOS'
  }

  let isMobile = false
  let isTablet = false
  if (/Mobile|Android|iPhone|iPod|Opera Mini|IEMobile|WPDesktop/i.test(ua)) isMobile = true
  if ((/iPad|tablet|Tab/i.test(ua) && !ua.includes('Mobile')) || (ua.includes('Android') && !ua.includes('Mobile'))) {
    isTablet = true
    isMobile = false
  }
  const isDesktop = !isMobile && !isTablet

  let device = isDesktop ? 'Ordinateur' : 'Téléphone'
  let deviceModel = ''

  if (isTablet) device = 'Tablette'
  if (isMobile && ua.includes('iPad')) device = 'Tablette'

  for (const [pattern, brand, model] of MOBILE_PATTERNS) {
    if (pattern.test(ua)) {
      deviceModel = pattern.exec(ua)?.[0] || ''
      if (pattern.source === /SM-[A-Z0-9]+/i.source) {
        deviceModel = 'Samsung ' + (ua.match(/SM-[A-Z0-9]+/i)?.[0] || '')
      }
      break
    }
  }

  return {
    browser,
    browserVersion,
    os,
    osVersion,
    device,
    deviceModel,
    isMobile,
    isTablet,
    isDesktop,
  }
}

export function getDeviceIcon(device: string, deviceModel: string): string {
  if (device === 'Tablette' || deviceModel.toLowerCase().includes('ipad')) return 'tablet'
  if (device === 'Téléphone') return 'phone'
  return 'monitor'
}

export function formatDeviceSummary(info: DeviceInfo): string {
  const parts: string[] = []
  if (info.browser) parts.push(info.browser)
  if (info.browserVersion) parts.push(`v${info.browserVersion}`)
  if (info.os) parts.push(`· ${info.os}`)
  if (info.osVersion) parts.push(info.osVersion)
  return parts.join(' ') || info.device
}

export function formatDeviceTitle(info: DeviceInfo): string {
  if (info.deviceModel) return info.deviceModel
  if (info.device === 'Ordinateur') return info.browser !== 'Navigateur inconnu' ? info.browser : 'Ordinateur'
  return info.os !== 'Système inconnu' ? `${info.os} ${info.device}` : info.device
}
