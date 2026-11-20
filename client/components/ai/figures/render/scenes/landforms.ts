// @/components/ai/figures/render/scenes/landforms.ts — internal earth
// movements and mass movement, drawn like ECZ's diagrams: rock layers in
// block diagrams, folds with compression arrows, rift valleys and block
// mountains with faults and tension/compression arrows, intrusive and
// extrusive volcanic features, a composite volcano, soil creep, a landslide.
import { INK, n } from '../svg';
import { GREY, area, bigArrow, cloud, fill, path, tree, type Drawer, type Drawn } from './kit';

type P = { x: number; y: number };
const poly = (pts: P[]) => `M${pts.map((p) => `${n(p.x)},${n(p.y)}`).join(' L')} Z`;

/** The part of a polygon between two heights (for cutting rock layers out of a block). */
function clipY(pts: P[], y0: number, y1: number): P[] {
  const cut = (input: P[], keep: (p: P) => boolean, yLine: number): P[] => {
    const out: P[] = [];
    input.forEach((p, i) => {
      const q = input[(i + 1) % input.length];
      if (keep(p)) out.push(p);
      if (keep(p) !== keep(q)) { const t = (yLine - p.y) / (q.y - p.y); out.push({ x: p.x + t * (q.x - p.x), y: yLine }); }
    });
    return out;
  };
  return cut(cut(pts, (p) => p.y >= y0, y0), (p) => p.y <= y1, y1);
}

const LAYER_FILLS = ['strata', 'dots', 'bricks', 'sand', 'hatch'] as const;

/** Fills a block's front face with rock layers that start at `top` (lowered by `drop`). */
function layered(id: string, face: P[], drop: number, bands: number[]) {
  let out = '';
  for (let k = 0; k < bands.length - 1; k++) {
    const piece = clipY(face, bands[k] + drop, bands[k + 1] + drop);
    if (piece.length > 2) out += area(poly(piece), fill(id, LAYER_FILLS[k % LAYER_FILLS.length]), { width: 0.8 });
  }
  return out + area(poly(face), 'none', { width: 1.4 });
}

export const fold: Drawer = ({ id, variant }) => {
  const x0 = 70, x1 = 390, depth = { x: 40, y: -28 }, A = 42;
  // Overfolds and recumbent folds: the fold is pushed over to the right, so
  // high points (crests) move right and low points (troughs) move left. A
  // recumbent fold is pushed so far that its limb lies almost flat.
  const shear = variant === 'overfold' ? 1.0 : variant === 'recumbent' ? 2.3 : 0;
  const amp = variant === 'recumbent' ? 36 : A;
  const raw = (x: number, k: number) => 118 + k * 24 - amp * Math.cos((2 * Math.PI * (x - 150)) / 320);
  const at = (x: number, k: number) => {
    const y = raw(x, k);
    return { x: x + shear * (118 + k * 24 - y), y }; // no shift at x0 and x1, where the layer is at its mean height
  };
  const curve = (k: number, dx = 0, dy = 0) => Array.from({ length: 97 }, (_, i) => { const x = x0 + ((x1 - x0) * i) / 96; const p = at(x, k); return { x: p.x + dx, y: p.y + dy }; });
  let body = '';
  for (let k = 0; k < 4; k++) {
    const top = curve(k), bot = k < 3 ? curve(k + 1) : [{ x: x0, y: 268 }, { x: x1, y: 268 }];
    body += area(poly([...top, ...bot.reverse()]), fill(id, LAYER_FILLS[k]), { width: 0.9 });
  }
  const surface = curve(0);
  body += area(poly([...surface, { x: x1, y: 268 }, { x: x0, y: 268 }]), 'none', { width: 1.4 });
  const back = curve(0, depth.x, depth.y);
  body += area(poly([...surface, ...back.reverse()]), '#fff', { width: 1.2 });
  const r0 = surface[surface.length - 1];
  body += area(poly([r0, { x: x1 + depth.x, y: r0.y + depth.y }, { x: x1 + depth.x, y: 268 + depth.y }, { x: x1, y: 268 }]), fill(id, 'strata'), { width: 1.2 });
  body += bigArrow(8, 200, 52, 0, 14) + bigArrow(482, 200, 52, 180, 14);
  const crest = at(150, 0), trough = at(310, 0), limb = at(230, 0);
  return {
    w: 490, h: 290, body,
    anchors: {
      anticline: { x: crest.x, y: at(150, 1).y - 8, side: 'l' }, crest: { x: crest.x, y: crest.y, side: 'l' },
      syncline: { x: trough.x, y: trough.y - 2, side: 'r' }, trough: { x: trough.x, y: at(310, 1).y + 6, side: 'r' },
      limb: { x: limb.x, y: limb.y, side: 'r' }, compression: { x: 30, y: 200, side: 'l' },
    },
  };
};

/** Rift valley (variant tension: normal faults; compression: reverse faults) and block mountain. */
function faultBlocks(id: string, mode: 'rift-tension' | 'rift-compression' | 'horst'): Drawn {
  const L = 60, Rt = 400, base = 268, d = { x: 46, y: -30 };
  const raised = mode === 'horst';
  const sideTop = raised ? 140 : 112, midTop = raised ? 92 : 166;
  // Fault lines (top x, bottom x). Normal faults dip under the block that has moved down.
  const tension = mode !== 'rift-compression';
  const lf = raised ? { top: 175, bot: 150 } : tension ? { top: 170, bot: 205 } : { top: 205, bot: 170 };
  const rf = raised ? { top: 285, bot: 310 } : tension ? { top: 290, bot: 255 } : { top: 255, bot: 290 };
  const xOn = (f: { top: number; bot: number }, y: number, yTop: number) => f.top + ((f.bot - f.top) * (y - yTop)) / (base - yTop);
  const yTopLine = Math.min(sideTop, midTop);
  const lx = (y: number) => xOn(lf, y, yTopLine), rx = (y: number) => xOn(rf, y, yTopLine);
  const leftFace: P[] = [{ x: L, y: sideTop }, { x: lx(sideTop), y: sideTop }, { x: lx(base), y: base }, { x: L, y: base }];
  const midFace: P[] = [{ x: lx(midTop), y: midTop }, { x: rx(midTop), y: midTop }, { x: rx(base), y: base }, { x: lx(base), y: base }];
  const rightFace: P[] = [{ x: rx(sideTop), y: sideTop }, { x: Rt, y: sideTop }, { x: Rt, y: base }, { x: rx(base), y: base }];
  const bands = [0, 20, 44, 72, 104, 160].map((v) => v + 112);
  const drop = midTop - sideTop;
  let body = layered(id, leftFace, 0, bands) + layered(id, midFace, drop, bands) + layered(id, rightFace, 0, bands);
  const top = (face: P[], y: number) => { const a = face[0], b = face[1]; return area(poly([a, b, { x: b.x + d.x, y: y + d.y }, { x: a.x + d.x, y: y + d.y }]), '#fff', { width: 1.2 }); };
  body += top(leftFace, sideTop) + top(midFace, midTop) + top(rightFace, sideTop);
  // Fault scarps (the steps between the blocks), seen on top
  const scarp = (xa: number, xb: number) => area(poly([{ x: xa, y: sideTop }, { x: xb, y: midTop }, { x: xb + d.x, y: midTop + d.y }, { x: xa + d.x, y: sideTop + d.y }]), raised ? '#fff' : fill(id, 'vlines'), { width: 1.1 });
  body += raised ? scarp(lx(sideTop), lx(midTop)) : scarp(lx(sideTop), lx(midTop)) + scarp(rx(sideTop), rx(midTop));
  body += area(poly([{ x: Rt, y: sideTop }, { x: Rt + d.x, y: sideTop + d.y }, { x: Rt + d.x, y: base + d.y }, { x: Rt, y: base }]), fill(id, 'strata'), { width: 1.2 });
  // Fault lines drawn bold on the front
  body += path(`M${n(lx(yTopLine))},${yTopLine} L${n(lx(base))},${base}`, { width: 2 }) + path(`M${n(rx(yTopLine))},${yTopLine} L${n(rx(base))},${base}`, { width: 2 });
  // Forces: apart (tension) or together (compression)
  body += tension && !raised ? bigArrow(52, 290, 48, 180, 14) + bigArrow(408, 290, 48, 0, 14) : bigArrow(4, 290, 48, 0, 14) + bigArrow(456, 290, 48, 180, 14);
  return {
    w: 470, h: 310, body,
    anchors: {
      [raised ? 'block-mountain' : 'rift-valley']: { x: (lx(midTop) + rx(midTop)) / 2 + d.x / 2, y: midTop + d.y / 2, side: 'r' },
      fault: { x: lx((sideTop + base) / 2 + 30), y: (sideTop + base) / 2 + 30, side: 'l' },
      escarpment: { x: (lx(sideTop) + lx(midTop)) / 2 + d.x / 2, y: (sideTop + midTop) / 2 + d.y / 2, side: 'l' },
      block: { x: (lx(base) + rx(base)) / 2, y: (midTop + base) / 2 + 20, side: 'r' },
      [raised ? 'force' : tension ? 'tension' : 'compression']: { x: tension && !raised ? 30 : 26, y: 290, side: 'l' },
    },
  };
}
export const riftValley: Drawer = ({ id, variant }) => faultBlocks(id, variant === 'compression' ? 'rift-compression' : 'rift-tension');
export const blockMountain: Drawer = ({ id }) => faultBlocks(id, 'horst');

export const volcanicFeatures: Drawer = ({ id }) => {
  const g = 104; // ground level
  let body = '';
  const bands = [g, 132, 160, 192, 230, 330];
  for (let k = 0; k < bands.length - 1; k++) body += area(`M0,${bands[k]} H480 V${bands[k + 1]} H0 Z`, fill(id, LAYER_FILLS[k % 4]), { width: 0.6 });
  const magma = fill(id, 'cross');
  // Batholith: the great mass below everything
  body += area(`M120,330 C135,262 370,250 410,330 Z`, magma, { width: 1.6 });
  // Dyke: a vertical sheet cutting across the layers
  body += area(`M181,292 L187,292 L194,118 L188,118 Z`, magma, { width: 1.3 });
  // Sill: a horizontal sheet along the layers, fed from the dyke
  body += area(`M190,157 L268,157 L268,164 L190,164 Z`, magma, { width: 1.3 });
  // Laccolith: a dome that has pushed the layers above it upwards
  body += area(`M30,198 Q85,150 140,198 Z`, magma, { width: 1.4 }) + path('M22,190 Q85,136 148,190', { width: 1 }) + area(`M82,198 L88,198 L88,230 L82,230 Z`, magma, { width: 1 });
  // Lopolith: a saucer-shaped mass
  body += area(`M20,236 Q70,262 120,236 Q70,250 20,236 Z`, magma, { width: 1.3 });
  // Volcanic cone with vent and crater
  const cone = `M250,${g} L330,46 L344,56 L356,56 L370,46 L452,${g} Z`;
  body += area(cone, fill(id, 'dots'), { width: 1.5 });
  body += area(`M344,262 L356,262 L356,56 L344,56 Z`, magma, { width: 1.2 });
  body += area(`M345,52 L355,52 L357,58 L343,58 Z`, '#fff', { stroke: false });
  // Lava flow down the right side; ash and gas above
  body += path(`M368,52 C388,66 404,80 430,96`, { width: 4.5 });
  body += cloud(352, 20, 0.75, GREY);
  // Ground line on top of everything
  body += path(`M0,${g} H250 M452,${g} H480`, { width: 1.6 });
  return {
    w: 480, h: 330, body,
    anchors: {
      batholith: { x: 260, y: 300, side: 'r' }, dyke: { x: 191, y: 220, side: 'l' }, sill: { x: 240, y: 160, side: 'r' }, laccolith: { x: 85, y: 186, side: 'l' },
      lopolith: { x: 70, y: 246, side: 'l' }, 'volcanic-plug': { x: 350, y: 90, side: 'r' }, vent: { x: 350, y: 180, side: 'r' }, crater: { x: 350, y: 54, side: 'r' },
      volcano: { x: 300, y: 82, side: 'l' }, 'lava-flow': { x: 410, y: 82, side: 'r' }, 'ash-cloud': { x: 360, y: 14, side: 'r' },
    },
  };
};

export const volcano: Drawer = ({ id }) => {
  const g = 250, cx = 240;
  let body = area(`M0,${g} H480 V330 H0 Z`, fill(id, 'bricks'), { width: 0.8 });
  // Alternating layers of ash and lava, as nested cones
  const cone = (k: number) => {
    const s = 1 - k * 0.2;
    const top = 60 + (g - 60) * (1 - s), half = 190 * s;
    return `M${n(cx - half)},${g} L${n(cx - 14)},${n(top)} L${n(cx + 14)},${n(top)} L${n(cx + half)},${g} Z`;
  };
  for (let k = 0; k < 4; k++) body += area(cone(k), fill(id, k % 2 ? 'strata' : 'dots'), { width: 1 });
  body += area(cone(0), 'none', { width: 1.6 });
  // Crater
  body += area(`M${cx - 20},60 L${cx - 8},76 L${cx + 8},76 L${cx + 20},60 Z`, '#fff', { width: 1.2 });
  // Magma chamber, main vent and a side vent to a parasitic cone
  const magma = fill(id, 'cross');
  body += `<ellipse cx="${cx}" cy="295" rx="80" ry="24" fill="${magma}" stroke="${INK}" stroke-width="1.5"/>`;
  body += area(`M${cx - 6},274 L${cx + 6},274 L${cx + 6},76 L${cx - 6},76 Z`, magma, { width: 1.2 });
  body += area(`M${cx + 6},190 L${cx + 12},186 L${cx + 102},146 L${cx + 106},154 Z`, magma, { width: 1 });
  body += area(`M${cx + 92},152 L${cx + 106},134 L${cx + 122},157 Z`, fill(id, 'dots'), { width: 1.3 });
  body += path(`M${cx + 22},62 C${cx + 60},90 ${cx + 70},120 ${cx + 95},140`, { width: 4 });
  body += cloud(cx + 4, 28, 0.85, GREY);
  return {
    w: 480, h: 330, body,
    anchors: {
      crater: { x: cx, y: 70, side: 'l' }, 'main-vent': { x: cx, y: 210, side: 'l' }, 'side-vent': { x: cx + 60, y: 168, side: 'r' }, 'parasitic-cone': { x: cx + 108, y: 140, side: 'r' },
      'magma-chamber': { x: cx - 40, y: 300, side: 'l' }, 'lava-layer': { x: cx - 120, y: 220, side: 'l' }, 'ash-layer': { x: cx - 150, y: 240, side: 'l' }, 'lava-flow': { x: cx + 60, y: 98, side: 'r' }, 'ash-cloud': { x: cx + 26, y: 22, side: 'r' },
    },
  };
};

export const soilCreep: Drawer = ({ id }) => {
  const a = { x: 20, y: 64 }, b = { x: 470, y: 250 }, soil = 34;
  const at = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  let body = area(`M${a.x},${a.y + soil} L${b.x},${b.y + soil} L${b.x},300 L${a.x},300 Z`, fill(id, 'bricks'), { width: 1 });
  // Soil with small steps (terracettes) on the surface
  let surface = `M${a.x},${a.y}`;
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const p = at(t);
    surface += t > 0.42 && t < 0.62 ? ` L${n(p.x - 6)},${n(p.y - 2)} L${n(p.x - 6)},${n(p.y + 1)} L${n(p.x)},${n(p.y)}` : ` L${n(p.x)},${n(p.y)}`;
  }
  body += area(`${surface} L${b.x},${b.y + soil} L${a.x},${a.y + soil} Z`, fill(id, 'dots'), { width: 1.3 });
  // Bent trees (the trunk curves to stay upright), tilted posts, a bulging wall
  for (const t of [0.12, 0.3]) { const p = at(t); body += tree(p.x, p.y, 1.3, 1.4); }
  const posts = [0.7, 0.8];
  for (const t of posts) { const p = at(t); body += path(`M${n(p.x)},${n(p.y + 4)} L${n(p.x + 10)},${n(p.y - 30)}`, { width: 2.4 }); }
  body += path(`M${n(at(0.7).x + 10)},${n(at(0.7).y - 26)} L${n(at(0.8).x + 10)},${n(at(0.8).y - 26)}`, { width: 0.9 });
  const w = at(0.92);
  body += area(`M${n(w.x - 4)},${n(w.y + 2)} Q${n(w.x + 10)},${n(w.y - 14)} ${n(w.x + 2)},${n(w.y - 30)} L${n(w.x - 8)},${n(w.y - 30)} Q${n(w.x)},${n(w.y - 14)} ${n(w.x - 14)},${n(w.y + 2)} Z`, fill(id, 'bricks'), { width: 1.2 });
  // Slow movement downslope
  for (const t of [0.2, 0.52]) { const p = at(t), q = at(t + 0.12); body += path(`M${n(p.x)},${n(p.y + soil * 0.55)} L${n(q.x)},${n(q.y + soil * 0.55)}`, { width: 1.3, arrow: `${id}-arr` }); }
  return {
    w: 480, h: 300, body,
    anchors: {
      'bent-tree': { x: at(0.3).x + 6, y: at(0.3).y - 12, side: 'l' }, 'tilted-post': { x: at(0.8).x + 6, y: at(0.8).y - 18, side: 'r' }, wall: { x: w.x - 2, y: w.y - 14, side: 'r' },
      terracettes: { x: at(0.52).x, y: at(0.52).y, side: 'r' }, 'soil-movement': { x: at(0.6).x, y: at(0.6).y + soil * 0.55, side: 'l' }, 'parent-rock': { x: at(0.4).x, y: at(0.4).y + soil + 30, side: 'l' },
    },
  };
};

export const landslide: Drawer = ({ id }) => {
  let body = area('M0,80 L180,80 C230,90 290,200 340,240 L480,250 L480,300 L0,300 Z', fill(id, 'strata'), { width: 1.3 });
  // The slumped mass: rotated back along the curved slip plane, bulging at the toe
  body += area('M196,86 C205,120 222,150 238,160 C280,175 320,190 352,214 C372,228 392,240 420,250 L340,250 C300,252 255,240 230,215 C215,195 206,150 196,86 Z', fill(id, 'dots'), { width: 1.4 });
  body += path('M182,80 C250,110 330,170 420,250', { dash: '5 4', width: 1 }); // original slope
  body += path('M190,82 C210,190 300,248 420,250', { width: 1.6, dash: '7 3' }); // slip plane
  return {
    w: 480, h: 300, body,
    anchors: {
      scar: { x: 197, y: 104, side: 'l' }, 'slip-plane': { x: 236, y: 200, side: 'l' }, 'slumped-mass': { x: 300, y: 210, side: 'r' },
      'original-slope': { x: 300, y: 152, side: 'r' }, toe: { x: 400, y: 246, side: 'r' },
    },
  };
};
