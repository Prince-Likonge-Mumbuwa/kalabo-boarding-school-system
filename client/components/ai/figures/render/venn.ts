// @/components/ai/figures/render/venn.ts — Venn diagrams as ECZ prints them:
// a rectangle for the universal set (ξ in the corner), two or three
// overlapping circles with their letters (and names), numbers in the regions,
// and hatching on the regions a question shades. A shading written as a set
// expression ("A′ ∩ (B ∩ C)") is worked out exactly by figureMath.
import type { VennSpec } from '../spec';
import { regionKey, shadeRegions } from '../figureMath';
import { INK, esc, n, patterns, svg, text, uid } from './svg';

const W = 380, H = 270;
const BOX = { x: 14, y: 14, w: W - 28, h: H - 28 };

interface Circ { x: number; y: number; r: number }

const LAYOUT: Record<2 | 3, Circ[]> = {
  2: [{ x: 148, y: 135, r: 78 }, { x: 232, y: 135, r: 78 }],
  3: [{ x: 152, y: 104, r: 66 }, { x: 228, y: 104, r: 66 }, { x: 190, y: 168, r: 66 }],
};

export function renderVenn(spec: VennSpec): { svg: string; problems: string[] } {
  const problems: string[] = [];
  const sets = spec.sets.map((s) => (typeof s === 'string' ? { id: s, label: undefined as string | undefined } : s));
  const ids = sets.map((s) => s.id);
  if (sets.length !== 2 && sets.length !== 3) return { svg: '', problems: ['A Venn diagram here has 2 or 3 sets.'] };
  const circles = LAYOUT[sets.length as 2 | 3];
  const id = uid('vn');
  const parts: string[] = [patterns(id)];

  // Shading
  let shaded: string[] = [];
  if (typeof spec.shade === 'string' && spec.shade.trim()) {
    try { shaded = shadeRegions(spec.shade, ids); } catch (err) { problems.push((err as Error).message); }
  } else if (Array.isArray(spec.shade)) {
    for (const k of spec.shade) {
      const key = regionKey(k, ids);
      if (key === null) problems.push(`"${k}" is not a region of this Venn diagram.`);
      else shaded.push(key);
    }
  }
  const defs: string[] = circles.map((c, i) => `<clipPath id="${id}-c${i}"><circle cx="${c.x}" cy="${c.y}" r="${c.r}"/></clipPath>`);
  for (const key of shaded) {
    const inside = ids.map((s, i) => (key.includes(s) ? i : -1)).filter((i) => i >= 0);
    const outside = ids.map((_, i) => i).filter((i) => !inside.includes(i));
    defs.push(`<mask id="${id}-m${key || 'out'}"><rect x="${BOX.x}" y="${BOX.y}" width="${BOX.w}" height="${BOX.h}" fill="#fff"/>${outside.map((i) => `<circle cx="${circles[i].x}" cy="${circles[i].y}" r="${circles[i].r}" fill="#000"/>`).join('')}</mask>`);
    let shape = `<rect x="${BOX.x}" y="${BOX.y}" width="${BOX.w}" height="${BOX.h}" fill="url(#${id}-hatch)" mask="url(#${id}-m${key || 'out'})"/>`;
    for (const i of inside) shape = `<g clip-path="url(#${id}-c${i})">${shape}</g>`;
    parts.push(shape);
  }
  parts.unshift(`<defs>${defs.join('')}</defs>`);

  // Rectangle, circles and their letters
  parts.push(`<rect x="${BOX.x}" y="${BOX.y}" width="${BOX.w}" height="${BOX.h}" fill="none" stroke="${INK}" stroke-width="1.4"/>`);
  parts.push(text(BOX.x + 8, BOX.y + 18, spec.universal ?? 'ξ', { size: 15, weight: 'bold' }));
  circles.forEach((c, i) => {
    parts.push(`<circle cx="${c.x}" cy="${c.y}" r="${c.r}" fill="none" stroke="${INK}" stroke-width="1.4"/>`);
    const s = sets[i];
    // Names outside the circle (above the first two, lower-right of the third), kept
    // inside the rectangle however long they are ("Zamtel Kwacha (Z)").
    const words = s.label ? `${s.label} (${s.id})` : s.id;
    const size = words.length > 12 ? 13 : 14;
    const width = words.length * size * 0.56; // close enough for a Times-like bold font
    const lower = sets.length === 3 && i === 2;
    // The first two sit just above their circle (ending/starting near its middle); the third at its lower right.
    const ly = lower ? c.y + (c.r + 10) * Math.sin(0.95) + 10 : c.y - c.r - 7;
    let left = lower ? c.x + (c.r + 10) * Math.cos(0.95) : i === 0 ? c.x + 12 - width : c.x - 12;
    left = Math.max(BOX.x + 24, Math.min(BOX.x + BOX.w - 6 - width, left)); // 24: clear of the ξ
    parts.push(text(left, Math.min(ly, BOX.y + BOX.h - 8), words, { size, weight: 'bold', anchor: 'start', halo: true }));
  });

  // Numbers (or letters like x, 2x) in the regions
  for (const [k, v] of Object.entries(spec.counts ?? {})) {
    const key = regionKey(k, ids);
    if (key === null) { problems.push(`"${k}" is not a region of this Venn diagram.`); continue; }
    const at = regionCentre(key, ids, circles);
    if (at) parts.push(text(at.x, at.y + 5, String(v), { size: 14, anchor: 'middle', halo: shaded.length > 0 }));
  }
  return { svg: svg(W, H, parts.join(''), esc(spec.title ?? 'Venn diagram')), problems };
}

/** A good spot for a region's number: the sample point furthest from every edge. */
function regionCentre(key: string, ids: string[], circles: Circ[]) {
  let best: { x: number; y: number } | null = null, bestD = -1;
  for (let x = BOX.x + 6; x < BOX.x + BOX.w; x += 4)
    for (let y = BOX.y + 6; y < BOX.y + BOX.h; y += 4) {
      const inSets = circles.map((c) => Math.hypot(x - c.x, y - c.y) < c.r);
      const k = ids.filter((_, i) => inSets[i]).join('');
      if (k !== key) continue;
      let d = Math.min(x - BOX.x, BOX.x + BOX.w - x, y - BOX.y, BOX.y + BOX.h - y);
      for (const c of circles) d = Math.min(d, Math.abs(Math.hypot(x - c.x, y - c.y) - c.r));
      if (key === '') d = Math.min(d, 40); // outside: any roomy corner will do
      if (d > bestD + 0.5 || (key === '' && d >= bestD && y > (best?.y ?? 0))) { bestD = d; best = { x, y }; }
    }
  return best ? { x: Number(n(best.x)), y: Number(n(best.y)) } : null;
}
