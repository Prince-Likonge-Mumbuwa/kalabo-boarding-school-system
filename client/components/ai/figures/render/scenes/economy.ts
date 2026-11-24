// @/components/ai/figures/render/scenes/economy.ts — economic activities:
// irrigation methods in the FAO manual's style (furrow with siphons,
// sprinkler, drip, centre pivot, basin, the layout of a scheme, a canal's
// cross-section), a hydro-electric power station (dam or natural fall), and
// open-cast and underground mining.
import { INK, n } from '../svg';
import { GREY, area, arrow, fill, path, words, type Anchor, type Drawer } from './kit';

/** A small crop plant. */
const plant = (x: number, y: number, s = 1) => path(`M${n(x)},${n(y)} V${n(y - 9 * s)} M${n(x)},${n(y - 5 * s)} l${n(-4 * s)},${n(-4 * s)} M${n(x)},${n(y - 6 * s)} l${n(4 * s)},${n(-4 * s)} M${n(x)},${n(y - 9 * s)} l${n(-3 * s)},${n(-3 * s)} M${n(x)},${n(y - 9 * s)} l${n(3 * s)},${n(-3 * s)}`, { width: 0.9 });
const water = (id: string, d: string) => area(d, fill(id, 'water'), { width: 1.1 });

function furrow(id: string) {
  // A field seen at an angle: ridges and furrows run back from a field canal at the front.
  const A = { x: 50, y: 230 }, B = { x: 410, y: 230 }, back = { x: 90, y: -150 };
  let body = area(`M${A.x},${A.y} L${B.x},${B.y} L${B.x + back.x},${B.y + back.y} L${A.x + back.x},${A.y + back.y} Z`, '#fff', { width: 1.2 });
  const k = 9;
  for (let i = 0; i <= k; i++) {
    const t = i / k, x = A.x + (B.x - A.x) * t, y = A.y;
    if (i % 2 === 1) {
      body += path(`M${n(x)},${y} L${n(x + back.x)},${n(y + back.y)}`, { width: 5, color: GREY });
      body += path(`M${n(x - 3)},${y} L${n(x - 3 + back.x)},${n(y + back.y)} M${n(x + 3)},${y} L${n(x + 3 + back.x)},${n(y + back.y)}`, { width: 0.8 });
    }
    if (i % 2 === 0 && i > 0 && i < k) for (let s = 0.12; s < 0.95; s += 0.17) body += plant(x + back.x * s, y + back.y * s, 0.9 - s * 0.35);
  }
  // Field canal in front, siphons carrying water over its bank into each furrow
  body += water(id, 'M20,246 H460 V266 H20 Z') + path('M20,240 H460', { width: 1.3 });
  for (let i = 1; i <= k; i += 2) { const x = A.x + ((B.x - A.x) * i) / k; body += path(`M${n(x)},252 C${n(x)},236 ${n(x)},236 ${n(x + 4)},224`, { width: 1.6 }); }
  body += arrow(id, 40, 256, 100, 256, { width: 1.2 });
  return {
    body, w: 480, h: 280,
    anchors: { 'field-canal': { x: 300, y: 258, side: 'r' }, furrow: { x: A.x + ((B.x - A.x) * 5) / k + back.x * 0.5, y: A.y + back.y * 0.5, side: 'r' }, ridge: { x: A.x + ((B.x - A.x) * 4) / k + back.x * 0.3, y: A.y + back.y * 0.3, side: 'l' },
      crops: { x: A.x + ((B.x - A.x) * 2) / k + back.x * 0.6, y: A.y + back.y * 0.6 - 6, side: 'l' }, siphon: { x: A.x + (B.x - A.x) / k, y: 238, side: 'l' } } as Record<string, Anchor>,
  };
}

function sprinkler(id: string) {
  let body = path('M0,240 H480', { width: 1.2 });
  for (let row = 0; row < 4; row++) for (let x = 20; x < 470; x += 22) body += plant(x + row * 6, 238 - row * 24, 1 - row * 0.12);
  // Pond and pump on the left, a main pipe and a lateral with risers and rotating heads
  body += water(id, 'M4,262 C20,250 70,250 86,262 C70,274 20,274 4,262 Z');
  body += `<rect x="92" y="236" width="24" height="18" fill="#fff" stroke="${INK}" stroke-width="1.2"/>` + words(104, 249, 'P', { bold: true, size: 10 });
  body += path('M86,258 H92 M116,246 H470', { width: 3 });
  for (const x of [170, 270, 370]) {
    body += path(`M${x},246 V150`, { width: 2.2 }) + `<rect x="${x - 6}" y="144" width="12" height="7" fill="${INK}"/>`;
    for (const side of [-1, 1]) for (let k = 1; k <= 5; k++) {
      const t = k / 5, dx = side * 70 * t, dy = -26 * Math.sin(Math.PI * t) + 40 * t * t;
      body += `<circle cx="${n(x + dx)}" cy="${n(148 + dy)}" r="1.4" fill="${INK}"/>`;
    }
  }
  return { body, w: 480, h: 280, anchors: { pump: { x: 104, y: 245, side: 'l' }, source: { x: 40, y: 262, side: 'l' }, pipe: { x: 220, y: 246, side: 'r' }, sprinkler: { x: 270, y: 147, side: 'r' }, crops: { x: 420, y: 214, side: 'r' } } as Record<string, Anchor> };
}

function drip(id: string) {
  // A raised tank feeds a pipe laid along the row; each emitter wets the soil round one plant's roots.
  let body = area('M0,200 H480 V280 H0 Z', fill(id, 'sand'), { width: 1.2 });
  body += `<rect x="20" y="70" width="60" height="50" fill="${fill(id, 'water')}" stroke="${INK}" stroke-width="1.3"/>` + path('M26,120 V200 M74,120 V200', { width: 1.4 });
  body += path('M50,120 V190 H470', { width: 3 });
  for (let x = 120; x <= 440; x += 64) {
    body += `<ellipse cx="${x}" cy="222" rx="24" ry="16" fill="${GREY}" stroke="${INK}" stroke-width="0.8" stroke-dasharray="3 2"/>`;
    body += path(`M${x},200 V170 M${x},184 l-12,-10 M${x},180 l12,-12 M${x},172 l-8,-12 M${x},172 l8,-12`, { width: 1.3 });
    body += `<rect x="${x + 6}" y="186" width="6" height="7" fill="${INK}"/>` + `<circle cx="${x + 9}" cy="198" r="1.6" fill="${INK}"/>`;
    body += path(`M${x - 6},212 q-4,8 0,16 M${x + 6},212 q4,8 0,16`, { width: 0.7 });
  }
  return { body, w: 480, h: 280, anchors: { source: { x: 50, y: 92, side: 'l' }, pipe: { x: 250, y: 190, side: 'r' }, emitter: { x: 312, y: 190, side: 'r' }, crops: { x: 376, y: 172, side: 'r' }, 'water-level': { x: 120, y: 222, side: 'l' } } as Record<string, Anchor> };
}

function centrePivot(id: string) {
  const cx = 240, cy = 150, R = 130;
  let body = `<rect x="${cx - R - 6}" y="${cy - R - 6}" width="${2 * R + 12}" height="${2 * R + 12}" fill="${fill(id, 'hatch')}" stroke="${INK}" stroke-width="1.2"/>`;
  body += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#fff" stroke="${INK}" stroke-width="1.4"/>`;
  for (let r = 18; r < R; r += 14) body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${INK}" stroke-width="0.5" stroke-dasharray="1.5 3"/>`;
  const a = -0.5, ex = cx + R * Math.cos(a), ey = cy + R * Math.sin(a);
  body += path(`M${cx},${cy} L${n(ex)},${n(ey)}`, { width: 3 });
  for (let k = 1; k <= 4; k++) { const t = k / 4.3; body += `<circle cx="${n(cx + R * t * Math.cos(a))}" cy="${n(cy + R * t * Math.sin(a))}" r="4" fill="#fff" stroke="${INK}" stroke-width="1.2"/>`; }
  body += `<circle cx="${cx}" cy="${cy}" r="7" fill="${INK}"/>`;
  body += path(`M${n(cx + (R + 14) * Math.cos(a - 0.5))},${n(cy + (R + 14) * Math.sin(a - 0.5))} A${R + 14},${R + 14} 0 0,1 ${n(cx + (R + 14) * Math.cos(a - 0.1))},${n(cy + (R + 14) * Math.sin(a - 0.1))}`, { width: 1.4, arrow: `${id}-arr` });
  return { body, w: 480, h: 300, anchors: { source: { x: cx, y: cy, side: 'l' }, 'pivot-arm': { x: cx + R * 0.6 * Math.cos(a), y: cy + R * 0.6 * Math.sin(a), side: 'r' }, sprinkler: { x: cx + (R / 4.3) * 3 * Math.cos(a), y: cy + (R / 4.3) * 3 * Math.sin(a), side: 'r' }, crops: { x: cx - 70, y: cy + 60, side: 'l' } } as Record<string, Anchor> };
}

function basin(id: string) {
  // Level basins surrounded by bunds; a field canal along the top lets water into each.
  let body = water(id, 'M20,30 H460 V48 H20 Z') + path('M20,26 H460 M20,52 H460', { width: 1.2 });
  const cols = 4, rows = 2, x0 = 30, y0 = 70, bw = 105, bh = 95;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = x0 + i * bw, y = y0 + j * bh;
    body += `<rect x="${x}" y="${y}" width="${bw - 10}" height="${bh - 10}" fill="${fill(id, 'water')}" stroke="${INK}" stroke-width="4"/><rect x="${x}" y="${y}" width="${bw - 10}" height="${bh - 10}" fill="none" stroke="#fff" stroke-width="1.6"/>`;
    for (let px = x + 14; px < x + bw - 16; px += 16) for (let py = y + 22; py < y + bh - 12; py += 18) body += plant(px, py, 0.8);
  }
  for (let i = 0; i < cols; i++) body += path(`M${x0 + i * bw + 40},52 V70`, { width: 5, color: GREY });
  return { body, w: 480, h: 270, anchors: { 'field-canal': { x: 240, y: 39, side: 'r' }, basin: { x: x0 + bw + 40, y: y0 + 40, side: 'r' }, bund: { x: x0 + 2 * bw - 6, y: y0 + bh + 40, side: 'r' }, crops: { x: x0 + 20, y: y0 + 30, side: 'l' } } as Record<string, Anchor> };
}

function canalLayout(id: string) {
  // Plan of a scheme: river -> intake / pumping station -> main canal -> field canals -> fields -> drain back to the river.
  let body = `<path d="M40,0 C30,80 60,160 40,300" fill="none" stroke="${INK}" stroke-width="16"/><path d="M40,0 C30,80 60,160 40,300" fill="none" stroke="${GREY}" stroke-width="13"/>`;
  body += `<rect x="52" y="44" width="22" height="18" fill="#fff" stroke="${INK}" stroke-width="1.3"/>`;
  const canal = (d: string, w: number) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}"/><path d="${d}" fill="none" stroke="${GREY}" stroke-width="${w - 2.4}"/>`;
  body += canal('M74,53 H460', 7);
  for (const x of [140, 260, 380]) {
    body += canal(`M${x},53 V250`, 5);
    for (let y = 80; y < 240; y += 55) for (const side of [-1, 1]) {
      const fx = side < 0 ? x - 104 : x + 8;
      body += `<rect x="${fx}" y="${y}" width="96" height="44" fill="none" stroke="${INK}" stroke-width="0.9"/>`;
      for (let px = fx + 10; px < fx + 92; px += 14) body += path(`M${px},${y + 6} V${y + 38}`, { width: 0.5, dash: '2 2' });
    }
  }
  body += path('M60,272 H460', { width: 2, dash: '7 3' }) + arrow(id, 120, 272, 66, 272, { width: 1.2 });
  return { body, w: 480, h: 300, anchors: { source: { x: 40, y: 140, side: 'l' }, pump: { x: 63, y: 53, side: 'l' }, 'main-canal': { x: 330, y: 53, side: 'r' }, 'field-canal': { x: 260, y: 150, side: 'r' }, crops: { x: 420, y: 120, side: 'r' }, drain: { x: 300, y: 272, side: 'r' } } as Record<string, Anchor> };
}

function canalSection(id: string) {
  // A trapezoidal canal: banks, water level, freeboard and side slope.
  let body = area('M0,90 H90 L180,230 H300 L390,90 H480 V280 H0 Z', fill(id, 'strata'), { width: 1.5 });
  body += water(id, 'M110,121 H370 L300,230 H180 Z');
  body += path('M90,121 H110', { dash: '3 2', width: 0.8 });
  body += path('M60,90 V121', { width: 1, arrow: `${id}-arr`, both: true }) + words(44, 110, 'f', { italic: true, size: 12 });
  body += path('M420,121 V230', { width: 1, arrow: `${id}-arr`, both: true }) + path('M372,121 H426 M300,230 H426', { width: 0.6, dash: '2 2' }) + words(434, 180, 'h', { italic: true, size: 12 });
  body += path('M180,250 H300', { width: 1, arrow: `${id}-arr`, both: true }) + words(240, 266, 'b', { italic: true, size: 12 });
  return { body, w: 480, h: 280, anchors: { bank: { x: 45, y: 92, side: 'l' }, 'water-level': { x: 300, y: 121, side: 'r' }, freeboard: { x: 64, y: 106, side: 'l' }, 'main-canal': { x: 240, y: 180, side: 'r' } } as Record<string, Anchor> };
}

export const irrigation: Drawer = ({ id, variant }) => {
  const d = variant === 'sprinkler' ? sprinkler(id) : variant === 'drip' ? drip(id) : variant === 'centre-pivot' ? centrePivot(id) : variant === 'basin' ? basin(id)
    : variant === 'canal-layout' ? canalLayout(id) : variant === 'canal-section' ? canalSection(id) : furrow(id);
  return { w: d.w, h: d.h, body: d.body, anchors: d.anchors };
};

export const hep: Drawer = ({ id, variant }) => {
  let body = '';
  const anchors: Record<string, Anchor> = {};
  if (variant === 'waterfall') {
    // A natural head of water: the river falls over a cliff; a penstock carries water down to the station at the bottom.
    body += area('M0,110 H250 L262,300 H0 Z', fill(id, 'bricks'), { width: 1.4 }) + area('M262,300 V250 H480 V300 Z', fill(id, 'bricks'), { width: 1 });
    body += water(id, 'M0,96 H254 V110 H0 Z') + water(id, 'M262,240 H480 V250 H262 Z');
    for (const dx of [0, 5, 10]) body += path(`M${252 + dx * 0.2},${100 + dx} C${268 + dx},140 ${272 + dx},200 ${270 + dx},240`, { width: 1 });
    body += path('M120,110 C150,170 200,220 312,226', { width: 7 }) + path('M120,110 C150,170 200,220 312,226', { width: 4, color: GREY });
    anchors.river = { x: 60, y: 102, side: 'l' }; anchors.intake = { x: 120, y: 110, side: 'l' }; anchors.penstock = { x: 190, y: 200, side: 'l' }; anchors.head = { x: 230, y: 170, side: 'l' };
    body += path('M226,104 V226', { width: 1, arrow: `${id}-arr`, both: true });
  } else {
    // A dam holds back a reservoir; water drops through the penstock to the turbines.
    body += area('M0,250 H480 V300 H0 Z', fill(id, 'bricks'), { width: 1.2 });
    body += water(id, 'M0,70 H170 L200,250 H0 Z');
    body += area('M170,60 H200 L250,250 H190 Z', fill(id, 'hatch'), { width: 1.6 });
    body += path('M150,200 C180,206 220,230 312,226', { width: 7 }) + path('M150,200 C180,206 220,230 312,226', { width: 4, color: GREY });
    body += water(id, 'M380,240 H480 V250 H380 Z');
    anchors.reservoir = { x: 70, y: 150, side: 'l' }; anchors.dam = { x: 210, y: 120, side: 'r' }; anchors.intake = { x: 150, y: 200, side: 'l' }; anchors.penstock = { x: 250, y: 226, side: 'l' };
    anchors.river = { x: 450, y: 245, side: 'r' };
    body += path('M130,72 V226', { width: 1, arrow: `${id}-arr`, both: true });
    anchors.head = { x: 130, y: 120, side: 'l' };
  }
  // Power station with turbine and generator, tailrace, transmission line
  body += `<rect x="300" y="170" width="80" height="80" fill="#fff" stroke="${INK}" stroke-width="1.5"/>`;
  body += `<circle cx="340" cy="228" r="13" fill="#fff" stroke="${INK}" stroke-width="1.3"/>` + path('M330,220 L350,236 M330,236 L350,220 M340,215 V241 M327,228 H353', { width: 0.9 });
  body += `<rect x="326" y="186" width="28" height="20" fill="${fill(id, 'cross')}" stroke="${INK}" stroke-width="1.2"/>` + path('M340,206 V215', { width: 2 });
  body += arrow(id, 362, 242, 420, 244, { width: 1.3 });
  body += path('M440,160 L452,60 L464,160 M445,120 H459 M448,90 H456 M436,72 H468', { width: 1.2 }) + path('M380,176 C400,120 420,80 436,72 M468,72 C474,74 478,76 480,78', { width: 0.8 });
  Object.assign(anchors, { 'power-station': { x: 380, y: 180, side: 'r' }, turbine: { x: 353, y: 228, side: 'r' }, generator: { x: 354, y: 196, side: 'r' }, tailrace: { x: 400, y: 243, side: 'r' }, 'power-lines': { x: 452, y: 66, side: 'r' } });
  return { w: 480, h: 300, body, anchors };
};

export const mining: Drawer = ({ id, variant }) => {
  let body = '';
  const anchors: Record<string, Anchor> = {};
  if (variant === 'underground') {
    body += area('M0,60 H300 L380,30 L480,40 V300 H0 Z', fill(id, 'strata'), { width: 1.4 });
    body += area('M150,110 L440,250 L440,290 L130,140 Z', fill(id, 'cross'), { width: 1.4 }); // the ore body, dipping
    body += `<rect x="58" y="60" width="16" height="200" fill="#fff" stroke="${INK}" stroke-width="1.4"/>`; // shaft
    body += path('M44,60 L66,8 L88,60 M52,40 H80 M66,8 V60', { width: 1.6 }) + `<circle cx="66" cy="10" r="5" fill="#fff" stroke="${INK}" stroke-width="1.2"/>`; // headframe
    for (const y of [140, 190, 240]) body += `<rect x="74" y="${y}" width="${150 + (y - 140) * 1.6}" height="10" fill="#fff" stroke="${INK}" stroke-width="1.2"/>`;
    body += `<path d="M480,170 H370 V182 H480" fill="#fff" stroke="${INK}" stroke-width="1.3"/>`; // adit from the hillside
    Object.assign(anchors, { shaft: { x: 66, y: 120, side: 'l' }, headframe: { x: 66, y: 30, side: 'l' }, level: { x: 150, y: 195, side: 'l' }, adit: { x: 430, y: 176, side: 'r' }, 'ore-body': { x: 360, y: 225, side: 'r' }, overburden: { x: 200, y: 80, side: 'r' } });
  } else {
    // Open cast: benches cut down through the overburden to the ore
    body += area('M0,90 H480 V300 H0 Z', fill(id, 'strata'), { width: 1.2 });
    body += area('M0,190 H480 V240 H0 Z', fill(id, 'cross'), { width: 1.2 });
    const pit = 'M110,90 L130,90 L140,120 L170,120 L180,150 L210,150 L220,180 L250,180 L256,210 L330,210 L336,180 L366,180 L376,150 L406,150 L416,120 L446,120 L456,90';
    body += area(`${pit} Z`, '#fff', { width: 1.6 });
    body += area('M0,90 C10,50 60,40 90,90 Z', fill(id, 'dots'), { width: 1.3 }); // waste dump
    body += `<rect x="372" y="140" width="22" height="9" fill="#fff" stroke="${INK}" stroke-width="1.1"/><rect x="392" y="134" width="8" height="15" fill="#fff" stroke="${INK}" stroke-width="1.1"/><circle cx="378" cy="150" r="3" fill="${INK}"/><circle cx="394" cy="150" r="3" fill="${INK}"/>`;
    Object.assign(anchors, { overburden: { x: 60, y: 140, side: 'l' }, 'ore-body': { x: 300, y: 225, side: 'r' }, benches: { x: 416, y: 120, side: 'r' }, 'waste-dump': { x: 45, y: 72, side: 'l' }, truck: { x: 386, y: 136, side: 'r' } });
  }
  return { w: 480, h: 300, body, anchors };
};
