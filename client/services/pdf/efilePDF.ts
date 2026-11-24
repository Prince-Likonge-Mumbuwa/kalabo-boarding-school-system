// @/services/pdf/efilePDF.ts — the teacher's eFile as a PDF, made with
// pdf-lib (the library the report cards use): one document, one section, or
// the whole Teacher's File with a cover, a contents page and a divider for
// each section.
//
// It reads the same Markdown the app shows (DocumentPaper / Markdown.tsx):
// headings, paragraphs, **bold**, *italics*, bullet and numbered lists,
// tables (with <br> inside cells), dividers, code, maths ($…$ and $$…$$) and
// ```figure blocks. Figures and maths are drawn by the app's own renderers
// (the same SVG as on screen) and placed as sharp pictures; text stays real
// text. The screen-only checks under figures (`_check`) are never printed.
//
// Fonts: DejaVu Serif (client/assets/fonts, free licence), because the PDF
// standard fonts cannot print °, ², ≤, π, →, ✓ or Zambian names with accents.
//
// Everything that needs a browser (fonts, the logo, drawing SVG to PNG) comes
// in through `PdfKit`, so the layout can also run in tests (efilePDF.spec.ts).
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage, type RGB } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { startsTeacherPage } from '@/lib/teacherPage';

// ───────────────────────────── Inputs ─────────────────────────────

export interface PdfKit {
  fonts: { regular: Uint8Array; bold: Uint8Array; italic: Uint8Array; boldItalic: Uint8Array };
  logo: { bytes: Uint8Array; kind: 'png' | 'jpg' } | null;
  /** A ```figure block's JSON -> its SVG (null if it cannot be drawn). */
  figureSvg(json: string): Promise<{ svg: string; size: 'small' | 'medium' | 'large'; title?: string } | null>;
  /** TeX -> SVG (MathJax). */
  mathSvg(tex: string, display: boolean): Promise<string | null>;
  /** SVG -> PNG at `scale` × its own size; width/height are the SVG's own size in CSS pixels. */
  rasterize(svg: string, scale: number): Promise<{ png: Uint8Array; width: number; height: number } | null>;
}

export interface PdfLetterhead {
  school: string;
  motto: string;
  /** "Lesson Plan", "Scheme of Work", "CPD Records"… printed at the top right. */
  kind: string;
  title: string;
  /** Up to six label/value pairs printed in the details strip (empty values print a line to fill in). */
  details: [string, string | undefined][];
}

/** One document of the file: its letterhead and its Markdown body. */
export interface PdfDocumentPart {
  letterhead: PdfLetterhead;
  markdown: string;
  landscape?: boolean;
  /** Scanned pages (JPEG or PNG), each printed on its own portrait page after the text. */
  scans?: { bytes: Uint8Array; caption: string }[];
}

export interface PdfSection {
  /** "Section 8", "11 (iii)": printed on the divider. */
  label: string;
  /** "7.", "iii.": printed in the contents. */
  ref: string;
  title: string;
  description: string;
  /** A part of a section (printed indented in the contents, with a smaller divider). */
  sub?: boolean;
  /** A section made only of parts (Assessment Records): its divider lists them. */
  parts?: string[];
  documents: PdfDocumentPart[];
}

export interface PdfFileInfo {
  ministry: string;
  school: string;
  motto: string;
  teacher: string;
  /** Lines under the teacher's name on the cover (department, term, year). */
  coverLines: string[];
  /** The Teacher's Details page, as on the school's form. */
  details: [string, string][];
  sections: PdfSection[];
}

// ───────────────────────────── Markdown ─────────────────────────────

export type Inline = { t: 'text'; s: string; bold?: boolean; italic?: boolean; code?: boolean } | { t: 'math'; tex: string } | { t: 'br' };
export type Block =
  | { b: 'h'; level: number; inline: Inline[]; newPage?: boolean }
  | { b: 'p'; inline: Inline[] }
  | { b: 'list'; ordered: boolean; start: number; items: Inline[][] }
  | { b: 'table'; head: Inline[][] | null; rows: Inline[][][] }
  | { b: 'figure'; json: string }
  | { b: 'math'; tex: string }
  | { b: 'code'; text: string }
  | { b: 'hr' };

/** **bold**, *italic*, `code`, <br> and $maths$ in one line (as Markdown.tsx reads them). */
export function parseInline(text: string, style: { bold?: boolean; italic?: boolean } = {}): Inline[] {
  const out: Inline[] = [];
  const pattern = /(\$(?=[^\s$])[^$\n]*?[^\s$\\]\$|\$[^\s$]\$|\\\(.+?\\\)|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|<br\s*\/?>)/gi;
  let last = 0;
  const plain = (s: string) => { if (s) out.push({ t: 'text', s, ...style }); };
  for (const m of text.matchAll(pattern)) {
    plain(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('$')) out.push({ t: 'math', tex: tok.slice(1, -1) });
    else if (tok.startsWith('\\(')) out.push({ t: 'math', tex: tok.slice(2, -2) });
    else if (tok.startsWith('**')) out.push(...parseInline(tok.slice(2, -2), { ...style, bold: true }));
    else if (tok.startsWith('`')) out.push({ t: 'text', s: tok.slice(1, -1), code: true });
    else if (tok.startsWith('<')) out.push({ t: 'br' });
    else out.push(...parseInline(tok.slice(1, -1), { ...style, italic: true }));
    last = (m.index ?? 0) + tok.length;
    if ((tok.startsWith('$') || tok.startsWith('\\(')) && /^[\p{L}\d([]/u.test(text.slice(last, last + 1))) plain(' ');
  }
  plain(text.slice(last));
  return out;
}

const cellsOf = (row: string) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const isTableRow = (l: string) => l.trim().startsWith('|');
const isDivider = (l: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const FENCE = /^\s*```\s*([\w-]*)\s*$/;
const DISPLAY = /^\s*(\$\$|\\\[)/;
const SUBPART = /\s+(?=\((?:i{1,3}|iv|vi{0,3}|ix|x)\)\s)/g;
/**
 * Lines of a paragraph that must stay on lines of their own (as in ECZ papers
 * and marking keys): a sub-part "(a)", "(ii)", an "Answer:" line, or any line
 * after one that ends with its marks "[2]" or a mark code (M1, A1, B1).
 * KEEP IN STEP with joinLines in components/ai/Markdown.tsx.
 */
export function joinLines(lines: string[]): string {
  return lines.reduce((out, line, k) => {
    if (!k) return line;
    const prev = lines[k - 1].trimEnd();
    // Also a line starting with a "•" condition, and any line after a Markdown line break (two spaces at the end).
    const own = /^\s*(\((?:[a-h]|i{1,3}|iv|vi{0,3}|ix|x)\)|Answer\b|Answers\b|•)/i.test(line) || /(\]|\b[MAB]\d|\bft|\bcao)\s*$/i.test(prev) || / {2}$/.test(lines[k - 1]);
    return `${out}${own ? ' <br>' : ''} ${line}`;
  }, '');
}
const FIGURE_TYPES = /"type"\s*:\s*"(graph|chart|diagram|timeline|tree|map|molecule|image|circle|globe|venn|plane|geometry|solid|scene|climate|population|curve|food-web|genetic-cross|construction)"/;

/** The document's blocks, read exactly the way Markdown.tsx shows them. */
export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { blocks.push({ b: 'h', level: h[1].length, inline: parseInline(h[2]), newPage: startsTeacherPage(line) }); i++; continue; }
    const open = FENCE.exec(line);
    if (open) {
      const lang = open[1].toLowerCase();
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++]);
      if (i < lines.length) i++;
      const text = body.join('\n');
      if (lang === 'figure' || ((lang === '' || lang === 'json') && FIGURE_TYPES.test(text))) blocks.push({ b: 'figure', json: text });
      else blocks.push({ b: 'code', text });
      continue;
    }
    if (DISPLAY.test(line)) {
      const closer = line.trim().startsWith('$$') ? '$$' : '\\]';
      let tex = line.trim().slice(2);
      let done = tex.trimEnd().endsWith(closer) && tex.trim().length >= closer.length;
      i++;
      while (!done && i < lines.length) { const next = lines[i++]; tex += '\n' + next; done = next.trimEnd().endsWith(closer); }
      tex = tex.trimEnd();
      if (tex.endsWith(closer)) tex = tex.slice(0, -closer.length);
      blocks.push({ b: 'math', tex: tex.trim() });
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { blocks.push({ b: 'hr' }); i++; continue; }
    if (isTableRow(line)) {
      const rows: string[] = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(lines[i++]);
      const hasHead = rows.length > 1 && isDivider(rows[1]);
      blocks.push({
        b: 'table',
        head: hasHead ? cellsOf(rows[0]).map((c) => parseInline(c)) : null,
        rows: (hasHead ? rows.slice(2) : rows).filter((r) => !isDivider(r)).map((r) => cellsOf(r).map((c) => parseInline(c))),
      });
      continue;
    }
    if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = NUMBERED.test(line) && !BULLET.test(line);
      const pat = ordered ? NUMBERED : BULLET;
      const start = ordered ? Number(/^\s*(\d+)/.exec(line)![1]) : 1;
      const items: Inline[][] = [];
      while (i < lines.length && pat.test(lines[i])) items.push(parseInline(pat.exec(lines[i++])![1]));
      blocks.push({ b: 'list', ordered, start, items });
      continue;
    }
    const text: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s/.test(lines[i]) && !isTableRow(lines[i]) && !BULLET.test(lines[i]) && !NUMBERED.test(lines[i]) && !FENCE.test(lines[i]) && !DISPLAY.test(lines[i]))
      text.push(lines[i++]);
    const joined = joinLines(text);
    const withBreaks = /(^|\s)\(i\)\s/.test(joined) && /\s\(ii\)\s/.test(joined) ? joined.replace(SUBPART, '<br>') : joined;
    blocks.push({ b: 'p', inline: parseInline(withBreaks) });
  }
  return blocks;
}

/** Removes "[2]"-style source numbers (not in assessments, where "[2]" is marks). */
export const withoutCitations = (text: string) =>
  text.replace(/(?:[ \t]+|^)(?:\[\d{1,2}(?:\s*[,–-]\s*\d{1,2})*\])+(?=[\s.,;:)|]|$)/gm, '');

// ───────────────────────────── Layout ─────────────────────────────

const A4: [number, number] = [595.28, 841.89];
const NAVY = rgb(0.086, 0.196, 0.361); // #16325c, the crest navy
const SKY = rgb(0.357, 0.706, 0.867);  // #5bb4dd
const INK = rgb(0.12, 0.16, 0.22);
const MUTED = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.72, 0.75, 0.8);
const HEAD_FILL = rgb(0.93, 0.95, 0.98);
const MARGIN = 46;
const FOOTER = 30;
const BODY = 10.5;
/** MathJax draws 1em = 16 px = 12 pt; scale it to the body size. */
const MATH_PT_PER_PX = (0.75 * BODY) / 12;

interface Fonts { regular: PDFFont; bold: PDFFont; italic: PDFFont; boldItalic: PDFFont; mono: PDFFont }
interface Pic { image: PDFImage; w: number; h: number; /** Points below the baseline (maths). */ drop: number }
type Piece = { kind: 'text'; s: string; font: PDFFont; size: number; w: number } | { kind: 'pic'; pic: Pic; w: number } | { kind: 'space'; w: number };
interface Line { pieces: Piece[]; width: number; ascent: number; descent: number }

/** The writer: keeps the current page and y, adds pages, and remembers where each page starts. */
class Writer {
  page!: PDFPage;
  y = 0;
  width = 0;
  height = 0;
  readonly pages: { page: PDFPage; landscape: boolean }[] = [];
  private mathCache = new Map<string, Pic | null>();
  private landscape = false;

  constructor(readonly pdf: PDFDocument, readonly fonts: Fonts, readonly kit: PdfKit, readonly logo: PDFImage | null) {}

  get left() { return MARGIN; }
  get right() { return this.width - MARGIN; }
  get contentWidth() { return this.width - 2 * MARGIN; }
  get bottom() { return MARGIN + FOOTER - 10; }

  newPage(landscape = this.landscape) {
    this.landscape = landscape;
    const size: [number, number] = landscape ? [A4[1], A4[0]] : A4;
    this.page = this.pdf.addPage(size);
    this.width = size[0];
    this.height = size[1];
    this.y = this.height - MARGIN;
    this.pages.push({ page: this.page, landscape });
  }

  /** Makes room for `h` points, starting a new page if needed. */
  need(h: number) { if (this.y - h < this.bottom) this.newPage(); }

  // ── Text ──

  fontFor(r: { bold?: boolean; italic?: boolean; code?: boolean }) {
    if (r.code) return this.fonts.mono;
    return r.bold ? (r.italic ? this.fonts.boldItalic : this.fonts.bold) : r.italic ? this.fonts.italic : this.fonts.regular;
  }

  /** Text the font can draw (the mono standard font only knows Latin-1). */
  safe(s: string, font: PDFFont) {
    if (font !== this.fonts.mono) return s.replace(/\t/g, '  ');
    return s.replace(/[^\x20-\x7e\xa0-\xff]/g, (c) => ({ '−': '-', '–': '-', '—': '-', '‘': "'", '’': "'", '“': '"', '”': '"', '→': '->', '≤': '<=', '≥': '>=', '≠': '!=', '×': 'x', '÷': '/' }[c] ?? '?'));
  }

  width_(s: string, font: PDFFont, size: number) { return font.widthOfTextAtSize(this.safe(s, font), size); }

  async mathPic(tex: string, display: boolean): Promise<Pic | null> {
    const key = `${display ? 'D' : 'I'}${tex}`;
    if (this.mathCache.has(key)) return this.mathCache.get(key)!;
    let pic: Pic | null = null;
    try {
      const svg = await this.kit.mathSvg(tex, display);
      if (svg) {
        const r = await this.kit.rasterize(svg, 4);
        if (r) {
          const va = /vertical-align:\s*(-?[\d.]+)ex/.exec(svg);
          const drop = va ? -Number(va[1]) * 8 * MATH_PT_PER_PX : 0;
          pic = { image: await this.pdf.embedPng(r.png), w: r.width * MATH_PT_PER_PX, h: r.height * MATH_PT_PER_PX, drop };
        }
      }
    } catch { pic = null; }
    this.mathCache.set(key, pic);
    return pic;
  }

  /** Breaks inline content into lines no wider than `max`. */
  async lines(inline: Inline[], max: number, size: number, base: { bold?: boolean; italic?: boolean } = {}): Promise<Line[]> {
    const lines: Line[] = [];
    let cur: Piece[] = [];
    let w = 0;
    const lead = size * 0.78, tail = size * 0.24;
    const push = () => {
      while (cur.length && cur[cur.length - 1].kind === 'space') { w -= cur[cur.length - 1].w; cur.pop(); }
      let ascent = lead, descent = tail;
      for (const p of cur) if (p.kind === 'pic') { ascent = Math.max(ascent, p.pic.h - p.pic.drop); descent = Math.max(descent, p.pic.drop); }
      lines.push({ pieces: cur, width: w, ascent, descent });
      cur = []; w = 0;
    };
    const add = (p: Piece) => {
      if (p.kind === 'space' && !cur.length) return;
      if (p.kind !== 'space' && w + p.w > max + 0.5 && cur.length) push();
      cur.push(p); w += p.w;
    };
    for (const r of inline) {
      if (r.t === 'br') { push(); continue; }
      if (r.t === 'math') {
        const pic = await this.mathPic(r.tex, false);
        if (pic) add({ kind: 'pic', pic, w: pic.w + 1 });
        else for (const part of r.tex.split(/(\s+)/)) { const font = this.fonts.italic; if (/^\s+$/.test(part)) add({ kind: 'space', w: this.width_(' ', font, size) }); else if (part) add({ kind: 'text', s: part, font, size, w: this.width_(part, font, size) }); }
        continue;
      }
      const font = this.fontFor({ bold: r.bold || base.bold, italic: r.italic || base.italic, code: r.code });
      for (const part of r.s.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { add({ kind: 'space', w: this.width_(' ', font, size) }); continue; }
        // A word longer than the line is cut into pieces that fit.
        let word = part;
        while (this.width_(word, font, size) > max + 0.5 && word.length > 1) {
          let k = word.length - 1;
          while (k > 1 && this.width_(word.slice(0, k), font, size) > max) k--;
          add({ kind: 'text', s: word.slice(0, k), font, size, w: this.width_(word.slice(0, k), font, size) });
          push();
          word = word.slice(k);
        }
        add({ kind: 'text', s: word, font, size, w: this.width_(word, font, size) });
      }
    }
    if (cur.length || !lines.length) push();
    return lines;
  }

  /** Draws one line with its top at `top`; returns the line's height. */
  drawLine(line: Line, x: number, top: number, color: RGB = INK, align: 'left' | 'center' = 'left', width = 0) {
    const baseline = top - line.ascent;
    let cx = align === 'center' ? x + (width - line.width) / 2 : x;
    for (const p of line.pieces) {
      if (p.kind === 'text') this.page.drawText(this.safe(p.s, p.font), { x: cx, y: baseline, size: p.size, font: p.font, color });
      else if (p.kind === 'pic') this.page.drawImage(p.pic.image, { x: cx, y: baseline - p.pic.drop, width: p.pic.w, height: p.pic.h });
      cx += p.w;
    }
    return line.ascent + line.descent;
  }

  /** A paragraph (or heading) with page breaks between lines. */
  async paragraph(inline: Inline[], o: { size?: number; bold?: boolean; italic?: boolean; color?: RGB; indent?: number; after?: number; lineGap?: number; align?: 'left' | 'center' } = {}) {
    const size = o.size ?? BODY, indent = o.indent ?? 0;
    const lines = await this.lines(inline, this.contentWidth - indent, size, o);
    for (const l of lines) {
      const h = l.ascent + l.descent + (o.lineGap ?? size * 0.3);
      this.need(h);
      this.drawLine(l, this.left + indent, this.y, o.color, o.align, this.contentWidth - indent);
      this.y -= h;
    }
    this.y -= o.after ?? 5;
  }

  // ── Blocks ──

  async blocks(blocks: Block[], figureNumber: { n: number }) {
    for (let k = 0; k < blocks.length; k++) {
      const b = blocks[k];
      if (b.b === 'h') {
        if (b.newPage) this.newPage(); // learner notes: the answers go on their own page
        const size = b.level === 1 ? 14 : b.level === 2 ? 12.5 : b.level === 3 ? 11.2 : BODY;
        // Never leave a heading alone at the foot of a page.
        this.need(size * 1.6 + 46);
        this.y -= b.level <= 2 ? 8 : 4;
        await this.paragraph(b.inline, { size, bold: true, color: b.level <= 2 ? NAVY : INK, after: 3 });
        if (b.level <= 2) {
          this.page.drawLine({ start: { x: this.left, y: this.y + 1 }, end: { x: this.right, y: this.y + 1 }, thickness: 0.6, color: SKY });
          this.y -= 5;
        }
      } else if (b.b === 'p') await this.paragraph(b.inline);
      else if (b.b === 'list') {
        for (const [j, item] of b.items.entries()) {
          const mark = b.ordered ? `${b.start + j}.` : '•';
          const lines = await this.lines(item, this.contentWidth - 18, BODY);
          for (const [li, l] of lines.entries()) {
            const h = l.ascent + l.descent + BODY * 0.3;
            this.need(h);
            if (li === 0) this.page.drawText(mark, { x: this.left + 4, y: this.y - l.ascent, size: BODY, font: this.fonts.regular, color: INK });
            this.drawLine(l, this.left + 18, this.y);
            this.y -= h;
          }
          this.y -= 1.5;
        }
        this.y -= 4;
      } else if (b.b === 'table') await this.table(b.head, b.rows);
      else if (b.b === 'figure') await this.figure(b.json, ++figureNumber.n);
      else if (b.b === 'math') {
        const pic = await this.mathPic(b.tex, true);
        if (pic) {
          const scale = Math.min(1, this.contentWidth / pic.w);
          this.need(pic.h * scale + 8);
          this.page.drawImage(pic.image, { x: this.left + (this.contentWidth - pic.w * scale) / 2, y: this.y - pic.h * scale - 3, width: pic.w * scale, height: pic.h * scale });
          this.y -= pic.h * scale + 10;
        } else await this.paragraph([{ t: 'text', s: b.tex, italic: true }]);
      } else if (b.b === 'code') {
        const size = 9;
        const lines = b.text.split('\n');
        for (const l of lines) {
          this.need(size * 1.4);
          this.page.drawRectangle({ x: this.left, y: this.y - size * 1.4, width: this.contentWidth, height: size * 1.4, color: rgb(0.965, 0.97, 0.975) });
          this.page.drawText(this.safe(l, this.fonts.mono), { x: this.left + 6, y: this.y - size * 1.05, size, font: this.fonts.mono, color: INK });
          this.y -= size * 1.4;
        }
        this.y -= 6;
      } else if (b.b === 'hr') {
        this.need(10);
        this.page.drawLine({ start: { x: this.left, y: this.y - 4 }, end: { x: this.right, y: this.y - 4 }, thickness: 0.6, color: LINE });
        this.y -= 12;
      }
    }
  }

  async figure(json: string, number: number) {
    let drawn: Awaited<ReturnType<PdfKit['figureSvg']>> = null;
    try { drawn = await this.kit.figureSvg(json); } catch { drawn = null; }
    const caption = `Figure ${number}${drawn?.title ? `: ${drawn.title}` : ''}`;
    if (drawn) {
      const r = await this.kit.rasterize(drawn.svg, 3);
      if (r) {
        const frac = drawn.size === 'small' ? 0.48 : drawn.size === 'medium' ? 0.68 : 1;
        let w = Math.min(this.contentWidth * frac, r.width * 0.75 * 1.15);
        let h = (w * r.height) / r.width;
        const maxH = (this.height - 2 * MARGIN - FOOTER) * 0.62;
        if (h > maxH) { h = maxH; w = (h * r.width) / r.height; }
        this.need(h + 26);
        const image = await this.pdf.embedPng(r.png);
        this.page.drawImage(image, { x: this.left + (this.contentWidth - w) / 2, y: this.y - h - 4, width: w, height: h });
        this.y -= h + 8;
      }
    }
    await this.paragraph(parseInline(drawn ? caption : `${caption} (could not be drawn)`), { size: 9.5, italic: true, align: 'center', after: 8 });
  }

  async table(head: Inline[][] | null, rows: Inline[][][]) {
    const cols = Math.max(head?.length ?? 0, ...rows.map((r) => r.length));
    if (!cols) return;
    const size = cols >= 7 ? 8.3 : cols >= 5 ? 9 : 9.6, pad = 4;
    const all = [...(head ? [head] : []), ...rows];
    // Column widths: at least the longest word, then shared by how much text each column holds.
    const textOf = (c: Inline[]) => c.map((r) => (r.t === 'text' ? r.s : r.t === 'math' ? r.tex : ' ')).join('');
    const min: number[] = Array(cols).fill(18), want: number[] = Array(cols).fill(18);
    all.forEach((row, r) => {
      const font = head && r === 0 ? this.fonts.bold : this.fonts.regular;
      for (let j = 0; j < cols; j++) {
        const s = textOf(row[j] ?? []);
        const longest = Math.max(0, ...s.split(/\s+/).map((w) => this.width_(w, this.fonts.bold, size)));
        min[j] = Math.max(min[j], Math.min(longest, 120) + 2 * pad + 1);
        want[j] = Math.max(want[j], min[j], Math.min(this.width_(s, font, size), 260) + 2 * pad + 1);
      }
    });
    const total = this.contentWidth;
    let widths: number[];
    const sumMin = min.reduce((a, b) => a + b, 0), sumWant = want.reduce((a, b) => a + b, 0);
    if (sumWant <= total) widths = want.map((w) => (w * total) / sumWant);
    else if (sumMin >= total) widths = min.map((w) => (w * total) / sumMin);
    else { const extra = total - sumMin, room = want.map((w, j) => w - min[j]), sumRoom = room.reduce((a, b) => a + b, 0) || 1; widths = min.map((m, j) => m + (extra * room[j]) / sumRoom); }
    const layoutRow = async (row: Inline[][], bold: boolean) => {
      const cells = await Promise.all(Array.from({ length: cols }, (_, j) => this.lines(row[j] ?? [], widths[j] - 2 * pad, size, { bold })));
      const height = Math.max(...cells.map((ls) => ls.reduce((h, l) => h + l.ascent + l.descent + size * 0.22, 0))) + 2 * pad;
      return { cells, height };
    };
    const headRow = head ? await layoutRow(head, true) : null;
    const drawRow = (r: { cells: Line[][]; height: number }, fill?: RGB) => {
      let x = this.left;
      for (let j = 0; j < cols; j++) {
        this.page.drawRectangle({ x, y: this.y - r.height, width: widths[j], height: r.height, borderColor: LINE, borderWidth: 0.6, color: fill });
        let top = this.y - pad;
        for (const l of r.cells[j]) top -= this.drawLine(l, x + pad, top) + size * 0.22;
        x += widths[j];
      }
      this.y -= r.height;
    };
    if (headRow) { this.need(headRow.height + 20); drawRow(headRow, HEAD_FILL); }
    for (const row of rows) {
      const r = await layoutRow(row, false);
      if (this.y - r.height < this.bottom) {
        this.newPage();
        if (headRow) drawRow(headRow, HEAD_FILL); // the header again on the new page
      }
      drawRow(r);
    }
    this.y -= 9;
  }

  // ── Letterhead, cover, contents, dividers ──

  async letterhead(h: PdfLetterhead) {
    const top = this.y;
    if (this.logo) this.page.drawImage(this.logo, { x: this.left, y: top - 46, width: 46, height: 46 });
    const tx = this.left + (this.logo ? 56 : 0);
    this.page.drawText(h.school, { x: tx, y: top - 20, size: 15, font: this.fonts.bold, color: NAVY });
    this.page.drawText(h.motto, { x: tx, y: top - 35, size: 9.5, font: this.fonts.italic, color: MUTED });
    const kind = h.kind.toUpperCase();
    const kw = this.width_(kind, this.fonts.bold, 8.5) + 16;
    this.page.drawRectangle({ x: this.right - kw, y: top - 30, width: kw, height: 17, color: NAVY });
    this.page.drawText(kind, { x: this.right - kw + 8, y: top - 24.5, size: 8.5, font: this.fonts.bold, color: rgb(1, 1, 1) });
    this.y = top - 54;
    this.page.drawLine({ start: { x: this.left, y: this.y }, end: { x: this.right, y: this.y }, thickness: 1.8, color: NAVY });
    this.page.drawLine({ start: { x: this.left, y: this.y - 3 }, end: { x: this.right, y: this.y - 3 }, thickness: 0.7, color: SKY });
    this.y -= 14;
    await this.paragraph(parseInline(h.title), { size: 14, bold: true, color: NAVY, after: 4 });
    // Details strip: three columns, two rows.
    const colW = this.contentWidth / 3, rowH = 26;
    const rowsN = Math.ceil(h.details.length / 3);
    this.need(rowsN * rowH + 8);
    h.details.forEach(([label, value], k) => {
      const x = this.left + (k % 3) * colW, y = this.y - Math.floor(k / 3) * rowH;
      this.page.drawRectangle({ x, y: y - rowH, width: colW, height: rowH, borderColor: LINE, borderWidth: 0.6 });
      this.page.drawText(label.toUpperCase(), { x: x + 6, y: y - 10, size: 6.8, font: this.fonts.bold, color: MUTED });
      const v = value?.trim() ? value.trim() : '________________';
      let s = v;
      while (s.length > 3 && this.width_(s, this.fonts.regular, 9.5) > colW - 12) s = s.slice(0, -2);
      this.page.drawText(this.safe(s === v ? s : `${s}…`, this.fonts.regular), { x: x + 6, y: y - 21.5, size: 9.5, font: this.fonts.regular, color: value?.trim() ? INK : MUTED });
    });
    this.y -= rowsN * rowH + 12;
  }

  async document(d: PdfDocumentPart) {
    this.newPage(Boolean(d.landscape));
    await this.letterhead(d.letterhead);
    await this.blocks(parseBlocks(d.markdown), { n: 0 });
    for (const scan of d.scans ?? []) await this.scanPage(scan.bytes, scan.caption);
  }

  /** A scanned page, as large as the page allows, with its caption above. */
  async scanPage(bytes: Uint8Array, caption: string) {
    let image: PDFImage;
    try {
      image = bytes[0] === 0x89 ? await this.pdf.embedPng(bytes) : await this.pdf.embedJpg(bytes);
    } catch {
      return; // a damaged picture is left out rather than stopping the whole file
    }
    this.newPage(false);
    this.page.drawText(this.safe(caption, this.fonts.bold), { x: this.left, y: this.y - 10, size: 10, font: this.fonts.bold, color: INK });
    this.y -= 20;
    const maxW = this.contentWidth, maxH = this.y - this.bottom;
    const scale = Math.min(maxW / image.width, maxH / image.height);
    const w = image.width * scale, h = image.height * scale;
    const x = this.left + (maxW - w) / 2;
    this.page.drawImage(image, { x, y: this.y - h, width: w, height: h });
    this.page.drawRectangle({ x, y: this.y - h, width: w, height: h, borderColor: LINE, borderWidth: 0.6 });
    this.y -= h + 6;
  }
}

async function start(kit: PdfKit, title: string) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(title);
  pdf.setProducer('Kalabo Boarding SRS · AI Tools');
  pdf.setCreator('pdf-lib');
  const [regular, bold, italic, boldItalic, mono] = await Promise.all([
    pdf.embedFont(kit.fonts.regular, { subset: true }),
    pdf.embedFont(kit.fonts.bold, { subset: true }),
    pdf.embedFont(kit.fonts.italic, { subset: true }),
    pdf.embedFont(kit.fonts.boldItalic, { subset: true }),
    pdf.embedFont(StandardFonts.Courier),
  ]);
  let logo: PDFImage | null = null;
  try { logo = kit.logo ? (kit.logo.kind === 'png' ? await pdf.embedPng(kit.logo.bytes) : await pdf.embedJpg(kit.logo.bytes)) : null; } catch { logo = null; }
  return new Writer(pdf, { regular, bold, italic, boldItalic, mono }, kit, logo);
}

/** Page numbers (and a short footer line) on every page. */
function footers(w: Writer, left: string, skipFirst = false) {
  const total = w.pages.length;
  w.pages.forEach(({ page }, k) => {
    if (skipFirst && k === 0) return;
    const { width } = page.getSize();
    page.drawLine({ start: { x: MARGIN, y: MARGIN + 6 }, end: { x: width - MARGIN, y: MARGIN + 6 }, thickness: 0.5, color: LINE });
    page.drawText(w.safe(left, w.fonts.regular), { x: MARGIN, y: MARGIN - 6, size: 7.8, font: w.fonts.regular, color: MUTED });
    const right = `Page ${k + 1} of ${total}`;
    page.drawText(right, { x: width - MARGIN - w.width_(right, w.fonts.regular, 7.8), y: MARGIN - 6, size: 7.8, font: w.fonts.regular, color: MUTED });
  });
}

// ───────────────────────────── What the app calls ─────────────────────────────

/** One document (a lesson plan, an assessment, an entry) as a PDF. */
export async function documentPdf(kit: PdfKit, d: PdfDocumentPart): Promise<Uint8Array> {
  const w = await start(kit, d.letterhead.title);
  await w.document(d);
  footers(w, `${d.letterhead.school} · ${d.letterhead.kind}`);
  return w.pdf.save();
}

/** The Teacher's File (or some of its sections): cover, Teacher's Details, contents, then each section with its documents. */
export async function teacherFilePdf(kit: PdfKit, file: PdfFileInfo): Promise<Uint8Array> {
  const w = await start(kit, `Teacher's File: ${file.teacher}`);

  // Cover: Ministry, school, the file's name, the teacher, department, term and year.
  w.newPage(false);
  const cx = w.width / 2;
  const centred = (s: string, y: number, size: number, font: PDFFont, color: RGB = INK) =>
    w.page.drawText(w.safe(s, font), { x: cx - w.width_(s, font, size) / 2, y, size, font, color });
  w.page.drawRectangle({ x: 0, y: w.height - 16, width: w.width, height: 16, color: NAVY });
  w.page.drawRectangle({ x: 0, y: w.height - 20, width: w.width, height: 4, color: SKY });
  centred(file.ministry.toUpperCase(), w.height - 70, 14, w.fonts.bold, NAVY);
  if (w.logo) w.page.drawImage(w.logo, { x: cx - 60, y: w.height - 220, width: 120, height: 120 });
  centred(file.school.toUpperCase(), w.height - 255, 18, w.fonts.bold, NAVY);
  centred(file.motto, w.height - 276, 11, w.fonts.italic, MUTED);
  centred("TEACHER'S FILE", w.height - 370, 34, w.fonts.bold, NAVY);
  w.page.drawLine({ start: { x: cx - 120, y: w.height - 388 }, end: { x: cx + 120, y: w.height - 388 }, thickness: 1.2, color: SKY });
  centred(file.teacher || '________________________', w.height - 430, 17, w.fonts.bold);
  file.coverLines.forEach((l, k) => centred(l, w.height - 458 - k * 19, 12, w.fonts.regular, INK));
  w.page.drawRectangle({ x: 0, y: 0, width: w.width, height: 10, color: NAVY });

  // Teacher's Details, as on the school's form.
  w.newPage(false);
  centred(file.ministry.toUpperCase(), w.height - MARGIN - 8, 12, w.fonts.bold, NAVY);
  centred(file.school.toUpperCase(), w.height - MARGIN - 26, 12, w.fonts.bold, NAVY);
  centred("TEACHER'S DETAILS", w.height - MARGIN - 52, 16, w.fonts.bold, INK);
  w.y = w.height - MARGIN - 72;
  await w.table([parseInline('Field'), parseInline('Details')], file.details.map(([k, v]) => [parseInline(`**${k}**`), parseInline(v || '________________')]));

  // Contents (filled in once the page numbers are known)
  w.newPage(false);
  const contentsPage = w.page;
  const sectionStart: number[] = [];

  for (const s of file.sections) {
    // Divider: the section's reference and title, what it holds, and its documents.
    w.newPage(false);
    sectionStart.push(w.pages.length);
    const band = s.sub ? 96 : 128;
    w.page.drawRectangle({ x: 0, y: w.height - band, width: w.width, height: band, color: s.sub ? rgb(0.17, 0.3, 0.5) : NAVY });
    w.page.drawText(w.safe(s.sub ? s.label : s.label.toUpperCase(), w.fonts.bold), { x: MARGIN, y: w.height - (s.sub ? 48 : 62), size: 12, font: w.fonts.bold, color: SKY });
    w.page.drawText(w.safe(s.title, w.fonts.bold), { x: MARGIN, y: w.height - (s.sub ? 78 : 98), size: s.sub ? 20 : 24, font: w.fonts.bold, color: rgb(1, 1, 1) });
    w.y = w.height - band - 30;
    await w.paragraph(parseInline(s.description), { size: 10.5, color: MUTED, after: 12 });
    if (s.parts?.length) {
      await w.paragraph(parseInline('**This section contains:**'), { after: 4 });
      for (const part of s.parts) await w.paragraph(parseInline(part), { indent: 10, after: 1, size: 10.5 });
    } else if (s.documents.length) {
      await w.paragraph(parseInline(`**In this section (${s.documents.length}):**`), { after: 4 });
      for (const [k, d] of s.documents.entries()) await w.paragraph(parseInline(`${k + 1}. ${d.letterhead.title}`), { indent: 10, after: 1, size: 10 });
    } else await w.paragraph(parseInline('*Nothing filed in this section yet.*'), { color: MUTED });
    for (const d of s.documents) await w.document(d);
  }

  // Contents page
  {
    const page = contentsPage;
    const { height } = page.getSize();
    let y = height - MARGIN - 10;
    page.drawText('Contents', { x: MARGIN, y, size: 22, font: w.fonts.bold, color: NAVY });
    y -= 12;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A4[0] - MARGIN, y }, thickness: 1.4, color: NAVY });
    y -= 30;
    page.drawText('No.', { x: MARGIN, y, size: 9, font: w.fonts.bold, color: MUTED });
    page.drawText('CONTENTS', { x: MARGIN + 44, y, size: 9, font: w.fonts.bold, color: MUTED });
    page.drawText('PAGE', { x: A4[0] - MARGIN - w.width_('PAGE', w.fonts.bold, 9), y, size: 9, font: w.fonts.bold, color: MUTED });
    y -= 22;
    file.sections.forEach((s, k) => {
      const font = s.sub ? w.fonts.regular : w.fonts.bold, size = s.sub ? 10.5 : 11.5;
      const x0 = s.sub ? MARGIN + 44 : MARGIN, xt = s.sub ? MARGIN + 74 : MARGIN + 44;
      const count = s.documents.length ? `  (${s.documents.length})` : '';
      page.drawText(w.safe(s.ref, font), { x: x0, y, size, font, color: INK });
      page.drawText(w.safe(s.title, font), { x: xt, y, size, font, color: INK });
      page.drawText(count, { x: xt + w.width_(s.title, font, size), y, size: 9.5, font: w.fonts.regular, color: MUTED });
      const pageNo = String(sectionStart[k]);
      const xEnd = A4[0] - MARGIN - w.width_(pageNo, w.fonts.regular, size);
      for (let x = xt + w.width_(s.title + count, font, size) + 8; x < xEnd - 6; x += 5) page.drawText('.', { x, y, size: 10, font: w.fonts.regular, color: LINE });
      page.drawText(pageNo, { x: xEnd, y, size, font: w.fonts.regular, color: INK });
      y -= s.sub ? 21 : 26;
    });
  }

  footers(w, `${file.school} · Teacher's File: ${file.teacher}`, true);
  return w.pdf.save();
}

/** Starts the download of a finished PDF. */
export function downloadPdf(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'document'}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
