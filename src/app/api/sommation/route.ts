import { db } from '@/lib/db'
import { requirePermission, verifySchoolAccess, sanitizeError } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { jsPDF } from 'jspdf'
import { registerDocument, qrDataUrlForDocument } from '@/lib/document-verify'
import { fetchPublicLogo } from '@/lib/pdf-logo'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'CDF',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function getTrimesterLabel(trimester: string): string {
  const map: Record<string, string> = {
    T1: '1er Trimestre',
    T2: '2ème Trimestre',
    T3: '3ème Trimestre',
  }
  return map[trimester] || trimester
}

function getSchoolInitials(shortName: string): string {
  return shortName
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 4)
}

/**
 * Sanitisation ASCII (design gianelli) : la police Helvetica de jsPDF ne
 * rend pas correctement les accents dans certains environnements — on
 * remplace É→E, è→e, —→-, etc. pour un rendu identique partout.
 */
function sanitizeAscii(text: string): string {
  return String(text || '')
    .replace(/[\u00C0-\u00C5]/g, 'A')
    .replace(/[\u00C6]/g, 'AE')
    .replace(/[\u00C7]/g, 'C')
    .replace(/[\u00C8-\u00CB]/g, 'E')
    .replace(/[\u00CC-\u00CF]/g, 'I')
    .replace(/[\u00D0]/g, 'D')
    .replace(/[\u00D1]/g, 'N')
    .replace(/[\u00D2-\u00D6\u00D8]/g, 'O')
    .replace(/[\u00D9-\u00DC]/g, 'U')
    .replace(/[\u00DD]/g, 'Y')
    .replace(/[\u00DF]/g, 'ss')
    .replace(/[\u00E0-\u00E5]/g, 'a')
    .replace(/[\u00E6]/g, 'ae')
    .replace(/[\u00E7]/g, 'c')
    .replace(/[\u00E8-\u00EB]/g, 'e')
    .replace(/[\u00EC-\u00EF]/g, 'i')
    .replace(/[\u00F0]/g, 'd')
    .replace(/[\u00F1]/g, 'n')
    .replace(/[\u00F2-\u00F6\u00F8]/g, 'o')
    .replace(/[\u00F9-\u00FC]/g, 'u')
    .replace(/[\u00FD\u00FF]/g, 'y')
    .replace(/[\u00A0\u202F]/g, ' ')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\x20-\x7E]/g, '')
}

/** Logo EduGest (via assets publics — compatible Node + Workers, jamais fs). */
async function getEduGestLogoBase64(requestUrl: string): Promise<string | null> {
  const logo = await fetchPublicLogo(requestUrl);
  return logo ? logo.dataUrl : null;
}

// ─── PDF Builder — design « Institut Gianelli » (navy & or) ──────────────────
// Même vocabulaire visuel que reçus, bulletins, fiches de présence et
// documents médicaux : double bordure décorative, logo école encadré d'or +
// logo EduGest en haut à droite, filets or, libellés de section en or,
// lignes pointillées, QR code de vérification et pied de page EduGest.

const NAVY: [number, number, number] = [2, 36, 72]
const GOLD: [number, number, number] = [212, 175, 55]
const GREEN: [number, number, number] = [0, 135, 90]
const RED: [number, number, number] = [186, 26, 26]
const GRAY: [number, number, number] = [120, 120, 120]
const DGRAY: [number, number, number] = [50, 50, 50]
const LGRAY: [number, number, number] = [200, 200, 200]

function centerText(doc: jsPDF, text: string, y: number, pageWidth: number) {
  const tw = doc.getTextWidth(text)
  doc.text(text, (pageWidth - tw) / 2, y)
}

function rightText(doc: jsPDF, text: string, y: number, rightX: number) {
  const tw = doc.getTextWidth(text)
  doc.text(text, rightX - tw, y)
}

function drawDottedLine(doc: jsPDF, x1: number, y: number, x2: number) {
  const step = 2.5
  const len = x2 - x1
  const count = Math.floor(len / step)
  for (let i = 0; i < count; i += 2) {
    const sx = x1 + i * step
    const ex = Math.min(sx + step * 0.6, x2)
    doc.line(sx, y, ex, y)
  }
}

function buildSommationPDF(
  student: { firstName: string; lastName: string; matricule: string },
  parent: { name: string; phone: string | null } | null,
  school: { name: string; shortName: string; email: string; phone: string; address: string; city: string; province: string; country: string; logo: string | null },
  debts: Array<{ trimester: string; amount: number; paidAmount: number; remaining: number; status: string }>,
  schoolLogoBase64: string | null,
  totalRemaining: number,
  qrCodeDataUrl: string | null,
  verifyCode: string | null,
  edugestLogoBase64: string | null,
): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const mx = 15
  const cw = W - mx * 2

  const setD = (c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2])
  const setF = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2])
  const setT = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2])

  const today = new Date()
  const dateStr = formatDate(today)
  const refNo = verifyCode || `SOM-${Date.now().toString(36).toUpperCase().slice(-6)}`

  // ══════════════════════════════════════════════════════════════════
  //  DOUBLE BORDURE DÉCORATIVE (gianelli)
  // ══════════════════════════════════════════════════════════════════
  setD(NAVY)
  doc.setLineWidth(1.5)
  doc.rect(5, 5, W - 10, H - 10)

  setD(GOLD)
  doc.setLineWidth(0.3)
  doc.rect(8, 8, W - 16, H - 16)

  // ══════════════════════════════════════════════════════════════════
  //  EN-TÊTE : logo école encadré d'or + logo EduGest en haut à droite
  // ══════════════════════════════════════════════════════════════════
  let y = 20
  const logoX = mx + 2
  const logoY = y
  const logoSize = 22

  setD(GOLD)
  setF([255, 255, 255])
  doc.setLineWidth(1.5)
  doc.rect(logoX, logoY, logoSize, logoSize, 'FD')

  let logoDrawn = false
  if (schoolLogoBase64) {
    try {
      doc.addImage(schoolLogoBase64, 'JPEG', logoX + 1.5, logoY + 1.5, logoSize - 3, logoSize - 3)
      logoDrawn = true
    } catch { logoDrawn = false }
  }
  if (!logoDrawn) {
    const initials = getSchoolInitials(school.shortName)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    setT(NAVY)
    const tw = doc.getTextWidth(initials)
    doc.text(initials, logoX + (logoSize - tw) / 2, logoY + logoSize / 2 + 2)
  }

  // Nom de l'école en or
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  setT(GOLD)
  doc.text(sanitizeAscii(school.name).toUpperCase().slice(0, 30), mx + 30, y + 9)

  // Adresse + contact
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  setT(GRAY)
  const addressParts = sanitizeAscii([school.address, school.city, school.province, school.country].filter(Boolean).join(', '))
  if (addressParts) doc.text(addressParts.slice(0, 58), mx + 30, y + 15)
  const contactParts = sanitizeAscii([school.phone, school.email].filter(Boolean).join('  |  '))
  if (contactParts) doc.text(contactParts.slice(0, 58), mx + 30, y + 20)

  // ── LOGO EDUGEST (haut droit) ──
  const edugestLogo = edugestLogoBase64
  try {
    if (edugestLogo) {
      const edugestFormat = edugestLogo.startsWith('data:image/png') ? 'PNG' : 'JPEG'
      doc.addImage(edugestLogo, edugestFormat, W - mx - 26, y - 2, 24, 24)
    } else {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      setT(GOLD)
      doc.text('EduGest', W - mx - 4, y + 8, { align: 'right' })
    }
  } catch { /* logo ignoré */ }

  // ══════════════════════════════════════════════════════════════════
  //  LIGNE DÉCORATIVE OR
  // ══════════════════════════════════════════════════════════════════
  y = y + 30
  setD(GOLD)
  doc.setLineWidth(1)
  doc.line(mx, y, W - mx, y)
  doc.setLineWidth(0.3)
  doc.line(mx, y + 2, W - mx, y + 2)

  // ══════════════════════════════════════════════════════════════════
  //  TITRE
  // ══════════════════════════════════════════════════════════════════
  y += 10
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  setT(NAVY)
  centerText(doc, `SOMMATION N. ${refNo}`, y, W)

  y += 7
  doc.setFontSize(10.5)
  setT(RED)
  centerText(doc, 'MISE EN DEMEURE DE PAIEMENT', y, W)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setT(GRAY)
  centerText(doc, `Date : ${dateStr}`, y + 6, W)

  // ══════════════════════════════════════════════════════════════════
  //  INFORMATIONS ÉLÈVE
  // ══════════════════════════════════════════════════════════════════
  y += 17
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  setT(GOLD)
  doc.text('INFORMATIONS ELEVE', mx + 2, y)
  y += 3

  const parentLabel = parent
    ? sanitizeAscii(`${parent.name}${parent.phone ? `  |  ${parent.phone}` : ''}`).slice(0, 46)
    : '—'
  const infoFields: [string, string][] = [
    ['ELEVE', sanitizeAscii(`${student.lastName.toUpperCase()} ${student.firstName}`).slice(0, 46)],
    ['MATRICULE', sanitizeAscii(student.matricule)],
    ['PARENT', parentLabel],
  ]

  for (const [label, value] of infoFields) {
    y += 7
    setD(LGRAY)
    doc.setLineWidth(0.2)
    drawDottedLine(doc, mx + 2, y - 2, W - mx - 2)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    setT(GRAY)
    doc.text(label, mx + 4, y)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    setT(NAVY)
    rightText(doc, value, y, W - mx - 4)
  }

  // ══════════════════════════════════════════════════════════════════
  //  CORPS DE LA LETTRE
  // ══════════════════════════════════════════════════════════════════
  y += 10
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  setT(DGRAY)
  const studentFullName = `${student.firstName} ${student.lastName}`

  const introBlocks = [
    `Nous avons l'honneur de vous informer que l'élève ${studentFullName} (matricule ${student.matricule}) présente, au ${dateStr}, un solde impayé d'un montant total de ${formatCurrency(totalRemaining)}.`,
    'Nous vous prions de bien vouloir procéder au règlement dans les meilleurs délais.',
  ]

  for (let i = 0; i < introBlocks.length; i++) {
    if (i > 0) y += 4
    const splitText = doc.splitTextToSize(sanitizeAscii(introBlocks[i]), cw - 8)
    doc.text(splitText, mx + 4, y)
    y += splitText.length * 6
  }

  // ══════════════════════════════════════════════════════════════════
  //  DÉTAIL DES IMPAYÉS (tableau navy, lignes pointillées)
  // ══════════════════════════════════════════════════════════════════
  y += 10
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  setT(GOLD)
  doc.text('DETAIL DES IMPAYES', mx + 2, y)
  y += 3

  const colTrimester = mx + 4
  const colAmount = mx + 45
  const colPaid = mx + 82
  const colRemaining = mx + 118
  const colStatus = mx + 151

  // En-tête du tableau (navy, style famille)
  setF(NAVY)
  doc.setFontSize(9)
  doc.rect(mx + 2, y, cw - 4, 7, 'FD')
  setT([255, 255, 255])
  doc.setFont('helvetica', 'bold')
  doc.text('TRIMESTRE', colTrimester, y + 5)
  doc.text('MONTANT', colAmount, y + 5)
  doc.text('PAYE', colPaid, y + 5)
  doc.text('RESTANT', colRemaining, y + 5)
  doc.text('STATUT', colStatus, y + 5)
  y += 7

  // Lignes (page unique : détail tronqué à 4 lignes, montant total exact)
  const shownDebts = debts.slice(0, 4)
  for (const debt of shownDebts) {
    y += 7
    setD(LGRAY)
    doc.setLineWidth(0.2)
    drawDottedLine(doc, mx + 2, y - 2, W - mx - 2)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    setT(DGRAY)
    doc.text(sanitizeAscii(getTrimesterLabel(debt.trimester)), colTrimester, y)

    doc.setFont('helvetica', 'normal')
    doc.text(sanitizeAscii(formatCurrency(debt.amount)), colAmount, y)
    doc.text(sanitizeAscii(formatCurrency(debt.paidAmount)), colPaid, y)

    doc.setFont('helvetica', 'bold')
    setT(RED)
    doc.text(sanitizeAscii(formatCurrency(debt.remaining)), colRemaining, y)

    let statusLabel = 'Impaye'
    let statusColor: [number, number, number] = RED
    if (debt.status === 'PAID') {
      statusLabel = 'Paye'
      statusColor = GREEN
    } else if (debt.status === 'PARTIAL') {
      statusLabel = 'Partiel'
      statusColor = GOLD
    }
    setT(statusColor)
    doc.text(statusLabel, colStatus, y)
  }

  // Note de troncature (au-dessus du filet rouge, sans coût vertical)
  if (debts.length > shownDebts.length) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(6.5)
    setT(GRAY)
    rightText(doc, `Detail partiel : ${shownDebts.length} impayes sur ${debts.length}`, y + 4.5, W - mx - 2)
  }

  // ══════════════════════════════════════════════════════════════════
  //  MONTANT TOTAL DÛ
  // ══════════════════════════════════════════════════════════════════
  y += 8
  setD(RED)
  doc.setLineWidth(0.5)
  doc.line(mx, y, W - mx, y)
  y += 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setT(RED)
  doc.text('MONTANT TOTAL DU', mx + 2, y)
  rightText(doc, sanitizeAscii(formatCurrency(totalRemaining)), y, W - mx - 2)

  // ══════════════════════════════════════════════════════════════════
  //  ENCADRÉ IMPORTANT
  // ══════════════════════════════════════════════════════════════════
  y += 8
  const boxH = 15
  const boxX = mx + 2
  const boxW = cw - 4

  setF([254, 226, 226])
  setD(RED)
  doc.setLineWidth(0.5)
  doc.roundedRect(boxX, y, boxW, boxH, 2, 2, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  setT(RED)
  doc.text('IMPORTANT', boxX + 6, y + 5.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(
    sanitizeAscii('En cas de non-paiement dans les 30 jours suivant la réception de cette sommation,'),
    boxX + 6, y + 10
  )
  doc.text(
    sanitizeAscii('des mesures supplémentaires pourront être prises conformément au règlement intérieur.'),
    boxX + 6, y + 13.5
  )
  y += boxH

  // ══════════════════════════════════════════════════════════════════
  //  FORMULE DE POLITESSE + SIGNATURE
  // ══════════════════════════════════════════════════════════════════
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  setT(DGRAY)
  const closing = sanitizeAscii("Nous vous prions d'agréer, Madame, Monsieur, l'expression de nos salutations distinguées.")
  doc.text(closing, mx + 4, y)

  y += 6
  setD(GOLD)
  doc.setLineWidth(0.5)
  doc.line(mx, y, W - mx, y)

  y += 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  setT(GRAY)
  doc.text('Signature du parent', mx + 4, y)
  doc.text('Cachet de l\'ecole', W / 2 + 5, y)

  setD(LGRAY)
  doc.setLineWidth(0.3)
  doc.line(mx + 4, y + 8, mx + 64, y + 8)
  doc.line(W / 2 + 5, y + 8, W - mx - 4, y + 8)

  y += 14
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  setT(NAVY)
  rightText(doc, sanitizeAscii(school.name).slice(0, 34), y, W - mx - 4)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setT(GRAY)
  rightText(doc, 'La Direction', y + 6, W - mx - 4)
  rightText(doc, dateStr, y + 12, W - mx - 4)

  // ══════════════════════════════════════════════════════════════════
  //  QR CODE DE VÉRIFICATION (bas de page)
  // ══════════════════════════════════════════════════════════════════
  if (qrCodeDataUrl) {
    const qrY = H - 62
    try {
      doc.addImage(qrCodeDataUrl, 'PNG', W / 2 - 10, qrY, 20, 20)
    } catch { /* QR ignoré */ }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    setT(GRAY)
    centerText(doc, 'VERIFICATION', qrY + 23, W)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    setT(LGRAY)
    centerText(doc, "Pour verifier l'authenticite de cette sommation, scannez le QR code", qrY + 27, W)
    if (verifyCode) {
      centerText(doc, `Code : ${verifyCode}`, qrY + 31, W)
    }
  }

  // ══════════════════════════════════════════════════════════════════
  //  PIED DE PAGE : école + EduGest
  // ══════════════════════════════════════════════════════════════════
  const footerY = H - 25

  setD(GOLD)
  doc.setLineWidth(0.8)
  doc.line(mx, footerY, W - mx, footerY)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  setT(NAVY)
  centerText(doc, sanitizeAscii(school.name).slice(0, 48), footerY + 5, W)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  setT(GRAY)
  centerText(doc, 'Genere par EduGest - La plateforme de gestion scolaire', footerY + 9, W)

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(6.5)
  setT(LGRAY)
  const now = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  const genDate = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`
  centerText(doc, `Document genere le ${genDate}`, footerY + 13, W)

  // ID de vérification machine-lisible
  doc.setFontSize(4)
  setT([255, 255, 255])
  centerText(doc, `EDUGEST-SOMMATION:${refNo}`, H - 4, W)

  return Buffer.from(doc.output('arraybuffer'))
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission(request, 'payments:read')
    if ('error' in authResult) return authResult.error
    const { user } = authResult

    const body = await request.json()
    const { studentId, schoolId, debts } = body

    if (!studentId || !schoolId || !debts || !Array.isArray(debts) || debts.length === 0) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    if (!verifySchoolAccess(user, schoolId)) {
      return NextResponse.json({ error: 'Accès non autorisé à cette école' }, { status: 403 })
    }

    const student = await db.student.findUnique({
      where: { id: studentId },
      select: {
        schoolId: true,
        firstName: true,
        lastName: true,
        matricule: true,
        parent: { select: { name: true, phone: true } },
      },
    })

    if (!student) {
      return NextResponse.json({ error: 'Élève non trouvé' }, { status: 404 })
    }

    // ── SÉCURITÉ : l'élève sommé doit appartenir à l'école de l'en-tête
    // (avant : élève d'une autre école possible sur le PDF).
    if (student.schoolId !== schoolId) {
      return NextResponse.json({ error: 'Cet élève n\'appartient pas à cette école' }, { status: 403 })
    }

    const school = await db.school.findUnique({
      where: { id: schoolId },
      select: {
        name: true,
        shortName: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        province: true,
        country: true,
        logo: true,
      },
    })

    if (!school) {
      return NextResponse.json({ error: 'École non trouvée' }, { status: 404 })
    }

    // Fetch school logo as base64 (origin de la requête : fiable partout —
    // localhost, exe 127.0.0.1:port, domaine Workers)
    let assetOrigin = '';
    try {
      assetOrigin = new URL(request.url).origin;
    } catch { /* ignore */ }
    let schoolLogoBase64: string | null = null
    if (school.logo) {
      try {
        const logoUrl = school.logo.startsWith('http')
          ? school.logo
          : `${assetOrigin || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}${school.logo}`
        const logoRes = await fetch(logoUrl)
        if (logoRes.ok) {
          const logoBuffer = Buffer.from(await logoRes.arrayBuffer())
          const mimeType = logoUrl.endsWith('.png') ? 'image/png' : 'image/jpeg'
          schoolLogoBase64 = `data:${mimeType};base64,${logoBuffer.toString('base64')}`
        }
      } catch {}
    }

    const totalRemaining = debts.reduce((sum: number, d: { remaining: number }) => sum + d.remaining, 0)

    // ── Enregistrement du document officiel + QR code unique ─────────
    // (même registre universel que bulletins, reçus et fiches médicales :
    // n'importe qui, sans compte, peut vérifier l'authenticité via le QR)
    const docRecord = await registerDocument({
      type: 'SUMMONS',
      schoolId,
      studentId,
      metadata: {
        studentName: `${student.firstName} ${student.lastName}`,
        matricule: student.matricule,
        parentName: student.parent?.name || null,
        totalRemaining,
        debtsCount: debts.length,
        trimesters: debts.map((d: { trimester: string }) => d.trimester),
      },
    })
    const qrCodeDataUrl = await qrDataUrlForDocument(docRecord.id)
    const verifyCode = `SOM-${docRecord.id.slice(-8).toUpperCase()}`

    // Logo EduGest (assets publics — jamais fs, compatible Workers)
    const edugestLogoBase64 = await getEduGestLogoBase64(request.url);

    const pdfBuffer = buildSommationPDF(
      student,
      student.parent,
      school,
      debts,
      schoolLogoBase64,
      totalRemaining,
      qrCodeDataUrl,
      verifyCode,
      edugestLogoBase64,
    )

    const studentName = `${student.lastName}-${student.firstName}`.replace(/\s+/g, '_')

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="sommation-${studentName}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (error) {
    console.error('Error generating sommation PDF:', error)
    return NextResponse.json({ error: sanitizeError(error) }, { status: 500 })
  }
}
