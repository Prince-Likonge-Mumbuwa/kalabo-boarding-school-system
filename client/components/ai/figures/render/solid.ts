// @/components/ai/figures/render/solid.ts — solids for mensuration, drawn the
// way ECZ papers draw them: cuboids, prisms and pyramids in oblique view;
// cylinders, cones, frustums (buckets), spheres and hemispheres with
// elliptical ends. Hidden edges are dashed, perpendicular heights are dashed
// with a right-angle mark, and the measurements the question gives are
// written on the drawing. Proportions follow `dims`, so a 6 cm top and a
// 24 cm base look like it.
import type { SolidSpec } from '../spec';
import { INK, dot, esc, n, pointLabel, seg, svg, type XY } from './svg';

const K = 0.32; // ellipse squash for circles seen from slightly above
const DEPTH = 0.5, DEPTH_ANGLE = (35 * Math.PI) / 180; // oblique depth for boxes

export function renderSolid(spec: SolidSpec): { svg: string; problems: string[] } {
  const problems: string[] = [];
  const d = spec.dims;
  const lab = spec.labels ?? {};
  const shape = spec.shape;
  const need = (keys: (keyof typeof d)[]) => {
    const missing = keys.filter((k) => !(typeof d[k] === 'number' && (d[k] as number) > 0));
    if (missing.length) problems.push(`A ${shape} needs ${missing.join(', ')} in "dims".`);
    return !missing.length;
  };

  // ── Build the drawing in model units (x right, y up), then fit it on screen ──
  const lines: { a: XY; b: XY; hidden?: boolean; width?: number }[] = [];
  const curves: { d: (S: (p: XY) => XY) => string; hidden?: boolean }[] = [];
  const marks: ((S: (p: XY) => XY, scale: number) => string)[] = [];
  const corners: XY[] = []; // in letter order (see spec.ts)
  const extent: XY[] = [];
  const add = (a: XY, b: XY, hidden = false, width?: number) => { lines.push({ a, b, hidden, width }); extent.push(a, b); };
  const box = (x: number, y: number, z: number): XY => ({ x: x + z * DEPTH * Math.cos(DEPTH_ANGLE), y: y + z * DEPTH * Math.sin(DEPTH_ANGLE) });

  /**
   * A flat-faced solid (x right, y up, z going back): draws every edge, dashed
   * when all the faces beside it face away from us. Returns the screen corners.
   */
  const polyhedron = (v: [number, number, number][], faces: number[][]): XY[] => {
    const toViewer = [DEPTH * Math.cos(DEPTH_ANGLE), DEPTH * Math.sin(DEPTH_ANGLE), -1];
    const mid = [0, 1, 2].map((k) => v.reduce((s_, p) => s_ + p[k], 0) / v.length);
    const facing = faces.map((f) => {
      const [a, b, c] = [v[f[0]], v[f[1]], v[f[2]]];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      let nrm = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const fc = [0, 1, 2].map((k) => f.reduce((s_, i) => s_ + v[i][k], 0) / f.length);
      if (nrm[0] * (fc[0] - mid[0]) + nrm[1] * (fc[1] - mid[1]) + nrm[2] * (fc[2] - mid[2]) < 0) nrm = nrm.map((x) => -x); // point outwards
      return nrm[0] * toViewer[0] + nrm[1] * toViewer[1] + nrm[2] * toViewer[2] > 1e-9;
    });
    const edges = new Map<string, boolean>(); // edge -> seen from at least one visible face
    faces.forEach((f, fi) => f.forEach((a, i) => {
      const b = f[(i + 1) % f.length], key = a < b ? `${a}-${b}` : `${b}-${a}`;
      edges.set(key, (edges.get(key) ?? false) || facing[fi]);
    }));
    const pts = v.map(([x, y, z]) => box(x, y, z));
    for (const [key, visible] of edges) {
      const [a, b] = key.split('-').map(Number);
      add(pts[a], pts[b], !visible);
    }
    return pts;
  };

  /** An ellipse for a circle of radius r at centre c (front half solid, back half dashed unless whole). */
  const ellipse = (c: XY, r: number, mode: 'whole' | 'split' = 'split') => {
    extent.push({ x: c.x - r, y: c.y - K * r }, { x: c.x + r, y: c.y + K * r });
    const arc = (from: number, to: number) => (S: (p: XY) => XY) => {
      const pts: string[] = [];
      for (let i = 0; i <= 48; i++) {
        const t = from + ((to - from) * i) / 48;
        const p = S({ x: c.x + r * Math.cos(t), y: c.y - K * r * Math.sin(t) });
        pts.push(`${n(p.x)},${n(p.y)}`);
      }
      return pts.join(' ');
    };
    if (mode === 'whole') curves.push({ d: arc(0, 2 * Math.PI) });
    else {
      curves.push({ d: arc(Math.PI, 2 * Math.PI), hidden: true }); // back half (upper on screen), dashed
      curves.push({ d: arc(0, Math.PI) }); // front half
    }
  };
  const heightLabel = (a: XY, b: XY, text_: string | undefined, side: 1 | -1 = 1) => {
    if (text_) marks.push((S) => { const p = S({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }); return pointLabel(p, text_, { x: side, y: 0 }, 8, 12).replace(/ font-weight="bold"/g, ''); });
  };
  const sideText = (a: XY, b: XY, text_: string | undefined, dir: XY) => {
    if (text_) marks.push((S) => { const p = S({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }); return pointLabel(p, text_, dir, 9, 12).replace(/ font-weight="bold"/g, ''); });
  };
  const rightAngle = (foot: XY, up: XY, along: XY) => marks.push((S) => {
    const f = S(foot), u = S(up), a = S(along);
    const lu = Math.hypot(u.x - f.x, u.y - f.y) || 1, la = Math.hypot(a.x - f.x, a.y - f.y) || 1;
    const s = 8, p1 = { x: f.x + (s * (u.x - f.x)) / lu, y: f.y + (s * (u.y - f.y)) / lu }, p3 = { x: f.x + (s * (a.x - f.x)) / la, y: f.y + (s * (a.y - f.y)) / la };
    return `<polyline points="${n(p1.x)},${n(p1.y)} ${n(p1.x + p3.x - f.x)},${n(p1.y + p3.y - f.y)} ${n(p3.x)},${n(p3.y)}" fill="none" stroke="${INK}" stroke-width="0.9"/>`;
  });
  /** Radius (or diameter) line on an ellipse with its label above. */
  const radiusLine = (c: XY, r: number, radiusText?: string, diameterText?: string) => {
    if (diameterText) { add({ x: c.x - r, y: c.y }, { x: c.x + r, y: c.y }, false, 1); sideText({ x: c.x - r, y: c.y }, { x: c.x + r, y: c.y }, diameterText, { x: 0, y: -1 }); }
    else if (radiusText) { add(c, { x: c.x + r, y: c.y }, false, 1); marks.push((S) => dot(S(c), 1.8)); sideText(c, { x: c.x + r, y: c.y }, radiusText, { x: 0, y: -1 }); }
  };

  switch (shape) {
    case 'cube':
    case 'cuboid':
    case 'pyramid':
    case 'pyramid-frustum': {
      const L = d.length ?? 0, W = d.width ?? d.length ?? 0, H = shape === 'cube' ? L : d.height ?? 0;
      if (!need(shape === 'cube' ? ['length'] : ['length', 'height'])) break;
      const base: [number, number, number][] = [[0, 0, 0], [L, 0, 0], [L, 0, W], [0, 0, W]];
      const bottom = [0, 1, 2, 3];
      if (shape === 'cube' || shape === 'cuboid') {
        const v = [...base, ...base.map(([x, , z]) => [x, H, z] as [number, number, number])];
        const p = polyhedron(v, [bottom, [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]);
        corners.push(...p);
        sideText(p[0], p[1], lab.length, { x: 0, y: 1 });
        heightLabel(p[1], p[5], lab.height, 1);
        sideText(p[1], p[2], lab.width, { x: 1, y: 0.4 });
      } else if (shape === 'pyramid') {
        const v = [...base, [L / 2, H, W / 2] as [number, number, number]];
        const p = polyhedron(v, [bottom, [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]]);
        const foot = box(L / 2, 0, W / 2);
        add(p[4], foot, true, 1); rightAngle(foot, p[4], p[1]);
        corners.push(...p);
        sideText(p[0], p[1], lab.length, { x: 0, y: 1 });
        sideText(p[1], p[2], lab.width, { x: 1, y: 0.4 });
        heightLabel(foot, p[4], lab.height, -1);
      } else {
        const tl = d.topLength ?? 0, tw = d.topWidth ?? d.topLength ?? 0;
        if (!need(['topLength'])) break;
        const ox = (L - tl) / 2, oz = (W - tw) / 2;
        const top: [number, number, number][] = [[ox, H, oz], [ox + tl, H, oz], [ox + tl, H, oz + tw], [ox, H, oz + tw]];
        const p = polyhedron([...base, ...top], [bottom, [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]);
        corners.push(...p);
        const foot = box(L / 2, 0, W / 2), up = box(L / 2, H, W / 2);
        add(up, foot, true, 1); rightAngle(foot, up, p[1]);
        sideText(p[0], p[1], lab.length, { x: 0, y: 1 });
        sideText(p[1], p[2], lab.width, { x: 1, y: 0.4 });
        sideText(p[4], p[5], lab.topLength, { x: 0, y: -1 });
        sideText(p[5], p[6], lab.topWidth, { x: 1, y: -0.2 });
        heightLabel(foot, up, lab.height, -1);
      }
      break;
    }
    case 'prism': {
      if (!need(['base', 'triangleHeight', 'length'])) break;
      const bw = d.base!, th = d.triangleHeight!, L = d.length!;
      const p = polyhedron(
        [[0, 0, 0], [bw, 0, 0], [bw / 2, th, 0], [0, 0, L], [bw, 0, L], [bw / 2, th, L]],
        [[0, 1, 2], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5]],
      );
      corners.push(...p);
      const foot = box(bw / 2, 0, 0);
      if (lab.triangleHeight) { add(p[2], foot, true, 1); rightAngle(foot, p[2], p[1]); heightLabel(foot, p[2], lab.triangleHeight, -1); }
      sideText(p[0], p[1], lab.base, { x: 0, y: 1 });
      sideText(p[1], p[4], lab.length, { x: 1, y: 0.4 });
      break;
    }
    case 'cylinder': {
      if (!need(['radius', 'height'])) break;
      const r = d.radius!, H = d.height!;
      ellipse({ x: 0, y: H }, r, 'whole');
      ellipse({ x: 0, y: 0 }, r, 'split');
      add({ x: -r, y: 0 }, { x: -r, y: H }); add({ x: r, y: 0 }, { x: r, y: H });
      radiusLine({ x: 0, y: H }, r, lab.radius, lab.diameter);
      heightLabel({ x: r, y: 0 }, { x: r, y: H }, lab.height, 1);
      corners.push({ x: -r, y: H }, { x: r, y: H }, { x: -r, y: 0 }, { x: r, y: 0 }, { x: 0, y: H }, { x: 0, y: 0 });
      break;
    }
    case 'cone': {
      if (!need(['radius', 'height'])) break;
      const r = d.radius!, H = d.height!;
      const apex = { x: 0, y: H }, c = { x: 0, y: 0 };
      ellipse(c, r, 'split');
      add({ x: -r, y: 0 }, apex); add({ x: r, y: 0 }, apex);
      add(apex, c, true, 1); rightAngle(c, apex, { x: r, y: 0 });
      radiusLine(c, r, lab.radius, lab.diameter);
      heightLabel(c, apex, lab.height, -1);
      sideText({ x: r, y: 0 }, apex, lab.slant, { x: 1, y: -0.3 });
      corners.push(apex, { x: -r, y: 0 }, { x: r, y: 0 }, c);
      break;
    }
    case 'frustum': {
      if (!need(['radius', 'topRadius', 'height'])) break;
      const rb = d.radius!, rt = d.topRadius!, H = d.height!;
      const top = { x: 0, y: H }, bot = { x: 0, y: 0 };
      ellipse(top, rt, 'whole');
      ellipse(bot, rb, 'split');
      add({ x: -rb, y: 0 }, { x: -rt, y: H }); add({ x: rb, y: 0 }, { x: rt, y: H });
      add(top, bot, true, 1); rightAngle(bot, top, { x: rb, y: 0 });
      radiusLine(top, rt, lab.topRadius, lab.topDiameter);
      radiusLine(bot, rb, lab.radius, lab.diameter);
      heightLabel(bot, top, lab.height, -1);
      sideText({ x: rb, y: 0 }, { x: rt, y: H }, lab.slant, { x: 1, y: -0.3 });
      corners.push({ x: -rt, y: H }, { x: rt, y: H }, { x: -rb, y: 0 }, { x: rb, y: 0 }, top, bot);
      if (spec.showCut && Math.abs(rb - rt) > 1e-9) {
        // The cone it was cut from: continue the sides to the apex beyond the narrow end.
        const apexY = rb > rt ? (H * rb) / (rb - rt) : -(H * rt) / (rt - rb);
        const apex = { x: 0, y: apexY };
        const narrowY = rb > rt ? H : 0, narrow = rb > rt ? rt : rb;
        add({ x: -narrow, y: narrowY }, apex, true); add({ x: narrow, y: narrowY }, apex, true);
        add(apex, { x: 0, y: narrowY }, true, 1);
        corners.push(apex);
      }
      break;
    }
    case 'sphere':
    case 'hemisphere': {
      if (!need(['radius'])) break;
      const r = d.radius!, c = { x: 0, y: 0 };
      if (shape === 'sphere') {
        curves.push({ d: (S) => { const p = S(c), q = S({ x: r, y: 0 }); const R = q.x - p.x; return `M${n(p.x - R)},${n(p.y)} A${n(R)},${n(R)} 0 1 1 ${n(p.x + R)},${n(p.y)} A${n(R)},${n(R)} 0 1 1 ${n(p.x - R)},${n(p.y)}`; } });
        extent.push({ x: -r, y: -r }, { x: r, y: r });
        ellipse(c, r, 'split');
      } else {
        curves.push({ d: (S) => { const p = S(c), q = S({ x: r, y: 0 }); const R = q.x - p.x; return `M${n(p.x - R)},${n(p.y)} A${n(R)},${n(R)} 0 0 1 ${n(p.x + R)},${n(p.y)}`; } });
        extent.push({ x: -r, y: 0 }, { x: r, y: r });
        ellipse(c, r, 'split');
      }
      radiusLine(c, r, lab.radius, lab.diameter);
      corners.push(c);
      break;
    }
  }
  if (!extent.length) return { svg: '', problems };

  // Fit on screen
  const minX = Math.min(...extent.map((p) => p.x)), maxX = Math.max(...extent.map((p) => p.x));
  const minY = Math.min(...extent.map((p) => p.y)), maxY = Math.max(...extent.map((p) => p.y));
  const scale = Math.min(300 / Math.max(maxX - minX, 1e-9), 260 / Math.max(maxY - minY, 1e-9));
  const PADX = 64, PADY = 34;
  const W = (maxX - minX) * scale + 2 * PADX, H = (maxY - minY) * scale + 2 * PADY;
  const S = (p: XY): XY => ({ x: PADX + (p.x - minX) * scale, y: PADY + (maxY - p.y) * scale });

  const parts: string[] = [];
  for (const c of curves) {
    const d_ = c.d(S);
    parts.push(d_.startsWith('M')
      ? `<path d="${d_}" fill="none" stroke="${INK}" stroke-width="1.5"/>`
      : `<polyline points="${d_}" fill="none" stroke="${INK}" stroke-width="${c.hidden ? 1 : 1.5}"${c.hidden ? ' stroke-dasharray="5 4"' : ''}/>`);
  }
  for (const l of lines) parts.push(seg(S(l.a), S(l.b), { dashed: l.hidden, width: l.width ?? (l.hidden ? 1 : 1.5) }));
  for (const m of marks) parts.push(m(S, scale));
  const mid = S({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
  (spec.letters ?? []).forEach((letter, i) => {
    if (!letter) return;
    const p = corners[i];
    if (!p) { problems.push(`There is no corner ${i + 1} for the letter ${letter} on a ${shape}.`); return; }
    const sp = S(p);
    const away = { x: sp.x - mid.x, y: sp.y - mid.y };
    parts.push(pointLabel(sp, letter, Math.hypot(away.x, away.y) > 4 ? away : { x: 1, y: -1 }, 10));
  });
  return { svg: svg(W, H, parts.join(''), esc(spec.title ?? 'Solid')), problems };
}
