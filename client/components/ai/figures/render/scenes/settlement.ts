// @/components/ai/figures/render/scenes/settlement.ts — population and
// settlement: settlement patterns in plan view (buildings as small black
// blocks, as on a map extract), settlement sites on a sketch map, and the
// models of urban land use (Burgess concentric, Hoyt sector, Harris–Ullman
// multiple nuclei). Buildings are placed by a fixed random sequence, so a
// figure looks the same every time it is opened.
import { INK, n } from '../svg';
import { area, block, fill, path, seeded, words, type Anchor, type Drawer } from './kit';

const road = (d: string, w = 7) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="butt"/><path d="${d}" fill="none" stroke="#fff" stroke-width="${w - 2.6}" stroke-linecap="butt"/>`;
const track = (d: string) => path(d, { width: 0.9, dash: '3 3' });
/** Rivers on these plans are a single firm line (as on a map extract), so they never look like roads. */
const riverLine = (d: string, w = 7) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${n(Math.max(1.8, w / 3))}" stroke-linecap="round"/>`;
const bush = (x: number, y: number) => `<circle cx="${n(x)}" cy="${n(y)}" r="2.3" fill="none" stroke="${INK}" stroke-width="0.7"/>`;

type Kind = 'nucleated' | 'linear' | 'dispersed' | 'isolated' | 'cruciform';

/** One pattern drawn in a w × h panel at (ox, oy). Returns its drawing and where its road, river and centre are. */
function pattern(kind: Kind, ox: number, oy: number, w: number, h: number, seed: number) {
  const rnd = seeded(seed);
  const X = (v: number) => ox + v * w, Y = (v: number) => oy + v * h;
  let out = `<rect x="${ox}" y="${oy}" width="${w}" height="${h}" fill="#fff" stroke="${INK}" stroke-width="1.2"/>`;
  const marks: { road?: Anchor; river?: Anchor; centre?: Anchor } = {};
  const blocks: [number, number, number][] = [];
  const clearOf = (x: number, y: number, gap = 7) => blocks.every(([bx, by]) => Math.hypot(bx - x, by - y) > gap);

  if (kind === 'nucleated' || kind === 'cruciform') {
    const cx = X(0.5), cy = Y(0.48);
    out += road(`M${ox},${n(cy)} H${ox + w}`) + road(`M${n(cx)},${oy} V${oy + h}`);
    marks.road = { x: X(0.9), y: cy, side: 'r' };
    if (kind === 'nucleated') {
      out += riverLine(`M${ox},${n(Y(0.86))} C${n(X(0.2))},${n(Y(0.8))} ${n(X(0.3))},${n(Y(0.95))} ${n(X(0.42))},${oy + h}`, 6);
      marks.river = { x: X(0.15), y: Y(0.84), side: 'l' };
      // A market square with a central building just off the crossroads
      out += `<rect x="${n(cx + 6)}" y="${n(cy - 22)}" width="16" height="15" fill="none" stroke="${INK}" stroke-width="0.9"/>` + block(cx + 14, cy - 14.5, 6, 6);
      marks.centre = { x: cx + 14, y: cy - 14, side: 'r' };
      blocks.push([cx + 14, cy - 14, 0]);
      const want = Math.round((w * h) / 520);
      for (let tries = 0, placed = 0; tries < 3000 && placed < want; tries++) {
        const r = 10 + Math.min(w, h) * 0.27 * Math.sqrt(rnd()), a = rnd() * Math.PI * 2;
        const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
        if (Math.abs(x - cx) < 7 || Math.abs(y - cy) < 7 || (x > cx + 3 && x < cx + 25 && y > cy - 25 && y < cy - 4) || !clearOf(x, y)) continue;
        blocks.push([x, y, rnd() < 0.5 ? 0 : 90]); placed++;
      }
      // Fields beyond the village
      for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 + 0.2, r0 = Math.min(w, h) * 0.36; out += path(`M${n(cx + r0 * Math.cos(a))},${n(cy + r0 * Math.sin(a))} L${n(cx + 2 * r0 * Math.cos(a))},${n(cy + 2 * r0 * Math.sin(a))}`, { width: 0.6, dash: '2 3' }); }
    } else {
      for (const dir of [[1, 0], [-1, 0], [0, 1], [0, -1]]) for (let d = 14; d < Math.min(w, h) * 0.46; d += 9) for (const side of [-1, 1]) {
        if (rnd() < 0.15) continue;
        const x = cx + dir[0] * d + (dir[1] ? side * 10 : 0), y = cy + dir[1] * d + (dir[0] ? side * 10 : 0);
        blocks.push([x + (rnd() - 0.5) * 2, y + (rnd() - 0.5) * 2, dir[0] ? 0 : 90]);
      }
      marks.centre = { x: cx, y: cy, side: 'r' };
    }
  } else if (kind === 'linear') {
    // A road across the panel with buildings close along both sides, and long strip fields behind them
    const p = (t: number) => ({ x: X(t), y: Y(0.55) - Math.sin(t * Math.PI) * h * 0.08 - t * h * 0.1 });
    const d = Array.from({ length: 21 }, (_, i) => { const q = p(i / 20); return `${n(q.x)},${n(q.y)}`; });
    out += road(`M${d.join(' L')}`);
    marks.road = { ...p(0.92), side: 'r' };
    for (let t = 0.04; t < 0.97; t += 0.045) {
      const a = p(t), b = p(t + 0.01), ang = Math.atan2(b.y - a.y, b.x - a.x), nx = -Math.sin(ang), ny = Math.cos(ang);
      for (const side of [-1, 1]) {
        if (rnd() < 0.12) continue;
        const off = 10 + rnd() * 2;
        blocks.push([a.x + side * off * nx, a.y + side * off * ny, (ang * 180) / Math.PI]);
        out += path(`M${n(a.x + side * 17 * nx)},${n(a.y + side * 17 * ny)} L${n(a.x + side * 48 * nx)},${n(a.y + side * 48 * ny)}`, { width: 0.6, dash: '2 3' });
      }
    }
    marks.centre = { ...p(0.5), side: 'r' };
  } else if (kind === 'dispersed') {
    // Farmsteads spread out among their fields, joined by tracks to a road
    out += road(`M${ox},${n(Y(0.92))} C${n(X(0.4))},${n(Y(0.86))} ${n(X(0.6))},${n(Y(0.98))} ${ox + w},${n(Y(0.9))}`, 6);
    marks.road = { x: X(0.85), y: Y(0.92), side: 'r' };
    const cols = 4, rows = 3;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x = X((i + 0.5) / cols + (rnd() - 0.5) * 0.12), y = Y((j + 0.45) / (rows + 0.6) + (rnd() - 0.5) * 0.1);
      const k = 1 + Math.floor(rnd() * 2);
      for (let q = 0; q < k; q++) blocks.push([x + q * 6, y + (q % 2) * 4, 0]);
      out += track(`M${n(x)},${n(y + 4)} L${n(x + (rnd() - 0.5) * 20)},${n(Y(0.9))}`);
    }
    for (let i = 1; i < cols; i++) out += path(`M${n(X(i / cols + (rnd() - 0.5) * 0.05))},${oy} L${n(X(i / cols + (rnd() - 0.5) * 0.05))},${n(Y(0.86))}`, { width: 0.6, dash: '2 3' });
    for (let j = 1; j < rows; j++) out += path(`M${ox},${n(Y(j / (rows + 0.6)))} L${ox + w},${n(Y(j / (rows + 0.6) + 0.03))}`, { width: 0.6, dash: '2 3' });
    marks.centre = { x: X(0.5), y: Y(0.45), side: 'r' };
  } else {
    // Isolated: one homestead in a wide area of bush, a single track out
    const x = X(0.5), y = Y(0.45);
    for (const [dx, dy] of [[0, 0], [8, 3], [-6, 6]]) blocks.push([x + dx, y + dy, 0]);
    out += `<circle cx="${n(x + 2)}" cy="${n(y + 18)}" r="7" fill="none" stroke="${INK}" stroke-width="0.8" stroke-dasharray="2 1.5"/>`;
    out += track(`M${n(x)},${n(y + 8)} C${n(x + 20)},${n(Y(0.7))} ${n(X(0.8))},${n(Y(0.8))} ${ox + w},${n(Y(0.85))}`);
    for (let k = 0; k < 26; k++) { const bx = X(0.06 + rnd() * 0.88), by = Y(0.06 + rnd() * 0.88); if (Math.hypot(bx - x, by - y) > 30) out += bush(bx, by); }
    marks.centre = { x, y, side: 'r' };
  }
  for (const [x, y, rot] of blocks) out += block(x, y, 5, 4, rot);
  return { out, marks, anchor: { x: ox + w / 2, y: oy + h, side: 'b' as const } };
}

export const settlementPatterns: Drawer = ({ variant }) => {
  const kinds: Kind[] = variant === 'all' || !variant ? ['nucleated', 'linear', 'dispersed', 'isolated'] : [variant as Kind];
  const single = kinds.length === 1;
  const pw = single ? 360 : 205, ph = single ? 250 : 165, gap = 26;
  const cols = single ? 1 : 2;
  let body = '';
  const anchors: Record<string, Anchor> = {};
  kinds.forEach((k, i) => {
    const ox = (i % cols) * (pw + gap), oy = Math.floor(i / cols) * (ph + gap);
    const p = pattern(k, ox, oy, pw, ph, 17 + i * 31);
    body += p.out;
    anchors[k] = p.anchor;
    if (p.marks.road && !anchors.road) anchors.road = p.marks.road;
    if (p.marks.river && !anchors.river) anchors.river = p.marks.river;
    if (p.marks.centre && !anchors.centre && (k === 'nucleated' || single)) anchors.centre = p.marks.centre;
  });
  const rows = Math.ceil(kinds.length / cols);
  const W = cols * pw + (cols - 1) * gap, H = rows * ph + (rows - 1) * gap;
  // Key
  const ky = H + (single ? 44 : 40); // below the names that sit under the panels
  body += block(8, ky - 4, 5, 4) + words(16, ky, 'Building', { anchor: 'start', size: 10 });
  body += road(`M80,${ky - 4} H104`, 6) + words(110, ky, 'Road', { anchor: 'start', size: 10 });
  body += track(`M150,${ky - 4} H174`) + words(180, ky, 'Track', { anchor: 'start', size: 10 });
  body += path(`M222,${ky - 4} H246`, { width: 0.6, dash: '2 3' }) + words(252, ky, 'Field boundary', { anchor: 'start', size: 10 });
  if (anchors.river) body += riverLine(`M338,${ky - 4} H362`, 6) + words(368, ky, 'River', { anchor: 'start', size: 10 });
  for (const k of ['nucleated', 'linear', 'dispersed', 'isolated', 'cruciform', 'road', 'river', 'centre']) if (!anchors[k]) anchors[k] = { x: -1000, y: -1000 };
  return { w: Math.max(W, 410), h: ky + 6, body, anchors: Object.fromEntries(Object.entries(anchors).filter(([, a]) => a.x > -999)) };
};

/** A town symbol: a few blocks around a point. */
function town(x: number, y: number, seed: number) {
  const rnd = seeded(seed);
  let out = '';
  for (let k = 0; k < 7; k++) { const a = rnd() * Math.PI * 2, r = 3 + rnd() * 8; out += block(x + r * Math.cos(a), y + r * Math.sin(a), 5, 4, rnd() < 0.5 ? 0 : 90); }
  return out;
}
const hill = (x: number, y: number, rx: number, ry: number) => [1, 0.66, 0.33].map((k) => `<ellipse cx="${x}" cy="${y}" rx="${n(rx * k)}" ry="${n(ry * k)}" fill="none" stroke="${INK}" stroke-width="0.8"/>`).join('');

export const settlementSites: Drawer = () => {
  let body = `<rect x="0" y="0" width="480" height="320" fill="#fff" stroke="${INK}" stroke-width="1.2"/>`;
  // Marsh (flood plain) in the lower left, with a low rise in it
  for (let k = 0; k < 36; k++) { const x = 20 + (k % 9) * 20 + (Math.floor(k / 9) % 2) * 10, y = 215 + Math.floor(k / 9) * 22; body += path(`M${x - 5},${y} H${x + 5} M${x - 3},${y} l-2,-5 M${x},${y} v-6 M${x + 3},${y} l2,-5`, { width: 0.7 }); }
  body += `<ellipse cx="110" cy="262" rx="26" ry="16" fill="#fff" stroke="${INK}" stroke-width="0.9"/>`;
  // Hills: a steep hill on the left (defence), two hills with a gap on the right
  body += hill(80, 70, 60, 44) + hill(340, 62, 64, 42) + hill(436, 132, 38, 60);
  // Rivers: the main river from the north, a tributary from the east meeting it at a confluence
  body += riverLine('M190,0 C176,60 212,110 236,152 C258,196 206,250 232,320', 8);
  body += riverLine('M480,206 C420,196 330,168 236,152', 6);
  // Roads: one crossing the river at a bridge and running up through the gap
  body += road('M0,196 C80,190 160,200 236,196 C300,192 360,150 398,100 C410,80 430,40 446,0', 6);
  body += `<path d="M228,189 h16 M228,203 h16" stroke="${INK}" stroke-width="1.6"/>`;
  // Settlements at each site
  const sites: [string, number, number][] = [['defensive', 80, 70], ['gap-town', 398, 104], ['confluence', 252, 146], ['bridging-point', 256, 206], ['dry-point', 110, 262], ['wet-point', 300, 112]];
  sites.forEach(([, x, y], i) => { body += town(x, y, 7 + i * 13); });
  body += `<circle cx="292" cy="104" r="3" fill="none" stroke="${INK}" stroke-width="1"/>` + words(292, 98, 'spring', { size: 9, italic: true });
  return {
    w: 480, h: 320, body,
    anchors: {
      defensive: { x: 80, y: 70, side: 'l' }, 'gap-town': { x: 398, y: 104, side: 'r' }, confluence: { x: 252, y: 146, side: 'r' }, 'bridging-point': { x: 256, y: 206, side: 'r' },
      'dry-point': { x: 110, y: 262, side: 'l' }, 'wet-point': { x: 300, y: 112, side: 'r' }, marsh: { x: 60, y: 236, side: 'l' }, hills: { x: 340, y: 40, side: 'r' },
    },
  };
};

/** Models of urban land use, each zone with its own shading so it reads in black and white. */
export const urbanModel: Drawer = ({ id, variant }) => {
  const shade: Record<string, string> = {
    cbd: fill(id, 'cross'), industry: fill(id, 'hatch'), transition: fill(id, 'vlines'), 'low-class': fill(id, 'dots'), 'middle-class': fill(id, 'sand'),
    'high-class': '#fff', commuter: '#fff', 'heavy-industry': fill(id, 'bricks'), 'outlying-business': fill(id, 'cross'), suburb: fill(id, 'strata'),
  };
  let body = '';
  const anchors: Record<string, Anchor> = {};
  const cx = 210, cy = 160;
  if (variant === 'concentric') {
    const zones: [string, number][] = [['commuter', 150], ['middle-class', 118], ['low-class', 88], ['transition', 58], ['cbd', 28]];
    for (const [k, r] of zones) body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${shade[k]}" stroke="${INK}" stroke-width="1.3"/>`;
    const mid: Record<string, number> = { cbd: 0, transition: 43, 'low-class': 73, 'middle-class': 103, commuter: 134 };
    for (const [k, r] of Object.entries(mid)) anchors[k] = { x: cx + r * Math.cos(-0.5), y: cy + r * Math.sin(-0.5) * (k === 'cbd' ? 0 : 1), side: 'r' };
    anchors['high-class'] = { x: cx - 134, y: cy, side: 'l' };
  } else if (variant === 'sector') {
    const R = 150, wedge = (k: string, a0: number, a1: number, r0 = 30) => {
      const p = (r: number, a: number) => `${n(cx + r * Math.cos((a * Math.PI) / 180))},${n(cy + r * Math.sin((a * Math.PI) / 180))}`;
      body += `<path d="M${p(r0, a0)} L${p(R, a0)} A${R},${R} 0 ${a1 - a0 > 180 ? 1 : 0},1 ${p(R, a1)} L${p(r0, a1)} A${r0},${r0} 0 ${a1 - a0 > 180 ? 1 : 0},0 ${p(r0, a0)} Z" fill="${shade[k]}" stroke="${INK}" stroke-width="1.3"/>`;
      const m = (((a0 + a1) / 2) * Math.PI) / 180;
      if (!anchors[k]) anchors[k] = { x: cx + (r0 + R) * 0.55 * Math.cos(m), y: cy + (r0 + R) * 0.55 * Math.sin(m), side: Math.cos(m) < 0 ? 'l' : 'r' };
    };
    // Hoyt: industry along a transport route, low-class housing beside it, high class on the opposite side
    wedge('industry', -15, 15); wedge('low-class', 15, 70); wedge('low-class', -70, -15); wedge('middle-class', 70, 140); wedge('middle-class', -150, -70); wedge('high-class', 140, 210);
    body += `<circle cx="${cx}" cy="${cy}" r="30" fill="${shade.cbd}" stroke="${INK}" stroke-width="1.3"/>`;
    anchors.cbd = { x: cx, y: cy, side: 'r' };
  } else {
    // Harris and Ullman: several separate centres in a patchwork
    const cells: [string, string][] = [
      ['middle-class', 'M30,20 H170 V110 H30 Z'], ['high-class', 'M170,20 H390 V90 H260 V110 H170 Z'], ['low-class', 'M30,110 H130 V220 H30 Z'],
      ['industry', 'M130,110 H170 V150 H130 Z'], ['cbd', 'M170,110 H260 V180 H170 Z'], ['low-class', 'M130,150 H170 V250 H130 Z'],
      ['middle-class', 'M260,90 H390 V200 H260 Z'], ['outlying-business', 'M300,120 H350 V160 H300 Z'], ['heavy-industry', 'M30,220 H130 V300 H30 Z'],
      ['low-class', 'M170,180 H260 V250 H170 Z'], ['suburb', 'M260,200 H390 V300 H260 Z'], ['commuter', 'M130,250 H260 V300 H130 Z'],
    ];
    for (const [k, d] of cells) body += area(d, shade[k], { width: 1.3 });
    const centre = (d: string) => { const nums = d.match(/-?\d+/g)!.map(Number); const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1); return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }; };
    for (const [k, d] of cells) if (!anchors[k]) { const c = centre(d); anchors[k] = { ...c, side: c.x < 210 ? 'l' : 'r' }; }
  }
  return { w: 420, h: 320, body, anchors };
};
