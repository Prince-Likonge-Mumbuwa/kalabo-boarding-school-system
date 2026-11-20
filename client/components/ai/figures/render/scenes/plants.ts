// @/components/ai/figures/render/scenes/plants.ts — plant structure as ECZ
// Biology draws it: the half flower (insect and wind pollinated), the leaf
// in section, root and stem sections (dicot and monocot), seeds,
// germination and the root tip. Simple ink lines, stippled tissues.
import { INK, n } from '../svg';
import { fill, words, type Anchor, type Drawer, type Drawn } from './kit';
import { blob, chloroplast, circle, curve, ellipse, oval, roundRect, type Pt } from './biokit';

const mirror = (pts: Pt[], cx: number): Pt[] => pts.map(([x, y]) => [2 * cx - x, y] as Pt);
const poly = (pts: Pt[]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)},${n(y)}`).join(' ');

// ── Flower ──
export const flower: Drawer = ({ id, variant }): Drawn => {
  if (variant === 'wind') {
    const cx = 180;
    let b = `<path d="M${cx - 4},335 L${cx - 4},215 M${cx + 4},335 L${cx + 4},215" stroke="${INK}" stroke-width="1.4"/>`;
    for (const s of [-1, 1]) b += blob([[cx, 230], [cx + s * 28, 205], [cx + s * 40, 160], [cx + s * 30, 112], [cx + s * 12, 150], [cx + s * 6, 205]], '#fff', 1.3);
    b += ellipse(cx, 205, 12, 16, { fill: fill(id, 'sand') });
    // Feathery stigmas
    for (const s of [-1, 1]) {
      const p0: Pt = [cx + s * 4, 190], p1: Pt = [cx + s * 75, 70];
      b += `<line x1="${p0[0]}" y1="${p0[1]}" x2="${p1[0]}" y2="${p1[1]}" stroke="${INK}" stroke-width="1.4"/>`;
      for (let t = 0.25; t < 1; t += 0.07) {
        const x = p0[0] + (p1[0] - p0[0]) * t, y = p0[1] + (p1[1] - p0[1]) * t;
        b += `<path d="M${n(x)},${n(y)} l${n(-10)},${n(-6)} M${n(x)},${n(y)} l${n(10)},${n(-6)}" stroke="${INK}" stroke-width="0.8"/>`;
      }
    }
    // Long filaments with anthers hanging outside the flower
    for (const [ex, ey] of [[70, 250], [290, 245], [240, 305]] as const) {
      b += curve([[cx, 212], [(cx + ex) / 2, Math.min(ey, 212) - 20], [ex, ey - 22]], 1.1);
      b += ellipse(ex, ey, 7, 20, { fill: fill(id, 'sand'), width: 1.2 });
    }
    return { w: 360, h: 345, body: b, edge: true, anchors: {
      stigma: { x: cx + 52, y: 108, side: 'r' }, anther: { x: 70, y: 250, side: 'l' }, filament: { x: 115, y: 205, side: 'l' },
      bract: { x: cx - 36, y: 160, side: 'l' }, ovary: { x: cx, y: 205, side: 'r' }, pedicel: { x: cx + 4, y: 300, side: 'r' },
    } };
  }
  const cx = 220;
  let b = `<path d="M${cx - 7},335 L${cx - 7},255 M${cx + 7},335 L${cx + 7},255" stroke="${INK}" stroke-width="1.4"/>`;
  // Petals (side view of the cut half), then sepals below them
  const petal: Pt[] = [[cx - 30, 242], [cx - 95, 220], [cx - 170, 150], [cx - 185, 90], [cx - 150, 100], [cx - 95, 160], [cx - 42, 212]];
  b += blob(petal, '#fff', 1.4) + blob(mirror(petal, cx), '#fff', 1.4);
  const sepal: Pt[] = [[cx - 26, 252], [cx - 70, 258], [cx - 120, 250], [cx - 80, 240], [cx - 34, 240]];
  b += blob(sepal, fill(id, 'dots'), 1.2) + blob(mirror(sepal, cx), fill(id, 'dots'), 1.2);
  // Receptacle
  b += blob([[cx - 40, 240], [cx, 228], [cx + 40, 240], [cx + 24, 260], [cx, 262], [cx - 24, 260]], fill(id, 'sand'), 1.3);
  // Nectaries
  b += ellipse(cx - 32, 236, 6, 4, { fill: INK }) + ellipse(cx + 32, 236, 6, 4, { fill: INK });
  // Stamens
  for (const s of [-1, 1]) for (const [bx, tx, ty] of [[22, 60, 120], [12, 34, 100]] as const) {
    b += curve([[cx + s * bx, 236], [cx + s * (bx + 18), 180], [cx + s * tx, ty + 14]], 1.3);
    b += ellipse(cx + s * tx, ty, 7, 14, { fill: fill(id, 'sand'), width: 1.3, rot: s * 12 });
  }
  // Carpel: ovary with ovules, style, stigma
  b += ellipse(cx, 205, 26, 30, { width: 1.5 });
  for (const dy of [-14, 0, 14]) { b += ellipse(cx - 9, 205 + dy, 6, 4.5, { fill: fill(id, 'sand'), width: 1 }) + ellipse(cx + 9, 205 + dy, 6, 4.5, { fill: fill(id, 'sand'), width: 1 }); }
  b += `<line x1="${cx}" y1="186" x2="${cx}" y2="224" stroke="${INK}" stroke-width="1"/>`;
  b += `<path d="M${cx - 4},176 L${cx - 4},80 M${cx + 4},176 L${cx + 4},80" stroke="${INK}" stroke-width="1.3"/>`;
  b += ellipse(cx, 74, 14, 8, { fill: fill(id, 'dots'), width: 1.4 });
  return { w: 440, h: 345, body: b, edge: true, anchors: {
    stigma: { x: cx + 12, y: 72, side: 'r' }, style: { x: cx + 4, y: 140, side: 'r' }, ovary: { x: cx + 26, y: 205, side: 'r' }, ovule: { x: cx + 9, y: 219, side: 'r' },
    receptacle: { x: cx + 28, y: 252, side: 'r' }, pedicel: { x: cx + 7, y: 305, side: 'r' },
    petal: { x: cx - 160, y: 130, side: 'l' }, anther: { x: cx - 60, y: 120, side: 'l' }, filament: { x: cx - 52, y: 170, side: 'l' },
    sepal: { x: cx - 100, y: 251, side: 'l' }, nectary: { x: cx - 32, y: 236, side: 'l' },
  } };
};

// ── Leaf in transverse section ──
export const leafSection: Drawer = ({ id }): Drawn => {
  const W = 520;
  let b = '';
  const x0 = 20, x1 = 500;
  // Cuticles
  b += `<line x1="${x0}" y1="20" x2="${x1}" y2="20" stroke="${INK}" stroke-width="3"/><line x1="${x0}" y1="246" x2="${x1}" y2="246" stroke="${INK}" stroke-width="3"/>`;
  // Upper epidermis
  for (let x = x0; x < x1; x += 40) b += roundRect(x, 22, 40, 22, 3, { width: 1 });
  // Palisade layer
  for (let x = x0 + 2; x < x1 - 20; x += 24) {
    b += roundRect(x, 46, 22, 74, 9, { width: 1 });
    for (let y = 55; y < 116; y += 15) { b += chloroplast(x + 5, y, 3.5, 2.2, 90) + chloroplast(x + 17, y + 6, 3.5, 2.2, 90); }
  }
  // Spongy mesophyll: loose round cells with air spaces
  const sp: [number, number, number, number][] = [];
  for (let row = 0; row < 3; row++) for (let x = x0 + 18 + (row % 2) * 22; x < x1 - 16; x += 46) {
    if (Math.abs(x - 260) < 52 && row < 3) continue;
    if (Math.abs(x - 350) < 24 && row === 2) continue;
    sp.push([x, 145 + row * 30, 17 + ((x + row) % 3), 12]);
  }
  for (const [x, y, rx, ry] of sp) { b += ellipse(x, y, rx, ry, { width: 1 }) + chloroplast(x - 6, y - 3, 3, 2, 30) + chloroplast(x + 6, y + 3, 3, 2, -20); }
  // Vascular bundle (vein): xylem above, phloem below, in a sheath
  b += ellipse(260, 172, 46, 40, { width: 1.2 });
  for (const [x, y, r] of [[245, 155, 7], [260, 152, 8], [275, 156, 6.5], [252, 168, 6], [268, 168, 6]] as const) b += circle(x, y, r, { width: 2 });
  b += `<path d="M228,182 Q260,176 292,182 L286,200 Q260,206 234,200 Z" fill="${fill(id, 'sand')}" stroke="${INK}" stroke-width="1"/>`;
  // Lower epidermis with a stoma between two guard cells
  for (let x = x0; x < x1; x += 40) if (Math.abs(x + 20 - 350) > 30) b += roundRect(x, 224, 40, 21, 3, { width: 1 });
  b += roundRect(320, 224, 18, 21, 3, { width: 1 }) + roundRect(362, 224, 18, 21, 3, { width: 1 });
  b += ellipse(342, 236, 6, 9, { fill: fill(id, 'sand'), width: 1.3 }) + ellipse(358, 236, 6, 9, { fill: fill(id, 'sand'), width: 1.3 });
  return { w: W, h: 262, body: b, edge: true, anchors: {
    cuticle: { x: 40, y: 20, side: 'l' }, 'upper-epidermis': { x: 40, y: 34, side: 'l' }, palisade: { x: 37, y: 85, side: 'l' },
    'spongy-mesophyll': { x: 40, y: 145, side: 'l' }, 'air-space': { x: 63, y: 160, side: 'l' }, 'lower-epidermis': { x: 40, y: 235, side: 'l' },
    xylem: { x: 260, y: 152, side: 'r' }, phloem: { x: 270, y: 194, side: 'r' }, 'vascular-bundle': { x: 304, y: 172, side: 'r' },
    stoma: { x: 350, y: 244, side: 'r' }, 'guard-cell': { x: 359, y: 236, side: 'r' }, chloroplast: { x: 451, y: 71, side: 'r' },
  } };
};

// ── Root and stem sections ──
function ringCells(cx: number, cy: number, r1: number, r2: number, count: number) {
  let g = `<circle cx="${cx}" cy="${cy}" r="${r1}" fill="none" stroke="${INK}" stroke-width="1.2"/><circle cx="${cx}" cy="${cy}" r="${r2}" fill="none" stroke="${INK}" stroke-width="1"/>`;
  for (let i = 0; i < count; i++) { const a = (i / count) * Math.PI * 2; g += `<line x1="${n(cx + r1 * Math.cos(a))}" y1="${n(cy + r1 * Math.sin(a))}" x2="${n(cx + r2 * Math.cos(a))}" y2="${n(cy + r2 * Math.sin(a))}" stroke="${INK}" stroke-width="0.8"/>`; }
  return g;
}
function cortexCells(cx: number, cy: number, rIn: number, rOut: number, size = 9) {
  let g = '';
  for (let r = rIn + size; r < rOut - size / 2; r += size * 2) {
    const k = Math.floor((2 * Math.PI * r) / (size * 2.2));
    for (let i = 0; i < k; i++) { const a = (i / k) * Math.PI * 2 + r; g += `<circle cx="${n(cx + r * Math.cos(a))}" cy="${n(cy + r * Math.sin(a))}" r="${size * 0.85}" fill="none" stroke="${INK}" stroke-width="0.5"/>`; }
  }
  return g;
}

export const rootSection: Drawer = ({ id, variant }): Drawn => {
  const cx = 175, cy = 175, R = 150;
  let b = circle(cx, cy, R, { width: 1.4 }) + ringCells(cx, cy, R, R - 10, 90);
  for (const deg of [-60, 10, 130, 200]) {
    const a = (deg * Math.PI) / 180;
    b += curve([[cx + R * Math.cos(a), cy + R * Math.sin(a)], [cx + (R + 12) * Math.cos(a + 0.05), cy + (R + 12) * Math.sin(a + 0.05)], [cx + (R + 24) * Math.cos(a - 0.02), cy + (R + 24) * Math.sin(a - 0.02)]], 2.4);
  }
  b += cortexCells(cx, cy, 58, R - 10);
  b += `<circle cx="${cx}" cy="${cy}" r="58" fill="#fff" stroke="${INK}" stroke-width="2.4"/>` + `<circle cx="${cx}" cy="${cy}" r="52" fill="none" stroke="${INK}" stroke-width="0.8"/>`;
  const anchors: Record<string, Anchor> = {
    epidermis: { x: cx - R + 5, y: cy, side: 'l' }, 'root-hair': { x: cx + (R + 14) * Math.cos(-1.05), y: cy + (R + 14) * Math.sin(-1.05), side: 'r' },
    cortex: { x: cx - 100, y: cy + 40, side: 'l' }, endodermis: { x: cx - 58, y: cy - 6, side: 'l' }, pericycle: { x: cx - 52, y: cy + 14, side: 'l' },
  };
  if (variant === 'monocot') {
    b += circle(cx, cy, 24, { fill: '#fff', width: 1 }) + cortexCells(cx, cy, 0, 24, 6);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, a2 = a + Math.PI / 10;
      b += circle(cx + 36 * Math.cos(a), cy + 36 * Math.sin(a), 6.5, { width: 2 });
      b += ellipse(cx + 43 * Math.cos(a2), cy + 43 * Math.sin(a2), 5, 4, { fill: fill(id, 'sand'), width: 0.9 });
    }
    Object.assign(anchors, { xylem: { x: cx + 36, y: cy, side: 'r' }, phloem: { x: cx + 43 * Math.cos(Math.PI / 10), y: cy + 43 * Math.sin(Math.PI / 10), side: 'r' }, pith: { x: cx, y: cy, side: 'r' } });
  } else {
    const star: Pt[] = [];
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 - Math.PI / 4, r = i % 2 ? 14 : 44; star.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    b += `<path d="${poly(star)} Z" fill="${fill(id, 'hatch')}" stroke="${INK}" stroke-width="1.4"/>`;
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; b += ellipse(cx + 34 * Math.cos(a), cy + 34 * Math.sin(a), 9, 7, { fill: fill(id, 'sand'), width: 1, rot: (a * 180) / Math.PI }); }
    Object.assign(anchors, { xylem: { x: cx + 28, y: cy - 28, side: 'r' }, phloem: { x: cx + 34, y: cy, side: 'r' } });
  }
  return { w: 350, h: 350, body: b, anchors, edge: true };
};

export const stemSection: Drawer = ({ id, variant }): Drawn => {
  const cx = 175, cy = 175, R = 150;
  let b = circle(cx, cy, R, { width: 1.4 }) + ringCells(cx, cy, R, R - 9, 100);
  const anchors: Record<string, Anchor> = { epidermis: { x: cx - R + 4, y: cy, side: 'l' } };
  const bundle = (x: number, y: number, ang: number, s = 1) => {
    // phloem toward the outside, xylem toward the centre, cambium between
    const g = `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(ang)}) scale(${s})">`
      + `<path d="M-16,-8 Q0,-22 16,-8 Z" fill="${fill(id, 'sand')}" stroke="${INK}" stroke-width="1"/>`
      + `<line x1="-17" y1="-6" x2="17" y2="-6" stroke="${INK}" stroke-width="1" stroke-dasharray="2 2"/>`
      + `<path d="M-16,-4 L16,-4 L0,22 Z" fill="#fff" stroke="${INK}" stroke-width="1"/>`
      + `<circle cx="-6" cy="2" r="3.6" fill="#fff" stroke="${INK}" stroke-width="1.6"/><circle cx="6" cy="2" r="3.6" fill="#fff" stroke="${INK}" stroke-width="1.6"/><circle cx="0" cy="11" r="3" fill="#fff" stroke="${INK}" stroke-width="1.6"/></g>`;
    return g;
  };
  if (variant === 'monocot') {
    const pts: Pt[] = [[175, 175], [130, 130], [220, 120], [120, 215], [225, 225], [175, 90], [175, 260], [90, 170], [260, 175], [80, 110], [270, 110], [85, 240], [265, 245], [135, 60], [215, 60], [130, 290], [220, 290], [50, 175], [300, 170]];
    for (const [x, y] of pts) b += bundle(x, y, Math.atan2(y - cy, x - cx) * 57.3 + 90, 0.8);
    b += cortexCells(cx, cy, 0, R - 9, 7).replace(/stroke-width="0.5"/g, 'stroke-width="0.3"');
    Object.assign(anchors, { 'vascular-bundle': { x: 260, y: 175, side: 'r' }, xylem: { x: 225, y: 228, side: 'r' }, phloem: { x: 274, y: 112, side: 'r' }, 'ground-tissue': { x: 150, y: 160, side: 'l' } });
  } else {
    b += cortexCells(cx, cy, 112, R - 9, 8);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b += bundle(cx + 95 * Math.cos(a), cy + 95 * Math.sin(a), (a * 180) / Math.PI + 90, 1.15); }
    b += `<circle cx="${cx}" cy="${cy}" r="95" fill="none" stroke="${INK}" stroke-width="0.8" stroke-dasharray="2 3"/>`;
    b += cortexCells(cx, cy, 0, 64, 9);
    Object.assign(anchors, {
      cortex: { x: cx - 128, y: cy + 30, side: 'l' }, 'vascular-bundle': { x: cx + 95 * Math.cos(Math.PI / 4) + 10, y: cy + 95 * Math.sin(Math.PI / 4) + 10, side: 'r' },
      phloem: { x: cx + 111, y: cy, side: 'r' }, cambium: { x: cx + 102, y: cy - 2, side: 'r' }, xylem: { x: cx + 85, y: cy - 7, side: 'r' }, pith: { x: cx - 20, y: cy - 20, side: 'l' },
    });
  }
  return { w: 350, h: 350, body: b, anchors, edge: true };
};

// ── Seeds ──
export const seed: Drawer = ({ id, variant }): Drawn => {
  if (variant === 'maize') {
    let b = blob([[150, 30], [215, 45], [245, 130], [235, 230], [190, 300], [150, 312], [110, 300], [65, 230], [55, 130], [85, 45]], '#fff', 2.4);
    b += blob([[150, 38], [210, 52], [236, 130], [226, 220], [175, 160], [125, 145], [80, 140], [65, 128], [90, 52]], fill(id, 'sand'), 1);
    b += blob([[80, 148], [125, 152], [172, 168], [222, 226], [186, 292], [150, 302], [112, 292], [72, 230]], '#fff', 1.2);
    b += blob([[140, 175], [160, 180], [166, 215], [162, 260], [150, 285], [138, 260], [134, 215]], '#fff', 1);
    b += curve([[146, 180], [150, 195], [154, 180]], 1.2) + curve([[144, 186], [150, 210], [156, 186]], 1);
    b += ellipse(150, 268, 7, 15, { fill: fill(id, 'dots'), width: 1 });
    return { w: 300, h: 330, body: b, edge: true, anchors: {
      'fruit-wall': { x: 57, y: 160, side: 'l' }, endosperm: { x: 150, y: 90, side: 'r' }, cotyledon: { x: 100, y: 200, side: 'l' },
      plumule: { x: 150, y: 195, side: 'r' }, radicle: { x: 150, y: 270, side: 'r' },
    } };
  }
  // Bean seed with one half of the testa removed: the cotyledon fills the seed, the embryo lies by the hilum
  const outline: Pt[] = [[70, 130], [95, 70], [180, 45], [265, 70], [295, 130], [272, 190], [210, 214], [180, 196], [150, 214], [92, 190]];
  let b = blob(outline, '#fff', 2.4);
  b += blob(outline.map(([x, y]) => [180 + (x - 180) * 0.9, 130 + (y - 130) * 0.88] as Pt), fill(id, 'dots'), 1);
  b += blob([[150, 178], [166, 172], [176, 182], [168, 194], [152, 206], [140, 210], [138, 200]], '#fff', 1.3);
  b += curve([[176, 176], [190, 162], [204, 168], [192, 176], [176, 176]], 1.1) + curve([[176, 176], [196, 182], [210, 176], [194, 172]], 1.1);
  b += ellipse(180, 199, 11, 3.4, { fill: INK, width: 0 }) + circle(160, 214, 2.2, { fill: INK, width: 0 });
  return { w: 340, h: 240, body: b, edge: true, anchors: {
    testa: { x: 180, y: 45, side: 'l' }, cotyledon: { x: 245, y: 120, side: 'r' }, plumule: { x: 200, y: 170, side: 'r' },
    radicle: { x: 146, y: 203, side: 'l' }, hilum: { x: 186, y: 200, side: 'r' }, micropyle: { x: 160, y: 214, side: 'l' },
  } };
};

// ── Germination ──
export const germination: Drawer = ({ id, variant }): Drawn => {
  const soil = 150;
  let b = `<rect x="0" y="${soil}" width="600" height="110" fill="${fill(id, 'sand')}" stroke="none"/><line x1="0" y1="${soil}" x2="600" y2="${soil}" stroke="${INK}" stroke-width="1.6"/>`;
  const roots = (x: number, y: number, len: number) => {
    let g = curve([[x, y], [x + 3, y + len * 0.5], [x - 2, y + len]], 1.6);
    for (let t = 0.3; t < 0.95; t += 0.18) g += curve([[x, y + len * t], [x - 14, y + len * t + 10], [x - 20, y + len * t + 18]], 0.9) + curve([[x + 1, y + len * t + 5], [x + 14, y + len * t + 14], [x + 20, y + len * t + 24]], 0.9);
    return g;
  };
  const leaf = (x: number, y: number, s: number, rot: number) => `<g transform="rotate(${rot} ${x} ${y})">${blob([[x, y], [x + 14 * s, y - 8 * s], [x + 28 * s, y], [x + 14 * s, y + 6 * s]], '#fff', 1.1)}</g>`;
  const anchors: Record<string, Anchor> = { 'soil-level': { x: 590, y: soil, side: 'r' } };
  if (variant === 'hypogeal') {
    // Stage 1: seed with radicle; 2: plumule rising; 3: shoot with leaves, cotyledons stay underground
    b += ellipse(80, 190, 22, 15, { width: 1.4 }) + roots(80, 204, 40);
    b += ellipse(270, 195, 22, 15, { width: 1.4 }) + roots(272, 209, 45) + curve([[262, 182], [255, 165], [258, 140], [266, 128]], 1.8);
    b += ellipse(470, 200, 22, 15, { width: 1.4 }) + roots(470, 214, 45);
    b += curve([[462, 186], [458, 140], [462, 80], [468, 40]], 2) + leaf(462, 95, 1.2, -150) + leaf(463, 75, 1.2, -30) + leaf(467, 48, 1, -160) + leaf(467, 45, 1, -20);
    b += words(80, 250, '1', { size: 13, bold: true }) + words(270, 250, '2', { size: 13, bold: true }) + words(470, 250, '3', { size: 13, bold: true });
    Object.assign(anchors, { cotyledon: { x: 490, y: 200, side: 'r' }, epicotyl: { x: 460, y: 125, side: 'r' }, 'foliage-leaves': { x: 494, y: 80, side: 'r' }, radicle: { x: 80, y: 225, side: 'l' }, plumule: { x: 258, y: 142, side: 'l' }, 'root-hairs': { x: 452, y: 245, side: 'l' }, testa: { x: 58, y: 190, side: 'l' } });
  } else {
    b += ellipse(80, 190, 22, 15, { width: 1.4 }) + roots(80, 204, 40);
    // Stage 2: hypocotyl hook pushing up, cotyledons still in the soil
    b += roots(270, 205, 45) + curve([[270, 205], [272, 160], [278, 128], [262, 112], [250, 128], [252, 146]], 2) + ellipse(255, 155, 14, 9, { width: 1.3, rot: 70 });
    // Stage 3: cotyledons above ground, foliage leaves between them
    b += roots(470, 165, 70) + curve([[470, 165], [472, 120], [470, 80]], 2);
    b += ellipse(445, 82, 22, 10, { width: 1.4, rot: -15, fill: fill(id, 'dots') }) + ellipse(495, 82, 22, 10, { width: 1.4, rot: 15, fill: fill(id, 'dots') });
    b += curve([[470, 80], [470, 50]], 1.8) + leaf(470, 52, 1.3, -150) + leaf(470, 50, 1.3, -30);
    b += words(80, 250, '1', { size: 13, bold: true }) + words(270, 250, '2', { size: 13, bold: true }) + words(470, 250, '3', { size: 13, bold: true });
    Object.assign(anchors, { cotyledon: { x: 512, y: 85, side: 'r' }, hypocotyl: { x: 472, y: 120, side: 'r' }, 'foliage-leaves': { x: 494, y: 42, side: 'r' }, radicle: { x: 80, y: 225, side: 'l' }, testa: { x: 58, y: 190, side: 'l' }, 'root-hairs': { x: 452, y: 210, side: 'l' } });
  }
  return { w: 600, h: 262, body: b, anchors, edge: true };
};

// ── Root tip, longitudinal section ──
export const rootTip: Drawer = ({ id }): Drawn => {
  let b = '';
  const xL = 100, xR = 180;
  b += `<path d="M${xL},20 L${xL},300 Q${xL},345 140,352 Q${xR},345 ${xR},300 L${xR},20" fill="#fff" stroke="${INK}" stroke-width="1.5"/>`;
  b += `<path d="M${xL},300 Q${xL},345 140,352 Q${xR},345 ${xR},300 Q140,315 ${xL},300 Z" fill="${fill(id, 'sand')}" stroke="${INK}" stroke-width="1"/>`;
  for (let y = 240; y < 300; y += 7) b += `<line x1="${xL}" y1="${y}" x2="${xR}" y2="${y}" stroke="${INK}" stroke-width="0.5"/>`;
  for (let x = xL + 8; x < xR; x += 8) b += `<line x1="${x}" y1="240" x2="${x}" y2="304" stroke="${INK}" stroke-width="0.5"/>`;
  for (let y = 150; y < 240; y += 18) b += `<line x1="${xL}" y1="${y}" x2="${xR}" y2="${y}" stroke="${INK}" stroke-width="0.5"/>`;
  for (let x = xL + 10; x < xR; x += 10) b += `<line x1="${x}" y1="150" x2="${x}" y2="240" stroke="${INK}" stroke-width="0.5"/>`;
  for (let y = 20; y < 150; y += 30) b += `<line x1="${xL}" y1="${y}" x2="${xR}" y2="${y}" stroke="${INK}" stroke-width="0.5"/>`;
  for (let x = xL + 13; x < xR; x += 13) b += `<line x1="${x}" y1="20" x2="${x}" y2="150" stroke="${INK}" stroke-width="0.5"/>`;
  b += `<line x1="140" y1="20" x2="140" y2="150" stroke="${INK}" stroke-width="2.5"/>`;
  for (let y = 30; y < 140; y += 14) { b += curve([[xL, y], [xL - 18, y - 4], [xL - 34, y - 10]], 1.2) + curve([[xR, y + 7], [xR + 18, y + 3], [xR + 34, y - 3]], 1.2); }
  for (const [y0, y1, t] of [[20, 150, 'Region of differentiation'], [150, 240, 'Region of elongation'], [240, 300, 'Region of cell division'], [300, 352, 'Root cap']] as const)
    b += `<path d="M205,${y0 + 2} L212,${y0 + 2} L212,${y1 - 2} L205,${y1 - 2}" fill="none" stroke="${INK}" stroke-width="0.9"/>`;
  return { w: 280, h: 362, body: b, edge: true, anchors: {
    'root-hairs': { x: 70, y: 66, side: 'l' }, differentiation: { x: 212, y: 85, side: 'r' }, elongation: { x: 212, y: 195, side: 'r' },
    'cell-division': { x: 212, y: 270, side: 'r' }, 'root-cap': { x: 212, y: 326, side: 'r' }, 'xylem-forming': { x: 140, y: 60, side: 'l' },
  } };
};
