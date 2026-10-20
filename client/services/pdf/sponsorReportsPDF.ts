// @/services/pdf/sponsorReportsPDF.ts
//
// One PDF for a sponsor: a cover list of their learners (in order of
// form/grade), then every learner's report card — the same card the admin
// and parents download — in the same order.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { embedSchoolLogo } from '@/lib/schoolLogo';
import { generateReportCardPDF } from './reportCardPDFLib';
import { levelHeading } from '@/services/guidancePlan';
import type { ReportCardData } from '@/services/resultsService';
import type { SponsoredLearnerLite } from '@/services/guidanceService';

export interface SponsorPdfInput {
  sponsorName: string;
  term: string;
  year: number;
  /** Already in order of form/grade. */
  cards: ReportCardData[];
  noResults: SponsoredLearnerLite[];
}

/** The standard PDF fonts cannot print every character; keep what they can. */
const safe = (s: unknown) =>
  String(s ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\x20-\x7E]/g, '');

function fit(text: string, font: PDFFont, size: number, width: number): string {
  let t = safe(text);
  if (font.widthOfTextAtSize(t, size) <= width) return t;
  while (t.length > 1 && font.widthOfTextAtSize(t + '...', size) > width) t = t.slice(0, -1);
  return t + '...';
}

async function coverPages(pdf: PDFDocument, input: SponsorPdfInput) {
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedSchoolLogo(pdf);
  const navy = rgb(0.055, 0.2, 0.42);
  const muted = rgb(0.34, 0.41, 0.53);
  const dark = rgb(0.08, 0.16, 0.28);
  const line = rgb(0.78, 0.86, 0.94);
  const band = rgb(0.965, 0.978, 0.995);
  const [W, H] = [595.28, 841.89];
  const M = 40;

  const cols = [
    { label: '#', w: 24 },
    { label: 'Learner', w: 165 },
    { label: 'Student ID', w: 70 },
    { label: 'Class', w: 80 },
    { label: 'Average', w: 55 },
    { label: 'Grade', w: 45 },
    { label: 'Position', w: 76 },
  ];

  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;
  let pageNo = 1;

  const header = (first: boolean) => {
    if (first) {
      if (logo) {
        const s = 56 / logo.height;
        page.drawImage(logo, { x: M, y: y - 56, width: logo.width * s, height: 56 });
      }
      page.drawText('KALABO BOARDING SECONDARY SCHOOL', { x: M + 70, y: y - 18, size: 14, font: bold, color: navy });
      page.drawText("Sponsored learners' report cards", { x: M + 70, y: y - 36, size: 11, font: regular, color: dark });
      page.drawText(`${safe(input.term)} ${input.year}`, { x: M + 70, y: y - 51, size: 10, font: regular, color: muted });
      y -= 76;
      page.drawText('Sponsor:', { x: M, y, size: 11, font: bold, color: dark });
      page.drawText(fit(input.sponsorName, bold, 11, W - 2 * M - 60), { x: M + 55, y, size: 11, font: bold, color: navy });
      y -= 16;
      const total = input.cards.length + input.noResults.length;
      page.drawText(
        safe(`${total} learner${total === 1 ? '' : 's'} - ${input.cards.length} report card${input.cards.length === 1 ? '' : 's'} follow in order of form/grade. Generated ${new Date().toLocaleDateString('en-GB')}.`),
        { x: M, y, size: 9, font: regular, color: muted }
      );
      y -= 22;
    } else {
      page.drawText(safe(`${input.sponsorName} - ${input.term} ${input.year} (continued)`), { x: M, y: y - 10, size: 9, font: regular, color: muted });
      y -= 26;
    }
    let x = M;
    page.drawRectangle({ x: M, y: y - 5, width: W - 2 * M, height: 18, color: navy });
    for (const c of cols) {
      page.drawText(c.label, { x: x + 4, y, size: 8.5, font: bold, color: rgb(1, 1, 1) });
      x += c.w;
    }
    y -= 20;
  };

  const footer = () => {
    page.drawText(`Cover page ${pageNo}`, { x: W - M - 60, y: 22, size: 8, font: regular, color: muted });
  };

  const newPage = () => {
    footer();
    page = pdf.addPage([W, H]);
    pageNo++;
    y = H - M;
    header(false);
  };

  header(true);

  let lastLevel = '';
  input.cards.forEach((c, i) => {
    const level = String(c.form ?? '');
    if (level !== lastLevel) {
      if (y < M + 40) newPage();
      page.drawText(fit(levelHeading(c.className, level), bold, 9, 200), { x: M + 2, y: y - 2, size: 9, font: bold, color: navy });
      y -= 16;
      lastLevel = level;
    }
    if (y < M + 20) newPage();
    if (i % 2 === 0) page.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 15, color: band });
    const cells = [
      String(i + 1),
      c.studentName,
      c.studentId,
      c.className,
      c.percentage >= 0 ? `${c.percentage}%` : '-',
      c.overallGrade > 0 ? String(c.overallGrade) : '-',
      c.position || '-',
    ];
    let x = M;
    cells.forEach((v, k) => {
      page.drawText(fit(v, regular, 8.5, cols[k].w - 6), { x: x + 4, y, size: 8.5, font: regular, color: dark });
      x += cols[k].w;
    });
    if (c.isProvisional) page.drawText('*', { x: M + cols[0].w + cols[1].w - 6, y, size: 8.5, font: bold, color: rgb(0.75, 0.42, 0) });
    y -= 15;
  });

  if (input.cards.some(c => c.isProvisional)) {
    if (y < M + 30) newPage();
    y -= 4;
    page.drawText('* Provisional: some marks for this learner were still being entered.', { x: M, y, size: 8, font: regular, color: muted });
    y -= 14;
  }

  if (input.noResults.length) {
    if (y < M + 50) newPage();
    y -= 10;
    page.drawLine({ start: { x: M, y: y + 8 }, end: { x: W - M, y: y + 8 }, thickness: 0.6, color: line });
    page.drawText('No results entered yet for this term (no report card included):', { x: M, y: y - 4, size: 9, font: bold, color: dark });
    y -= 20;
    for (const l of input.noResults) {
      if (y < M + 20) newPage();
      page.drawText(fit(`${l.fullName}${l.studentId ? `  (${l.studentId})` : ''}${l.className ? ` - ${l.className}` : ''}`, regular, 8.5, W - 2 * M - 10), { x: M + 8, y, size: 8.5, font: regular, color: dark });
      y -= 13;
    }
  }
  footer();
}

export async function generateSponsorReportsPDF(
  input: SponsorPdfInput,
  onProgress?: (done: number, total: number) => void
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  out.setTitle(safe(`${input.sponsorName} - ${input.term} ${input.year} report cards`));
  out.setAuthor('Kalabo Boarding Secondary School');
  await coverPages(out, input);

  // Cards that show the same exams are drawn together (one call each run),
  // keeping the form order; each run's pages are then copied in.
  const runs: ReportCardData[][] = [];
  for (const c of input.cards) {
    const sig = (c.activeExams || []).join(',');
    const last = runs[runs.length - 1];
    if (last && (last[0].activeExams || []).join(',') === sig) last.push(c);
    else runs.push([c]);
  }
  let done = 0;
  for (const run of runs) {
    const bytes = await generateReportCardPDF(run as any, run[0].activeExams);
    const part = await PDFDocument.load(bytes);
    const pages = await out.copyPages(part, part.getPageIndices());
    pages.forEach(p => out.addPage(p));
    done += run.length;
    onProgress?.(done, input.cards.length);
  }
  return out.save();
}

export function sponsorPdfFileName(sponsorName: string, term: string, year: number): string {
  const clean = (s: string) => s.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  return `${clean(sponsorName) || 'Sponsor'}_${clean(term)}_${year}_ReportCards.pdf`;
}

export function downloadPdf(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
