// @/components/ai/figures/render/plane.ts — the Cartesian plane for
// coordinate geometry (points with coordinates, lines and segments on plain
// axes, as in ECZ sketches) and transformations (shapes and their images on
// 1-unit graph paper). Images are worked out exactly by figureMath, so a
// reflection or enlargement is always where it should be.
import type { PlaneShape, PlaneSpec } from '../spec';
import { applyTransform, parseLine, subscript, type Pt } from '../figureMath';
import { FAINT, INK, dot, esc, fillFor, freeDirection, n, niceStep, patterns, pointLabel, raysAt, seg, svg, text, ticks, uid, type XY } from './svg';

/** "A1B1C1" -> ["A1","B1","C1"]; "M" (a shape's name, not its corners) -> ["M"]. */
export const cornerNames = (name: string) => name.match(/[A-Z][0-9′']*/g) ?? [name];

export function renderPlane(spec: PlaneSpec): { svg: string; problems: string[] } {
  const problems: string[] = [];
  const id = uid('pl');
  const { x, y } = spec;
  const paper = spec.grid !== 'none';
  const unit = Math.min(520 / (x.max - x.min), 440 / (y.max - y.min), 42);
  const L = 34, R = 26, T = 24, B = 30;
  const pw = (x.max - x.min) * unit, ph = (y.max - y.min) * unit;
  const W = pw + L + R, H = ph + T + B;
  const S = (p: Pt) => ({ x: L + (p.x - x.min) * unit, y: T + (y.max - p.y) * unit });
  const drawn: [XY, XY][] = []; // straight lines on screen, so letters keep off them
  const parts: string[] = [patterns(id), `<clipPath id="${id}-clip"><rect x="${L}" y="${T}" width="${pw}" height="${ph}"/></clipPath>`];

  // Graph paper: a line at every unit.
  if (paper) {
    for (let v = Math.ceil(x.min); v <= x.max; v++) parts.push(`<line x1="${n(S({ x: v, y: 0 }).x)}" y1="${T}" x2="${n(S({ x: v, y: 0 }).x)}" y2="${T + ph}" stroke="${FAINT}" stroke-width="0.6"/>`);
    for (let v = Math.ceil(y.min); v <= y.max; v++) parts.push(`<line x1="${L}" y1="${n(S({ x: 0, y: v }).y)}" x2="${L + pw}" y2="${n(S({ x: 0, y: v }).y)}" stroke="${FAINT}" stroke-width="0.6"/>`);
  }
  // Axes (through the origin when it is in view)
  const o = S({ x: Math.min(Math.max(0, x.min), x.max), y: Math.min(Math.max(0, y.min), y.max) });
  parts.push(`<line x1="${L - 4}" y1="${n(o.y)}" x2="${L + pw + 14}" y2="${n(o.y)}" stroke="${INK}" stroke-width="1.2" marker-end="url(#${id}-arrow)"/>`);
  drawn.push([{ x: L - 4, y: o.y }, { x: L + pw + 14, y: o.y }], [{ x: o.x, y: T + ph + 4 }, { x: o.x, y: T - 14 }]);
  parts.push(`<line x1="${n(o.x)}" y1="${T + ph + 4}" x2="${n(o.x)}" y2="${T - 14}" stroke="${INK}" stroke-width="1.2" marker-end="url(#${id}-arrow)"/>`);
  parts.push(text(L + pw + 18, o.y + 4, x.label ?? 'x', { size: 13, italic: !x.label }), text(o.x + 6, T - 10, y.label ?? 'y', { size: 13, italic: !y.label }));
  if (paper) {
    const xs = x.step ?? (x.max - x.min > 16 ? niceStep(x.max - x.min, 10) : 1);
    const ys = y.step ?? (y.max - y.min > 16 ? niceStep(y.max - y.min, 10) : 1);
    for (const v of ticks(x.min, x.max, xs)) if (v !== 0) parts.push(text(S({ x: v, y: 0 }).x, o.y + 14, String(v), { size: 10, anchor: 'middle', halo: true }));
    for (const v of ticks(y.min, y.max, ys)) if (v !== 0) parts.push(text(o.x - 4, S({ x: 0, y: v }).y + 4, String(v), { size: 10, anchor: 'end', halo: true }));
  }
  parts.push(text(o.x - 4, o.y + 14, 'O', { size: 12, anchor: 'end', italic: true }));

  // Named points (for segments and lines that refer to them)
  const named: Record<string, Pt> = {};
  for (const p of spec.points ?? []) if (p.id) named[p.id] = { x: p.x, y: p.y };
  const at = (ref: string | [number, number]): Pt | null => {
    if (Array.isArray(ref)) return { x: ref[0], y: ref[1] };
    if (!named[ref]) problems.push(`Point ${ref} is used but not given.`);
    return named[ref] ?? null;
  };

  // Lines right across the view
  for (const l of spec.lines ?? []) {
    let eq: { a: number; b: number; c: number } | null = null;
    if (l.equation) {
      eq = parseLine(l.equation);
      if (!eq) problems.push(`Cannot read the line "${l.equation}" (write e.g. y = 2x - 1, x = 3).`);
    } else if (l.through) {
      const p = at(l.through[0]), q = at(l.through[1]);
      if (p && q) eq = { a: q.y - p.y, b: p.x - q.x, c: (q.y - p.y) * p.x + (p.x - q.x) * p.y };
    }
    if (!eq) continue;
    const ends = clipLine(eq, x.min, x.max, y.min, y.max);
    if (!ends) { problems.push(`The line ${l.equation ?? l.label ?? ''} is outside the axes.`); continue; }
    parts.push(`<g clip-path="url(#${id}-clip)">${seg(S(ends[0]), S(ends[1]), { dashed: l.dashed })}</g>`);
    drawn.push([S(ends[0]), S(ends[1])]);
    if (l.label) {
      const e = S(ends[1]);
      parts.push(text(Math.min(e.x, L + pw - 4), Math.max(T + 12, e.y - 6), l.label, { size: 12, anchor: 'end', italic: true, halo: true }));
    }
  }
  for (const sgm of spec.segments ?? []) {
    const p = at(sgm.from), q = at(sgm.to);
    if (p && q) { parts.push(seg(S(p), S(q), { dashed: sgm.dashed })); drawn.push([S(p), S(q)]); }
  }

  // Shapes and their images
  const shapes: Record<string, PlaneShape> = {};
  const drawShape = (sh: PlaneShape) => {
    const pts = sh.vertices.map(([px, py]) => S({ x: px, y: py }));
    parts.push(`<polygon points="${pts.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')}" fill="${fillFor(id, sh.shade)}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`);
    const names = cornerNames(sh.name);
    const c = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
    if (names.length === pts.length) pts.forEach((p, i) => parts.push(pointLabel(p, subscript(names[i]), { x: p.x - c.x, y: p.y - c.y }, 9, 13)));
    else parts.push(text(c.x, c.y + 5, subscript(sh.name), { size: 14, anchor: 'middle', weight: 'bold', italic: true, halo: true }));
  };
  for (const sh of spec.shapes ?? []) {
    if (sh.vertices.some((v) => v[0] < x.min || v[0] > x.max || v[1] < y.min || v[1] > y.max)) problems.push(`Shape ${sh.name} goes outside the axes.`);
    shapes[sh.name] = sh;
    drawShape(sh);
  }
  for (const im of spec.images ?? []) {
    const src = shapes[im.of];
    if (!src) { problems.push(`Image ${im.name}: there is no shape "${im.of}".`); continue; }
    let verts: [number, number][];
    try {
      verts = src.vertices.map(([px, py]) => { const q = applyTransform(im.transform, { x: px, y: py }); return [q.x, q.y] as [number, number]; });
    } catch (err) { problems.push((err as Error).message); continue; }
    const img: PlaneShape = { name: im.name, vertices: verts };
    shapes[im.name] = img;
    if (verts.some((v) => v[0] < x.min || v[0] > x.max || v[1] < y.min || v[1] > y.max)) problems.push(`Image ${im.name} goes outside the axes; widen them.`);
    if (!im.hidden) drawShape(img);
  }

  // Points last, so their letters sit on top
  for (const p of spec.points ?? []) {
    const sp = S({ x: p.x, y: p.y });
    parts.push(dot(sp, 2.8));
    const name = p.label ?? p.id ?? '';
    const words = `${name}${p.coords ? `(${fmtCoord(p.x)}, ${fmtCoord(p.y)})` : ''}`;
    if (words) parts.push(pointLabel(sp, words, freeDirection(raysAt(sp, drawn), { x: sp.x >= o.x ? 1 : -1, y: -1 }), 8, 12));
  }
  return { svg: svg(W, H, parts.join(''), esc(spec.title ?? 'Coordinate plane')), problems };
}

const fmtCoord = (v: number) => (Number.isInteger(v) ? String(v) : String(Number(v.toFixed(2)))).replace('-', '−');

/** Where the line ax + by = c enters and leaves the box. */
function clipLine(l: { a: number; b: number; c: number }, x0: number, x1: number, y0: number, y1: number): [Pt, Pt] | null {
  const hits: Pt[] = [];
  const add = (p: Pt) => { if (p.x >= x0 - 1e-9 && p.x <= x1 + 1e-9 && p.y >= y0 - 1e-9 && p.y <= y1 + 1e-9 && !hits.some((h) => Math.hypot(h.x - p.x, h.y - p.y) < 1e-9)) hits.push(p); };
  if (Math.abs(l.b) > 1e-12) { add({ x: x0, y: (l.c - l.a * x0) / l.b }); add({ x: x1, y: (l.c - l.a * x1) / l.b }); }
  if (Math.abs(l.a) > 1e-12) { add({ x: (l.c - l.b * y0) / l.a, y: y0 }); add({ x: (l.c - l.b * y1) / l.a, y: y1 }); }
  if (hits.length < 2) return null;
  hits.sort((p, q) => p.x - q.x || p.y - q.y);
  return [hits[0], hits[hits.length - 1]];
}
