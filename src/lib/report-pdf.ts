import type { DetailedReport } from '@/lib/report-data';
import { fmtLagosDateTime } from '@/lib/report-data';

// ─── Générateur PDF « design EduGest » pour les rapports d'activité ─────────
// Palette et typographie alignées sur l'app : bandeau vert-noir profond,
// accents or #f5a623, fonds ivoire, tableaux à en-têtes verts.
// Toutes les dates/heure sont rendues en Africa/Lagos AVEC les secondes.

// pdfkit est chargé À L'EXÉCUTION (import dynamique natif, hors bundle) :
// sa build ESM référence 'stream' et casse la compilation webpack si elle
// est résolue statiquement. En Node, require('pdfkit') fonctionne tel quel.
interface PdfKitDoc {
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
  text(
    content: string,
    x?: number,
    y?: number,
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

const INK = '#0a0f0d';        // vert-noir (bandeau)
const GOLD = '#f5a623';       // or signature
const GOLD_DARK = '#c47d0e';
const IVORY = '#faf8f2';      // fond lignes alternées
const TEXT = '#1c2520';
const MUTED = '#6b7a72';
const GREEN = '#2f9e63';
const DANGER = '#b91c1c';
const BORDER = '#e3ded2';

const PAGE_W = 595.28; // A4
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

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

export function buildReportPdf(data: DetailedReport, sealLabel: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    void (async () => {
      try {
        const PDFDocument = await loadPdfKit();
        renderReport(PDFDocument, data, sealLabel, resolve, reject);
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
  resolve: (buf: Buffer) => void,
  reject: (err: unknown) => void,
) {
  const doc = new PDFDocument({
      size: 'A4',
      // marge basse volontairement réduite : la zone de pied de page (tamponnée
      // en fin de génération via bufferedPageRange) vit dedans — un tampon SOUS
      // la marge relancerait une page → récursion infinie de pdfkit.
      margins: { top: 42, bottom: 20, left: MARGIN, right: MARGIN },
      bufferPages: true,
      info: {
        Title: `${periodTitle(data.period.days)} — ${data.school.name}`,
        Author: 'EduGest',
        Subject: "Rapport d'activité scolaire",
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ── Bandeau d'en-tête ───────────────────────────────────────────────────
    doc.rect(0, 0, PAGE_W, 118).fill(INK);
    doc.rect(0, 0, 6, 118).fill(GOLD);
    doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(9)
      .text('E D U G E S T   ·   R A P P O R T   D \' A C T I V I T É', MARGIN, 24);
    doc.fillColor('#ffffff').fontSize(21)
      .text(periodTitle(data.period.days), MARGIN, 40);
    doc.fillColor(GOLD).fontSize(12).font('Helvetica-Bold')
      .text(data.school.name, MARGIN, 70);
    doc.fillColor('#c9d2cc').fontSize(9).font('Helvetica')
      .text(
        `Période : ${fmtDay(data.period.from)} au ${fmtDay(data.period.to)} (${data.period.days} jour${data.period.days > 1 ? 's' : ''})`,
        MARGIN, 88,
      )
      .text(`Généré le ${fmtLagosDateTime(data.generatedAtISO)} (heure locale)`, MARGIN, 101);
    doc.y = 138;

    const ensureSpace = (needed: number) => {
      if (doc.y + needed > doc.page.height - 60) doc.addPage();
    };

    const sectionTitle = (label: string) => {
      ensureSpace(50);
      doc.moveDown(0.6);
      const y = doc.y;
      doc.rect(MARGIN, y + 1, 3.5, 12).fill(GOLD);
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(11.5)
        .text(label, MARGIN + 10, y, { characterSpacing: 0.6 });
      doc.moveTo(MARGIN, y + 18).lineTo(MARGIN + CONTENT_W, y + 18)
        .lineWidth(0.7).strokeColor(BORDER).stroke();
      doc.y = y + 24;
    };

    const statChips = (items: { label: string; value: string; color?: string }[]) => {
      const chipW = (CONTENT_W - (items.length - 1) * 8) / items.length;
      const chipH = 40;
      ensureSpace(chipH + 12);
      const y = doc.y;
      items.forEach((it, i) => {
        const x = MARGIN + i * (chipW + 8);
        doc.roundedRect(x, y, chipW, chipH, 6).fill(IVORY);
        doc.fillColor(it.color || INK).font('Helvetica-Bold').fontSize(13)
          .text(it.value, x + 8, y + 6, { width: chipW - 16 });
        doc.fillColor(MUTED).font('Helvetica').fontSize(7)
          .text(it.label.toUpperCase(), x + 8, y + 25, { width: chipW - 16, characterSpacing: 0.4 });
      });
      // pdfkit déplace doc.x après text(x, y) → le réancrer à gauche
      doc.x = MARGIN;
      doc.y = y + chipH + 6;
    };

    interface Col { header: string; width: number; align?: 'left' | 'right' | 'center' }
    const drawTable = (cols: Col[], rows: string[][], opts?: { dangerRow?: (r: string[]) => boolean }) => {
      if (!rows.length) return;
      const rowPad = 4;
      const fontH = 8;
      // Hauteurs
      const rowHeights = rows.map((r) => {
        let h = 0;
        cols.forEach((c, i) => {
          const th = doc.font('Helvetica').fontSize(fontH).heightOfString(r[i] || '', { width: c.width - 8 });
          h = Math.max(h, th);
        });
        return h + rowPad * 2;
      });
      const headH = 18;
      // Éclatement multi-pages
      let cursor = doc.y;
      let i = 0;
      const pageBottom = doc.page.height - 60;
      while (i < rows.length) {
        // espace restant
        let avail = pageBottom - cursor;
        // entête répétée si nouvelle page
        const needHead = cursor === doc.page.margins.top + 0 || i === 0 ? 0 : headH;
        if (avail < needHead + rowHeights[i]) {
          doc.addPage();
          cursor = doc.y;
          avail = pageBottom - cursor;
        }
        if (i === 0 || cursor === doc.y) {
          // entête
          ensureSpace(headH + 8);
          const hy = doc.y;
          doc.rect(MARGIN, hy, CONTENT_W, headH).fill(INK);
          let x = MARGIN;
          cols.forEach((c) => {
            doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5)
              .text(c.header.toUpperCase(), x + 4, hy + 5, { width: c.width - 8, align: c.align || 'left', characterSpacing: 0.4, lineBreak: false });
            x += c.width;
          });
          doc.y = hy + headH;
          cursor = doc.y;
        }
        // lignes tenant dans la page
        let batchH = 0;
        let j = i;
        while (j < rows.length && batchH + rowHeights[j] <= pageBottom - cursor) {
          batchH += rowHeights[j];
          j++;
        }
        if (j === i) { doc.addPage(); cursor = doc.y; continue; }
        // fond zébré
        let y = cursor;
        for (let k = i; k < j; k++) {
          const isDanger = opts?.dangerRow?.(rows[k]);
          if (k % 2 === 1 || isDanger) {
            doc.rect(MARGIN, y, CONTENT_W, rowHeights[k]).fill(isDanger ? '#fdecec' : IVORY);
          }
          y += rowHeights[k];
        }
        // textes
        y = cursor;
        for (let k = i; k < j; k++) {
          let x = MARGIN;
          cols.forEach((c, ci) => {
            doc.fillColor(opts?.dangerRow?.(rows[k]) ? DANGER : TEXT).font('Helvetica').fontSize(fontH)
              .text(rows[k][ci] || '', x + 4, y + rowPad, { width: c.width - 8, align: c.align || 'left' });
            x += c.width;
          });
          y += rowHeights[k];
        }
        // bordures
        doc.rect(MARGIN, cursor - headH, CONTENT_W, (y - cursor) + headH)
          .lineWidth(0.6).strokeColor(BORDER).stroke();
        doc.x = MARGIN;
        doc.y = y;
        cursor = y;
        i = j;
      }
      doc.moveDown(0.4);
    };

    // ═══ 1. EFFECTIFS ═══════════════════════════════════════════════════════
    sectionTitle('EFFECTIFS');
    statChips([
      { label: 'Élèves actifs', value: fmtNum(data.students.total), color: GOLD_DARK },
      { label: 'Classes', value: fmtNum(data.students.classesCount) },
      { label: 'Professeurs', value: fmtNum(data.students.teachers), color: GREEN },
    ]);
    if (data.students.byClass.length) {
      ensureSpace(24);
      doc.fillColor(MUTED).font('Helvetica').fontSize(8.5)
        .text(`Répartition : ${data.students.byClass.slice(0, 8).map((c) => `${c.className} (${c.count})`).join(' · ')}`, { width: CONTENT_W });
    }

    // ═══ 2. PAIEMENTS ═══════════════════════════════════════════════════════
    sectionTitle('PAIEMENTS DE LA PÉRIODE');
    statChips([
      { label: 'Transactions', value: fmtNum(data.payments.transactions), color: GOLD_DARK },
      { label: `Total encaissé (${data.currencySymbol})`, value: fmtNum(data.payments.collected), color: GREEN },
      { label: `Total attendu (${data.currencySymbol})`, value: fmtNum(data.payments.expected) },
      { label: 'Impayés actuels', value: fmtNum(data.payments.unpaid), color: DANGER },
    ]);
    if (data.payments.list.length) {
      doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8.5)
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
        doc.fillColor(MUTED).fontSize(7.5)
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
      doc.fillColor(MUTED).font('Helvetica').fontSize(9)
        .text('Aucune communication envoyée sur la période.', { width: CONTENT_W });
    }

    // ═══ 4. DISCIPLINE ══════════════════════════════════════════════════════
    sectionTitle('DISCIPLINE DE LA PÉRIODE');
    statChips([
      { label: 'Incidents / sanctions', value: fmtNum(data.discipline.incidents), color: DANGER },
      { label: 'Points positifs', value: fmtNum(data.discipline.positives), color: GREEN },
      { label: 'Convocations', value: fmtNum(data.discipline.convocations), color: GOLD_DARK },
    ]);

    if (data.discipline.incidentsList.length) {
      doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(9)
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
      doc.fillColor(MUTED).font('Helvetica').fontSize(9)
        .text('Aucun incident ni sanction sur la période.', { width: CONTENT_W });
      doc.moveDown(0.4);
    }

    if (data.discipline.positivesList.length) {
      doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(9)
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
      doc.fillColor(MUTED).font('Helvetica').fontSize(9)
        .text('Aucun point positif distribué sur la période.', { width: CONTENT_W });
      doc.moveDown(0.4);
    }

    if (data.discipline.convocationsList.length) {
      doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(9)
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
      doc.fillColor(MUTED).font('Helvetica').fontSize(9)
        .text('Aucune convocation sur la période.', { width: CONTENT_W });
      doc.moveDown(0.4);
    }

    // ═══ 5. PRÉSENCES ═══════════════════════════════════════════════════════
    sectionTitle('PRÉSENCES DE LA PÉRIODE');
    statChips([
      { label: 'Taux de présence', value: data.attendance.rate !== null ? `${data.attendance.rate}%` : '—', color: GREEN },
      { label: 'Présents', value: fmtNum(data.attendance.present), color: GREEN },
      { label: 'Absents', value: fmtNum(data.attendance.absent), color: DANGER },
      { label: 'Retards', value: fmtNum(data.attendance.late), color: GOLD_DARK },
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
      doc.fillColor(MUTED).fontSize(7.5)
        .text("Les absences de 2 jours et plus sur la période sont signalées en rouge.", { width: CONTENT_W });
    } else {
      doc.fillColor(MUTED).font('Helvetica').fontSize(9)
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
      doc.fillColor(MUTED).font('Helvetica').fontSize(9)
        .text('Pas assez de données pour classer les classes sur la période.', { width: CONTENT_W });
      doc.moveDown(0.4);
    }

    sectionTitle("CLASSEMENT DES ÉLÈVES — % ESTIMÉ (NOTES) ET CONDUITE (DISCIPLINE)");
    if (data.studentRanking.top.length) {
      doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(9)
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
      doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(9)
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
      doc.fillColor(MUTED).font('Helvetica').fontSize(9)
        .text('Pas assez de données pour classer les élèves sur la période.', { width: CONTENT_W });
      doc.moveDown(0.4);
    }

    // ── Sceau final ─────────────────────────────────────────────────────────
    ensureSpace(70);
    doc.moveDown(1);
    const sealY = Math.min(doc.y + 6, doc.page.height - 110);
    doc.rect(MARGIN, sealY, CONTENT_W, 52).fill(IVORY);
    doc.rect(MARGIN, sealY, 3.5, 52).fill(GOLD);
    doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(9)
      .text(`Rapport scellé sur le rôle : ${sealLabel}`, MARGIN + 12, sealY + 9, { width: CONTENT_W - 20 });
    doc.text(`Généré par EduGest le ${fmtLagosDateTime(data.generatedAtISO)} (heure locale)`, MARGIN + 12, sealY + 24, { width: CONTENT_W - 20 });
    doc.fillColor(MUTED).font('Helvetica').fontSize(7)
      .text('Document confidentiel — destiné à la direction de l\'établissement.', MARGIN + 12, sealY + 38, { width: CONTENT_W - 20 });

    // ── Pieds de page + numéros (tamponnés APRÈS génération, sans risque
    //    de re-déclencher une page : ils restent au-dessus de la marge basse) ─
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const fy = doc.page.height - 34;
      if (i > 0) {
        doc.fontSize(7.5).fillColor(MUTED)
          .text(`EduGest — Rapport d'activité · ${data.school.name}`, MARGIN, fy, { width: CONTENT_W - 60, lineBreak: false })
          .text(`Page ${i + 1}`, MARGIN, fy, { width: CONTENT_W, align: 'right', lineBreak: false });
      }
    }

    doc.end();
}
