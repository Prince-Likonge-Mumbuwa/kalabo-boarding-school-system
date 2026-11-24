// @/components/ai/figures/render/scenes/cycles.ts — cycle and chain diagrams
// for Geography, Biology and Integrated Science: the rock cycle, the carbon
// and nitrogen cycles, ecological pyramids and food chains. Names sit inside
// boxes and beside arrows (not in side columns), so the drawer writes them
// itself. A box keeps its usual name unless the question gives it another
// (or a letter); a process arrow is named only when the question says so
// (every part is named when the question gives no labels at all).
import { INK, n } from '../svg';
import { arrow, labelBox, words, type Anchor, type Drawer, type SceneInput } from './kit';

interface Box { key?: string; text: string; x: number; y: number; w?: number; h?: number }
interface Flow { key?: string; from: [number, number]; to: [number, number]; bend?: number; at?: [number, number]; anchor?: 'start' | 'middle' | 'end' }

function cycle(o: SceneInput, w: number, h: number, boxes: Box[], flows: Flow[]) {
  let body = '';
  const anchors: Record<string, Anchor> = {};
  const inline: string[] = [];
  for (const f of flows) {
    body += arrow(o.id, f.from[0], f.from[1], f.to[0], f.to[1], { bend: f.bend ?? 0, width: 1.4 });
    const mid: [number, number] = f.at ?? [(f.from[0] + f.to[0]) / 2, (f.from[1] + f.to[1]) / 2];
    if (f.key) {
      anchors[f.key] = { x: mid[0], y: mid[1] };
      inline.push(f.key);
      const t = o.labels[f.key];
      if (t) {
        const isLetter = /^([A-Za-z]{1,2}\d{0,2}|\d{1,2})$/.test(t);
        const lines = isLetter ? [t] : wrapWords(t, 18);
        lines.forEach((l, i) => { body += words(mid[0], mid[1] + 4 + (i - (lines.length - 1) / 2) * 12, l, { size: isLetter ? 14 : 10.5, bold: isLetter, italic: !isLetter, anchor: f.anchor ?? 'middle' }); });
      }
    }
  }
  for (const b of boxes) {
    const t = b.key ? o.labels[b.key] ?? b.text : b.text;
    body += labelBox(b.x, b.y, wrapWords(t, 20).join('\n'), b.w ?? 120, b.h ?? 34);
    if (b.key) { anchors[b.key] = { x: b.x, y: b.y }; inline.push(b.key); }
  }
  return { w, h, body, anchors, inline };
}
function wrapWords(s: string, max: number) {
  const out: string[] = [];
  let line = '';
  for (const w of s.split(/\s+/)) { if (line && (line + ' ' + w).length > max) { out.push(line); line = w; } else line = line ? `${line} ${w}` : w; }
  if (line) out.push(line);
  return out.length ? out : [''];
}

export const rockCycle: Drawer = (o) => cycle(o, 480, 330, [
  { key: 'igneous', text: 'Igneous rock', x: 240, y: 36 }, { text: 'Sediments', x: 410, y: 110, w: 100 }, { key: 'sedimentary', text: 'Sedimentary rock', x: 400, y: 220 },
  { key: 'metamorphic', text: 'Metamorphic rock', x: 80, y: 220 }, { key: 'magma', text: 'Magma', x: 240, y: 300, w: 100 },
], [
  { key: 'weathering', from: [300, 44], to: [400, 92], bend: 0.12, at: [372, 52] },
  { key: 'deposition', from: [410, 128], to: [404, 202], at: [440, 166], anchor: 'start' },
  { key: 'heat-pressure', from: [338, 222], to: [142, 222], at: [240, 208] },
  { key: 'melting', from: [96, 238], to: [196, 292], bend: -0.12, at: [108, 286] },
  { key: 'cooling', from: [240, 282], to: [240, 54], at: [240, 160] },
]);

export const carbonCycle: Drawer = (o) => cycle(o, 520, 350, [
  { key: 'atmosphere', text: 'Carbon dioxide in the air', x: 260, y: 36, w: 190 }, { text: 'Green plants', x: 100, y: 180 }, { text: 'Animals', x: 420, y: 180 },
  { text: 'Dead remains and waste', x: 260, y: 270, w: 150 }, { key: 'fossil-fuels', text: 'Fossil fuels (coal, oil, gas)', x: 440, y: 318, w: 150 },
], [
  { key: 'photosynthesis', from: [170, 50], to: [84, 162], bend: 0.1, at: [70, 100] },
  { key: 'plant-respiration', from: [118, 162], to: [196, 54], bend: 0.1, at: [190, 110] },
  { key: 'feeding', from: [162, 180], to: [358, 180], at: [260, 166] },
  { key: 'animal-respiration', from: [420, 162], to: [330, 54], bend: 0.1, at: [430, 100] },
  { key: 'death', from: [130, 198], to: [200, 252], at: [130, 236] },
  { from: [390, 198], to: [320, 252] },
  { key: 'decomposition', from: [260, 252], to: [260, 54], at: [266, 222], anchor: 'start' },
  { from: [320, 284], to: [380, 302] },
  { key: 'combustion', from: [490, 300], to: [356, 46], bend: 0.18, at: [500, 150], anchor: 'end' },
]);

export const nitrogenCycle: Drawer = (o) => cycle(o, 600, 370, [
  { key: 'atmosphere', text: 'Nitrogen gas in the air', x: 300, y: 34, w: 180 }, { text: 'Plants (proteins)', x: 90, y: 190 }, { text: 'Animals (proteins)', x: 510, y: 190 },
  { text: 'Dead matter and wastes', x: 510, y: 318, w: 150 }, { key: 'ammonium', text: 'Ammonium compounds', x: 300, y: 318, w: 130 }, { key: 'nitrates', text: 'Nitrates in the soil', x: 90, y: 318, w: 130 },
], [
  { key: 'lightning', from: [210, 44], to: [30, 300], bend: 0.15, at: [8, 130], anchor: 'start' },
  { key: 'nitrogen-fixing', from: [240, 52], to: [120, 172], at: [190, 104], anchor: 'start' },
  { key: 'absorption', from: [90, 300], to: [90, 208], at: [96, 256], anchor: 'start' },
  { key: 'feeding', from: [150, 190], to: [450, 190], at: [300, 176] },
  { from: [140, 208], to: [440, 300] },
  { key: 'death', from: [510, 208], to: [510, 300], at: [516, 256], anchor: 'start' },
  { key: 'decomposition', from: [434, 318], to: [366, 318], at: [400, 302] },
  { key: 'nitrification', from: [234, 318], to: [156, 318], at: [195, 348] },
  { key: 'denitrification', from: [130, 300], to: [360, 52], bend: -0.08, at: [330, 120], anchor: 'start' },
]);

const LEVELS = ['producer', 'primary-consumer', 'secondary-consumer', 'tertiary-consumer'];

export const ecologicalPyramid: Drawer = ({ items, variant }) => {
  const names = items.length ? items.slice(0, 5) : ['Grass', 'Grasshoppers', 'Frogs', 'Snakes'];
  const widths = names.map((_, i) => 420 * (1 - i / names.length) ** (variant === 'energy' ? 1.6 : 1.15));
  const bh = 44, cx = 300, base = 40 + names.length * bh;
  let body = '';
  const anchors: Record<string, Anchor> = {};
  names.forEach((name, i) => {
    const w = Math.max(60, widths[i]), y = base - (i + 1) * bh;
    body += `<rect x="${n(cx - w / 2)}" y="${y}" width="${n(w)}" height="${bh}" fill="#fff" stroke="${INK}" stroke-width="1.4"/>`;
    body += words(cx, y + bh / 2 + 4, name, { size: 12, bold: true });
    if (LEVELS[i]) anchors[LEVELS[i]] = { x: cx + w / 2, y: y + bh / 2, side: 'r' };
    // An energy pyramid loses most of each level's energy as heat
    if (variant === 'energy' && i < names.length - 1) body += words(cx - w / 2 - 6, y + bh / 2 + 4, 'heat lost ←', { size: 9, anchor: 'end', italic: true });
  });
  return { w: 560, h: base + 10, body, anchors };
};

export const foodChain: Drawer = ({ id, items }) => {
  const names = items.length ? items.slice(0, 5) : ['Grass', 'Grasshopper', 'Frog', 'Snake'];
  const gap = 34, bw = Math.min(110, (480 - gap * (names.length - 1)) / names.length);
  const total = names.length * bw + (names.length - 1) * gap, x0 = (480 - total) / 2;
  let body = '';
  const anchors: Record<string, Anchor> = {};
  names.forEach((name, i) => {
    const cx = x0 + i * (bw + gap) + bw / 2;
    body += labelBox(cx, 60, name, bw, 34);
    if (LEVELS[i]) anchors[LEVELS[i]] = { x: cx, y: 77, side: 'b' };
    if (i < names.length - 1) body += arrow(id, cx + bw / 2 + 2, 60, cx + bw / 2 + gap - 2, 60, { width: 1.6 });
  });
  anchors['energy-flow'] = { x: x0 + bw + gap / 2, y: 54, side: 't' };
  return { w: 480, h: 120, body, anchors };
};
