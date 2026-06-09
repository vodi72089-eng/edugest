import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Default pricing tiers to seed if none exist
const DEFAULT_TIERS = [
  {
    tier: 'FREEMIUM',
    name: 'Freemium',
    price: 0,
    period: '/mois',
    description: 'Pour découvrir EduGest',
    features: '1 admin,100 élèves max,0 msg WhatsApp,Gestion basique',
    color: 'oklch(52% 0.015 250)',
    isPopular: false,
    sortOrder: 0,
  },
  {
    tier: 'ESSENTIEL',
    name: 'Essentiel',
    price: 100,
    period: '/mois',
    description: 'Pour les petites structures',
    features: '1 admin,Professeurs illimités,500 msg WhatsApp/mois,Notes & bulletins',
    color: 'oklch(60% 0.13 250)',
    isPopular: false,
    sortOrder: 1,
  },
  {
    tier: 'STANDARD',
    name: 'Standard',
    price: 250,
    period: '/mois',
    description: 'Le choix des écoles',
    features: '5 admins,10 professeurs,WhatsApp illimité,Paiements mobiles,Communications',
    color: 'oklch(55% 0.15 175)',
    isPopular: true,
    sortOrder: 2,
  },
  {
    tier: 'PREMIUM',
    name: 'Professionnel',
    price: 500,
    period: '/mois',
    description: 'Pour les grands établissements',
    features: 'Admins illimités,Profs illimités,App mobile dédiée,Support prioritaire,API accès',
    color: 'oklch(72% 0.15 65)',
    isPopular: false,
    sortOrder: 3,
  },
  {
    tier: 'ENTERPRISE',
    name: 'Enterprise',
    price: 1000,
    period: '/mois',
    description: 'Multi-écoles',
    features: '3 écoles incluses,Serveur dédié,Formation équipe,SLA garanti',
    color: 'oklch(60% 0.15 145)',
    isPopular: false,
    sortOrder: 4,
  },
  {
    tier: 'CORPORATE',
    name: 'Corporate',
    price: -1, // -1 means "Sur mesure"
    period: '',
    description: 'Groupes scolaires',
    features: 'Écoles illimitées,On-premise,Marque blanche,Intégration sur mesure',
    color: 'oklch(58% 0.20 25)',
    isPopular: false,
    sortOrder: 5,
  },
]

// GET /api/pricing — fetch all pricing plans
export async function GET() {
  try {
    let plans = await db.pricingPlan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    })

    // Seed default plans if none exist
    if (plans.length === 0) {
      await db.pricingPlan.createMany({
        data: DEFAULT_TIERS.map(t => ({ ...t })),
      })
      plans = await db.pricingPlan.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      })
    }

    return NextResponse.json({ data: plans })
  } catch (error) {
    console.error('Error fetching pricing plans:', error)
    return NextResponse.json({ error: 'Failed to fetch pricing plans' }, { status: 500 })
  }
}

// PUT /api/pricing — update a pricing plan
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, price, originalPrice, name, description, features, period, isPopular, isActive } = body

    if (!id) {
      return NextResponse.json({ error: 'Plan ID is required' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {}
    if (price !== undefined) updateData.price = price
    if (originalPrice !== undefined) updateData.originalPrice = originalPrice
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (features !== undefined) updateData.features = features
    if (period !== undefined) updateData.period = period
    if (isPopular !== undefined) updateData.isPopular = isPopular
    if (isActive !== undefined) updateData.isActive = isActive

    const plan = await db.pricingPlan.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({ data: plan })
  } catch (error) {
    console.error('Error updating pricing plan:', error)
    return NextResponse.json({ error: 'Failed to update pricing plan' }, { status: 500 })
  }
}

// POST /api/pricing — create a new pricing plan (or reset to defaults)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body

    // Reset all plans to defaults
    if (action === 'reset') {
      await db.pricingPlan.deleteMany({})
      await db.pricingPlan.createMany({
        data: DEFAULT_TIERS.map(t => ({ ...t })),
      })
      const plans = await db.pricingPlan.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      })
      return NextResponse.json({ data: plans })
    }

    // Create a single new plan
    const { tier, name, price, originalPrice, period, description, features, color, isPopular, sortOrder } = body
    if (!tier || !name) {
      return NextResponse.json({ error: 'Tier and name are required' }, { status: 400 })
    }

    const plan = await db.pricingPlan.create({
      data: {
        tier,
        name,
        price: price ?? 0,
        originalPrice: originalPrice ?? null,
        period: period ?? '/mois',
        description: description ?? '',
        features: features ?? '',
        color: color ?? '',
        isPopular: isPopular ?? false,
        sortOrder: sortOrder ?? 0,
      },
    })

    return NextResponse.json({ data: plan }, { status: 201 })
  } catch (error) {
    console.error('Error creating pricing plan:', error)
    return NextResponse.json({ error: 'Failed to create pricing plan' }, { status: 500 })
  }
}
