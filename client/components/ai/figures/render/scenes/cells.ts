// @/components/ai/figures/render/scenes/cells.ts — cells as O Level
// Biology draws them: plant, animal and bacterial cells (light or
// electron microscope), specialised cells, the stages of mitosis and
// cells in osmosis. ECZ letters these with long pointer lines from the
// side, so every drawer here sets `edge`.
import { INK, n } from '../svg';
import { fill, words, type Anchor, type Drawer, type Drawn } from './kit';
import { blob, chloroplast, circle, curve, dot, ellipse, golgi, mitochondrion, nucleus, oval, ribosomes, roughER, roundRect, smooth, type Pt } from './biokit';
import { seeded } from './kit';

/** A plant cell wall as a double line (wall) with the cell membrane just inside. */
function plantWall(id: string, x: number, y: number, w: number, h: number, r = 12) {
  return roundRect(x, y, w, h, r, { width: 1.3 }) + roundRect(x + 5, y + 5, w - 10, h - 10, r - 3, { width: 1.1, fill: fill(id, 'sand') })
    + roundRect(x + 9, y + 9, w - 18, h - 18, r - 5, { width: 0.9, fill: 'none' });
}

export const plantCell: Drawer = ({ id, variant }): Drawn => {
  const em = variant === 'electron';
  let b = plantWall(id, 40, 25, 340, 220, 14);
  const vac: Pt[] = [[80, 140], [100, 95], [170, 80], [250, 82], [305, 100], [312, 150], [290, 200], [200, 214], [115, 205]];
  b += blob(vac, '#fff', 1.2);
  for (const x of [95, 145, 195, 245, 295]) b += chloroplast(x, 55, 13, 7, x % 2 ? 8 : -8);
  for (const x of [110, 170, 240]) b += chloroplast(x, 226, 13, 7, x % 20 ? -6 : 6);
  b += chloroplast(60, 175, 11, 6, 80) + chloroplast(342, 210, 12, 6, -60);
  b += nucleus(id, 340, 112, 20, 24, em);
  const anchors: Record<string, Anchor> = {
    'cell-wall': { x: 42.5, y: 90, side: 'l' }, 'cell-membrane': { x: 49, y: 150, side: 'l' }, cytoplasm: { x: 66, y: 120, side: 'l' },
    vacuole: { x: 200, y: 140, side: 'r' }, nucleus: { x: 334, y: 120, side: 'r' }, chloroplast: { x: 245, y: 55, side: 'r' },
  };
  if (em) {
    const rnd = seeded(7);
    b += mitochondrion(330, 170, 12, 6, 70) + mitochondrion(80, 70, 12, 6, -20) + mitochondrion(330, 60, 11, 6, 15);
    b += roughER(268, 196, 34, 2) + golgi(85, 214, 26);
    b += ribosomes(52, 36, 368, 72, 22, rnd, (x, y) => y < 50 || x > 315) + ribosomes(320, 140, 366, 230, 10, rnd);
    b += `<line x1="380" y1="150" x2="370" y2="150" stroke="#fff" stroke-width="3"/><line x1="370" y1="148" x2="382" y2="148" stroke="${INK}" stroke-width="0.8"/><line x1="370" y1="152" x2="382" y2="152" stroke="${INK}" stroke-width="0.8"/>`;
    Object.assign(anchors, {
      mitochondrion: { x: 330, y: 170, side: 'r' }, nucleolus: { x: 344, y: 108, side: 'r' }, 'nuclear-membrane': { x: 360, y: 112, side: 'r' },
      'rough-er': { x: 285, y: 200, side: 'r' }, golgi: { x: 98, y: 222, side: 'l' }, ribosome: { x: 60, y: 40, side: 'l' },
      plasmodesma: { x: 376, y: 150, side: 'r' },
    });
  }
  return { w: 420, h: 270, body: b, anchors, edge: true };
};

export const animalCell: Drawer = ({ id, variant }): Drawn => {
  const em = variant === 'electron';
  const out = oval(200, 135, 160, 105, 12, 0.05, 11);
  let b = blob(out, fill(id, 'sand'), 1.4);
  b += nucleus(id, 195, 130, 38, 34, em);
  b += mitochondrion(95, 105, 14, 7, 30) + mitochondrion(300, 85, 14, 7, -20) + mitochondrion(295, 190, 14, 7, 15) + mitochondrion(120, 190, 14, 7, -10);
  b += circle(250, 205, 9, { width: 1 });
  const anchors: Record<string, Anchor> = {
    'cell-membrane': { x: out[6][0], y: out[6][1], side: 'l' }, cytoplasm: { x: 80, y: 150, side: 'l' }, nucleus: { x: 210, y: 150, side: 'r' },
    mitochondrion: { x: 300, y: 85, side: 'r' }, vacuole: { x: 250, y: 205, side: 'r' },
  };
  if (em) {
    const rnd = seeded(5);
    b += roughER(240, 120, 40, 3) + golgi(70, 140, 30);
    b += `<g transform="rotate(30 300 140)">${roundRect(290, 132, 16, 7, 2, { width: 1 })}</g>` + `<g transform="rotate(-60 312 128)">${roundRect(304, 124, 16, 7, 2, { width: 1 })}</g>`;
    b += circle(150, 75, 8, { fill: fill(id, 'dots'), width: 1 });
    b += ribosomes(60, 50, 340, 230, 30, rnd, (x, y) => ((x - 195) / 48) ** 2 + ((y - 130) / 44) ** 2 > 1 && ((x - 200) / 150) ** 2 + ((y - 135) / 95) ** 2 < 1);
    Object.assign(anchors, {
      nucleolus: { x: 203, y: 125, side: 'r' }, 'nuclear-membrane': { x: 195, y: 93, side: 'r' }, 'rough-er': { x: 260, y: 125, side: 'r' },
      golgi: { x: 85, y: 148, side: 'l' }, centriole: { x: 305, y: 135, side: 'r' }, lysosome: { x: 150, y: 75, side: 'l' }, ribosome: { x: 120, y: 230, side: 'l' },
    });
  }
  return { w: 400, h: 270, body: b, anchors, edge: true };
};

export const bacterialCell: Drawer = ({ id }): Drawn => {
  let b = roundRect(52, 52, 316, 126, 62, { width: 1, dash: '5 3', fill: '#fff' });
  b += roundRect(60, 60, 300, 110, 55, { width: 2.2 }) + roundRect(65, 65, 290, 100, 50, { width: 0.9, fill: fill(id, 'sand') });
  const rnd = seeded(3);
  const dna: Pt[] = [];
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; const r = 26 + rnd() * 16; dna.push([200 + r * 1.5 * Math.cos(a), 115 + r * 0.8 * Math.sin(a)]); }
  b += `<path d="${smooth(dna, true)}" fill="none" stroke="${INK}" stroke-width="1.8"/>`;
  b += circle(120, 95, 7, { fill: 'none', width: 1.4 }) + circle(290, 140, 6, { fill: 'none', width: 1.4 });
  b += ribosomes(80, 72, 340, 158, 26, rnd, (x, y) => ((x - 200) / 70) ** 2 + ((y - 115) / 42) ** 2 > 1);
  b += curve([[366, 115], [385, 100], [400, 125], [418, 100], [432, 118]], 1.4);
  for (const x of [110, 160, 240, 290]) b += `<line x1="${x}" y1="54" x2="${x + 3}" y2="40" stroke="${INK}" stroke-width="1"/><line x1="${x}" y1="176" x2="${x - 3}" y2="190" stroke="${INK}" stroke-width="1"/>`;
  return {
    w: 440, h: 220, body: b, edge: true,
    anchors: {
      capsule: { x: 52, y: 115, side: 'l' }, 'cell-wall': { x: 62, y: 132, side: 'l' }, 'cell-membrane': { x: 67, y: 148, side: 'l' },
      cytoplasm: { x: 100, y: 158, side: 'l' }, dna: { x: 200 + 36 * 1.5, y: 115, side: 'r' }, plasmid: { x: 290, y: 140, side: 'r' },
      ribosome: { x: 310, y: 95, side: 'r' }, flagellum: { x: 400, y: 125, side: 'r' }, pilus: { x: 161, y: 46, side: 'l' },
    },
  };
};

// ── Specialised cells ──
type Spec = () => { w: number; h: number; body: string; anchors: Record<string, Anchor> };

function specialised(id: string): Record<string, Spec> {
  return {
    'root-hair': () => {
      const d = 'M45,110 L150,110 C205,104 265,72 370,30 A12,12 0 0 1 382,52 C280,92 220,122 198,148 L198,186 Q198,192 192,192 L45,192 Q40,192 40,186 L40,116 Q40,110 45,110 Z';
      let b = `<path d="${d}" fill="none" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/><path d="${d}" fill="${fill(id, 'sand')}" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>`;
      b += blob([[95, 140], [150, 128], [215, 112], [300, 80], [352, 50], [360, 56], [290, 95], [205, 140], [180, 172], [120, 176], [92, 168]], '#fff', 1);
      b += nucleus(id, 66, 150, 13, 16);
      for (const [x, y, r] of [[290, 130, 14], [240, 40, 11], [330, 100, 9], [120, 70, 12]] as const) b += blob(oval(x, y, r * 1.3, r, 7, 0.15, x), fill(id, 'dots'), 1);
      return { w: 420, h: 215, body: b, anchors: {
        'root-hair': { x: 320, y: 46, side: 'r' }, 'cell-wall': { x: 37, y: 140, side: 'l' }, 'cell-membrane': { x: 43, y: 175, side: 'l' },
        cytoplasm: { x: 80, y: 182, side: 'l' }, vacuole: { x: 220, y: 125, side: 'r' }, nucleus: { x: 66, y: 150, side: 'l' }, 'soil-particle': { x: 290, y: 130, side: 'r' },
      } };
    },
    palisade: () => {
      let b = plantWall(id, 110, 20, 100, 270, 16);
      b += blob([[140, 60], [160, 52], [182, 60], [184, 150], [182, 240], [160, 250], [140, 240], [138, 150]], '#fff', 1);
      for (let y = 45; y <= 265; y += 22) { b += chloroplast(127, y, 9, 5, 90); b += chloroplast(193, y + 10, 9, 5, 90); }
      b += nucleus(id, 160, 265, 14, 11);
      return { w: 320, h: 310, body: b, anchors: {
        chloroplast: { x: 193, y: 99, side: 'r' }, vacuole: { x: 160, y: 150, side: 'r' }, nucleus: { x: 160, y: 265, side: 'r' },
        'cell-wall': { x: 112.5, y: 120, side: 'l' }, 'cell-membrane': { x: 119, y: 200, side: 'l' }, cytoplasm: { x: 130, y: 230, side: 'l' },
      } };
    },
    'guard-cells': () => {
      let b = '';
      // Epidermal cells fitted round the pair of guard cells: two rings of irregular cells with slightly wavy walls, cut off at the edge of the view.
      const rnd = seeded(11);
      const at = (deg: number, k: number): Pt => [190 + 96 * k * Math.cos((deg * Math.PI) / 180), 130 + 100 * k * Math.sin((deg * Math.PI) / 180)];
      const wall = (p: Pt, q: Pt) => curve([p, [(p[0] + q[0]) / 2 + (rnd() - 0.5) * 8, (p[1] + q[1]) / 2 + (rnd() - 0.5) * 8], q], 1);
      let cellsG = '';
      const ring = (k: number, step: number, off: number) => {
        const pts: Pt[] = [];
        for (let d = off; d < 360 + off; d += step) pts.push(at(d + (rnd() - 0.5) * 10, k * (1 + (rnd() - 0.5) * 0.12)));
        return pts;
      };
      const r1 = ring(1.42, 45, 22), r2 = ring(2.05, 30, 8);
      r1.forEach((p, i) => { cellsG += wall(p, r1[(i + 1) % r1.length]) + wall(at(22 + i * 45, 1), p); });
      r2.forEach((p, i) => {
        cellsG += wall(p, r2[(i + 1) % r2.length]);
        const near = r1.reduce((m, q) => (Math.hypot(q[0] - p[0], q[1] - p[1]) < Math.hypot(m[0] - p[0], m[1] - p[1]) ? q : m), r1[0]);
        cellsG += wall(near, p) + wall(p, at(8 + i * 30, 3.2));
      });
      b += `<clipPath id="${id}-gc"><rect x="10" y="10" width="360" height="240"/></clipPath><g clip-path="url(#${id}-gc)">${cellsG}</g>`;
      b += ellipse(190, 130, 96, 100, { fill: 'none', width: 1.1 });
      const left = 'M190,40 C120,40 100,90 100,130 C100,170 120,220 190,220 C172,190 165,160 165,130 C165,100 172,70 190,40 Z';
      const right = 'M190,40 C260,40 280,90 280,130 C280,170 260,220 190,220 C208,190 215,160 215,130 C215,100 208,70 190,40 Z';
      b += `<path d="${left}" fill="${fill(id, 'sand')}" stroke="${INK}" stroke-width="1.4"/><path d="${right}" fill="${fill(id, 'sand')}" stroke="${INK}" stroke-width="1.4"/>`;
      b += `<path d="M190,48 C172,72 167,100 167,130 C167,160 172,188 190,212 M190,48 C208,72 213,100 213,130 C213,160 208,188 190,212" fill="none" stroke="${INK}" stroke-width="4"/>`;
      b += `<path d="M190,52 C176,80 171,105 171,130 C171,155 176,180 190,208 C204,180 209,155 209,130 C209,105 204,80 190,52 Z" fill="#fff" stroke="none"/>`;
      for (const [x, y] of [[125, 95], [118, 150], [140, 190], [255, 95], [262, 150], [240, 190]] as const) b += chloroplast(x, y, 9, 5, 70);
      b += nucleus(id, 138, 130, 10, 12) + nucleus(id, 242, 130, 10, 12);
      return { w: 400, h: 300, body: b, anchors: {
        'guard-cell': { x: 108, y: 165, side: 'l' }, stoma: { x: 190, y: 130, side: 'r' }, 'thick-inner-wall': { x: 213, y: 100, side: 'r' },
        chloroplast: { x: 262, y: 150, side: 'r' }, nucleus: { x: 138, y: 130, side: 'l' }, 'epidermal-cell': { x: 50, y: 60, side: 'l' },
      } };
    },
    xylem: () => {
      let b = `<rect x="120" y="20" width="60" height="280" fill="#fff" stroke="none"/>`;
      b += `<line x1="120" y1="20" x2="120" y2="300" stroke="${INK}" stroke-width="2.4"/><line x1="180" y1="20" x2="180" y2="300" stroke="${INK}" stroke-width="2.4"/>`;
      for (let y = 26; y < 300; y += 15) b += `<path d="M121,${y} Q150,${y + 9} 179,${y + 4}" fill="none" stroke="${INK}" stroke-width="2.6"/>`;
      b += `<path d="M110,160 L120,160 M180,160 L190,160" stroke="${INK}" stroke-width="2"/>`;
      return { w: 300, h: 320, body: b, anchors: {
        lignin: { x: 150, y: 97, side: 'r' }, lumen: { x: 150, y: 230, side: 'r' }, 'vessel-wall': { x: 120, y: 60, side: 'l' }, 'end-wall-remains': { x: 112, y: 160, side: 'l' },
      } };
    },
    phloem: () => {
      let b = `<rect x="110" y="20" width="80" height="290" fill="#fff" stroke="${INK}" stroke-width="1.6"/>`;
      for (const y of [105, 215]) { b += `<line x1="110" y1="${y}" x2="190" y2="${y}" stroke="${INK}" stroke-width="3.2" stroke-dasharray="6 4"/>`; }
      for (const x of [128, 150, 172]) b += `<line x1="${x}" y1="25" x2="${x}" y2="305" stroke="${INK}" stroke-width="0.6" stroke-dasharray="2 5"/>`;
      b += roundRect(190, 110, 36, 100, 10, { fill: fill(id, 'sand'), width: 1.4 }) + nucleus(id, 208, 150, 9, 13);
      for (const y of [140, 175]) b += `<line x1="188" y1="${y}" x2="192" y2="${y}" stroke="#fff" stroke-width="3"/>`;
      return { w: 330, h: 320, body: b, anchors: {
        'sieve-tube': { x: 150, y: 165, side: 'l' }, 'sieve-plate': { x: 140, y: 105, side: 'l' }, 'companion-cell': { x: 208, y: 190, side: 'r' },
        nucleus: { x: 208, y: 150, side: 'r' }, cytoplasm: { x: 172, y: 270, side: 'l' }, 'cell-wall': { x: 110, y: 270, side: 'l' },
      } };
    },
    'red-blood-cell': () => {
      let b = circle(100, 100, 55, { fill: fill(id, 'sand'), width: 1.5 }) + circle(100, 100, 24, { fill: '#fff', width: 0.9, dash: '3 3' });
      b += `<path d="M190,100 C190,70 215,70 230,85 C240,95 260,95 270,85 C285,70 310,70 310,100 C310,130 285,130 270,115 C260,105 240,105 230,115 C215,130 190,130 190,100 Z" fill="${fill(id, 'sand')}" stroke="${INK}" stroke-width="1.5"/>`;
      b += words(100, 178, 'Surface view', { size: 11 }) + words(250, 178, 'Side view (section)', { size: 11 });
      return { w: 340, h: 190, body: b, anchors: {
        'cell-membrane': { x: 100, y: 45, side: 'l' }, haemoglobin: { x: 70, y: 130, side: 'l' }, 'no-nucleus': { x: 100, y: 100, side: 'l' }, biconcave: { x: 250, y: 103, side: 'r' },
      } };
    },
    'white-blood-cell': () => {
      let b = blob(oval(100, 95, 62, 58, 11, 0.07, 4), fill(id, 'sand'), 1.4);
      b += `<path d="M70,80 a14,14 0 1,1 20,10 a12,12 0 1,1 22,4 a13,13 0 1,1 16,18 a12,12 0 1,1 -18,10 a14,14 0 1,1 -26,-14 a12,12 0 1,1 -14,-28 z" fill="${INK}" opacity="0.75"/>`;
      b += circle(285, 95, 44, { fill: fill(id, 'sand'), width: 1.4 }) + circle(285, 95, 34, { fill: INK, width: 0 });
      b += words(100, 180, 'Phagocyte', { size: 11.5, bold: true }) + words(285, 180, 'Lymphocyte', { size: 11.5, bold: true });
      return { w: 370, h: 195, body: b, anchors: {
        'lobed-nucleus': { x: 105, y: 100, side: 'l' }, cytoplasm: { x: 60, y: 130, side: 'l' }, 'cell-membrane': { x: 40, y: 95, side: 'l' },
        'large-nucleus': { x: 300, y: 85, side: 'r' }, 'thin-cytoplasm': { x: 323, y: 112, side: 'r' },
      } };
    },
    sperm: () => {
      let b = ellipse(80, 80, 34, 21, { fill: '#fff', width: 1.5 }) + ellipse(84, 80, 22, 14, { fill: fill(id, 'sand'), width: 1 });
      b += `<path d="M52,64 A34,21 0 0 0 52,96" fill="none" stroke="${INK}" stroke-width="4"/>`;
      b += roundRect(112, 72, 62, 16, 6, { width: 1.3 });
      for (let x = 116; x < 172; x += 8) b += `<path d="M${x},74 L${x + 4},86" stroke="${INK}" stroke-width="1"/>`;
      b += curve([[174, 80], [210, 66], [250, 94], [290, 66], [330, 94], [370, 72], [420, 84]], 1.6);
      return { w: 440, h: 160, body: b, anchors: {
        acrosome: { x: 49, y: 80, side: 'l' }, nucleus: { x: 90, y: 72, side: 'l' }, head: { x: 80, y: 101, side: 'l' },
        'middle-piece': { x: 143, y: 88, side: 'r' }, mitochondria: { x: 143, y: 78, side: 'r' }, tail: { x: 330, y: 92, side: 'r' },
      } };
    },
    ciliated: () => {
      let b = roundRect(90, 70, 100, 210, 8, { fill: fill(id, 'sand'), width: 1.4 });
      for (let x = 96; x <= 184; x += 8) b += curve([[x, 70], [x + 3, 56], [x - 2, 44], [x + 2, 32]], 1);
      b += nucleus(id, 140, 225, 18, 22) + mitochondrion(120, 100, 10, 5, 0) + mitochondrion(165, 110, 10, 5, 20);
      return { w: 280, h: 300, body: b, anchors: {
        cilia: { x: 172, y: 45, side: 'r' }, nucleus: { x: 140, y: 225, side: 'r' }, cytoplasm: { x: 110, y: 160, side: 'l' }, 'cell-membrane': { x: 90, y: 250, side: 'l' }, mitochondrion: { x: 120, y: 100, side: 'l' },
      } };
    },
  };
}

export const specialisedCell: Drawer = ({ id, variant }): Drawn => {
  const make = specialised(id)[variant] ?? specialised(id)['root-hair'];
  return { ...make(), edge: true };
};

// ── Mitosis ──
function stage(id: string, s: string, cx: number, cy: number, r: number): { body: string; anchors: Record<string, Anchor> } {
  const a: Record<string, Anchor> = {};
  let b = '';
  const top: Pt = [cx, cy - r * 0.86], bot: Pt = [cx, cy + r * 0.86];
  const centrioles = (p: Pt) => `<rect x="${n(p[0] - 4)}" y="${n(p[1] - 2)}" width="8" height="4" fill="${INK}"/><rect x="${n(p[0] - 2)}" y="${n(p[1] - 4)}" width="4" height="8" fill="${INK}"/>`;
  const X = (x: number, y: number, len: number, rot = 0) => `<g transform="rotate(${rot} ${n(x)} ${n(y)})"><path d="M${n(x - 3)},${n(y - len)} Q${n(x)},${n(y)} ${n(x - 3)},${n(y + len)} M${n(x + 3)},${n(y - len)} Q${n(x)},${n(y)} ${n(x + 3)},${n(y + len)}" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/></g>`;
  if (s === 'telophase') {
    b += blob([[cx - r * 0.75, cy - r * 0.5], [cx, cy - r * 0.98], [cx + r * 0.75, cy - r * 0.5], [cx + r * 0.42, cy], [cx + r * 0.75, cy + r * 0.5], [cx, cy + r * 0.98], [cx - r * 0.75, cy + r * 0.5], [cx - r * 0.42, cy]], fill(id, 'sand'), 1.4);
    for (const dy of [-0.5, 0.5]) { b += circle(cx, cy + dy * r, r * 0.22, { fill: fill(id, 'sand'), width: 1.2 }) + curve([[cx - 8, cy + dy * r - 4], [cx - 2, cy + dy * r + 5], [cx + 7, cy + dy * r - 2]], 1.6); }
    a['nuclear-membrane'] = { x: cx + r * 0.22, y: cy - r * 0.5, side: 'r' };
    a['cell-membrane'] = { x: cx - r * 0.42, y: cy, side: 'l' };
    return { body: b, anchors: a };
  }
  b += circle(cx, cy, r, { fill: fill(id, 'sand'), width: 1.4 });
  a['cell-membrane'] = { x: cx - r, y: cy + r * 0.3, side: 'l' };
  if (s === 'interphase') {
    b += circle(cx, cy, r * 0.45, { fill: '#fff', width: 1.3 });
    for (let k = 0; k < 4; k++) b += curve([[cx - r * 0.3, cy - r * 0.2 + k * 7], [cx - r * 0.05, cy - r * 0.28 + k * 8], [cx + r * 0.25, cy - r * 0.15 + k * 6]], 0.9);
    b += circle(cx + r * 0.12, cy + r * 0.12, r * 0.1, { fill: INK, width: 0 }) + centrioles([cx + r * 0.6, cy - r * 0.5]);
    Object.assign(a, { 'nuclear-membrane': { x: cx + r * 0.45, y: cy, side: 'r' }, chromatin: { x: cx - r * 0.2, y: cy - r * 0.12, side: 'l' }, nucleolus: { x: cx + r * 0.12, y: cy + r * 0.12, side: 'r' }, centriole: { x: cx + r * 0.6, y: cy - r * 0.5, side: 'r' } });
  } else if (s === 'prophase') {
    b += circle(cx, cy, r * 0.5, { fill: '#fff', width: 1.2, dash: '6 4' });
    for (const [dx, dy, rot] of [[-0.22, -0.15, 20], [0.15, -0.22, -30], [0.2, 0.15, 60], [-0.12, 0.2, -10]] as const) b += X(cx + dx * r, cy + dy * r, r * 0.13, rot);
    b += centrioles(top) + centrioles(bot);
    for (const s2 of [-1, 1]) for (const dx of [-0.25, 0, 0.25]) b += `<line x1="${n(cx)}" y1="${n(cy + s2 * r * 0.86)}" x2="${n(cx + dx * r)}" y2="${n(cy + s2 * r * 0.62)}" stroke="${INK}" stroke-width="0.7"/>`;
    Object.assign(a, { chromosome: { x: cx + 0.2 * r, y: cy + 0.15 * r, side: 'r' }, 'nuclear-membrane': { x: cx - r * 0.5, y: cy, side: 'l' }, centriole: { x: top[0], y: top[1], side: 'r' } });
  } else if (s === 'metaphase') {
    b += `<line x1="${n(cx - r * 0.9)}" y1="${n(cy)}" x2="${n(cx + r * 0.9)}" y2="${n(cy)}" stroke="${INK}" stroke-width="0.8" stroke-dasharray="4 3"/>`;
    const xs = [-0.45, -0.15, 0.15, 0.45].map((k) => cx + k * r);
    for (const x of xs) for (const p of [top, bot]) b += `<line x1="${n(p[0])}" y1="${n(p[1])}" x2="${n(x)}" y2="${n(cy)}" stroke="${INK}" stroke-width="0.7"/>`;
    for (const x of xs) b += X(x, cy, r * 0.14, 90);
    b += centrioles(top) + centrioles(bot);
    Object.assign(a, { chromosome: { x: xs[3], y: cy, side: 'r' }, 'spindle-fibre': { x: (xs[0] + top[0]) / 2, y: (cy + top[1]) / 2, side: 'l' }, equator: { x: cx + r * 0.75, y: cy, side: 'r' }, centriole: { x: top[0], y: top[1], side: 'r' }, centromere: { x: xs[1], y: cy, side: 'l' } });
  } else {
    // anaphase: chromatids pulled to the poles (V shapes)
    const xs = [-0.36, -0.12, 0.12, 0.36].map((k) => cx + k * r);
    for (const sgn of [-1, 1]) for (const x of xs) {
      const y = cy + sgn * r * 0.42, pole = sgn < 0 ? top : bot;
      b += `<line x1="${n(pole[0])}" y1="${n(pole[1])}" x2="${n(x)}" y2="${n(y)}" stroke="${INK}" stroke-width="0.7"/>`;
      b += `<path d="M${n(x - 6)},${n(y - sgn * 12)} L${n(x)},${n(y)} L${n(x + 6)},${n(y - sgn * 12)}" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    for (const dx of [-0.5, 0.5]) b += curve([[top[0], top[1]], [cx + dx * r * 0.9, cy], [bot[0], bot[1]]], 0.7);
    b += centrioles(top) + centrioles(bot);
    Object.assign(a, { chromatid: { x: xs[3], y: cy - r * 0.42, side: 'r' }, 'spindle-fibre': { x: cx + 0.5 * r * 0.9 * 0.75, y: cy + r * 0.3, side: 'r' }, centriole: { x: bot[0], y: bot[1], side: 'l' } });
  }
  return { body: b, anchors: a };
}

const STAGES = ['interphase', 'prophase', 'metaphase', 'anaphase', 'telophase'];

export const mitosis: Drawer = ({ id, variant }): Drawn => {
  if (variant === 'all' || !STAGES.includes(variant)) {
    let b = '';
    STAGES.forEach((s, i) => { b += stage(id, s, 70 + i * 140, 82, 58).body; b += words(70 + i * 140, 168, s[0].toUpperCase() + s.slice(1), { size: 12, bold: true }); });
    return { w: 700, h: 182, body: b, anchors: {}, edge: true };
  }
  const st = stage(id, variant, 160, 125, 95);
  return { w: 320, h: 250, body: st.body, anchors: st.anchors, edge: true };
};

// ── Osmosis in cells ──
export const osmosisCells: Drawer = ({ id, variant }): Drawn => {
  let b = '';
  const anchors: Record<string, Anchor> = {};
  if (variant === 'animal') {
    b += circle(90, 85, 36, { fill: fill(id, 'sand'), width: 1.4 });
    const spikes: string[] = [];
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, r = i % 2 ? 26 : 33; spikes.push(`${n(260 + r * Math.cos(a))},${n(85 + r * Math.sin(a))}`); }
    b += `<polygon points="${spikes.join(' ')}" fill="${fill(id, 'sand')}" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>`;
    // Burst: the swollen cell's membrane has torn open and the cytoplasm is escaping through the gap.
    const tear = (deg: number) => [425 + 42 * Math.cos((deg * Math.PI) / 180), 85 + 42 * Math.sin((deg * Math.PI) / 180)];
    const [sx, sy] = tear(-28), [ex, ey] = tear(28);
    b += `<path d="M${n(ex)},${n(ey)} A42,42 0 1 1 ${n(sx)},${n(sy)}" fill="${fill(id, 'sand')}" stroke="${INK}" stroke-width="1.4"/>`;
    b += `<path d="M${n(sx)},${n(sy)} l5,4 l-3,4 M${n(ex)},${n(ey)} l5,-4 l-3,-4" fill="none" stroke="${INK}" stroke-width="1.2"/>`;
    const rs = seeded(5);
    for (let i = 0; i < 30; i++) { const r = 6 + rs() * 30, a = (rs() - 0.5) * 2.2; b += dot(462 + r * Math.cos(a), 85 + r * Math.sin(a), 1.1); }
    b += words(90, 150, 'Normal', { size: 11.5, bold: true }) + words(90, 164, '(isotonic solution)', { size: 10 });
    b += words(260, 150, 'Crenated (shrunken)', { size: 11.5, bold: true }) + words(260, 164, '(strong salt solution)', { size: 10 });
    b += words(425, 160, 'Burst (haemolysis)', { size: 11.5, bold: true }) + words(425, 174, '(distilled water)', { size: 10 });
    anchors['cell-membrane'] = { x: 54, y: 85, side: 'l' };
    anchors.cytoplasm = { x: 90, y: 85, side: 'l' };
    return { w: 500, h: 182, body: b, anchors, edge: true };
  }
  const cell = (x: number, kind: 'turgid' | 'flaccid' | 'plasmolysed') => {
    const y = 20, w = 130, h = 120;
    let g = '';
    if (kind === 'flaccid') g += `<path d="M${x},${y} Q${x + w / 2},${y + 6} ${x + w},${y} Q${x + w - 5},${y + h / 2} ${x + w},${y + h} Q${x + w / 2},${y + h - 6} ${x},${y + h} Q${x + 5},${y + h / 2} ${x},${y} Z" fill="#fff" stroke="${INK}" stroke-width="3"/>`;
    else g += roundRect(x, y, w, h, 8, { width: 3 });
    if (kind === 'plasmolysed') {
      g += blob([[x + 30, y + 30], [x + 65, y + 22], [x + 100, y + 32], [x + 104, y + 60], [x + 98, y + 92], [x + 62, y + 100], [x + 28, y + 90], [x + 24, y + 60]], fill(id, 'sand'), 1.2);
      g += blob([[x + 45, y + 45], [x + 66, y + 40], [x + 86, y + 48], [x + 86, y + 72], [x + 64, y + 82], [x + 44, y + 74]], '#fff', 1);
    } else {
      const inset = kind === 'turgid' ? 4 : 6;
      g += roundRect(x + inset, y + inset, w - inset * 2, h - inset * 2, 6, { fill: fill(id, 'sand'), width: 1 });
      const v = kind === 'turgid' ? 14 : 24;
      g += roundRect(x + v, y + v, w - v * 2, h - v * 2, 10, { width: 1 });
    }
    return g;
  };
  b += cell(20, 'turgid') + cell(185, 'flaccid') + cell(350, 'plasmolysed');
  b += words(85, 162, 'Turgid', { size: 11.5, bold: true }) + words(85, 176, '(in distilled water)', { size: 10 });
  b += words(250, 162, 'Flaccid', { size: 11.5, bold: true }) + words(250, 176, '(in a weak solution)', { size: 10 });
  b += words(415, 162, 'Plasmolysed', { size: 11.5, bold: true }) + words(415, 176, '(in strong sugar solution)', { size: 10 });
  Object.assign(anchors, {
    'cell-wall': { x: 21.5, y: 60, side: 'l' }, 'cell-membrane': { x: 375, y: 70, side: 'r' }, vacuole: { x: 415, y: 80, side: 'r' },
    cytoplasm: { x: 420, y: 112, side: 'r' }, space: { x: 470, y: 40, side: 'r' },
  });
  return { w: 500, h: 186, body: b, anchors, edge: true };
};
