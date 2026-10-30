// @/services/pdf/certificatePDF.ts
//
// Award certificates for the overall top three learners of a term — in each
// class and in each grade level. "Overall" is the report card's overall
// percentage: all subjects, all the term's tests (Week 4, Week 8, End of Term).
// One certificate per A4 landscape page, so a whole batch prints in one go.
//
// Each position has its own look, so they are easy to tell apart at a glance:
//
//   1st  Certificate of Excellence   navy frame + GOLD seal
//   2nd  Certificate of Merit        charcoal frame + SILVER seal
//   3rd  Certificate of Achievement  burgundy frame + BRONZE seal
//
// Grade level awards also get a laurel wreath around the seal and say
// "GRADE LEVEL AWARD" at the top; class awards say "CLASS AWARD".
//
// Fonts (open licence, in client/assets/fonts/) and the school logo are loaded
// by ./certificateAssets.ts. Tests can pass their own `assets` instead.
//
// pdf-lib draws from the BOTTOM-LEFT corner of the page (y grows upwards).

import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  BlendMode,
  rgb,
  type RGB,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

/* ============================================================
   TYPES
   ============================================================ */

export type AwardPosition = 1 | 2 | 3;
export type AwardScope = 'class' | 'level';

/** What one certificate says. Built by awardsService. */
export interface CertificateAward {
  learnerName: string;
  position: AwardPosition;
  /** Another learner has exactly the same overall mark → "Joint First Position". */
  tied: boolean;
  scope: AwardScope;
  /** "Form 2A" for a class award, "Form 2" for a grade level award. */
  groupLabel: string;
  /** Overall percentage (mean of the subject averages, as on the report card). */
  percentage: number;
  grade: number;
  /** Printed bottom-right so a certificate can be traced, e.g. KBS/2026/T3/F2A/1 */
  serialNumber: string;
}

export interface CertificateOptions {
  /** The tests the results cover, e.g. "Week 4, Week 8 and End of Term tests" */
  testsLabel: string;
  term: string;
  year: number;
  /** Print the learner's percentage and grade. Default true. */
  showScore?: boolean;
  /** Date printed bottom-left. Default: today. */
  issueDate?: Date;
  schoolName?: string;
  schoolLocation?: string;
  motto?: string;
  /** Labels under the two signature lines. Default: Head Teacher, and
   *  Form Teacher (class award) or Deputy Head Teacher (grade level award). */
  leftSignatory?: string;
  rightSignatory?: string;
}

/** Raw bytes of everything the certificate needs (see certificateAssets.ts). */
export interface CertificateAssets {
  cinzelRegular: Uint8Array;
  cinzelBold: Uint8Array;
  cormorantMedium: Uint8Array;
  cormorantBold: Uint8Array;
  cormorantItalic: Uint8Array;
  greatVibes: Uint8Array;
  logo: { bytes: Uint8Array; kind: 'png' | 'jpg' } | null;
}

/* ============================================================
   THEMES — one per position
   ============================================================ */

interface Theme {
  /** Big word under CERTIFICATE */
  titleWord: string;
  positionWord: string;
  /** The number in the seal and its suffix: 1 + st */
  numeral: string;
  suffix: string;
  /** Frame colour */
  dark: RGB;
  /** Main metal colour (gold / silver / bronze) */
  metal: RGB;
  metalLight: RGB;
  /** Darker metal — used for text so it stays readable */
  metalDeep: RGB;
  paper: RGB;
}

const THEMES: Record<AwardPosition, Theme> = {
  1: {
    titleWord: 'OF EXCELLENCE',
    positionWord: 'FIRST',
    numeral: '1',
    suffix: 'st',
    dark: rgb(0.055, 0.15, 0.32),
    metal: rgb(0.83, 0.65, 0.22),
    metalLight: rgb(0.98, 0.88, 0.55),
    metalDeep: rgb(0.62, 0.45, 0.09),
    paper: rgb(1, 0.992, 0.965),
  },
  2: {
    titleWord: 'OF MERIT',
    positionWord: 'SECOND',
    numeral: '2',
    suffix: 'nd',
    dark: rgb(0.17, 0.21, 0.27),
    metal: rgb(0.70, 0.73, 0.77),
    metalLight: rgb(0.94, 0.95, 0.97),
    metalDeep: rgb(0.40, 0.44, 0.50),
    paper: rgb(0.99, 0.992, 0.996),
  },
  3: {
    titleWord: 'OF ACHIEVEMENT',
    positionWord: 'THIRD',
    numeral: '3',
    suffix: 'rd',
    dark: rgb(0.33, 0.11, 0.10),
    metal: rgb(0.78, 0.49, 0.26),
    metalLight: rgb(0.96, 0.78, 0.60),
    metalDeep: rgb(0.55, 0.30, 0.12),
    paper: rgb(1, 0.985, 0.965),
  },
};

const INK = rgb(0.13, 0.15, 0.20);
const MUTED = rgb(0.38, 0.40, 0.46);

/* ============================================================
   MAIN FUNCTION
   ============================================================ */

/** Builds one PDF with one certificate per page, in the order given. */
export async function generateCertificatesPDF(
  awards: CertificateAward[],
  options: CertificateOptions,
  assets?: CertificateAssets,
): Promise<Uint8Array> {
  if (awards.length === 0) throw new Error('No certificates to print.');

  // Loaded only when certificates are made, so the rest of the app stays small.
  const a = assets ?? (await (await import('./certificateAssets')).loadCertificateAssets());

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  pdfDoc.setTitle(`Award Certificates — ${options.term} ${options.year}`);
  pdfDoc.setAuthor(options.schoolName ?? 'Kalabo Boarding Secondary School');
  pdfDoc.setCreator('Catalyst');

  const fonts: Fonts = {
    cinzel: await pdfDoc.embedFont(a.cinzelRegular, { subset: true }),
    cinzelBold: await pdfDoc.embedFont(a.cinzelBold, { subset: true }),
    serif: await pdfDoc.embedFont(a.cormorantMedium, { subset: true }),
    serifBold: await pdfDoc.embedFont(a.cormorantBold, { subset: true }),
    italic: await pdfDoc.embedFont(a.cormorantItalic, { subset: true }),
    script: await pdfDoc.embedFont(a.greatVibes, { subset: true }),
  };

  let logo: PDFImage | null = null;
  if (a.logo) {
    try {
      logo = a.logo.kind === 'png' ? await pdfDoc.embedPng(a.logo.bytes) : await pdfDoc.embedJpg(a.logo.bytes);
    } catch (err) {
      console.warn('School logo could not be added to the certificates:', err);
    }
  }

  for (const award of awards) {
    const page = pdfDoc.addPage([841.89, 595.28]); // A4 landscape
    drawCertificate(page, award, options, fonts, logo);
  }

  return pdfDoc.save();
}

/* ============================================================
   ONE CERTIFICATE
   ============================================================ */

interface Fonts {
  cinzel: PDFFont;
  cinzelBold: PDFFont;
  serif: PDFFont;
  serifBold: PDFFont;
  italic: PDFFont;
  script: PDFFont;
}

function drawCertificate(
  page: PDFPage,
  award: CertificateAward,
  o: CertificateOptions,
  f: Fonts,
  logo: PDFImage | null,
) {
  const t = THEMES[award.position];
  const W = page.getWidth();
  const H = page.getHeight();
  const cx = W / 2;

  /* ---------- Paper, frame and border pattern ---------- */
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: t.paper });
  page.drawRectangle({ x: 14, y: 14, width: W - 28, height: H - 28, color: t.dark });
  page.drawRectangle({ x: 40, y: 40, width: W - 80, height: H - 80, color: t.paper });
  drawRopeBorder(page, 27, W, H, t.metal);
  page.drawRectangle({ x: 40, y: 40, width: W - 80, height: H - 80, borderColor: t.metal, borderWidth: 2 });
  page.drawRectangle({ x: 48, y: 48, width: W - 96, height: H - 96, borderColor: t.metal, borderWidth: 0.6 });
  drawCorners(page, W, H, t);

  /* ---------- Watermark: the school badge, very faint ---------- */
  if (logo) {
    const s = 330;
    page.drawImage(logo, { x: cx - s / 2, y: H / 2 - s / 2 - 10, width: s, height: s, opacity: 0.06, blendMode: BlendMode.Multiply });
  }

  /* ---------- Header ---------- */
  if (logo) {
    const s = 86; // the badge picture has white space around it
    page.drawImage(logo, { x: cx - s / 2, y: H - 64 - s + 8, width: s, height: s, blendMode: BlendMode.Multiply });
  }
  const school = (o.schoolName ?? 'Kalabo Boarding Secondary School').toUpperCase();
  centerSpaced(page, school, 449, f.cinzelBold, 15, 1.6, t.dark);
  const sub = [o.schoolLocation ?? 'Kalabo, Western Province, Zambia', o.motto ?? '“Plant for Future Harvest”']
    .filter(Boolean)
    .join('   •   ');
  centerText(page, sub, 434, f.italic, 11, MUTED);

  // Award type: CLASS AWARD · FORM 2A   /   GRADE LEVEL AWARD · FORM 2
  const kind = award.scope === 'level' ? 'GRADE LEVEL AWARD' : 'CLASS AWARD';
  const badge = `${kind}  ·  ${award.groupLabel.toUpperCase()}`;
  // Cinzel's "1" looks like a capital I, so numbers use the serif font.
  const bw = centerMixed(page, 411, withSerifDigits(badge, f.cinzelBold, f.serifBold, 8.5, 2.2, t.metalDeep));
  rule(page, cx - bw / 2 - 70, cx - bw / 2 - 12, 414, t.metal, 0.8);
  rule(page, cx + bw / 2 + 12, cx + bw / 2 + 70, 414, t.metal, 0.8);

  /* ---------- Title ---------- */
  centerSpaced(page, 'CERTIFICATE', 362, f.cinzelBold, 42, 7, t.dark);
  const ww = centerSpaced(page, t.titleWord, 337, f.cinzel, 16, 5, t.metalDeep);
  ornamentRule(page, cx - ww / 2 - 120, cx - ww / 2 - 16, 342, t);
  ornamentRule(page, cx + ww / 2 + 16, cx + ww / 2 + 120, 342, t, true);

  /* ---------- Presented to ---------- */
  centerText(page, 'This certificate is proudly presented to', 308, f.italic, 15, MUTED);
  const nameSize = fitSize(award.learnerName, f.script, 48, 540);
  centerText(page, award.learnerName, 262, f.script, nameSize, INK);
  rule(page, cx - 220, cx - 6, 252, t.metal, 0.9);
  rule(page, cx + 6, cx + 220, 252, t.metal, 0.9);
  diamond(page, cx, 252, 3.2, t.metal);

  /* ---------- What for ---------- */
  const pos = `${award.tied ? 'JOINT ' : ''}${t.positionWord} POSITION OVERALL`;
  centerMixed(page, 228, [
    { text: 'for attaining ', font: f.italic, size: 14.5, color: MUTED },
    { text: pos, font: f.cinzelBold, size: 13.5, color: t.metalDeep, spacing: 1.2 },
  ]);
  const where = award.scope === 'level'
    ? `AMONG ALL ${award.groupLabel.toUpperCase()} LEARNERS`
    : `IN ${award.groupLabel.toUpperCase()}`;
  centerMixed(page, 202, withSerifDigits(where, f.cinzelBold, f.serifBold, fitSize(where, f.cinzelBold, 20, 540, 2), 2, t.dark));

  centerText(page, `${o.term} ${o.year} — all subjects, ${o.testsLabel}`, 181, f.italic, 13.5, INK);
  if (o.showScore !== false) {
    centerText(page, `with an overall average of ${fmtPct(award.percentage)}  (Grade ${award.grade})`, 164, f.serif, 12, MUTED);
  }

  /* ---------- Seal, signatures, footer ---------- */
  drawSeal(page, cx, 112, t, f, award.scope === 'level');

  signature(page, 205, 108, o.leftSignatory ?? 'Head Teacher', f, t);
  signature(page, W - 205, 108, o.rightSignatory ?? (award.scope === 'level' ? 'Deputy Head Teacher' : 'Form Teacher'), f, t);

  const issued = (o.issueDate ?? new Date()).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  page.drawText(`Issued ${issued}`, { x: 116, y: 60, size: 9.5, font: f.italic, color: MUTED });
  const serial = `No. ${award.serialNumber}`;
  page.drawText(serial, { x: W - 116 - f.italic.widthOfTextAtSize(serial, 9.5), y: 60, size: 9.5, font: f.italic, color: MUTED });
}

/* ============================================================
   DECORATION
   ============================================================ */

/** Two interlaced waves running round the dark frame, like banknote rope work. */
function drawRopeBorder(page: PDFPage, inset: number, W: number, H: number, color: RGB) {
  const amp = 5.5;
  const period = 14;
  const sides: Array<[number, number, number, number]> = [
    [inset, inset, W - inset, inset], // bottom
    [inset, H - inset, W - inset, H - inset], // top
    [inset, inset, inset, H - inset], // left
    [W - inset, inset, W - inset, H - inset], // right
  ];
  for (const [x1, y1, x2, y2] of sides) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    for (const phase of [0, Math.PI]) {
      let d = '';
      for (let s = 0; s <= len; s += 1.5) {
        const off = amp * Math.sin((s / period) * 2 * Math.PI + phase);
        const px = x1 + ux * s - uy * off;
        const py = y1 + uy * s + ux * off;
        // drawSvgPath measures y downwards from the origin we give it (0, H).
        d += `${d ? 'L' : 'M'}${px.toFixed(2)} ${(H - py).toFixed(2)} `;
      }
      page.drawSvgPath(d, { x: 0, y: H, borderColor: color, borderWidth: 0.7, borderOpacity: 0.75 });
    }
  }
}

/** Ornamental brackets in the four inner corners. */
function drawCorners(page: PDFPage, W: number, H: number, t: Theme) {
  const c = 56; // corner point
  const L = 46; // arm length
  const corners: Array<[number, number, number, number]> = [
    [c, c, 1, 1],
    [W - c, c, -1, 1],
    [c, H - c, 1, -1],
    [W - c, H - c, -1, -1],
  ];
  for (const [x, y, sx, sy] of corners) {
    page.drawLine({ start: { x, y }, end: { x: x + sx * L, y }, thickness: 1.6, color: t.metal });
    page.drawLine({ start: { x, y }, end: { x, y: y + sy * L }, thickness: 1.6, color: t.metal });
    page.drawLine({ start: { x: x + sx * 6, y: y + sy * 6 }, end: { x: x + sx * (L - 14), y: y + sy * 6 }, thickness: 0.6, color: t.metal });
    page.drawLine({ start: { x: x + sx * 6, y: y + sy * 6 }, end: { x: x + sx * 6, y: y + sy * (L - 14) }, thickness: 0.6, color: t.metal });
    diamond(page, x + sx * 14, y + sy * 14, 4.5, t.metal);
    page.drawCircle({ x: x + sx * L, y, size: 1.8, color: t.metal });
    page.drawCircle({ x, y: y + sy * L, size: 1.8, color: t.metal });
  }
}

/** The rosette seal with ribbons: gold / silver / bronze. */
function drawSeal(page: PDFPage, x: number, y: number, t: Theme, f: Fonts, laurel: boolean) {
  // Ribbon tails (behind the seal)
  for (const dir of [-1, 1]) {
    const x0 = x + dir * 12;
    const pts = [
      [x0 - 11, y - 10],
      [x0 + 11, y - 10],
      [x0 + 11 + dir * 12, y - 58],
      [x0 + dir * 12, y - 49],
      [x0 - 11 + dir * 12, y - 58],
    ];
    const d = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px} ${-py}`).join(' ') + ' Z';
    page.drawSvgPath(d, { x: 0, y: 0, color: t.dark, borderColor: t.metal, borderWidth: 0.8 });
  }

  if (laurel) drawLaurel(page, x, y, 52, t.metalDeep);

  // Serrated rosette edge
  const points = 36;
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? 45 : 40.5;
    const ang = (i / (points * 2)) * Math.PI * 2;
    d += `${i ? 'L' : 'M'}${(Math.cos(ang) * r).toFixed(2)} ${(Math.sin(ang) * r).toFixed(2)} `;
  }
  page.drawSvgPath(d + 'Z', { x, y, color: t.metal });

  // Rings give a pressed-metal look
  page.drawCircle({ x, y, size: 38, color: t.metalDeep });
  page.drawCircle({ x, y, size: 36, color: t.metal });
  page.drawCircle({ x, y, size: 31.5, borderColor: t.metalLight, borderWidth: 0.9 });
  page.drawCircle({ x, y, size: 29, borderColor: t.metalDeep, borderWidth: 0.5 });
  // soft highlight on the upper left
  page.drawCircle({ x: x - 9, y: y + 10, size: 18, color: t.metalLight, opacity: 0.22 });

  // Stars round the ring
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2 + Math.PI / 12;
    page.drawCircle({ x: x + Math.cos(ang) * 33.6, y: y + Math.sin(ang) * 33.6, size: 0.9, color: t.metalDeep });
  }

  // "1st" — a big lining numeral with a raised suffix, then PLACE
  const nSize = 30;
  const sSize = 11;
  const nw = f.serifBold.widthOfTextAtSize(t.numeral, nSize);
  const sw = f.serifBold.widthOfTextAtSize(t.suffix, sSize);
  const left = x - (nw + sw + 1) / 2;
  page.drawText(t.numeral, { x: left, y: y - 6, size: nSize, font: f.serifBold, color: t.dark });
  page.drawText(t.suffix, { x: left + nw + 1, y: y + 8, size: sSize, font: f.serifBold, color: t.dark });
  const pl = 'PLACE';
  const plw = spacedWidth(pl, f.cinzelBold, 6.5, 1.6);
  drawSpaced(page, pl, x - plw / 2, y - 17, f.cinzelBold, 6.5, 1.6, t.dark);
}

/** Two laurel branches curving up round the seal (grade level awards). */
function drawLaurel(page: PDFPage, cx: number, cy: number, r: number, color: RGB) {
  for (const side of [-1, 1]) {
    // Stem: an arc from the bottom of the seal up the side
    let stem = '';
    for (let a = 250; a >= 120; a -= 5) {
      const ang = (a * Math.PI) / 180;
      const px = cx + side * -Math.cos(ang) * r;
      const py = cy + Math.sin(ang) * r;
      stem += `${stem ? 'L' : 'M'}${px.toFixed(2)} ${(-py).toFixed(2)} `;
    }
    page.drawSvgPath(stem, { x: 0, y: 0, borderColor: color, borderWidth: 1 });

    // Leaves: pairs along the stem, pointing along it
    for (let a = 240; a >= 128; a -= 14) {
      const ang = (a * Math.PI) / 180;
      const px = cx + side * -Math.cos(ang) * r;
      const py = cy + Math.sin(ang) * r;
      // direction of travel along the arc (towards the top)
      const tx = side * -Math.sin(ang);
      const ty = -Math.cos(ang);
      for (const k of [-1, 1]) {
        // leaf leans outwards/inwards from the stem
        const lean = 0.55 * k;
        const dx = tx * Math.cos(lean) - ty * Math.sin(lean);
        const dy = tx * Math.sin(lean) + ty * Math.cos(lean);
        leaf(page, px, py, dx, dy, 9.5, color);
      }
    }
  }
}

function leaf(page: PDFPage, x: number, y: number, dx: number, dy: number, len: number, color: RGB) {
  const tipX = x + dx * len;
  const tipY = y + dy * len;
  const nx = -dy * len * 0.32;
  const ny = dx * len * 0.32;
  const mx = x + dx * len * 0.5;
  const my = y + dy * len * 0.5;
  const d =
    `M${x} ${-y} ` +
    `Q${mx + nx} ${-(my + ny)} ${tipX} ${-tipY} ` +
    `Q${mx - nx} ${-(my - ny)} ${x} ${-y} Z`;
  page.drawSvgPath(d, { x: 0, y: 0, color });
}

function signature(page: PDFPage, x: number, y: number, label: string, f: Fonts, t: Theme) {
  page.drawLine({ start: { x: x - 92, y }, end: { x: x + 92, y }, thickness: 0.8, color: INK });
  const up = label.toUpperCase();
  const w = spacedWidth(up, f.cinzelBold, 8.5, 1.6);
  drawSpaced(page, up, x - w / 2, y - 15, f.cinzelBold, 8.5, 1.6, t.dark);
}

function rule(page: PDFPage, x1: number, x2: number, y: number, color: RGB, thickness: number) {
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });
}

/** A line that tapers into a diamond at the inside end. */
function ornamentRule(page: PDFPage, x1: number, x2: number, y: number, t: Theme, flip = false) {
  rule(page, x1, x2, y, t.metal, 0.9);
  rule(page, x1 + 14, x2 - 14, y - 3, t.metal, 0.4);
  rule(page, x1 + 14, x2 - 14, y + 3, t.metal, 0.4);
  diamond(page, flip ? x1 - 2 : x2 + 2, y, 3.5, t.metal);
  page.drawCircle({ x: flip ? x2 : x1, y, size: 1.6, color: t.metal });
}

function diamond(page: PDFPage, x: number, y: number, r: number, color: RGB) {
  page.drawSvgPath(`M0 ${-r} L${r} 0 L0 ${r} L${-r} 0 Z`, { x, y, color });
}

/* ============================================================
   TEXT HELPERS
   ============================================================ */

function centerText(page: PDFPage, text: string, y: number, font: PDFFont, size: number, color: RGB) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: page.getWidth() / 2 - w / 2, y, size, font, color });
}

function spacedWidth(text: string, font: PDFFont, size: number, spacing: number) {
  return font.widthOfTextAtSize(text, size) + spacing * Math.max(0, text.length - 1);
}

/** Letter-spaced text (pdf-lib has no letter-spacing option, so one letter at a time). */
function drawSpaced(page: PDFPage, text: string, x: number, y: number, font: PDFFont, size: number, spacing: number, color: RGB) {
  let cx = x;
  for (const ch of text) {
    page.drawText(ch, { x: cx, y, size, font, color });
    cx += font.widthOfTextAtSize(ch, size) + spacing;
  }
}

/** Centred letter-spaced text; returns its width. */
function centerSpaced(page: PDFPage, text: string, y: number, font: PDFFont, size: number, spacing: number, color: RGB) {
  const w = spacedWidth(text, font, size, spacing);
  drawSpaced(page, text, page.getWidth() / 2 - w / 2, y, font, size, spacing, color);
  return w;
}

interface Run { text: string; font: PDFFont; size: number; color: RGB; spacing?: number }

/** One centred line made of several fonts; returns its width. */
function centerMixed(page: PDFPage, y: number, runs: Run[]) {
  // each run is followed by its letter spacing, so runs join evenly
  const widths = runs.map(r => spacedWidth(r.text, r.font, r.size, r.spacing ?? 0) + (r.spacing ?? 0));
  const total = widths.reduce((a, b) => a + b, 0) - (runs[runs.length - 1]?.spacing ?? 0);
  let x = page.getWidth() / 2 - total / 2;
  runs.forEach((r, i) => {
    drawSpaced(page, r.text, x, y, r.font, r.size, r.spacing ?? 0, r.color);
    x += widths[i];
  });
  return total;
}

/** Splits text so digits are drawn in `digitFont` and everything else in `font`. */
function withSerifDigits(text: string, font: PDFFont, digitFont: PDFFont, size: number, spacing: number, color: RGB): Run[] {
  return (text.match(/\d+|\D+/g) ?? []).map(part =>
    /\d/.test(part)
      ? { text: part, font: digitFont, size: size * 1.25, color, spacing }
      : { text: part, font, size, color, spacing },
  );
}

/** Largest size (≤ max) at which the text fits in maxWidth — for long names. */
function fitSize(text: string, font: PDFFont, max: number, maxWidth: number, spacing = 0) {
  let size = max;
  while (size > 10 && spacedWidth(text, font, size, spacing) > maxWidth) size -= 0.5;
  return size;
}

const fmtPct = (p: number) => `${Math.round(p * 10) / 10}%`;
