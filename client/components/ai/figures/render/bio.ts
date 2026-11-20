// @/components/ai/figures/render/bio.ts — three Biology figures drawn from
// data rather than pictures:
//   • curve: smooth experimental curves (enzyme activity against temperature
//     or pH, population growth, body temperature), with dashed marks and
//     letters (X, Y) for the points a question asks about;
//   • food web: organisms placed in rows by trophic level (producers at the
//     bottom), arrows from the eaten to the eater;
//   • genetic cross: the ECZ genetic diagram (parents → gametes → offspring)
//     or a Punnett square, worked out by geneticsMath.ts.
import type { CurveSpec, FoodWebSpec, GeneticCrossSpec } from '../spec';
import { cross, phenotype, ratio, show } from '../geneticsMath';
import { FAINT, INK, esc, n, niceStep, svg, text, ticks } from './svg';
import { smooth } from './scenes/biokit';

const marker = (id: string) => `<defs><marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${INK}"/></marker></defs>`;
let counter = 0;
const uid = (p: string) => `${p}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ── Curve ──
export function renderCurve(spec: CurveSpec): string {
  const all = spec.series.flatMap((s) => s.points);
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const xmin = spec.x?.min ?? Math.min(0, ...xs), ymin = spec.y?.min ?? Math.min(0, ...ys);
  const xstep = spec.x?.step ?? niceStep(Math.max(...xs) - xmin || 1, 8), ystep = spec.y?.step ?? niceStep(Math.max(...ys) - ymin || 1, 7);
  const xmax = spec.x?.max ?? Math.ceil(Math.max(...xs) / xstep) * xstep, ymax = spec.y?.max ?? Math.ceil((Math.max(...ys) * 1.05) / ystep) * ystep;
  const W = 520, H = 360, L = 64, R = 24, T = 20, B = 52, pw = W - L - R, ph = H - T - B;
  const sx = (v: number) => L + ((v - xmin) / (xmax - xmin || 1)) * pw, sy = (v: number) => T + ph - ((v - ymin) / (ymax - ymin || 1)) * ph;
  const id = uid('cv');
  const parts: string[] = [marker(id)];
  if (spec.grid) {
    for (let v = xmin; v <= xmax + 1e-9; v += xstep / 5) parts.push(`<line x1="${n(sx(v))}" y1="${T}" x2="${n(sx(v))}" y2="${T + ph}" stroke="${FAINT}" stroke-width="${Math.abs(((v - xmin) / xstep) % 1) < 1e-6 ? 0.8 : 0.3}"/>`);
    for (let v = ymin; v <= ymax + 1e-9; v += ystep / 5) parts.push(`<line x1="${L}" y1="${n(sy(v))}" x2="${L + pw}" y2="${n(sy(v))}" stroke="${FAINT}" stroke-width="${Math.abs(((v - ymin) / ystep) % 1) < 1e-6 ? 0.8 : 0.3}"/>`);
  }
  for (const v of ticks(xmin, xmax, xstep)) parts.push(`<line x1="${n(sx(v))}" y1="${T + ph}" x2="${n(sx(v))}" y2="${T + ph + 4}" stroke="${INK}"/>`, text(sx(v), T + ph + 17, String(v), { size: 11, anchor: 'middle' }));
  for (const v of ticks(ymin, ymax, ystep)) parts.push(`<line x1="${L - 4}" y1="${n(sy(v))}" x2="${L}" y2="${n(sy(v))}" stroke="${INK}"/>`, text(L - 7, sy(v) + 4, String(v), { size: 11, anchor: 'end' }));
  parts.push(`<path d="M${L},${T - 6} L${L},${T + ph} L${L + pw + 6},${T + ph}" fill="none" stroke="${INK}" stroke-width="1.3"/>`);
  spec.series.forEach((s, k) => {
    const pts = [...s.points].sort((a, b) => a[0] - b[0]).map(([x, y]) => [sx(x), sy(y)] as [number, number]);
    const d = spec.smooth === false ? pts.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)},${n(y)}`).join(' ') : smooth(pts, false, 0.9);
    parts.push(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="1.8"${s.dashed || (k % 2 && s.dashed !== false) ? ' stroke-dasharray="7 4"' : ''}/>`);
    if (s.name) {
      const top = pts.reduce((m, p) => (p[1] < m[1] ? p : m), pts[0]);
      parts.push(text(top[0] + 14, top[1] + 16, s.name, { size: 12, weight: 'bold', halo: true }));
    }
  });
  for (const m of spec.marks ?? []) {
    if (m.x !== undefined) {
      const yOnCurve = m.y ?? spec.series.map((s) => interp(s.points, m.x!)).find((v) => v !== null) ?? ymax;
      parts.push(`<line x1="${n(sx(m.x))}" y1="${T + ph}" x2="${n(sx(m.x))}" y2="${n(sy(yOnCurve))}" stroke="${INK}" stroke-width="1" stroke-dasharray="4 3"/>`);
      parts.push(text(sx(m.x), sy(yOnCurve) - 8, m.label, { size: 14, anchor: 'middle', weight: 'bold', halo: true }));
    } else if (m.y !== undefined) {
      parts.push(`<line x1="${L}" y1="${n(sy(m.y))}" x2="${L + pw}" y2="${n(sy(m.y))}" stroke="${INK}" stroke-width="1" stroke-dasharray="4 3"/>`, text(L + pw - 4, sy(m.y) - 5, m.label, { size: 13, anchor: 'end', weight: 'bold', halo: true }));
    }
  }
  if (spec.x?.label) parts.push(text(L + pw / 2, H - 10, spec.x.label, { size: 12.5, anchor: 'middle', weight: 'bold' }));
  if (spec.y?.label) parts.push(`<g transform="translate(16 ${n(T + ph / 2)}) rotate(-90)">${text(0, 0, spec.y.label, { size: 12.5, anchor: 'middle', weight: 'bold' })}</g>`);
  return svg(W, H, parts.join(''), esc(spec.title ?? 'Graph'));
}
/** The y of a series at x (straight-line between points), or null outside it. */
export function interp(points: [number, number][], x: number): number | null {
  const p = [...points].sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < p.length; i++) if (x >= p[i - 1][0] && x <= p[i][0]) { const t = (x - p[i - 1][0]) / (p[i][0] - p[i - 1][0] || 1); return p[i - 1][1] + t * (p[i][1] - p[i - 1][1]); }
  return null;
}

// ── Food web ──
/** Trophic level of each organism: producers (eat nothing in the web) are 1; others are 1 + the highest level they eat. */
export function trophicLevels(links: [string, string][]): Map<string, number> {
  const names = new Set(links.flat());
  const eats = new Map<string, string[]>();
  for (const [food, eater] of links) eats.set(eater, [...(eats.get(eater) ?? []), food]);
  const level = new Map<string, number>();
  const get = (x: string, seen = new Set<string>()): number => {
    if (level.has(x)) return level.get(x)!;
    if (seen.has(x)) return 1;
    seen.add(x);
    const foods = eats.get(x) ?? [];
    const v = foods.length ? 1 + Math.max(...foods.map((f) => get(f, seen))) : 1;
    level.set(x, v);
    return v;
  };
  for (const x of names) get(x);
  return level;
}

export function renderFoodWeb(spec: FoodWebSpec): string {
  const links = spec.links.filter((l) => l[0] && l[1] && l[0] !== l[1]);
  const level = trophicLevels(links);
  const rows = new Map<number, string[]>();
  for (const [x, l] of level) rows.set(l, [...(rows.get(l) ?? []), x]);
  const maxL = Math.max(1, ...rows.keys());
  const widest = Math.max(1, ...[...rows.values()].map((r) => r.length));
  const W = Math.max(560, widest * 130), rowH = 84, H = 44 + (maxL - 1) * rowH + 30;
  const label = (x: string) => spec.labels?.[x] ?? x;
  const halfW = (x: string) => Math.max(12, label(x).length * 3.5 + 5);
  // Order each row to keep arrows short and few crossing: sweep up and down a few
  // times, putting each organism under the average place of its food (upward) or its eaters (downward).
  const order = new Map<number, string[]>([...rows].map(([l, r]) => [l, [...r]]));
  const xAt = (l: number, i: number, len: number) => ((i + 1) * W) / (len + 1);
  const place = () => { const m = new Map<string, number>(); for (const [l, r] of order) r.forEach((x, i) => m.set(x, xAt(l, i, r.length))); return m; };
  for (let sweep = 0; sweep < 6; sweep++) {
    const up = sweep % 2 === 0;
    for (let k = 0; k < maxL; k++) {
      const l = up ? k + 1 : maxL - k;
      const at = place();
      const row = order.get(l) ?? [];
      const key = (x: string) => {
        const near = links.filter((q) => (up ? q[1] === x : q[0] === x)).map((q) => at.get(up ? q[0] : q[1]) ?? W / 2);
        return near.length ? avg(near) : at.get(x) ?? W / 2;
      };
      order.set(l, row.map((x) => ({ x, k: key(x) })).sort((u, v) => u.k - v.k).map((o) => o.x));
    }
  }
  const pos = new Map<string, [number, number]>();
  for (const [l, r] of order) r.forEach((x, i) => pos.set(x, [xAt(l, i, r.length), H - 30 - (l - 1) * rowH]));
  const id = uid('fw');
  const parts: string[] = [marker(id)];
  // A link is a straight arrow; if that would run through another organism's name, it bends round it.
  const box = (x: string) => { const [px, py] = pos.get(x)!; return { x0: px - halfW(x) - 4, x1: px + halfW(x) + 4, y0: py - 13, y1: py + 11 }; };
  const quad = (a: [number, number], c: [number, number], b: [number, number], t: number): [number, number] =>
    [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]];
  for (const [food, eater] of links) {
    const a = pos.get(food), b = pos.get(eater);
    if (!a || !b) continue;
    const others = [...pos.keys()].filter((x) => x !== food && x !== eater).map(box);
    const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
    let ctrl = mid;
    for (const off of [0, 36, -36, 70, -70, 110, -110, 150, -150]) {
      const c: [number, number] = [mid[0] + nx * off * 2, mid[1] + ny * off * 2];
      const pts = Array.from({ length: 41 }, (_, i) => quad(a, c, b, 0.08 + (i / 40) * 0.84));
      const hits = pts.some(([x, y]) => others.some((o) => x > o.x0 && x < o.x1 && y > o.y0 && y < o.y1));
      if (!hits) { ctrl = c; break; }
    }
    // Trim both ends to the edge of the names' boxes, along the curve.
    const inside = (p: [number, number], x: string) => { const o = box(x); return p[0] > o.x0 + 2 && p[0] < o.x1 - 2 && p[1] > o.y0 + 1 && p[1] < o.y1 + 1; };
    let t0 = 0, t1 = 1;
    while (t0 < 0.45 && inside(quad(a, ctrl, b, t0), food)) t0 += 0.01;
    while (t1 > 0.55 && inside(quad(a, ctrl, b, t1), eater)) t1 -= 0.01;
    t1 -= 0.012;
    const p0 = quad(a, ctrl, b, t0), p1 = quad(a, ctrl, b, t1);
    // Control point of the trimmed piece of the curve (same curve, re-parametrised).
    const cm = quad(a, ctrl, b, (t0 + t1) / 2);
    const c2: [number, number] = [2 * cm[0] - (p0[0] + p1[0]) / 2, 2 * cm[1] - (p0[1] + p1[1]) / 2];
    const straight = ctrl === mid;
    parts.push(straight
      ? `<line x1="${n(p0[0])}" y1="${n(p0[1])}" x2="${n(p1[0])}" y2="${n(p1[1])}" stroke="${INK}" stroke-width="1.3" marker-end="url(#${id})"/>`
      : `<path d="M${n(p0[0])},${n(p0[1])} Q${n(c2[0])},${n(c2[1])} ${n(p1[0])},${n(p1[1])}" fill="none" stroke="${INK}" stroke-width="1.3" marker-end="url(#${id})"/>`);
  }
  for (const [x, [px, py]] of pos) {
    const isLetter = !!spec.labels?.[x];
    parts.push(text(px, py + 5, label(x), { size: isLetter ? 15 : 12.5, anchor: 'middle', weight: 'bold', halo: true }));
  }
  return svg(W, H, parts.join(''), esc(spec.title ?? 'Food web'));
}
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

// ── Genetic cross ──
/** An allele with its superscript drawn properly (X^H → X with a raised H). */
function allele(s: string) {
  const m = /^([XI])\^(\w)$/.exec(s);
  return m ? `${esc(m[1])}<tspan dy="-6" font-size="0.72em">${esc(m[2])}</tspan><tspan dy="6"> </tspan>` : esc(s);
}
const geno = (a: string[]) => a.map(allele).join(a.some((x) => x.length > 1) ? '' : '');
const t = (x: number, y: number, inner: string, o: { size?: number; anchor?: string; bold?: boolean } = {}) =>
  `<text x="${n(x)}" y="${n(y)}" font-family="'Times New Roman', Tinos, serif" font-size="${o.size ?? 14}" text-anchor="${o.anchor ?? 'middle'}"${o.bold ? ' font-weight="bold"' : ''} fill="${INK}">${inner}</text>`;

export function renderGeneticCross(spec: GeneticCrossSpec): string {
  const c = cross(spec.parents[0], spec.parents[1]);
  const traits = spec.traits ?? {};
  const pheno = (g: string[]) => phenotype(g, traits);
  const hide = new Set(spec.hide ?? []);
  const blank = (w = 40) => `<tspan>${'.'.repeat(Math.round(w / 4))}</tspan>`;
  const parts: string[] = [];
  if (spec.style === 'punnett') {
    const W = 380, H = 300, x0 = 120, y0 = 80, cell = 90;
    parts.push(t(20, 30, 'Parents:', { anchor: 'start', bold: true }) + t(110, 30, `${geno(c.parents[0])}  ×  ${geno(c.parents[1])}`, { anchor: 'start' }));
    parts.push(t(x0 - 30, y0 - 10, '♂ / ♀', { size: 11 }));
    c.gametes[1].forEach((g, i) => parts.push(t(x0 + cell * i + cell / 2, y0 - 10, hide.has('gametes') ? blank(20) : allele(g), { bold: true })));
    c.gametes[0].forEach((g, j) => parts.push(t(x0 - 20, y0 + cell * j + cell / 2 + 5, hide.has('gametes') ? blank(20) : allele(g), { bold: true })));
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const o = c.offspring[j * 2 + i];
      parts.push(`<rect x="${x0 + cell * i}" y="${y0 + cell * j}" width="${cell}" height="${cell}" fill="#fff" stroke="${INK}" stroke-width="1.3"/>`);
      parts.push(t(x0 + cell * i + cell / 2, y0 + cell * j + cell / 2 + 2, hide.has('offspring') ? blank() : geno(o)));
      if (!hide.has('phenotypes')) parts.push(t(x0 + cell * i + cell / 2, y0 + cell * j + cell / 2 + 22, esc(pheno(o)), { size: 10.5 }));
    }
    return svg(W, H, parts.join(''), esc(spec.title ?? 'Punnett square'));
  }
  const W = 560, cols = [150, 270, 390, 510];
  const pp = [pheno(c.parents[0]), pheno(c.parents[1])];
  let y = 30;
  const row = (labelText: string, cells: string[], pos: number[]) => { parts.push(t(10, y, labelText, { anchor: 'start', bold: true, size: 13 })); cells.forEach((cc, i) => parts.push(t(pos[i], y, cc))); y += 40; };
  const ppos = [cols[0] + 60, cols[2] + 60];
  row('Parental phenotypes', [esc(pp[0]), esc(pp[1])], ppos);
  parts.push(t((ppos[0] + ppos[1]) / 2, y - 40, '×', { size: 18 }));
  row('Parental genotypes', [geno(c.parents[0]), geno(c.parents[1])], ppos);
  parts.push(t((ppos[0] + ppos[1]) / 2, y - 40, '×', { size: 18 }));
  // Gametes in circles
  const gx = [ppos[0] - 30, ppos[0] + 30, ppos[1] - 30, ppos[1] + 30];
  const gametes = [...c.gametes[0], ...c.gametes[1]];
  parts.push(t(10, y, 'Gametes', { anchor: 'start', bold: true, size: 13 }));
  gametes.forEach((g, i) => parts.push(`<circle cx="${gx[i]}" cy="${y - 5}" r="16" fill="#fff" stroke="${INK}" stroke-width="1.2"/>`, t(gx[i], y, hide.has('gametes') ? '' : allele(g))));
  const gy = y + 11;
  y += 70;
  // Lines from each gamete of parent 1 to two offspring, and from parent 2
  const ox = [cols[0], cols[1], cols[2], cols[3]].map((x) => x - 20);
  c.offspring.forEach((_, k) => {
    const i = Math.floor(k / 2), j = k % 2;
    parts.push(`<line x1="${gx[i]}" y1="${gy}" x2="${ox[k]}" y2="${y - 18}" stroke="${INK}" stroke-width="0.8"/>`, `<line x1="${gx[2 + j]}" y1="${gy}" x2="${ox[k]}" y2="${y - 18}" stroke="${INK}" stroke-width="0.8"/>`);
  });
  parts.push(t(10, y, 'F₁ genotypes', { anchor: 'start', bold: true, size: 13 }));
  c.offspring.forEach((o, k) => parts.push(t(ox[k], y, hide.has('offspring') ? '' : geno(o))));
  y += 36;
  parts.push(t(10, y, 'F₁ phenotypes', { anchor: 'start', bold: true, size: 13 }));
  c.offspring.forEach((o, k) => parts.push(t(ox[k], y, hide.has('phenotypes') ? '' : esc(pheno(o)), { size: 11.5 })));
  y += 34;
  if (!hide.has('ratio')) parts.push(t(10, y, `Ratio: ${esc(ratio(c.offspring.map(pheno)))}`, { anchor: 'start', size: 13 }));
  return svg(W, y + 14, parts.join(''), esc(spec.title ?? 'Genetic diagram'));
}
