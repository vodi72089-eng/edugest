import { UserRole } from '@/lib/store'

export function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()
}

export function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatNumber(n: number) {
  return n.toLocaleString('fr-FR')
}

export function formatCurrency(n: number) {
  return n.toLocaleString('fr-FR') + ' CDF'
}

export function getSchoolTypeLabel(type: string, category: string, level?: string | null) {
  const t = type === 'MIXTE' ? 'Mixte' : type === 'FILLES' ? 'Filles' : 'Garçons'
  const c = category === 'PRIVEE' ? 'Privée' : 'Publique'
  const parts = [t, c]
  if (level) {
    const l = level === 'MATERNELLE' ? 'Maternelle' : level === 'PRIMAIRE' ? 'Primaire' : level === 'SECONDAIRE' ? 'Secondaire' : 'Polyvalente'
    parts.push(l)
  }
  return parts.join(' · ')
}

export function getSubscriptionLabel(tier: string) {
  const map: Record<string, string> = {
    FREEMIUM: 'Freemium', ESSENTIEL: 'Essentiel', STANDARD: 'Standard',
    PREMIUM: 'Professionnel', ENTERPRISE: 'Enterprise', CORPORATE: 'Corporate',
  }
  return map[tier] || tier
}

export function getSubscriptionPrice(tier: string) {
  const map: Record<string, string> = {
    FREEMIUM: '0$/mois', ESSENTIEL: '100$/mois', STANDARD: '250$/mois',
    PREMIUM: '500$/mois', ENTERPRISE: '1 000$/mois', CORPORATE: 'Sur mesure',
  }
  return map[tier] || ''
}

export function getRoleLabel(role: UserRole): string {
  const map: Record<UserRole, string> = {
    SUPER_ADMIN_GLOBAL: 'Super Admin',
    SCHOOL_ADMIN: 'Admin École',
    SECRETARY: 'Secrétaire',
    CASHIER: 'Caissier',
    DIRECTION_MATERNELLE: 'Dir. Maternelle',
    DIRECTION_PRIMAIRE: 'Dir. Primaire',
    DIRECTION_SECONDAIRE: 'Dir. Secondaire',
    DISCIPLINE_MATERNELLE: 'Disc. Maternelle',
    DISCIPLINE_PRIMAIRE: 'Disc. Primaire',
    DISCIPLINE_SECONDAIRE: 'Disc. Secondaire',
    TEACHER: 'Enseignant',
    HEAD_TEACHER: 'Prof. Principal',
    EPS: 'Prof. EPS',
    MEDICAL: 'Service Médical',
    PARENT: 'Parent',
  }
  return map[role] || role
}

// Source unique de vérité pour convertir un rôle API en UserRole front.
// Tout nouveau rôle DOIT être ajouté ici — les 3 maps de page.tsx l'utilisent.
export const API_ROLE_MAP: Record<string, UserRole> = {
  SUPER_ADMIN_GLOBAL: 'SUPER_ADMIN_GLOBAL',
  SCHOOL_ADMIN: 'SCHOOL_ADMIN',
  SECRETARY: 'SECRETARY',
  CASHIER: 'CASHIER',
  DIRECTION_MATERNELLE: 'DIRECTION_MATERNELLE',
  DIRECTION_PRIMAIRE: 'DIRECTION_PRIMAIRE',
  DIRECTION_SECONDAIRE: 'DIRECTION_SECONDAIRE',
  DISCIPLINE_MATERNELLE: 'DISCIPLINE_MATERNELLE',
  DISCIPLINE_PRIMAIRE: 'DISCIPLINE_PRIMAIRE',
  DISCIPLINE_SECONDAIRE: 'DISCIPLINE_SECONDAIRE',
  TEACHER: 'TEACHER',
  HEAD_TEACHER: 'HEAD_TEACHER',
  PARENT: 'PARENT',
  MEDICAL: 'MEDICAL',
}

export function getEffectiveStatus(amount: number, paidAmount: number, storedStatus: string): string {
  if (paidAmount >= amount && amount > 0) return 'PAID'
  if (paidAmount > 0 && paidAmount < amount) return 'PARTIAL'
  if (storedStatus === 'OVERDUE') return 'OVERDUE'
  return 'PENDING'
}

export function getStatusPill(status: string) {
  if (status === 'PAID' || status === 'Actif' || status === 'ACTIVE') return 'bg-[oklch(94%_0.05_145)] text-[oklch(40%_0.13_145)]'
  if (status === 'PARTIAL' || status === 'À renouveler') return 'bg-[oklch(94%_0.06_65)] text-[oklch(45%_0.13_65)]'
  if (status === 'OVERDUE' || status === 'Suspendu') return 'bg-[oklch(94%_0.05_25)] text-[oklch(45%_0.18_25)]'
  return 'bg-[oklch(94%_0.005_250)] text-[oklch(52%_0.015_250)]'
}
