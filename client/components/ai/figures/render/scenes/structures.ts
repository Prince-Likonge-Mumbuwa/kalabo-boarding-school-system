// @/components/ai/figures/render/scenes/structures.ts — more Biology structures
// examined at O Level: the villus, the three kinds of blood vessel, tissue
// fluid and lymph round a capillary, and an insect (the housefly).
import { INK, n } from '../svg';
import { fill, path, words, type Drawer, type Drawn } from './kit';
import { blob, circle, curve, ellipse, smooth, tube, type Pt } from './biokit';

const ar = (id: string, d: string, w = 1.3) => path(d, { width: w, arrow: `${id}-arr` });

// ── A villus (L.S.) ──
export const villus: Drawer = ({ id }): Drawn => {
  // A finger-shaped projection: base at the bottom, rounded tip at the top.
  const cx = 160, top = 110, half = 82, base = 392;
  const U = (r: number): Pt[] => {
    const pts: Pt[] = [[cx - r, base]];
    for (let y = base - 40; y > top; y -= 40) pts.push([cx - r, y]);
    for (let a = 180; a <= 360; a += 15) pts.push([cx + r * Math.cos((a * Math.PI) / 180), top + r * Math.sin((a * Math.PI) / 180)]);
    for (let y = top + 40; y < base; y += 40) pts.push([cx + r, y]);
    pts.push([cx + r, base]);
    return pts;
  };
  const outer = smooth(U(half)), inner = smooth(U(half - 16));
  let b = `<path d="${outer}" fill="${fill(id, 'sand')}" stroke="none"/><path d="${inner}" fill="#fff" stroke="none"/>`;
  // Epithelium one cell thick: walls between the column-shaped cells, from the inner to the outer edge.
  const step = 15;
  const walls = (r0: number, r1: number) => {
    let g = '';
    for (let y = base - 8; y > top; y -= step) g += path(`M${cx - r0},${y} L${cx - r1},${y} M${cx + r0},${y} L${cx + r1},${y}`, { width: 0.8 });
    for (let a = 180 + 8; a < 360; a += 11) { const c = Math.cos((a * Math.PI) / 180), s = Math.sin((a * Math.PI) / 180); g += path(`M${n(cx + r0 * c)},${n(top + r0 * s)} L${n(cx + r1 * c)},${n(top + r1 * s)}`, { width: 0.8 }); }
    return g;
  };
  b += walls(half - 16, half);
  // Microvilli: a fine fringe on the outer surface.
  for (let y = base - 4; y > top; y -= 4) b += path(`M${cx - half},${y} l-4,0 M${cx + half},${y} l4,0`, { width: 0.6 });
  for (let a = 182; a < 360; a += 2.6) { const c = Math.cos((a * Math.PI) / 180), s = Math.sin((a * Math.PI) / 180); b += path(`M${n(cx + half * c)},${n(top + half * s)} l${n(4 * c)},${n(4 * s)}`, { width: 0.6 }); }
  b += `<path d="${outer}" fill="none" stroke="${INK}" stroke-width="1.6"/><path d="${inner}" fill="none" stroke="${INK}" stroke-width="1"/>`;
  // A goblet cell (makes mucus) among the epithelial cells.
  b += ellipse(cx - half + 8, 300, 7, 12, { fill: '#fff', width: 1.1 }) + circle(cx - half + 8, 300, 2, { fill: INK, width: 0 });
  // Blood capillary network: arteriole in at the bottom left, round the tip, out to the venule.
  const cap: Pt[] = [[cx - 46, base + 20], [cx - 48, 300], [cx - 50, 200], [cx - 40, 120], [cx, 84], [cx + 40, 120], [cx + 50, 200], [cx + 48, 300], [cx + 46, base + 20]];
  b += tube(cap, 6, { wall: 1.2 });
  for (const y of [170, 222, 274, 326]) b += tube([[cx - 49, y], [cx, y + 10], [cx + 49, y]], 4, { wall: 1 });            // cross-links, passing behind the lacteal
  // Lacteal: a blind-ended lymph vessel up the middle.
  b += tube([[cx, base + 20], [cx, 150]], 18, { wall: 1.3 }) + `<path d="M${cx - 10},150 A10,10 0 0 1 ${cx + 10},150" fill="#fff" stroke="${INK}" stroke-width="1.3"/>`;
  b += ar(id, `M${cx - 46},${base + 18} L${cx - 46},${base - 6}`) + ar(id, `M${cx + 46},${base - 6} L${cx + 46},${base + 18}`) + ar(id, `M${cx},${base - 20} L${cx},${base + 8}`);
  return { w: 320, h: 416, body: b, edge: true, anchors: {
    microvilli: { x: cx - half - 3, y: 180, side: 'l' }, epithelium: { x: cx - half + 8, y: 226, side: 'l' }, 'goblet-cell': { x: cx - half + 8, y: 300, side: 'l' },
    arteriole: { x: cx - 46, y: base + 10, side: 'l' }, capillary: { x: cx + 40, y: 120, side: 'r' }, lacteal: { x: cx, y: 250, side: 'r' }, venule: { x: cx + 46, y: base + 10, side: 'r' },
  } };
};

// ── Blood vessels in T.S. (and a vein in L.S. with its valves) ──
export const bloodVessels: Drawer = ({ id, variant }): Drawn => {
  if (variant === 'vein-valves') {
    // A vein cut open lengthwise: blood flows to the heart (right) through open valves; backflow closes them.
    let b = path('M20,60 L500,60 M20,160 L500,160', { width: 2 }) + path('M20,68 L500,68 M20,152 L500,152', { width: 0.8 });
    const valve = (x: number, closed: boolean) => closed
      ? path(`M${x},68 Q${x + 26},86 ${x + 34},110 M${x},152 Q${x + 26},134 ${x + 34},110`, { width: 2.6 })
      : path(`M${x},68 Q${x + 34},78 ${x + 52},88 M${x},152 Q${x + 34},142 ${x + 52},132`, { width: 2.6 });
    b += valve(110, false) + valve(350, true);
    b += ar(id, 'M30,110 L96,110', 1.6) + ar(id, 'M180,110 L260,110', 1.6) + ar(id, 'M470,110 L400,110', 1.6);
    b += words(140, 196, 'Valve open: blood flows towards the heart', { size: 11 }) + words(380, 196, 'Valve closed: stops backflow', { size: 11 });
    b += words(500, 46, 'to the heart →', { size: 10.5, italic: true, anchor: 'end' });
    return { w: 520, h: 206, body: b, edge: true, anchors: { valve: { x: 150, y: 80, side: 'l' }, wall: { x: 300, y: 60, side: 'r' }, lumen: { x: 300, y: 128, side: 'r' } } };
  }
  const ring = (cx: number, cy: number, r0: number, r1: number, f: string) =>
    `<path d="M${cx - r1},${cy} a${r1},${r1} 0 1,0 ${2 * r1},0 a${r1},${r1} 0 1,0 ${-2 * r1},0 M${cx - r0},${cy} a${r0},${r0} 0 1,1 ${2 * r0},0 a${r0},${r0} 0 1,1 ${-2 * r0},0 Z" fill="${f}" fill-rule="evenodd" stroke="${INK}" stroke-width="1.2"/>`;
  // Artery: thick wall of muscle and elastic fibres, narrow lumen.
  let b = ring(100, 100, 62, 72, '#fff') + ring(100, 100, 30, 62, fill(id, 'hatch')) + ring(100, 100, 25, 30, '#fff');
  // Vein: thin wall, wide lumen, often flattened.
  const vein = (s: number): Pt[] => [[300 - 82 * s, 100], [270, 100 - 56 * s], [330, 100 - 60 * s], [300 + 84 * s, 102], [330, 100 + 54 * s], [270, 100 + 58 * s]];
  b += blob(vein(1), '#fff', 1.2) + blob(vein(0.95), fill(id, 'hatch'), 1.1) + blob(vein(0.86), '#fff', 1);
  // Capillary: wall one cell thick (flattened cells with their nuclei), a red blood cell inside.
  b += circle(480, 100, 26, { width: 1.3 }) + circle(480, 100, 20, { width: 1 });
  for (const a of [30, 150, 270]) { const r = (a * Math.PI) / 180; b += ellipse(480 + 23 * Math.cos(r), 100 + 23 * Math.sin(r), 6, 2.5, { fill: INK, width: 0, rot: a + 90 }); }
  for (const a of [90, 210, 330]) { const r = (a * Math.PI) / 180; b += path(`M${n(480 + 20 * Math.cos(r))},${n(100 + 20 * Math.sin(r))} L${n(480 + 26 * Math.cos(r))},${n(100 + 26 * Math.sin(r))}`, { width: 1 }); }
  b += circle(480, 100, 12, { fill: fill(id, 'sand'), width: 1.1 }) + circle(480, 100, 5, { fill: '#fff', width: 0.8, dash: '2 1.5' });
  b += words(100, 196, 'Artery', { size: 12, bold: true }) + words(300, 196, 'Vein', { size: 12, bold: true }) + words(480, 196, 'Capillary', { size: 12, bold: true }) + words(480, 210, '(much enlarged)', { size: 10, italic: true });
  return { w: 540, h: 216, body: b, edge: true, anchors: {
    'outer-coat': { x: 100, y: 32, side: 'l' }, 'thick-wall': { x: 52, y: 122, side: 'l' }, 'narrow-lumen': { x: 100, y: 100, side: 'l' }, endothelium: { x: 74, y: 100, side: 'l' },
    'thin-wall': { x: 330, y: 42, side: 't' }, 'wide-lumen': { x: 300, y: 100, side: 't' }, 'one-cell-wall': { x: 500, y: 84, side: 'r' }, 'red-blood-cell': { x: 486, y: 106, side: 'r' },
  } };
};

// ── Tissue fluid and lymph round a capillary ──
export const tissueFluid: Drawer = ({ id }): Drawn => {
  let b = `<rect x="30" y="20" width="480" height="270" fill="${fill(id, 'sand')}" stroke="none"/>`;
  // Body cells bathed in tissue fluid.
  for (const [x, y] of [[80, 52], [170, 46], [260, 54], [350, 46], [440, 52], [90, 196], [180, 204], [270, 196], [360, 204], [450, 196]] as const) b += ellipse(x, y, 36, 22, { width: 1.2 }) + circle(x + 6, y - 2, 6, { fill: fill(id, 'dots'), width: 1 });
  // Capillary from the arteriole (high pressure) to the venule; red cells stay in.
  b += tube([[10, 126], [270, 126], [530, 126]], 30, { wall: 1.6 });
  for (const x of [110, 190, 270, 350, 430]) b += ellipse(x, 126, 9, 7, { fill: fill(id, 'dots'), width: 1 });
  // Fluid (plasma without its proteins) forced out at the arterial end, most of it back in at the venous end.
  for (const x of [80, 130, 180]) b += ar(id, `M${x},110 L${x},84`) + ar(id, `M${x + 20},142 L${x + 20},168`);
  for (const x of [360, 410, 460]) b += ar(id, `M${x},84 L${x},108`) + ar(id, `M${x + 20},170 L${x + 20},146`);
  // A lymph vessel with a blind end collects the rest of the fluid (now lymph).
  b += tube([[200, 262], [520, 262]], 18, { wall: 1.4 }) + `<path d="M200,253 A9,9 0 0 0 200,271" fill="#fff" stroke="${INK}" stroke-width="1.4"/>`;
  for (const x of [250, 330, 410]) b += ar(id, `M${x},228 L${x},250`);
  b += ar(id, 'M450,262 L500,262');
  b += words(16, 130, 'from arteriole', { size: 10, italic: true, anchor: 'start' }) + words(524, 130, 'to venule', { size: 10, italic: true, anchor: 'end' });
  return { w: 540, h: 296, body: b, edge: true, anchors: {
    'body-cell': { x: 80, y: 60, side: 'l' }, 'tissue-fluid': { x: 40, y: 168, side: 'l' }, capillary: { x: 40, y: 140, side: 'l' }, 'red-blood-cell': { x: 110, y: 126, side: 'l' },
    'fluid-out': { x: 130, y: 96, side: 'r' }, 'fluid-in': { x: 410, y: 96, side: 'r' }, 'lymph-vessel': { x: 480, y: 262, side: 'r' }, lymph: { x: 360, y: 262, side: 'r' },
  } };
};

// ── An insect: the housefly (dorsal view) ──
export const insect: Drawer = ({ id }): Drawn => {
  const cx = 180;
  let b = '';
  // Three pairs of jointed legs, all on the thorax (drawn first, under the body).
  const legs: Pt[][] = [[[150, 116], [112, 94], [98, 60], [90, 36]], [[148, 134], [98, 142], [72, 178], [56, 194]], [[152, 156], [114, 198], [104, 262], [94, 304]]];
  for (const L of legs) for (const s of [1, -1]) {
    const pts = L.map(([x, y]) => [cx + s * (x - cx), y] as Pt);
    b += path(`M${pts.map(([x, y]) => `${n(x)},${n(y)}`).join(' L')}`, { width: 2.2 });
    const [ex, ey] = pts[pts.length - 1];
    b += path(`M${n(ex)},${n(ey)} l${-4 * s},-3 M${n(ex)},${n(ey)} l${3 * s},-4`, { width: 1.1 });
  }
  // Abdomen: segmented, with a spiracle (breathing hole) on each side of each segment.
  b += ellipse(cx, 232, 42, 66, { fill: '#fff', width: 1.6 });
  for (const y of [196, 220, 244, 268]) { const w = 42 * Math.sqrt(1 - ((y - 232) / 66) ** 2); b += curve([[cx - w, y], [cx, y + 8], [cx + w, y]], 1); }
  for (const y of [208, 232, 256]) { const w = 42 * Math.sqrt(1 - ((y - 232) / 66) ** 2) - 6; b += circle(cx - w, y, 2.2, { fill: '#fff', width: 1 }) + circle(cx + w, y, 2.2, { fill: '#fff', width: 1 }); }
  // Thorax with the housefly's dark stripes.
  b += ellipse(cx, 130, 36, 42, { fill: '#fff', width: 1.6 });
  for (const dx of [-14, -5, 5, 14]) b += path(`M${cx + dx},${100} L${cx + dx * 0.9},${158}`, { width: 2.4 });
  // Head: two large compound eyes, short antennae, the sucking (sponging) proboscis in front.
  b += ellipse(cx, 66, 30, 22, { fill: '#fff', width: 1.6 });
  b += ellipse(cx - 18, 62, 14, 18, { fill: fill(id, 'cross'), width: 1.4 }) + ellipse(cx + 18, 62, 14, 18, { fill: fill(id, 'cross'), width: 1.4 });
  b += path(`M${cx - 4},46 L${cx - 8},34 M${cx + 4},46 L${cx + 8},34`, { width: 1.6 });
  b += path(`M${cx},44 L${cx},26`, { width: 3 }) + ellipse(cx, 22, 9, 5, { fill: '#fff', width: 1.3 });
  // One pair of transparent wings with veins; the hind wings are reduced to halteres (balancers).
  for (const s of [1, -1]) {
    const wing: Pt[] = [[cx - 26, 112], [cx - 84, 150], [cx - 132, 232], [cx - 110, 262], [cx - 64, 222], [cx - 28, 142]].map(([x, y]) => [cx + s * (x - cx), y] as Pt);
    b += blob(wing, 'none', 1.3);
    for (const v of [[[cx - 30, 120], [cx - 80, 170], [cx - 120, 236]], [[cx - 30, 128], [cx - 72, 190], [cx - 100, 246]], [[cx - 30, 136], [cx - 58, 196], [cx - 76, 236]]] as Pt[][])
      b += curve(v.map(([x, y]) => [cx + s * (x - cx), y] as Pt), 0.8);
    b += path(`M${n(cx + s * -30)},160 L${n(cx + s * -40)},170`, { width: 1.4 }) + circle(cx + s * -42, 173, 3.5, { fill: INK, width: 0 });
  }
  return { w: 360, h: 316, body: b, edge: true, anchors: {
    proboscis: { x: cx - 6, y: 22, side: 'l' }, 'compound-eye': { x: cx - 24, y: 60, side: 'l' }, head: { x: cx - 4, y: 78, side: 'l' }, leg: { x: 74, y: 176, side: 'l' }, haltere: { x: cx - 42, y: 173, side: 'l' }, spiracle: { x: cx - 36, y: 232, side: 'l' },
    antenna: { x: cx + 7, y: 36, side: 'r' }, thorax: { x: cx + 26, y: 124, side: 'r' }, wing: { x: cx + 100, y: 220, side: 'r' }, abdomen: { x: cx + 20, y: 262, side: 'r' },
  } };
};
