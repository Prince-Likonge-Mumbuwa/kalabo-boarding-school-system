// @/services/pdf/timetablePDF.ts
//
// Branded timetable documents (A4 landscape): school logo and name, the
// term, and a grid with the days as rows and the periods as columns
// (P1–P4 | Break | P5–P8). Doubles and triples are one merged box.
//
// One function makes all three kinds:
//   • a teacher's timetable  (cells: class · subject · room)
//   • a class timetable      (cells: subject · teacher · room)
//   • the master timetable   (one page per class)

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage, type PDFImage } from 'pdf-lib';
import { embedSchoolLogo } from '@/lib/schoolLogo';
import { SCHOOL_BELL } from '@/services/timetableModel';

export const SCHOOL_NAME = 'KALABO BOARDING SECONDARY SCHOOL';

export interface TimetableCell {
  day: 1 | 2 | 3 | 4 | 5;
  start: number;
  size: number;
  /** First line bold, the rest normal. */
  lines: string[];
}

export interface TimetablePage {
  /** e.g. 'Form 1A' or 'Mr J. Banda'. */
  heading: string;
  /** e.g. 'Class timetable' / 'Teacher timetable · 28 periods a week'. */
  subheading?: string;
  cells: TimetableCell[];
}

export interface TimetablePDFInput {
  title: string;
  term: string;
  year: number;
  /** e.g. 'In force from 19 Oct 2026'. */
  note?: string;
  pages: TimetablePage[];
  generatedAt?: Date;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

/** pdf-lib's standard fonts only know Windows-1252. */
export const winAnsi = (input: unknown): string => {
  let s = input == null ? '' : String(input);
  s = s
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/·/g, '-')
    .replace(/ /g, ' ');
  return s.replace(/[^\x20-\x7E¡-ÿ]/g, '');
};

/** Fits text into a width: shrinks to `min` size, then cuts with '...'. */
function fit(text: string, font: PDFFont, size: number, width: number, min = 5.5): { text: string; size: number } {
  let s = size;
  const t = winAnsi(text);
  while (s > min && font.widthOfTextAtSize(t, s) > width) s -= 0.5;
  if (font.widthOfTextAtSize(t, s) <= width) return { text: t, size: s };
  let cut = t;
  while (cut.length > 1 && font.widthOfTextAtSize(`${cut}...`, s) > width) cut = cut.slice(0, -1);
  return { text: `${cut}...`, size: s };
}

const fmtDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export async function generateTimetablePDF(input: TimetablePDFInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(winAnsi(input.title));
  pdf.setAuthor(SCHOOL_NAME);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedSchoolLogo(pdf);
  const generated = input.generatedAt ?? new Date();
  const pages = input.pages.length ? input.pages : [{ heading: input.title, cells: [] }];
  pages.forEach((p, i) => drawPage(pdf.addPage([841.89, 595.28]), p, input, { font, bold, logo }, i + 1, pages.length, generated));
  return pdf.save();
}

const ink = rgb(0.12, 0.12, 0.14);
const muted = rgb(0.4, 0.42, 0.46);
const line = rgb(0.72, 0.74, 0.78);
const head = rgb(0.13, 0.27, 0.53);
const headText = rgb(1, 1, 1);
const breakFill = rgb(0.95, 0.93, 0.86);
const dayFill = rgb(0.93, 0.95, 0.98);
const boxFill = rgb(0.9, 0.94, 1);
const boxBorder = rgb(0.45, 0.58, 0.85);

function drawPage(
  page: PDFPage,
  p: TimetablePage,
  input: TimetablePDFInput,
  f: { font: PDFFont; bold: PDFFont; logo: PDFImage | null },
  n: number,
  total: number,
  generated: Date,
) {
  const { width, height } = page.getSize();
  const M = 32;
  let y = height - M;

  // ---- Header ----
  const logoSize = 54;
  if (f.logo) {
    const s = f.logo.scale(1);
    const k = logoSize / Math.max(s.width, s.height);
    page.drawImage(f.logo, { x: M, y: y - logoSize, width: s.width * k, height: s.height * k });
  }
  const cx = width / 2;
  const centred = (text: string, size: number, font: PDFFont, yy: number, color = ink) => {
    const t = winAnsi(text);
    page.drawText(t, { x: cx - font.widthOfTextAtSize(t, size) / 2, y: yy, size, font, color });
  };
  centred(SCHOOL_NAME, 15, f.bold, y - 14);
  centred(`${input.title.toUpperCase()}  -  ${input.term.toUpperCase()} ${input.year}`, 11, f.bold, y - 31, head);
  if (input.note) centred(input.note, 8.5, f.font, y - 44, muted);
  y -= logoSize + 12;

  const h = fit(p.heading, f.bold, 16, width - 2 * M);
  page.drawText(h.text, { x: M, y, size: h.size, font: f.bold, color: ink });
  if (p.subheading) {
    const sub = fit(p.subheading, f.font, 9.5, width / 2);
    page.drawText(sub.text, { x: width - M - f.font.widthOfTextAtSize(sub.text, sub.size), y: y + 3, size: sub.size, font: f.font, color: muted });
  }
  y -= 10;

  // ---- Grid ----
  const tableTop = y;
  const dayW = 78;
  const breakW = 26;
  const periodW = (width - 2 * M - dayW - breakW) / 8;
  const headerH = 30;
  const rowH = (tableTop - headerH - (M + 26)) / 5;
  const colX = (period: number) => M + dayW + (period - 1) * periodW + (period > 4 ? breakW : 0);
  const breakX = M + dayW + 4 * periodW;
  const gridBottom = tableTop - headerH - 5 * rowH;

  // Header row
  page.drawRectangle({ x: M, y: tableTop - headerH, width: width - 2 * M, height: headerH, color: head });
  page.drawText('DAY', { x: M + 8, y: tableTop - 19, size: 9, font: f.bold, color: headText });
  for (let pIdx = 1; pIdx <= 8; pIdx++) {
    const bell = SCHOOL_BELL.find(b => b.order === pIdx);
    const x = colX(pIdx);
    const label = `P${pIdx}`;
    page.drawText(label, { x: x + periodW / 2 - f.bold.widthOfTextAtSize(label, 10) / 2, y: tableTop - 14, size: 10, font: f.bold, color: headText });
    if (bell) {
      const t = `${bell.startTime}-${bell.endTime}`;
      page.drawText(t, { x: x + periodW / 2 - f.font.widthOfTextAtSize(t, 7) / 2, y: tableTop - 25, size: 7, font: f.font, color: headText });
    }
  }
  // Break column
  page.drawRectangle({ x: breakX, y: gridBottom, width: breakW, height: 5 * rowH, color: breakFill });
  const bw = 'BREAK';
  for (let i = 0; i < bw.length; i++) {
    page.drawText(bw[i], { x: breakX + breakW / 2 - 3, y: gridBottom + (5 * rowH) / 2 + 22 - i * 11, size: 9, font: f.bold, color: muted });
  }

  // Day rows
  for (let d = 1; d <= 5; d++) {
    const top = tableTop - headerH - (d - 1) * rowH;
    page.drawRectangle({ x: M, y: top - rowH, width: dayW, height: rowH, color: dayFill });
    page.drawText(DAY_NAMES[d - 1], { x: M + 8, y: top - rowH / 2 - 4, size: 10, font: f.bold, color: ink });
  }

  // Grid lines
  for (let d = 0; d <= 5; d++) {
    const yy = tableTop - headerH - d * rowH;
    page.drawLine({ start: { x: M, y: yy }, end: { x: width - M, y: yy }, thickness: 0.6, color: line });
  }
  const xs = [M, M + dayW, breakX, breakX + breakW, width - M];
  for (let pIdx = 2; pIdx <= 8; pIdx++) if (pIdx !== 5) xs.push(colX(pIdx));
  for (const x of xs) page.drawLine({ start: { x, y: tableTop }, end: { x, y: gridBottom }, thickness: 0.6, color: line });

  // Lessons (drawn over the grid lines, so doubles read as one box)
  for (const c of p.cells) {
    if (c.day < 1 || c.day > 5 || c.start < 1 || c.start + c.size - 1 > 8) continue;
    const top = tableTop - headerH - (c.day - 1) * rowH;
    const x = colX(c.start) + 2;
    const w = colX(c.start + c.size - 1) + periodW - colX(c.start) - 4;
    page.drawRectangle({ x, y: top - rowH + 2, width: w, height: rowH - 4, color: boxFill, borderColor: boxBorder, borderWidth: 0.6 });
    const lines = c.lines.filter(Boolean).slice(0, 4);
    const sizes = lines.map((_, i) => (i === 0 ? 9 : 7.5));
    const blockH = sizes.reduce((a, b) => a + b + 2, 0);
    let ty = top - rowH / 2 + blockH / 2 - sizes[0];
    lines.forEach((ln, i) => {
      const fnt = i === 0 ? f.bold : f.font;
      const ft = fit(ln, fnt, sizes[i], w - 6);
      page.drawText(ft.text, { x: x + w / 2 - fnt.widthOfTextAtSize(ft.text, ft.size) / 2, y: ty, size: ft.size, font: fnt, color: i === 0 ? ink : muted });
      ty -= sizes[i] + 2;
    });
  }

  // ---- Footer ----
  const foot = winAnsi(`Generated ${fmtDate(generated)} - ${SCHOOL_NAME} - This timetable is issued by the school administration.`);
  page.drawText(foot, { x: M, y: M - 8, size: 7.5, font: f.font, color: muted });
  const pg = `Page ${n} of ${total}`;
  page.drawText(pg, { x: width - M - f.font.widthOfTextAtSize(pg, 7.5), y: M - 8, size: 7.5, font: f.font, color: muted });
}

/** Saves the PDF in the browser. */
export function downloadPdf(bytes: Uint8Array, filename: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const url = URL.createObjectURL(new Blob([copy], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const pdfFileName = (...parts: Array<string | number>) =>
  `${parts.map(p => String(p).trim().replace(/[^A-Za-z0-9]+/g, '-')).filter(Boolean).join('-')}.pdf`;
