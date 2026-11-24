// @/components/ai/figures/render/svg.ts — small helpers shared by the figure
// drawers. Every figure is plain black-and-white SVG text (no colour, no
// external files), so it looks the same on screen, in print, photocopied, and
// as a picture inside the Word file.

/** The look of every figure: ECZ papers use a Times-like font and black lines. */
export const FONT = "'Times New Roman', Tinos, 'Liberation Serif', serif";
export const INK = '#111';
export const FAINT = '#b5b5b5';

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Short, unique ids so two figures in one document never share a pattern or clip path. */
let counter = 0;
export const uid = (prefix: string) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

export const n = (v: number) => (Math.round(v * 100) / 100).toString();

export function text(x: number, y: number, s: string, o: { size?: number; anchor?: 'start' | 'middle' | 'end'; weight?: string; italic?: boolean; halo?: boolean; baseline?: string } = {}) {
  const attrs = `x="${n(x)}" y="${n(y)}" font-family="${FONT}" font-size="${o.size ?? 13}" text-anchor="${o.anchor ?? 'start'}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.italic ? ' font-style="italic"' : ''}${o.baseline ? ` dominant-baseline="${o.baseline}"` : ''}`;
  const halo = o.halo ? `<text ${attrs} fill="none" stroke="#fff" stroke-width="3.5" stroke-linejoin="round">${esc(s)}</text>` : '';
  return `${halo}<text ${attrs} fill="${INK}">${esc(s)}</text>`;
}

/** Hatching (diagonal lines) and dot fills for shaded areas: they photocopy, colours do not. */
export function patterns(id: string) {
  return `<defs>
<pattern id="${id}-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${INK}" stroke-width="0.9"/></pattern>
<pattern id="${id}-band" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="${INK}" stroke-width="1"/></pattern>
<pattern id="${id}-dots" patternUnits="userSpaceOnUse" width="5" height="5"><circle cx="2.5" cy="2.5" r="0.9" fill="${INK}"/></pattern>
<marker id="${id}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${INK}"/></marker>
</defs>`;
}

export const fillFor = (id: string, shade: string | undefined) =>
  shade === 'hatch' ? `url(#${id}-hatch)` : shade === 'dots' ? `url(#${id}-dots)` : shade === 'grey' ? '#cfcfcf' : 'none';

export function svg(width: number, height: number, body: string, title = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(width)} ${n(height)}" width="${n(width)}" height="${n(height)}" role="img"${title ? ` aria-label="${esc(title)}"` : ''} style="max-width:100%;height:auto;background:#fff">${body}</svg>`;
}

/** A "nice" tick step for a range: 1, 2, 5, 10, 20, 50 … */
export function niceStep(range: number, target = 8) {
  const raw = range / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
}

/** Tick values from min to max at `step`. */
export function ticks(min: number, max: number, step: number) {
  const out: number[] = [];
  const start = Math.ceil(min / step - 1e-9) * step;
  for (let v = start; v <= max + 1e-9; v += step) out.push(Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e6) / 1e6);
  return out;
}

/** Word wrap for SVG text: lines of at most `max` characters. */
export function wrap(s: string, max: number): string[] {
  const words = String(s).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (line && (line + ' ' + w).length > max) {
      lines.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

export function multiline(x: number, y: number, lines: string[], o: { size?: number; anchor?: 'start' | 'middle' | 'end'; weight?: string; lineHeight?: number } = {}) {
  const lh = o.lineHeight ?? (o.size ?? 13) * 1.2;
  return lines.map((l, i) => text(x, y + i * lh, l, o)).join('');
}

/** Shown in place of a figure that cannot be drawn. */
export function placeholder(message: string, width = 480, height = 120) {
  return svg(width, height, `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" fill="#fff" stroke="${INK}" stroke-dasharray="5 4"/>${multiline(width / 2, height / 2 - 6, wrap(message, 60), { anchor: 'middle', size: 13 })}`);
}

// ── Geometry marks (screen coordinates: y grows downwards) ──

export interface XY { x: number; y: number }

/**
 * An angle mark at v between the rays towards a and b: a small arc with its
 * label, or a small square for a right angle. Draws the smaller of the two
 * angles unless `reflex` is set.
 */
export function angleMark(v: XY, a: XY, b: XY, o: { label?: string; right?: boolean; radius?: number; reflex?: boolean; space?: LabelSpace; noArc?: boolean } = {}) {
  const a1 = Math.atan2(a.y - v.y, a.x - v.x), b1 = Math.atan2(b.y - v.y, b.x - v.x);
  let diff = b1 - a1;
  while (diff <= -Math.PI) diff += 2 * Math.PI;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  if (o.reflex) diff = diff > 0 ? diff - 2 * Math.PI : diff + 2 * Math.PI;
  if (o.right) {
    if (o.noArc) return '';
    const s = 9, ua = { x: Math.cos(a1), y: Math.sin(a1) }, ub = { x: Math.cos(b1), y: Math.sin(b1) };
    const p1 = { x: v.x + s * ua.x, y: v.y + s * ua.y }, p3 = { x: v.x + s * ub.x, y: v.y + s * ub.y };
    const p2 = { x: p1.x + s * ub.x, y: p1.y + s * ub.y };
    return `<polyline points="${n(p1.x)},${n(p1.y)} ${n(p2.x)},${n(p2.y)} ${n(p3.x)},${n(p3.y)}" fill="none" stroke="${INK}" stroke-width="1"/>`;
  }
  // Small angles get a wider arc so the label fits between the arms.
  const r = o.radius ?? Math.max(16, Math.min(34, 22 / Math.max(0.35, Math.abs(diff))));
  const start = { x: v.x + r * Math.cos(a1), y: v.y + r * Math.sin(a1) };
  const end = { x: v.x + r * Math.cos(a1 + diff), y: v.y + r * Math.sin(a1 + diff) };
  const large = Math.abs(diff) > Math.PI ? 1 : 0;
  let out = o.noArc ? '' : `<path d="M${n(start.x)},${n(start.y)} A${n(r)},${n(r)} 0 ${large} ${diff > 0 ? 1 : 0} ${n(end.x)},${n(end.y)}" fill="none" stroke="${INK}" stroke-width="1"/>`;
  // The arc is an obstacle for labels placed later (drawn as short straight pieces).
  if (o.space && !o.noArc)
    for (let i = 0; i < 8; i++) {
      const t0 = a1 + (diff * i) / 8, t1 = a1 + (diff * (i + 1)) / 8;
      o.space.segs.push([{ x: v.x + r * Math.cos(t0), y: v.y + r * Math.sin(t0) }, { x: v.x + r * Math.cos(t1), y: v.y + r * Math.sin(t1) }]);
    }
  if (o.label && o.space) {
    // Try the middle of the angle first, then nearer each arm, then further out.
    const cands: XY[] = [];
    // Narrow angles need the label further out before it fits between the arms.
    for (const dr of [11, 20, 31, 44, 58, 74])
      for (const t of [0.5, 0.35, 0.65, 0.2, 0.8])
        cands.push({ x: v.x + (r + dr) * Math.cos(a1 + diff * t), y: v.y + (r + dr) * Math.sin(a1 + diff * t) });
    out += placeLabel(cands, o.label, o.space);
  } else if (o.label) {
    const mid = a1 + diff / 2, lr = r + 11;
    out += text(v.x + lr * Math.cos(mid), v.y + lr * Math.sin(mid) + 4, o.label, { size: 12, anchor: 'middle', halo: true });
  }
  return out;
}

/** Small tick(s) across the middle of a side, to show equal sides. */
export function tickMark(a: XY, b: XY, count = 1) {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len }, nrm = { x: -u.y, y: u.x };
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  let out = '';
  for (let i = 0; i < count; i++) {
    const c = { x: m.x + (i - (count - 1) / 2) * 4 * u.x, y: m.y + (i - (count - 1) / 2) * 4 * u.y };
    out += `<line x1="${n(c.x - 5 * nrm.x)}" y1="${n(c.y - 5 * nrm.y)}" x2="${n(c.x + 5 * nrm.x)}" y2="${n(c.y + 5 * nrm.y)}" stroke="${INK}" stroke-width="1"/>`;
  }
  return out;
}

/** A point's letter, pushed `gap` pixels away from it in the direction `dir`. */
export function pointLabel(p: XY, label: string, dir: XY, gap = 12, size = 14) {
  const len = Math.hypot(dir.x, dir.y) || 1;
  const ux = dir.x / len, uy = dir.y / len;
  const anchor = ux > 0.35 ? 'start' : ux < -0.35 ? 'end' : 'middle';
  return text(p.x + gap * ux, p.y + gap * uy + 5, label, { size, anchor, weight: 'bold', halo: true });
}

/** A side's length label beside its middle, on the side away from `away`. */
export function sideLabel(a: XY, b: XY, label: string, away: XY) {
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let nrm = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  if ((m.x - away.x) * nrm.x + (m.y - away.y) * nrm.y < 0) nrm = { x: -nrm.x, y: -nrm.y };
  return pointLabel(m, label, nrm, 10, 12).replace(/font-weight="bold"/g, '');
}

export const dot = (p: XY, r = 2.6) => `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="${r}" fill="${INK}"/>`;
export const seg = (a: XY, b: XY, o: { dashed?: boolean; width?: number } = {}) =>
  `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="${INK}" stroke-width="${o.width ?? 1.4}"${o.dashed ? ' stroke-dasharray="5 4"' : ''} stroke-linecap="round"/>`;

/**
 * The best direction for a point's letter: the middle of the widest gap
 * between the lines leaving the point (`rays`, screen directions).
 */
export function freeDirection(rays: XY[], fallback: XY = { x: -0.6, y: -0.8 }): XY {
  const angles = rays.filter((r) => Math.hypot(r.x, r.y) > 1e-9).map((r) => Math.atan2(r.y, r.x)).sort((a, b) => a - b);
  if (!angles.length) return fallback;
  let best = -1, dir = angles[0] + Math.PI;
  for (let i = 0; i < angles.length; i++) {
    const a = angles[i], b = i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI;
    if (b - a > best) { best = b - a; dir = a + (b - a) / 2; }
  }
  return { x: Math.cos(dir), y: Math.sin(dir) };
}

/** Screen directions of the lines through or ending at p (segments as point pairs). */
export function raysAt(p: XY, segments: [XY, XY][]): XY[] {
  const out: XY[] = [];
  for (const [a, b] of segments) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    const cross = Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len;
    const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (len * len);
    if (cross > 0.75 || t < -0.01 || t > 1.01) continue; // p is not on this segment
    if (t > 0.01) out.push({ x: a.x - p.x, y: a.y - p.y });
    if (t < 0.99) out.push({ x: b.x - p.x, y: b.y - p.y });
  }
  return out;
}

// ── Keeping labels apart ──

/** The rough box a piece of text covers (Times-like font). */
export interface Box { x0: number; y0: number; x1: number; y1: number }
export function textBox(cx: number, cy: number, s: string, size: number): Box {
  const w = s.length * size * 0.56 + 4, h = size + 2;
  return { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 };
}
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
function hitsSegment(b: Box, p: XY, q: XY) {
  for (let i = 0; i <= 24; i++) {
    const x = p.x + ((q.x - p.x) * i) / 24, y = p.y + ((q.y - p.y) * i) / 24;
    if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) return true;
  }
  return false;
}

/** What labels must keep clear of: lines already drawn and labels already placed. */
export interface LabelSpace { taken: Box[]; segs: [XY, XY][] }

/**
 * Places a label at the first candidate centre that touches nothing (or the
 * one touching least), records it, and returns the SVG text.
 */
export function placeLabel(cands: XY[], s: string, space: LabelSpace, o: { size?: number; bold?: boolean } = {}) {
  const size = o.size ?? 12;
  let best = cands[0], bestHits = Infinity;
  for (const c of cands) {
    const b = textBox(c.x, c.y, s, size);
    const hits = space.taken.filter((t) => overlaps(t, b)).length * 2 + space.segs.filter(([p, q]) => hitsSegment(b, p, q)).length;
    if (hits < bestHits) { best = c; bestHits = hits; }
    if (!hits) break;
  }
  space.taken.push(textBox(best.x, best.y, s, size));
  return text(best.x, best.y + size * 0.36, s, { size, anchor: 'middle', halo: true, weight: o.bold ? 'bold' : undefined });
}

/** Records a point's letter (drawn by pointLabel) so other labels keep off it. */
export function reserveLetter(space: LabelSpace, p: XY, label: string, dir: XY, gap = 12, size = 14) {
  const len = Math.hypot(dir.x, dir.y) || 1;
  const ux = dir.x / len, uy = dir.y / len;
  const w = label.length * size * 0.56;
  const anchorShift = ux > 0.35 ? w / 2 : ux < -0.35 ? -w / 2 : 0;
  space.taken.push(textBox(p.x + gap * ux + anchorShift, p.y + gap * uy, label, size));
}

/** Arc radii for several angle marks at one point, so nested arcs (bearings from one north line) do not overlap. */
export function nestedRadii<T extends { at: string }>(marks: T[], size: (m: T) => number): Map<T, number | undefined> {
  const out = new Map<T, number | undefined>();
  const byVertex = new Map<string, T[]>();
  for (const m of marks) byVertex.set(m.at, [...(byVertex.get(m.at) ?? []), m]);
  for (const group of byVertex.values()) {
    if (group.length === 1) { out.set(group[0], undefined); continue; }
    [...group].sort((a, b) => size(a) - size(b)).forEach((m, k) => out.set(m, 18 + 13 * k));
  }
  return out;
}
