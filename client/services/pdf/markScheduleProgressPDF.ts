// @/services/pdf/markScheduleProgressPDF.ts
//
// The performance & progress pages of a subject's mark schedule (A4
// landscape), drawn from a SubjectProgressReport:
//
//   1. Progress table — every learner, every test of the year so far
//      (Term 1 W4, W8, EOT, term average, Term 2 …), year average, grade,
//      position and change from the first to the latest mark. Continues on
//      as many pages as the class needs; the class average is the last row.
//   2. Progress chart — class average and pass rate test by test, the 40%
//      pass line, grade spread, per-test statistics, most improved and
//      learners who need attention.
//
// Marks are shown as percentages so tests with different totals compare.

import { rgb, type PDFDocument, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { cellText, type LearnerProgressRow, type SubjectProgressReport } from '@/services/markScheduleProgress';

export interface ProgressPdfContext {
  font: PDFFont;
  fontBold: PDFFont;
  fontOblique: PDFFont;
  logo: PDFImage | null;
  schoolName: string;
  className: string;
  subject: string;
  term: string;
  year: number;
  teacherName: string;
}

const W = 841.89;
const H = 595.28;
const M = 36;
const CW = W - 2 * M;

const C = {
  primary: rgb(0.05, 0.25, 0.45),
  primaryLight: rgb(0.86, 0.91, 0.96),
  text: rgb(0.15, 0.15, 0.15),
  light: rgb(0.45, 0.45, 0.45),
  border: rgb(0.82, 0.82, 0.82),
  zebra: rgb(0.97, 0.97, 0.97),
  pass: rgb(0.1, 0.5, 0.25),
  fail: rgb(0.78, 0.18, 0.15),
  amber: rgb(0.8, 0.5, 0.05),
  white: rgb(1, 1, 1),
  grid: rgb(0.9, 0.9, 0.9),
};

const fit = (font: PDFFont, text: string, size: number, max: number) => {
  if (font.widthOfTextAtSize(text, size) <= max) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > max) t = t.slice(0, -1);
  return `${t}...`;
};

/** Colour for a percentage: fail red, quality (70%+) green, else text. */
const pctColor = (p: number | null) => (p === null ? C.light : Math.round(p) < 40 ? C.fail : Math.round(p) >= 70 ? C.pass : C.text);

export function addProgressPages(pdf: PDFDocument, report: SubjectProgressReport | null, ctx: ProgressPdfContext, error?: string) {
  const { font, fontBold, fontOblique } = ctx;
  const pages: PDFPage[] = [];

  const header = (title: string): { page: PDFPage; y: number } => {
    const page = pdf.addPage([W, H]);
    pages.push(page);
    let x = M;
    if (ctx.logo) {
      const d = ctx.logo.scaleToFit(34, 34);
      page.drawImage(ctx.logo, { x: M, y: H - M - d.height + 4, width: d.width, height: d.height });
      x += d.width + 10;
    }
    page.drawText(ctx.schoolName.toUpperCase(), { x, y: H - M - 6, size: 11, font: fontBold, color: C.primary });
    page.drawText(title, { x, y: H - M - 21, size: 13, font: fontBold, color: C.text });
    const meta = `${ctx.className}  ·  ${ctx.subject}  ·  ${ctx.term} ${ctx.year}  ·  ${ctx.teacherName}`;
    page.drawText(meta, { x: W - M - font.widthOfTextAtSize(meta, 8.5), y: H - M - 6, size: 8.5, font, color: C.light });
    page.drawLine({ start: { x: M, y: H - M - 30 }, end: { x: W - M, y: H - M - 30 }, thickness: 1, color: C.primary });
    return { page, y: H - M - 44 };
  };

  const finish = () => {
    const total = pages.length;
    pages.forEach((p, i) => {
      p.drawText(`Generated ${new Date().toLocaleString('en-GB')}`, { x: M, y: M - 16, size: 7, font, color: C.light });
      const t = `Progress ${i + 1} of ${total}`;
      p.drawText(t, { x: W - M - font.widthOfTextAtSize(t, 7), y: M - 16, size: 7, font, color: C.light });
    });
  };

  // ---------- nothing to show ----------
  if (!report || error || !report.points.length) {
    const { page, y } = header('PERFORMANCE PROGRESS');
    const msg = error
      ? `The progress report could not be loaded: ${error}`
      : 'No tests are set up for this year yet, so there is no progress to show.';
    page.drawText(fit(font, msg, 11, CW), { x: M, y: y - 20, size: 11, font, color: C.fail });
    finish();
    return;
  }

  // ======================= 1. PROGRESS TABLE =======================
  const nPoints = report.points.length;
  const colNo = 20, colPt = 30, colTermAvg = 34, colYear = 40, colGrade = 30, colPos = 28, colChange = 40;
  const fixed = colNo + nPoints * colPt + report.terms.length * colTermAvg + colYear + colGrade + colPos + colChange;
  const colName = Math.min(240, CW - fixed);
  const tableW = colNo + colName + fixed;
  const x0 = M + (CW - tableW) / 2;
  const rowH = 13.5;

  type Col = { w: number; text: string; kind: 'no' | 'name' | 'point' | 'termAvg' | 'year' | 'grade' | 'pos' | 'change'; key?: string };
  const cols: Col[] = [{ w: colNo, text: '#', kind: 'no' }, { w: colName, text: 'Learner', kind: 'name' }];
  for (const t of report.terms) {
    for (const p of t.points) cols.push({ w: colPt, text: p.short.split(' ')[1], kind: 'point', key: p.key });
    cols.push({ w: colTermAvg, text: 'Avg', kind: 'termAvg', key: t.key });
  }
  cols.push({ w: colYear, text: 'Year', kind: 'year' }, { w: colGrade, text: 'Grade', kind: 'grade' }, { w: colPos, text: 'Pos', kind: 'pos' }, { w: colChange, text: 'Change', kind: 'change' });

  const center = (page: PDFPage, text: string, x: number, w: number, y: number, size: number, f: PDFFont, color = C.text) =>
    page.drawText(text, { x: x + (w - f.widthOfTextAtSize(text, size)) / 2, y, size, font: f, color });

  const tableHeader = (page: PDFPage, y: number) => {
    // Row 1: term groups
    let x = x0 + colNo + colName;
    page.drawRectangle({ x: x0, y: y - 30, width: tableW, height: 30, color: C.primary });
    for (const t of report.terms) {
      const w = t.points.length * colPt + colTermAvg;
      center(page, `${t.term} ${t.year}`, x, w, y - 11, 8, fontBold, C.white);
      page.drawLine({ start: { x, y }, end: { x, y: y - 30 }, thickness: 0.6, color: C.white });
      x += w;
    }
    center(page, 'This year', x, colYear + colGrade + colPos + colChange, y - 11, 8, fontBold, C.white);
    page.drawLine({ start: { x, y }, end: { x, y: y - 30 }, thickness: 0.6, color: C.white });
    // Row 2: column labels
    let cx = x0;
    for (const c of cols) {
      if (c.kind === 'name') page.drawText(c.text, { x: cx + 4, y: y - 25, size: 8, font: fontBold, color: C.white });
      else center(page, c.text, cx, c.w, y - 25, 7.5, fontBold, C.white);
      cx += c.w;
    }
    return y - 32;
  };

  // Out-of totals under the header ("/50")
  const totalsRow = (page: PDFPage, y: number) => {
    let cx = x0;
    page.drawRectangle({ x: x0, y: y - 10, width: tableW, height: 10, color: C.primaryLight });
    for (const c of cols) {
      if (c.kind === 'name') page.drawText('Out of (marks shown as %)', { x: cx + 4, y: y - 7.5, size: 6.5, font: fontOblique, color: C.light });
      if (c.kind === 'point') {
        const p = report.points.find(pp => pp.key === c.key)!;
        center(page, p.totalMarks ? `/${p.totalMarks}` : '', cx, c.w, y - 7.5, 6.5, font, C.light);
      }
      cx += c.w;
    }
    return y - 11;
  };

  let { page, y } = header('PERFORMANCE PROGRESS — EVERY LEARNER, TEST BY TEST');
  page.drawText(
    'Percentages per test. Avg = term average (as on the report card). Year = average of the term averages. Change = latest mark minus first mark this year. ABS absent · N/C not conducted · — not entered yet.',
    { x: M, y, size: 7, font: fontOblique, color: C.light, maxWidth: CW },
  );
  y -= 12;
  y = tableHeader(page, y);
  y = totalsRow(page, y);

  const drawRow = (r: LearnerProgressRow | null, i: number, yy: number) => {
    const isAvg = r === null;
    if (isAvg) page.drawRectangle({ x: x0, y: yy - rowH + 3, width: tableW, height: rowH, color: C.primaryLight });
    else if (i % 2 === 1) page.drawRectangle({ x: x0, y: yy - rowH + 3, width: tableW, height: rowH, color: C.zebra });
    const ty = yy - 7;
    let cx = x0;
    for (const c of cols) {
      switch (c.kind) {
        case 'no':
          if (!isAvg) center(page, String(i + 1), cx, c.w, ty, 7.5, font, C.light);
          break;
        case 'name':
          page.drawText(isAvg ? 'Class average' : fit(font, r!.name, 8, c.w - 6), { x: cx + 4, y: ty, size: 8, font: isAvg ? fontBold : font, color: C.text });
          break;
        case 'point': {
          if (isAvg) {
            const m = report.stats[c.key!]?.mean ?? null;
            center(page, m === null ? '' : String(m), cx, c.w, ty, 8, fontBold, pctColor(m));
          } else {
            const cell = r!.cells[c.key!];
            const t = cellText(cell);
            const f = cell?.status === 'entered' ? font : fontOblique;
            const col = cell?.status === 'entered' ? pctColor(cell.percentage) : cell?.status === 'absent' ? C.amber : C.light;
            center(page, t, cx, c.w, ty, t.length > 2 ? 6.5 : 8, f, col);
          }
          break;
        }
        case 'termAvg': {
          let v: number | null;
          if (isAvg) {
            const vals = report.rows.map(x => x.termAverages[c.key!]).filter((x): x is number => x !== null);
            v = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
          } else v = r!.termAverages[c.key!] ?? null;
          page.drawRectangle({ x: cx, y: yy - rowH + 3, width: c.w, height: rowH, color: C.primary, opacity: 0.06 });
          center(page, v === null ? '' : String(v), cx, c.w, ty, 8, fontBold, pctColor(v));
          break;
        }
        case 'year': {
          let v: number | null;
          if (isAvg) {
            const vals = report.rows.map(x => x.yearAverage).filter((x): x is number => x !== null);
            v = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
          } else v = r!.yearAverage;
          center(page, v === null ? '—' : `${v}%`, cx, c.w, ty, 8, fontBold, pctColor(v));
          break;
        }
        case 'grade':
          if (!isAvg) center(page, r!.grade > 0 ? String(r!.grade) : '—', cx, c.w, ty, 8.5, fontBold, r!.grade === 9 ? C.fail : r!.grade > 0 && r!.grade <= 2 ? C.pass : C.text);
          break;
        case 'pos':
          if (!isAvg) center(page, r!.position, cx, c.w, ty, 8, font);
          break;
        case 'change':
          if (!isAvg && r!.change !== null) {
            const ch = Math.round(r!.change);
            center(page, ch > 0 ? `+${ch}` : String(ch), cx, c.w, ty, 8, fontBold, ch >= 5 ? C.pass : ch <= -5 ? C.fail : C.light);
          }
          break;
      }
      cx += c.w;
    }
    page.drawLine({ start: { x: x0, y: yy - rowH + 3 }, end: { x: x0 + tableW, y: yy - rowH + 3 }, thickness: 0.3, color: C.border });
  };

  if (!report.rows.length) {
    page.drawText('No learners in this class.', { x: x0 + 4, y: y - 10, size: 9, font: fontOblique, color: C.light });
    y -= 20;
  }
  report.rows.forEach((r, i) => {
    if (y - rowH < M + 8) {
      ({ page, y } = header('PERFORMANCE PROGRESS (continued)'));
      y = tableHeader(page, y);
      y = totalsRow(page, y);
    }
    drawRow(r, i, y);
    y -= rowH;
  });
  if (report.rows.length) {
    if (y - rowH < M + 8) {
      ({ page, y } = header('PERFORMANCE PROGRESS (continued)'));
      y = tableHeader(page, y);
    }
    drawRow(null, 0, y);
    y -= rowH;
  }

  // ======================= 2. PROGRESS CHART =======================
  ({ page, y } = header('CLASS PROGRESS CHART'));

  // ---- line chart (left) ----
  const chart = { x: M + 28, y: y - 220, w: 470, h: 200 };
  page.drawText('Class average and pass rate, test by test', { x: M, y, size: 9, font: fontBold, color: C.text });
  for (let v = 0; v <= 100; v += 20) {
    const gy = chart.y + (v / 100) * chart.h;
    page.drawLine({ start: { x: chart.x, y: gy }, end: { x: chart.x + chart.w, y: gy }, thickness: 0.4, color: C.grid });
    const t = `${v}%`;
    page.drawText(t, { x: chart.x - 4 - font.widthOfTextAtSize(t, 7), y: gy - 2.5, size: 7, font, color: C.light });
  }
  // Pass line at 40%
  const passY = chart.y + 0.4 * chart.h;
  page.drawLine({ start: { x: chart.x, y: passY }, end: { x: chart.x + chart.w, y: passY }, thickness: 0.8, color: C.fail, dashArray: [4, 3] });
  page.drawText('Pass 40%', { x: chart.x + chart.w - 38, y: passY + 3, size: 6.5, font: fontBold, color: C.fail });

  // Points are inset from the axes so their labels stay clear of them.
  const pad = 22;
  const step = nPoints > 1 ? (chart.w - 2 * pad) / (nPoints - 1) : 0;
  const px = (i: number) => (nPoints > 1 ? chart.x + pad + i * step : chart.x + chart.w / 2);
  const py = (v: number) => chart.y + (Math.max(0, Math.min(100, v)) / 100) * chart.h;

  // Term bands + labels
  let idx = 0;
  report.terms.forEach((t, ti) => {
    const a = px(idx), b = px(idx + t.points.length - 1);
    if (ti > 0) {
      const sx = (px(idx - 1) + a) / 2;
      page.drawLine({ start: { x: sx, y: chart.y }, end: { x: sx, y: chart.y + chart.h }, thickness: 0.6, color: C.border, dashArray: [2, 2] });
    }
    center(page, `${t.term}`, a - 10, b - a + 20, chart.y - 22, 7.5, fontBold, C.light);
    t.points.forEach((p, k) => {
      const lbl = p.short.split(' ')[1];
      center(page, lbl, px(idx + k) - 15, 30, chart.y - 11, 7, font, C.text);
    });
    idx += t.points.length;
  });

  const series = (vals: Array<number | null>, color: ReturnType<typeof rgb>, dash?: number[], labels = false) => {
    let prev: { x: number; y: number } | null = null;
    vals.forEach((v, i) => {
      if (v === null) { prev = null; return; }
      const pt = { x: px(i), y: py(v) };
      if (prev) page.drawLine({ start: prev, end: pt, thickness: 1.6, color, dashArray: dash });
      page.drawCircle({ x: pt.x, y: pt.y, size: 2.6, color, borderColor: C.white, borderWidth: 0.8 });
      if (labels) center(page, String(v), pt.x - 12, 24, pt.y + 5, 7, fontBold, color);
      prev = pt;
    });
  };
  const means = report.points.map(p => report.stats[p.key]?.mean ?? null);
  const passRates = report.points.map(p => report.stats[p.key]?.passRate ?? null);
  series(passRates, C.pass, [3, 2]);
  series(means, C.primary, undefined, true);
  if (!report.hasMarks) center(page, 'No marks saved yet', chart.x, chart.w, chart.y + chart.h / 2, 10, fontOblique, C.light);

  // Legend
  const ly = chart.y - 36;
  page.drawLine({ start: { x: chart.x, y: ly + 3 }, end: { x: chart.x + 18, y: ly + 3 }, thickness: 1.6, color: C.primary });
  page.drawText('Class average %', { x: chart.x + 22, y: ly, size: 7.5, font, color: C.text });
  page.drawLine({ start: { x: chart.x + 110, y: ly + 3 }, end: { x: chart.x + 128, y: ly + 3 }, thickness: 1.6, color: C.pass, dashArray: [3, 2] });
  page.drawText('Pass rate (% of learners at 40% or more)', { x: chart.x + 132, y: ly, size: 7.5, font, color: C.text });

  // ---- grade distribution (right) ----
  const gx = M + 540, gw = CW - 540, gTop = y - 14;
  page.drawText('Grades on the year average', { x: gx, y, size: 9, font: fontBold, color: C.text });
  const maxCount = Math.max(1, ...report.gradeDistribution);
  const barArea = { x: gx + 8, y: chart.y, w: gw - 16, h: gTop - chart.y - 14 };
  const bw = barArea.w / 9;
  report.gradeDistribution.forEach((n, i) => {
    const g = i + 1;
    const h = (n / maxCount) * barArea.h;
    const color = g <= 2 ? C.pass : g === 9 ? C.fail : g <= 6 ? C.primary : C.amber;
    const bx = barArea.x + i * bw + 3;
    if (n > 0) page.drawRectangle({ x: bx, y: barArea.y, width: bw - 6, height: h, color, opacity: 0.85 });
    center(page, String(n), bx, bw - 6, barArea.y + h + 3, 7, fontBold, C.text);
    center(page, String(g), bx, bw - 6, barArea.y - 11, 7.5, font, C.text);
  });
  page.drawLine({ start: { x: barArea.x, y: barArea.y }, end: { x: barArea.x + barArea.w, y: barArea.y }, thickness: 0.6, color: C.light });
  const graded = report.gradeDistribution.reduce((a, b) => a + b, 0);
  const passes = report.gradeDistribution.slice(0, 8).reduce((a, b) => a + b, 0);
  const quality = report.gradeDistribution[0] + report.gradeDistribution[1];
  page.drawText(
    graded ? `Pass (1–8): ${passes} of ${graded} (${Math.round((passes / graded) * 100)}%)  ·  Quality (1–2): ${quality}` : 'No grades yet',
    { x: gx, y: chart.y - 24, size: 7.5, font, color: C.text },
  );

  // ---- per-test statistics ----
  let sy = chart.y - 56;
  page.drawText('Test by test', { x: M, y: sy, size: 9, font: fontBold, color: C.text });
  sy -= 6;
  const sCols = [
    { t: 'Test', w: 110 }, { t: 'Out of', w: 46 }, { t: 'Entered', w: 50 }, { t: 'Absent', w: 46 }, { t: 'Not yet', w: 48 },
    { t: 'Class avg', w: 56 }, { t: 'Highest', w: 50 }, { t: 'Lowest', w: 50 }, { t: 'Pass rate', w: 56 }, { t: 'Quality', w: 50 },
  ];
  const sw = sCols.reduce((a, c) => a + c.w, 0);
  page.drawRectangle({ x: M, y: sy - 13, width: sw, height: 13, color: C.primary });
  let sx = M;
  for (const c of sCols) {
    if (c.t === 'Test') page.drawText(c.t, { x: sx + 4, y: sy - 9.5, size: 7.5, font: fontBold, color: C.white });
    else center(page, c.t, sx, c.w, sy - 9.5, 7.5, fontBold, C.white);
    sx += c.w;
  }
  sy -= 13;
  const statRowH = 11.5;
  const maxStatRows = Math.floor((sy - (M + 10)) / statRowH);
  report.points.slice(0, maxStatRows).forEach((p, i) => {
    const s = report.stats[p.key];
    if (i % 2 === 1) page.drawRectangle({ x: M, y: sy - statRowH, width: sw, height: statRowH, color: C.zebra });
    const vals = [
      p.label, p.totalMarks ? String(p.totalMarks) : '—', String(s.entered), String(s.absent), String(s.pending),
      s.mean === null ? '—' : `${s.mean}%`, s.highest === null ? '—' : `${Math.round(s.highest)}%`, s.lowest === null ? '—' : `${Math.round(s.lowest)}%`,
      s.passRate === null ? '—' : `${s.passRate}%`, s.qualityRate === null ? '—' : `${s.qualityRate}%`,
    ];
    let cx = M;
    vals.forEach((v, k) => {
      const color = k === 5 ? pctColor(s.mean) : k === 4 && s.pending > 0 ? C.amber : C.text;
      if (k === 0) page.drawText(v, { x: cx + 4, y: sy - 8.5, size: 7.5, font, color });
      else center(page, v, cx, sCols[k].w, sy - 8.5, 7.5, k === 5 ? fontBold : font, color);
      cx += sCols[k].w;
    });
    sy -= statRowH;
  });

  // ---- most improved / needs attention (right of the stats table) ----
  const lx = M + sw + 16;
  const lw = W - M - lx;
  let ly2 = chart.y - 56;
  const list = (title: string, rows: LearnerProgressRow[], color: ReturnType<typeof rgb>, line: (r: LearnerProgressRow) => string, empty: string, max: number) => {
    page.drawText(title, { x: lx, y: ly2, size: 9, font: fontBold, color });
    ly2 -= 12;
    if (!rows.length) {
      page.drawText(empty, { x: lx, y: ly2, size: 7.5, font: fontOblique, color: C.light });
      ly2 -= 14;
      return;
    }
    rows.slice(0, max).forEach(r => {
      page.drawText(fit(font, line(r), 7.5, lw), { x: lx, y: ly2, size: 7.5, font, color: C.text });
      ly2 -= 10;
    });
    if (rows.length > max) {
      page.drawText(`and ${rows.length - max} more (see the progress table)`, { x: lx, y: ly2, size: 7, font: fontOblique, color: C.light });
      ly2 -= 10;
    }
    ly2 -= 6;
  };
  const pctTxt = (v: number | null) => (v === null ? '—' : `${Math.round(v)}%`);
  list('Most improved', report.improved, C.pass, r => `${r.name}: ${pctTxt(r.first)} to ${pctTxt(r.latest)} (+${Math.round(r.change!)})`, 'No learner has risen by 10 points or more yet.', 5);
  const roomLeft = Math.max(1, Math.floor((ly2 - (M + 20)) / 10) - 2);
  list(
    'Needs attention',
    report.needsAttention,
    C.fail,
    r => `${r.name}: latest ${pctTxt(r.latest)}${r.change !== null && r.change <= -10 ? ` (down ${Math.abs(Math.round(r.change))})` : ''}`,
    'Nobody is below 40% or has dropped 10 points.',
    roomLeft,
  );

  if (report.problems.length) {
    page.drawText(fit(fontOblique, report.problems.join(' '), 7, CW), { x: M, y: M - 4, size: 7, font: fontOblique, color: C.fail });
  }

  finish();
}
