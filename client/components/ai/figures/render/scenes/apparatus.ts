// @/components/ai/figures/render/scenes/apparatus.ts — Biology experiment
// set-ups as ECZ draws them: osmosis (thistle funnel, potato cylinders),
// the potometer, respiration (lime-water train), oxygen and germination,
// the choice chamber and soil drainage; also the 28-day menstrual cycle.
import { INK, n } from '../svg';
import { GREY, fill, path, words, type Anchor, type Drawer, type Drawn } from './kit';
import { blob, circle, curve, ellipse, roundRect, tube, type Pt } from './biokit';

const ar = (id: string) => `${id}-arr`;

/** A beaker (open top) with liquid up to `level`. */
export function beaker(x: number, y: number, w: number, h: number, level: number, liquid = GREY) {
  return `<rect x="${x + 2}" y="${y + h - level}" width="${w - 4}" height="${level - 2}" fill="${liquid}"/>`
    + `<path d="M${x - 4},${y} L${x},${y + 4} L${x},${y + h} L${x + w},${y + h} L${x + w},${y + 4} L${x + w + 4},${y}" fill="none" stroke="${INK}" stroke-width="1.6"/>`
    + `<line x1="${x}" y1="${y + h - level}" x2="${x + w}" y2="${y + h - level}" stroke="${INK}" stroke-width="0.8"/>`;
}
/** A conical flask with a bung. */
export function flask(cx: number, base: number, liquid = 0, fillValue = GREY) {
  const w = 80, h = 110, neck = 18, top = base - h;
  let g = '';
  if (liquid) g += `<path d="M${cx - w / 2 + liquid * 0.38},${base - liquid} L${cx + w / 2 - liquid * 0.38},${base - liquid} L${cx + w / 2},${base} L${cx - w / 2},${base} Z" fill="${fillValue}"/>`;
  g += `<path d="M${cx - neck / 2},${top} L${cx - neck / 2},${top + 40} L${cx - w / 2},${base} L${cx + w / 2},${base} L${cx + neck / 2},${top + 40} L${cx + neck / 2},${top}" fill="none" stroke="${INK}" stroke-width="1.6"/>`;
  g += roundRect(cx - neck / 2 - 3, top - 12, neck + 6, 16, 2, { fill: '#555', width: 1 });
  return g;
}

export const osmometer: Drawer = ({ id, variant }): Drawn => {
  if (variant === 'potato-cylinders') {
    let b = beaker(40, 80, 140, 150, 110) + beaker(240, 80, 140, 150, 110, '#d0d0d0');
    for (const x of [80, 110, 140]) b += roundRect(x - 8, 150, 16, 70, 3, { fill: '#fff', width: 1.2 });
    for (const x of [280, 310, 340]) b += roundRect(x - 7, 154, 14, 66, 3, { fill: '#fff', width: 1.2 });
    b += words(110, 255, 'P', { size: 15, bold: true }) + words(310, 255, 'Q', { size: 15, bold: true });
    return { w: 420, h: 265, body: b, edge: true, anchors: {
      'distilled-water': { x: 60, y: 120, side: 'l' }, 'potato-cylinder': { x: 140, y: 190, side: 'l' }, 'sugar-solution': { x: 370, y: 120, side: 'r' }, beaker: { x: 380, y: 200, side: 'r' },
    } };
  }
  let b = beaker(110, 170, 180, 160, 120);
  // Clamp stand
  b += path('M40,330 L40,20 M40,60 L180,60', { width: 3 }) + roundRect(18, 326, 60, 8, 2, { fill: '#555', width: 1 }) + roundRect(176, 52, 22, 16, 3, { fill: '#fff', width: 1.4 });
  // Thistle funnel: bulb closed by a membrane, filled with sugar solution, long tube up
  b += `<path d="M150,300 Q150,240 194,226 L194,30 L206,30 L206,226 Q250,240 250,300 Z" fill="#d0d0d0" stroke="none"/>`;
  b += `<path d="M150,300 Q150,240 194,226 L194,30 M206,30 L206,226 Q250,240 250,300" fill="none" stroke="${INK}" stroke-width="1.6"/>`;
  b += `<rect x="194.8" y="30" width="10.4" height="110" fill="#fff"/>` + path('M150,300 L250,300', { width: 3, dash: '6 2' });
  b += path('M188,140 L212,140', { width: 1 }) + path('M188,186 L212,186', { width: 1, dash: '3 2' });
  b += words(220, 144, 'final level', { size: 10, italic: true, anchor: 'start' }) + words(220, 190, 'starting level', { size: 10, italic: true, anchor: 'start' });
  return { w: 330, h: 340, body: b, edge: true, anchors: {
    'capillary-tube': { x: 200, y: 80, side: 'r' }, 'sugar-solution': { x: 200, y: 270, side: 'r' }, membrane: { x: 225, y: 300, side: 'r' },
    water: { x: 270, y: 320, side: 'r' }, beaker: { x: 290, y: 240, side: 'r' }, clamp: { x: 176, y: 60, side: 'l' },
  } };
};

export const potometer: Drawer = ({ id }): Drawn => {
  let b = '';
  // Leafy shoot in a rubber bung
  b += path('M120,140 L120,40', { width: 2.4 });
  for (const [x, y, s] of [[120, 60, -1], [120, 80, 1], [120, 100, -1], [120, 50, 1]] as const) b += blob([[x, y], [x + s * 20, y - 14], [x + s * 44, y - 6], [x + s * 22, y + 6]], '#fff', 1.2);
  b += roundRect(108, 140, 24, 16, 2, { fill: '#555', width: 1 });
  // Water-filled tubing, reservoir with a tap, capillary tube with scale and air bubble, beaker
  b += tube([[120, 156], [120, 190], [180, 190], [470, 190], [500, 190], [500, 250]], 8, { fill: GREY });
  b += roundRect(200, 60, 40, 60, 4, { fill: GREY, width: 1.4 }) + tube([[220, 120], [220, 186]], 6, { fill: GREY });
  b += path('M210,150 L230,150', { width: 4 }) + circle(220, 150, 4, { fill: '#fff', width: 1.4 });
  for (let x = 280; x <= 460; x += 10) b += path(`M${x},${204} L${x},${x % 50 ? 210 : 214}`, { width: 0.8 });
  b += path('M280,204 L460,204', { width: 1 });
  b += `<rect x="352" y="187" width="14" height="6" fill="#fff"/>`;
  b += path('M378,176 L398,176', { width: 1.2, arrow: ar(id) });
  b += beaker(470, 230, 60, 60, 40);
  return { w: 560, h: 300, body: b, edge: true, anchors: {
    'leafy-shoot': { x: 90, y: 70, side: 'l' }, 'rubber-bung': { x: 110, y: 148, side: 'l' }, reservoir: { x: 220, y: 80, side: 'r' }, tap: { x: 230, y: 150, side: 'r' },
    'air-bubble': { x: 359, y: 190, side: 'r' }, 'capillary-tube': { x: 430, y: 190, side: 'r' }, scale: { x: 300, y: 210, side: 'l' }, beaker: { x: 525, y: 270, side: 'r' },
  } };
};

export const respirationApparatus: Drawer = ({ id, variant }): Drawn => {
  let b = '';
  const xs = [70, 190, 330, 460];
  b += flask(xs[0], 230, 50, GREY) + flask(xs[1], 230, 50, '#efefef');
  b += flask(xs[3], 230, 50, '#efefef');
  // Bell jar on a plate (or a flask of seeds)
  b += `<path d="M280,230 L280,140 Q280,100 330,100 Q380,100 380,140 L380,230" fill="none" stroke="${INK}" stroke-width="1.6"/>` + path('M266,232 L394,232', { width: 3 });
  if (variant === 'seeds') for (let i = 0; i < 12; i++) b += ellipse(298 + (i % 6) * 13, 220 - Math.floor(i / 6) * 9, 6, 4, { fill: '#fff', width: 1 });
  else b += blob([[300, 225], [310, 205], [340, 200], [362, 212], [358, 228]], '#fff', 1.4) + circle(360, 210, 2, { fill: INK, width: 0 });
  const pipe = (pts: Pt[]) => path(pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' '), { width: 2 });
  b += pipe([[20, 60], [64, 60], [64, 205]]) + pipe([[76, 105], [76, 60], [184, 60], [184, 205]]) + pipe([[196, 105], [196, 60], [320, 60], [320, 110]]);
  b += pipe([[340, 110], [340, 60], [454, 60], [454, 205]]) + pipe([[466, 105], [466, 60], [520, 60]]);
  b += path('M24,48 L52,48', { width: 1.2, arrow: ar(id) }) + path('M490,48 L516,48', { width: 1.2, arrow: ar(id) });
  b += words(20, 40, 'air in', { size: 10.5, italic: true, anchor: 'start' }) + words(520, 40, 'to pump', { size: 10.5, italic: true, anchor: 'end' });
  b += words(70, 252, 'A', { size: 14, bold: true }) + words(190, 252, 'B', { size: 14, bold: true }) + words(330, 252, 'C', { size: 14, bold: true }) + words(460, 252, 'D', { size: 14, bold: true });
  return { w: 540, h: 262, body: b, edge: true, anchors: {
    'sodium-hydroxide': { x: 70, y: 215, side: 'l' }, 'limewater-check': { x: 190, y: 215, side: 'l' }, organism: { x: 330, y: 215, side: 'r' },
    'bell-jar': { x: 380, y: 160, side: 'r' }, limewater: { x: 470, y: 215, side: 'r' },
  } };
};

export const germinationFlasks: Drawer = ({ id }): Drawn => {
  let b = flask(110, 260, 40, '#d0d0d0') + flask(310, 260, 40, '#efefef');
  for (const cx of [110, 310]) {
    // Seeds on cotton wool held in a wire basket inside the flask
    b += `<path d="M${cx - 30},${196} L${cx - 18},${214} L${cx + 18},${214} L${cx + 30},${196}" fill="none" stroke="${INK}" stroke-width="1"/>` + path(`M${cx},${150} L${cx},${196}`, { width: 0.8 });
    b += blob([[cx - 26, 200], [cx, 194], [cx + 26, 200], [cx + 16, 212], [cx - 16, 212]], fill(id, 'dots'), 1);
    for (let i = 0; i < 5; i++) b += ellipse(cx - 16 + i * 8, 191, 4.5, 3.2, { width: 1 });
  }
  b += words(110, 285, 'A', { size: 14, bold: true }) + words(310, 285, 'B', { size: 14, bold: true });
  return { w: 420, h: 295, body: b, edge: true, anchors: {
    seeds: { x: 94, y: 191, side: 'l' }, 'cotton-wool': { x: 96, y: 206, side: 'l' }, 'alkaline-pyrogallol': { x: 90, y: 245, side: 'l' },
    water: { x: 330, y: 245, side: 'r' }, 'rubber-bung': { x: 320, y: 144, side: 'r' },
  } };
};

export const choiceChamber: Drawer = ({ id, variant }): Drawn => {
  let b = circle(200, 150, 130, { width: 2 }) + path('M200,20 L200,280', { width: 1.2, dash: '5 3' });
  const moist = variant === 'moisture';
  if (moist) { b += `<path d="M200,30 A120,120 0 0 0 200,270 Z" fill="${fill(id, 'water')}"/>` + `<path d="M200,30 A120,120 0 0 1 200,270 Z" fill="${fill(id, 'dots')}"/>`; }
  else b += `<path d="M200,20 A130,130 0 0 0 200,280 Z" fill="#555"/>`;
  b += circle(200, 150, 118, { fill: 'none', width: 1, dash: '1.5 2.5' });
  const bug = (x: number, y: number, r: number) => `<g transform="rotate(${r} ${x} ${y})">${ellipse(x, y, 8, 4.5, { fill: '#fff', width: 1.2 })}<path d="M${x - 4},${y - 4} l-2,-5 M${x},${y - 4} l0,-6 M${x + 4},${y - 4} l2,-5 M${x - 4},${y + 4} l-2,5 M${x},${y + 4} l0,6 M${x + 4},${y + 4} l2,5" stroke="${INK}" stroke-width="0.7"/></g>`;
  for (const [x, y, r] of (moist ? [[120, 110, 20], [150, 190, -40], [110, 160, 70], [160, 130, 10], [260, 200, 30]] : [[120, 110, 20], [150, 190, -40], [100, 160, 70], [160, 130, 10], [170, 220, 50], [270, 120, -30]]) as [number, number, number][]) b += bug(x, y, r);
  b += words(200, 300, moist ? 'humid side  |  dry side' : 'dark side  |  light side', { size: 11, italic: true });
  return { w: 400, h: 310, body: b, edge: true, anchors: {
    [moist ? 'humid-side' : 'dark-side']: { x: 90, y: 230, side: 'l' }, [moist ? 'dry-side' : 'light-side']: { x: 300, y: 200, side: 'r' },
    gauze: { x: 316, y: 150, side: 'r' }, organism: { x: 150, y: 190, side: 'l' },
  } };
};

export const soilDrainage: Drawer = ({ id, items }): Drawn => {
  const names = items.length ? items.slice(0, 3) : ['X', 'Y', 'Z'];
  const levels = [18, 46, 80];
  let b = '';
  names.forEach((nm, i) => {
    const cx = 80 + i * 140;
    b += `<path d="M${cx - 50},40 L${cx - 8},110 L${cx - 8},140 M${cx + 50},40 L${cx + 8},110 L${cx + 8},140" fill="none" stroke="${INK}" stroke-width="1.6"/>`;
    b += `<path d="M${cx - 44},50 L${cx + 44},50 L${cx + 14},100 L${cx - 14},100 Z" fill="${fill(id, i === 0 ? 'dots' : i === 1 ? 'sand' : 'hatch')}" stroke="${INK}" stroke-width="0.8"/>`;
    b += blob([[cx - 14, 100], [cx + 14, 100], [cx + 8, 112], [cx - 8, 112]], '#fff', 0.8);
    b += `<rect x="${cx - 18}" y="${260 - levels[i]}" width="36" height="${levels[i]}" fill="${GREY}"/><path d="M${cx - 18},150 L${cx - 18},260 L${cx + 18},260 L${cx + 18},150" fill="none" stroke="${INK}" stroke-width="1.5"/>`;
    for (let y = 160; y < 260; y += 10) b += path(`M${cx - 18},${y} L${cx - 10},${y}`, { width: 0.7 });
    b += words(cx, 28, `Soil ${nm}`, { size: 12, bold: true });
  });
  return { w: 360, h: 270, body: b, edge: true, anchors: {
    funnel: { x: 30 + 8, y: 46, side: 'l' }, soil: { x: 60, y: 70, side: 'l' }, 'cotton-wool': { x: 72, y: 106, side: 'l' }, 'measuring-cylinder': { x: 62, y: 200, side: 'l' },
    water: { x: 358 - 40, y: 230, side: 'r' },
  } };
};

/** The 28-day menstrual cycle as a clock: menstruation, the fertile days and ovulation. */
export const menstrualCycle: Drawer = ({ id }): Drawn => {
  const cx = 190, cy = 170, R = 130;
  let b = circle(cx, cy, R, { width: 1.6 }) + circle(cx, cy, R - 28, { width: 1.2 });
  const at = (day: number, r: number): Pt => { const a = ((day - 1) / 28) * Math.PI * 2 - Math.PI / 2; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const band = (d0: number, d1: number, fillValue: string) => {
    const [x0, y0] = at(d0, R), [x1, y1] = at(d1, R), [x2, y2] = at(d1, R - 28), [x3, y3] = at(d0, R - 28), large = d1 - d0 > 14 ? 1 : 0;
    return `<path d="M${n(x0)},${n(y0)} A${R},${R} 0 ${large} 1 ${n(x1)},${n(y1)} L${n(x2)},${n(y2)} A${R - 28},${R - 28} 0 ${large} 0 ${n(x3)},${n(y3)} Z" fill="${fillValue}" stroke="${INK}" stroke-width="1"/>`;
  };
  b += band(1, 6, '#555') + band(10, 17, fill(id, 'dots'));
  for (let d = 1; d <= 28; d++) { const [x, y] = at(d + 0.5, R + 12); b += words(x, y + 4, String(d), { size: 9.5 }); const [a, c] = at(d, R), [e, f] = at(d, R - 28); b += path(`M${n(a)},${n(c)} L${n(e)},${n(f)}`, { width: 0.5 }); }
  const [ox, oy] = at(14.5, R - 14);
  b += circle(ox, oy, 6, { fill: INK, width: 0 });
  return { w: 380, h: 340, body: b, edge: true, anchors: {
    menstruation: { x: at(3.5, R - 14)[0], y: at(3.5, R - 14)[1], side: 'r' }, 'fertile-period': { x: at(12, R - 14)[0], y: at(12, R - 14)[1], side: 'r' },
    ovulation: { x: ox, y: oy, side: 'l' }, 'day-1': { x: at(1, R)[0], y: at(1, R)[1], side: 'l' },
  } };
};
