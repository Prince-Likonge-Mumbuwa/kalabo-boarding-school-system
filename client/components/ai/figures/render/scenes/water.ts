// @/components/ai/figures/render/scenes/water.ts — water and rivers, and
// rainfall: the hydrological cycle, a river's long profile, a waterfall, a
// meander (plan and cross-section), an ox-bow lake in three stages, a flood
// plain with levees, a V-shaped valley with interlocking spurs, deltas,
// drainage patterns, and relief, convectional and frontal rainfall.
import { INK, n } from '../svg';
import { GREY, area, arrow, cloud, fill, path, rain, seeded, sun, tree, words, type Drawer } from './kit';

/** A river on a plan: dark banks with grey water between. */
const riverBand = (d: string, width = 9) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${GREY}" stroke-width="${width - 3}" stroke-linecap="round" stroke-linejoin="round"/>`;
/** A wavy upward arrow (evaporation, transpiration). */
const wavyUp = (id: string, x: number, y0: number, y1: number) => path(`M${x},${y0} q-6,-${(y0 - y1) / 4} 0,-${(y0 - y1) / 2} t0,-${(y0 - y1) / 2}`, { width: 1.2, arrow: `${id}-arr` });

export const waterCycle: Drawer = ({ id }) => {
  let body = area('M0,240 H190 V320 H0 Z', fill(id, 'water'), { stroke: false });
  // Land: soil over rock, rising to a mountain; the water table below
  const land = 'M170,240 C220,236 250,216 290,186 L372,92 L420,140 L500,160 V320 H170 Z';
  body += area(land, fill(id, 'bricks'), { width: 1.3 });
  body += path('M182,282 C260,276 360,250 500,236', { dash: '6 4', width: 1 });
  body += path('M0,240 H190', { width: 1.2 });
  body += area('M434,151 Q452,166 472,157 Z', fill(id, 'water'), { width: 1 }); // lake
  body += area('M206,236 q7,8 14,0 z', GREY, { width: 1 }); // river channel near the coast
  body += sun(48, 44, 16);
  for (const x of [50, 95, 140]) body += wavyUp(id, x, 232, 150);
  body += cloud(118, 112, 1) + cloud(372, 50, 1.1, GREY);
  body += arrow(id, 160, 100, 320, 52, { bend: -0.12, width: 1.3 }); // clouds blown inland
  body += rain(330, 410, 70, 130, 11);
  body += tree(252, 218, 1.1) + tree(276, 200, 1.1);
  body += wavyUp(id, 262, 182, 132) + wavyUp(id, 288, 164, 120);
  body += path('M392,118 C360,170 300,212 228,236', { width: 1.4, arrow: `${id}-arr` }); // surface run-off
  body += arrow(id, 330, 182, 330, 214, { width: 1.2 }) + arrow(id, 350, 166, 350, 198, { width: 1.2 }); // infiltration
  body += arrow(id, 340, 226, 340, 260, { width: 1.2, dash: '4 3' }); // percolation to the water table
  body += path('M470,262 C380,276 280,290 196,294', { width: 1.4, arrow: `${id}-arr` }); // groundwater flow
  return {
    w: 500, h: 320, body,
    anchors: {
      sun: { x: 48, y: 62, side: 'l' }, sea: { x: 60, y: 285, side: 'l' }, evaporation: { x: 95, y: 190, side: 'l' }, transpiration: { x: 280, y: 140, side: 'r' },
      condensation: { x: 130, y: 102, side: 'l' }, precipitation: { x: 370, y: 100, side: 'r' }, 'surface-runoff': { x: 300, y: 196, side: 'r' },
      infiltration: { x: 340, y: 200, side: 'r' }, percolation: { x: 340, y: 246, side: 'r' }, 'groundwater-flow': { x: 380, y: 276, side: 'r' }, river: { x: 213, y: 238, side: 'l' }, lake: { x: 452, y: 160, side: 'r' },
    },
  };
};

export const riverProfile: Drawer = ({ id }) => {
  let body = area('M430,246 H480 V280 H430 Z', fill(id, 'water'), { stroke: false }) + path('M425,246 H480', { width: 1.2 });
  body += area('M30,40 C120,160 260,230 430,246 V280 H30 Z', fill(id, 'strata'), { width: 0.5 });
  body += path('M30,40 C120,160 260,230 430,246', { width: 2.4 });
  for (const x of [130, 285]) body += path(`M${x},30 V275`, { dash: '4 4', width: 0.8 });
  return {
    w: 480, h: 280, body,
    anchors: {
      source: { x: 30, y: 40, side: 'l' }, 'upper-course': { x: 82, y: 112, side: 'l' }, 'middle-course': { x: 205, y: 204, side: 'r' },
      'lower-course': { x: 360, y: 240, side: 'r' }, mouth: { x: 430, y: 246, side: 'r' }, 'sea-level': { x: 462, y: 246, side: 'r' },
    },
  };
};

export const waterfall: Drawer = ({ id }) => {
  let body = area('M0,125 H236 V300 H0 Z', fill(id, 'dots'), { width: 1 });
  body += area('M236,220 H480 V300 H236 Z', fill(id, 'dots'), { width: 1 });
  body += area('M236,125 H244 Q246,175 240,220 H236 Z', fill(id, 'dots'), { stroke: false });
  body += area('M0,90 H262 V118 H244 V125 H0 Z', fill(id, 'bricks'), { width: 1.4 }); // hard rock and its overhang
  body += area('M250,220 C254,262 318,262 322,220 Z', fill(id, 'water'), { width: 1.2 }); // plunge pool
  body += area('M0,78 H262 V90 H0 Z', fill(id, 'water'), { stroke: false });
  body += area('M322,212 H480 V220 H322 Z', fill(id, 'water'), { stroke: false });
  for (const dx of [0, 6, 12]) body += path(`M${262 + dx * 0.3},${80 + dx} C${276 + dx},${120} ${282 + dx},${170} ${280 + dx},225`, { width: 1.1 });
  // Former positions of the falls: the gorge it has cut by retreating upstream
  body += path('M340,130 V212 M398,150 V212', { dash: '4 4', width: 1 });
  body += arrow(id, 380, 120, 300, 120, { width: 1.3 });
  body += words(345, 112, 'retreat', { size: 10, italic: true });
  body += arrow(id, 40, 70, 110, 70, { width: 1.2 });
  return {
    w: 480, h: 300, body,
    anchors: {
      'hard-rock': { x: 100, y: 108, side: 'l' }, 'soft-rock': { x: 100, y: 210, side: 'l' }, overhang: { x: 255, y: 112, side: 'r' },
      'plunge-pool': { x: 300, y: 248, side: 'r' }, gorge: { x: 370, y: 196, side: 'r' }, waterfall: { x: 284, y: 170, side: 'r' },
    },
  };
};

export const meander: Drawer = ({ id }) => {
  const centre = 'M20,60 C120,60 140,150 240,150 C340,150 360,60 460,60';
  let body = '';
  // Plan: deposits on the inner bend, cliff ticks on the outer bend
  body += area('M200,140 C215,112 265,112 280,140 Z', fill(id, 'dots'), { width: 0.9 });
  body += riverBand(centre, 26);
  for (let x = 196; x <= 284; x += 8) { const t = (x - 240) / 60; const y = 164 + 2 * (1 - t * t); body += `<line x1="${x}" y1="${n(y)}" x2="${x}" y2="${n(y + 7)}" stroke="${INK}" stroke-width="1"/>`; }
  body += path('M20,64 C120,64 140,156 240,157 C340,156 360,64 460,64', { dash: '5 3', width: 1 }); // line of fastest flow, near the outer bank
  body += arrow(id, 40, 60, 80, 60, { width: 1.2 }) + arrow(id, 400, 60, 440, 60, { width: 1.2 });
  body += path('M240,108 V196', { dash: '2 3', width: 0.8 }) + words(240, 104, 'X', { size: 10, bold: true }) + words(240, 208, 'Y', { size: 10, bold: true });
  // Cross-section X–Y: gentle slip-off slope (left), steep river cliff (right)
  const g = 236;
  body += area(`M60,${g} L160,${g + 2} C200,${g + 10} 230,${g + 30} 262,${g + 50} L300,${g + 52} L304,${g + 2} L420,${g} V320 H60 Z`, fill(id, 'strata'), { width: 1.3 });
  body += area(`M196,${g + 16} C220,${g + 26} 240,${g + 36} 262,${g + 50} L300,${g + 52} L304,${g + 16} Z`, fill(id, 'water'), { width: 0.8 });
  body += area(`M160,${g + 2} C190,${g + 8} 210,${g + 18} 232,${g + 32} L214,${g + 30} C200,${g + 22} 180,${g + 12} 160,${g + 6} Z`, fill(id, 'dots'), { width: 0.8 });
  body += words(70, g - 6, 'X', { size: 10, bold: true }) + words(410, g - 6, 'Y', { size: 10, bold: true });
  return {
    w: 480, h: 320, body,
    anchors: {
      'river-cliff': { x: 300, y: g + 26, side: 'r' }, 'slip-off-slope': { x: 196, y: g + 14, side: 'l' }, 'fastest-flow': { x: 300, y: 145, side: 'r' },
      'point-bar': { x: 240, y: 126, side: 'l' }, 'outer-bend': { x: 270, y: 168, side: 'r' }, 'inner-bend': { x: 205, y: 132, side: 'l' },
    },
  };
};

export const oxbowLake: Drawer = ({ id }) => {
  const loop = (ox: number) => `M${ox + 5},160 L${ox + 50},152 C${ox + 15},40 ${ox + 145},40 ${ox + 110},152 L${ox + 155},160`;
  let body = '';
  // 1: a tight meander; erosion on the outer bends narrows the neck
  body += riverBand(loop(0), 11);
  body += arrow(id, 46, 128, 66, 140, { width: 1.1 }) + arrow(id, 114, 128, 94, 140, { width: 1.1 });
  // 2: in a flood the river cuts through the neck
  body += riverBand(loop(170), 11) + riverBand('M220,152 L280,152', 11);
  body += arrow(id, 200, 186, 230, 166, { width: 1 }) + words(205, 200, 'flood', { size: 10, italic: true });
  // 3: deposits seal off the old loop: an ox-bow lake
  body += riverBand('M345,160 L495,160', 11);
  body += area('M395,147 C355,40 485,40 445,147 L438,144 C470,60 370,60 402,144 Z', fill(id, 'water'), { width: 1.4 });
  body += area('M388,150 L410,150 L408,156 L390,156 Z', fill(id, 'dots'), { width: 0.8 }) + area('M432,150 L454,150 L452,156 L434,156 Z', fill(id, 'dots'), { width: 0.8 });
  for (const [x, s] of [[80, '1'], [250, '2'], [420, '3']] as const) body += words(x, 210, s, { bold: true, size: 13 });
  return {
    w: 500, h: 220, body,
    anchors: {
      neck: { x: 80, y: 152, side: 'b' }, erosion: { x: 80, y: 60, side: 't' }, 'new-course': { x: 470, y: 160, side: 'b' },
      'oxbow-lake': { x: 420, y: 62, side: 't' }, deposits: { x: 399, y: 155, side: 'b' },
    },
  };
};

export const floodplain: Drawer = ({ id }) => {
  const ground = 'M0,40 C60,52 92,150 110,180 L218,180 Q224,166 232,174 L236,204 L250,204 L254,174 Q262,166 268,180 L370,180 C390,150 420,52 480,40';
  let body = area(`${ground} V260 H0 Z`, fill(id, 'bricks'), { width: 1.4 });
  body += area('M110,180 L218,180 Q224,166 232,174 L236,204 L250,204 L254,174 Q262,166 268,180 L370,180 C374,190 378,210 380,226 L100,226 C104,210 107,192 110,180 Z', fill(id, 'dots'), { width: 0.8 });
  body += area('M233,184 L253,184 L250,204 L236,204 Z', fill(id, 'water'), { width: 0.8 });
  body += path(ground, { width: 1.6 });
  return {
    w: 480, h: 260, body,
    anchors: { levee: { x: 226, y: 170, side: 'l' }, floodplain: { x: 160, y: 180, side: 'l' }, channel: { x: 243, y: 196, side: 'r' }, alluvium: { x: 320, y: 206, side: 'r' }, bluff: { x: 60, y: 92, side: 'l' } },
  };
};

export const vValley: Drawer = ({ id }) => {
  // Plan: the river winds between spurs that interlock from either side
  let body = '';
  const spur = (x: number, fromTop: boolean) => {
    const y0 = fromTop ? 0 : 140, tip = fromTop ? 84 : 56;
    return area(`M${x - 48},${y0} C${x - 30},${(y0 + tip) / 2} ${x - 12},${tip} ${x},${tip} C${x + 12},${tip} ${x + 30},${(y0 + tip) / 2} ${x + 48},${y0} Z`, fill(id, 'hatch'), { width: 1.1 });
  };
  body += spur(90, false) + spur(175, true) + spur(262, false) + spur(350, true) + spur(436, false);
  body += riverBand('M10,70 C50,92 70,40 90,40 C110,40 140,104 175,104 C210,104 238,40 262,40 C290,40 320,104 350,104 C380,104 410,40 436,40 C455,40 465,60 475,70', 8);
  body += path('M0,140 H480', { width: 0.8, dash: '3 3' });
  // Cross-section: a narrow V with steep sides
  body += area('M20,170 L232,286 L248,286 L460,170 V300 H20 Z', fill(id, 'strata'), { width: 1.4 });
  body += area('M234,278 L246,278 L248,286 L232,286 Z', fill(id, 'water'), { width: 0.8 });
  return {
    w: 480, h: 300, body,
    anchors: { 'v-valley': { x: 240, y: 240, side: 'r' }, spur: { x: 175, y: 60, side: 'l' }, river: { x: 300, y: 70, side: 'r' }, 'steep-side': { x: 360, y: 225, side: 'r' } },
  };
};

export const delta: Drawer = ({ id, variant }) => {
  let body = area('M0,0 H480 V300 H0 Z', fill(id, 'water'), { stroke: false });
  body += area('M0,0 H480 V70 C400,74 330,66 270,70 L210,70 C150,66 80,74 0,70 Z', '#fff', { width: 1.3 });
  for (const [x, y] of [[60, 30], [120, 48], [380, 28], [430, 50], [330, 40]]) body += path(`M${x},${y} l2,-6 M${x + 3},${y} l0,-7 M${x + 6},${y} l-2,-6`, { width: 0.8 });
  const apex = { x: 240, y: 92 };
  const fan = variant === 'birds-foot'
    ? 'M200,70 C210,110 150,170 110,250 L126,256 C170,190 222,150 236,140 C236,190 232,240 236,290 L248,290 C250,240 246,190 246,140 C268,160 320,200 366,250 L378,240 C330,180 274,120 282,70 Z'
    : variant === 'cuspate'
      ? 'M150,70 C190,120 220,200 240,262 C260,200 290,120 330,70 Z'
      : 'M130,70 C110,160 170,250 240,258 C310,250 370,160 350,70 Z';
  body += area(fan, fill(id, 'dots'), { width: 1.4 });
  // Distributaries fanning out from the apex
  const ends = variant === 'birds-foot' ? [[116, 254], [242, 290], [372, 246]] : variant === 'cuspate' ? [[240, 262], [214, 214], [266, 214]] : [[150, 196], [196, 246], [240, 258], [286, 246], [330, 196]];
  for (const [x, y] of ends) body += riverBand(`M${apex.x},${apex.y} Q${(apex.x + x) / 2 + (x - 240) * 0.15},${(apex.y + y) / 2} ${x},${y}`, 6);
  body += riverBand(`M240,0 C250,30 230,60 ${apex.x},${apex.y}`, 10);
  if (variant !== 'birds-foot') body += `<ellipse cx="300" cy="196" rx="18" ry="9" fill="${fill(id, 'water')}" stroke="${INK}" stroke-width="1"/>`;
  for (const [x, y] of [[100, 260], [380, 266], [240, 284]]) body += `<ellipse cx="${x}" cy="${y}" rx="22" ry="5" fill="${fill(id, 'sand')}" stroke="${INK}" stroke-width="0.9"/>`;
  return {
    w: 480, h: 300, body,
    anchors: {
      'main-river': { x: 244, y: 30, side: 'r' }, distributary: { x: ends[0][0] + 30, y: ends[0][1] - 40, side: 'l' }, delta: { x: 200, y: 150, side: 'l' },
      sea: { x: 440, y: 230, side: 'r' }, lagoon: { x: 300, y: 196, side: 'r' }, sandbar: { x: 380, y: 266, side: 'r' },
    },
  };
};

/** Drainage patterns, drawn from simple rules so each looks like its textbook sketch. */
export const drainagePattern: Drawer = ({ id, variant }) => {
  const rnd = seeded(variant.length * 97 + 11);
  let body = '';
  const line = (pts: [number, number][], w: number) => path(`M${pts.map(([x, y]) => `${n(x)},${n(y)}`).join(' L')}`, { width: w });
  let confluence: [number, number] = [240, 150], tributary: [number, number] = [200, 100], main: [number, number] = [240, 230], centre: [number, number] = [240, 150];
  if (variant === 'dendritic') {
    const grow = (x: number, y: number, ang: number, len: number, depth: number, w: number) => {
      const steps = 3, pts: [number, number][] = [[x, y]];
      let cx = x, cy = y, a = ang;
      for (let i = 0; i < steps; i++) { a += (rnd() - 0.5) * 0.35; cx += (len / steps) * Math.cos(a); cy += (len / steps) * Math.sin(a); pts.push([cx, cy]); }
      body += line(pts, w);
      if (depth > 0) for (let i = 1; i <= steps; i++) {
        const [px, py] = pts[i];
        if (i < steps || depth > 0) grow(px, py, a + (i % 2 ? -1 : 1) * (0.5 + rnd() * 0.3), len * (0.55 + rnd() * 0.1), depth - 1, Math.max(0.8, w - 0.7));
      }
      return pts;
    };
    const trunk = grow(240, 286, -Math.PI / 2, 110, 3, 3.2);
    main = trunk[0]; confluence = trunk[1]; tributary = [trunk[1][0] - 30, trunk[1][1] - 20]; centre = trunk[2];
  } else if (variant === 'trellis') {
    body += line([[240, 10], [244, 100], [238, 200], [242, 290]], 3);
    for (let y = 40; y <= 260; y += 44) {
      for (const dir of [-1, 1]) {
        const x1 = 240 + dir * (150 + rnd() * 40);
        body += line([[x1, y - 4], [240 + dir * 80, y + 2], [242, y + 6]], 1.6);
        for (const x of [240 + dir * 60, 240 + dir * 120]) body += line([[x, y - 22], [x + dir * 2, y + 2]], 0.9);
      }
    }
    confluence = [242, 46]; tributary = [140, 40]; main = [242, 270]; centre = [320, 140];
  } else if (variant === 'radial') {
    for (const r of [26, 46]) body += `<ellipse cx="240" cy="150" rx="${r * 1.2}" ry="${r}" fill="none" stroke="${INK}" stroke-width="0.8" stroke-dasharray="3 3"/>`;
    body += words(240, 154, 'hill', { size: 10, italic: true });
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * 2 * Math.PI + rnd() * 0.2;
      body += line([[240 + 34 * Math.cos(a), 150 + 28 * Math.sin(a)], [240 + 100 * Math.cos(a + 0.1), 150 + 80 * Math.sin(a + 0.1)], [240 + 170 * Math.cos(a), 150 + 130 * Math.sin(a)]], 1.6);
    }
    main = [240 + 150, 150 + 20]; confluence = [240, 150]; tributary = [240 - 100, 150 - 70]; centre = [240, 150];
  } else if (variant === 'parallel') {
    body += line([[30, 270], [240, 280], [450, 272]], 3);
    for (let k = 0; k < 6; k++) { const x = 70 + k * 64; body += line([[x - 20, 14], [x - 6, 100], [x + 6, 190], [x + 14, 274]], 1.6); }
    confluence = [212, 276]; tributary = [190, 100]; main = [400, 274]; centre = [240, 150];
  } else if (variant === 'rectangular') {
    body += line([[40, 30], [40, 90], [150, 90], [150, 170], [300, 170], [300, 250], [450, 250]], 3);
    body += line([[100, 20], [100, 90]], 1.5) + line([[220, 60], [220, 170]], 1.5) + line([[220, 110], [320, 110]], 1) + line([[380, 140], [380, 250]], 1.5) + line([[150, 130], [80, 130], [80, 200]], 1.2) + line([[300, 210], [200, 210], [200, 270]], 1.2);
    confluence = [150, 90]; tributary = [220, 100]; main = [420, 250]; centre = [220, 150];
  } else {
    // centripetal: rivers flow inwards to a lake in a basin
    body += `<ellipse cx="240" cy="150" rx="40" ry="26" fill="${fill(id, 'water')}" stroke="${INK}" stroke-width="1.2"/>`;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * 2 * Math.PI + 0.2;
      body += line([[240 + 200 * Math.cos(a), 150 + 135 * Math.sin(a)], [240 + 120 * Math.cos(a - 0.1), 150 + 80 * Math.sin(a - 0.1)], [240 + 44 * Math.cos(a), 150 + 28 * Math.sin(a)]], 1.6);
    }
    main = [240 + 120, 150 + 30]; confluence = [240 + 44, 150 + 10]; tributary = [240 - 120, 150 - 70]; centre = [240, 150];
  }
  return {
    w: 480, h: 300, body,
    anchors: {
      'main-river': { x: main[0], y: main[1], side: 'r' }, tributary: { x: tributary[0], y: tributary[1], side: 'l' },
      confluence: { x: confluence[0], y: confluence[1], side: 'r' }, pattern: { x: centre[0], y: centre[1], side: 'r' },
    },
  };
};

export const rainfallRelief: Drawer = ({ id }) => {
  let body = area('M0,250 H160 V300 H0 Z', fill(id, 'water'), { stroke: false });
  body += area('M150,250 L250,180 L330,80 L362,96 L420,170 L500,212 V300 H150 Z', fill(id, 'strata'), { width: 1.4 });
  body += path('M0,250 H160', { width: 1.2 });
  body += arrow(id, 20, 226, 140, 226, { width: 2 }) + arrow(id, 170, 214, 290, 104, { width: 2, bend: -0.05 });
  body += cloud(278, 92, 1.15, GREY) + cloud(232, 128, 0.9, GREY);
  body += rain(206, 300, 140, 205, 10);
  body += arrow(id, 372, 70, 470, 170, { width: 2, bend: 0.08, dash: '7 4' });
  body += tree(170, 246, 0.9) + tree(196, 230, 0.9);
  return {
    w: 500, h: 300, body,
    anchors: {
      sea: { x: 60, y: 276, side: 'l' }, 'moist-wind': { x: 80, y: 226, side: 'l' }, windward: { x: 230, y: 196, side: 'l' }, leeward: { x: 440, y: 196, side: 'r' },
      cloud: { x: 290, y: 80, side: 'r' }, rain: { x: 250, y: 172, side: 'l' }, mountain: { x: 340, y: 84, side: 'r' }, 'descending-air': { x: 430, y: 128, side: 'r' },
    },
  };
};

export const rainfallConvectional: Drawer = ({ id }) => {
  let body = area('M0,252 H440 V300 H0 Z', fill(id, 'grass'), { width: 1.2 });
  body += sun(46, 46, 16);
  for (let x = 120; x <= 360; x += 30) body += path(`M${x},246 q4,-6 0,-12 t0,-12`, { width: 1 });
  for (const x of [180, 230, 280]) body += arrow(id, x, 222, x, 158, { width: 1.8 });
  body += path('M10,150 H430', { dash: '6 4', width: 1 });
  // Cumulonimbus: a tall cloud with an anvil top
  body += `<path d="M150,150 C130,140 140,112 166,114 C160,90 186,74 204,86 C200,60 230,46 250,60 C256,36 300,28 320,44 L380,38 L300,62 C320,70 330,96 316,110 C346,112 350,146 322,150 Z" fill="${GREY}" stroke="${INK}" stroke-width="1.3"/>`;
  body += rain(300, 380, 160, 246, 10);
  return {
    w: 440, h: 300, body,
    anchors: { sun: { x: 46, y: 64, side: 'l' }, 'heated-ground': { x: 120, y: 252, side: 'l' }, 'rising-air': { x: 180, y: 190, side: 'l' }, condensation: { x: 420, y: 150, side: 'r' }, cloud: { x: 330, y: 70, side: 'r' }, rain: { x: 350, y: 210, side: 'r' } },
  };
};

export const rainfallFrontal: Drawer = ({ id }) => {
  let body = area('M0,252 H480 V290 H0 Z', fill(id, 'grass'), { width: 1.2 });
  body += area('M120,252 C250,200 380,130 480,96 V252 Z', fill(id, 'sand'), { width: 0 });
  body += path('M120,252 C250,200 380,130 480,96', { width: 2.2 });
  body += arrow(id, 20, 220, 120, 214, { width: 1.8 }) + arrow(id, 150, 220, 330, 140, { width: 1.8, bend: -0.04 }) + arrow(id, 300, 110, 420, 64, { width: 1.8, bend: -0.04 });
  body += arrow(id, 460, 222, 360, 232, { width: 1.8, dash: '6 3' });
  body += cloud(330, 116, 1.1, GREY) + cloud(410, 82, 1.1, GREY) + cloud(250, 156, 0.9, GREY);
  body += rain(300, 420, 128, 246, 11);
  return {
    w: 480, h: 290, body,
    anchors: { 'warm-air': { x: 70, y: 214, side: 'l' }, 'cold-air': { x: 430, y: 214, side: 'r' }, front: { x: 214, y: 220, side: 'l' }, cloud: { x: 410, y: 72, side: 'r' }, rain: { x: 330, y: 196, side: 'r' } },
  };
};
