import type { CashierReport } from '@/lib/cashier-report';

// ─── Générateur PDF du rapport de CAISSE — design du reçu de paiement ───────
// Même vocabulaire visuel que buildReportPdf (double bordure navy/or, en-tête
// logos + filets or, sections en or, lignes pointillées label gris / valeur
// navy, encadré vert menthe du montant, bloc signature et pied de page or) —
// contenu limité à la caisse : paiements de l'intervalle (décompte horaire),
// dettes et classement des cas graves ↔ moindres.

// pdfkit est chargé À L'EXÉCUTION (import dynamique natif, hors bundle) :
// sa build ESM référence 'stream' et casse la compilation webpack/turbopack
// si elle est résolue statiquement. En Node, require('pdfkit') fonctionne.
interface PdfKitDoc {
  x: number;
  y: number;
  page: { height: number; margins: { top: number } };
  on(event: string, cb: (arg?: unknown) => void): void;
  rect(x: number, y: number, w: number, h: number): PdfKitDoc;
  roundedRect(x: number, y: number, w: number, h: number, r: number): PdfKitDoc;
  fill(color?: string): PdfKitDoc;
  stroke(): PdfKitDoc;
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

function fmtNum(n: number): string {
  return String(Math.round(n * 100) / 100).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function fmtDay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function fmtHourLagos(iso: string | null): string {
  if (!iso) return '—';
  try {
    const lagos = new Date(new Date(iso).getTime() + 3_600_000);
    const p = (v: number) => String(v).padStart(2, '0');
    return `${p(lagos.getUTCDate())}/${p(lagos.getUTCMonth() + 1)} ${p(lagos.getUTCHours())}:${p(lagos.getUTCMinutes())}:${p(lagos.getUTCSeconds())}`;
  } catch {
    return '—';
  }
}

function truncate(s: string, max = 40): string {
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

/** « Rapport de caisse » — titre selon la fréquence. */
function periodTitle(days: number): string {
  const freq = days === 1 ? 'QUOTIDIEN' : days === 7 ? 'HEBDOMADAIRE' : `TOUS LES ${days} JOURS`;
  return `RAPPORT DE CAISSE — ${freq}`;
}

export function buildCashierReportPdf(data: CashierReport, sealLabel: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    void (async () => {
      try {
        const PDFDocument = await loadPdfKit();
        renderCashierReport(PDFDocument, data, sealLabel, resolve, reject);
      } catch (e) {
        reject(e);
      }
    })();
  });
}

function renderCashierReport(
  PDFDocument: PdfKitCtor,
  data: CashierReport,
  sealLabel: string,
  resolve: (buf: Buffer) => void,
  reject: (err: unknown) => void,
) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 42, bottom: 20, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: {
      Title: `${periodTitle(data.schedule.intervalDays)} — ${data.school.name}`,
      Author: 'Look School 360',
      Subject: 'Rapport de caisse',
    },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: unknown) => chunks.push(c as Buffer));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);

  const headerTop = 20 * MM;
  const title = periodTitle(data.schedule.intervalDays);
  const schoolName = (data.school.name || '').toUpperCase().slice(0, 30);
  const hhmm = `${String(data.schedule.hour).padStart(2, '0')}:${String(data.schedule.minute).padStart(2, '0')}`;

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

  // ── En-tête page 1 ──────────────────────────────────────────────────────
  const drawFirstPageHeader = () => {
    drawFrame();

    const logoX = MARGIN + 8;
    const logoSize = 22 * MM;
    doc.fillColor(WHITE).rect(logoX, headerTop, logoSize, logoSize).fill();
    doc.lineWidth(1.5 * MM).strokeColor(GOLD)
      .rect(logoX, headerTop, logoSize, logoSize).stroke();
    doc.lineWidth(1);

    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12)
      .text(getSchoolInitials(data.school.shortName || data.school.name),
        logoX, headerTop + logoSize / 2 - 7, { width: logoSize, align: 'center', lineBreak: false });

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

    doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(11)
      .text('Look School 360', MARGIN, headerTop + 8, { width: CONTENT_W, align: 'right', lineBreak: false });

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
        `Envoi programmé tous les ${data.period.days} jours à ${hhmm} — paiements pris en compte jusqu’au ${data.cutoff.dateLabel} ${data.cutoff.timeLabel} (heure locale)`,
        MARGIN, ruleY + 46, { width: CONTENT_W, align: 'center', lineBreak: false },
      );
  };

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
  doc.y = 216;

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

  // ── Titre de section (or gras) ──────────────────────────────────────────
  const sectionTitle = (label: string) => {
    ensureSpace(50);
    const y = doc.y + 8;
    doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(10)
      .text(label, MARGIN + 2, y, { characterSpacing: 0.8, lineBreak: false });
    drawDottedLine(MARGIN, y + 17, MARGIN + CONTENT_W);
    doc.x = MARGIN;
    doc.y = y + 23;
  };

  // ── Ligne label gris / valeur navy ──────────────────────────────────────
  const infoRow = (label: string, value: string) => {
    ensureSpace(26);
    const y = doc.y;
    drawDottedLine(MARGIN, y, MARGIN + CONTENT_W);
    doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(9)
      .text(label, MARGIN + 4, y + 4, { width: 180, lineBreak: false });
    const valueW = CONTENT_W - 194;
    const vh = doc.font('Helvetica').fontSize(9.5).heightOfString(value, { width: valueW });
    doc.fillColor(NAVY).fontSize(9.5)
      .text(value, MARGIN + 190, y + 4, { width: valueW, align: 'right' });
    doc.x = MARGIN;
    doc.y = y + Math.max(16, vh + 8);
  };

  // ── Colonnes de chiffres entre deux filets navy ─────────────────────────
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

  // ── Encadré vert menthe (« MONTANT ENCAISSÉ ») ──────────────────────────
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

  // ═══ 1. SYNTHÈSE DE LA CAISSE ══════════════════════════════════════════
  sectionTitle('SYNTHÈSE DE LA CAISSE');
  mintBox(
    `TOTAL ENCAISSÉ (${data.currencySymbol})`,
    `${fmtNum(data.payments.collected)} ${data.currencySymbol}`,
  );
  statColumns([
    { label: 'Payeurs', value: fmtNum(data.payments.payers), color: NAVY },
    { label: 'Paiements reçus', value: fmtNum(data.payments.transactions), color: GREEN },
    { label: `Dettes à courir (${data.currencySymbol})`, value: fmtNum(data.debts.total), color: RED },
  ]);
  infoRow('COUPURE', `Paiements jusqu’au ${data.cutoff.dateLabel} ${data.cutoff.timeLabel} (envoi à ${hhmm})`);
  infoRow('ÉLÈVES ENDETTEINTS', `${fmtNum(data.debts.count)} élève${data.debts.count > 1 ? 's' : ''}`);

  // ═══ 2. PAIEMENTS SELON L'HEURE ════════════════════════════════════════
  sectionTitle('PAIEMENTS SELON L’HEURE (HEURE LOCALE)');
  if (data.payments.byHour.length) {
    drawTable(
      [
        { header: 'Tranche', width: 90 },
        { header: 'Paiements', width: 90, align: 'right' },
        { header: `Encaissé (${data.currencySymbol})`, width: 130, align: 'right' },
      ],
      data.payments.byHour.map((h) => [
        `${String(h.hour).padStart(2, '0')}h–${String((h.hour + 1) % 24).padStart(2, '0')}h`,
        fmtNum(h.count),
        fmtNum(h.total),
      ]),
    );
  } else {
    doc.fillColor(GRAY).font('Helvetica').fontSize(9)
      .text('Aucun paiement reçu sur l’intervalle.', { width: CONTENT_W });
    doc.moveDown(0.4);
  }

  // ═══ 3. DÉTAIL DES PAIEMENTS ═══════════════════════════════════════════
  sectionTitle('DÉTAIL DES PAIEMENTS REÇUS (JUSQU’À LA COUPURE)');
  if (data.payments.list.length) {
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
        fmtHourLagos(p.paidAtISO),
        truncate(p.receipt, 16),
        truncate(p.method, 12),
      ]),
    );
    if (data.payments.list.length >= 1000) {
      doc.fillColor(GRAY).font('Helvetica').fontSize(7.5)
        .text('(liste limitée aux 1000 paiements les plus récents)', { width: CONTENT_W });
    }
  } else {
    doc.fillColor(GRAY).font('Helvetica').fontSize(9)
      .text('Aucun paiement enregistré sur l’intervalle.', { width: CONTENT_W });
    doc.moveDown(0.4);
  }

  // ═══ 4. DETTES — CAS LES PLUS GRAVES ═══════════════════════════════════
  sectionTitle('DETTES — CAS LES PLUS GRAVES');
  if (data.debts.worst.length) {
    drawTable(
      [
        { header: 'Élève', width: 150 },
        { header: 'Classe', width: 75 },
        { header: `Attendu (${data.currencySymbol})`, width: 90, align: 'right' },
        { header: `Payé (${data.currencySymbol})`, width: 85, align: 'right' },
        { header: `Reste dû (${data.currencySymbol})`, width: 102, align: 'right' },
      ],
      data.debts.worst.map((w) => [
        truncate(w.student, 32), truncate(w.className, 16),
        fmtNum(w.expected), fmtNum(w.paid), fmtNum(w.remaining),
      ]),
      { dangerRow: () => true },
    );
  } else {
    doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(9)
      .text('Aucune dette en cours — tous les élèves sont à jour.', { width: CONTENT_W });
    doc.moveDown(0.4);
  }

  // ═══ 5. DETTES — CAS LES MOINDRES ══════════════════════════════════════
  sectionTitle('DETTES — CAS LES MOINDRES');
  if (data.debts.least.length) {
    drawTable(
      [
        { header: 'Élève', width: 150 },
        { header: 'Classe', width: 75 },
        { header: `Attendu (${data.currencySymbol})`, width: 90, align: 'right' },
        { header: `Payé (${data.currencySymbol})`, width: 85, align: 'right' },
        { header: `Reste dû (${data.currencySymbol})`, width: 102, align: 'right' },
      ],
      data.debts.least.map((l) => [
        truncate(l.student, 32), truncate(l.className, 16),
        fmtNum(l.expected), fmtNum(l.paid), fmtNum(l.remaining),
      ]),
    );
  } else {
    doc.fillColor(GRAY).font('Helvetica').fontSize(9)
      .text(data.debts.count > 0
        ? 'Moins de 5 débiteurs — tous figurent déjà dans les cas graves.'
        : 'Aucune dette en cours.', { width: CONTENT_W });
    doc.moveDown(0.4);
  }

  // ── Bloc scellé ─────────────────────────────────────────────────────────
  ensureSpace(90);
  const sigY = doc.y + 12;
  doc.lineWidth(1.4).strokeColor(GOLD)
    .moveTo(MARGIN, sigY).lineTo(MARGIN + CONTENT_W, sigY).stroke();
  doc.lineWidth(1);
  doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(8)
    .text(`Rapport de caisse scellé sur le rôle : ${sealLabel}`, MARGIN + 4, sigY + 8, { lineBreak: false });
  doc.fillColor(GRAY).font('Helvetica-Oblique').fontSize(7)
    .text("Document confidentiel — destiné à la caisse et à la direction de l'établissement.",
      MARGIN, sigY + 24, { width: CONTENT_W, align: 'center', lineBreak: false });
  doc.x = MARGIN;
  doc.y = sigY + 38;

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
        `Rapport de caisse — Page ${i + 1}/${range.count}`,
        MARGIN, footerY + 29, { width: CONTENT_W, align: 'center', lineBreak: false },
      );
  }

  doc.end();
}
