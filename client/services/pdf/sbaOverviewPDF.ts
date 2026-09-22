// @/services/pdf/sbaOverviewPDF.ts
// School-wide SBA overview PDF for admins.
// Mirrors the design language of sbaPDF.ts and reportCardPDFLib.ts.

import {
  PDFDocument,
  rgb,
  StandardFonts,
  PDFImage,
  PDFPage,
  PDFFont,
  RGB,
} from 'pdf-lib';
import type { SbaSchoolOverview } from '@/types/sba';

// ==================== BRANDING ====================

const SCHOOL_NAME = 'KALABO BOARDING SECONDARY SCHOOL';
const MINISTRY = 'MINISTRY OF EDUCATION';

// ==================== COLORS ====================

const white = rgb(1, 1, 1);
const navy = rgb(0.055, 0.20, 0.42);
const primaryBlue = rgb(0.02, 0.35, 0.70);
const textDark = rgb(0.08, 0.16, 0.28);
const textMuted = rgb(0.34, 0.41, 0.53);
const border = rgb(0.78, 0.86, 0.94);
const panelFill = rgb(0.965, 0.982, 1);
const rowFill = rgb(0.965, 0.978, 0.995);
const tableHeader = rgb(0.025, 0.28, 0.58);
const alertRed = rgb(0.86, 0.15, 0.15);

const levelColors: Record<number, RGB> = {
  1: rgb(0.13, 0.64, 0.29),
  2: rgb(0.15, 0.39, 0.92),
  3: rgb(0.02, 0.71, 0.71),
  4: rgb(0.92, 0.70, 0.03),
  5: rgb(0.86, 0.15, 0.15),
};

// ==================== PAGE CONSTANTS ====================

const PAGE_SIZE: [number, number] = [595.28, 841.89];
const MARGIN = 40;
const PAGE_WIDTH = PAGE_SIZE[0];
const PAGE_HEIGHT = PAGE_SIZE[1];
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// ==================== TYPES ====================

type Fonts = { regular: PDFFont; bold: PDFFont };
type DocContext = { doc: PDFDocument; fonts: Fonts; logo: PDFImage | null };

type Column = {
  key: string;
  label: string;
  width: number;
  align: 'left' | 'center';
  bold?: boolean;
  color?: RGB;
};

type TableRow = { [key: string]: string | number | undefined };

// ==================== LOGO ====================

async function embedSchoolLogo(doc: PDFDocument): Promise<PDFImage | null> {
  try {
    const res = await fetch('/images/school-logo.png');
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    try {
      return await doc.embedPng(bytes);
    } catch {
      try {
        return await doc.embedJpg(bytes);
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }
}

// ==================== DRAWING HELPERS ====================

function drawCenteredText(
  page: PDFPage,
  text: string,
  y: number,
  font: PDFFont,
  size: number,
  color: RGB = textDark
): void {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: (PAGE_WIDTH - w) / 2, y, size, font, color });
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
    x, y, width, height,
    color: fill,
    borderColor,
    borderWidth: 0.8,
  });
}

function drawPanelWithAccent(
  page: PDFPage,
  x: number, y: number, width: number, height: number,
  accent: RGB,
  fill: RGB = panelFill,
  borderColor: RGB = border
): void {
  drawPanel(page, x, y, width, height, fill, borderColor);
  page.drawRectangle({ x, y, width: 3, height, color: accent });
}

function drawVerticalText(
  page: PDFPage,
  text: string, x: number, rowY: number, rowHeight: number,
  font: PDFFont, size: number, color: RGB = textDark
): void {
  const h = font.heightAtSize(size);
  page.drawText(text, { x, y: rowY + (rowHeight - h) / 2 + 1, size, font, color });
}

// ==================== HEADER / FOOTER ====================

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
    const s = Math.min(70 / scaled.width, 70 / scaled.height);
    const w = scaled.width * s;
    const h = scaled.height * s;
    page.drawImage(logo, { x: (PAGE_WIDTH - w) / 2, y: y - h, width: w, height: h });
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
      x: MARGIN, y: footerY - 10, size: 7.5, font: fonts.regular, color: textMuted,
    });
  }
  page.drawText(`Generated: ${new Date().toLocaleString()}`, {
    x: MARGIN, y: footerY, size: 8, font: fonts.regular, color: textMuted,
  });
  const pageText = `Page ${pageNumber} of ${totalPages}`;
  const pageTextW = fonts.regular.widthOfTextAtSize(pageText, 8);
  page.drawText(pageText, {
    x: (PAGE_WIDTH - pageTextW) / 2, y: footerY, size: 8, font: fonts.regular, color: textMuted,
  });
  const sigWidth = 145;
  const sigX = PAGE_WIDTH - MARGIN - sigWidth;
  page.drawLine({
    start: { x: sigX, y: footerY + 14 },
    end: { x: sigX + sigWidth, y: footerY + 14 },
    thickness: 0.8, color: primaryBlue,
  });
  const sigText = 'Head Teacher';
  const sigTextW = fonts.regular.widthOfTextAtSize(sigText, 8);
  page.drawText(sigText, {
    x: sigX + (sigWidth - sigTextW) / 2, y: footerY - 1,
    size: 8, font: fonts.bold, color: navy,
  });
}

// ==================== INFO PANEL / CARDS ====================

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

  page.drawLine({
    start: { x: dividerX, y: panelY + 12 },
    end: { x: dividerX, y: panelY + panelHeight - 12 },
    thickness: 0.8, color: border,
  });

  const rowHeight = 20;
  const startY = panelY + panelHeight - 26;

  leftItems.forEach(([label, value], i) => {
    const rowY = startY - i * rowHeight;
    page.drawText(label, { x: leftX, y: rowY, size: 9.5, font: fonts.bold, color: textMuted });
    page.drawText(value, { x: leftX + 111, y: rowY, size: 10, font: fonts.regular, color: textDark });
  });

  rightItems.forEach(([label, value], i) => {
    const rowY = startY - i * rowHeight;
    page.drawText(label, { x: rightX, y: rowY, size: 9.5, font: fonts.bold, color: textMuted });
    page.drawText(value, { x: rightX + 94, y: rowY, size: 10, font: fonts.regular, color: textDark });
  });

  return panelY - 17;
}

function drawSummaryCards(
  ctx: DocContext,
  page: PDFPage,
  y: number,
  cards: Array<{ label: string; value: string; accent: RGB }>
): number {
  const { fonts } = ctx;
  const gap = 8;
  const cardWidth = (CONTENT_WIDTH - gap * (cards.length - 1)) / cards.length;
  const cardHeight = 44;
  const cardY = y - cardHeight;

  cards.forEach((c, i) => {
    const x = MARGIN + i * (cardWidth + gap);
    drawPanelWithAccent(page, x, cardY, cardWidth, cardHeight, c.accent);

    page.drawText(c.label.toUpperCase(), {
      x: x + 12, y: cardY + cardHeight - 14,
      size: 7, font: fonts.bold, color: textMuted,
    });
    page.drawText(c.value, {
      x: x + 12, y: cardY + 12,
      size: 16, font: fonts.bold, color: c.accent,
    });
  });

  return cardY - 20;
}

function drawLevelDistributionBar(
  ctx: DocContext,
  page: PDFPage,
  y: number,
  distribution: Record<number, number>
): number {
  const { fonts } = ctx;
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);

  if (total === 0) {
    page.drawText('No SBA entries recorded yet.', {
      x: MARGIN, y: y - 12, size: 9, font: fonts.regular, color: textMuted,
    });
    return y - 24;
  }

  const barHeight = 14;
  const barY = y - barHeight - 4;
  let cursorX = MARGIN;

  const labels: Record<number, string> = {
    1: 'Outstanding',
    2: 'Advanced',
    3: 'Basic',
    4: 'Satisfactory',
    5: 'Unsatisfactory',
  };

  for (const level of [1, 2, 3, 4, 5]) {
    const count = distribution[level] || 0;
    if (count === 0) continue;
    const segW = (count / total) * CONTENT_WIDTH;
    page.drawRectangle({
      x: cursorX, y: barY, width: segW, height: barHeight,
      color: levelColors[level],
    });
    if (segW > 22) {
      const text = `${count}`;
      const textW = fonts.bold.widthOfTextAtSize(text, 7);
      page.drawText(text, {
        x: cursorX + (segW - textW) / 2,
        y: barY + 4,
        size: 7,
        font: fonts.bold,
        color: white,
      });
    }
    cursorX += segW;
  }

  // Legend
  const legendY = barY - 12;
  let legendX = MARGIN;
  for (const level of [1, 2, 3, 4, 5]) {
    const count = distribution[level] || 0;
    if (count === 0) continue;
    page.drawRectangle({
      x: legendX, y: legendY, width: 6, height: 6, color: levelColors[level],
    });
    const text = `${labels[level]}: ${count}`;
    page.drawText(text, {
      x: legendX + 9, y: legendY, size: 7, font: fonts.regular, color: textMuted,
    });
    legendX += fonts.regular.widthOfTextAtSize(text, 7) + 18;
  }

  return legendY - 14;
}

// ==================== TABLES ====================

function drawTableHeader(
  ctx: DocContext,
  page: PDFPage,
  y: number,
  columns: Column[],
  headerHeight = 27
): number {
  const { fonts } = ctx;
  let tableX = MARGIN;

  columns.forEach(col => {
    page.drawRectangle({
      x: tableX, y: y - headerHeight, width: col.width, height: headerHeight,
      color: tableHeader,
    });
    const labelW = fonts.bold.widthOfTextAtSize(col.label, 9);
    const textX = col.align === 'center'
      ? tableX + (col.width - labelW) / 2
      : tableX + 9;
    page.drawText(col.label, {
      x: textX, y: y - headerHeight + 9,
      size: 9, font: fonts.bold, color: white,
    });
    tableX += col.width;
  });

  return y - headerHeight;
}

function drawTableRow(
  ctx: DocContext,
  page: PDFPage,
  y: number,
  rowIndex: number,
  columns: Column[],
  row: TableRow,
  rowHeight = 22
): number {
  const { fonts } = ctx;
  const rowY = y - rowHeight;
  const fill = rowIndex % 2 === 0 ? white : rowFill;
  let tableX = MARGIN;

  columns.forEach(col => {
    page.drawRectangle({
      x: tableX, y: rowY, width: col.width, height: rowHeight,
      color: fill, borderColor: border, borderWidth: 0.55,
    });
    const rawVal = row[col.key];
    const value = rawVal === undefined || rawVal === null ? '—' : String(rawVal);
    let font = fonts.regular;
    const size = 9;
    const color: RGB = col.color ?? textDark;
    if (col.bold) font = fonts.bold;

    const textW = font.widthOfTextAtSize(value, size);
    const textX = col.align === 'center'
      ? tableX + (col.width - textW) / 2
      : tableX + 9;

    drawVerticalText(page, value, textX, rowY, rowHeight, font, size, color);
    tableX += col.width;
  });

  return rowY;
}

function drawSectionTitle(
  ctx: DocContext,
  page: PDFPage,
  y: number,
  title: string
): number {
  const { fonts } = ctx;
  page.drawText(title, {
    x: MARGIN, y, size: 12, font: fonts.bold, color: navy,
  });
  page.drawLine({
    start: { x: MARGIN, y: y - 5 },
    end: { x: PAGE_WIDTH - MARGIN, y: y - 5 },
    thickness: 0.8,
    color: primaryBlue,
  });
  return y - 20;
}

// ==================== PUBLIC: SCHOOL OVERVIEW PDF ====================

export interface SbaSchoolOverviewPdfInput {
  overview: SbaSchoolOverview;
}

export async function generateSbaSchoolOverviewPDF(
  input: SbaSchoolOverviewPdfInput
): Promise<void> {
  const { overview } = input;

  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts: Fonts = { regular, bold };
  const logo = await embedSchoolLogo(doc);
  const ctx: DocContext = { doc, fonts, logo };

  // ==================== PAGE 1: SUMMARY ====================

  const page1 = doc.addPage(PAGE_SIZE);
  const subtitle = `Exam Year ${overview.examYear}  •  School-Wide Summary`;
  let y = drawHeader(ctx, page1, 'SBA SCHOOL-WIDE OVERVIEW', subtitle);

  // Info panel
  const completeSubjects = overview.perClass.reduce(
    (s, c) => s + c.subjectsComplete, 0
  );
  const totalSubjectsTracked = overview.perClass.reduce(
    (s, c) => s + c.subjectsTracked, 0
  );

  y = drawInfoPanel(
    ctx,
    page1,
    y,
    [
      ['Exam Year:', String(overview.examYear)],
      ['Classes Tracked:', String(overview.totalClasses)],
      ['Total Students:', String(overview.totalStudents)],
    ],
    [
      ['Subjects Tracked:', String(totalSubjectsTracked)],
      ['Subjects Complete:', String(completeSubjects)],
      ['Zero-Entry Subjects:', String(overview.subjectsWithZeroEntries.length)],
    ]
  );

  // Summary cards
  y = drawSummaryCards(ctx, page1, y, [
    {
      label: 'Overall Completion',
      value: `${overview.overallPercentComplete}%`,
      accent: primaryBlue,
    },
    {
      label: 'Avg SBA %',
      value: overview.avgSbaRawPercentage >= 0 ? `${overview.avgSbaRawPercentage}%` : '—',
      accent: levelColors[1],
    },
    {
      label: 'Total Records',
      value: String(overview.totalSbaRecords),
      accent: primaryBlue,
    },
    {
      label: 'Zero-Entry Subjects',
      value: String(overview.subjectsWithZeroEntries.length),
      accent: overview.subjectsWithZeroEntries.length > 0 ? alertRed : levelColors[1],
    },
  ]);

  // Level distribution
  y = drawSectionTitle(ctx, page1, y, 'Projected Competency Distribution (SBA Only)');
  y = drawLevelDistributionBar(ctx, page1, y, overview.levelDistribution);

  // Per-class table
  y = drawSectionTitle(ctx, page1, y, 'Per-Class Breakdown');

  const classColumns: Column[] = [
    { key: 'num', label: '#', width: 22, align: 'center' },
    { key: 'className', label: 'Class', width: 100, align: 'left' },
    { key: 'students', label: 'Students', width: 56, align: 'center' },
    { key: 'subjectsTracked', label: 'Subjects', width: 60, align: 'center' },
    { key: 'subjectsComplete', label: 'Complete', width: 60, align: 'center' },
    {
      key: 'completion',
      label: 'Completion',
      width: 76,
      align: 'center',
      bold: true,
      color: primaryBlue,
    },
    {
      key: 'avgSba',
      label: 'Avg SBA',
      width: CONTENT_WIDTH - 22 - 100 - 56 - 60 - 60 - 76,
      align: 'center',
      bold: true,
    },
  ];

  y = drawTableHeader(ctx, page1, y, classColumns);

  overview.perClass.forEach((c, i) => {
    const row: TableRow = {
      num: String(i + 1),
      className: c.className,
      students: String(c.totalStudents),
      subjectsTracked: String(c.subjectsTracked),
      subjectsComplete: `${c.subjectsComplete}/${c.subjectsTracked}`,
      completion: `${c.overallPercentComplete}%`,
      avgSba: c.avgSbaRawPercentage >= 0 ? `${c.avgSbaRawPercentage}%` : '—',
    };
    y = drawTableRow(ctx, page1, y, i, classColumns, row);
  });

  drawFooter(
    page1,
    fonts,
    1,
    1 + (overview.subjectsWithZeroEntries.length > 0 ? 1 : 0),
    'Internal tracking document — not for submission to ECZ.'
  );

  // ==================== PAGE 2 (optional): ZERO-ENTRY SUBJECTS ====================

  if (overview.subjectsWithZeroEntries.length > 0) {
    const page2 = doc.addPage(PAGE_SIZE);
    let y2 = drawHeader(
      ctx,
      page2,
      'SBA — SUBJECTS WITH ZERO ENTRIES',
      `Exam Year ${overview.examYear}  •  Requires Attention`
    );

    // Warning panel
    drawPanelWithAccent(
      page2,
      MARGIN,
      y2 - 40,
      CONTENT_WIDTH,
      40,
      alertRed
    );
    page2.drawText('These subjects have no SBA entries recorded.', {
      x: MARGIN + 14, y: y2 - 18,
      size: 10, font: bold, color: alertRed,
    });
    page2.drawText(
      'Contact the respective subject teachers to ensure marks are captured before ECZ submission deadlines.',
      { x: MARGIN + 14, y: y2 - 32, size: 9, font: regular, color: textDark }
    );
    y2 -= 58;

    const cols: Column[] = [
      { key: 'num', label: '#', width: 22, align: 'center' },
      { key: 'className', label: 'Class', width: 100, align: 'left' },
      { key: 'subject', label: 'Subject', width: 180, align: 'left' },
      {
        key: 'teacher',
        label: 'Teacher',
        width: CONTENT_WIDTH - 22 - 100 - 180,
        align: 'left',
      },
    ];

    y2 = drawTableHeader(ctx, page2, y2, cols);

    overview.subjectsWithZeroEntries.forEach((s, i) => {
      const row: TableRow = {
        num: String(i + 1),
        className: s.className,
        subject: s.subjectName,
        teacher: s.teacherName,
      };
      y2 = drawTableRow(ctx, page2, y2, i, cols, row);
    });

    drawFooter(
      page2,
      fonts,
      2,
      2,
      'Internal tracking document — not for submission to ECZ.'
    );
  }

  const bytes = await doc.save();
  downloadPdf(
    bytes,
    `SBA_Overview_${overview.examYear}.pdf`
  );
}

// ==================== DOWNLOAD ====================

function downloadPdf(bytes: Uint8Array, filename: string): void {
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