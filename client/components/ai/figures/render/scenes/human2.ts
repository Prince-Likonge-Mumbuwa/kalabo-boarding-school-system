// @/components/ai/figures/render/scenes/human2.ts — the human body, part 2:
// sense organs (eye, ear), brain, skin, endocrine glands, reproduction,
// skeleton and muscles, nerves (reflex arc, neurones).
import { INK, n } from '../svg';
import { fill, path, words, type Anchor, type Drawer, type Drawn } from './kit';
import { blob, circle, curve, ellipse, nucleus, roundRect, tube, type Pt } from './biokit';

const ar = (id: string) => `${id}-arr`;
const P = (cx: number, cy: number, r: number, deg: number): Pt => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];

// ── Eye (horizontal section, light enters from the left) ──
export const eye: Drawer = ({ id }): Drawn => {
  const cx = 230, cy = 180, R = 130;
  let b = '';
  const [ax, ay] = P(cx, cy, R, 215), [bx, by] = P(cx, cy, R, 145);
  // Optic nerve
  b += tube([[352, 205], [390, 210], [432, 214]], 24);
  // Sclera, choroid, retina
  b += `<path d="M${n(ax)},${n(ay)} A${R},${R} 0 1 1 ${n(bx)},${n(by)} Q${33},${cy} ${n(ax)},${n(ay)} Z" fill="#fff" stroke="${INK}" stroke-width="2.4"/>`;
  const arc = (r: number, a0: number, a1: number, w: number, extra = '') => { const [x0, y0] = P(cx, cy, r, a0), [x1, y1] = P(cx, cy, r, a1); return `<path d="M${n(x0)},${n(y0)} A${r},${r} 0 1 1 ${n(x1)},${n(y1)}" fill="none" stroke="${INK}" stroke-width="${w}"${extra}/>`; };
  b += arc(124, 222, 138, 1.1) + arc(117, 228, 132, 2.2, ' stroke-dasharray="1 0"');
  // Fovea dip and blind spot gap where the nerve leaves
  b += `<path d="M${n(cx + 117)},${n(cy - 8)} Q${n(cx + 110)},${cy} ${n(cx + 117)},${n(cy + 8)}" fill="#fff" stroke="${INK}" stroke-width="1.6"/>`;
  b += path(`M${cx + 118},${cy + 16} L${cx + 132},${cy + 18} M${cx + 118},${cy + 34} L${cx + 132},${cy + 37}`, { width: 1.2 }) + `<rect x="${cx + 114}" y="${cy + 18}" width="14" height="15" fill="#fff"/>`;
  // Conjunctiva over the cornea
  b += `<path d="M${n(ax - 4)},${n(ay - 3)} Q${28},${cy} ${n(bx - 4)},${n(by + 3)}" fill="none" stroke="${INK}" stroke-width="0.8"/>`;
  // Ciliary body, suspensory ligaments, lens, iris
  b += ellipse(130, 117, 14, 9, { fill: fill(id, 'sand'), rot: 30 }) + ellipse(130, 243, 14, 9, { fill: fill(id, 'sand'), rot: -30 });
  for (const s of [-1, 1]) for (const k of [0, 6, 12]) b += path(`M${136},${cy + s * (55 - k * 0.3)} L${148 + k * 0.4},${cy + s * (36 - k)}`, { width: 0.7 });
  b += ellipse(152, cy, 17, 43, { fill: '#fff', width: 1.6 });
  b += path(`M120,${cy - 58} L120,${cy - 20} M120,${cy + 20} L120,${cy + 58}`, { width: 5 });
  const at = (r: number, deg: number): Anchor => { const [x, y] = P(cx, cy, r, deg); return { x, y, side: 'r' }; };
  return { w: 440, h: 360, body: b, edge: true, anchors: {
    conjunctiva: { x: 46, y: 160, side: 'l' }, cornea: { x: 79, y: 196, side: 'l' }, 'aqueous-humour': { x: 100, y: 222, side: 'l' }, iris: { x: 120, y: 132, side: 'l' }, pupil: { x: 120, y: cy, side: 'l' },
    'ciliary-muscle': { x: 130, y: 243, side: 'l' }, 'suspensory-ligament': { x: 141, y: 136, side: 'l' }, lens: { x: 156, y: 160, side: 'r' },
    'vitreous-humour': { x: 250, y: 250, side: 'r' }, retina: at(117, -62), choroid: at(124, -45), sclera: at(130, -28),
    fovea: { x: cx + 113, y: cy, side: 'r' }, 'blind-spot': { x: cx + 120, y: cy + 25, side: 'r' }, 'optic-nerve': { x: 410, y: 212, side: 'r' },
  } };
};

// ── Ear ──
export const ear: Drawer = ({ id }): Drawn => {
  // Skull bone (stippled) around the canal, middle ear and inner ear; the pinna outside it.
  let b = blob([[150, 70], [250, 48], [360, 40], [460, 62], [492, 150], [470, 250], [380, 300], [300, 316], [240, 290], [196, 238], [150, 200]], fill(id, 'sand'), 1);
  // Pinna: the outer rim (helix), an inner fold and the lobe, around the opening of the canal.
  b += blob([[72, 40], [108, 30], [132, 60], [134, 112], [128, 150], [136, 178], [124, 222], [104, 262], [80, 276], [62, 254], [70, 214], [54, 168], [44, 112], [48, 66]], '#fff', 1.7);
  b += curve([[66, 72], [92, 56], [114, 74], [116, 118], [104, 148]], 1.1) + curve([[84, 104], [100, 96], [104, 124]], 0.9);
  // Auditory canal to the eardrum.
  b += tube([[118, 160], [160, 158], [206, 160]], 30);
  // Middle ear: an air-filled cavity, with the Eustachian tube leading down to the throat.
  b += blob([[210, 116], [246, 98], [284, 104], [300, 140], [298, 186], [270, 212], [228, 214], [208, 190]], '#fff', 1.3);
  b += tube([[256, 206], [284, 252], [318, 316]], 14);
  b += `<line x1="256" y1="200" x2="262" y2="214" stroke="#fff" stroke-width="13"/>`;
  // Eardrum: a thin membrane across the end of the canal, bulging slightly inwards.
  b += path('M204,140 Q214,160 206,180', { width: 3 });
  // The three ossicles from the eardrum to the oval window: malleus (hammer), incus (anvil), stapes (stirrup).
  b += path('M212,172 L223,132', { width: 4.5 }) + circle(225, 126, 7.5, { fill: INK, width: 0 });                                   // malleus
  b += `<path d="M236,118 L250,113 L258,124 L254,150 L247,150 L245,131 L236,128 Z" fill="${INK}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>`; // incus
  b += path('M254,152 L266,142 L276,142 M254,152 L266,162 L276,162', { width: 2.4 }) + path('M278,139 L278,165', { width: 4.5 }); // stapes
  // Inner ear (cavities in the bone): vestibule, three semicircular canals, cochlea; the auditory nerve leaves it.
  const canal = (cx: number, cy: number, rx: number, ry: number, rot: number) =>
    `<g transform="rotate(${rot} ${cx} ${cy})">${ellipse(cx, cy, rx, ry, { fill: 'none', width: 7.5 })}${ellipse(cx, cy, rx, ry, { fill: 'none', width: 4.5 }).replace(`stroke="${INK}"`, 'stroke="#fff"')}</g>`;
  b += canal(318, 96, 26, 15, 0) + canal(352, 90, 24, 13, 70) + canal(344, 118, 22, 11, -30);
  b += blob([[280, 132], [312, 116], [336, 130], [338, 162], [314, 182], [282, 176]], '#fff', 1.3);
  // Oval window (stapes sits in it) and round window, in the wall between the middle and inner ear.
  b += ellipse(279, 151, 3.5, 11, { fill: '#fff', width: 1.6 }) + ellipse(290, 190, 4, 6, { fill: '#fff', width: 1.6 });
  // Cochlea: a coiled tube (two and a half turns).
  const spiral: Pt[] = [];
  for (let t = 0; t <= 2.6 * Math.PI * 2; t += 0.25) { const r = 42 - t * 2.2; spiral.push([370 + r * Math.cos(t + Math.PI), 226 + r * 0.82 * Math.sin(t + Math.PI)]); }
  const sp = spiral.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)},${n(y)}`).join(' ');
  b += tube([[312, 178], [322, 206], [330, 226]], 12);
  b += `<path d="${sp}" fill="none" stroke="${INK}" stroke-width="12" stroke-linejoin="round"/><path d="${sp}" fill="none" stroke="#fff" stroke-width="8.6" stroke-linejoin="round"/>`;
  // Auditory nerve: from the cochlea and vestibule towards the brain.
  b += tube([[384, 214], [420, 186], [488, 172]], 12) + curve([[338, 150], [372, 160], [404, 192]], 4);
  return { w: 500, h: 322, body: b, edge: true, anchors: {
    pinna: { x: 60, y: 200, side: 'l' }, 'auditory-canal': { x: 160, y: 158, side: 'l' }, eardrum: { x: 208, y: 175, side: 'l' }, 'eustachian-tube': { x: 296, y: 276, side: 'l' },
    malleus: { x: 225, y: 126, side: 'l' }, incus: { x: 250, y: 122, side: 'r' }, stapes: { x: 266, y: 162, side: 'r' }, 'oval-window': { x: 279, y: 146, side: 'r' },
    'round-window': { x: 290, y: 190, side: 'r' }, 'semicircular-canals': { x: 318, y: 81, side: 'r' }, cochlea: { x: 384, y: 236, side: 'r' }, 'auditory-nerve': { x: 452, y: 178, side: 'r' },
  } };
};

// ── Brain (median section, front to the left) ──
export const brain: Drawer = ({ id }): Drawn => {
  let b = '';
  b += tube([[240, 270], [240, 320], [241, 360]], 20);
  b += blob([[220, 212], [262, 212], [270, 250], [258, 280], [224, 280], [212, 250]], fill(id, 'sand'), 1.4);
  const cb: Pt[] = [[278, 222], [330, 206], [375, 220], [384, 256], [352, 288], [300, 292], [268, 266]];
  b += blob(cb, '#fff', 1.6);
  for (const k of [0, 1, 2, 3, 4]) b += curve([[300, 250], [325 + k * 4, 222 + k * 13], [372 - k * 2, 228 + k * 14]], 0.8);
  const cerebrum: Pt[] = [[55, 205], [58, 130], [98, 68], [170, 38], [255, 34], [325, 55], [372, 102], [386, 160], [370, 208], [320, 208], [270, 214], [230, 210], [192, 210], [165, 218], [112, 216]];
  b += blob(cerebrum, '#fff', 1.8);
  for (const [pts] of [[[[90, 110], [130, 90], [150, 120], [185, 85]]], [[[210, 60], [235, 90], [270, 70], [300, 100]]], [[[320, 110], [345, 140], [330, 175], [360, 190]]], [[[80, 160], [110, 150], [118, 185], [150, 175]]]] as const) b += curve(pts as unknown as Pt[], 1);
  b += `<path d="M135,152 C150,104 262,98 302,142 C300,152 292,154 288,152 C255,120 168,122 150,157 Z" fill="${fill(id, 'sand')}" stroke="${INK}" stroke-width="1.2"/>`;
  b += ellipse(205, 185, 22, 16, { fill: fill(id, 'dots'), width: 1 });
  b += path('M190,206 L183,232', { width: 2 }) + ellipse(180, 240, 9, 7, { fill: INK, width: 0 });
  return { w: 420, h: 370, body: b, edge: true, anchors: {
    cerebrum: { x: 120, y: 100, side: 'l' }, 'corpus-callosum': { x: 220, y: 116, side: 'r' }, thalamus: { x: 210, y: 180, side: 'r' }, hypothalamus: { x: 192, y: 200, side: 'l' },
    'pituitary-gland': { x: 180, y: 240, side: 'l' }, cerebellum: { x: 345, y: 262, side: 'r' }, pons: { x: 252, y: 240, side: 'r' },
    'medulla-oblongata': { x: 248, y: 300, side: 'r' }, 'spinal-cord': { x: 241, y: 350, side: 'r' },
  } };
};

// ── Skin (section) ──
export const skin: Drawer = ({ id }): Drawn => {
  let b = `<rect x="20" y="250" width="420" height="90" fill="#fff" stroke="none"/>`;
  for (let x = 40; x < 440; x += 34) for (let y = 270; y < 335; y += 28) b += ellipse(x + ((y / 28) % 2) * 15, y, 15, 12, { width: 0.8 });
  b += `<rect x="20" y="40" width="420" height="40" fill="${fill(id, 'sand')}" stroke="none"/><rect x="20" y="30" width="420" height="12" fill="${fill(id, 'hatch')}" stroke="none"/>`;
  b += path('M20,30 L440,30', { width: 1.6 }) + path('M20,42 L440,42', { width: 0.8 }) + path('M20,80 Q120,90 220,78 T440,80', { width: 1.2 }) + path('M20,250 L440,250', { width: 1, dash: '5 3' });
  // Hair in its follicle with sebaceous gland and erector muscle
  b += `<path d="M115,82 L150,215 L182,215 L148,82" fill="#fff" stroke="${INK}" stroke-width="1.3"/>`;
  b += path('M140,212 L100,20', { width: 4.5 }) + blob([[160, 222], [170, 205], [178, 222], [170, 232]], fill(id, 'sand'), 1.2);
  b += blob([[160, 125], [190, 118], [200, 140], [184, 156], [162, 150]], fill(id, 'dots'), 1.2);
  b += path('M176,190 C200,170 225,130 238,82', { width: 3, dash: '2 1.5' });
  // Sweat gland, duct and pore
  b += curve([[300, 30], [306, 60], [296, 100], [310, 150], [300, 200], [315, 222]], 1.6);
  b += curve([[296, 30], [302, 60], [292, 100], [306, 150], [296, 200], [306, 222]], 1);
  b += curve([[306, 222], [330, 216], [338, 236], [318, 244], [300, 236], [314, 226], [332, 230], [322, 240]], 2.2);
  // Blood capillaries under the epidermis and a nerve ending
  b += path('M215,180 L215,100 Q230,86 245,100 L245,180', { width: 1.4, dash: '4 2' }) + path('M370,180 L370,100 Q385,86 400,100 L400,180', { width: 1.4, dash: '4 2' });
  b += path('M60,200 L60,120 M60,140 L45,110 M60,140 L75,110 M60,120 L52,95 M60,120 L68,95', { width: 1.1 });
  return { w: 460, h: 345, body: b, edge: true, anchors: {
    hair: { x: 105, y: 40, side: 'l' }, 'cornified-layer': { x: 30, y: 36, side: 'l' }, 'granular-layer': { x: 40, y: 62, side: 'l' }, epidermis: { x: 30, y: 55, side: 'l' },
    'nerve-ending': { x: 60, y: 120, side: 'l' }, 'hair-follicle': { x: 160, y: 200, side: 'l' }, dermis: { x: 40, y: 220, side: 'l' }, 'fat-layer': { x: 60, y: 300, side: 'l' },
    'sebaceous-gland': { x: 185, y: 140, side: 'r' }, 'erector-muscle': { x: 220, y: 135, side: 'r' }, 'blood-capillary': { x: 245, y: 150, side: 'r' },
    'sweat-pore': { x: 298, y: 30, side: 'r' }, 'sweat-duct': { x: 303, y: 120, side: 'r' }, 'sweat-gland': { x: 330, y: 232, side: 'r' },
  } };
};

// ── Endocrine glands on a body outline ──
export const endocrineGlands: Drawer = ({ id, variant }): Drawn => {
  const male = variant === 'male';
  let b = circle(150, 52, 32, { width: 1.5 });
  b += curve([[138, 84], [136, 100], [92, 112], [70, 140], [62, 230], [70, 300], [82, 300], [90, 230], [96, 180], [98, 260], [94, 330], [106, 450]], 1.5);
  b += curve([[162, 84], [164, 100], [208, 112], [230, 140], [238, 230], [230, 300], [218, 300], [210, 230], [204, 180], [202, 260], [206, 330], [194, 450]], 1.5);
  b += curve([[150, 345], [150, 450]], 1.2);
  b += ellipse(150, 60, 6, 5, { fill: INK, width: 0 });
  b += path('M138,114 Q143,104 150,112 Q157,104 162,114 Q157,124 150,116 Q143,124 138,114 Z', { fill: fill(id, 'sand'), width: 1.2 });
  for (const s of [-1, 1]) { b += ellipse(150 + s * 28, 228, 11, 18, { fill: '#fff', width: 1.1 }); b += path(`M${150 + s * 20},${210} Q${150 + s * 28},${200} ${150 + s * 36},${212}`, { width: 4 }); }
  b += blob([[120, 250], [150, 244], [185, 246], [188, 254], [150, 258], [122, 260]], fill(id, 'dots'), 1.2);
  if (male) { for (const s of [-1, 1]) b += ellipse(150 + s * 9, 360, 7, 10, { fill: fill(id, 'sand'), width: 1.2 }); }
  else for (const s of [-1, 1]) b += ellipse(150 + s * 30, 305, 9, 6, { fill: fill(id, 'sand'), width: 1.2 });
  const anchors: Record<string, Anchor> = {
    'pituitary-gland': { x: 150, y: 60, side: 'l' }, 'thyroid-gland': { x: 150, y: 114, side: 'l' }, 'adrenal-gland': { x: 178, y: 208, side: 'r' },
    pancreas: { x: 175, y: 252, side: 'r' },
  };
  if (male) anchors.testis = { x: 159, y: 362, side: 'r' };
  else anchors.ovary = { x: 180, y: 305, side: 'r' };
  return { w: 300, h: 460, body: b, anchors, edge: true };
};

// ── Reproductive systems ──
export const femaleReproductive: Drawer = ({ id }): Drawn => {
  let b = '';
  for (const s of [-1, 1]) {
    b += tube([[220 + s * 60, 112], [220 + s * 120, 90], [220 + s * 160, 120], [220 + s * 150, 170]], 10);
    b += path(`M${220 + s * 150},${172} l${s * -10},14 M${220 + s * 150},${172} l0,16 M${220 + s * 150},${172} l${s * 10},14`, { width: 1.3 });
    b += ellipse(220 + s * 130, 210, 26, 16, { fill: fill(id, 'dots'), width: 1.4 });
  }
  b += blob([[160, 105], [220, 95], [280, 105], [282, 160], [250, 235], [240, 270], [200, 270], [190, 235], [158, 160]], fill(id, 'sand'), 1.8);
  b += blob([[178, 118], [220, 112], [262, 118], [244, 170], [226, 225], [214, 225], [196, 170]], '#fff', 1.2);
  b += curve([[182, 122], [220, 116], [258, 122]], 2.2);
  b += path('M220,226 L220,270', { width: 2 });
  b += tube([[220, 270], [220, 300], [220, 350]], 34);
  return { w: 440, h: 360, body: b, edge: true, anchors: {
    ovary: { x: 90, y: 210, side: 'l' }, funnel: { x: 70, y: 180, side: 'l' }, oviduct: { x: 110, y: 92, side: 'l' },
    uterus: { x: 220, y: 150, side: 'r' }, endometrium: { x: 250, y: 125, side: 'r' }, 'uterus-wall': { x: 270, y: 165, side: 'r' },
    cervix: { x: 236, y: 262, side: 'r' }, vagina: { x: 237, y: 320, side: 'r' },
  } };
};

export const maleReproductive: Drawer = ({ id }): Drawn => {
  let b = '';
  b += tube([[260, 20], [250, 60], [226, 84]], 8);                            // ureter
  b += blob([[150, 60], [200, 40], [240, 60], [245, 110], [210, 140], [165, 130], [140, 100]], '#fff', 1.6);  // bladder
  b += blob([[245, 100], [272, 92], [282, 132], [260, 150], [250, 130]], fill(id, 'dots'), 1.2); // seminal vesicle
  b += blob([[178, 140], [215, 138], [228, 165], [205, 188], [178, 180], [170, 160]], fill(id, 'sand'), 1.4); // prostate
  b += blob([[150, 220], [205, 250], [215, 330], [180, 365], [135, 350], [120, 290], [128, 240]], '#fff', 1.4); // scrotum
  b += ellipse(170, 300, 26, 34, { fill: fill(id, 'sand'), width: 1.4, rot: -10 });
  b += blob([[188, 268], [205, 278], [204, 318], [196, 330], [192, 300]], fill(id, 'dots'), 1.2);
  b += tube([[200, 325], [228, 300], [235, 240], [240, 170], [268, 120], [262, 98], [240, 112], [222, 150], [205, 165]], 5);
  b += tube([[200, 140], [198, 175], [180, 205], [130, 210], [60, 240], [30, 252]], 9);
  b += `<path d="M190,195 C150,190 90,205 40,232 L50,270 C100,245 150,232 196,226 Z" fill="none" stroke="${INK}" stroke-width="1.6"/>`;
  b += blob([[22, 232], [50, 228], [56, 262], [28, 272], [14, 252]], '#fff', 1.4);
  return { w: 300, h: 380, body: b, edge: true, anchors: {
    ureter: { x: 256, y: 40, side: 'r' }, bladder: { x: 195, y: 85, side: 'r' }, 'seminal-vesicle': { x: 272, y: 120, side: 'r' }, prostate: { x: 212, y: 170, side: 'r' },
    'sperm-duct': { x: 236, y: 220, side: 'r' }, epididymis: { x: 202, y: 300, side: 'r' }, testis: { x: 170, y: 300, side: 'l' }, scrotum: { x: 135, y: 345, side: 'l' },
    urethra: { x: 120, y: 214, side: 'l' }, penis: { x: 90, y: 250, side: 'l' },
  } };
};

export const foetus: Drawer = ({ id }): Drawn => {
  // Uterus: thick muscular wall (stippled) around the cavity, narrowing to the cervix and vagina.
  let b = tube([[180, 372], [180, 424]], 30);
  b += blob([[180, 30], [270, 46], [330, 120], [338, 220], [300, 316], [226, 368], [196, 384], [164, 384], [134, 368], [60, 316], [22, 220], [30, 120], [90, 46]], fill(id, 'sand'), 1.9);
  b += blob([[180, 56], [256, 70], [306, 132], [312, 220], [280, 300], [214, 346], [180, 356], [146, 346], [80, 300], [48, 220], [54, 132], [104, 70]], '#fff', 1.2);
  // Cervix closed by a mucus plug.
  b += `<rect x="172" y="350" width="16" height="30" fill="#fff"/>` + path('M168,364 L192,364', { width: 6 });
  // Amnion: a thin membrane lining the cavity, holding the amniotic fluid.
  b += blob([[180, 74], [250, 86], [294, 140], [298, 220], [268, 292], [210, 334], [180, 340], [150, 334], [92, 292], [62, 220], [66, 140], [110, 86]], 'none', 1, '6 3');
  // Placenta on the upper wall, with its villi.
  b += blob([[96, 66], [140, 50], [196, 48], [238, 58], [232, 84], [190, 80], [140, 82], [104, 90]], fill(id, 'dots'), 1.4);
  for (let x = 114; x <= 222; x += 9) b += path(`M${x},84 l-2,7 M${x},84 l2,7`, { width: 0.7 });
  // The foetus, head down near the cervix, back to the reader's right, knees drawn up.
  const body: Pt[] = [[226, 318], [252, 280], [266, 226], [262, 168], [244, 126], [212, 108], [178, 112], [150, 132], [136, 160], [144, 182], [168, 190], [186, 194],
    [170, 212], [148, 230], [146, 252], [162, 264], [158, 278], [140, 298], [138, 326], [154, 346], [184, 354], [212, 344]];
  b += blob(body, '#fff', 1.6);
  b += curve([[244, 132], [210, 138], [168, 156], [146, 170]], 1.1);           // thigh
  b += curve([[168, 190], [194, 184], [212, 166]], 1.1) + ellipse(218, 162, 8, 5, { fill: '#fff', width: 1.1, rot: -40 }); // lower leg and foot
  b += curve([[214, 220], [184, 232], [166, 252], [176, 264]], 1.1);           // arm folded under the chin
  b += curve([[160, 278], [194, 280], [234, 296]], 1.1);                          // neck: head below, body above
  b += curve([[200, 312], [210, 320], [202, 330]], 1) + path('M160,318 l8,2', { width: 1.2 }); // ear, closed eye
  // Umbilical cord: a twisted cord from the placenta to the foetus's belly.
  const cord: Pt[] = [[176, 82], [160, 110], [120, 130], [104, 170], [122, 200], [168, 206], [196, 210]];
  b += curve(cord, 6) + curve(cord, 3).replace(`stroke="${INK}"`, 'stroke="#fff"') + curve(cord, 0.7, { dash: '2 3' });
  return { w: 360, h: 424, body: b, edge: true, anchors: {
    placenta: { x: 120, y: 70, side: 'l' }, 'umbilical-cord': { x: 106, y: 168, side: 'l' }, amnion: { x: 64, y: 230, side: 'l' }, 'amniotic-fluid': { x: 96, y: 280, side: 'l' },
    'uterus-wall': { x: 324, y: 160, side: 'r' }, foetus: { x: 240, y: 230, side: 'r' }, cervix: { x: 188, y: 364, side: 'r' }, vagina: { x: 194, y: 404, side: 'r' },
  } };
};

// ── Skeleton and muscles ──
export const vertebra: Drawer = ({ id, variant }): Drawn => {
  const cx = 180;
  let b = '';
  const big = variant === 'lumbar', neck = variant === 'cervical';
  const crx = big ? 70 : neck ? 46 : 55, cry = big ? 42 : neck ? 28 : 38;
  // Neural arch with transverse processes and the neural spine
  const tp = neck ? 70 : big ? 105 : 85, spineTop = variant === 'thoracic' ? 30 : neck ? 72 : 55;
  const arch: Pt[] = [[cx - 40, 190], [cx - 44, 150], [cx - tp, 140], [cx - tp, 120], [cx - 40, 118], [cx - 18, 95], [cx - (neck ? 18 : 10), spineTop], [cx + (neck ? 18 : 10), spineTop], [cx + 18, 95], [cx + 40, 118], [cx + tp, 120], [cx + tp, 140], [cx + 44, 150], [cx + 40, 190]];
  b += blob(arch, '#fff', 1.6);
  if (neck) b += path(`M${cx},${spineTop + 2} L${cx},${spineTop + 14}`, { width: 1.6 });
  const cyC = 184 + cry;
  b += ellipse(cx, cyC, crx, cry, { fill: fill(id, 'dots'), width: 1.8 });
  b += circle(cx, 150, 28, { width: 1.4 });
  for (const s of [-1, 1]) b += ellipse(cx + s * 32, 112, 10, 6, { fill: fill(id, 'hatch'), width: 1 });
  if (neck) for (const s of [-1, 1]) b += circle(cx + s * 58, 132, 8, { width: 1.3 });
  if (variant === 'thoracic') for (const s of [-1, 1]) b += ellipse(cx + s * (tp - 8), 130, 7, 6, { fill: fill(id, 'hatch'), width: 1 });
  const anchors: Record<string, Anchor> = {
    centrum: { x: cx - crx + 10, y: cyC + 6, side: 'l' }, 'neural-canal': { x: cx - 10, y: 150, side: 'l' }, 'neural-spine': { x: cx + 8, y: spineTop + 8, side: 'r' },
    'transverse-process': { x: cx + tp - 6, y: 130, side: 'r' }, facet: { x: cx - 32, y: 112, side: 'l' },
  };
  if (neck) anchors['vertebrarterial-canal'] = { x: cx + 58, y: 132, side: 'r' };
  if (variant === 'thoracic') anchors['rib-facet'] = { x: cx - tp + 8, y: 130, side: 'l' };
  return { w: 360, h: 280, body: b, anchors, edge: true };
};

export const armMuscles: Drawer = ({ id }): Drawn => {
  // Side view, elbow bent: the biceps in front of the humerus pulls on the radius (flexes),
  // the triceps behind it pulls on the ulna's point at the elbow (extends). An antagonistic pair.
  const muscle = fill(id, 'sand');
  let b = blob([[34, 24], [156, 22], [140, 58], [76, 132], [44, 80]], fill(id, 'dots'), 1.2);                           // scapula
  b += blob([[112, 42], [130, 30], [150, 40], [148, 62], [140, 80], [140, 186], [152, 208], [146, 228], [124, 230], [110, 214], [118, 186], [118, 80], [106, 60]], '#fff', 1.5); // humerus
  b += blob([[92, 230], [112, 220], [130, 230], [142, 250], [260, 260], [404, 262], [406, 274], [260, 274], [128, 266], [100, 256]], '#fff', 1.5); // ulna (with its point behind the elbow)
  b += blob([[146, 222], [164, 228], [260, 238], [404, 240], [406, 252], [260, 252], [154, 244], [140, 234]], '#fff', 1.5);    // radius
  b += circle(132, 236, 3, { fill: INK, width: 0 });                                                                          // the hinge
  // Biceps (front) and triceps (back), each with a tendon at both ends.
  b += blob([[152, 74], [178, 94], [198, 140], [196, 188], [182, 214], [164, 190], [154, 140]], muscle, 1.5);
  b += path('M152,76 L146,50 M182,212 L186,240', { width: 2.8 });
  b += blob([[110, 74], [88, 112], [80, 160], [88, 204], [102, 222], [114, 176], [116, 114]], muscle, 1.5);
  b += path('M110,76 L116,56 M101,220 L102,236', { width: 2.8 });
  return { w: 420, h: 290, body: b, edge: true, anchors: {
    scapula: { x: 60, y: 60, side: 'l' }, triceps: { x: 96, y: 150, side: 'l' }, ulna: { x: 300, y: 268, side: 'r' }, humerus: { x: 129, y: 120, side: 'l' },
    biceps: { x: 182, y: 140, side: 'r' }, tendon: { x: 184, y: 226, side: 'r' }, radius: { x: 330, y: 246, side: 'r' }, 'elbow-joint': { x: 132, y: 236, side: 'l' },
  } };
};

export const synovialJoint: Drawer = ({ id }): Drawn => {
  let b = `<path d="M130,20 L130,150 A40,40 0 0 0 210,150 L210,20" fill="${fill(id, 'dots')}" stroke="${INK}" stroke-width="1.6"/>`;
  b += `<path d="M130,150 A40,40 0 0 0 210,150 A44,40 0 0 1 126,150 Z" fill="#fff" stroke="${INK}" stroke-width="1.2"/>`;
  b += `<path d="M130,380 L130,232 Q170,214 210,232 L210,380" fill="${fill(id, 'dots')}" stroke="${INK}" stroke-width="1.6"/>`;
  b += `<path d="M130,232 Q170,214 210,232 L210,242 Q170,224 130,242 Z" fill="#fff" stroke="${INK}" stroke-width="1.2"/>`;
  b += `<path d="M126,130 Q92,190 126,262 M214,130 Q248,190 214,262" fill="none" stroke="${INK}" stroke-width="3"/>`;
  b += `<path d="M130,140 Q104,190 130,250 M210,140 Q236,190 210,250" fill="none" stroke="${INK}" stroke-width="1" stroke-dasharray="3 2"/>`;
  b += `<path d="M131,178 Q170,202 209,178 Q214,205 209,225 Q170,212 131,225 Q126,205 131,178 Z" fill="#e8e8e8" stroke="none"/>`;
  for (const s of [-1, 1]) b += roundRect(s < 0 ? 98 : 232, 120, 10, 150, 4, { fill: fill(id, 'vlines'), width: 1 });
  return { w: 340, h: 390, body: b, edge: true, anchors: {
    bone: { x: 150, y: 60, side: 'l' }, cartilage: { x: 135, y: 165, side: 'l' }, ligament: { x: 103, y: 200, side: 'l' },
    capsule: { x: 233, y: 170, side: 'r' }, 'synovial-membrane': { x: 222, y: 220, side: 'r' }, 'synovial-fluid': { x: 175, y: 203, side: 'r' },
  } };
};

// ── Nerves ──
export const reflexArc: Drawer = ({ id }): Drawn => {
  // Spinal cord in T.S.: white matter outside, butterfly of grey matter (stippled) round the central canal.
  let b = ellipse(395, 150, 80, 66, { width: 1.8 });
  b += blob([[365, 92], [380, 120], [395, 132], [410, 120], [425, 92], [436, 116], [420, 150], [438, 192], [424, 210], [408, 178], [395, 168], [382, 178], [366, 210], [352, 192], [370, 150], [354, 116]], fill(id, 'sand'), 1.2);
  b += circle(395, 151, 3.5, { fill: '#fff', width: 1.2 });
  // Dorsal root ganglion: a swelling on the dorsal root, holding the sensory neurone's cell body.
  b += ellipse(240, 88, 23, 15, { width: 1.4 });
  // Skin with a receptor; a muscle (the effector).
  b += `<rect x="8" y="30" width="120" height="12" fill="${fill(id, 'sand')}" stroke="${INK}" stroke-width="1.2"/>`;
  b += ellipse(84, 256, 52, 17, { fill: fill(id, 'vlines'), width: 1.4 });
  // The three neurones (impulse direction by the arrows).
  const nerve = (d: string, arrow = false) => path(d, { width: 1.5, arrow: arrow ? `${id}-arr` : undefined });
  b += nerve('M56,46 l-6,-8 M56,46 l0,-10 M56,46 l6,-8');                                                      // receptor endings
  b += nerve('M56,46 C58,80 70,108 84,132 L160,126 C176,114 196,98 222,90', true);                              // sensory: receptor → ganglion
  b += circle(240, 84, 6, { fill: INK, width: 0 }) + nerve('M240,90 L240,84') + nerve('M246,88 L300,90 L340,104 L366,112', true); // its cell body, then into the cord
  b += nerve('M368,114 C384,128 388,160 376,182', true);                                                       // relay neurone in the grey matter
  b += circle(372, 190, 6, { fill: INK, width: 0 });                                                          // motor neurone cell body
  b += nerve('M366,192 L332,198 L282,192 L222,166 L160,140 L90,142 C80,170 76,200 78,236', true);               // motor neurone to the muscle
  b += nerve('M78,236 l-12,8 M78,236 l0,12 M78,236 l12,8');                                                    // motor end plates
  return { w: 490, h: 290, body: b, edge: true, anchors: {
    receptor: { x: 56, y: 44, side: 'l' }, 'sensory-neurone': { x: 70, y: 100, side: 'l' }, 'motor-neurone': { x: 76, y: 196, side: 'l' }, effector: { x: 50, y: 258, side: 'l' },
    'dorsal-root-ganglion': { x: 240, y: 76, side: 'r' }, 'grey-matter': { x: 428, y: 112, side: 'r' }, 'white-matter': { x: 462, y: 176, side: 'r' },
    'relay-neurone': { x: 382, y: 136, side: 'r' }, 'central-canal': { x: 395, y: 151, side: 'r' }, 'ventral-root': { x: 290, y: 190, side: 'r' },
  } };
};

export const neurone: Drawer = ({ id, variant }): Drawn => {
  let b = '';
  const myelin = (x0: number, x1: number, y: number) => { let g = ''; for (let x = x0; x < x1 - 30; x += 46) g += roundRect(x, y - 9, 40, 18, 8, { fill: fill(id, 'sand'), width: 1.1 }); return g; };
  if (variant === 'sensory') {
    b += path('M20,110 L470,110', { width: 1.8 }) + myelin(60, 230, 110) + myelin(280, 450, 110);
    b += path('M20,110 l-10,-12 M20,110 l-12,0 M20,110 l-10,12', { width: 1.3 });
    b += path('M255,110 L255,60', { width: 1.6 }) + blob([[235, 30], [255, 18], [276, 30], [275, 58], [255, 66], [236, 58]], '#fff', 1.6) + nucleus(id, 256, 42, 9, 9);
    for (const dy of [-14, 0, 14]) b += path(`M470,110 L490,${110 + dy}`, { width: 1.2 }) + circle(492, 110 + dy, 3, { fill: INK, width: 0 });
    return { w: 510, h: 150, body: b, edge: true, anchors: {
      receptor: { x: 14, y: 110, side: 'l' }, dendron: { x: 100, y: 101, side: 'l' }, 'cell-body': { x: 268, y: 30, side: 'r' }, nucleus: { x: 256, y: 42, side: 'l' },
      axon: { x: 305, y: 101, side: 'r' }, 'myelin-sheath': { x: 400, y: 101, side: 'r' }, 'node-of-ranvier': { x: 147, y: 110, side: 'l' }, 'axon-terminals': { x: 492, y: 124, side: 'r' },
    } };
  }
  b += blob([[40, 90], [70, 70], [100, 80], [112, 110], [98, 140], [65, 148], [42, 130]], '#fff', 1.6) + nucleus(id, 76, 110, 12, 12);
  for (const [dx, dy] of [[-1, -1], [-1, 0.3], [-0.4, 1], [0.2, -1.2], [-1, 1]] as const) {
    const x = 75 + dx * 36, y = 110 + dy * 36;
    b += path(`M${75 + dx * 20},${110 + dy * 20} L${x},${y} L${x + dx * 14 - 6},${y + dy * 14 - 6} M${x},${y} L${x + dx * 14 + 6},${y + dy * 14 + 6}`, { width: 1.2 });
  }
  b += path('M110,110 L430,110', { width: 1.8 }) + myelin(125, 430, 110);
  b += roundRect(430, 140, 70, 30, 6, { fill: fill(id, 'vlines'), width: 1.2 });
  for (const dx of [-14, 0, 14]) b += path(`M430,110 L${452 + dx},140`, { width: 1.2 }) + `<rect x="${448 + dx}" y="137" width="9" height="4" fill="${INK}"/>`;
  return { w: 510, h: 180, body: b, edge: true, anchors: {
    dendrite: { x: 40, y: 75, side: 'l' }, 'cell-body': { x: 50, y: 130, side: 'l' }, nucleus: { x: 76, y: 110, side: 'l' }, axon: { x: 118, y: 110, side: 'l' },
    'myelin-sheath': { x: 190, y: 101, side: 'r' }, 'node-of-ranvier': { x: 167, y: 110, side: 'r' }, 'motor-end-plate': { x: 466, y: 139, side: 'r' }, muscle: { x: 490, y: 155, side: 'r' },
  } };
};
