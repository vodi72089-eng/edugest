// ─── Permissions côté client (source unique pour l'UX) ──────────────────────
//
// MIROIR de src/lib/auth.ts (ROLE_PERMISSIONS) et src/lib/subscription.ts
// (restrictions par forfait). RÈGLE D'OR : ce fichier ne sert qu'à l'UX
// (masquer menus/boutons). LA SÉCURITÉ RÉELLE EST TOUJOURS CÔTÉ SERVEUR —
// une action cachée ici reste vérifiée par requirePermission/requireFeature
// dans les routes API.
//
// ⚠️ Toute modification des permissions serveur doit être répercutée ici.

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN_GLOBAL: ['*'],
  DIRECTION: [
    'users:read', 'users:create', 'users:update',
    'students:read', 'students:create', 'students:update',
    'payments:read', 'payments:create',
    'grades:read', 'grades:create', 'grades:update',
    'classes:read', 'classes:create', 'classes:update',
    'subjects:read', 'subjects:create',
    'discipline:read', 'discipline:create', 'discipline:update',
    'convocations:read', 'convocations:create', 'convocations:update',
    'communications:read', 'communications:create',
    'homework:read', 'homework:create',
    'stats:read', 'profile:read', 'profile:update',
    'schools:read', 'payment-gateways:manage', 'currency:manage',
    'transactions:read', 'notifications:read',
  ],
  SECRETARY: [
    'school:read', 'users:read', 'users:create', 'users:update',
    'students:read', 'students:create', 'students:update', 'students:delete',
    'classes:read', 'classes:create', 'classes:update',
    'subjects:read', 'subjects:create', 'grades:read',
    'payments:read', 'payments:verify', 'payments:create', 'payments:update',
    'discipline:read', 'communications:read', 'communications:create',
    'homework:read', 'convocations:read', 'convocations:create',
    'stats:read', 'profile:read', 'profile:update',
    'payment-gateways:manage', 'currency:manage', 'transactions:read',
    'notifications:read',
  ],
  ADMIN_FREEMIUM: [
    'school:read', 'users:read', 'users:create', 'users:update',
    'students:read', 'students:create', 'students:update',
    'classes:read', 'classes:create', 'subjects:read', 'subjects:create',
    'grades:read', 'profile:read', 'profile:update', 'notifications:read',
  ],
  CASHIER: [
    'school:read', 'students:read',
    'payments:read', 'payments:create', 'payments:update', 'payments:verify',
    'communications:read', 'stats:read', 'profile:read', 'profile:update',
    'payment-gateways:manage', 'currency:manage', 'transactions:read',
    'notifications:read',
  ],
  DIRECTION_MATERNELLE: [
    'school:read', 'users:read', 'students:read', 'students:update', 'students:create',
    'classes:read', 'classes:create', 'classes:update', 'classes:delete',
    'subjects:read', 'subjects:create', 'grades:read', 'grades:create', 'grades:update',
    'discipline:read', 'discipline:create', 'discipline:update',
    'communications:read', 'communications:create',
    'homework:read', 'homework:create',
    'convocations:read', 'convocations:create', 'convocations:update',
    'stats:read', 'profile:read', 'profile:update', 'notifications:read',
  ],
  DIRECTION_PRIMAIRE: [
    'school:read', 'users:read', 'students:read', 'students:update', 'students:create',
    'classes:read', 'classes:create', 'classes:update', 'classes:delete',
    'subjects:read', 'subjects:create', 'grades:read', 'grades:create', 'grades:update',
    'discipline:read', 'discipline:create', 'discipline:update',
    'communications:read', 'communications:create',
    'homework:read', 'homework:create',
    'convocations:read', 'convocations:create', 'convocations:update',
    'stats:read', 'profile:read', 'profile:update',
    'payment-gateways:manage', 'currency:manage', 'transactions:read', 'notifications:read',
  ],
  DIRECTION_SECONDAIRE: [
    'school:read', 'users:read', 'students:read', 'students:update', 'students:create',
    'classes:read', 'classes:create', 'classes:update', 'classes:delete',
    'subjects:read', 'subjects:create', 'grades:read', 'grades:create', 'grades:update',
    'discipline:read', 'discipline:create', 'discipline:update',
    'communications:read', 'communications:create',
    'homework:read', 'homework:create',
    'convocations:read', 'convocations:create', 'convocations:update',
    'stats:read', 'profile:read', 'profile:update',
    'payment-gateways:manage', 'currency:manage', 'transactions:read', 'notifications:read',
  ],
  DISCIPLINE_MATERNELLE: [
    'school:read', 'students:read',
    'discipline:read', 'discipline:create', 'discipline:update',
    'convocations:read', 'convocations:create', 'convocations:update',
    'communications:read', 'profile:read', 'profile:update', 'notifications:read',
  ],
  DISCIPLINE_PRIMAIRE: [
    'school:read', 'students:read',
    'discipline:read', 'discipline:create', 'discipline:update',
    'convocations:read', 'convocations:create', 'convocations:update',
    'communications:read', 'profile:read', 'profile:update', 'notifications:read',
  ],
  DISCIPLINE_SECONDAIRE: [
    'school:read', 'students:read',
    'discipline:read', 'discipline:create', 'discipline:update',
    'convocations:read', 'convocations:create', 'convocations:update',
    'communications:read', 'profile:read', 'profile:update', 'notifications:read',
  ],
  HEAD_TEACHER: [
    'students:read', 'students:create', 'students:update',
    'grades:read', 'grades:create', 'grades:update',
    'classes:read', 'classes:update', 'subjects:read',
    'discipline:read', 'discipline:create',
    'convocations:read', 'convocations:create',
    'homework:read', 'homework:create', 'communications:read',
    'stats:read', 'notifications:read',
  ],
  TEACHER: [
    'students:read', 'grades:read', 'grades:create', 'grades:update',
    'classes:read', 'subjects:read', 'homework:read', 'homework:create',
    'discipline:read', 'communications:read', 'notifications:read',
  ],
  PARENT: [
    'students:read', 'payments:read', 'grades:read',
    'convocations:read', 'profile:read', 'profile:update',
    'communications:read', 'homework:read', 'discipline:read', 'stats:read',
    'classes:read', 'subjects:read', 'school:read', 'notifications:read',
  ],
  DISCIPLINE: [
    'students:read', 'discipline:read', 'discipline:create', 'discipline:update',
    'convocations:read', 'convocations:create', 'communications:read',
    'stats:read', 'notifications:read',
  ],
  EPS: [
    'school:read', 'students:read', 'classes:read', 'grades:read', 'subjects:read',
    'dispenses:read', 'communications:read', 'homework:read',
    'profile:read', 'profile:update', 'notifications:read',
  ],
  MEDICAL: [
    'school:read', 'students:read', 'students:update', 'classes:read',
    'dispenses:read', 'dispenses:create', 'dispenses:update',
    'communications:read', 'communications:create',
    'profile:read', 'profile:update', 'notifications:read',
  ],
  SCHOOL_ADMIN: [
    'school:read', 'comments:approve', 'comments:delete',
    'users:read', 'users:create', 'users:update', 'users:delete',
    'students:read', 'students:create', 'students:update', 'students:delete',
    'payments:read', 'payments:create', 'payments:update', 'payments:verify',
    'grades:read', 'grades:create', 'grades:update',
    'classes:read', 'classes:create', 'classes:update', 'classes:delete',
    'subjects:read', 'subjects:create',
    'discipline:read', 'discipline:create', 'discipline:update',
    'convocations:read', 'convocations:create', 'convocations:update',
    'communications:read', 'communications:create',
    'homework:read', 'homework:create',
    'stats:read', 'profile:read', 'profile:update', 'schools:read',
    'payment-gateways:manage', 'currency:manage', 'transactions:read',
    'notifications:read',
  ],
};

// Restrictions par forfait — miroir de getEffectivePermissions (auth.ts).
export const ESSENTIEL_DENIED = [
  'communications:read', 'communications:create',
  'convocations:read', 'convocations:create', 'convocations:update',
  'payments:verify',
  'school:update', 'users:delete',
  'payment-gateways:manage', 'currency:manage', 'transactions:read',
];

export const FREEMIUM_DENIED = [
  ...ESSENTIEL_DENIED,
  'payments:create', 'payments:update', 'payments:verify',
  'homework:create', 'homework:read',
  'discipline:create', 'discipline:update',
  'subjects:create',
  'users:create', 'users:delete',
  'school:update',
];

// Fonctionnalité par forfait (miroir de SUBSCRIPTION_FEATURES)
export const SUBSCRIPTION_FEATURES: Record<string, string[]> = {
  FREEMIUM: ['students', 'classes', 'grades', 'payments'],
  ESSENTIEL: ['students', 'classes', 'grades', 'payments', 'parents', 'homework', 'discipline', 'PARENT_GRADES'],
  STANDARD: ['students', 'classes', 'grades', 'payments', 'parents', 'homework', 'discipline', 'PARENT_GRADES', 'report_cards', 'communications', 'convocations'],
  PREMIUM: ['students', 'classes', 'grades', 'payments', 'parents', 'homework', 'discipline', 'PARENT_GRADES', 'report_cards', 'communications', 'convocations', 'analytics', 'multi_years', 'medical', 'priority_support', 'custom_branding'],
  ENTERPRISE: ['*'],
  CORPORATE: ['*'],
};

export interface Principal {
  role: string;
  schoolId?: string | null;
  schoolSubscriptionTier?: string | null;
}

/**
 * can(user, 'users:create') → true si le rôle possède la permission
 * ET que le forfait de l'école ne la retire pas.
 * (Contrôle UX uniquement — l'API revalide toujours côté serveur.)
 */
export function can(
  user: Principal | null | undefined,
  permission: string
): boolean {
  if (!user?.role) return false;
  if (user.role === 'SUPER_ADMIN_GLOBAL') return true;
  const base = ROLE_PERMISSIONS[user.role] || [];
  if (!base.includes(permission)) return false;
  const tier = user.schoolSubscriptionTier || undefined;
  if (tier) {
    const denied = tier === 'FREEMIUM' ? FREEMIUM_DENIED : tier === 'ESSENTIEL' ? ESSENTIEL_DENIED : [];
    if (denied.includes(permission)) return false;
  }
  return true;
}

/**
 * hasFeature(user, 'medical') → true si le forfait de l'école inclut la
 * fonctionnalité (le SUPER_ADMIN_GLOBAL passe toujours).
 */
export function hasFeature(
  user: Principal | null | undefined,
  feature: string
): boolean {
  if (!user?.role) return false;
  if (user.role === 'SUPER_ADMIN_GLOBAL') return true;
  const tier = user.schoolSubscriptionTier || 'FREEMIUM';
  const features = SUBSCRIPTION_FEATURES[tier] || SUBSCRIPTION_FEATURES.FREEMIUM;
  return features.includes('*') || features.includes(feature);
}
