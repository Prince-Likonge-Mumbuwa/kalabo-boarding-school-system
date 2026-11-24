// @/components/ai/figures/render/construction.ts — ruler-and-compasses
// constructions and loci, drawn the way an ECZ Mathematics marking key shows
// them: the triangle to scale with its given sides and angles, the faint
// compass arcs that construct it, each locus with its construction arcs
// (perpendicular bisector, angle bisector, parallel line, circle of given
// radius, perpendicular from a point) and the required region hatched.
// The geometry comes from figureMath.constructionLayout, which the server also
// uses to work out the lengths and angles for the marking key.
import type { ConstructionSpec } from '../spec';
import { constructionLayout, dist, type Locus, type Pt } from '../figureMath';
import { INK, angleMark, esc, freeDirection, n, placeLabel, pointLabel, raysAt, reserveLetter, seg, svg, text, textBox, uid, type LabelSpace, type XY } from './svg';

/** Angles a learner can construct with compasses alone (no protractor). */
const COMPASS_ANGLES = [15, 30, 45, 60, 75, 90, 105, 120, 135, 150];

export function renderConstruction(spec: ConstructionSpec): { svg: string; problems: string[] } {
  const L = constructionLayout(spec);
  const [P, Q, R] = L.ids;
  if (!L.pos[P]) return { svg: '', problems: L.problems };
  const id = uid('cn');
  const showArcs = spec.showConstruction !== false;
  const A = L.pos[P], B = L.pos[Q], C = L.pos[R];

  // Scale: about 34 px per cm, smaller for a big triangle; room for loci that run past the sides.
  const xs = [A.x, B.x, C.x], ys = [A.y, B.y, C.y];
  for (const l of L.loci) if (l.kind === 'circle') { xs.push(l.c.x - l.r, l.c.x + l.r); ys.push(l.c.y - l.r, l.c.y + l.r); }
  // Points the construction arcs reach (the bisector's crossing arcs, the perpendicular's lower arcs).
  const reach: Pt[] = [];
  for (const l of L.loci) {
    if (l.kind !== 'line' || !l.ends) continue;
    const [e0, e1] = l.ends;
    if (l.spec.kind === 'perpendicular-bisector') { const h = 0.25 * dist(e0, e1); reach.push({ x: l.p.x + l.d.x * h, y: l.p.y + l.d.y * h }, { x: l.p.x - l.d.x * h, y: l.p.y - l.d.y * h }); }
    if (l.spec.kind === 'perpendicular') { const ex = e1.x - e0.x, ey = e1.y - e0.y, t = ((l.p.x - e0.x) * ex + (l.p.y - e0.y) * ey) / (ex * ex + ey * ey); const f = { x: e0.x + ex * t, y: e0.y + ey * t }; reach.push({ x: f.x - (l.p.x - f.x) * 0.35, y: f.y - (l.p.y - f.y) * 0.35 }); }
  }
  for (const p of reach) { xs.push(p.x); ys.push(p.y); }
  const tri = { x0: Math.min(A.x, B.x, C.x), x1: Math.max(A.x, B.x, C.x), y0: Math.min(A.y, B.y, C.y), y1: Math.max(A.y, B.y, C.y) };
  const box = { x0: Math.min(tri.x0 - 1.6, ...xs.map((v) => v - 0.4)), x1: Math.max(tri.x1 + 1.6, ...xs.map((v) => v + 0.4)), y0: Math.min(tri.y0 - 1.6, ...ys.map((v) => v - 0.4)), y1: Math.max(tri.y1 + 1.6, ...ys.map((v) => v + 0.4)) };
  const k = Math.min(34, 470 / (box.x1 - box.x0), 380 / (box.y1 - box.y0));
  const pad = 26;
  const W = (box.x1 - box.x0) * k + 2 * pad, H = (box.y1 - box.y0) * k + 2 * pad;
  const S = (p: Pt): XY => ({ x: pad + (p.x - box.x0) * k, y: pad + (box.y1 - p.y) * k });
  const parts: string[] = [];
  const faint = (d: string) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="0.7" stroke-linecap="round"/>`;
  /** A compass arc (math coords): centre c, radius r (cm), from angle a0 to a1 (degrees, anticlockwise). */
  const arc = (c: Pt, r: number, a0: number, a1: number) => {
    const p0 = S({ x: c.x + r * Math.cos((a0 * Math.PI) / 180), y: c.y + r * Math.sin((a0 * Math.PI) / 180) });
    const p1 = S({ x: c.x + r * Math.cos((a1 * Math.PI) / 180), y: c.y + r * Math.sin((a1 * Math.PI) / 180) });
    const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
    // Screen y is flipped, so anticlockwise in maths is clockwise on screen (sweep 0).
    return faint(`M${n(p0.x)},${n(p0.y)} A${n(r * k)},${n(r * k)} 0 ${large} 0 ${n(p1.x)},${n(p1.y)}`);
  };
  /** A short compass arc crossing the point p, centred on c. */
  const tick = (c: Pt, p: Pt, half = 9) => { const a = (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI; return arc(c, dist(c, p), a - half, a + half); };
  const dirDeg = (from: Pt, to: Pt) => (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;

  // 1. The required region, hatched (drawn first, under every line).
  if (L.inRegion) {
    const step = 0.22, dx = 0.03;
    let d = '';
    let sx = 0, sy = 0, count = 0;
    for (let c = box.x0 - (box.y1 - box.y0); c < box.x1; c += step) {
      let run: Pt | null = null, last: Pt | null = null;
      for (let t = 0; t <= (box.x1 - box.x0) + (box.y1 - box.y0); t += dx) {
        const p = { x: c + t, y: box.y0 + t };
        const inside = p.x >= box.x0 && p.x <= box.x1 && p.y <= box.y1 && L.inRegion(p);
        if (inside) { if (!run) run = p; last = p; sx += p.x; sy += p.y; count++; }
        if ((!inside || t + dx > (box.x1 - box.x0) + (box.y1 - box.y0)) && run && last) {
          const a = S(run), b = S(last);
          d += `M${n(a.x)},${n(a.y)}L${n(b.x)},${n(b.y)}`;
          run = null;
        }
      }
    }
    parts.push(`<path d="${d}" stroke="${INK}" stroke-width="0.9" fill="none"/>`);
    if (spec.regionLabel && count) {
      const c = S({ x: sx / count, y: sy / count });
      parts.push(`<rect x="${n(c.x - 9)}" y="${n(c.y - 11)}" width="18" height="18" fill="#fff"/>`, text(c.x, c.y + 5, spec.regionLabel, { size: 15, anchor: 'middle', weight: 'bold' }));
    }
  }

  // 2. Construction arcs for the triangle.
  if (showArcs) {
    const sides = new Set(L.givenSides);
    // The base: its length stepped off with compasses from the first vertex.
    if (sides.has(P + Q)) parts.push(tick(A, B));
    // The third vertex: arcs of the given lengths from the base ends cross at it.
    if (sides.has(P + R)) parts.push(tick(A, C, 11));
    if (sides.has(Q + R)) parts.push(tick(B, C, 11));
    // Given angles: compass constructions for the special angles.
    for (const v of L.givenAngles) {
      const V = L.pos[v], [m, w] = L.ids.filter((u) => u !== v).map((u) => L.pos[u]);
      const a1 = dirDeg(V, m), a2 = dirDeg(V, w);
      let lo = Math.min(a1, a2), hi = Math.max(a1, a2);
      if (hi - lo > 180) [lo, hi] = [hi, lo + 360];
      const size = hi - lo, r = Math.min(1.6, 0.35 * Math.min(dist(V, m), dist(V, w)));
      if (COMPASS_ANGLES.some((t) => Math.abs(t - size) < 0.5)) {
        parts.push(arc(V, r, lo - 8, hi + 8));
        // Where the arm was found: two small arcs crossing on it.
        const arm = (Math.abs(lo - a1) < 1e-6 || Math.abs(lo - 360 - a1) < 1e-6) ? a2 : a1;
        const onArm = { x: V.x + 2 * r * Math.cos((arm * Math.PI) / 180), y: V.y + 2 * r * Math.sin((arm * Math.PI) / 180) };
        parts.push(arc(onArm, r * 1.05, arm + 150, arm + 210), arc(onArm, r * 1.05, arm - 30, arm + 30));
      }
    }
  }

  // 3. The triangle.
  const [a, b, c] = [S(A), S(B), S(C)];
  parts.push(`<path d="M${n(a.x)},${n(a.y)}L${n(b.x)},${n(b.y)}L${n(c.x)},${n(c.y)}Z" fill="none" stroke="${INK}" stroke-width="1.7" stroke-linejoin="round"/>`);
  const drawn: [XY, XY][] = [[a, b], [b, c], [c, a]];

  // 4. The loci with their construction arcs.
  const clipId = `${id}-t`;
  const pad2 = 0.5; // loci run a little past the sides, as learners draw them
  const lineThroughTriangle = (l: Extract<Locus, { kind: 'line' }>): [Pt, Pt] | null => {
    // The line must also pass through its own construction points.
    const own = l.spec.kind === 'perpendicular-bisector' && l.ends ? 0.25 * dist(l.ends[0], l.ends[1]) : 0;
    // Where the line crosses the triangle, extended by pad2 at each end.
    const ts: number[] = [];
    for (const [u, v] of [[A, B], [B, C], [C, A]] as [Pt, Pt][]) {
      const ex = v.x - u.x, ey = v.y - u.y, den = l.d.x * ey - l.d.y * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((u.x - l.p.x) * ey - (u.y - l.p.y) * ex) / den, s = ((u.x - l.p.x) * l.d.y - (u.y - l.p.y) * l.d.x) / den;
      if (s >= -1e-9 && s <= 1 + 1e-9) ts.push(t);
    }
    if (ts.length < 2) return null;
    if (l.spec.kind === 'perpendicular' && l.ends) {
      const [e0, e1] = l.ends, ex = e1.x - e0.x, ey = e1.y - e0.y, tt = ((l.p.x - e0.x) * ex + (l.p.y - e0.y) * ey) / (ex * ex + ey * ey);
      const f = { x: e0.x + ex * tt, y: e0.y + ey * tt }, h = dist(l.p, f);
      ts.push(0, (f.x - l.p.x) * l.d.x + (f.y - l.p.y) * l.d.y + Math.sign((f.x - l.p.x) * l.d.x + (f.y - l.p.y) * l.d.y) * h * 0.35);
    }
    const t0 = Math.min(...ts, -own - 0.2) - pad2, t1 = Math.max(...ts, own + 0.2) + pad2;
    return [{ x: l.p.x + l.d.x * t0, y: l.p.y + l.d.y * t0 }, { x: l.p.x + l.d.x * t1, y: l.p.y + l.d.y * t1 }];
  };
  const labelSpots: { p: XY; s: string }[] = [];
  parts.push(`<clipPath id="${clipId}"><rect x="0" y="0" width="${n(W)}" height="${n(H)}"/></clipPath>`);
  for (const l of L.loci) {
    const tag = l.spec.label;
    if (l.kind === 'circle') {
      // The arc of the circle that lies inside the triangle (plus a little either side).
      const pts: XY[][] = [];
      let cur: XY[] = [];
      for (let t = 0; t <= 360; t += 1) {
        const p = { x: l.c.x + l.r * Math.cos((t * Math.PI) / 180), y: l.c.y + l.r * Math.sin((t * Math.PI) / 180) };
        const near = Math.min(...[[A, B], [B, C], [C, A]].map(([u, v]) => segDist(p, u, v)));
        const ok = insideOrNear(p, A, B, C, near, 0.35);
        if (ok) cur.push(S(p)); else if (cur.length) { pts.push(cur); cur = []; }
      }
      if (cur.length) pts.push(cur);
      // Join a run that wraps round 0°.
      if (pts.length > 1 && pts[0][0] && pts[pts.length - 1].length && Math.hypot(pts[0][0].x - pts[pts.length - 1].slice(-1)[0].x, pts[0][0].y - pts[pts.length - 1].slice(-1)[0].y) < k * 0.2) pts[0] = [...pts.pop()!, ...pts[0]];
      for (const run of pts) if (run.length > 1) {
        parts.push(`<polyline points="${run.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')}" fill="none" stroke="${INK}" stroke-width="1.3"/>`);
        drawn.push([run[0], run[run.length - 1]]);
        if (tag) labelSpots.push({ p: run[Math.floor(run.length / 2)], s: tag });
      }
      continue;
    }
    const segEnds = lineThroughTriangle(l);
    if (!segEnds) continue;
    const [u, v] = segEnds.map(S);
    parts.push(seg(u, v, { width: 1.3 }));
    drawn.push([u, v]);
    if (tag) labelSpots.push({ p: v, s: tag });
    if (!showArcs) continue;
    const kind = l.spec.kind;
    if (kind === 'perpendicular-bisector' && l.ends) {
      // Arcs of the same radius from both ends, crossing on each side of the line.
      const [e0, e1] = l.ends, r = Math.hypot(0.5, 0.25) * dist(e0, e1);
      const h = Math.sqrt(Math.max(0, r * r - (dist(e0, e1) / 2) ** 2));
      for (const s of [1, -1]) {
        const X = { x: l.p.x + l.d.x * h * s, y: l.p.y + l.d.y * h * s };
        parts.push(tick(e0, X, 10), tick(e1, X, 10));
      }
    } else if (kind === 'angle-bisector') {
      const V = l.p, [m, w] = L.ids.map((x) => L.pos[x]).filter((p) => p !== V);
      const r = Math.min(1.5, 0.3 * Math.min(dist(V, m), dist(V, w)));
      const a1 = dirDeg(V, m), a2 = dirDeg(V, w);
      let lo = Math.min(a1, a2), hi = Math.max(a1, a2);
      if (hi - lo > 180) [lo, hi] = [hi, lo + 360];
      parts.push(arc(V, r, lo - 6, hi + 6));
      const M1 = { x: V.x + r * Math.cos((a1 * Math.PI) / 180), y: V.y + r * Math.sin((a1 * Math.PI) / 180) };
      const M2 = { x: V.x + r * Math.cos((a2 * Math.PI) / 180), y: V.y + r * Math.sin((a2 * Math.PI) / 180) };
      const X = { x: V.x + l.d.x * r * 1.75, y: V.y + l.d.y * r * 1.75 };
      parts.push(tick(M1, X, 12), tick(M2, X, 12));
    } else if (kind === 'parallel' && l.ends) {
      // Two perpendiculars from the side, each with the distance stepped off by an arc.
      const [e0, e1] = l.ends, d0 = Number(l.spec.distance);
      for (const t of [0.25, 0.75]) {
        const foot = { x: e0.x + (e1.x - e0.x) * t, y: e0.y + (e1.y - e0.y) * t };
        const off = { x: l.p.x - e0.x, y: l.p.y - e0.y }; // the normal times the distance
        const top = { x: foot.x + off.x, y: foot.y + off.y };
        parts.push(`<line x1="${n(S(foot).x)}" y1="${n(S(foot).y)}" x2="${n(S(top).x)}" y2="${n(S(top).y)}" stroke="${INK}" stroke-width="0.7" stroke-dasharray="3 2"/>`);
        parts.push(tick(foot, top, 12));
        void d0;
      }
    } else if (kind === 'perpendicular' && l.ends) {
      const F = l.p, [e0, e1] = l.ends;
      const foot = (() => { const ex = e1.x - e0.x, ey = e1.y - e0.y, t = ((F.x - e0.x) * ex + (F.y - e0.y) * ey) / (ex * ex + ey * ey); return { x: e0.x + ex * t, y: e0.y + ey * t }; })();
      const h = dist(F, foot), r = h * 1.25, half = Math.sqrt(r * r - h * h);
      const along = { x: (e1.x - e0.x) / dist(e0, e1), y: (e1.y - e0.y) / dist(e0, e1) };
      const X1 = { x: foot.x - along.x * half, y: foot.y - along.y * half }, X2 = { x: foot.x + along.x * half, y: foot.y + along.y * half };
      parts.push(tick(F, X1, 7), tick(F, X2, 7));
      const below = { x: foot.x - (F.x - foot.x) * 0.35, y: foot.y - (F.y - foot.y) * 0.35 };
      parts.push(tick(X1, below, 9), tick(X2, below, 9));
      // A right-angle mark at the foot.
      const sq = 0.3, up = { x: (F.x - foot.x) / h, y: (F.y - foot.y) / h };
      const p1 = S({ x: foot.x + along.x * sq, y: foot.y + along.y * sq }), p2 = S({ x: foot.x + along.x * sq + up.x * sq, y: foot.y + along.y * sq + up.y * sq }), p3 = S({ x: foot.x + up.x * sq, y: foot.y + up.y * sq });
      parts.push(`<polyline points="${n(p1.x)},${n(p1.y)} ${n(p2.x)},${n(p2.y)} ${n(p3.x)},${n(p3.y)}" fill="none" stroke="${INK}" stroke-width="0.9"/>`);
    }
  }

  // 5. Labels: vertices, given sides, given angles, then the loci's names.
  const space: LabelSpace = { taken: [], segs: drawn };
  const centroid = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
  for (const [v, p] of [[P, a], [Q, b], [R, c]] as [string, XY][]) {
    const dir = freeDirection(raysAt(p, drawn), { x: p.x - centroid.x, y: p.y - centroid.y });
    parts.push(pointLabel(p, v, dir, 11, 15));
    reserveLetter(space, p, v, dir, 11, 15);
  }
  if (spec.labelSides !== false) for (const s of L.givenSides) {
    const u = S(L.pos[s[0]]), v = S(L.pos[s[1]]);
    const len = Math.hypot(v.x - u.x, v.y - u.y) || 1;
    let nrm = { x: -(v.y - u.y) / len, y: (v.x - u.x) / len };
    const m = { x: (u.x + v.x) / 2, y: (u.y + v.y) / 2 };
    if ((m.x - centroid.x) * nrm.x + (m.y - centroid.y) * nrm.y < 0) nrm = { x: -nrm.x, y: -nrm.y };
    const cm = `${+dist(L.pos[s[0]], L.pos[s[1]]).toFixed(1)} cm`;
    parts.push(placeLabel([0.5, 0.4, 0.6].flatMap((t) => [14, 22].map((d) => ({ x: u.x + (v.x - u.x) * t + nrm.x * d, y: u.y + (v.y - u.y) * t + nrm.y * d }))), cm, space));
  }
  for (const v of L.givenAngles) {
    const V = S(L.pos[v]), [m, w] = L.ids.filter((u) => u !== v).map((u) => S(L.pos[u]));
    const given = Object.entries(spec.triangle.angles ?? {}).find(([key]) => key.replace(/angle|\s/gi, '').includes(v))?.[1];
    parts.push(angleMark(V, m, w, { label: given !== undefined ? `${given}°` : undefined, radius: 22, space }));
  }
  for (const { p, s } of labelSpots) {
    const cands: XY[] = [];
    for (const r of [14, 22, 30]) for (const t of [-45, 45, -135, 135, 0, 180, -90, 90]) cands.push({ x: p.x + r * Math.cos((t * Math.PI) / 180), y: p.y + r * Math.sin((t * Math.PI) / 180) });
    parts.push(placeLabel(cands.filter((q) => q.x > 6 && q.x < W - 6 && q.y > 10 && q.y < H - 4), s, space, { size: 12 }));
  }
  void textBox;
  return { svg: svg(W, H, parts.join(''), esc(spec.title ?? 'Construction')), problems: L.problems };
}

const segDist = (p: Pt, u: Pt, v: Pt) => {
  const ex = v.x - u.x, ey = v.y - u.y, t = Math.max(0, Math.min(1, ((p.x - u.x) * ex + (p.y - u.y) * ey) / (ex * ex + ey * ey || 1)));
  return Math.hypot(p.x - u.x - ex * t, p.y - u.y - ey * t);
};
/** Inside the triangle, or within `pad` cm of it. */
function insideOrNear(p: Pt, A: Pt, B: Pt, C: Pt, nearest: number, pad: number) {
  const s = (a: Pt, b: Pt) => Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
  const s1 = s(A, B), s2 = s(B, C), s3 = s(C, A);
  const inside = (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
  return inside || nearest < pad;
}
