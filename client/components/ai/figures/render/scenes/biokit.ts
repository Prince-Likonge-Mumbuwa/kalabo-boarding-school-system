// @/components/ai/figures/render/scenes/biokit.ts — drawing pieces for the
// Biology diagrams: smooth outlines through a few points (cells, organs),
// and the organelles drawn the way O Level textbooks draw them
// (chloroplast with grana, mitochondrion with folded inner membrane, nucleus
// with a nucleolus). Black ink, white or stippled fills.
import { INK, n } from '../svg';
import { fill } from './kit';

export type Pt = [number, number];

/** A smooth path through points (Catmull-Rom turned into Bézier curves). `closed` joins the end to the start. */
export function smooth(pts: Pt[], closed = false, t = 1): string {
  if (pts.length < 2) return '';
  const P = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M${n(P[1][0])},${n(P[1][1])}`;
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const c1: Pt = [p1[0] + ((p2[0] - p0[0]) / 6) * t, p1[1] + ((p2[1] - p0[1]) / 6) * t];
    const c2: Pt = [p2[0] - ((p3[0] - p1[0]) / 6) * t, p2[1] - ((p3[1] - p1[1]) / 6) * t];
    d += ` C${n(c1[0])},${n(c1[1])} ${n(c2[0])},${n(c2[1])} ${n(p2[0])},${n(p2[1])}`;
  }
  return closed ? d + ' Z' : d;
}

/** A closed outline through points, filled. */
export const blob = (pts: Pt[], fillValue = '#fff', width = 1.4, dash?: string) =>
  `<path d="${smooth(pts, true)}" fill="${fillValue}" stroke="${INK}" stroke-width="${width}"${dash ? ` stroke-dasharray="${dash}"` : ''} stroke-linejoin="round"/>`;

/** An open smooth line. */
export const curve = (pts: Pt[], width = 1.4, o: { dash?: string; fill?: string } = {}) =>
  `<path d="${smooth(pts)}" fill="${o.fill ?? 'none'}" stroke="${INK}" stroke-width="${width}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''} stroke-linecap="round" stroke-linejoin="round"/>`;

export const ellipse = (cx: number, cy: number, rx: number, ry: number, o: { rot?: number; fill?: string; width?: number; dash?: string } = {}) =>
  `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${o.fill ?? '#fff'}" stroke="${INK}" stroke-width="${o.width ?? 1.2}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}${o.rot ? ` transform="rotate(${n(o.rot)} ${n(cx)} ${n(cy)})"` : ''}/>`;

export const circle = (cx: number, cy: number, r: number, o: { fill?: string; width?: number; dash?: string } = {}) =>
  `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${o.fill ?? '#fff'}" stroke="${INK}" stroke-width="${o.width ?? 1.2}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`;

export const dot = (x: number, y: number, r = 1.3) => `<circle cx="${n(x)}" cy="${n(y)}" r="${r}" fill="${INK}"/>`;

/** A chloroplast: an oval with stacks of grana. */
export function chloroplast(cx: number, cy: number, rx = 11, ry = 6, rot = 0) {
  let g = ellipse(cx, cy, rx, ry, { fill: '#f2f2f2', width: 1 });
  for (const k of [-0.5, 0, 0.5]) g += `<line x1="${n(cx + k * rx - 2)}" y1="${n(cy - ry * 0.45)}" x2="${n(cx + k * rx - 2)}" y2="${n(cy + ry * 0.45)}" stroke="${INK}" stroke-width="1.6" stroke-dasharray="1.2 0.8"/>`;
  return rot ? `<g transform="rotate(${n(rot)} ${n(cx)} ${n(cy)})">${g}</g>` : g;
}

/** A mitochondrion: an oval with a folded inner membrane (cristae). */
export function mitochondrion(cx: number, cy: number, rx = 12, ry = 6, rot = 0) {
  let d = `M${n(cx - rx * 0.75)},${n(cy)}`;
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    const x = cx - rx * 0.75 + ((i + 0.5) * rx * 1.5) / steps, up = i % 2 ? 1 : -1;
    d += ` L${n(x)},${n(cy + up * ry * 0.6)} L${n(x + (rx * 1.5) / steps / 2)},${n(cy)}`;
  }
  const g = ellipse(cx, cy, rx, ry, { width: 1 }) + `<path d="${d}" fill="none" stroke="${INK}" stroke-width="0.8"/>`;
  return rot ? `<g transform="rotate(${n(rot)} ${n(cx)} ${n(cy)})">${g}</g>` : g;
}

/** A nucleus with a nucleolus; `envelope` draws the double membrane with pores (electron microscope). */
export function nucleus(id: string, cx: number, cy: number, rx: number, ry = rx, envelope = false) {
  let g = ellipse(cx, cy, rx, ry, { fill: fill(id, 'sand'), width: 1.3 });
  if (envelope) {
    g += ellipse(cx, cy, rx + 3, ry + 3, { fill: 'none', width: 1 });
    for (let a = 0; a < 360; a += 45) {
      const r = (a * Math.PI) / 180;
      g += `<line x1="${n(cx + (rx - 1) * Math.cos(r))}" y1="${n(cy + (ry - 1) * Math.sin(r))}" x2="${n(cx + (rx + 4) * Math.cos(r))}" y2="${n(cy + (ry + 4) * Math.sin(r))}" stroke="#fff" stroke-width="2.6"/>`;
    }
  }
  return g + circle(cx + rx * 0.2, cy - ry * 0.15, Math.min(rx, ry) * 0.3, { fill: INK, width: 0 });
}

/** Ribosomes: small dots scattered in a box, seeded so they never move. */
export function ribosomes(x0: number, y0: number, x1: number, y1: number, count: number, rnd: () => number, inside?: (x: number, y: number) => boolean) {
  let g = '';
  for (let i = 0, tries = 0; i < count && tries < count * 20; tries++) {
    const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0);
    if (inside && !inside(x, y)) continue;
    g += dot(x, y, 1.1);
    i++;
  }
  return g;
}

/** Rough endoplasmic reticulum: parallel folded membranes studded with ribosomes. */
export function roughER(x: number, y: number, w: number, layers = 3, rough = true) {
  let g = '';
  for (let k = 0; k < layers; k++) {
    const yy = y + k * 7;
    const pts: Pt[] = [];
    for (let i = 0; i <= 6; i++) pts.push([x + (w * i) / 6, yy + (i % 2 ? 2 : -2)]);
    g += curve(pts, 1);
    if (rough) for (let i = 0; i <= 10; i++) g += dot(x + (w * i) / 10, yy + 3.3 + (i % 2 ? 1 : -0.4), 0.9);
  }
  return g;
}

/** Golgi body: a stack of curved flattened sacs with vesicles. */
export function golgi(x: number, y: number, w = 34) {
  let g = '';
  for (let k = 0; k < 4; k++) g += curve([[x, y + k * 5], [x + w / 2, y + k * 5 + 5], [x + w, y + k * 5]], 2.2);
  g += circle(x - 4, y + 18, 2.5, { width: 0.8 }) + circle(x + w + 4, y + 18, 2.5, { width: 0.8 });
  return g;
}

/** Points on an ellipse, wobbled a little (a natural cell outline). */
export function oval(cx: number, cy: number, rx: number, ry: number, k = 10, wobble = 0.06, seed = 3): Pt[] {
  let s = seed;
  const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280 - 0.5; };
  return Array.from({ length: k }, (_, i) => {
    const a = (i / k) * Math.PI * 2, f = 1 + r() * wobble * 2;
    return [cx + rx * f * Math.cos(a), cy + ry * f * Math.sin(a)] as Pt;
  });
}

/** A rounded rectangle outline (plant cells, tissues). */
export const roundRect = (x: number, y: number, w: number, h: number, r: number, o: { fill?: string; width?: number; dash?: string } = {}) =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(r)}" fill="${o.fill ?? '#fff'}" stroke="${INK}" stroke-width="${o.width ?? 1.3}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`;

/** A hollow tube along a smooth centre line (blood vessels, ducts, intestine): two ink walls, white (or filled) inside. */
export function tube(pts: Pt[], width: number, o: { fill?: string; wall?: number } = {}) {
  const d = smooth(pts), wall = o.wall ?? 1.3;
  return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${n(width + wall * 2)}" stroke-linecap="butt" stroke-linejoin="round"/>`
    + `<path d="${d}" fill="none" stroke="${o.fill ?? '#fff'}" stroke-width="${n(width)}" stroke-linecap="butt" stroke-linejoin="round"/>`;
}
