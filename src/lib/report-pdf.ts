import type { DetailedReport } from '@/lib/report-data';
import { fmtLagosDateTime } from '@/lib/report-data';

// ─── Générateur PDF des rapports d'activité — design du reçu de paiement ────
// Même vocabulaire visuel que buildReceiptPDF (design « Institut Gianelli ») :
// double bordure navy/or sur chaque page, en-tête logos + filets or, sections
// en or, lignes pointillées label gris / valeur navy, encadré vert menthe du
// montant, bloc signature/cachet et QR de vérification. Dates en Africa/Lagos
// avec les secondes.

// pdfkit est chargé À L'EXÉCUTION (import dynamique natif, hors bundle) :
// sa build ESM référence 'stream' et casse la compilation webpack si elle
// est résolue statiquement. En Node, require('pdfkit') fonctionne tel quel.
interface PdfKitDoc {
  x: number;
  y: number;
  page: { height: number; margins: { top: number } };
  on(event: string, cb: (arg?: unknown) => void): void;
  rect(x: number, y: number, w: number, h: number): PdfKitDoc;
  roundedRect(x: number, y: number, w: number, h: number, r: number): PdfKitDoc;
  fill(color?: string): PdfKitDoc;
  stroke(color?: string): PdfKitDoc;
  lineWidth(w: number): PdfKitDoc;
  moveTo(x: number, y: number): PdfKitDoc;
  lineTo(x: number, y: number): PdfKitDoc;
  font(name: string, size?: number): PdfKitDoc;
  fontSize(size: number): PdfKitDoc;
  fillColor(color: string): PdfKitDoc;
  strokeColor(color: string): PdfKitDoc;
  image(src: string | Buffer, x?: number, y?: number, opts?: Record<string, unknown>): PdfKitDoc;
  text(
    content: string,
    x?: number | Record<string, unknown>,
    y?: number | Record<string, unknown>,
    opts?: Record<string, unknown>,
  ): PdfKitDoc;
  heightOfString(content: string, opts?: Record<string, unknown>): number;
  moveDown(n?: number): PdfKitDoc;
  addPage(): PdfKitDoc;
  switchToPage(n: number): void;
  bufferedPageRange(): { start: number; count: number };
  end(): void;
}

type PdfKitCtor = new (opts?: Record<string, unknown>) => PdfKitDoc;
let _pdfkitCtor: PdfKitCtor | null = null;

async function loadPdfKit(): Promise<PdfKitCtor> {
  if (_pdfkitCtor) return _pdfkitCtor;
  // webpackIgnore/turbopackIgnore : l'import reste NATIF → résolu par Node
  const mod = (await import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ 'pdfkit' as string
  )) as { default?: PdfKitCtor } & PdfKitCtor;
  _pdfkitCtor = (mod.default || mod) as PdfKitCtor;
  return _pdfkitCtor;
}

const NAVY = '#022448';
const GOLD = '#d4af37';
const GREEN = '#00875a';
const LGREEN = '#e8f5e9';
const MINT = '#c8e6c9';
const GRAY = '#787878';
const LGRAY = '#c8c8c8';
const RED = '#ba1a1a';
const IVORY = '#faf8f2';
const WHITE = '#ffffff';
const DANGER_BG = '#fdecec';

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MM = 2.834645669;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

export interface ReportPdfAssets {
  schoolLogo?: Buffer | null;
  eduGestLogo?: Buffer | null;
  qrDataUrl?: string | null;
}

function periodTitle(days: number): string {
  if (days === 1) return 'RAPPORT QUOTIDIEN';
  if (days === 7) return 'RAPPORT HEBDOMADAIRE';
  return `RAPPORT — ${days} DERNIERS JOURS`;
}

function fmtNum(n: number): string {
  return String(Math.round(n * 100) / 100).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function fmtDay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function truncate(s: string, max = 140): string {
  const clean = (s || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}

function getSchoolInitials(shortName: string): string {
  return (shortName || '')
    .split(/[\s\-_]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 4);
}

export function buildReportPdf(
  data: DetailedReport,
  sealLabel: string,
  assets: ReportPdfAssets = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    void (async () => {
      try {
        const PDFDocument = await loadPdfKit();
        renderReport(PDFDocument, data, sealLabel, assets, resolve, reject);
      } catch (e) {
        reject(e);
      }
    })();
  });
}

function renderReport(
  PDFDocument: PdfKitCtor,
  data: DetailedReport,
  sealLabel: string,
  assets: ReportPdfAssets,
  resolve: (buf: Buffer) => void,
  reject: (err: unknown) => void,
) {
  const doc = new PDFDocument({
      size: 'A4',
      // marge basse volontairement réduite : la zone de pied de page (tamponnée
      // en fin de génération via bufferedPageRange) vit dedans — un texte SOUS
      // la marge relancerait une page → récursion infinie de pdfkit.
      margins: { top: 42, bottom: 20, left: MARGIN, right: MARGIN },
      bufferPages: true,
      info: {
        Title: `${periodTitle(data.period.days)} — ${data.school.name}`,
        Author: 'Look School 360',
        Subject: "Rapport d'activité scolaire",
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: unknown) => chunks.push(c as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const headerTop = 20 * MM;
    const title = periodTitle(data.period.days);
    const schoolName = (data.school.name || '').toUpperCase().slice(0, 30);

    // ── Cadre double navy/or (chaque page, style reçu) ──────────────────────
    const drawFrame = () => {
      doc.lineWidth(1.5 * MM).strokeColor(NAVY)
        .rect(5 * MM, 5 * MM, PAGE_W - 10 * MM, PAGE_H - 10 * MM).stroke();
      doc.lineWidth(0.3 * MM).strokeColor(GOLD)
        .rect(8 * MM, 8 * MM, PAGE_W - 16 * MM, PAGE_H - 16 * MM).stroke();
      doc.lineWidth(1);
    };

    const drawGoldRules = (y: number) => {
      doc.lineWidth(1 * MM).strokeColor(GOLD)
        .moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).stroke();
      doc.lineWidth(0.3 * MM)
        .moveTo(MARGIN, y + 2 * MM).lineTo(PAGE_W - MARGIN, y + 2 * MM).stroke();
      doc.lineWidth(1);
    };

    // ── En-tête page 1 (identique au reçu) ──────────────────────────────────
    const drawFirstPageHeader = () => {
      drawFrame();

      const logoX = MARGIN + 8;
      const logoSize = 22 * MM;
      doc.fillColor(WHITE).rect(logoX, headerTop, logoSize, logoSize).fill();
      doc.lineWidth(1.5 * MM).strokeColor(GOLD)
        .rect(logoX, headerTop, logoSize, logoSize).stroke();
      doc.lineWidth(1);

      let logoDrawn = false;
      if (assets.schoolLogo && assets.schoolLogo.length) {
        try {
          doc.image(assets.schoolLogo, logoX + 4, headerTop + 4, {
            fit: [logoSize - 8, logoSize - 8],
          });
          logoDrawn = true;
        } catch {
          logoDrawn = false;
        }
      }
      if (!logoDrawn) {
        doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12)
          .text(getSchoolInitials(data.school.shortName || data.school.name),
            logoX, headerTop + logoSize / 2 - 7, { width: logoSize, align: 'center', lineBreak: false });
      }

      const nameX = logoX + logoSize + 15;
      doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(18)
        .text(schoolName, nameX, headerTop + 10, { lineBreak: false });

      const address = [data.school.address, data.school.city, data.school.province]
        .filter(Boolean).join(', ');
      if (address) {
        doc.fillColor(GRAY).font('Helvetica').fontSize(8.5)
          .text(address.slice(0, 58), nameX, headerTop + 34, { lineBreak: false });
      }
      const contact = [data.school.phone, data.school.email].filter(Boolean).join('  |  ');
      if (contact) {
        doc.fillColor(GRAY).font('Helvetica').fontSize(8.5)
          .text(contact.slice(0, 58), nameX, headerTop + (address ? 46 : 34), { lineBreak: false });
      }

      if (assets.eduGestLogo && assets.eduGestLogo.length) {
        try {
          doc.image(assets.eduGestLogo, PAGE_W - MARGIN - 24 * MM - 8, headerTop - 6, {
            width: 24 * MM,
            height: 24 * MM,
          });
        } catch {
          doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(11)
            .text('Look School 360', MARGIN, headerTop + 8, { width: CONTENT_W, align: 'right', lineBreak: false });
        }
      } else {
        doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(11)
          .text('Look School 360', MARGIN, headerTop + 8, { width: CONTENT_W, align: 'right', lineBreak: false });
      }

      const ruleY = headerTop + 30 * MM;
      drawGoldRules(ruleY);

      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(16)
        .text(title, MARGIN, ruleY + 16, { width: CONTENT_W, align: 'center', lineBreak: false });
      doc.fillColor(GRAY).font('Helvetica').fontSize(9)
        .text(
          `Période : du ${fmtDay(data.period.from)} au ${fmtDay(data.period.to)} (${data.period.days} jour${data.period.days > 1 ? 's' : ''})`,
          MARGIN, ruleY + 34, { width: CONTENT_W, align: 'center', lineBreak: false },
        )
        .text(
          `Généré le ${fmtLagosDateTime(data.generatedAtISO)} (heure locale)`,
          MARGIN, ruleY + 46, { width: CONTENT_W, align: 'center', lineBreak: false },
        );
    };

    // ── Mini-en-tête des pages suivantes ────────────────────────────────────
    const drawContinuationHeader = () => {
      drawFrame();
      doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(10)
        .text(schoolName, MARGIN + 2, headerTop + 6, { width: CONTENT_W / 2, lineBreak: false });
      doc.fillColor(GRAY).font('Helvetica').fontSize(8)
        .text(title, MARGIN, headerTop + 8, { width: CONTENT_W, align: 'right', lineBreak: false });
      const ruleY = headerTop + 20;
      drawGoldRules(ruleY);
      doc.x = MARGIN;
      doc.y = ruleY + 16;
    };

    drawFirstPageHeader();
    doc.x = MARGIN;
    doc.y = 210;

    const newPage = () => {
      doc.addPage();
      drawContinuationHeader();
    };

    const ensureSpace = (needed: number) => {
      if (doc.y + needed > doc.page.height - 60) newPage();
    };

    const drawDottedLine = (x1: number, y: number, x2: number) => {
      const step = 2.5;
      const count = Math.floor((x2 - x1) / step);
      doc.lineWidth(0.6).strokeColor(LGRAY);
      for (let i = 0; i < count; i += 2) {
        const sx = x1 + i * step;
        const ex = Math.min(sx + step * 0.6, x2);
        doc.moveTo(sx, y).lineTo(ex, y);
      }
      doc.stroke();
      doc.lineWidth(1);
    };

    // ── Titre de section (or gras, comme « INFORMATIONS ELEVE ») ────────────
    const sectionTitle = (label: string) => {
      ensureSpace(50);
      const y = doc.y + 8;
      doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(10)
        .text(label, MARGIN + 2, y, { characterSpacing: 0.8, lineBreak: false });
      drawDottedLine(MARGIN, y + 17, MARGIN + CONTENT_W);
      doc.x = MARGIN;
      doc.y = y + 23;
    };

    // ── Ligne label gris / valeur navy séparée par un pointillé ─────────────
    const infoRow = (label: string, value: string) => {
      ensureSpace(26);
      const y = doc.y;
      drawDottedLine(MARGIN, y, MARGIN + CONTENT_W);
      doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(9)
        .text(label, MARGIN + 4, y + 4, { width: 160, lineBreak: false });
      const valueW = CONTENT_W - 174;
      const vh = doc.font('Helvetica').fontSize(9.5).heightOfString(value, { width: valueW });
      doc.fillColor(NAVY).fontSize(9.5)
        .text(value, MARGIN + 170, y + 4, { width: valueW, align: 'right' });
      doc.x = MARGIN;
      doc.y = y + Math.max(16, vh + 8);
    };

    // ── Colonnes de chiffres entre deux filets navy (« SITUATION FINANCIERE ») ─
    const statColumns = (items: { label: string; value: string; color?: string }[]) => {
      ensureSpace(64);
      const y0 = doc.y + 6;
      doc.lineWidth(1.4).strokeColor(NAVY)
        .moveTo(MARGIN, y0).lineTo(MARGIN + CONTENT_W, y0).stroke();
      doc.lineWidth(1);
      const colW = CONTENT_W / items.length;
      items.forEach((it, i) => {
        const x = MARGIN + colW * i;
        doc.fillColor(GRAY).font('Helvetica').fontSize(8)
          .text(it.label.toUpperCase(), x, y0 + 10, { width: colW, align: 'center', lineBreak: false });
        doc.fillColor(it.color || NAVY).font('Helvetica-Bold').fontSize(13)
          .text(it.value, x, y0 + 28, { width: colW, align: 'center', lineBreak: false });
      });
      doc.lineWidth(1.4).strokeColor(NAVY)
        .moveTo(MARGIN, y0 + 46).lineTo(MARGIN + CONTENT_W, y0 + 46).stroke();
      doc.lineWidth(1);
      doc.x = MARGIN;
      doc.y = y0 + 54;
    };

    // ── Encadré vert menthe (« MONTANT PAYE ») ───────────────────────────────
    const mintBox = (label: string, value: string) => {
      const boxH = 28 * MM;
      ensureSpace(boxH + 20);
      const y = doc.y + 8;
      const bx = MARGIN + 6;
      const bw = CONTENT_W - 12;
      doc.fillColor(LGREEN).rect(bx, y, bw, boxH).fill();
      doc.lineWidth(0.8 * MM).strokeColor(MINT).rect(bx, y, bw, boxH).stroke();
      doc.lineWidth(1);
      doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(9)
        .text(label, bx, y + 14, { width: bw, align: 'center', lineBreak: false });
      doc.fontSize(26)
        .text(value, bx, y + 30, { width: bw, align: 'center', lineBreak: false });
      doc.x = MARGIN;
      doc.y = y + boxH + 8;
    };

    interface Col { header: string; width: number; align?: 'left' | 'right' | 'center' }
    const drawTable = (cols: Col[], rows: string[][], opts?: { dangerRow?: (r: string[]) => boolean }) => {
      if (!rows.length) return;
      const totalW = cols.reduce((s, c) => s + c.width, 0);
      const scale = CONTENT_W / totalW;
      const nCols = cols.map((c) => ({ ...c, width: c.width * scale }));
      const rowPad = 4;
      const fontH = 8;
      const rowHeights = rows.map((r) => {
        let h = 0;
        nCols.forEach((c, i) => {
          const th = doc.font('Helvetica').fontSize(fontH).heightOfString(r[i] || '', { width: c.width - 8 });
          h = Math.max(h, th);
        });
        return h + rowPad * 2;
      });
      const headH = 18;
      const pageBottom = doc.page.height - 60;

      const drawHead = () => {
        const hy = doc.y;
        doc.fillColor(NAVY).rect(MARGIN, hy, CONTENT_W, headH).fill();
        let x = MARGIN;
        nCols.forEach((c) => {
          doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(7.5)
            .text(c.header.toUpperCase(), x + 4, hy + 5, {
              width: c.width - 8, align: c.align || 'left', characterSpacing: 0.4, lineBreak: false,
            });
          x += c.width;
        });
        doc.y = hy + headH;
        doc.x = MARGIN;
      };

      let i = 0;
      while (i < rows.length) {
        if (doc.y + headH > pageBottom) newPage();
        const tableTopY = doc.y;
        drawHead();
        let j = i;
        let batchH = 0;
        while (j < rows.length && batchH + rowHeights[j] <= pageBottom - doc.y) {
          batchH += rowHeights[j];
          j++;
        }
        if (j === i) {
          if (doc.y >= pageBottom) {
            newPage();
            continue;
          }
          j = i + 1;
        }
        let y = doc.y;
        for (let k = i; k < j; k++) {
          const isDanger = opts?.dangerRow?.(rows[k]);
          if (k % 2 === 1 || isDanger) {
            doc.rect(MARGIN, y, CONTENT_W, rowHeights[k]).fill(isDanger ? DANGER_BG : IVORY);
          }
          y += rowHeights[k];
        }
        y = doc.y;
        for (let k = i; k < j; k++) {
          let x = MARGIN;
          const isDanger = opts?.dangerRow?.(rows[k]);
          nCols.forEach((c, ci) => {
            doc.fillColor(isDanger ? RED : NAVY).font('Helvetica').fontSize(fontH)
              .text(rows[k][ci] || '', x + 4, y + rowPad, { width: c.width - 8, align: c.align || 'left' });
            x += c.width;
          });
          y += rowHeights[k];
        }
        doc.lineWidth(0.6).strokeColor(LGRAY)
          .rect(MARGIN, tableTopY, CONTENT_W, y - tableTopY).stroke();
        doc.lineWidth(1);
        doc.x = MARGIN;
        doc.y = y;
        i = j;
        if (i < rows.length) newPage();
      }
      doc.y += 8;
      doc.x = MARGIN;
    };

    // ═══ 1. EFFECTIFS ═══════════════════════════════════════════════════════
    sectionTitle('EFFECTIFS');
    statColumns([
      { label: 'Élèves actifs', value: fmtNum(data.students.total), color: NAVY },
      { label: 'Classes', value: fmtNum(data.students.classesCount), color: GREEN },
      { label: 'Professeurs', value: fmtNum(data.students.teachers), color: GOLD },
    ]);
    if (data.students.byClass.length) {
      infoRow(
        'RÉPARTITION',
        data.students.byClass.slice(0, 8).map((c) => `${c.className} (${c.count})`).join(' · '),
      );
    }

    // ═══ 2. PAIEMENTS ═══════════════════════════════════════════════════════
    sectionTitle('PAIEMENTS DE LA PÉRIODE');
    mintBox(
      `TOTAL ENCAISSÉ (${data.currencySymbol})`,
      `${fmtNum(data.payments.collected)} ${data.currencySymbol}`,
    );
    statColumns([
      { label: 'Transactions', value: fmtNum(data.payments.transactions), color: NAVY },
      { label: `Total attendu (${data.currencySymbol})`, value: fmtNum(data.payments.expected), color: GREEN },
      { label: 'Impayés actuels', value: fmtNum(data.payments.unpaid), color: RED },
    ]);
    if (data.payments.list.length) {
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9)
        .text('Élèves ayant payé — horodatage à la seconde et référence du reçu :', { width: CONTENT_W });
      doc.moveDown(0.3);
      drawTable(
        [
          { header: 'Élève', width: 118 },
          { header: 'Classe', width: 62 },
          { header: 'Montant', width: 62, align: 'right' },
          { header: 'Payé le (heure locale)', width: 118 },
          { header: 'Reçu', width: 75 },
          { header: 'Mode', width: 58 },
        ],
        data.payments.list.map((p) => [
          truncate(p.student, 28),
          truncate(p.className, 14),
          `${fmtNum(p.amount)} ${data.currencySymbol}`,
          fmtLagosDateTime(p.paidAtISO),
          truncate(p.receipt, 16),
          truncate(p.method, 12),
        ]),
      );
      if (data.payments.list.length >= 150) {
        doc.fillColor(GRAY).font('Helvetica').fontSize(7.5)
          .text('(liste limitée aux 150 derniers paiements de la période)', { width: CONTENT_W });
      }
    }

    // ═══ 3. COMMUNICATIONS ══════════════════════════════════════════════════
    sectionTitle('COMMUNICATIONS ENVOYÉES');
    if (data.communications.list.length) {
      drawTable(
        [
          { header: 'Sujet', width: 300 },
          { header: 'Type', width: 90 },
          { header: 'Envoyée le', width: 147 },
        ],
        data.communications.list.map((c) => [
          truncate(c.title, 60),
          truncate(c.type, 16),
          fmtLagosDateTime(c.sentAtISO),
        ]),
      );
    } else {
      doc.fillColor(GRAY).font('Helvetica').fontSize(9)
        .text('Aucune communication envoyée sur la période.', { width: CONTENT_W });
    }

    // ═══ 4. DISCIPLINE ══════════════════════════════════════════════════════
    sectionTitle('DISCIPLINE DE LA PÉRIODE');
    statColumns([
      { label: 'Incidents / sanctions', value: fmtNum(data.discipline.incidents), color: RED },
      { label: 'Points positifs', value: fmtNum(data.discipline.positives), color: GREEN },
      { label: 'Convocations', value: fmtNum(data.discipline.convocations), color: GOLD },
    ]);

    if (data.discipline.incidentsList.length) {
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9)
        .text('Incidents et sanctions — élèves, sanction, description et points :', { width: CONTENT_W });
      doc.moveDown(0.3);
      drawTable(
        [
          { header: 'Élève', width: 108 },
          { header: 'Classe', width: 55 },
          { header: 'Sanction', width: 105 },
          { header: 'Description', width: 190 },
          { header: 'Pts', width: 30, align: 'right' },
          { header: 'Date', width: 49 },
        ],
        data.discipline.incidentsList.map((r) => [
          truncate(r.student, 26), truncate(r.className, 12), truncate(r.sanction, 22),
          truncate(r.description || '—', 90),
          String(r.points),
          fmtLagosDateTime(r.createdAtISO).slice(0, 11),
        ]),
        { dangerRow: () => true },
      );
    } else {
      doc.fillColor(GRAY).font('Helvetica').fontSize(9)
        .text('Aucun incident ni sanction sur la période.', { width: CONTENT_W });
      doc.moveDown(0.4);
    }

    if (data.discipline.positivesList.length) {
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9)
        .text('Points positifs — élèves récompensés, nombre de points et raison :', { width: CONTENT_W });
      doc.moveDown(0.3);
      drawTable(
        [
          { header: 'Élève', width: 120 },
          { header: 'Classe', width: 60 },
          { header: 'Points', width: 45, align: 'right' },
          { header: 'Raison', width: 235 },
          { header: 'Date', width: 72 },
        ],
        data.discipline.positivesList.map((r) => [
          truncate(r.student, 28), truncate(r.className, 13), `+${r.points}`,
          truncate(r.reason || '—', 62), fmtLagosDateTime(r.createdAtISO).slice(0, 11),
        ]),
      );
    } else {
      doc.fillColor(GRAY).font('Helvetica').fontSize(9)
        .text('Aucun point positif distribué sur la période.', { width: CONTENT_W });
      doc.moveDown(0.4);
    }

    if (data.discipline.convocationsList.length) {
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9)
        .text('Convocations — élèves, motif et statut :', { width: CONTENT_W });
      doc.moveDown(0.3);
      drawTable(
        [
          { header: 'Élève', width: 130 },
          { header: 'Classe', width: 60 },
          { header: 'Motif', width: 200 },
          { header: 'Date', width: 90 },
          { header: 'Statut', width: 52 },
        ],
        data.discipline.convocationsList.map((r) => [
          truncate(r.student, 30), truncate(r.className, 13), truncate(r.motif, 48),
          fmtLagosDateTime(r.dateISO).slice(0, 11), truncate(r.status, 11),
        ]),
      );
    } else {
      doc.fillColor(GRAY).font('Helvetica').fontSize(9)
        .text('Aucune convocation sur la période.', { width: CONTENT_W });
      doc.moveDown(0.4);
    }

    // ═══ 5. PRÉSENCES ═══════════════════════════════════════════════════════
    sectionTitle('PRÉSENCES DE LA PÉRIODE');
    statColumns([
      { label: 'Taux de présence', value: data.attendance.rate !== null ? `${data.attendance.rate}%` : '—', color: GREEN },
      { label: 'Présents', value: fmtNum(data.attendance.present), color: GREEN },
      { label: 'Absents', value: fmtNum(data.attendance.absent), color: RED },
      { label: 'Retards', value: fmtNum(data.attendance.late), color: GOLD },
    ]);
    const absents = data.attendanceByStudent.filter((s) => s.absentDays > 0);
    const lates = data.attendanceByStudent.filter((s) => s.lateDays > 0);
    if (absents.length || lates.length) {
      drawTable(
        [
          { header: 'Élève', width: 150 },
          { header: 'Classe', width: 70 },
          { header: 'Absences', width: 160 },
          { header: 'Retards', width: 152 },
        ],
        data.attendanceByStudent.map((s) => [
          truncate(s.student, 34),
          truncate(s.className, 15),
          s.absentDays > 0 ? `${s.absentDays} jour${s.absentDays > 1 ? 's' : ''} d'absence` : '—',
          s.lateDays > 0 ? `${s.lateDays} jour${s.lateDays > 1 ? 's' : ''} de retard` : '—',
        ]),
        { dangerRow: (r) => r[2] !== '—' && parseInt(r[2], 10) >= 2 },
      );
      doc.fillColor(GRAY).fontSize(7.5)
        .text("Les absences de 2 jours et plus sur la période sont signalées en rouge.", { width: CONTENT_W });
    } else {
      doc.fillColor(GRAY).font('Helvetica').fontSize(9)
        .text('Aucune absence ni retard enregistré sur la période.', { width: CONTENT_W });
      doc.moveDown(0.4);
    }

    // ═══ 6. CLASSEMENTS ═════════════════════════════════════════════════════
    sectionTitle('CLASSEMENT DES CLASSES — PRÉSENCE · NOTES · DISCIPLINE');
    if (data.classRanking.top.length) {
      const all = [...data.classRanking.top, ...(data.classRanking.worst ? [data.classRanking.worst] : [])];
      const worstName = data.classRanking.worst?.className;
      drawTable(
        [
          { header: 'Classe', width: 130 },
          { header: 'Élèves', width: 50, align: 'right' },
          { header: 'Présence', width: 70, align: 'right' },
          { header: 'Notes', width: 70, align: 'right' },
          { header: 'Discipline', width: 75, align: 'right' },
          { header: 'Score /100', width: 142, align: 'right' },
        ],
        all.map((c) => [
          c.className + (c.className === worstName ? '  (à soutenir)' : ''),
          String(c.studentsCount),
          c.presenceRate !== null ? `${c.presenceRate}%` : '—',
          c.gradeAvgPct !== null ? `${c.gradeAvgPct}%` : '—',
          `${c.disciplineScore}%`,
          `${c.score}`,
        ]),
      );
    } else {
      doc.fillColor(GRAY).font('Helvetica').fontSize(9)
        .text('Pas assez de données pour classer les classes sur la période.', { width: CONTENT_W });
      doc.moveDown(0.4);
    }

    sectionTitle("CLASSEMENT DES ÉLÈVES — % ESTIMÉ (NOTES) ET CONDUITE (DISCIPLINE)");
    if (data.studentRanking.top.length) {
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9)
        .text('Les 3 élèves qui excellent :', { width: CONTENT_W });
      doc.moveDown(0.3);
      drawTable(
        [
          { header: 'Élève', width: 145 },
          { header: 'Classe', width: 70 },
          { header: '% estimé', width: 70, align: 'right' },
          { header: 'Présence', width: 70, align: 'right' },
          { header: 'Conduite', width: 90 },
          { header: 'Pts disc.', width: 92, align: 'right' },
        ],
        data.studentRanking.top.map((s) => [
          truncate(s.student, 32), truncate(s.className, 15),
          s.gradePct !== null ? `${s.gradePct}%` : '—',
          s.presenceRate !== null ? `${s.presenceRate}%` : '—',
          `${s.conductLabel} (${s.conductScore})`,
          `+${s.positivePoints} / -${s.negativePoints}`,
        ]),
      );
    }
    if (data.studentRanking.bottom.length) {
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(9)
        .text('Les 3 élèves en difficulté — à suivre de près :', { width: CONTENT_W });
      doc.moveDown(0.3);
      drawTable(
        [
          { header: 'Élève', width: 145 },
          { header: 'Classe', width: 70 },
          { header: '% estimé', width: 70, align: 'right' },
          { header: 'Présence', width: 70, align: 'right' },
          { header: 'Conduite', width: 90 },
          { header: 'Pts disc.', width: 92, align: 'right' },
        ],
        data.studentRanking.bottom.map((s) => [
          truncate(s.student, 32), truncate(s.className, 15),
          s.gradePct !== null ? `${s.gradePct}%` : '—',
          s.presenceRate !== null ? `${s.presenceRate}%` : '—',
          `${s.conductLabel} (${s.conductScore})`,
          `+${s.positivePoints} / -${s.negativePoints}`,
        ]),
        { dangerRow: (r) => r[4].startsWith('Préoccupant') },
      );
    }
    if (!data.studentRanking.top.length && !data.studentRanking.bottom.length) {
      doc.fillColor(GRAY).font('Helvetica').fontSize(9)
        .text('Pas assez de données pour classer les élèves sur la période.', { width: CONTENT_W });
      doc.moveDown(0.4);
    }

    // ── Bloc scellé + QR (comme le reçu) ────────────────────────────────────
    ensureSpace(150);
    const sigY = doc.y + 12;
    doc.lineWidth(1.4).strokeColor(GOLD)
      .moveTo(MARGIN, sigY).lineTo(MARGIN + CONTENT_W, sigY).stroke();
    doc.lineWidth(1);
    doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(8)
      .text(`Rapport scellé sur le rôle : ${sealLabel}`, MARGIN + 4, sigY + 8, { lineBreak: false });

    const qrY = sigY + 26;
    if (assets.qrDataUrl) {
      try {
        doc.image(assets.qrDataUrl, PAGE_W / 2 - 10 * MM, qrY, { width: 20 * MM, height: 20 * MM });
      } catch { /* QR ignoré */ }
      doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(7)
        .text('VERIFICATION', MARGIN, qrY + 59, { width: CONTENT_W, align: 'center', lineBreak: false });
      doc.fillColor(LGRAY).font('Helvetica').fontSize(6.5)
        .text("Pour vérifier l'authenticité de ce rapport, scannez le QR code",
          MARGIN, qrY + 70, { width: CONTENT_W, align: 'center', lineBreak: false });
    }
    doc.fillColor(GRAY).font('Helvetica-Oblique').fontSize(7)
      .text("Document confidentiel — destiné à la direction de l'établissement.",
        MARGIN, qrY + 84, { width: CONTENT_W, align: 'center', lineBreak: false });
    doc.x = MARGIN;
    doc.y = qrY + 96;

    const range = doc.bufferedPageRange();
    const footerY = PAGE_H - 25 * MM;

    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.lineWidth(0.8 * MM).strokeColor(GOLD)
        .moveTo(MARGIN, footerY).lineTo(PAGE_W - MARGIN, footerY).stroke();
      doc.lineWidth(1);
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(8)
        .text((data.school.name || '').slice(0, 48), MARGIN, footerY + 8,
          { width: CONTENT_W, align: 'center', lineBreak: false });
      doc.fillColor(GRAY).font('Helvetica').fontSize(7)
        .text('Généré par Look School 360 - La plateforme de gestion scolaire', MARGIN, footerY + 19,
          { width: CONTENT_W, align: 'center', lineBreak: false });
      doc.fillColor(LGRAY).font('Helvetica-Oblique').fontSize(6.5)
        .text(
          `Document généré le ${fmtLagosDateTime(data.generatedAtISO)} — Page ${i + 1}/${range.count}`,
          MARGIN, footerY + 29, { width: CONTENT_W, align: 'center', lineBreak: false },
        );
    }

    doc.end();
}
