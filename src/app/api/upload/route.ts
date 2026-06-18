import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import fs from 'fs'
import path from 'path'

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads')
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
const MAX_SIZE = 5 * 1024 * 1024

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const category = (formData.get('category') as string) || 'general'

    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Type de fichier non autorisé' }, { status: 400 })
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Le fichier ne doit pas dépasser 5MB' }, { status: 400 })
    }

    const categoryDir = path.join(UPLOAD_DIR, category)
    ensureDir(categoryDir)

    const ext = file.name.split('.').pop() || 'png'
    const filename = `${authResult.user.id}-${Date.now()}.${ext}`
    const filepath = path.join(categoryDir, filename)

    const buffer = Buffer.from(await file.arrayBuffer())
    fs.writeFileSync(filepath, buffer)

    const url = `/uploads/${category}/${filename}`

    return NextResponse.json({ url, filename })
  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json({ error: 'Erreur lors de l\'upload' }, { status: 500 })
  }
}
