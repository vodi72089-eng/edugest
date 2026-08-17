import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import fs from 'fs'
import path from 'path'

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads')
// SVG is excluded on purpose: SVG files can contain scripts and would be
// served from the app origin, enabling stored XSS.
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
}
const MAX_SIZE = 5 * 1024 * 1024

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth(request)
    if ('error' in authResult) return authResult.error

    // Ensure the request is multipart/form-data; otherwise formData() throws
    const contentType = request.headers.get('content-type') || ''
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Aucun fichier fourni (multipart/form-data attendu)' }, { status: 400 })
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 })
    }
    const file = formData.get('file') as File | null
    const ALLOWED_CATEGORIES = ['general', 'profiles', 'students', 'schools']
    const rawCategory = (formData.get('category') as string) || 'general'
    const category = ALLOWED_CATEGORIES.includes(rawCategory) ? rawCategory : 'general'

    if (!file) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 })
    }

    if (!(file.type in ALLOWED_TYPES)) {
      return NextResponse.json({ error: 'Type de fichier non autorisé' }, { status: 400 })
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Le fichier ne doit pas dépasser 5MB' }, { status: 400 })
    }

    const categoryDir = path.join(UPLOAD_DIR, category)
    ensureDir(categoryDir)

    // Extension derived from the declared MIME type — NEVER from the
    // client-provided filename (which could be x.svg, x.html, ... and
    // would be served as active content from the app origin).
    const ext = ALLOWED_TYPES[file.type]
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
