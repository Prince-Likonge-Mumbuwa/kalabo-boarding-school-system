// @/components/ai/figures/render/circle.ts — circle-theorem diagrams like
// ECZ Paper 1: a circle, centre O, points on the circumference, chords,
// diameters, tangents, chords crossing at X, angle marks and equal-side ticks.
// Positions come from figureMath.circleLayout, the same maths the AI server
// uses to measure every angle, so the marking key matches the drawing.
import type { CircleSpec } from '../spec';
import { angleAt, circleLayout, type Pt } from '../figureMath';
import { INK, angleMark, dot, esc, freeDirection, n, nestedRadii, placeLabel, pointLabel, raysAt, reserveLetter, seg, svg, tickMark, type LabelSpace } from './svg';

const R = 130; // the circle's radius on screen
const PAD = 44;

export function renderCircle(spec: CircleSpec): { svg: string; problems: string[] } {
  const centreId = spec.centre === false ? 'O' : spec.centre ?? 'O';
  const { pos, problems } = circleLayout(spec.points, centreId);

  // Screen box: the circle (or just the sector) plus every point (a tangent point can lie outside it).
  const sectorSpan = (() => {
    const a = spec.sector && pos[spec.sector.from], b = spec.sector && pos[spec.sector.to];
    if (!a || !b) return null;
    const start = Math.atan2(a.y, a.x);
    let span = Math.atan2(b.y, b.x) - start;
    while (span <= 0) span += 2 * Math.PI;
    return { start, span };
  })();
  const outline: Pt[] = sectorSpan
    ? [{ x: 0, y: 0 }, ...Array.from({ length: 37 }, (_, i) => ({ x: Math.cos(sectorSpan.start + (sectorSpan.span * i) / 36), y: Math.sin(sectorSpan.start + (sectorSpan.span * i) / 36) }))]
    : [{ x: -1, y: -1 }, { x: 1, y: 1 }];
  const all = [...Object.values(pos), ...outline];
  const minX = Math.min(...all.map((p) => p.x)), maxX = Math.max(...all.map((p) => p.x));
  const minY = Math.min(...all.map((p) => p.y)), maxY = Math.max(...all.map((p) => p.y));
  const W = (maxX - minX) * R + 2 * PAD, H = (maxY - minY) * R + 2 * PAD;
  const S = (p: Pt) => ({ x: PAD + (p.x - minX) * R, y: PAD + (maxY - p.y) * R });
  const O = S({ x: 0, y: 0 });

  const parts: string[] = [];
  const get = (id: string) => {
    const p = pos[id];
    if (!p) problems.push(`Point ${id} is used but not defined.`);
    return p ? S(p) : null;
  };

  // The circle, or one sector of it.
  if (spec.sector) {
    const a = get(spec.sector.from), b = get(spec.sector.to);
    if (a && b) {
      const pa = pos[spec.sector.from], pb = pos[spec.sector.to];
      let span = Math.atan2(pb.y, pb.x) - Math.atan2(pa.y, pa.x);
      while (span <= 0) span += 2 * Math.PI;
      parts.push(`<path d="M${n(O.x)},${n(O.y)} L${n(a.x)},${n(a.y)} A${R},${R} 0 ${span > Math.PI ? 1 : 0} 0 ${n(b.x)},${n(b.y)} Z" fill="none" stroke="${INK}" stroke-width="1.6"/>`);
    }
  } else parts.push(`<circle cx="${n(O.x)}" cy="${n(O.y)}" r="${R}" fill="none" stroke="${INK}" stroke-width="1.6"/>`);

  // Every straight line drawn, in screen space (letters are kept off them).
  const drawn: [Pt, Pt][] = [];
  if (spec.sector && sectorSpan) for (const k of [spec.sector.from, spec.sector.to]) { const p = get(k); if (p) drawn.push([O, p]); }
  for (const [a, b] of [...(spec.lines ?? []), ...(spec.diameters ?? [])]) {
    const pa = get(a), pb = get(b);
    if (pa && pb) { parts.push(seg(pa, pb)); drawn.push([pa, pb]); }
  }
  for (const [a, b] of spec.diameters ?? []) {
    const pa = pos[a], pb = pos[b];
    if (pa && pb && Math.abs(pa.x + pb.x) + Math.abs(pa.y + pb.y) > 1e-3) problems.push(`${a}${b} is called a diameter but does not pass through the centre.`);
  }
  for (const t of spec.tangents ?? []) {
    const p = pos[t];
    if (!p) { problems.push(`Tangent at ${t}: no such point.`); continue; }
    const d = { x: -p.y, y: p.x };
    const ends: [Pt, Pt] = [S({ x: p.x - 1.2 * d.x, y: p.y - 1.2 * d.y }), S({ x: p.x + 1.2 * d.x, y: p.y + 1.2 * d.y })];
    parts.push(seg(...ends));
    drawn.push(ends);
  }
  for (const [i, [a, b]] of (spec.equal ?? []).entries()) {
    const pa = get(a), pb = get(b);
    if (pa && pb) parts.push(tickMark(pa, pb, i < 2 ? 1 : 2));
  }

  // Labels keep clear of every line and of the circle itself.
  const space: LabelSpace = { taken: [], segs: [...drawn] };
  const arcFrom = sectorSpan ? -sectorSpan.start - sectorSpan.span : 0, arcSpan = sectorSpan ? sectorSpan.span : 2 * Math.PI; // screen angles run the other way
  for (let i = 0; i < 48; i++) {
    const t0 = arcFrom + (i / 48) * arcSpan, t1 = arcFrom + ((i + 1) / 48) * arcSpan;
    space.segs.push([{ x: O.x + R * Math.cos(t0), y: O.y + R * Math.sin(t0) }, { x: O.x + R * Math.cos(t1), y: O.y + R * Math.sin(t1) }]);
  }

  // Letters go in the widest free gap; for points on the circle the circle
  // itself counts as two lines (its tangent directions), so letters sit outside.
  for (const [id, p] of Object.entries(pos)) {
    if (id === centreId && spec.centre === false) continue;
    const sp = S(p);
    if (id === centreId) parts.push(dot(sp, 2.2));
    const rays = raysAt(sp, drawn);
    if (Math.abs(Math.hypot(p.x, p.y) - 1) < 1e-6 && !spec.sector) rays.push({ x: -p.y, y: -p.x }, { x: p.y, y: p.x }, { x: -p.x, y: p.y });
    // In a sector the centre's letter goes on the side away from the sector (into the gap of a major sector).
    const mid = sectorSpan ? sectorSpan.start + sectorSpan.span / 2 : 0;
    const dir = id === centreId && sectorSpan ? { x: -Math.cos(mid), y: Math.sin(mid) } : freeDirection(rays, { x: p.x || -0.6, y: -(p.y || 0.8) });
    parts.push(pointLabel(sp, id, dir, id === centreId ? 10 : 12));
    reserveLetter(space, sp, id, dir, id === centreId ? 10 : 12);
  }

  // Angle marks: arcs first (they count as lines), then their values where nothing else is.
  // Lengths written beside their lines ("14 cm" on a radius).
  for (const l of spec.lengths ?? []) {
    const a = get(l.from), b = get(l.to);
    if (!a || !b) continue;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1, nrm = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
    const cands: Pt[] = [];
    for (const t of [0.5, 0.4, 0.6, 0.3, 0.7]) for (const side of [1, -1]) for (const d of [12, 20]) cands.push({ x: a.x + (b.x - a.x) * t + side * d * nrm.x, y: a.y + (b.y - a.y) * t + side * d * nrm.y });
    parts.push(placeLabel(cands, l.label, space));
  }

  // The sector's angle is one more angle mark at the centre (unless the AI marked it as well).
  const angleList = [...(spec.angles ?? [])];
  if (spec.sector?.label && sectorSpan) {
    const { from, to } = spec.sector;
    const dup = angleList.findIndex((m) => m.at === centreId && ((m.arms[0] === from && m.arms[1] === to) || (m.arms[0] === to && m.arms[1] === from)));
    if (dup >= 0) angleList.splice(dup, 1);
    angleList.push({ at: centreId, arms: [from, to], label: spec.sector.label });
  }
  const reflexAtCentre = (sectorSpan?.span ?? 0) > Math.PI;
  const marks = angleList.map((m) => ({ ...m, v: get(m.at), a: get(m.arms[0]), b: get(m.arms[1]), reflex: reflexAtCentre && m.at === centreId && spec.sector !== undefined && m.arms.includes(spec.sector.from) && m.arms.includes(spec.sector.to) }));
  const radii = nestedRadii(marks, (m) => (m.v && m.a && m.b ? angleAt(m.v, m.a, m.b) : 0));
  for (const m of marks) if (m.v && m.a && m.b) parts.push(angleMark(m.v, m.a, m.b, { right: m.right, radius: radii.get(m), reflex: m.reflex, space }));
  for (const m of marks) if (m.v && m.a && m.b && m.label && !m.right) parts.push(angleMark(m.v, m.a, m.b, { label: m.label, radius: radii.get(m), reflex: m.reflex, space, noArc: true }));

  return { svg: svg(W, H, parts.join(''), esc(spec.title ?? 'Circle')), problems };
}

