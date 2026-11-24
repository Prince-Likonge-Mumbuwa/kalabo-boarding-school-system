// @/components/ai/figures/render/scenes/earth.ts — the Earth and the solar
// system: the Earth's layers, the solar system, the Earth's tilt and the
// Sun's rays (ECZ draws this for the solstices), revolution and the
// seasons, eclipses, and day and night.
import { INK, n } from '../svg';
import { GREY, arrow, fill, path, sun, words, type Drawer } from './kit';

const rad = (d: number) => (d * Math.PI) / 180;

export const earthLayers: Drawer = ({ id }) => {
  const cx = 230, cy = 150;
  const rings: [number, string][] = [[130, fill(id, 'bricks')], [122, '#fff'], [70, fill(id, 'hatch')], [36, fill(id, 'cross')]];
  let body = '';
  for (const [r, f] of rings) body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${f}" stroke="${INK}" stroke-width="1.4"/>`;
  body += `<circle cx="${cx}" cy="${cy}" r="122" fill="none" stroke="${INK}" stroke-width="1"/>`;
  return {
    w: 460, h: 300, body,
    anchors: {
      crust: { x: cx + 126 * Math.cos(rad(-35)), y: cy + 126 * Math.sin(rad(-35)), side: 'r' },
      mantle: { x: cx + 96 * Math.cos(rad(20)), y: cy + 96 * Math.sin(rad(20)), side: 'r' },
      'outer-core': { x: cx + 53 * Math.cos(rad(200)), y: cy + 53 * Math.sin(rad(200)), side: 'l' },
      'inner-core': { x: cx - 8, y: cy + 10, side: 'l' },
    },
  };
};

export const solarSystem: Drawer = ({ id }) => {
  const sy = 110, sunX = -60, sunR = 92;
  const planets: [string, number, number][] = [['mercury', 62, 3.5], ['venus', 92, 6], ['earth', 124, 6.5], ['mars', 156, 4.5], ['jupiter', 252, 17], ['saturn', 330, 14], ['uranus', 402, 9.5], ['neptune', 462, 9.5]];
  let body = `<circle cx="${sunX}" cy="${sy}" r="${sunR}" fill="#fff" stroke="${INK}" stroke-width="1.6"/>`;
  for (let i = 0; i < 14; i++) {
    const a = rad(-60 + i * (120 / 13));
    body += `<line x1="${n(sunX + (sunR + 4) * Math.cos(a))}" y1="${n(sy + (sunR + 4) * Math.sin(a))}" x2="${n(sunX + (sunR + 11) * Math.cos(a))}" y2="${n(sy + (sunR + 11) * Math.sin(a))}" stroke="${INK}"/>`;
  }
  const anchors: Record<string, { x: number; y: number; side?: 'l' | 'r' | 't' | 'b' }> = { sun: { x: 14, y: sy + 40, side: 'b' } };
  planets.forEach(([name, x, r], i) => {
    const R = x - sunX;
    body += path(`M${n(sunX + R * Math.cos(rad(-24)))},${n(sy + R * Math.sin(rad(-24)))} A${R},${R} 0 0,1 ${n(sunX + R * Math.cos(rad(24)))},${n(sy + R * Math.sin(rad(24)))}`, { width: 0.7, dash: '3 3' });
    body += `<circle cx="${x}" cy="${sy}" r="${r}" fill="${name === 'jupiter' || name === 'saturn' ? fill(id, 'strata') : '#fff'}" stroke="${INK}" stroke-width="1.3"/><circle cx="${x}" cy="${sy}" r="${r}" fill="none" stroke="${INK}" stroke-width="1.3"/>`;
    if (name === 'saturn') body += `<ellipse cx="${x}" cy="${sy}" rx="${r * 2}" ry="${r * 0.5}" fill="none" stroke="${INK}" stroke-width="1.3" transform="rotate(-18 ${x} ${sy})"/>`;
    // Point to the planet's body below its centre (clear of Saturn's ring), words above or below in turn.
    anchors[name] = i % 2 ? { x, y: sy + r, side: 'b' } : { x, y: sy - r, side: 't' };
  });
  // Asteroid belt between Mars and Jupiter
  const rnd = (k: number) => ((Math.sin(k * 12.9898) * 43758.5453) % 1 + 1) % 1;
  for (let k = 0; k < 40; k++) {
    const R = 196 + rnd(k) * 22 - sunX, a = rad(-20 + rnd(k + 99) * 40);
    body += `<circle cx="${n(sunX + R * Math.cos(a))}" cy="${n(sy + R * Math.sin(a))}" r="1.1" fill="${INK}"/>`;
  }
  anchors['asteroid-belt'] = { x: 205, y: sy - 52, side: 't' };
  anchors['inner-planets'] = { x: 108, y: sy + 46, side: 'b' };
  anchors['outer-planets'] = { x: 360, y: sy + 52, side: 'b' };
  return { w: 490, h: 220, body, anchors };
};

/** ECZ's diagram: the Earth with its axis tilted, the lines of latitude, and the Sun's rays from the right. */
export const earthSunRays: Drawer = ({ id, variant }) => {
  const cx = 190, cy = 150, R = 112;
  const tilt = variant === 'december' ? -23.5 : variant === 'equinox' ? 0 : 23.5; // + = north pole leans towards the Sun (right)
  const axis = { x: Math.sin(rad(tilt)), y: -Math.cos(rad(tilt)) }; // towards the north pole (screen)
  const perp = { x: -axis.y, y: axis.x };
  let body = `<path d="M${cx},${cy - R} A${R},${R} 0 0,0 ${cx},${cy + R} Z" fill="${GREY}" stroke="none"/>`;
  body += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${INK}" stroke-width="1.6"/>`;
  body += `<line x1="${cx}" y1="${cy - R}" x2="${cx}" y2="${cy + R}" stroke="${INK}" stroke-width="0.8" stroke-dasharray="2 3"/>`;
  const N = { x: cx + axis.x * R, y: cy + axis.y * R }, S = { x: cx - axis.x * R, y: cy - axis.y * R };
  body += `<line x1="${n(cx - axis.x * (R + 22))}" y1="${n(cy - axis.y * (R + 22))}" x2="${n(cx + axis.x * (R + 22))}" y2="${n(cy + axis.y * (R + 22))}" stroke="${INK}" stroke-width="1.3"/>`;
  body += words(N.x + axis.x * 30, N.y + axis.y * 30 + 4, 'N', { bold: true, size: 13 }) + words(S.x - axis.x * 30, S.y - axis.y * 30 + 4, 'S', { bold: true, size: 13 });
  const anchors: Record<string, { x: number; y: number; side?: 'l' | 'r' | 't' | 'b' }> = { 'north-pole': { ...N, side: 'l' }, 'south-pole': { ...S, side: 'l' } };
  const lat: [string, number, boolean][] = [['arctic-circle', 66.5, true], ['tropic-cancer', 23.5, true], ['equator', 0, false], ['tropic-capricorn', -23.5, true], ['antarctic-circle', -66.5, true]];
  for (const [key, l, dashed] of lat) {
    const d = R * Math.sin(rad(l)), half = R * Math.cos(rad(l));
    const c = { x: cx + axis.x * d, y: cy + axis.y * d };
    const a = { x: c.x - perp.x * half, y: c.y - perp.y * half }, b = { x: c.x + perp.x * half, y: c.y + perp.y * half };
    body += `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(b.x)}" y2="${n(b.y)}" stroke="${INK}" stroke-width="${dashed ? 1 : 1.4}"${dashed ? ' stroke-dasharray="5 3"' : ''}/>`;
    const left = a.x < b.x ? a : b;
    anchors[key] = { x: left.x, y: left.y, side: 'l' };
  }
  // The Sun's rays: parallel, from the right, stopping at the Earth.
  for (let k = -4; k <= 4; k++) {
    const y = cy + k * 26;
    const x = cx + Math.sqrt(Math.max(0, R * R - (y - cy) ** 2));
    body += arrow(id, 450, y, x + 3, y, { width: 1 });
  }
  body += words(430, cy - 4 * 26 - 10, "Sun's rays", { size: 11 });
  anchors['sun-rays'] = { x: 400, y: cy + 26, side: 'r' };
  anchors['overhead-sun'] = { x: cx + R, y: cy, side: 'r' };
  anchors.axis = { x: cx + axis.x * (R + 16), y: cy + axis.y * (R + 16), side: 'r' };
  return { w: 460, h: 300, body, anchors };
};

/** The Earth at its four positions round the Sun, axis always leaning the same way. */
export const seasons: Drawer = ({ id }) => {
  const cx = 250, cy = 140, rx = 190, ry = 82;
  let body = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${INK}" stroke-width="1" stroke-dasharray="5 4"/>`;
  body += sun(cx, cy, 22);
  // direction of travel (anticlockwise seen from above the North Pole)
  body += arrow(id, cx + rx * Math.cos(rad(60)), cy + ry * Math.sin(rad(60)), cx + rx * Math.cos(rad(40)), cy + ry * Math.sin(rad(40)), { width: 1.2 });
  body += arrow(id, cx + rx * Math.cos(rad(240)), cy + ry * Math.sin(rad(240)), cx + rx * Math.cos(rad(220)), cy + ry * Math.sin(rad(220)), { width: 1.2 });
  const tilt = rad(-23.5); // north pole leans left in every position
  const pos: [string, number][] = [['march', 90], ['june', 0], ['september', 270], ['december', 180]];
  const anchors: Record<string, { x: number; y: number; side?: 'l' | 'r' | 't' | 'b' }> = { sun: { x: cx, y: cy + 30, side: 'b' }, orbit: { x: cx + rx * Math.cos(rad(130)), y: cy + ry * Math.sin(rad(130)), side: 'l' } };
  for (const [key, ang] of pos) {
    const x = cx + rx * Math.cos(rad(ang)), y = cy + ry * Math.sin(rad(ang)), r = 22;
    // the half facing away from the Sun is in darkness
    const away = Math.atan2(y - cy, x - cx);
    const p1 = { x: x + r * Math.cos(away - Math.PI / 2), y: y + r * Math.sin(away - Math.PI / 2) }, p2 = { x: x + r * Math.cos(away + Math.PI / 2), y: y + r * Math.sin(away + Math.PI / 2) };
    body += `<circle cx="${n(x)}" cy="${n(y)}" r="${r}" fill="#fff" stroke="${INK}" stroke-width="1.3"/>`;
    body += `<path d="M${n(p1.x)},${n(p1.y)} A${r},${r} 0 0,1 ${n(p2.x)},${n(p2.y)} Z" fill="${GREY}" stroke="none"/>`;
    body += `<circle cx="${n(x)}" cy="${n(y)}" r="${r}" fill="none" stroke="${INK}" stroke-width="1.3"/>`;
    const ax = Math.sin(tilt), ay = -Math.cos(tilt);
    body += `<line x1="${n(x - ax * 30)}" y1="${n(y - ay * 30)}" x2="${n(x + ax * 30)}" y2="${n(y + ay * 30)}" stroke="${INK}" stroke-width="1.2"/>`;
    body += `<line x1="${n(x + ay * r)}" y1="${n(y - ax * r)}" x2="${n(x - ay * r)}" y2="${n(y + ax * r)}" stroke="${INK}" stroke-width="0.8"/>`;
    body += words(x + ax * 38, y + ay * 38 + 4, 'N', { size: 10, bold: true });
    anchors[key] = { x, y: y + (ang === 270 ? -r : r), side: ang === 270 ? 't' : ang === 90 ? 'b' : ang === 0 ? 'r' : 'l' };
  }
  return { w: 500, h: 290, body, anchors };
};

export const eclipse: Drawer = ({ variant }) => {
  const lunar = variant === 'lunar';
  // Not to scale (nothing could be): sizes are chosen so the umbra clearly reaches the body in shadow.
  const S = { x: 60, y: 140, r: lunar ? 52 : 40 };
  const mid = lunar ? { x: 300, y: 140, r: 30 } : { x: 250, y: 140, r: 16 }; // body casting the shadow
  const far = lunar ? { x: 420, y: 140, r: 11 } : { x: 400, y: 140, r: 36 };
  // External tangents (umbra) and internal tangents (penumbra) of the Sun and the middle body.
  const d = mid.x - S.x;
  const ext = Math.asin((S.r - mid.r) / d), int = Math.asin((S.r + mid.r) / d);
  const end = 470;
  const umbraTip = mid.x + mid.r / Math.tan(ext);
  const u1 = { x: mid.x + mid.r * Math.sin(ext), y: mid.y - mid.r * Math.cos(ext) }, u2 = { x: u1.x, y: mid.y + mid.r * Math.cos(ext) };
  const p1 = { x: mid.x - mid.r * Math.sin(int), y: mid.y - mid.r * Math.cos(int) }, p2 = { x: p1.x, y: mid.y + mid.r * Math.cos(int) };
  const pSlope = Math.tan(int);
  const pe1 = { x: end, y: p1.y - (end - p1.x) * pSlope }, pe2 = { x: end, y: p2.y + (end - p2.x) * pSlope };
  let body = `<path d="M${n(p1.x)},${n(p1.y)} L${n(pe1.x)},${n(pe1.y)} L${n(pe2.x)},${n(pe2.y)} L${n(p2.x)},${n(p2.y)} Z" fill="#efefef" stroke="none"/>`;
  const tipX = Math.min(umbraTip, end), tipHalf = umbraTip > end ? mid.r * (1 - (end - mid.x) / (umbraTip - mid.x)) : 0;
  body += `<path d="M${n(u1.x)},${n(u1.y)} L${n(tipX)},${n(mid.y - tipHalf)} L${n(tipX)},${n(mid.y + tipHalf)} L${n(u2.x)},${n(u2.y)} Z" fill="#bdbdbd" stroke="none"/>`;
  // tangent lines from the Sun
  const sunTop = { x: S.x + S.r * Math.sin(ext), y: S.y - S.r * Math.cos(ext) }, sunBot = { x: sunTop.x, y: S.y + S.r * Math.cos(ext) };
  body += `<line x1="${n(sunTop.x)}" y1="${n(sunTop.y)}" x2="${n(tipX)}" y2="${n(mid.y - tipHalf)}" stroke="${INK}" stroke-width="0.8"/><line x1="${n(sunBot.x)}" y1="${n(sunBot.y)}" x2="${n(tipX)}" y2="${n(mid.y + tipHalf)}" stroke="${INK}" stroke-width="0.8"/>`;
  const sp1 = { x: S.x + S.r * Math.sin(int), y: S.y + S.r * Math.cos(int) }, sp2 = { x: sp1.x, y: S.y - S.r * Math.cos(int) };
  body += `<line x1="${n(sp1.x)}" y1="${n(sp1.y)}" x2="${n(pe1.x)}" y2="${n(pe1.y)}" stroke="${INK}" stroke-width="0.8" stroke-dasharray="4 3"/><line x1="${n(sp2.x)}" y1="${n(sp2.y)}" x2="${n(pe2.x)}" y2="${n(pe2.y)}" stroke="${INK}" stroke-width="0.8" stroke-dasharray="4 3"/>`;
  body += sun(S.x, S.y, S.r);
  body += `<circle cx="${mid.x}" cy="${mid.y}" r="${mid.r}" fill="#fff" stroke="${INK}" stroke-width="1.4"/>`;
  body += `<circle cx="${far.x}" cy="${far.y}" r="${far.r}" fill="#fff" stroke="${INK}" stroke-width="1.4"/>`;
  const earth = lunar ? mid : far, moon = lunar ? far : mid;
  return {
    w: 480, h: 280, body,
    anchors: {
      sun: { x: S.x, y: S.y + S.r + 10, side: 'b' }, earth: { x: earth.x, y: earth.y + earth.r, side: 'b' }, moon: { x: moon.x, y: moon.y - moon.r, side: 't' },
      umbra: { x: lunar ? 372 : (mid.x + Math.min(umbraTip, far.x)) / 2 + 30, y: mid.y, side: 'r' },
      penumbra: { x: 400, y: pe1.y + (mid.y - pe1.y) * 0.25 + 4, side: 'r' },
    },
  };
};

export const dayNight: Drawer = ({ id }) => {
  const cx = 200, cy = 150, R = 105;
  let body = `<path d="M${cx},${cy - R} A${R},${R} 0 0,0 ${cx},${cy + R} Z" fill="${GREY}" stroke="none"/>`;
  body += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${INK}" stroke-width="1.6"/>`;
  body += `<line x1="${cx}" y1="${cy - R}" x2="${cx}" y2="${cy + R}" stroke="${INK}" stroke-width="0.9" stroke-dasharray="4 3"/>`;
  const t = rad(23.5), ax = Math.sin(t), ay = -Math.cos(t);
  body += `<line x1="${n(cx - ax * (R + 22))}" y1="${n(cy - ay * (R + 22))}" x2="${n(cx + ax * (R + 22))}" y2="${n(cy + ay * (R + 22))}" stroke="${INK}" stroke-width="1.3"/>`;
  body += words(cx + ax * (R + 32), cy + ay * (R + 32) + 4, 'N', { bold: true, size: 13 });
  // rotation: west to east (an arrow across the front, left to right)
  body += path(`M${cx - 60},${cy - 62} Q${cx},${cy - 40} ${cx + 60},${cy - 62}`, { width: 1.5, arrow: `${id}-arr` });
  for (let k = -3; k <= 3; k++) {
    const y = cy + k * 28, x = cx + Math.sqrt(Math.max(0, R * R - (y - cy) ** 2));
    body += arrow(id, 420, y, x + 3, y, { width: 1 });
  }
  return {
    w: 440, h: 300, body,
    anchors: {
      day: { x: cx + 55, y: cy + 30, side: 'r' }, night: { x: cx - 55, y: cy + 30, side: 'l' }, axis: { x: cx - ax * (R + 14), y: cy - ay * (R + 14), side: 'l' },
      rotation: { x: cx + 40, y: cy - 55, side: 'r' }, 'sun-rays': { x: 380, y: cy - 28, side: 'r' },
    },
  };
};
