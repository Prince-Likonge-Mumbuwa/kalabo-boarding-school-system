// @/components/ai/figures/render/scenes/human1.ts — the human body, part 1:
// heart and circulation, digestion and teeth, breathing, kidney and
// nephron. Drawn as O Level textbook diagrams (front views with the
// person's left on the reader's right).
import { INK, n } from '../svg';
import { fill, path, words, type Drawer, type Drawn } from './kit';
import { blob, circle, curve, ellipse, roundRect, tube, type Pt } from './biokit';

const ar = (id: string) => `${id}-arr`;

// ── Heart (longitudinal section, front view) ──
// The person's right is on the reader's left. Thin-walled right ventricle,
// thick left ventricle and septum; the four valves; the four main vessels
// with arrows for the direction of blood.
export const heart: Drawer = ({ id }): Drawn => {
  const muscle = fill(id, 'sand');
  // Veins behind the heart first, so the heart wall covers their ends.
  let b = tube([[124, 6], [124, 70], [126, 140]], 30);                        // superior vena cava, into the right atrium
  b += tube([[36, 330], [70, 282], [112, 214]], 28);                          // inferior vena cava, from below
  b += tube([[444, 170], [400, 168], [336, 172]], 16) + tube([[444, 208], [400, 206], [336, 200]], 16); // pulmonary veins
  // The heart: muscle stippled, chambers white.
  const outer: Pt[] = [[90, 150], [110, 122], [160, 112], [214, 120], [276, 114], [336, 124], [366, 164], [366, 236], [338, 306], [282, 370], [232, 408], [198, 392], [136, 330], [98, 262], [84, 200]];
  b += blob(outer, muscle, 2);
  const RA: Pt[] = [[104, 156], [116, 132], [140, 126], [162, 140], [166, 180], [156, 208], [124, 212], [104, 192]];
  const LA: Pt[] = [[276, 150], [296, 134], [328, 138], [348, 166], [344, 200], [318, 212], [282, 208], [272, 180]];
  const RV: Pt[] = [[108, 238], [156, 230], [202, 236], [204, 292], [210, 348], [186, 346], [144, 300], [112, 266]];
  const LV: Pt[] = [[242, 240], [290, 234], [324, 250], [320, 300], [282, 350], [240, 380], [230, 330], [234, 282]];
  for (const c of [RA, LA, RV, LV]) b += blob(c, '#fff', 1.3);
  // Each atrium opens into its ventricle through a valve.
  const opening = (x1: number, y1: number, x2: number, y2: number, w: number) =>
    `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="#fff" stroke-width="${n(w)}" stroke-linecap="butt"/>`;
  b += opening(134, 200, 134, 244, 46) + opening(308, 200, 308, 246, 50);
  // Veins open into the atria.
  b += opening(126, 116, 126, 144, 28) + opening(98, 230, 114, 204, 26) + opening(328, 172, 352, 172, 14) + opening(328, 200, 352, 200, 14);
  // Aorta: out of the left ventricle, up between the atria, arching over to the body.
  b += tube([[256, 228], [256, 170], [258, 96], [278, 50], [324, 30], [372, 42], [394, 78], [396, 120]], 26);
  b += opening(256, 226, 256, 252, 24);
  // Pulmonary artery: out of the right ventricle, in front of the aorta, to both lungs.
  b += tube([[184, 224], [184, 170], [182, 118], [170, 94], [136, 86], [80, 86], [24, 88]], 22);
  b += tube([[184, 110], [222, 98], [300, 98]], 14);
  b += opening(184, 222, 184, 246, 20);
  // Valves: flaps (thick) held by tendons (thin) to small muscle bumps on the ventricle walls.
  const flap = (x1: number, y1: number, x2: number, y2: number) => path(`M${x1},${y1} Q${(x1 + x2) / 2 + (x2 > x1 ? -4 : 4)},${(y1 + y2) / 2} ${x2},${y2}`, { width: 3.2 });
  const tendon = (x1: number, y1: number, x2: number, y2: number) => path(`M${x1},${y1} L${x2},${y2}`, { width: 0.8 });
  const papilla = (x: number, y: number, rot: number) => ellipse(x, y, 7, 5, { fill: muscle, width: 1.1, rot });
  b += flap(111, 214, 126, 254) + flap(157, 212, 142, 254) + tendon(126, 254, 132, 296) + tendon(142, 254, 156, 298) + papilla(132, 300, 30) + papilla(160, 302, -30);
  b += flap(283, 212, 298, 256) + flap(333, 212, 318, 258) + tendon(298, 256, 286, 302) + tendon(318, 258, 306, 302) + papilla(286, 306, 20) + papilla(308, 306, -20);
  // Semilunar valves: pocket-shaped flaps where the two arteries leave the ventricles.
  b += path('M243,240 Q249,252 256,240 M256,240 Q262,252 269,240', { width: 1.7 });
  b += path('M173,236 Q178,248 184,236 M184,236 Q190,248 195,236', { width: 1.7 });
  // Direction of blood flow.
  const ar = (d: string) => path(d, { width: 1.3, arrow: `${id}-arr` });
  b += ar('M124,16 L124,48') + ar('M46,316 L62,292') + ar('M436,170 L412,169') + ar('M436,208 L412,207');
  b += ar('M396,88 L396,118') + ar('M120,86 L50,87') + ar('M232,98 L276,98') + ar('M256,206 L256,150') + ar('M184,206 L184,150');
  b += ar('M134,178 L134,226') + ar('M308,180 L308,228');
  return { w: 450, h: 412, body: b, edge: true, anchors: {
    'vena-cava': { x: 124, y: 60, side: 'l' }, 'pulmonary-artery': { x: 90, y: 87, side: 'l' }, 'right-atrium': { x: 150, y: 165, side: 'l' },
    'tricuspid-valve': { x: 118, y: 232, side: 'l' }, 'inferior-vena-cava': { x: 66, y: 290, side: 'l' }, tendons: { x: 129, y: 276, side: 'l' }, 'right-ventricle': { x: 176, y: 304, side: 'l' },
    aorta: { x: 340, y: 34, side: 'r' }, 'pulmonary-vein': { x: 380, y: 207, side: 'r' }, 'left-atrium': { x: 330, y: 186, side: 'r' }, 'semilunar-valve': { x: 262, y: 246, side: 'r' },
    'bicuspid-valve': { x: 328, y: 234, side: 'r' }, 'left-ventricle': { x: 268, y: 320, side: 'r' }, septum: { x: 220, y: 330, side: 'r' }, 'muscle-wall': { x: 346, y: 276, side: 'r' },
  } };
};

// ── Double circulation (schematic) ──
export const circulation: Drawer = ({ id }): Drawn => {
  let b = '';
  const box = (x: number, y: number, w: number, h: number, t: string) => roundRect(x, y, w, h, 8) + words(x + w / 2, y + h / 2 + 4, t, { size: 12, bold: true });
  b += box(120, 10, 160, 44, 'Lungs');
  b += roundRect(150, 140, 100, 90, 6, { fill: fill(id, 'sand') });
  b += `<line x1="200" y1="140" x2="200" y2="230" stroke="${INK}" stroke-width="2"/><line x1="150" y1="185" x2="250" y2="185" stroke="${INK}" stroke-width="1"/>`;
  b += words(175, 168, 'RA', { size: 11, bold: true }) + words(225, 168, 'LA', { size: 11, bold: true }) + words(175, 212, 'RV', { size: 11, bold: true }) + words(225, 212, 'LV', { size: 11, bold: true });
  b += box(100, 300, 90, 40, 'Liver') + box(100, 380, 90, 40, 'Gut') + box(230, 340, 90, 40, 'Kidneys') + box(130, 450, 140, 40, 'Rest of body');
  const line = (d: string) => path(d, { width: 1.6, arrow: ar(id) });
  b += line('M170,200 L130,200 L130,35 L118,35') + line('M282,35 L270,35 L270,160 L252,160');
  b += line('M240,232 L240,260 L340,260 L340,470 L272,470') + line('M128,470 L60,470 L60,160 L148,160');
  b += line('M340,300 L250,300 L250,320 L192,320') + line('M145,380 L145,342') + line('M100,320 L60,320');
  b += line('M340,360 L322,360') + line('M230,370 L60,370') + line('M340,400 L192,400');
  return { w: 380, h: 500, body: b, edge: true, anchors: {
    'pulmonary-artery': { x: 130, y: 110, side: 'l' }, 'pulmonary-vein': { x: 270, y: 110, side: 'r' }, aorta: { x: 340, y: 230, side: 'r' },
    'vena-cava': { x: 60, y: 230, side: 'l' }, 'hepatic-artery': { x: 220, y: 300, side: 'r' }, 'hepatic-portal-vein': { x: 145, y: 362, side: 'l' },
    'hepatic-vein': { x: 80, y: 320, side: 'l' }, 'renal-artery': { x: 331, y: 360, side: 'r' }, 'renal-vein': { x: 120, y: 370, side: 'l' },
  } };
};

// ── Digestive system ──
export const digestiveSystem: Drawer = ({ id }): Drawn => {
  let b = '';
  // Head outline with mouth and salivary gland (simple side profile above the tract)
  b += curve([[120, 70], [118, 40], [140, 18], [175, 14], [196, 30], [200, 52], [192, 58], [196, 70], [186, 74], [180, 92], [160, 98]], 1.4);
  b += path('M196,62 L186,62', { width: 1.4 }) + ellipse(170, 70, 9, 6, { fill: fill(id, 'dots'), width: 1 });
  // Large intestine frame (ascending, transverse, descending colon), rectum, anus
  b += tube([[110, 455], [104, 380], [106, 318], [150, 306], [240, 306], [290, 318], [292, 400], [280, 450], [225, 462], [212, 488]], 22);
  b += tube([[212, 480], [212, 512]], 14);
  b += tube([[98, 468], [92, 490], [96, 502]], 7); // appendix
  // Small intestine coils
  b += tube([[196, 290], [200, 330], [170, 340], [140, 336], [140, 360], [250, 360], [255, 382], [140, 382], [140, 405], [250, 405], [252, 428], [180, 432], [130, 438], [118, 452]], 10);
  // Oesophagus, stomach, duodenum
  b += tube([[160, 92], [166, 140], [178, 182]], 12);
  b += blob([[172, 176], [205, 158], [252, 166], [266, 205], [250, 248], [210, 266], [182, 258], [200, 238], [216, 212], [200, 194], [176, 192]], '#fff', 1.6);
  b += tube([[184, 258], [168, 268], [166, 292], [196, 296]], 11);
  // Pancreas
  b += blob([[176, 276], [230, 268], [282, 262], [290, 272], [232, 284], [184, 290]], fill(id, 'dots'), 1.2);
  // Liver over the top of the stomach, gall bladder under it, bile duct to the duodenum
  b += blob([[56, 160], [150, 140], [196, 152], [182, 196], [120, 214], [68, 200]], fill(id, 'sand'), 1.5);
  b += ellipse(138, 220, 10, 14, { fill: '#fff', width: 1.3, rot: -20 }) + path('M144,232 Q156,252 168,272', { width: 1.6 });
  return { w: 340, h: 520, body: b, edge: true, anchors: {
    mouth: { x: 191, y: 62, side: 'r' }, 'salivary-gland': { x: 168, y: 70, side: 'l' }, oesophagus: { x: 164, y: 120, side: 'l' },
    liver: { x: 100, y: 180, side: 'l' }, 'gall-bladder': { x: 132, y: 222, side: 'l' }, 'bile-duct': { x: 158, y: 258, side: 'l' }, duodenum: { x: 167, y: 280, side: 'l' },
    stomach: { x: 240, y: 200, side: 'r' }, pancreas: { x: 270, y: 268, side: 'r' }, 'small-intestine': { x: 250, y: 393, side: 'r' },
    'large-intestine': { x: 292, y: 340, side: 'r' }, appendix: { x: 93, y: 492, side: 'l' }, rectum: { x: 212, y: 495, side: 'r' }, anus: { x: 212, y: 512, side: 'r' },
  } };
};

// ── Tooth (longitudinal section of a molar) ──
export const tooth: Drawer = ({ id, variant }): Drawn => {
  let b = `<rect x="30" y="200" width="240" height="185" fill="${fill(id, 'hatch')}" stroke="${INK}" stroke-width="1"/>`;
  const gum = (s: number) => blob([[150 + s * 110, 150], [150 + s * 52, 158], [150 + s * 46, 176], [150 + s * 44, 205], [150 + s * 110, 205]].map(([x, y]) => [x, y] as Pt), fill(id, 'sand'), 1.2);
  b += gum(-1) + gum(1);
  if (variant === 'incisor') {
    const T: Pt[] = [[125, 40], [150, 30], [175, 40], [185, 120], [180, 180], [172, 260], [160, 335], [150, 350], [140, 335], [128, 260], [120, 180], [115, 120]];
    b += blob(T, fill(id, 'dots'), 1.5);
    b += blob([[126, 38], [150, 28], [174, 38], [184, 120], [181, 165], [168, 165], [170, 120], [162, 52], [138, 52], [130, 120], [132, 165], [119, 165], [116, 120]], '#fff', 1.2);
    b += blob([[144, 80], [156, 80], [160, 170], [156, 260], [150, 330], [144, 260], [140, 170]], '#fff', 1.2);
    b += path('M150,95 L150,335', { width: 0.8, dash: '3 2' });
    return { w: 300, h: 390, body: b, edge: true, anchors: {
      enamel: { x: 178, y: 80, side: 'r' }, dentine: { x: 128, y: 120, side: 'l' }, 'pulp-cavity': { x: 150, y: 140, side: 'r' }, gum: { x: 70, y: 175, side: 'l' },
      cement: { x: 174, y: 250, side: 'r' }, 'jaw-bone': { x: 60, y: 300, side: 'l' }, 'nerves-blood-vessels': { x: 150, y: 300, side: 'r' },
    } };
  }
  const T: Pt[] = [[95, 125], [100, 80], [118, 62], [140, 80], [160, 82], [182, 62], [200, 80], [205, 125], [198, 175], [190, 215], [195, 260], [188, 320], [180, 345], [168, 330], [162, 275], [150, 245], [138, 275], [132, 330], [120, 345], [108, 320], [105, 260], [110, 215], [102, 175]];
  // Cement: a thick outer layer on the roots only (clipped below the gum line)
  b += `<defs><clipPath id="${id}-roots"><rect x="0" y="178" width="300" height="220"/></clipPath></defs><path d="${curvePath(T)}" fill="none" stroke="${INK}" stroke-width="5" clip-path="url(#${id}-roots)"/>`;
  b += blob(T, fill(id, 'dots'), 1.4);
  b += blob([[95, 125], [100, 80], [118, 62], [140, 80], [160, 82], [182, 62], [200, 80], [205, 125], [201, 168], [188, 162], [190, 122], [186, 94], [180, 80], [162, 98], [138, 98], [120, 80], [114, 94], [110, 122], [112, 162], [99, 168]], '#fff', 1.3);
  b += blob([[132, 120], [150, 112], [168, 120], [172, 175], [170, 215], [176, 270], [178, 325], [172, 330], [164, 275], [156, 240], [150, 232], [144, 240], [136, 275], [128, 330], [122, 325], [124, 270], [130, 215], [128, 175]], '#fff', 1.2);
  for (const s of [-1, 1]) b += curve([[150 + s * 6, 140], [150 + s * 10, 210], [150 + s * 22, 280], [150 + s * 26, 335], [150 + s * 28, 360]], 0.9, { dash: '3 2' });
  return { w: 300, h: 390, body: b, edge: true, anchors: {
    enamel: { x: 200, y: 100, side: 'r' }, dentine: { x: 120, y: 140, side: 'l' }, 'pulp-cavity': { x: 158, y: 150, side: 'r' }, gum: { x: 70, y: 175, side: 'l' },
    cement: { x: 194, y: 290, side: 'r' }, 'jaw-bone': { x: 60, y: 300, side: 'l' }, 'nerves-blood-vessels': { x: 171, y: 300, side: 'r' },
    crown: { x: 150, y: 70, side: 'l' }, root: { x: 120, y: 330, side: 'l' },
  } };
};
const curvePath = (pts: Pt[]) => { let s = ''; pts.forEach(([x, y], i) => { s += `${i ? 'L' : 'M'}${n(x)},${n(y)} `; }); return s + 'Z'; };

// ── Respiratory system ──
export const respiratorySystem: Drawer = ({ id }): Drawn => {
  let b = '';
  // Chest wall with ribs (in section) and intercostal muscles
  for (const s of [-1, 1]) {
    for (let k = 0; k < 7; k++) { const y = 110 + k * 38; b += ellipse(210 + s * 168, y, 7, 11, { fill: fill(id, 'hatch'), width: 1.1 }); if (k < 6) b += path(`M${210 + s * 168},${y + 11} L${210 + s * 168},${y + 27}`, { width: 3, color: INK, dash: '2 2' }); }
  }
  // Lungs with pleural membranes
  const R: Pt[] = [[100, 115], [165, 92], [192, 140], [195, 320], [150, 352], [78, 365], [60, 300], [64, 180]];
  const L: Pt[] = R.map(([x, y]) => [420 - x, y] as Pt);
  L[3] = [222, 250]; L[4] = [255, 300];
  for (const lung of [R, L]) { b += blob(lung.map(([x, y]) => [210 + (x - 210) * 1.03, 230 + (y - 230) * 1.03] as Pt), '#fff', 0.9); b += blob(lung, fill(id, 'sand'), 1.3); }
  b += curve([[66, 210], [130, 220], [190, 180]], 1) + curve([[64, 290], [140, 270], [195, 300]], 1) + curve([[355, 230], [290, 240], [230, 200]], 1);
  // Trachea with cartilage rings, larynx, bronchi and bronchioles
  b += tube([[210, 20], [210, 170]], 26);
  for (let y = 40; y < 168; y += 10) b += path(`M199,${y} Q210,${y + 3} 221,${y}`, { width: 2 });
  b += roundRect(193, 8, 34, 28, 6, { width: 1.5 });
  b += tube([[210, 168], [178, 186], [150, 215]], 16) + tube([[210, 168], [242, 186], [270, 215]], 16);
  const branch = (x: number, y: number, dx: number, depth: number, len: number): string => {
    if (!depth) return '';
    const x1 = x + dx * len * 0.7, y1 = y + len;
    return path(`M${n(x)},${n(y)} L${n(x1)},${n(y1)}`, { width: depth * 1.1 }) + branch(x1, y1, dx * 1.3, depth - 1, len * 0.7) + branch(x1, y1, -dx * 0.4, depth - 1, len * 0.7);
  };
  b += branch(150, 215, -0.6, 4, 50) + branch(270, 215, 0.6, 4, 50);
  b += `<path d="M40,395 C100,345 165,352 210,372 C255,352 320,345 380,395" fill="none" stroke="${INK}" stroke-width="3"/>`;
  return { w: 420, h: 405, body: b, edge: true, anchors: {
    larynx: { x: 227, y: 22, side: 'r' }, trachea: { x: 221, y: 100, side: 'r' }, 'cartilage-ring': { x: 199, y: 80, side: 'l' },
    bronchus: { x: 244, y: 190, side: 'r' }, bronchiole: { x: 310, y: 300, side: 'r' }, lung: { x: 100, y: 250, side: 'l' }, 'pleural-membrane': { x: 64, y: 165, side: 'l' },
    rib: { x: 35, y: 224, side: 'l' }, 'intercostal-muscle': { x: 42, y: 243, side: 'l' }, diaphragm: { x: 120, y: 357, side: 'l' },
  } };
};

// ── Alveolus and capillary (gaseous exchange) ──
export const alveolus: Drawer = ({ id }): Drawn => {
  let b = circle(170, 140, 100, { width: 2 }) + circle(170, 140, 94, { width: 0.8, dash: '3 3', fill: 'none' });
  b += tube([[40, 260], [160, 252], [262, 210], [300, 120], [280, 40]], 26, { fill: '#fff' });
  for (const [x, y] of [[90, 257], [150, 254], [215, 238], [262, 190], [292, 130], [290, 70]] as const) b += ellipse(x, y, 8, 5, { fill: fill(id, 'sand'), width: 1 });
  b += words(150, 120, 'air', { size: 13, italic: true });
  b += path('M150,165 L190,210', { width: 1.4, arrow: ar(id) }) + words(150, 183, 'O₂', { size: 12, bold: true, anchor: 'end' });
  b += path('M250,175 L215,150', { width: 1.4, arrow: ar(id) }) + words(250, 150, 'CO₂', { size: 12, bold: true });
  b += path('M60,275 L40,275', { width: 1.2, arrow: ar(id) });
  return { w: 330, h: 290, body: b, edge: true, anchors: {
    alveolus: { x: 120, y: 90, side: 'l' }, 'alveolar-wall': { x: 72, y: 130, side: 'l' }, 'moisture-film': { x: 80, y: 170, side: 'l' },
    capillary: { x: 300, y: 120, side: 'r' }, 'red-blood-cell': { x: 292, y: 130, side: 'r' }, oxygen: { x: 170, y: 188, side: 'l' }, 'carbon-dioxide': { x: 232, y: 162, side: 'r' },
  } };
};

// ── Kidney ──
function kidneyShape(cx: number, cy: number, s: number, flip = false): Pt[] {
  const k: Pt[] = [[0, -150], [70, -135], [100, -90], [90, -40], [62, -10], [90, 35], [100, 85], [65, 140], [0, 160], [-70, 130], [-100, 70], [-105, 0], [-95, -70], [-60, -125]];
  return k.map(([x, y]) => [cx + (flip ? -x : x) * s, cy + y * s] as Pt);
}
export const kidney: Drawer = ({ id, variant }): Drawn => {
  if (variant === 'urinary-system') {
    let b = tube([[195, 20], [195, 330]], 20) + tube([[228, 20], [228, 330]], 22);
    b += tube([[195, 118], [140, 118]], 9) + tube([[195, 118], [290, 118]], 9) + tube([[228, 152], [140, 152]], 10) + tube([[228, 152], [290, 152]], 10);
    b += blob(kidneyShape(95, 140, 0.55, true), fill(id, 'sand'), 1.5) + blob(kidneyShape(330, 140, 0.55), fill(id, 'sand'), 1.5);
    b += tube([[122, 160], [150, 230], [190, 330]], 7) + tube([[302, 160], [270, 230], [232, 330]], 7);
    b += blob([[160, 330], [212, 312], [262, 330], [262, 372], [212, 392], [160, 372]], '#fff', 1.6);
    b += tube([[212, 390], [212, 425]], 8);
    return { w: 420, h: 430, body: b, edge: true, anchors: {
      kidney: { x: 60, y: 140, side: 'l' }, ureter: { x: 150, y: 232, side: 'l' }, bladder: { x: 175, y: 360, side: 'l' }, urethra: { x: 212, y: 412, side: 'l' },
      aorta: { x: 195, y: 60, side: 'l' }, 'vena-cava': { x: 228, y: 60, side: 'r' }, 'renal-artery': { x: 270, y: 118, side: 'r' }, 'renal-vein': { x: 270, y: 152, side: 'r' },
    } };
  }
  const cx = 190, cy = 185;
  let b = tube([[255, 158], [330, 146], [420, 140]], 14) + tube([[258, 178], [330, 176], [420, 178]], 16) + tube([[262, 198], [300, 240], [312, 330], [318, 380]], 12);
  b += blob(kidneyShape(cx, cy, 1), fill(id, 'dots'), 1.8);
  // Medulla: pyramids pointing to the pelvis
  for (const deg of [-125, -90, -55, 125, 90, 55, 180, 155, -155]) {
    const a = (deg * Math.PI) / 180, bx = cx - 10 + 70 * Math.cos(a) * 1.05, by = cy + 100 * Math.sin(a) * 0.95;
    const tipx = cx + 18 + 30 * Math.cos(a) * 0.6, tipy = cy + 40 * Math.sin(a) * 0.6;
    const px = -Math.sin(a) * 18, py = Math.cos(a) * 18;
    b += `<path d="M${n(bx + px)},${n(by + py)} L${n(tipx)},${n(tipy)} L${n(bx - px)},${n(by - py)} Q${n(bx + Math.cos(a) * 6)},${n(by + Math.sin(a) * 6)} ${n(bx + px)},${n(by + py)} Z" fill="${fill(id, 'vlines')}" stroke="${INK}" stroke-width="1"/>`;
  }
  b += blob([[cx + 5, cy - 50], [cx + 45, cy - 30], [cx + 72, cy - 8], [cx + 74, cy + 12], [cx + 45, cy + 30], [cx + 5, cy + 50], [cx + 22, cy]], '#fff', 1.3);
  return { w: 420, h: 390, body: b, edge: true, anchors: {
    cortex: { x: cx - 92, y: cy + 10, side: 'l' }, medulla: { x: cx - 50, y: cy - 60, side: 'l' }, pyramid: { x: cx - 45, y: cy + 70, side: 'l' }, pelvis: { x: cx + 40, y: cy, side: 'l' },
    'renal-artery': { x: 360, y: 143, side: 'r' }, 'renal-vein': { x: 360, y: 177, side: 'r' }, ureter: { x: 310, y: 300, side: 'r' }, capsule: { x: cx + 70, y: cy - 135, side: 'r' },
  } };
};

// ── Nephron ──
export const nephron: Drawer = ({ id }): Drawn => {
  let b = `<line x1="10" y1="190" x2="430" y2="190" stroke="${INK}" stroke-width="0.8" stroke-dasharray="6 4"/>`;
  b += words(20, 182, 'cortex', { size: 10, italic: true, anchor: 'start' }) + words(20, 206, 'medulla', { size: 10, italic: true, anchor: 'start' });
  b += tube([[360, 20], [360, 410]], 14); // collecting duct
  // Proximal convoluted tubule → loop of Henle → distal convoluted tubule → collecting duct
  b += tube([[110, 112], [150, 120], [160, 90], [190, 110], [175, 140], [210, 150], [215, 175], [210, 260], [210, 360], [225, 385], [245, 360], [245, 250], [250, 170], [270, 140], [300, 150], [290, 110], [320, 95], [355, 100]], 9);
  // Bowman's capsule round the glomerulus
  b += `<path d="M110,112 C110,70 40,60 40,100 C40,140 100,150 110,128" fill="#fff" stroke="${INK}" stroke-width="5"/><path d="M110,112 C110,70 40,60 40,100 C40,140 100,150 110,128" fill="#fff" stroke="#fff" stroke-width="2.4"/>`;
  b += curve([[60, 90], [75, 80], [85, 95], [70, 108], [62, 98], [80, 110], [92, 98], [80, 88]], 2.4);
  b += tube([[20, 40], [55, 72], [68, 86]], 8) + tube([[88, 96], [110, 60], [150, 40]], 5);
  for (let t = 0; t < 6; t++) b += curve([[150 + t * 6, 40 + t * 25], [205 + t * 3, 120 + t * 28], [240 - t * 2, 180 + t * 30]], 0.7, { dash: '3 3' });
  b += path('M360,385 L360,405', { width: 1.2, arrow: ar(id) });
  return { w: 440, h: 420, body: b, edge: true, anchors: {
    'afferent-arteriole': { x: 35, y: 55, side: 'l' }, glomerulus: { x: 75, y: 95, side: 'l' }, 'bowmans-capsule': { x: 45, y: 125, side: 'l' },
    'efferent-arteriole': { x: 125, y: 50, side: 'r' }, 'proximal-tubule': { x: 178, y: 128, side: 'r' }, 'loop-of-henle': { x: 228, y: 384, side: 'r' },
    'distal-tubule': { x: 300, y: 140, side: 'r' }, 'collecting-duct': { x: 367, y: 260, side: 'r' }, capillary: { x: 205, y: 120, side: 'l' },
  } };
};

