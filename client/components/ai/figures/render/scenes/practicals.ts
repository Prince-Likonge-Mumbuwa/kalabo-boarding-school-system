// @/components/ai/figures/render/scenes/practicals.ts — Biology practicals and
// apparatus that ECZ papers draw: the compound microscope, the photosynthesis
// experiments (pondweed giving off oxygen; the starch test on a variegated
// leaf and on a leaf partly covered with foil) and a food test in a water
// bath. Black and white; grey only for liquids.
import { INK, n } from '../svg';
import { GREY, fill, path, words, type Drawer, type Drawn } from './kit';
import { circle, curve, ellipse, roundRect, type Pt } from './biokit';
import { beaker } from './apparatus';

// ── Compound light microscope (side view) ──
export const microscope: Drawer = ({ id, variant }): Drawn => {
  const metal = fill(id, 'sand');
  // Base and arm (the arm is what you carry it by).
  let b = `<path d="M60,404 L64,384 Q70,374 90,374 L262,374 Q282,374 286,384 L290,404 Z" fill="${metal}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;
  b += `<path d="M236,374 L232,330 Q228,300 240,270 Q262,214 254,150 Q248,108 214,92 L196,88 L196,120 L210,124 Q228,134 230,160 Q234,214 214,262 Q204,292 206,330 L208,374 Z" fill="${metal}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;
  // Body tube with the eyepiece on top.
  b += roundRect(132, 74, 44, 130, 3, { width: 1.6 }) + roundRect(140, 34, 28, 42, 2, { width: 1.6 }) + path('M136,34 L172,34', { width: 3 });
  b += path('M176,96 L198,96 M176,112 L198,112', { width: 1.2 });                                    // rack joining tube to arm
  // Revolving nosepiece and three objective lenses (the middle one in use).
  b += `<path d="M120,204 L188,204 L178,222 L130,222 Z" fill="#fff" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>`;
  b += `<g transform="rotate(28 136 222)">${roundRect(128, 222, 14, 26, 2, { width: 1.3 })}</g><g transform="rotate(-28 172 222)">${roundRect(166, 222, 14, 30, 2, { width: 1.3 })}</g>`;
  b += roundRect(146, 222, 16, 40, 2, { width: 1.5 }) + roundRect(149, 258, 10, 8, 1, { width: 1.2 });
  // Focusing knobs on the arm: coarse (large) and fine (small).
  b += circle(238, 176, 18, { width: 1.6 }) + circle(238, 176, 5, { fill: INK, width: 0 });
  b += circle(222, 236, 10, { width: 1.5 }) + circle(222, 236, 3, { fill: INK, width: 0 });
  // Stage with a slide held by clips; condenser and diaphragm below the hole in the stage.
  b += roundRect(62, 282, 170, 10, 1, { fill: '#fff', width: 1.6 });
  b += roundRect(108, 276, 92, 6, 1, { fill: '#fff', width: 1.1 }) + ellipse(154, 279, 10, 2.2, { fill: GREY, width: 0.8 });
  b += path('M86,276 L124,272 M222,276 L184,272', { width: 2.2 }) + circle(86, 278, 3, { fill: INK, width: 0 }) + circle(222, 278, 3, { fill: INK, width: 0 });
  b += roundRect(136, 292, 36, 12, 1, { width: 1.3 }) + roundRect(130, 304, 48, 8, 1, { width: 1.3 }) + path('M178,308 L194,312', { width: 1.6 });
  // Light: a mirror on a fork, or a built-in lamp in the base.
  if (variant === 'lamp') {
    b += roundRect(128, 346, 52, 28, 4, { width: 1.4 }) + circle(154, 352, 9, { fill: '#fff', width: 1.2 });
    b += path('M154,340 L154,316', { width: 1.1, arrow: `${id}-arr` });
  } else {
    b += path('M176,346 L194,346 L210,336', { width: 2.2 }) + ellipse(154, 346, 22, 7, { fill: '#fff', width: 1.6 }) + path('M136,350 Q154,356 172,350', { width: 1 });
    b += path('M20,320 L130,342', { width: 1.1, dash: '5 3', arrow: `${id}-arr` }) + path('M154,338 L154,316', { width: 1.1, arrow: `${id}-arr` });
  }
  const anchors: Drawn['anchors'] = {
    eyepiece: { x: 154, y: 50, side: 'l' }, 'body-tube': { x: 140, y: 140, side: 'l' }, nosepiece: { x: 124, y: 212, side: 'l' }, objective: { x: 132, y: 236, side: 'l' },
    clip: { x: 92, y: 275, side: 'l' }, slide: { x: 112, y: 279, side: 'l' }, stage: { x: 70, y: 287, side: 'l' }, condenser: { x: 138, y: 300, side: 'l' },
    mirror: { x: 140, y: 346, side: 'l' }, lamp: { x: 140, y: 360, side: 'l' }, base: { x: 90, y: 392, side: 'l' },
    arm: { x: 244, y: 260, side: 'r' }, 'coarse-focus': { x: 252, y: 168, side: 'r' }, 'fine-focus': { x: 230, y: 242, side: 'r' }, diaphragm: { x: 186, y: 310, side: 'r' },
  };
  delete anchors[variant === 'lamp' ? 'mirror' : 'lamp'];
  return { w: 300, h: 410, body: b, edge: true, anchors };
};

// ── Photosynthesis ──

/** A simple leaf outline (pointing up), its midrib and a few veins; returns the outline path for clipping. */
function leaf(cx: number, cy: number, w: number, h: number) {
  const top: Pt = [cx, cy - h / 2], bot: Pt = [cx, cy + h / 2];
  const d = `M${n(bot[0])},${n(bot[1])} C${n(cx - w * 0.75)},${n(cy + h * 0.2)} ${n(cx - w * 0.55)},${n(cy - h * 0.35)} ${n(top[0])},${n(top[1])} C${n(cx + w * 0.55)},${n(cy - h * 0.35)} ${n(cx + w * 0.75)},${n(cy + h * 0.2)} ${n(bot[0])},${n(bot[1])} Z`;
  let veins = path(`M${n(cx)},${n(bot[1] + 26)} L${n(cx)},${n(bot[1])} L${n(cx)},${n(top[1] + 8)}`, { width: 1.4 });
  for (let k = 0.2; k < 0.9; k += 0.17) {
    const y = bot[1] - h * k, s = w * 0.36 * Math.sin(Math.PI * Math.min(1, k * 1.2));
    veins += path(`M${n(cx)},${n(y)} Q${n(cx - s * 0.6)},${n(y - 8)} ${n(cx - s)},${n(y - 20)} M${n(cx)},${n(y)} Q${n(cx + s * 0.6)},${n(y - 8)} ${n(cx + s)},${n(y - 20)}`, { width: 0.7 });
  }
  return { d, veins };
}

export const photosynthesis: Drawer = ({ id, variant }): Drawn => {
  if (variant === 'variegated-leaf' || variant === 'foil-leaf') {
    const foil = variant === 'foil-leaf';
    let b = '';
    const one = (cx: number, after: boolean) => {
      const L = leaf(cx, 150, 150, 220);
      const clip = `${id}-lf${after ? 'a' : 'b'}`;
      let g = `<clipPath id="${clip}"><path d="${L.d}"/></clipPath>`;
      // Before: green (grey) with white edges (variegated), or green with a foil strip across.
      // After the iodine test: blue-black (black hatch) where starch was made, brown (dots) where it was not.
      const made = after ? '#3c3c3c' : '#a9a9a9';
      const noStarch = (shape: string) => `<g clip-path="url(#${clip})">${shape.replace('FILL', '#fff')}${after ? shape.replace('FILL', fill(id, 'dots')) : ''}</g>`;
      g += `<path d="${L.d}" fill="${made}"/>`;
      if (foil) g += noStarch(`<rect x="${cx - 90}" y="122" width="180" height="46" fill="FILL"/>`);
      else g += noStarch(`<path d="${L.d}" fill="none" stroke="FILL" stroke-width="44"/>`);
      g += `<path d="${L.d}" fill="none" stroke="${INK}" stroke-width="1.6"/>` + L.veins;
      if (foil && !after) g += `<rect x="${cx - 86}" y="122" width="172" height="46" fill="url(#${id}-hatch)" stroke="${INK}" stroke-width="1.4" opacity="0.9"/>` + path(`M${cx - 86},122 L${cx - 86},168 M${cx + 86},122 L${cx + 86},168`, { width: 3 });
      return g;
    };
    b += one(110, false) + one(330, true);
    b += words(110, 300, foil ? 'Leaf partly covered with foil' : 'Variegated leaf at the start', { size: 11.5, bold: true }) + words(110, 314, foil ? '(on a destarched plant, left in light)' : '(green and white parts)', { size: 10 });
    b += words(330, 300, 'After testing with iodine', { size: 11.5, bold: true }) + words(330, 314, '(blue-black: starch; brown: no starch)', { size: 10 });
    b += path('M196,150 L244,150', { width: 1.6, arrow: `${id}-arr` });
    return { w: 440, h: 322, body: b, edge: true, anchors: foil ? {
      foil: { x: 50, y: 145, side: 'l' }, 'uncovered-part': { x: 110, y: 214, side: 'l' }, 'blue-black': { x: 330, y: 214, side: 'r' }, brown: { x: 380, y: 145, side: 'r' },
    } : {
      'green-part': { x: 110, y: 200, side: 'l' }, 'white-part': { x: 52, y: 172, side: 'l' }, 'blue-black': { x: 330, y: 200, side: 'r' }, brown: { x: 392, y: 172, side: 'r' },
    } };
  }
  // Pondweed in light gives off bubbles of oxygen, collected in an inverted test tube.
  let b = beaker(150, 120, 200, 210, 186, '#ececec');
  // Lamp shining on the beaker from the left, with a metre rule for its distance.
  b += `<path d="M30,180 L70,166 L70,234 L30,220 Z" fill="#fff" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>` + circle(76, 200, 12, { fill: '#fff', width: 1.5 });
  b += path('M50,234 L50,330 M24,330 L78,330', { width: 2 });
  for (const dy of [-22, 0, 22]) b += path(`M92,${200 + dy} L140,${200 + dy * 1.2}`, { width: 1, dash: '6 3', arrow: `${id}-arr` });
  b += path('M76,350 L150,350', { width: 1, arrow: `${id}-arr`, both: true }) + words(113, 366, 'distance d', { size: 10.5, italic: true });
  // Inverted funnel over the pondweed, raised on small supports; test tube full of water over its stem.
  b += `<path d="M196,312 L232,256 L232,182 M304,312 L268,256 L268,182" fill="none" stroke="${INK}" stroke-width="1.6"/>`;
  b += roundRect(188, 312, 14, 12, 1, { fill: '#555', width: 1 }) + roundRect(298, 312, 14, 12, 1, { fill: '#555', width: 1 });
  b += `<path d="M224,190 L224,64 Q224,54 250,54 Q276,54 276,64 L276,190" fill="#ececec" stroke="${INK}" stroke-width="1.6"/>`;
  b += `<path d="M226,90 L226,66 Q226,56 250,56 Q274,56 274,66 L274,90 Z" fill="#fff"/>` + path('M226,90 L274,90', { width: 0.9 });
  // Elodea: a stem with whorls of small leaves, cut end at the top giving off bubbles.
  b += curve([[248, 318], [252, 286], [246, 250], [250, 216]], 1.8);
  for (const [y, s] of [[300, 1], [282, -1], [264, 1], [246, -1], [228, 1]] as const) for (const k of [-1, 1]) b += ellipse(250 + k * 9, y + (s * k > 0 ? -2 : 2), 9, 3, { fill: '#fff', width: 1, rot: k * 28 });
  for (const [x, y, r] of [[250, 206, 2.6], [252, 188, 2.2], [248, 168, 2.8], [251, 146, 2.2], [249, 124, 2.6], [251, 104, 2.2]] as const) b += circle(x, y, r, { width: 0.9 });
  return { w: 360, h: 372, body: b, edge: true, anchors: {
    lamp: { x: 50, y: 190, side: 'l' }, beaker: { x: 152, y: 260, side: 'l' }, water: { x: 176, y: 220, side: 'l' }, funnel: { x: 210, y: 290, side: 'l' },
    oxygen: { x: 266, y: 72, side: 'r' }, 'test-tube': { x: 276, y: 130, side: 'r' }, bubbles: { x: 252, y: 146, side: 'r' }, pondweed: { x: 260, y: 282, side: 'r' },
  } };
};

// ── Food test in a boiling water bath (Benedict's test for reducing sugar) ──
export const foodTest: Drawer = ({ id }): Drawn => {
  // Tripod and gauze over a Bunsen burner; a beaker of water heated on it; a test tube standing in the water.
  let b = path('M110,300 L96,392 M290,300 L304,392 M200,300 L200,392', { width: 2.4 }) + path('M92,300 L308,300', { width: 3 });
  b += `<path d="M96,296 L304,296" stroke="${INK}" stroke-width="5" stroke-dasharray="2 2"/>`;
  b += beaker(120, 140, 160, 156, 116, '#ececec');
  // Bubbles in the boiling water.
  for (const [x, y] of [[140, 280], [160, 262], [252, 276], [266, 252], [146, 236], [258, 224], [236, 284]] as const) b += circle(x, y, 2.6, { width: 0.8 });
  // Test tube: the food solution with Benedict's solution; a thermometer beside it.
  b += `<path d="M184,100 L184,262 Q184,282 200,282 Q216,282 216,262 L216,100" fill="#fff" stroke="${INK}" stroke-width="1.5"/>`;
  b += `<path d="M186,206 L186,262 Q186,280 200,280 Q214,280 214,262 L214,206 Z" fill="${fill(id, 'dots')}"/>` + path('M186,206 L214,206', { width: 0.9 });
  b += path('M180,100 L220,100', { width: 2 });
  b += roundRect(236, 70, 8, 196, 4, { width: 1.3 }) + circle(240, 264, 6, { fill: INK, width: 0 }) + path('M240,250 L240,140', { width: 2.2 });
  for (let y = 90; y <= 240; y += 15) b += path(`M236,${y} L240,${y}`, { width: 0.8 });
  // Bunsen burner and flame.
  b += roundRect(186, 330, 28, 62, 2, { width: 1.5 }) + roundRect(160, 388, 80, 10, 2, { fill: '#555', width: 1 });
  b += `<path d="M200,326 Q186,312 194,300 Q198,316 202,306 Q206,316 210,300 Q216,312 200,326 Z" fill="#fff" stroke="${INK}" stroke-width="1.3"/>`;
  return { w: 360, h: 400, body: b, edge: true, anchors: {
    'test-tube': { x: 186, y: 140, side: 'l' }, 'food-solution': { x: 196, y: 250, side: 'l' }, 'water-bath': { x: 134, y: 214, side: 'l' }, tripod: { x: 102, y: 352, side: 'l' },
    thermometer: { x: 244, y: 120, side: 'r' }, beaker: { x: 280, y: 200, side: 'r' }, gauze: { x: 286, y: 296, side: 'r' }, 'bunsen-burner': { x: 214, y: 360, side: 'r' },
  } };
};
