// @/components/ai/figures/render/geometry.ts — bearings and trigonometry
// figures like ECZ's: points on level ground or the corners of a triangle or
// quadrilateral, sides with their lengths, angle marks, right angles, equal
// sides, and north lines with bearing arcs. Points are placed from real
// bearings, angles and distances (figureMath.planeLayout), so the drawing is
// to scale and the server can measure every bearing and angle in it.
import type { GeometrySpec } from '../spec';
import { angleAt, bearing, planeLayout, type Pt } from '../figureMath';
import { INK, angleMark, esc, freeDirection, n, nestedRadii, placeLabel, pointLabel, raysAt, reserveLetter, seg, svg, text, textBox, tickMark, uid, patterns, type LabelSpace, type XY } from './svg';

const NORTH_LEN = 58;

export function renderGeometry(spec: GeometrySpec): { svg: string; problems: string[] } {
  const { pos, problems } = planeLayout(spec.points);
  const ids = Object.keys(pos);
  if (!ids.length) return { svg: '', problems: [...problems, 'The figure has no points.'] };
  const id = uid('ge');

  // Fit the points into about 420 × 320, leaving room for north lines and letters.
  const xs = ids.map((k) => pos[k].x), ys = ids.map((k) => pos[k].y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min(420 / Math.max(maxX - minX, 1e-9), 320 / Math.max(maxY - minY, 1e-9));
  // A north line with several bearings from it is longer, so the nested arcs fit under its arrow.
  const fromNorth = (k: string) => (spec.angles ?? []).filter((m) => m.at === k && m.arms.some((a) => a.toLowerCase() === 'north' || (a === 'N' && !pos.N))).length;
  const northLen = (k: string) => Math.max(NORTH_LEN, 30 + 13 * fromNorth(k) + 40);
  const padX = 60, padTop = spec.north?.length ? Math.max(...spec.north.map(northLen)) + 28 : 40, padBottom = 40;
  const W = (maxX - minX) * scale + 2 * padX, H = (maxY - minY) * scale + padTop + padBottom;
  const S = (p: Pt): XY => ({ x: padX + (p.x - minX) * scale, y: padTop + (maxY - p.y) * scale });
  const centroid = S({ x: xs.reduce((a, b) => a + b, 0) / xs.length, y: ys.reduce((a, b) => a + b, 0) / ys.length });

  const parts: string[] = [patterns(id)];
  const drawn: [XY, XY][] = [];
  const get = (k: string) => {
    if (!pos[k]) problems.push(`Point ${k} is used but not defined.`);
    return pos[k] ? S(pos[k]) : null;
  };

  // 1. Lines: sides and north lines.
  const labelled: { a: XY; b: XY; label: string }[] = [];
  for (const s of spec.sides ?? []) {
    const a = get(s.from), b = get(s.to);
    if (!a || !b) continue;
    parts.push(seg(a, b, { dashed: s.dashed, width: 1.5 }));
    drawn.push([a, b]);
    if (s.label) labelled.push({ a, b, label: s.label });
  }
  for (const k of spec.north ?? []) {
    const p = get(k);
    if (!p) continue;
    const top = { x: p.x, y: p.y - northLen(k) };
    parts.push(`<line x1="${n(p.x)}" y1="${n(p.y)}" x2="${n(top.x)}" y2="${n(top.y)}" stroke="${INK}" stroke-width="1.2" marker-end="url(#${id}-arrow)"/>`);
    parts.push(text(top.x, top.y - 6, 'N', { size: 13, anchor: 'middle', weight: 'bold' }));
    drawn.push([p, top]);
  }
  for (const [i, [a, b]] of (spec.equal ?? []).entries()) {
    const pa = get(a), pb = get(b);
    if (pa && pb) parts.push(tickMark(pa, pb, i < 2 ? 1 : 2));
  }

  // 2. Labels, each kept clear of the lines and of the labels before it:
  //    point letters, then side lengths, then angle values.
  const space: LabelSpace = { taken: [], segs: drawn };
  for (const k of spec.north ?? []) { const p = get(k); if (p) space.taken.push(textBox(p.x, p.y - northLen(k) - 10, 'N', 13)); }
  for (const k of ids) {
    const p = S(pos[k]);
    const dir = freeDirection(raysAt(p, drawn), { x: p.x - centroid.x, y: p.y - centroid.y });
    parts.push(pointLabel(p, k, dir, 11));
    reserveLetter(space, p, k, dir, 11);
  }
  for (const { a, b, label } of labelled) {
    // Beside the middle of the side, on the outside first; then further along it.
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let nrm = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if ((m.x - centroid.x) * nrm.x + (m.y - centroid.y) * nrm.y < 0) nrm = { x: -nrm.x, y: -nrm.y };
    const cands: XY[] = [];
    for (const t of [0.5, 0.4, 0.6, 0.3, 0.7]) for (const side of [1, -1]) for (const d of [12, 20]) {
      const q = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      cands.push({ x: q.x + side * d * nrm.x, y: q.y + side * d * nrm.y });
    }
    parts.push(placeLabel(cands, label, space));
  }
  const isNorth = (k: string) => k.toLowerCase() === 'north' || (k === 'N' && !pos.N);
  const marks = (spec.angles ?? []).map((m) => {
    const v = get(m.at);
    // "north" (or "N" when no point is called N) is the north direction at the vertex.
    const arm = (k: string): XY | null => (!v ? null : isNorth(k) ? { x: v.x, y: v.y - 40 } : get(k));
    const a = arm(m.arms[0]), b = arm(m.arms[1]);
    // A bearing (from north, clockwise) over 180° is drawn as the reflex angle.
    let reflex = false;
    if (isNorth(m.arms[0]) && pos[m.arms[1]]) reflex = bearing(pos[m.at], pos[m.arms[1]]) > 180;
    if (isNorth(m.arms[1]) && pos[m.arms[0]]) reflex = bearing(pos[m.at], pos[m.arms[0]]) > 180;
    const size = v && a && b ? (reflex ? 360 : 0) + angleAt(v, a, b) : 0;
    return { ...m, v, a, b, reflex, size };
  });
  const radii = nestedRadii(marks, (m) => m.size);
  // All arcs first (so they count as lines), then their values.
  const space2: LabelSpace = { taken: space.taken, segs: [...drawn] };
  for (const m of marks) if (m.v && m.a && m.b) parts.push(angleMark(m.v, m.a, m.b, { right: m.right, reflex: m.reflex, radius: radii.get(m), space: space2 }));
  for (const m of marks) if (m.v && m.a && m.b && m.label && !m.right) parts.push(angleMark(m.v, m.a, m.b, { label: m.label, reflex: m.reflex, radius: radii.get(m), space: space2, noArc: true }));
  return { svg: svg(W, H, parts.join(''), esc(spec.title ?? 'Diagram')), problems };
}
