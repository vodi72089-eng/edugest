import { db } from '@/lib/db'
import { requirePermission, verifySchoolAccess, sanitizeError } from '@/lib/auth'
import { NextRequest, NextResponse } from 'next/server'
import { jsPDF } from 'jspdf'

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

function buildSommationPDF(
  student: { firstName: string; lastName: string; matricule: string },
  parent: { name: string; phone: string | null } | null,
  school: { name: string; shortName: string; email: string; phone: string; address: string; city: string; province: string; country: string; logo: string | null },
  debts: Array<{ trimester: string; amount: number; paidAmount: number; remaining: number; status: string }>,
  schoolLogoBase64: string | null,
  totalRemaining: number,
): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 22
  const contentWidth = pageWidth - marginX * 2
  let y = 20

  // White background
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, pageWidth, pageHeight, 'F')

  // Gold top accent line
  doc.setFillColor(245, 166, 35)
  doc.rect(0, 0, pageWidth, 2, 'F')

  // School logo
  if (schoolLogoBase64) {
    try {
      doc.addImage(schoolLogoBase64, 'JPEG', marginX, y, 18, 18)
    } catch {
      doc.setFillColor(245, 166, 35)
      doc.circle(marginX + 9, y + 9, 9, 'F')
      doc.setFontSize(14)
      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.text(getSchoolInitials(school.shortName), marginX + 9, y + 12.5, { align: 'center' })
    }
  } else {
    doc.setFillColor(245, 166, 35)
    doc.circle(marginX + 9, y + 9, 9, 'F')
    doc.setFontSize(14)
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.text(getSchoolInitials(school.shortName), marginX + 9, y + 12.5, { align: 'center' })
  }

  // School name
  doc.setFontSize(18)
  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.text(school.name, marginX + 24, y + 8)

  // School address
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.setFont('helvetica', 'normal')
  const addressParts = [school.address, school.city, school.province, school.country].filter(Boolean)
  if (addressParts.length > 0) {
    doc.text(addressParts.join(', '), marginX + 24, y + 14)
  }
  const contactParts = [school.email, school.phone].filter(Boolean)
  if (contactParts.length > 0) {
    doc.text(contactParts.join('  ·  '), marginX + 24, y + 19)
  }

  // SOMMATION label (top right)
  doc.setFontSize(10)
  doc.setTextColor(220, 38, 38)
  doc.setFont('helvetica', 'bold')
  doc.text('SOMMATION', pageWidth - marginX, y + 5, { align: 'right' })
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.setFont('helvetica', 'normal')
  doc.text(formatDate(new Date()), pageWidth - marginX, y + 11, { align: 'right' })
  const refNo = `SOM-${Date.now().toString(36).toUpperCase().slice(-6)}`
  doc.text(refNo, pageWidth - marginX, y + 16, { align: 'right' })

  y += 28

  // Divider
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.3)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 8

  // Title
  doc.setFontSize(14)
  doc.setTextColor(220, 38, 38)
  doc.setFont('helvetica', 'bold')
  doc.text('MISE EN DEMEURE DE PAIEMENT', pageWidth / 2, y, { align: 'center' })
  y += 12

  // Body text
  doc.setFontSize(10)
  doc.setTextColor(50, 50, 50)
  doc.setFont('helvetica', 'normal')
  const today = new Date()
  const dateStr = formatDate(today)
  const parentName = parent?.name || 'Madame/Monsieur le parent'
  const studentFullName = `${student.firstName} ${student.lastName}`

  const introLines = [
    `Nous avons l'honneur de vous informer que l'élève ${studentFullName}, matricule ${student.matricule},`,
    `inscrit dans la classe de ${school.shortName}, présente un solde impayé.`,
    '',
    `En date du ${dateStr}, le montant total restant dû est de ${formatCurrency(totalRemaining)}.`,
    '',
    `Nous vous prions de bien vouloir procéder au règlement dans les meilleurs délais.`,
  ]

  for (const line of introLines) {
    if (line === '') {
      y += 4
    } else {
      const splitText = doc.splitTextToSize(line, contentWidth)
      doc.text(splitText, marginX, y)
      y += splitText.length * 5 + 1
    }
  }

  y += 6

  // Debt details table
  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  doc.setFont('helvetica', 'bold')
  doc.text('Détail des impayés', marginX, y)
  y += 8

  // Table header
  const colTrimester = marginX
  const colAmount = marginX + 35
  const colPaid = marginX + 70
  const colRemaining = marginX + 105
  const colStatus = marginX + 145

  doc.setFillColor(245, 166, 35)
  doc.roundedRect(marginX, y - 4, contentWidth, 8, 1, 1, 'F')

  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.text('Trimestre', colTrimester, y + 1)
  doc.text('Montant', colAmount, y + 1)
  doc.text('Payé', colPaid, y + 1)
  doc.text('Restant', colRemaining, y + 1)
  doc.text('Statut', colStatus, y + 1)
  y += 10

  // Table rows
  for (const debt of debts) {
    doc.setFillColor(248, 249, 250)
    doc.rect(marginX, y - 4, contentWidth, 8, 'F')

    doc.setFontSize(9)
    doc.setTextColor(30, 28, 25)
    doc.setFont('helvetica', 'bold')
    doc.text(getTrimesterLabel(debt.trimester), colTrimester, y + 1)

    doc.setFont('helvetica', 'normal')
    doc.text(formatCurrency(debt.amount), colAmount, y + 1)
    doc.text(formatCurrency(debt.paidAmount), colPaid, y + 1)

    doc.setTextColor(220, 38, 38)
    doc.setFont('helvetica', 'bold')
    doc.text(formatCurrency(debt.remaining), colRemaining, y + 1)

    // Status
    let statusLabel = 'Impayé'
    let statusColor: [number, number, number] = [220, 38, 38]
    if (debt.status === 'PAID') {
      statusLabel = 'Payé'
      statusColor = [34, 197, 94]
    } else if (debt.status === 'PARTIAL') {
      statusLabel = 'Partiel'
      statusColor = [234, 179, 8]
    }
    doc.setTextColor(...statusColor)
    doc.setFont('helvetica', 'bold')
    doc.text(statusLabel, colStatus, y + 1)

    y += 10
  }

  // Total row
  doc.setDrawColor(220, 38, 38)
  doc.setLineWidth(0.5)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 6

  doc.setFontSize(11)
  doc.setTextColor(220, 38, 38)
  doc.setFont('helvetica', 'bold')
  doc.text('MONTANT TOTAL DÛ', marginX, y)
  doc.text(formatCurrency(totalRemaining), pageWidth - marginX, y, { align: 'right' })

  y += 20

  // Urgency note
  doc.setFillColor(254, 226, 226)
  doc.roundedRect(marginX, y, contentWidth, 20, 2, 2, 'F')

  doc.setFontSize(9)
  doc.setTextColor(153, 27, 27)
  doc.setFont('helvetica', 'bold')
  doc.text('IMPORTANT', marginX + 6, y + 7)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.text(
    'En cas de non-paiement dans les 30 jours suivant la réception de cette sommation,',
    marginX + 6, y + 13
  )
  doc.text(
    'des mesures supplémentaires pourront être prises conformément au règlement intérieur.',
    marginX + 6, y + 17
  )

  y += 30

  // Closing
  doc.setFontSize(10)
  doc.setTextColor(50, 50, 50)
  doc.setFont('helvetica', 'normal')
  doc.text('Nous vous prions d\'agréer, Madame, Monsieur, l\'expression de nos salutations distinguées.', marginX, y)
  y += 20

  // Signature
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 23, 42)
  doc.text(school.name, marginX + contentWidth - 60, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  doc.text('La Direction', marginX + contentWidth - 60, y + 6)
  doc.text(formatDate(today), marginX + contentWidth - 60, y + 12)

  // Footer
  y = pageHeight - 16
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.3)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 5

  doc.setFontSize(7)
  doc.setTextColor(148, 163, 184)
  doc.setFont('helvetica', 'normal')
  doc.text('Document généré par', pageWidth / 2, y, { align: 'center' })
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(245, 166, 35)
  doc.text(' EduGest', pageWidth / 2 + 10, y, { align: 'left' })

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
        firstName: true,
        lastName: true,
        matricule: true,
        parent: { select: { name: true, phone: true } },
      },
    })

    if (!student) {
      return NextResponse.json({ error: 'Élève non trouvé' }, { status: 404 })
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

    // Fetch school logo as base64
    let schoolLogoBase64: string | null = null
    if (school.logo) {
      try {
        const logoUrl = school.logo.startsWith('http')
          ? school.logo
          : `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}${school.logo}`
        const logoRes = await fetch(logoUrl)
        if (logoRes.ok) {
          const logoBuffer = Buffer.from(await logoRes.arrayBuffer())
          const mimeType = logoUrl.endsWith('.png') ? 'image/png' : 'image/jpeg'
          schoolLogoBase64 = `data:${mimeType};base64,${logoBuffer.toString('base64')}`
        }
      } catch {}
    }

    const totalRemaining = debts.reduce((sum: number, d: { remaining: number }) => sum + d.remaining, 0)

    const pdfBuffer = buildSommationPDF(
      student,
      student.parent,
      school,
      debts,
      schoolLogoBase64,
      totalRemaining,
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
