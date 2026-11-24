// @/components/ai/figures/render/scenes/kit.ts — the drawing kit for scenes
// (textbook diagrams): rock and water patterns, trees, houses, clouds, the
// sun, rain, arrows; and the labelling every scene shares — words in neat
// columns at the sides with leader lines (as textbooks label diagrams), or a
// letter beside the part with a short pointer (for "identify X").
//
// A scene is drawn in its own box (w × h) and reports "anchors": the point
// of each part, which the labels point to. Black and white only.
import { INK, esc, n, placeLabel, svg, text, type LabelSpace } from '../svg';

/** A part's point. `side` says where its words go: a column at the left or right, or just above or below it. */
export interface Anchor { x: number; y: number; side?: 'l' | 'r' | 't' | 'b' }
/** A drawn scene. `inline`: parts whose labels the drawer wrote itself (inside boxes, along arrows). */
export interface Drawn {
  w: number; h: number; body: string; anchors: Record<string, Anchor>; inline?: string[];
  /** Letters go in the side columns with long pointer lines, as ECZ Biology papers do (busy drawings: cells, organs). */
  edge?: boolean;
}
/** `labels`: what the question puts on each part (drawers that write labels themselves read it). */
export interface SceneInput { variant: string; items: string[]; id: string; labels: Record<string, string> }
export type Drawer = (o: SceneInput) => Drawn;

export const GREY = '#e6e6e6';
export const MID = '#bdbdbd';

/** Patterns for scenes: rock layers, magma, water, sand, soil. */
export function sceneDefs(id: string) {
  return `<defs>
<pattern id="${id}-strata" patternUnits="userSpaceOnUse" width="14" height="7"><line x1="1" y1="3.5" x2="9" y2="3.5" stroke="${INK}" stroke-width="0.7"/></pattern>
<pattern id="${id}-bricks" patternUnits="userSpaceOnUse" width="16" height="8"><path d="M0,0 H16 M0,4 H16 M4,0 V4 M12,4 V8" stroke="${INK}" stroke-width="0.6" fill="none"/></pattern>
<pattern id="${id}-dots" patternUnits="userSpaceOnUse" width="6" height="6"><circle cx="1.5" cy="1.5" r="0.8" fill="${INK}"/><circle cx="4.5" cy="4.5" r="0.8" fill="${INK}"/></pattern>
<pattern id="${id}-sand" patternUnits="userSpaceOnUse" width="5" height="5"><circle cx="2.5" cy="2.5" r="0.55" fill="${INK}"/></pattern>
<pattern id="${id}-hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${INK}" stroke-width="0.8"/></pattern>
<pattern id="${id}-cross" patternUnits="userSpaceOnUse" width="7" height="7"><path d="M0,0 L7,7 M7,0 L0,7" stroke="${INK}" stroke-width="0.6"/></pattern>
<pattern id="${id}-vlines" patternUnits="userSpaceOnUse" width="5" height="5"><line x1="2.5" y1="0" x2="2.5" y2="5" stroke="${INK}" stroke-width="0.6"/></pattern>
<pattern id="${id}-water" patternUnits="userSpaceOnUse" width="24" height="10"><rect width="24" height="10" fill="${GREY}"/><path d="M2,6 q3,-3 6,0 t6,0" fill="none" stroke="${INK}" stroke-width="0.6"/></pattern>
<pattern id="${id}-grass" patternUnits="userSpaceOnUse" width="12" height="10"><path d="M3,9 l1,-4 M5,9 l0,-5 M7,9 l-1,-4" stroke="${INK}" stroke-width="0.6"/></pattern>
<marker id="${id}-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${INK}"/></marker>
<marker id="${id}-open" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10" fill="none" stroke="${INK}" stroke-width="1.5"/></marker>
</defs>`;
}
export const fill = (id: string, p: 'strata' | 'bricks' | 'dots' | 'sand' | 'hatch' | 'cross' | 'vlines' | 'water' | 'grass') => `url(#${id}-${p})`;

export const path = (d: string, o: { fill?: string; width?: number; dash?: string; arrow?: string; both?: boolean; cap?: string; color?: string } = {}) =>
  `<path d="${d}" fill="${o.fill ?? 'none'}" stroke="${o.color ?? INK}" stroke-width="${o.width ?? 1.4}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}${o.arrow ? ` marker-end="url(#${o.arrow})"` : ''}${o.arrow && o.both ? ` marker-start="url(#${o.arrow})"` : ''} stroke-linejoin="round" stroke-linecap="${o.cap ?? 'round'}"/>`;
export const area = (d: string, fillValue: string, o: { stroke?: boolean; width?: number } = {}) =>
  `<path d="${d}" fill="${fillValue}" stroke="${o.stroke === false ? 'none' : INK}" stroke-width="${o.width ?? 1.2}" stroke-linejoin="round"/>`;

/** A straight or gently bent arrow from (x1,y1) to (x2,y2). */
export function arrow(id: string, x1: number, y1: number, x2: number, y2: number, o: { bend?: number; width?: number; dash?: string; open?: boolean } = {}) {
  const bend = o.bend ?? 0;
  const mx = (x1 + x2) / 2 - (y2 - y1) * bend, my = (y1 + y2) / 2 + (x2 - x1) * bend;
  return path(bend ? `M${n(x1)},${n(y1)} Q${n(mx)},${n(my)} ${n(x2)},${n(y2)}` : `M${n(x1)},${n(y1)} L${n(x2)},${n(y2)}`, { width: o.width ?? 1.4, dash: o.dash, arrow: `${id}-${o.open ? 'open' : 'arr'}` });
}

/** A broad hollow arrow (forces, winds). */
export function bigArrow(x: number, y: number, len: number, angleDeg: number, thick = 10) {
  const a = (angleDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const pts = [[0, -thick / 2], [len - thick * 1.4, -thick / 2], [len - thick * 1.4, -thick], [len, 0], [len - thick * 1.4, thick], [len - thick * 1.4, thick / 2], [0, thick / 2]]
    .map(([px, py]) => `${n(x + px * c - py * s)},${n(y + px * s + py * c)}`).join(' ');
  return `<polygon points="${pts}" fill="#fff" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>`;
}

export function tree(x: number, y: number, s = 1, bend = 0) {
  const tx = x + bend * 10 * s, ty = y - 16 * s;
  const k = (v: number) => n(v * s);
  // Trunk (curving when the tree has been tilted), then a rounded crown of three lobes.
  return path(`M${n(x)},${n(y)} Q${n(x)},${n(y - 9 * s)} ${n(tx)},${n(ty)}`, { width: 1.7 * s })
    + `<path d="M${n(tx - 10 * s)},${n(ty)} a${k(6)},${k(6)} 0 0,1 ${k(2)},${k(-10)} a${k(8)},${k(8)} 0 0,1 ${k(15)},${k(-2)} a${k(6)},${k(6)} 0 0,1 ${k(3)},${k(12)} z" fill="#fff" stroke="${INK}" stroke-width="${n(1.1 * s)}"/>`;
}
/** A house seen from the side: walls and a pitched roof. */
export const house = (x: number, y: number, s = 1) =>
  `<path d="M${n(x - 6 * s)},${n(y)} V${n(y - 8 * s)} L${n(x)},${n(y - 14 * s)} L${n(x + 6 * s)},${n(y - 8 * s)} V${n(y)} Z" fill="#fff" stroke="${INK}" stroke-width="1"/>`;
/** A building on a plan (map view): a small filled block. */
export const block = (x: number, y: number, w = 5, h = 4, rot = 0) =>
  `<rect x="${n(x - w / 2)}" y="${n(y - h / 2)}" width="${n(w)}" height="${n(h)}" fill="${INK}" transform="rotate(${n(rot)} ${n(x)} ${n(y)})"/>`;

export function cloud(x: number, y: number, s = 1, fillValue = '#fff') {
  const k = (v: number) => n(v * s);
  const d = `M${n(x - 30 * s)},${n(y + 8 * s)} a${k(10)},${k(10)} 0 0,1 ${k(4)},${k(-17)} a${k(14)},${k(14)} 0 0,1 ${k(24)},${k(-8)} a${k(13)},${k(13)} 0 0,1 ${k(24)},${k(4)} a${k(11)},${k(11)} 0 0,1 ${k(8)},${k(19)} z`;
  return `<path d="${d}" fill="${fillValue}" stroke="${INK}" stroke-width="1.2"/>`;
}
export function sun(x: number, y: number, r = 14) {
  let rays = '';
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    rays += `<line x1="${n(x + (r + 3) * Math.cos(a))}" y1="${n(y + (r + 3) * Math.sin(a))}" x2="${n(x + (r + 9) * Math.cos(a))}" y2="${n(y + (r + 9) * Math.sin(a))}" stroke="${INK}" stroke-width="1.2"/>`;
  }
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="${INK}" stroke-width="1.4"/>${rays}`;
}
export function rain(x0: number, x1: number, y0: number, y1: number, gap = 9) {
  let out = '';
  for (let x = x0, k = 0; x <= x1; x += gap, k++) {
    const yy = y0 + (k % 2) * 6;
    out += `<line x1="${n(x)}" y1="${n(yy)}" x2="${n(x - 3)}" y2="${n(Math.min(y1, yy + (y1 - y0) * 0.55))}" stroke="${INK}" stroke-width="0.9" stroke-dasharray="4 3"/>`;
  }
  return out;
}
/** A box with words in the middle (cycle diagrams). */
export function labelBox(cx: number, cy: number, words: string, w = 96, h = 30) {
  const lines = words.split('\n');
  return `<rect x="${n(cx - w / 2)}" y="${n(cy - h / 2)}" width="${w}" height="${h}" rx="5" fill="#fff" stroke="${INK}" stroke-width="1.3"/>`
    + lines.map((l, i) => text(cx, cy + 4 + (i - (lines.length - 1) / 2) * 13, l, { size: 12, anchor: 'middle', weight: 'bold' })).join('');
}
/** Plain words on the drawing (not a label of a part). */
export const words = (x: number, y: number, s: string, o: { size?: number; anchor?: 'start' | 'middle' | 'end'; italic?: boolean; bold?: boolean } = {}) =>
  text(x, y, s, { size: o.size ?? 11, anchor: o.anchor ?? 'middle', italic: o.italic, weight: o.bold ? 'bold' : undefined, halo: true });

/** A small deterministic random generator, so a drawing is the same every time it is opened. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ── Labels ──

/**
 * Puts the scene in a picture with its labels: letters (3 characters or
 * fewer) next to their part with a short pointer line; words in columns
 * at the sides with leader lines. Returns the SVG and any unknown parts.
 */
export function withLabels(d: Drawn, labels: Record<string, string>, title: string, defs: string): { svg: string; problems: string[] } {
  const problems: string[] = [];
  const letters: [Anchor, string][] = [], wordsL: [Anchor, string][] = [], wordsR: [Anchor, string][] = [], wordsTB: [Anchor, string][] = [];
  for (const [key, label] of Object.entries(labels)) {
    if (d.inline?.includes(key)) continue;
    const a = d.anchors[key];
    if (!a) { problems.push(`This diagram has no part "${key}".`); continue; }
    if (!label.trim()) continue;
    const side = a.side ?? (a.x < d.w / 2 ? 'l' : 'r');
    // A letter label is like "X", "R1", "AB", "12" or "iv"; anything else is words.
    const isLetter = /^([A-Za-z]{1,2}\d{0,2}|\d{1,2}|[ivx]{1,4})$/.test(label.trim());
    if (isLetter && d.edge && side !== 't' && side !== 'b') (side === 'l' ? wordsL : wordsR).push([a, label.trim()]);
    else if (isLetter) letters.push([a, label.trim()]);
    else (side === 'l' ? wordsL : side === 'r' ? wordsR : wordsTB).push([a, label.trim()]);
  }
  const SIZE = 11.5;
  const isLetterLabel = (s: string) => /^([A-Za-z]{1,2}\d{0,2}|\d{1,2}|[ivx]{1,4})$/.test(s);
  const widthOf = (s: string) => (isLetterLabel(s) ? 14 : s.length * SIZE * 0.52 + 6);
  const ML = wordsL.length ? Math.min(240, Math.max(...wordsL.map(([, s]) => widthOf(s)))) + 22 : 10;
  const MR = wordsR.length ? Math.min(240, Math.max(...wordsR.map(([, s]) => widthOf(s)))) + 22 : 10;
  const MT = wordsTB.some(([a]) => a.side === 't') ? 26 : 7, MB = wordsTB.some(([a]) => a.side === 'b') ? 26 : 7;
  const W = ML + d.w + MR, H = d.h + MT + MB;
  const parts: string[] = [defs, `<g transform="translate(${ML},${MT})">${d.body}</g>`];
  const at = (a: Anchor) => ({ x: a.x + ML, y: a.y + MT });

  // Word columns: in order of height, spread so no two overlap, each with a leader line.
  const column = (list: [Anchor, string][], side: 'l' | 'r') => {
    const rows = list.map(([a, s]) => ({ p: at(a), s, y: at(a).y })).sort((u, v) => u.y - v.y);
    const gap = 15;
    for (let i = 1; i < rows.length; i++) rows[i].y = Math.max(rows[i].y, rows[i - 1].y + gap);
    const over = rows.length ? rows[rows.length - 1].y - (H - 8) : 0;
    if (over > 0) for (const r of rows) r.y -= over;
    for (let i = rows.length - 2; i >= 0; i--) rows[i].y = Math.min(rows[i].y, rows[i + 1].y - gap);
    for (const r of rows) {
      const tx = side === 'l' ? ML - 14 : ML + d.w + 14;
      parts.push(`<polyline points="${n(side === 'l' ? tx + 3 : tx - 3)},${n(r.y)} ${n(r.p.x)},${n(r.p.y)}" fill="none" stroke="${INK}" stroke-width="0.8"/>`,
        `<circle cx="${n(r.p.x)}" cy="${n(r.p.y)}" r="1.6" fill="${INK}"/>`,
        isLetterLabel(r.s) ? text(tx + (side === 'l' ? -2 : 2), r.y + 5, r.s, { size: 14, anchor: side === 'l' ? 'end' : 'start', weight: 'bold' })
          : text(tx, r.y + 4, r.s, { size: SIZE, anchor: side === 'l' ? 'end' : 'start' }));
    }
  };
  column(wordsL, 'l');
  column(wordsR, 'r');

  // Letters (and words that sit above or below their part): beside the part,
  // where they touch no other label, with a short pointer.
  const space: LabelSpace = { taken: [], segs: [] };
  const pointed = [...letters.map(([a, s]) => ({ a, s, letter: true })), ...wordsTB.map(([a, s]) => ({ a, s, letter: false }))];
  for (const { a, s, letter } of pointed) {
    const p = at(a);
    const cands: { x: number; y: number }[] = [];
    if (letter) for (const r of [20, 28, 36]) for (const ang of [-45, -135, 45, 135, -90, 90, 0, 180]) cands.push({ x: p.x + r * Math.cos((ang * Math.PI) / 180), y: p.y + r * Math.sin((ang * Math.PI) / 180) });
    else for (const dy of [20, 30, 40]) for (const dx of [0, -25, 25, -50, 50]) cands.push({ x: p.x + dx, y: p.y + (a.side === 't' ? -dy : dy) });
    const before = space.taken.length;
    const half = s.length * 3.3;
    const label = placeLabel(cands.filter((c) => c.x - (letter ? 6 : half) > 2 && c.x + (letter ? 6 : half) < W - 2 && c.y > 8 && c.y < H - 4), s, space, letter ? { size: 15, bold: true } : { size: 11.5 });
    const b = space.taken[before];
    if (b) {
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      const len = Math.hypot(p.x - cx, p.y - cy) || 1, ux = (p.x - cx) / len, uy = (p.y - cy) / len;
      // The pointer starts at the edge of the label's box.
      const edge = Math.min(Math.abs(ux) > 1e-6 ? (b.x1 - b.x0) / 2 / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-6 ? (b.y1 - b.y0) / 2 / Math.abs(uy) : Infinity) + 1;
      if (len > edge + 3) parts.push(`<line x1="${n(cx + ux * edge)}" y1="${n(cy + uy * edge)}" x2="${n(p.x - ux * 2)}" y2="${n(p.y - uy * 2)}" stroke="${INK}" stroke-width="0.9"/>`, `<circle cx="${n(p.x)}" cy="${n(p.y)}" r="1.6" fill="${INK}"/>`);
    }
    parts.push(label);
  }
  return { svg: svg(W, H, `<rect width="${n(W)}" height="${n(H)}" fill="#fff"/>${parts.join('')}`, esc(title)), problems };
}
