import { jsPDF } from 'jspdf';
import { db } from './db';
import { sanitizeAscii } from './bulletin';

// ─── PDF de présence d'un professeurs — design « Institut Gianelli » ──────────
// Même vocabulaire visuel que buildBulletinPDF : double bordure navy/or, logo
// encadré d'or, lignes pointillées, tableau des jours, totaux en bas.

const NAVY = [2, 36, 72] as [number, number, number];
const GOLD = [212, 175, 55] as [number, number, number];
const GREEN = [0, 135, 90] as [number, number, number];
const RED = [186, 26, 26] as [number, number, number];
const GRAY = [120, 120, 120] as [number, number, number];
const LGRAY = [200, 200, 200] as [number, number, number];
const DGRAY = [60, 60, 60] as [number, number, number];

function centerText(doc: jsPDF, text: string, y: number, pageWidth: number) {
  const tw = doc.getTextWidth(text);
  doc.text(text, (pageWidth - tw) / 2, y);
}

function rightText(doc: jsPDF, text: string, y: number, rightX: number) {
  const tw = doc.getTextWidth(text);
  doc.text(text, rightX - tw, y);
}

function drawDottedLine(doc: jsPDF, x1: number, y: number, x2: number) {
  const step = 2.5;
  const len = x2 - x1;
  const count = Math.floor(len / step);
  for (let i = 0; i < count; i += 2) {
    const sx = x1 + i * step;
    const ex = Math.min(sx + step * 0.6, x2);
    doc.line(sx, y, ex, y);
  }
}

function setDraw(doc: jsPDF, c: [number, number, number]) { doc.setDrawColor(c[0], c[1], c[2]); }
function setFill(doc: jsPDF, c: [number, number, number]) { doc.setFillColor(c[0], c[1], c[2]); }
function setText(doc: jsPDF, c: [number, number, number]) { doc.setTextColor(c[0], c[1], c[2]); }

export interface TeacherAttendancePdfData {
  teacher: { name: string; email?: string | null; subjectName?: string | null; classNames?: string | null };
  school: { name: string; shortName: string; address?: string; city?: string; province?: string; logo?: string | null };
  records: { date: string; status: string }[];
  stats: { present: number; absent: number; late: number; total: number };
  period: string;
}

export function buildTeacherAttendancePDF(data: TeacherAttendancePdfData): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const W = 210;
  const H = 297;
  const mx = 15;
  const cw = W - mx * 2;

  const setD = (d: jsPDF, c: [number, number, number]) => d.setDrawColor(c[0], c[1], c[2]);
  const setF = (d: jsPDF, c: [number, number, number]) => d.setFillColor(c[0], c[1], c[2]);
  const setT = (d: jsPDF, c: [number, number, number]) => d.setTextColor(c[0], c[1], c[2]);

  // ══════════════════════════════════════════════════════════════════
  //  DOUBLE BORDURE DÉCORATIVE
  // ══════════════════════════════════════════════════════════════════
  setD(doc, NAVY);
  doc.setLineWidth(1.5);
  doc.rect(5, 5, W - 10, H - 10);
  setD(doc, GOLD);
  doc.setLineWidth(0.3);
  doc.rect(8, 8, W - 16, H - 16);

  // ══════════════════════════════════════════════════════════════════
  //  EN-TÊTE : logo + nom de l'école
  // ══════════════════════════════════════════════════════════════════
  let y = 20;
  const logoX = mx + 2;
  const logoY = y;
  const logoSize = 22;

  setD(doc, GOLD);
  setF(doc, [255, 255, 255]);
  doc.setLineWidth(1.5);
  doc.rect(logoX, logoY, logoSize, logoSize, 'FD');

  // Nom de l'école en or
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  setT(doc, GOLD);
  doc.text(sanitizeAscii(data.school.name).toUpperCase().slice(0, 34), mx + 30, y + 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  setT(doc, GRAY);
  const addressParts = sanitizeAscii([data.school.address, data.school.city, data.school.province].filter(Boolean).join(', '));
  if (addressParts) {
    doc.text(addressParts.slice(0, 60), mx + 30, y + 15);
  }

  // ══════════════════════════════════════════════════════════════════
  //  LIGNE DÉCORATIVE OR
  // ══════════════════════════════════════════════════════════════════
  y = y + 30;
  setD(doc, GOLD);
  doc.setLineWidth(1);
  doc.line(mx, y, W - mx, y);
  doc.setLineWidth(0.3);
  doc.line(mx, y + 2, W - mx, y + 2);

  // ══════════════════════════════════════════════════════════════════
  //  TITRE
  // ══════════════════════════════════════════════════════════════════
  y += 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  setT(doc, NAVY);
  centerText(doc, 'FICHE DE PRESENCE', y, W);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setT(doc, GRAY);
  centerText(doc, sanitizeAscii(data.period), y + 6, W);

  // ══════════════════════════════════════════════════════════════════
  //  INFORMATIONS PROFESSEUR
  // ══════════════════════════════════════════════════════════════════
  y += 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setT(doc, GOLD);
  doc.text('INFORMATIONS PROFESSEUR', mx + 2, y);
  y += 3;

  const infoFields: [string, string][] = [
    ['NOM', sanitizeAscii(data.teacher.name)],
    ['EMAIL', sanitizeAscii(data.teacher.email || '—')],
    ['SPECIALITE', sanitizeAscii(data.teacher.subjectName || '—')],
    ['CLASSES', sanitizeAscii(data.teacher.classNames || '—')],
  ];

  for (const [label, value] of infoFields) {
    y += 7;
    setD(doc, LGRAY);
    doc.setLineWidth(0.2);
    drawDottedLine(doc, mx + 2, y - 2, W - mx - 2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    setT(doc, GRAY);
    doc.text(label, mx + 4, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    setT(doc, NAVY);
    rightText(doc, value.slice(0, 46), y, W - mx - 4);
  }

  // ══════════════════════════════════════════════════════════════════
  //  TABLEAU DES PRÉSENCES
  // ══════════════════════════════════════════════════════════════════
  y += 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setT(doc, GOLD);
  doc.text('HISTORIQUE DES PRESENCES', mx + 2, y);
  y += 4;

  // En-tête du tableau
  const colDate = mx + 4;
  const colStatus = W - mx - 40;
  const colPoints = W - mx - 14;

  setF(doc, NAVY);
  doc.setFontSize(9);
  doc.rect(mx + 2, y, cw - 4, 7, 'FD');
  setT(doc, [255, 255, 255]);
  doc.setFont('helvetica', 'bold');
  doc.text('DATE', colDate, y + 5);
  doc.text('STATUT', colStatus, y + 5);
  doc.text('POINTS', colPoints, y + 5);
  y += 7;

  // Lignes
  for (const r of data.records.slice(0, 40)) {
    y += 7;
    setD(doc, LGRAY);
    doc.setLineWidth(0.2);
    drawDottedLine(doc, mx + 2, y - 2, W - mx - 2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setT(doc, DGRAY);
    doc.text(r.date, colDate, y);

    const statusLabel = r.status === 'PRESENT' ? 'PRESENT' : r.status === 'ABSENT' ? 'ABSENT' : 'RETARD';
    const statusColor: [number, number, number] = r.status === 'PRESENT' ? GREEN : r.status === 'ABSENT' ? RED : GOLD;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    setT(doc, statusColor);
    doc.text(statusLabel, colStatus, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setT(doc, GRAY);
    doc.text('—', colPoints, y);
  }

  // ══════════════════════════════════════════════════════════════════
  //  TOTAUX EN BAS
  // ══════════════════════════════════════════════════════════════════
  y += 14;
  setD(doc, GOLD);
  doc.setLineWidth(1);
  doc.line(mx, y, W - mx, y);
  doc.setLineWidth(0.3);
  doc.line(mx, y + 2, W - mx, y + 2);

  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  setT(doc, NAVY);
  doc.text('TOTAUX', mx + 2, y);

  y += 8;
  const totalFields: [string, number, [number, number, number]][] = [
    ['Jours presents', data.stats.present, GREEN],
    ['Jours absents', data.stats.absent, RED],
    ['Jours retards', data.stats.late, GOLD],
    ['Total enregistrements', data.stats.total, NAVY],
  ];

  for (const [label, value, color] of totalFields) {
    y += 7;
    setD(doc, LGRAY);
    doc.setLineWidth(0.2);
    drawDottedLine(doc, mx + 2, y - 2, W - mx - 2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setT(doc, GRAY);
    doc.text(label, mx + 4, y);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    setT(doc, color);
    rightText(doc, String(value), y, W - mx - 4);
  }

  return doc.output('arraybuffer') as unknown as Buffer;
}
