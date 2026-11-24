// @/components/ai/figures/render/graph.ts — function graphs: curves, straight
// lines, points, a shaded region, reference lines, on labelled axes. Values
// come from mathjs, the same library the AI server uses to work out the
// answers (intersections, areas), so the drawing and the marking key agree.
import { compile } from 'mathjs';
import type { GraphSpec } from '../spec';
import { FAINT, INK, esc, n, niceStep, patterns, placeLabel, seg, svg, text, textBox, ticks, uid, type LabelSpace, type XY } from './svg';
import { feasibleRegion, parseInequality, type Inequality, type Pt } from '../figureMath';

type Fn = (x: number) => number;

/** A safe y = f(x) from mathjs text; NaN where it is undefined. */
export function toFunction(expr: string): Fn {
  const code = compile(expr.replace(/^\s*y\s*=\s*/i, ''));
  return (x: number) => {
    try {
      const v = code.evaluate({ x, e: Math.E, pi: Math.PI });
      return typeof v === 'number' && Number.isFinite(v) ? v : NaN;
    } catch {
      return NaN;
    }
  };
}

export function renderGraph(spec: GraphSpec): string {
  const id = uid('g');
  // Room above the graph for a table of values (ECZ cubic questions).
  const TH = spec.table?.x.length ? 64 : 0;
  const W = 520, H = 400 + TH, L = 54, R = 30, T = 30 + TH, B = 50;
  const pw = W - L - R, ph = H - T - B;
  const { x, y } = spec;
  const sx = (v: number) => L + ((v - x.min) / (x.max - x.min)) * pw;
  const sy = (v: number) => T + ph - ((v - y.min) / (y.max - y.min)) * ph;
  const S = (p: Pt): XY => ({ x: sx(p.x), y: sy(p.y) });
  const xStep = x.step ?? niceStep(x.max - x.min);
  const yStep = y.step ?? niceStep(y.max - y.min);
  const fns = spec.functions.map((f) => toFunction(f.expr));
  const parts: string[] = [patterns(id), `<clipPath id="${id}-clip"><rect x="${L}" y="${T}" width="${pw}" height="${ph}"/></clipPath>`];
  // Everything later labels must keep clear of (lines, curves, other labels).
  const space: LabelSpace = { taken: [], segs: [] };
  const box = { x0: x.min, x1: x.max, y0: y.min, y1: y.max };

  // Grid and ticks
  const xt = ticks(x.min, x.max, xStep);
  const yt = ticks(y.min, y.max, yStep);
  if (spec.grid !== false) {
    parts.push(...xt.map((v) => `<line x1="${n(sx(v))}" y1="${T}" x2="${n(sx(v))}" y2="${T + ph}" stroke="${FAINT}" stroke-width="0.5"/>`));
    parts.push(...yt.map((v) => `<line x1="${L}" y1="${n(sy(v))}" x2="${L + pw}" y2="${n(sy(v))}" stroke="${FAINT}" stroke-width="0.5"/>`));
  }
  // Axes through the origin when it is in view, else along the edges.
  const ax = y.min <= 0 && y.max >= 0 ? sy(0) : T + ph;
  const ay = x.min <= 0 && x.max >= 0 ? sx(0) : L;
  parts.push(`<line x1="${L - 6}" y1="${n(ax)}" x2="${L + pw + 14}" y2="${n(ax)}" stroke="${INK}" stroke-width="1.2" marker-end="url(#${id}-arrow)"/>`);
  parts.push(`<line x1="${n(ay)}" y1="${T + ph + 6}" x2="${n(ay)}" y2="${T - 14}" stroke="${INK}" stroke-width="1.2" marker-end="url(#${id}-arrow)"/>`);
  space.segs.push([{ x: L - 6, y: ax }, { x: L + pw + 14, y: ax }], [{ x: ay, y: T + ph + 6 }, { x: ay, y: T - 14 }]);
  for (const v of xt) if (Math.abs(v) > 1e-9 || ay === L) {
    parts.push(`<line x1="${n(sx(v))}" y1="${n(ax - 3)}" x2="${n(sx(v))}" y2="${n(ax + 3)}" stroke="${INK}"/>`);
    parts.push(text(sx(v), ax + 16, String(v), { size: 11, anchor: 'middle', halo: true }));
    space.taken.push(textBox(sx(v), ax + 12, String(v), 11));
  }
  for (const v of yt) if (Math.abs(v) > 1e-9 || ax === T + ph) {
    parts.push(`<line x1="${n(ay - 3)}" y1="${n(sy(v))}" x2="${n(ay + 3)}" y2="${n(sy(v))}" stroke="${INK}"/>`);
    parts.push(text(ay - 6, sy(v) + 4, String(v), { size: 11, anchor: 'end', halo: true }));
    space.taken.push(textBox(ay - 6 - String(v).length * 3, sy(v), String(v), 11));
  }
  if (x.min <= 0 && x.max >= 0 && y.min <= 0 && y.max >= 0) parts.push(text(sx(0) - 6, sy(0) + 15, 'O', { size: 12, anchor: 'end', italic: true }));
  // Axis titles stay inside the picture: a long x title goes under the end of the axis.
  const xTitle = x.label ?? 'x', yTitle = y.label ?? 'y';
  if (xTitle.length <= 2) parts.push(text(L + pw + 18, ax + 4, xTitle, { size: 13, italic: true }));
  else parts.push(text(L + pw + 10, Math.min(H - 6, ax + 34), xTitle, { size: 12, anchor: 'end', italic: !x.label, halo: true }));
  parts.push(text(ay + (yTitle.length <= 2 ? 0 : 8), T - 18, yTitle, { size: yTitle.length <= 2 ? 13 : 12, anchor: yTitle.length <= 2 ? 'middle' : 'start', italic: !y.label }));
  space.taken.push(textBox(L + pw - xTitle.length * 3.3, ax + 30, xTitle, 12));

  if (TH && spec.table) parts.push(valueTable(spec.table, fns[0], W));
  const drawCurves = !spec.hideCurves;

  // Inequalities: boundary lines (dashed for < and >), the unwanted side shaded
  // and the region R left clear, as ECZ draws them.
  const ineqs = (spec.inequalities ?? []).map(parseInequality).filter((q): q is Inequality => q !== null);
  const regionPts = ineqs.length ? feasibleRegion(ineqs, box) : [];
  if (drawCurves && ineqs.length) {
    const style = spec.shadeStyle ?? 'band';
    if (style === 'full' && regionPts.length >= 3)
      parts.push(`<mask id="${id}-r"><rect x="${L}" y="${T}" width="${pw}" height="${ph}" fill="#fff"/><polygon points="${regionPts.map((p) => `${n(sx(p.x))},${n(sy(p.y))}`).join(' ')}" fill="#000"/></mask>`,
        `<rect x="${L}" y="${T}" width="${pw}" height="${ph}" fill="url(#${id}-hatch)" mask="url(#${id}-r)" opacity="0.55"/>`);
    ineqs.forEach((q) => {
      const ends = clipLine({ a: q.a, b: q.b, c: q.c }, x.min, x.max, y.min, y.max);
      if (!ends) return;
      const [p0, p1] = [S(ends[0]), S(ends[1])];
      if (style === 'band') {
        // A strip of hatching along the line, on the side that is not wanted (where a·x + b·y > c).
        const len = Math.hypot(q.a * (pw / (x.max - x.min)), q.b * (ph / (y.max - y.min))) || 1;
        const off = { x: (9 * q.a * (pw / (x.max - x.min))) / len, y: (-9 * q.b * (ph / (y.max - y.min))) / len };
        parts.push(`<polygon points="${n(p0.x)},${n(p0.y)} ${n(p1.x)},${n(p1.y)} ${n(p1.x + off.x)},${n(p1.y + off.y)} ${n(p0.x + off.x)},${n(p0.y + off.y)}" fill="url(#${id}-band)" stroke="none" clip-path="url(#${id}-clip)"/>`);
      }
      parts.push(`<g clip-path="url(#${id}-clip)">${seg(p0, p1, { dashed: q.strict, width: 1.6 })}</g>`);
      space.segs.push([p0, p1]);
    });
  }

  // Shaded region: between two curves (or a curve and the x-axis).
  if (spec.shade && drawCurves) {
    const { top, bottom, from, to } = spec.shade;
    const f = (i: number | null) => (i === null || !fns[i] ? () => 0 : fns[i]);
    const ft = f(top), fb = f(bottom);
    const steps = 120;
    const upper: string[] = [], lower: string[] = [];
    for (let k = 0; k <= steps; k++) {
      const xv = from + ((to - from) * k) / steps;
      const a = ft(xv), b = fb(xv);
      if (Number.isFinite(a)) upper.push(`${n(sx(xv))},${n(sy(a))}`);
      if (Number.isFinite(b)) lower.unshift(`${n(sx(xv))},${n(sy(b))}`);
    }
    if (upper.length > 1 && lower.length > 1)
      parts.push(`<polygon points="${[...upper, ...lower].join(' ')}" fill="url(#${id}-hatch)" stroke="none" clip-path="url(#${id}-clip)"/>`);
  }

  // A region given by its corners (for areas): hatched.
  if (spec.region && spec.region.points.length >= 3 && drawCurves) {
    const corners = spec.region.points.map((p) => `${n(sx(p.x))},${n(sy(p.y))}`).join(' ');
    parts.push(`<polygon points="${corners}" fill="url(#${id}-hatch)" stroke="none" clip-path="url(#${id}-clip)"/>`);
  }

  // Curves, sampled finely and broken where the function is undefined or leaves the view.
  const curveLabels: { label: string; pts: XY[] }[] = [];
  if (drawCurves) spec.functions.forEach((f, i) => {
    const from = Math.max(x.min, f.from ?? x.min), to = Math.min(x.max, f.to ?? x.max);
    const steps = 500;
    const segments: XY[][] = [[]];
    const visible: XY[] = [];
    for (let k = 0; k <= steps; k++) {
      const xv = from + ((to - from) * k) / steps;
      const yv = fns[i](xv);
      const inRange = Number.isFinite(yv) && yv > y.min - (y.max - y.min) && yv < y.max + (y.max - y.min);
      if (!inRange) {
        if (segments[segments.length - 1].length) segments.push([]);
        continue;
      }
      const p = { x: sx(xv), y: sy(yv) };
      segments[segments.length - 1].push(p);
      if (yv >= y.min && yv <= y.max) visible.push(p);
    }
    for (const sgm of segments) if (sgm.length > 1) {
      parts.push(`<polyline points="${sgm.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')}" fill="none" stroke="${INK}" stroke-width="1.6"${f.dashed ? ' stroke-dasharray="6 4"' : ''} clip-path="url(#${id}-clip)"/>`);
      for (let k = 0; k + 10 < sgm.length; k += 10) space.segs.push([sgm[k], sgm[k + 10]]);
    }
    if (f.label && visible.length > 1) curveLabels.push({ label: f.label, pts: visible });
  });

  const lineLabels: { label: string; a: XY; b: XY }[] = [];
  for (const l of spec.lines ?? []) {
    const style = l.dashed === false ? 'stroke-width="1.6"' : 'stroke-dasharray="4 3"';
    if (typeof l.x === 'number') {
      const a = { x: sx(l.x), y: T + ph }, b = { x: sx(l.x), y: T };
      parts.push(`<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="${INK}" ${style}/>`);
      space.segs.push([a, b]);
      if (l.label) lineLabels.push({ label: l.label, a, b });
    }
    if (typeof l.y === 'number') {
      const a = { x: L, y: sy(l.y) }, b = { x: L + pw, y: sy(l.y) };
      parts.push(`<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="${INK}" ${style}/>`);
      space.segs.push([a, b]);
      if (l.label) lineLabels.push({ label: l.label, a, b });
    }
  }

  // ── Labels, each placed where it touches nothing drawn so far ──
  const inPlot = (c: XY) => c.x > L + 4 && c.x < L + pw - 4 && c.y > T + 4 && c.y < T + ph - 4;
  // Points first (they are small and fixed).
  for (const p of spec.points ?? []) {
    const c = S(p);
    parts.push(`<circle cx="${n(c.x)}" cy="${n(c.y)}" r="3" fill="${INK}"/>`);
    space.taken.push({ x0: c.x - 4, y0: c.y - 4, x1: c.x + 4, y1: c.y + 4 });
  }
  for (const p of spec.points ?? []) if (p.label) {
    const c = S(p), cands: XY[] = [];
    for (const r of [12, 18, 26]) for (const a of [-45, -135, 45, 135, -90, 90, 0, 180]) cands.push({ x: c.x + r * Math.cos((a * Math.PI) / 180), y: c.y + r * Math.sin((a * Math.PI) / 180) });
    parts.push(placeLabel(cands, p.label, space, { size: 13, bold: true }));
  }
  // Region R and its corners.
  if (drawCurves && regionPts.length >= 3) {
    const sc = regionPts.map(S);
    const cx = sc.reduce((s_, p) => s_ + p.x, 0) / sc.length, cy = sc.reduce((s_, p) => s_ + p.y, 0) / sc.length;
    (spec.corners ?? []).forEach((letter, i) => {
      const c = sc[i];
      if (!letter || !c) return;
      parts.push(`<circle cx="${n(c.x)}" cy="${n(c.y)}" r="2.6" fill="${INK}"/>`);
      const away = { x: c.x - cx, y: c.y - cy }, len = Math.hypot(away.x, away.y) || 1;
      const cands: XY[] = [];
      for (const r of [13, 20, 28]) for (const t of [0, 0.6, -0.6, 1.2, -1.2]) {
        const ang = Math.atan2(away.y / len, away.x / len) + t;
        cands.push({ x: c.x + r * Math.cos(ang), y: c.y + r * Math.sin(ang) });
      }
      parts.push(placeLabel(cands, letter, space, { size: 13, bold: true }));
    });
    const name = spec.regionLabel ?? 'R';
    if (name) {
      const cands: XY[] = [{ x: cx, y: cy }];
      for (const k of [0.3, 0.5]) for (const p of sc) cands.push({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k });
      parts.push(placeLabel(cands, name, space, { size: 16, bold: true }));
    }
  }
  // Boundary equations (marking-key figures), along each line inside the graph.
  if (drawCurves && spec.labelLines) ineqs.forEach((q) => {
    const ends = clipLine({ a: q.a, b: q.b, c: q.c }, x.min, x.max, y.min, y.max);
    if (ends) lineLabels.push({ label: q.text.replace(/\s*(<=|>=|≤|≥|<|>)\s*/, ' = ').replace(/\$/g, ''), a: S(ends[0]), b: S(ends[1]) });
  });
  for (const { label, a, b } of lineLabels) {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1, nrm = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
    const cands: XY[] = [];
    for (const t of [0.85, 0.7, 0.55, 0.4, 0.25, 0.92]) for (const side of [1, -1]) for (const d of [12, 22]) {
      const c = { x: a.x + (b.x - a.x) * t + side * d * nrm.x, y: a.y + (b.y - a.y) * t + side * d * nrm.y };
      if (inPlot(c)) cands.push(c);
    }
    if (cands.length) parts.push(placeLabel(cands, label, space, { size: 12 }));
  }
  for (const { label, pts } of curveLabels) {
    const cands: XY[] = [];
    for (const t of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2]) {
      const p = pts[Math.floor(t * (pts.length - 1))], q = pts[Math.min(pts.length - 1, Math.floor(t * (pts.length - 1)) + 3)];
      const len = Math.hypot(q.x - p.x, q.y - p.y) || 1, nrm = { x: -(q.y - p.y) / len, y: (q.x - p.x) / len };
      for (const side of [1, -1]) for (const d of [13, 24]) {
        const c = { x: p.x + side * d * nrm.x, y: p.y + side * d * nrm.y };
        if (inPlot(c)) cands.push(c);
      }
    }
    if (cands.length) parts.push(placeLabel(cands, label, space, { size: 12 }));
  }
  return svg(W, H, parts.join(''), esc(spec.title ?? 'Graph'));
}

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

/**
 * The x/y table printed above the graph. Every y is worked out from the
 * function (so the table can never disagree with the curve); `blanks` puts a
 * letter (p, q) where the learner must calculate the value.
 */
export function tableValues(table: NonNullable<GraphSpec['table']>, f: Fn | undefined) {
  const dp = table.decimals ?? 1;
  return table.x.map((xv) => {
    const letter = table.blanks?.[String(xv)];
    const yv = f ? f(xv) : NaN;
    const shown = Number.isFinite(yv) ? String(Number(yv.toFixed(dp))).replace('-', '−') : '';
    return { x: String(xv).replace('-', '−'), y: letter ?? shown, value: shown };
  });
}

function valueTable(table: NonNullable<GraphSpec['table']>, f: Fn | undefined, W: number) {
  const rows = tableValues(table, f);
  const cols = rows.length + 1;
  const cw = Math.min(56, (W - 20) / cols), x0 = (W - cw * cols) / 2, y0 = 8, rh = 24;
  const out: string[] = [];
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * cw, y = y0 + r * rh;
      out.push(`<rect x="${n(x)}" y="${y}" width="${n(cw)}" height="${rh}" fill="#fff" stroke="${INK}" stroke-width="1"/>`);
      const s = c === 0 ? (r === 0 ? 'x' : 'y') : r === 0 ? rows[c - 1].x : rows[c - 1].y;
      out.push(text(x + cw / 2, y + 16, s, { size: 12, anchor: 'middle', italic: c === 0 || /^[a-z]$/i.test(s) }));
    }
  return out.join('');
}
