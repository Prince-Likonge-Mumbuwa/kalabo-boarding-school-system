// @/components/ai/figures/render/globe.ts — the Earth as ECZ draws it for
// Earth geometry: a circle with N and S, the equator and circles of latitude
// as ellipses (back halves dashed), meridians as curves from pole to pole,
// lettered places, and the latitudes/longitudes labelled outside with arrows.
// Like ECZ's sketches it is NOT to scale: the circles of latitude and the
// meridians are spread out evenly (in the right order, on the right side of
// the equator and of each other) so that 13°S and 15°S, or 78°S near the
// pole, stay readable. The marking key always uses the true values.
import type { GlobeSpec } from '../spec';
import { latText, longText, rad, readLatLong } from '../figureMath';
import { INK, dot, esc, n, patterns, pointLabel, svg, text, uid } from './svg';

const R = 120, TILT = rad(14);
const W = 2 * R + 230, H = 2 * R + 70;
const CX = W / 2, CY = H / 2 + 6;

export function renderGlobe(spec: GlobeSpec): { svg: string; problems: string[] } {
  const problems: string[] = [];
  const id = uid('gl');
  const read = (v: number | string, kind: 'lat' | 'long', what: string) => {
    const x = readLatLong(v, kind);
    if (x === null || Math.abs(x) > (kind === 'lat' ? 90 : 180)) { problems.push(`${what}: cannot read "${v}".`); return null; }
    return x;
  };
  const places = spec.points.map((p) => ({ id: p.id, lat: read(p.lat, 'lat', `Latitude of ${p.id}`), long: read(p.long, 'long', `Longitude of ${p.id}`) }))
    .filter((p): p is { id: string; lat: number; long: number } => p.lat !== null && p.long !== null);
  const parallels = [...new Set((spec.parallels ?? []).map((v) => read(v, 'lat', 'Parallel')).filter((v): v is number => v !== null && v !== 0))];
  const meridians = [...new Set((spec.meridians ?? []).map((v) => read(v, 'long', 'Meridian')).filter((v): v is number => v !== null))];

  // Sketch positions: each hemisphere's latitudes spread between 24° and 56°.
  const latKey = (v: number) => Math.round(v * 1000) / 1000;
  const lats = [...new Set([...parallels, ...places.map((p) => p.lat)].map(latKey))].filter((v) => v !== 0);
  const shownLat = new Map<number, number>([[0, 0]]);
  for (const sign of [1, -1]) {
    const side = lats.filter((v) => v * sign > 0).sort((a, b) => Math.abs(a) - Math.abs(b));
    side.forEach((v, i) => shownLat.set(v, sign * (side.length === 1 ? 38 : 24 + (32 * i) / (side.length - 1))));
  }
  const sketchLat = (v: number) => (Math.abs(v) >= 90 ? v : shownLat.get(latKey(v)) ?? v);

  // Meridians and places' longitudes, west to east around their middle, spread between −42° and +42°.
  const longs = [...new Set([...meridians, ...places.map((p) => p.long)].map(latKey))];
  let middle = 0;
  if (longs.length) {
    const lo = Math.min(...longs), hi = Math.max(...longs);
    middle = hi - lo > 180 ? ((lo + hi) / 2 + 180) % 360 : (lo + hi) / 2;
  }
  const offset = (l: number) => { let d = (l - middle) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return d; };
  longs.sort((a, b) => offset(a) - offset(b));
  const shownLong = new Map<number, number>();
  longs.forEach((v, i) => shownLong.set(v, longs.length === 1 ? -30 : -42 + (84 * i) / (longs.length - 1)));
  const sketchLong = (v: number) => shownLong.get(latKey(v)) ?? offset(v);
  const centre = 0; // positions below are already relative to the middle of the view

  /** Latitude/longitude -> screen point, and whether it is on the front of the globe. */
  const project = (trueLat: number, trueLong: number, sketched = true) => {
    const lat = sketched ? sketchLat(trueLat) : trueLat;
    const long = sketched ? sketchLong(trueLong) : trueLong;
    const X = Math.cos(rad(lat)) * Math.sin(rad(long - centre));
    const Y = Math.sin(rad(lat));
    const Z = Math.cos(rad(lat)) * Math.cos(rad(long - centre));
    const Yt = Y * Math.cos(TILT) - Z * Math.sin(TILT);
    const Zt = Z * Math.cos(TILT) + Y * Math.sin(TILT);
    return { x: CX + R * X, y: CY - R * Yt, front: Zt >= -1e-9 };
  };
  /** A curve sampled along latitude/longitude: solid in front, dashed behind. */
  const curve = (pts: { x: number; y: number; front: boolean }[], width = 1.2) => {
    const out: string[] = [];
    let run: typeof pts = [];
    const flush = () => {
      if (run.length > 1) out.push(`<polyline points="${run.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')}" fill="none" stroke="${INK}" stroke-width="${run[0].front ? width : 0.9}"${run[0].front ? '' : ' stroke-dasharray="4 3"'}/>`);
      run = run.slice(-1);
    };
    for (const p of pts) {
      if (run.length && run[run.length - 1].front !== p.front) { flush(); run = [{ ...run[0], front: p.front }]; }
      run.push(p);
    }
    flush();
    return out.join('');
  };
  const parallel = (lat: number) => curve(Array.from({ length: 181 }, (_, i) => project(sketchLat(lat), centre - 180 + i * 2, false)));
  const meridian = (long: number) => curve(Array.from({ length: 91 }, (_, i) => project(-90 + i * 2, sketchLong(long), false)), 1.3);

  const parts: string[] = [patterns(id)];
  parts.push(`<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${INK}" stroke-width="1.6"/>`);
  parts.push(parallel(0));
  for (const lat of parallels) parts.push(parallel(lat));
  for (const long of meridians) parts.push(meridian(long));

  // Poles
  const N = project(90, centre, false), S = project(-90, centre, false);
  parts.push(`<line x1="${n(N.x)}" y1="${n(N.y - 16)}" x2="${n(N.x)}" y2="${n(N.y + 2)}" stroke="${INK}"/>`, text(N.x, N.y - 20, 'N', { size: 14, anchor: 'middle', weight: 'bold' }));
  parts.push(`<line x1="${n(S.x)}" y1="${n(S.y - 2)}" x2="${n(S.x)}" y2="${n(S.y + 16)}" stroke="${INK}"/>`, text(S.x, S.y + 30, 'S', { size: 14, anchor: 'middle', weight: 'bold' }));

  // Latitude labels on the right, with a short line to the circle of latitude.
  const primeDrawn = meridians.some((l) => Math.abs(l) < 1e-9);
  const taken: Record<'l' | 'r', number[]> = { l: [], r: [] };
  for (const lat of [0, ...parallels]) {
    const v = sketchLat(lat);
    const y = project(v, centre + 90 - 1e-6, false).y;
    const x = CX + R * Math.cos(rad(v));
    parts.push(`<line x1="${n(x)}" y1="${n(y)}" x2="${n(CX + R + 18)}" y2="${n(y)}" stroke="${INK}" stroke-width="0.8"/>`);
    parts.push(text(CX + R + 22, y + 4, lat === 0 ? (primeDrawn ? 'Equator' : '0°') : latText(lat), { size: 12 }));
    taken.r.push(y);
  }

  // Longitude labels outside, with a level arrow to the meridian (as ECZ draws them),
  // at a height clear of the other labels on that side.
  for (const long of meridians) {
    const v = sketchLong(long);
    const side: 'l' | 'r' = v < 0 ? 'l' : 'r';
    const tries = [12, -12, 4, -4, 20, -20, 28, -28, 36, -36];
    const at = tries.find((t) => taken[side].every((y) => Math.abs(project(t, v, false).y - y) >= 17)) ?? tries[taken[side].length % tries.length];
    const p = project(at, v, false);
    taken[side].push(p.y);
    const x0 = side === 'l' ? CX - R - 40 : CX + R + 40;
    parts.push(`<line x1="${n(x0 + (side === 'l' ? 4 : -4))}" y1="${n(p.y)}" x2="${n(p.x + (side === 'l' ? -3 : 3))}" y2="${n(p.y)}" stroke="${INK}" stroke-width="0.8" marker-end="url(#${id}-arrow)"/>`);
    parts.push(text(x0, p.y + 4, longText(long), { size: 12, anchor: side === 'l' ? 'end' : 'start' }));
  }

  // Places
  for (const pl of places) {
    const p = project(pl.lat, pl.long);
    if (!p.front) problems.push(`${pl.id} is on the far side of the globe in this view.`);
    parts.push(dot(p, 2.8));
    const out = { x: p.x - CX, y: p.y - CY };
    parts.push(pointLabel(p, pl.id, Math.hypot(out.x, out.y) > 8 ? out : { x: -1, y: -1 }, 11));
  }

  return { svg: svg(W, H, parts.join(''), esc(spec.title ?? 'The Earth')), problems };
}
