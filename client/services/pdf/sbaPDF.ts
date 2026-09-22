// @/services/pdf/sbaPDF.ts
// SBA PDF generation — ECSEOL 2026
// Refined to match the design language of reportCardPDFLib.ts:
//   • pdf-lib + Helvetica regular/bold (same as report cards)
//   • Navy + primaryBlue palette
//   • Panel blocks with left accent bar
//   • Alternating-row tables with header fill
//   • Signature footer, page counter, legend row

import {
  PDFDocument,
  rgb,
  StandardFonts,
  PDFImage,
  PDFPage,
  PDFFont,
  RGB,
} from 'pdf-lib';
import type { SbaConfig, SbaResult } from '@/types/sba';

// ==================== BRANDING ====================

const SCHOOL_NAME = 'KALABO BOARDING SECONDARY SCHOOL';
const MINISTRY = 'MINISTRY OF EDUCATION';

// ==================== COLORS (mirrors reportCardPDFLib.ts) ====================

const white = rgb(1, 1, 1);
const navy = rgb(0.055, 0.20, 0.42);
const primaryBlue = rgb(0.02, 0.35, 0.70);
const textDark = rgb(0.08, 0.16, 0.28);
const textMuted = rgb(0.34, 0.41, 0.53);
const border = rgb(0.78, 0.86, 0.94);
const panelFill = rgb(0.965, 0.982, 1);
const rowFill = rgb(0.965, 0.978, 0.995);
const tableHeader = rgb(0.025, 0.28, 0.58);

// Level accent colors
const levelColors: Record<number, RGB> = {
  1: rgb(0.13, 0.64, 0.29), // green-600
  2: rgb(0.15, 0.39, 0.92), // blue-600
  3: rgb(0.02, 0.71, 0.71), // teal-500
  4: rgb(0.92, 0.70, 0.03), // yellow-500
  5: rgb(0.86, 0.15, 0.15), // red-600
  [-1]: rgb(0.42, 0.45, 0.50), // gray-500
};

// ==================== PAGE CONSTANTS ====================

const PAGE_SIZE: [number, number] = [595.28, 841.89]; // A4 portrait
const MARGIN = 40;
const PAGE_WIDTH = PAGE_SIZE[0];
const PAGE_HEIGHT = PAGE_SIZE[1];
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// ==================== TYPES ====================

type Fonts = {
  regular: PDFFont;
  bold: PDFFont;
};

type DocContext = {
  doc: PDFDocument;
  fonts: Fonts;
  logo: PDFImage | null;
};

type Column = {
  key: string;
  label: string;
  width: number;
  align: 'left' | 'center';
  bold?: boolean;
  color?: RGB;
  isLevel?: boolean;
};

/**
 * Table rows allow any string-keyed value plus the reserved `_level` key
 * (used to color-code the Level column). The index signature accepts
 * `string | number | undefined` so `_level: number` is permitted.
 */
type TableRow = {
  [key: string]: string | number | undefined;
  _level?: number;
};

// ==================== LOGO ====================

async function embedSchoolLogo(doc: PDFDocument): Promise<PDFImage | null> {
  try {
    const res = await fetch('/images/school-logo.png');
    if (!res.ok) {
      console.warn('Logo image not found at /images/school-logo.png');
      return null;
    }
    const bytes = await res.arrayBuffer();
    try {
      return await doc.embedPng(bytes);
    } catch {
      try {
        return await doc.embedJpg(bytes);
      } catch {
        console.warn('Logo format unsupported. Use PNG or JPG.');
        return null;
      }
    }
  } catch (err) {
    console.warn('Could not load school logo:', err);
    return null;
  }
}

// ==================== SHARED DRAWING HELPERS ====================

function drawCenteredText(
  page: PDFPage,
  text: string,
  y: number,
  font: PDFFont,
  size: number,
  color: RGB = textDark
): void {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: (PAGE_WIDTH - w) / 2,
    y,
    size,
    font,
    color,
  });
}

function drawPanel(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: RGB = panelFill,
  borderColor: RGB = border
): void {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: fill,
    borderColor,
    borderWidth: 0.8,
  });
}

function drawPanelWithAccent(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number,
  accent: RGB,
  fill: RGB = panelFill,
  borderColor: RGB = border
): void {
  drawPanel(page, x, y, width, height, fill, borderColor);
  // Left accent bar
  page.drawRectangle({
    x,
    y,
    width: 3,
    height,
    color: accent,
  });
}

function drawVerticalText(
  page: PDFPage,
  text: string,
  x: number,
  rowY: number,
  rowHeight: number,
  font: PDFFont,
  size: number,
  color: RGB = textDark
): void {
  const h = font.heightAtSize(size);
  page.drawText(text, {
    x,
    y: rowY + (rowHeight - h) / 2 + 1,
    size,
    font,
    color,
  });
}

// ==================== HEADER ====================

/**
 * Draws the school header stack at the top of the page and returns the
 * y-coordinate at which the caller can continue drawing.
 * Mirrors the report card's title stack: logo → school → ministry → title → subtitle.
 */
function drawHeader(
  ctx: DocContext,
  page: PDFPage,
  title: string,
  subtitle?: string
): number {
  const { fonts, logo } = ctx;
  let y = PAGE_HEIGHT - 28;

  if (logo) {
    const scaled = logo.scale(0.095);
    const maxW = 70;
    const maxH = 70;
    const s = Math.min(maxW / scaled.width, maxH / scaled.height);
    const w = scaled.width * s;
    const h = scaled.height * s;
    page.drawImage(logo, {
      x: (PAGE_WIDTH - w) / 2,
      y: y - h,
      width: w,
      height: h,
    });
    y -= h + 18;
  }

  drawCenteredText(page, SCHOOL_NAME, y, fonts.bold, 17, primaryBlue);
  y -= 22;

  drawCenteredText(page, MINISTRY, y, fonts.bold, 11, textMuted);
  y -= 16;

  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1.5,
    color: primaryBlue,
  });

  y -= 31;

  drawCenteredText(page, title, y, fonts.bold, 19, navy);
  y -= 28;

  if (subtitle) {
    drawCenteredText(page, subtitle, y, fonts.regular, 8.5, primaryBlue);
    y -= 18;
  }

  return y;
}

// ==================== FOOTER ====================

function drawFooter(
  page: PDFPage,
  fonts: Fonts,
  pageNumber: number,
  totalPages: number,
  note?: string
): void {
  const footerY = 48;

  if (note) {
    page.drawText(note, {
      x: MARGIN,
      y: footerY - 10,
      size: 7.5,
      font: fonts.regular,
      color: textMuted,
    });
  }

  page.drawText(`Generated: ${new Date().toLocaleString()}`, {
    x: MARGIN,
    y: footerY,
    size: 8,
    font: fonts.regular,
    color: textMuted,
  });

  const pageText = `Page ${pageNumber} of ${totalPages}`;
  const pageTextW = fonts.regular.widthOfTextAtSize(pageText, 8);
  page.drawText(pageText, {
    x: (PAGE_WIDTH - pageTextW) / 2,
    y: footerY,
    size: 8,
    font: fonts.regular,
    color: textMuted,
  });

  // Signature line on the right
  const sigWidth = 145;
  const sigX = PAGE_WIDTH - MARGIN - sigWidth;
  page.drawLine({
    start: { x: sigX, y: footerY + 14 },
    end: { x: sigX + sigWidth, y: footerY + 14 },
    thickness: 0.8,
    color: primaryBlue,
  });
  const sigText = 'Authorised Signature';
  const sigTextW = fonts.regular.widthOfTextAtSize(sigText, 8);
  page.drawText(sigText, {
    x: sigX + (sigWidth - sigTextW) / 2,
    y: footerY - 1,
    size: 8,
    font: fonts.bold,
    color: navy,
  });
}

// ==================== SENTINEL FORMATTING ====================

function formatMark(v: number | null): string {
  if (v === null || v === undefined) return '—';
  if (v === -1) return 'ABS';
  if (v === -2) return 'N/C';
  return String(v);
}

function rawTotalOf(s: {
  form1Mark: number | null;
  form2Mark: number | null;
  form3Mark: number | null;
}): number {
  return [s.form1Mark, s.form2Mark, s.form3Mark]
    .filter(v => v !== null && v !== undefined && v >= 0)
    .reduce((a, b) => a + b, 0);
}

// ==================== INFO PANEL ====================

/**
 * Two-column info panel with left accent bar.
 * Mirrors the report card's student-info panel structure.
 */
function drawInfoPanel(
  ctx: DocContext,
  page: PDFPage,
  y: number,
  leftItems: Array<[string, string]>,
  rightItems: Array<[string, string]>
): number {
  const { fonts } = ctx;
  const panelHeight = 22 + Math.max(leftItems.length, rightItems.length) * 20;
  const panelY = y - panelHeight;

  drawPanelWithAccent(page, MARGIN, panelY, CONTENT_WIDTH, panelHeight, primaryBlue);

  const innerPadding = 17;
  const leftX = MARGIN + innerPadding;
  const rightX = MARGIN + CONTENT_WIDTH / 2 + 15;
  const dividerX = MARGIN + CONTENT_WIDTH / 2;

  // Vertical divider
  page.drawLine({
    start: { x: dividerX, y: panelY + 12 },
    end: { x: dividerX, y: panelY + panelHeight - 12 },
    thickness: 0.8,
    color: border,
  });

  const rowHeight = 20;
  const startY = panelY + panelHeight - 26;

  leftItems.forEach(([label, value], i) => {
    const rowY = startY - i * rowHeight;
    page.drawText(label, {
      x: leftX,
      y: rowY,
      size: 9.5,
      font: fonts.bold,
      color: textMuted,
    });
    page.drawText(value, {
      x: leftX + 91,
      y: rowY,
      size: 10,
      font: fonts.regular,
      color: textDark,
    });
  });

  rightItems.forEach(([label, value], i) => {
    const rowY = startY - i * rowHeight;
    page.drawText(label, {
      x: rightX,
      y: rowY,
      size: 9.5,
      font: fonts.bold,
      color: textMuted,
    });
    page.drawText(value, {
      x: rightX + 74,
      y: rowY,
      size: 10,
      font: fonts.regular,
      color: textDark,
    });
  });

  return panelY - 17;
}

// ==================== SUMMARY CARDS ROW ====================

function drawSummaryCards(
  ctx: DocContext,
  page: PDFPage,
  y: number,
  cards: Array<{ label: string; value: string; accent: RGB }>
): number {
  const { fonts } = ctx;
  const gap = 8;
  const cardWidth = (CONTENT_WIDTH - gap * (cards.length - 1)) / cards.length;
  const cardHeight = 40;
  const cardY = y - cardHeight;

  cards.forEach((c, i) => {
    const x = MARGIN + i * (cardWidth + gap);
    drawPanelWithAccent(page, x, cardY, cardWidth, cardHeight, c.accent);

    page.drawText(c.label.toUpperCase(), {
      x: x + 12,
      y: cardY + cardHeight - 14,
      size: 7,
      font: fonts.bold,
      color: textMuted,
    });
    page.drawText(c.value, {
      x: x + 12,
      y: cardY + 12,
      size: 14,
      font: fonts.bold,
      color: c.accent,
    });
  });

  return cardY - 18;
}

// ==================== TABLE DRAWING ====================

/**
 * Draws the table header and returns the y-coordinate after it.
 */
function drawTableHeader(
  ctx: DocContext,
  page: PDFPage,
  y: number,
  columns: Column[]
): number {
  const { fonts } = ctx;
  const headerHeight = 27;
  let tableX = MARGIN;

  columns.forEach(col => {
    page.drawRectangle({
      x: tableX,
      y: y - headerHeight,
      width: col.width,
      height: headerHeight,
      color: tableHeader,
    });

    const labelW = fonts.bold.widthOfTextAtSize(col.label, 9);
    const textX =
      col.align === 'center'
        ? tableX + (col.width - labelW) / 2
        : tableX + 9;

    page.drawText(col.label, {
      x: textX,
      y: y - headerHeight + 9,
      size: 9,
      font: fonts.bold,
      color: white,
    });

    tableX += col.width;
  });

  return y - headerHeight;
}

/**
 * Draws one table row. Returns the new y (rowY).
 */
function drawTableRow(
  ctx: DocContext,
  page: PDFPage,
  y: number,
  rowIndex: number,
  columns: Column[],
  row: TableRow,
  rowHeight = 24
): number {
  const { fonts } = ctx;
  const rowY = y - rowHeight;
  const fill = rowIndex % 2 === 0 ? white : rowFill;
  let tableX = MARGIN;

  columns.forEach(col => {
    page.drawRectangle({
      x: tableX,
      y: rowY,
      width: col.width,
      height: rowHeight,
      color: fill,
      borderColor: border,
      borderWidth: 0.55,
    });

    // Coerce to string; TableRow values can now be string | number | undefined.
    const rawVal = row[col.key];
    const value =
      rawVal === undefined || rawVal === null ? '—' : String(rawVal);

    let font = fonts.regular;
    const size = 9;
    let color: RGB = col.color ?? textDark;

    if (col.bold) font = fonts.bold;
    if (col.isLevel && row._level !== undefined && row._level !== -1) {
      color = levelColors[row._level] ?? textDark;
      font = fonts.bold;
    }

    const textW = font.widthOfTextAtSize(value, size);
    const textX =
      col.align === 'center'
        ? tableX + (col.width - textW) / 2
        : tableX + 9;

    drawVerticalText(page, value, textX, rowY, rowHeight, font, size, color);
    tableX += col.width;
  });

  return rowY;
}

/**
 * Draws the legend row under a table.
 */
function drawLegend(page: PDFPage, fonts: Fonts, y: number, items: string[]): number {
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.8,
    color: primaryBlue,
  });
  y -= 19;

  page.drawText('Legend:', {
    x: MARGIN,
    y,
    size: 8.5,
    font: fonts.bold,
    color: navy,
  });

  page.drawText(items.join('     |     '), {
    x: MARGIN + 42,
    y,
    size: 8.2,
    font: fonts.regular,
    color: textMuted,
  });

  return y - 12;
}

// ==================== PAGINATION ====================

/**
 * Split rows across pages so each page can hold a full table.
 * Returns an array of "chunks" (one per page).
 */
function paginateRows<T>(rows: T[], firstPageCapacity: number, nextPageCapacity: number): T[][] {
  if (rows.length <= firstPageCapacity) return [rows];
  const chunks: T[][] = [rows.slice(0, firstPageCapacity)];
  let remaining = rows.slice(firstPageCapacity);
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, nextPageCapacity));
    remaining = remaining.slice(nextPageCapacity);
  }
  return chunks;
}

// ==================== PUBLIC: ECZ SCORE SHEET ====================

export interface EczSbaScoreSheetInput {
  className: string;
  subject: SbaConfig;
  examYear: number;
  teacherName: string;
  students: Array<{
    name: string;
    studentId: string;
    form1Mark: number | null;
    form2Mark: number | null;
    form3Mark: number | null;
  }>;
}

/**
 * ECZ-ready SBA score sheet — RAW marks only.
 * Weighted score and level intentionally omitted (ECZ computes them).
 */
export async function generateEczSbaScoreSheet(
  input: EczSbaScoreSheetInput
): Promise<void> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts: Fonts = { regular, bold };
  const logo = await embedSchoolLogo(doc);
  const ctx: DocContext = { doc, fonts, logo };

  const usesF1 = input.subject.sbaForms.includes('form1');
  const usesF2 = input.subject.sbaForms.includes('form2');
  const usesF3 = input.subject.sbaForms.includes('form3');

  // Columns — raw marks only
  const columns: Column[] = [
    { key: 'num', label: '#', width: 22, align: 'center' },
    { key: 'name', label: 'Student Name', width: 138, align: 'left' },
    { key: 'studentId', label: 'Student ID', width: 74, align: 'left' },
  ];
  if (usesF1) columns.push({ key: 'f1', label: 'Form 1 /100', width: 50, align: 'center', bold: true });
  if (usesF2) columns.push({ key: 'f2', label: 'Form 2 /100', width: 50, align: 'center', bold: true });
  if (usesF3) columns.push({ key: 'f3', label: 'Form 3 /100', width: 50, align: 'center', bold: true });
  columns.push({
    key: 'total',
    label: `Raw Total / ${input.subject.sbaRawMax}`,
    width: CONTENT_WIDTH - columns.reduce((s, c) => s + c.width, 0),
    align: 'center',
    bold: true,
    color: primaryBlue,
  });

  // Build all rows up front so we can paginate
  const allRows: TableRow[] = input.students.map((s, i) => {
    const isIncomplete =
      (usesF1 && s.form1Mark === null) ||
      (usesF2 && s.form2Mark === null) ||
      (usesF3 && s.form3Mark === null);
    const total = rawTotalOf(s);

    const row: TableRow = {
      num: String(i + 1),
      name: s.name,
      studentId: s.studentId,
      total: isIncomplete ? `${total}*` : String(total),
    };
    if (usesF1) row.f1 = formatMark(s.form1Mark);
    if (usesF2) row.f2 = formatMark(s.form2Mark);
    if (usesF3) row.f3 = formatMark(s.form3Mark);
    return row;
  });

  // Pagination — page 1 has header + info panel + table; subsequent pages just header + table
  const ROW_H = 22;
  const FIRST_PAGE_CAPACITY = 20;
  const NEXT_PAGE_CAPACITY = 26;

  const chunks = paginateRows(allRows, FIRST_PAGE_CAPACITY, NEXT_PAGE_CAPACITY);
  const totalPages = chunks.length;

  for (let pageIdx = 0; pageIdx < chunks.length; pageIdx++) {
    const page = doc.addPage(PAGE_SIZE);
    const isFirst = pageIdx === 0;

    const subtitle = `${input.subject.subjectName} (${input.subject.subjectCode})  •  ${input.className}  •  Exam Year ${input.examYear}`;
    let y = drawHeader(ctx, page, 'SBA SCORE SHEET — SUBMISSION TO ECZ', subtitle);

    if (isFirst) {
      y = drawInfoPanel(
        ctx,
        page,
        y,
        [
          ['Subject:', input.subject.subjectName],
          ['Subject Code:', input.subject.subjectCode],
          ['SBA Weight:', `${input.subject.sbaWeightPercent}%`],
          ['SBA Raw Max:', String(input.subject.sbaRawMax)],
        ],
        [
          ['Class:', input.className],
          ['Exam Year:', String(input.examYear)],
          ['Teacher:', input.teacherName],
          ['Forms Used:', input.subject.sbaForms.join(', ').toUpperCase()],
        ]
      );
    } else {
      // Compact continuation header
      page.drawText(`${input.subject.subjectName} — continued (page ${pageIdx + 1} of ${totalPages})`, {
        x: MARGIN,
        y,
        size: 10,
        font: fonts.bold,
        color: primaryBlue,
      });
      y -= 18;
    }

    y = drawTableHeader(ctx, page, y, columns);
    chunks[pageIdx].forEach((row, i) => {
      y = drawTableRow(ctx, page, y, i, columns, row, ROW_H);
    });

    // Legend only on last page
    if (pageIdx === totalPages - 1) {
      y = drawLegend(page, fonts, y - 10, [
        'ABS = Absent',
        'N/C = Not Conducted',
        '* = Incomplete',
      ]);

      // Signature block
      const sigY = Math.max(y - 40, 90);
      const sigW = 130;
      const sigGap = 20;
      const sigStartX = (PAGE_WIDTH - (sigW * 3 + sigGap * 2)) / 2;
      const sigLabels = ['Subject Teacher', 'Head of Department', 'Head Teacher'];
      sigLabels.forEach((label, i) => {
        const x = sigStartX + i * (sigW + sigGap);
        page.drawLine({
          start: { x, y: sigY },
          end: { x: x + sigW, y: sigY },
          thickness: 0.7,
          color: textMuted,
        });
        const lw = fonts.regular.widthOfTextAtSize(label, 8);
        page.drawText(label, {
          x: x + (sigW - lw) / 2,
          y: sigY - 10,
          size: 8,
          font: fonts.regular,
          color: textMuted,
        });
      });
    }

    drawFooter(
      page,
      fonts,
      pageIdx + 1,
      totalPages,
      pageIdx === totalPages - 1
        ? 'RAW MARKS ONLY — ECZ computes the weighted score. Print and route via DEBS → PEO.'
        : undefined
    );
  }

  const bytes = await doc.save();
  downloadPdf(bytes, `ECZ_SBA_${input.subject.subjectCode}_${input.className.replace(/\s+/g, '_')}_${input.examYear}.pdf`);
}

// ==================== PUBLIC: INTERNAL OVERVIEW ====================

export interface InternalSbaOverviewInput {
  className: string;
  subject: SbaConfig;
  examYear: number;
  teacherName: string;
  students: SbaResult[];
}

/**
 * Internal overview PDF — for the teacher/HOD.
 * Includes weighted SBA and projected competency level.
 */
export async function generateInternalSbaOverview(
  input: InternalSbaOverviewInput
): Promise<void> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts: Fonts = { regular, bold };
  const logo = await embedSchoolLogo(doc);
  const ctx: DocContext = { doc, fonts, logo };

  const usesF1 = input.subject.sbaForms.includes('form1');
  const usesF2 = input.subject.sbaForms.includes('form2');
  const usesF3 = input.subject.sbaForms.includes('form3');

  const columns: Column[] = [
    { key: 'num', label: '#', width: 20, align: 'center' },
    { key: 'name', label: 'Student', width: 130, align: 'left' },
    { key: 'studentId', label: 'ID', width: 66, align: 'left' },
  ];
  if (usesF1) columns.push({ key: 'f1', label: 'F1', width: 34, align: 'center' });
  if (usesF2) columns.push({ key: 'f2', label: 'F2', width: 34, align: 'center' });
  if (usesF3) columns.push({ key: 'f3', label: 'F3', width: 34, align: 'center' });

  // Weighted columns
  const remaining = CONTENT_WIDTH - columns.reduce((s, c) => s + c.width, 0);
  columns.push({ key: 'raw', label: 'Raw', width: Math.floor(remaining * 0.18), align: 'center', bold: true });
  columns.push({
    key: 'weighted',
    label: `Wtd / ${input.subject.sbaWeightPercent}`,
    width: Math.floor(remaining * 0.24),
    align: 'center',
    bold: true,
    color: primaryBlue,
  });
  columns.push({ key: 'pct', label: 'SBA %', width: Math.floor(remaining * 0.18), align: 'center', bold: true });
  columns.push({
    key: 'level',
    label: 'Level',
    width: remaining - Math.floor(remaining * 0.18) - Math.floor(remaining * 0.24) - Math.floor(remaining * 0.18),
    align: 'center',
    isLevel: true,
  });

  // Summary stats
  const totalStudents = input.students.length;
  const completeCount = input.students.filter(s => {
    return input.subject.sbaForms.every(f => {
      const v = (s as any)[`${f}Mark`];
      return v !== null && v !== undefined && v >= 0;
    });
  }).length;
  const validPcts = input.students.map(s => s.sbaRawPercentage).filter(p => p >= 0);
  const avgPct =
    validPcts.length > 0
      ? Math.round(validPcts.reduce((a, b) => a + b, 0) / validPcts.length)
      : -1;
  const levelCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  input.students.forEach(s => {
    if (s.sbaOnlyCompetencyLevel >= 1 && s.sbaOnlyCompetencyLevel <= 5) {
      levelCounts[s.sbaOnlyCompetencyLevel]++;
    }
  });

  const allRows: TableRow[] = input.students.map((s, i) => {
    const row: TableRow = {
      num: String(i + 1),
      name: s.studentName,
      studentId: s.customStudentId,
      raw: String(s.sbaRawTotal),
      weighted: s.weightedSbaScore >= 0 ? s.weightedSbaScore.toFixed(2) : '—',
      pct: s.sbaRawPercentage >= 0 ? `${s.sbaRawPercentage}%` : '—',
      level: s.sbaOnlyCompetencyLabel,
      _level: s.sbaOnlyCompetencyLevel,
    };
    if (usesF1) row.f1 = formatMark(s.form1Mark);
    if (usesF2) row.f2 = formatMark(s.form2Mark);
    if (usesF3) row.f3 = formatMark(s.form3Mark);
    return row;
  });

  const ROW_H = 22;
  const FIRST_PAGE_CAPACITY = 16;
  const NEXT_PAGE_CAPACITY = 26;
  const chunks = paginateRows(allRows, FIRST_PAGE_CAPACITY, NEXT_PAGE_CAPACITY);
  const totalPages = chunks.length;

  for (let pageIdx = 0; pageIdx < chunks.length; pageIdx++) {
    const page = doc.addPage(PAGE_SIZE);
    const isFirst = pageIdx === 0;

    const subtitle = `${input.subject.subjectName} (${input.subject.subjectCode})  •  ${input.className}  •  Exam Year ${input.examYear}`;
    let y = drawHeader(ctx, page, 'INTERNAL SBA OVERVIEW', subtitle);

    if (isFirst) {
      // Info panel
      y = drawInfoPanel(
        ctx,
        page,
        y,
        [
          ['Subject:', input.subject.subjectName],
          ['SBA Weight:', `${input.subject.sbaWeightPercent}%`],
          ['Raw Max:', String(input.subject.sbaRawMax)],
        ],
        [
          ['Class:', input.className],
          ['Exam Year:', String(input.examYear)],
          ['Teacher:', input.teacherName],
        ]
      );

      // Summary cards
      y = drawSummaryCards(ctx, page, y, [
        { label: 'Students', value: String(totalStudents), accent: primaryBlue },
        { label: 'Complete', value: `${completeCount}/${totalStudents}`, accent: levelColors[1] },
        { label: 'Avg SBA', value: avgPct >= 0 ? `${avgPct}%` : '—', accent: primaryBlue },
        {
          label: 'L1-L2 / L3-L5',
          value: `${levelCounts[1] + levelCounts[2]} / ${levelCounts[3] + levelCounts[4] + levelCounts[5]}`,
          accent: levelColors[4],
        },
      ]);

      // Not-for-submission disclaimer
      const disclaimer = 'Internal tracking only — final grading is done by ECZ.';
      page.drawText(disclaimer, {
        x: MARGIN,
        y: y - 4,
        size: 8,
        font: fonts.regular,
        color: textMuted,
      });
      y -= 20;
    } else {
      page.drawText(`${input.subject.subjectName} — continued (page ${pageIdx + 1} of ${totalPages})`, {
        x: MARGIN,
        y,
        size: 10,
        font: fonts.bold,
        color: primaryBlue,
      });
      y -= 18;
    }

    y = drawTableHeader(ctx, page, y, columns);
    chunks[pageIdx].forEach((row, i) => {
      y = drawTableRow(ctx, page, y, i, columns, row, ROW_H);
    });

    if (pageIdx === totalPages - 1) {
      y = drawLegend(page, fonts, y - 10, [
        'ABS = Absent',
        'N/C = Not Conducted',
        'L1 Outstanding · L2 Advanced · L3 Basic · L4 Satisfactory · L5 Unsatisfactory',
      ]);
    }

    drawFooter(
      page,
      fonts,
      pageIdx + 1,
      totalPages,
      pageIdx === totalPages - 1 ? 'Internal document — not for submission to ECZ.' : undefined
    );
  }

  const bytes = await doc.save();
  downloadPdf(bytes, `Internal_SBA_${input.subject.subjectCode}_${input.className.replace(/\s+/g, '_')}_${input.examYear}.pdf`);
}

// ==================== DOWNLOAD ====================

function downloadPdf(bytes: Uint8Array, filename: string): void {
  // pdf-lib returns Uint8Array<ArrayBufferLike>; TS 5.7+/@types/node 22+
  // no longer accepts that directly as BlobPart (which requires ArrayBuffer).
  // Copy into a fresh ArrayBuffer-backed Uint8Array to satisfy the type.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);

  const blob = new Blob([copy], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}