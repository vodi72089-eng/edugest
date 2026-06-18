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
  return n.toLocaleString('fr-FR') + '$'
}

export function getSchoolTypeLabel(type: string, category: string) {
  const t = type === 'MIXTE' ? 'Mixte' : type === 'FILLES' ? 'Filles' : 'Garçons'
  const c = category === 'PRIVEE' ? 'Privée' : 'Publique'
  return `${t} · ${c}`
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
    PARENT: 'Parent',
  }
  return map[role] || role
}

export function getStatusPill(status: string) {
  if (status === 'PAID' || status === 'Actif' || status === 'ACTIVE') return 'bg-[oklch(94%_0.05_145)] text-[oklch(40%_0.13_145)]'
  if (status === 'PARTIAL' || status === 'À renouveler') return 'bg-[oklch(94%_0.06_65)] text-[oklch(45%_0.13_65)]'
  if (status === 'OVERDUE' || status === 'Suspendu') return 'bg-[oklch(94%_0.05_25)] text-[oklch(45%_0.18_25)]'
  return 'bg-[oklch(94%_0.005_250)] text-[oklch(52%_0.015_250)]'
}
