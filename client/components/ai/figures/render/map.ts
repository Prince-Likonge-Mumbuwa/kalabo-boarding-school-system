// @/components/ai/figures/render/map.ts — maps from real open data, drawn as
// black-and-white sketch maps like the ones ECZ uses: outline, a few rivers,
// places, kingdoms as ovals, arrows for migrations and campaigns, letters for
// the learner to identify, a key, a scale bar and a north arrow.
//
// Only features that exist in the data (geo.ts) can be drawn or lettered; the
// AI server refuses a map that names anything else.
import { geoBounds, geoCentroid, geoContains, geoDistance, geoMercator, geoNaturalEarth1, geoPath, type GeoProjection } from 'd3-geo';
import type { Feature, Geometry, Position } from 'geojson';
import rough from 'roughjs/bin/rough';
import type { MapFeature, MapSpec } from '../spec';
import { REGIONS, findPlace, findPoint, findShapes, nameKey, regionBox, type GeoData } from './geo';
import { INK, esc, fillFor, n, patterns, placeholder, svg, text, uid } from './svg';

const generator = rough.generator();

/** The biggest polygon of a shape, for placing its label inside it. */
function mainPart(f: Feature<Geometry>): Feature<Geometry> {
  const g = f.geometry;
  if (g.type !== 'MultiPolygon') return f;
  let best = g.coordinates[0];
  let bestArea = 0;
  for (const poly of g.coordinates) {
    const ring = poly[0];
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    if (Math.abs(a) > bestArea) { bestArea = Math.abs(a); best = poly; }
  }
  return { ...f, geometry: { type: 'Polygon', coordinates: best } };
}

/** A point along a line feature that is inside the frame, near its middle. */
function lineMiddle(shapes: Feature<Geometry>[], project: GeoProjection, W: number, H: number): [number, number] | null {
  const pts: [number, number][] = [];
  for (const s of shapes) {
    const g = s.geometry;
    const lines: Position[][] = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    for (const l of lines) for (const c of l) {
      const p = project(c as [number, number]);
      if (p && p[0] > 10 && p[0] < W - 10 && p[1] > 10 && p[1] < H - 10) pts.push(p as [number, number]);
    }
  }
  return pts.length ? pts[Math.floor(pts.length / 2)] : null;
}

function roughPath(d: string, opts: Record<string, unknown>) {
  return generator.toPaths(generator.path(d, { roughness: 0.9, bowing: 0.6, stroke: INK, strokeWidth: 1.3, ...opts }))
    .map((p) => `<path d="${p.d}" fill="${p.fill ?? 'none'}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}"/>`).join('');
}

/**
 * region "auto": a box around everything the question puts on the map, with
 * a margin, so a map about Kapiri Mposhi shows Central Province, not all of
 * Zambia. Never smaller than about 3° across.
 */
function autoBox(spec: MapSpec, data: GeoData): [number, number, number, number] {
  const pts: [number, number][] = [];
  const centroid = (f: Feature<Geometry>) => geoCentroid(mainPart(f) as never) as [number, number];
  for (const f of spec.features) {
    if (f.kind === 'route' || f.kind === 'railway' || f.kind === 'road') {
      for (const s of [f.from, ...(f.via ?? []), f.to]) { const p = s ? findPoint(data, s, centroid) : null; if (p) pts.push(p); }
    } else if (f.kind === 'place' || f.kind === 'kingdom') {
      const pl = f.name ? findPlace(data, f.name) : null;
      if (pl) pts.push([pl.lon, pl.lat]);
    } else if (f.name) {
      for (const sh of findShapes(data, f.kind, f.name)) { const b = geoBounds(sh as never); pts.push(b[0] as [number, number], b[1] as [number, number]); }
    }
  }
  if (spec.layers?.agroRegions || spec.layers?.provinces || spec.layers?.districts) return REGIONS.zambia;
  if (!pts.length) return REGIONS.zambia;
  let [w, s, e, nn] = [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
  const padX = Math.max(1.5 - (e - w) / 2, (e - w) * 0.18), padY = Math.max(1.5 - (nn - s) / 2, (nn - s) * 0.18);
  w -= padX; e += padX; s -= padY; nn += padY;
  return [w, s, e, nn];
}

export interface MapResult { svg: string; problems: string[] }

export function renderMap(spec: MapSpec, data: GeoData): MapResult {
  const problems: string[] = [];
  const id = uid('m');
  const box = spec.region === 'auto' ? autoBox(spec, data) : regionBox(spec.region);
  const [w0, s0, e0, n0] = box;
  const isWorld = e0 - w0 > 200;
  const corners = { type: 'MultiPoint' as const, coordinates: [[w0, s0], [e0, s0], [e0, n0], [w0, n0], [(w0 + e0) / 2, s0], [(w0 + e0) / 2, n0]] };
  // Size the frame to the region's shape.
  const probe = (isWorld ? geoNaturalEarth1() : geoMercator()).fitSize([1000, 1000], corners as never);
  const pb = geoPath(probe).bounds(corners as never);
  const aspect = (pb[1][1] - pb[0][1]) / Math.max(1, pb[1][0] - pb[0][0]);
  const W = 560, H = Math.round(Math.max(300, Math.min(720, W * aspect)));
  const projection = (isWorld ? geoNaturalEarth1() : geoMercator()).fitExtent([[12, 12], [W - 12, H - 12]], corners as never).clipExtent([[0, 0], [W, H]]);
  const path = geoPath(projection);
  const sketch = spec.style !== 'clean';
  const parts: string[] = [patterns(id), `<rect x="0" y="0" width="${W}" height="${H}" fill="#fff"/>`];
  const draw = (f: Feature<Geometry>, attrs: string) => {
    const d = path(f as never);
    return d ? `<path d="${d}" ${attrs}/>` : '';
  };
  const inFrame = (p: [number, number] | null | undefined) => !!p && p[0] > 4 && p[0] < W - 4 && p[1] > 4 && p[1] < H - 4;

  const wanted = (kind: MapFeature['kind'], name: string) => spec.features.find((f) => f.kind === kind && f.name && nameKey(f.name) === nameKey(name));
  const zambiaView = e0 - w0 < 20 && w0 > 15 && e0 < 40 && n0 < 0 && s0 > -25;

  // Countries (land), with shading for the ones the question picks out.
  for (const c of data.layers.countries.features) {
    const pick = wanted('country', String(c.properties?.name ?? ''));
    parts.push(draw(c, `fill="${pick?.shade && pick.shade !== 'none' ? fillFor(id, pick.shade) : '#fff'}" stroke="${INK}" stroke-width="${sketch ? 0.9 : 0.7}" stroke-linejoin="round"`));
  }
  // Zambia's provinces or districts.
  if (spec.layers?.provinces || spec.layers?.districts || spec.features.some((f) => f.kind === 'province' || f.kind === 'district')) {
    const layer = spec.layers?.districts || spec.features.some((f) => f.kind === 'district') ? data.layers.districts : data.layers.provinces;
    for (const p of layer.features) {
      const pick = spec.features.find((f) => (f.kind === 'province' || f.kind === 'district') && f.name && nameKey(f.name) === nameKey(String(p.properties?.name ?? '')));
      parts.push(draw(p, `fill="${pick?.shade && pick.shade !== 'none' ? fillFor(id, pick.shade) : 'none'}" stroke="${INK}" stroke-width="0.6" stroke-dasharray="${spec.layers?.districts ? '2 2' : '5 3'}"`));
    }
  }
  // Zambia's agro-ecological regions, each with its own shading and a name (or a letter).
  const AGRO_FILL: Record<string, string> = { I: 'dots', IIa: 'none', IIb: 'hatch', III: 'grey' };
  if (spec.layers?.agroRegions) {
    for (const z of data.layers.agro.features) {
      const zone = String(z.properties?.name);
      const fillName = AGRO_FILL[zone];
      parts.push(draw(z as Feature<Geometry>, `fill="${fillName === 'none' ? '#fff' : fillFor(id, fillName)}" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"`));
    }
  }
  // Regions (deserts, mountain ranges, valleys) only when asked for.
  for (const f of spec.features.filter((x) => x.kind === 'region' && x.name)) {
    for (const r of findShapes(data, 'region', f.name!)) parts.push(draw(r, `fill="${fillFor(id, f.shade ?? 'dots')}" stroke="none"`));
  }
  // Lakes.
  const lakeNames = spec.layers?.lakes;
  const lakes = zambiaView ? data.layers.zlakes.features : data.layers.lakes.features;
  for (const l of lakes) {
    const name = String(l.properties?.name ?? '');
    const asked = spec.features.some((f) => f.kind === 'lake' && f.name && nameKey(f.name) === nameKey(name));
    const show = asked || lakeNames === 'major' || lakeNames === undefined || (Array.isArray(lakeNames) && lakeNames.some((x) => nameKey(x) === nameKey(name)));
    if (show && name) parts.push(draw(l, `fill="#e4e4e4" stroke="${INK}" stroke-width="0.8"`));
  }
  // Rivers: the ones named, or the major ones.
  const riverNames = spec.layers?.rivers ?? 'major';
  const rivers = zambiaView ? data.layers.zrivers.features : data.layers.rivers.features;
  for (const r of rivers) {
    const name = String(r.properties?.name ?? '');
    const asked = spec.features.some((f) => f.kind === 'river' && f.name && nameKey(f.name) === nameKey(name));
    const rank = Number(r.properties?.scalerank ?? 9);
    const show = asked || (riverNames === 'major' && rank <= (zambiaView ? 7 : isWorld ? 2 : 4)) || (Array.isArray(riverNames) && riverNames.some((x) => nameKey(x) === nameKey(name)));
    if (show) parts.push(draw(r, `fill="none" stroke="${INK}" stroke-width="${asked ? 1.6 : 0.9}"`));
  }
  // Country names, small capitals, where they fit.
  if (spec.layers?.countryNames) {
    for (const c of data.layers.countries.features) {
      const p = projection(geoCentroid(mainPart(c) as never));
      const area = path.area(c as never);
      if (inFrame(p as never) && area > 1800 && !spec.features.some((f) => f.kind === 'country' && f.label && f.name && nameKey(f.name) === nameKey(String(c.properties?.name))))
        parts.push(text(p![0], p![1], String(c.properties?.name).toUpperCase(), { size: area > 9000 ? 10 : 8, anchor: 'middle', halo: true }));
    }
  }

  // The question's features.
  const labels: string[] = [];
  const usedKinds = new Set<string>();
  const put = (p: [number, number] | null | undefined, f: MapFeature, dy = 0) => {
    if (!p) return;
    const words = f.label ?? f.text;
    if (words) parts.push(text(p[0], p[1] + dy, words, { size: f.label ? 15 : 11.5, anchor: 'middle', weight: f.label ? 'bold' : undefined, halo: true }));
  };
  const placeXY = (name: string): [number, number] | null => {
    const at = findPoint(data, name, (f) => geoCentroid(mainPart(f) as never) as [number, number]);
    return at ? (projection(at) as [number, number] | null) : null;
  };
  /** Where to put a shape's label: its centre, or (for seas and big shapes cut by the frame) the in-frame point inside it nearest that centre. */
  const labelXY = (shape: Feature<Geometry>): [number, number] | null => {
    const c = projection(geoCentroid(mainPart(shape) as never)) as [number, number] | null;
    if (inFrame(c) && projection.invert && geoContains(shape as never, projection.invert(c!) as [number, number])) return c;
    let best: [number, number] | null = null, bestD = Infinity;
    const step = Math.max(8, Math.min(W, H) / 40);
    const inside = (x: number, y: number) => { const ll = projection.invert?.([x, y]); return !!ll && geoContains(shape as never, ll as [number, number]); };
    const blocked = (x: number, y: number) => (x > W - 175 && y > H - 135) || (x > W - 60 && y < 70) || (x < 120 && y > H - 40);
    for (let x = 50; x < W - 50; x += step) for (let y = 30; y < H - 30; y += step) {
      if (blocked(x, y) || !inside(x, y)) continue;
      // Room for the words: the sea must reach about 45 px either side and 12 px above and below.
      if (!(inside(x - 45, y) && inside(x + 45, y) && inside(x, y - 12) && inside(x, y + 12))) continue;
      const d = c ? (x - c[0]) ** 2 + (y - c[1]) ** 2 : 0;
      if (d < bestD) { bestD = d; best = [x, y]; }
    }
    return best ?? (inFrame(c) ? c : null);
  };

  for (const f of spec.features) {
    if (f.label) labels.push(f.label);
    usedKinds.add(f.kind);
    if (f.kind === 'place') {
      const pl = f.name ? findPlace(data, f.name) : null;
      const p = pl ? (projection([pl.lon, pl.lat]) as [number, number] | null) : null;
      if (!p) { problems.push(`Place not found on the map data: ${f.name}`); continue; }
      if (!inFrame(p)) { problems.push(`${f.name} is outside the map area.`); continue; }
      parts.push(`<circle cx="${n(p[0])}" cy="${n(p[1])}" r="3.4" fill="${INK}"/>`);
      const words = f.label ?? f.text;
      if (words) parts.push(text(p[0] + 7, p[1] + 4, words, { size: f.label ? 15 : 11.5, weight: f.label ? 'bold' : undefined, halo: true }));
    } else if (f.kind === 'kingdom') {
      const pl = f.name ? findPlace(data, f.name) : null;
      if (!pl) { problems.push(`Kingdom not in the history places list: ${f.name}`); continue; }
      const c = projection([pl.lon, pl.lat]) as [number, number] | null;
      const r = f.radiusKm ?? 150;
      const edge = projection([pl.lon + r / (111 * Math.cos((pl.lat * Math.PI) / 180)), pl.lat]) as [number, number] | null;
      const top = projection([pl.lon, pl.lat + r / 111]) as [number, number] | null;
      if (!c || !edge || !top || !inFrame(c)) { problems.push(`${f.name} is outside the map area.`); continue; }
      const rx = Math.max(14, Math.abs(edge[0] - c[0])), ry = Math.max(10, Math.abs(top[1] - c[1]) * 0.8);
      const d = `M${n(c[0] - rx)},${n(c[1])} a${n(rx)},${n(ry)} 0 1,0 ${n(2 * rx)},0 a${n(rx)},${n(ry)} 0 1,0 ${n(-2 * rx)},0`;
      parts.push(sketch ? roughPath(d, { fill: f.shade && f.shade !== 'none' ? undefined : undefined }) : `<path d="${d}" fill="none" stroke="${INK}" stroke-width="1.3"/>`);
      if (f.shade && f.shade !== 'none') parts.push(`<path d="${d}" fill="${fillFor(id, f.shade)}" stroke="none"/>`);
      put(c, f, 5);
    } else if (f.kind === 'route') {
      const stops = [f.from, ...(f.via ?? []), f.to].filter(Boolean) as string[];
      const pts = stops.map((s) => ({ s, p: placeXY(s) }));
      const missing = pts.filter((x) => !x.p).map((x) => x.s);
      if (missing.length || pts.length < 2) { problems.push(`Route needs places on the map data (not found: ${missing.join(', ') || 'from/to'}).`); continue; }
      const P = pts.map((x) => x.p!) as [number, number][];
      // A gently curved line through the stops, ending in an arrow.
      let d = `M${n(P[0][0])},${n(P[0][1])}`;
      for (let i = 1; i < P.length; i++) {
        const [a, b] = [P[i - 1], P[i]];
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const bend = 0.12;
        d += ` Q${n(mx - dy * bend)},${n(my + dx * bend)} ${n(b[0])},${n(b[1])}`;
      }
      parts.push(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="1.6" marker-end="url(#${id}-arrow)"/>`);
      const mid = P.length === 2 ? [(P[0][0] + P[1][0]) / 2 - (P[1][1] - P[0][1]) * 0.08, (P[0][1] + P[1][1]) / 2 + (P[1][0] - P[0][0]) * 0.08] as [number, number] : P[Math.floor(P.length / 2)];
      put(mid, f, -6);
    } else if (f.kind === 'railway' || f.kind === 'road') {
      const stops = [f.from, ...(f.via ?? []), f.to].filter(Boolean) as string[];
      const pts = stops.map((s) => ({ s, p: placeXY(s) }));
      const missing = pts.filter((x) => !x.p).map((x) => x.s);
      if (missing.length || pts.length < 2) { problems.push(`${f.kind === 'railway' ? 'Railway' : 'Road'} needs places on the map data (not found: ${missing.join(', ') || 'from/to'}).`); continue; }
      const P = pts.map((x) => x.p!) as [number, number][];
      const d = P.map((p, i) => `${i ? 'L' : 'M'}${n(p[0])},${n(p[1])}`).join(' ');
      if (f.kind === 'road') parts.push(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="4.2" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>`);
      else {
        // The map symbol for a railway: a line with cross ticks
        parts.push(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`);
        for (let i = 1; i < P.length; i++) {
          const [a, b] = [P[i - 1], P[i]], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
          for (let t = 6; t < len - 3; t += 11) parts.push(`<line x1="${n(a[0] + ux * t - uy * 4)}" y1="${n(a[1] + uy * t + ux * 4)}" x2="${n(a[0] + ux * t + uy * 4)}" y2="${n(a[1] + uy * t - ux * 4)}" stroke="${INK}" stroke-width="1.1"/>`);
        }
      }
      // Its letter beside the longest stretch, off the line
      let best = 1, bestLen = 0;
      for (let i = 1; i < P.length; i++) { const l = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (l > bestLen) { bestLen = l; best = i; } }
      const [a, b] = [P[best - 1], P[best]], len = Math.max(1, bestLen);
      const mid: [number, number] = [(a[0] + b[0]) / 2 + ((b[1] - a[1]) / len) * 14, (a[1] + b[1]) / 2 - ((b[0] - a[0]) / len) * 14];
      put(mid, f, 5);
      for (const x of pts) if (findPlace(data, x.s)) parts.push(`<circle cx="${n(x.p![0])}" cy="${n(x.p![1])}" r="2.6" fill="${INK}"/>`);
    } else if (f.kind === 'river') {
      const shapes = f.name ? findShapes(data, 'river', f.name) : [];
      if (!shapes.length) { problems.push(`River not found on the map data: ${f.name}`); continue; }
      put(lineMiddle(shapes, projection, W, H), f, -5);
    } else {
      const shapes = f.name ? findShapes(data, f.kind, f.name) : [];
      if (!shapes.length) { problems.push(`${f.kind[0].toUpperCase()}${f.kind.slice(1)} not found on the map data: ${f.name}`); continue; }
      const p = labelXY(shapes[0]);
      if (!inFrame(p)) { problems.push(`${f.name} is outside the map area.`); continue; }
      put(p, f, 5);
    }
  }
  if (spec.layers?.agroRegions) {
    for (const z of data.layers.agro.features) {
      const zone = String(z.properties?.name) as 'I' | 'IIa' | 'IIb' | 'III';
      const given = spec.layers.agroLabels?.[zone];
      const p = labelXY(z as Feature<Geometry>);
      if (!p) continue;
      if (given) labels.push(given);
      const words = given ?? `Region ${zone}`;
      const big = !!given && given.length <= 3;
      parts.push(`<rect x="${n(p[0] - words.length * (big ? 5.5 : 3.6) - 4)}" y="${n(p[1] - (big ? 14 : 11))}" width="${n(words.length * (big ? 11 : 7.2) + 8)}" height="${big ? 20 : 16}" fill="#fff" stroke="${INK}" stroke-width="0.6"/>`);
      parts.push(text(p[0], p[1] + (big ? 1 : 0), words, { size: big ? 15 : 11.5, anchor: 'middle', weight: 'bold' }));
    }
  }
  const dupes = labels.filter((l, i) => labels.indexOf(l) !== i);
  if (dupes.length) problems.push(`The same letter is used twice: ${[...new Set(dupes)].join(', ')}`);

  // Frame, north arrow, scale bar, key.
  parts.push(sketch ? roughPath(`M2,2 H${W - 2} V${H - 2} H2 Z`, { roughness: 0.5, strokeWidth: 1.4 }) : `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="${INK}" stroke-width="1.4"/>`);
  if (spec.north !== false) {
    const x = W - 30, y = 22;
    parts.push(`<path d="M${x},${y} l-7,22 l7,-6 l7,6 z" fill="${INK}"/>`, text(x, y + 38, 'N', { size: 13, anchor: 'middle', weight: 'bold', halo: true }));
  }
  if (spec.scale !== false && !isWorld) {
    const cy = H / 2;
    const a = projection.invert!([W / 2 - 50, cy]), b = projection.invert!([W / 2 + 50, cy]);
    if (a && b) {
      const kmPer100 = geoDistance(a, b) * 6371;
      const nice = [10, 20, 50, 100, 200, 250, 500, 1000, 2000].find((v) => (v / kmPer100) * 100 >= 70) ?? 2000;
      const len = (nice / kmPer100) * 100;
      const x = 16, y = H - 18;
      parts.push(`<rect x="${x - 4}" y="${y - 16}" width="${n(len + 36)}" height="24" fill="#fff" opacity="0.9"/>`);
      parts.push(`<path d="M${x},${y - 5} V${y} H${n(x + len)} V${y - 5} M${n(x + len / 2)},${y} V${y - 4}" fill="none" stroke="${INK}" stroke-width="1.2"/>`);
      parts.push(text(x, y - 8, '0', { size: 10, anchor: 'middle' }), text(x + len, y - 8, `${nice} km`, { size: 10, anchor: 'middle' }));
    }
  }
  if (spec.key !== false) {
    const rows: [string, string][] = [];
    const k = (kind: string) => usedKinds.has(kind);
    if (k('place')) rows.push(['dot', spec.features.some((f) => f.kind === 'place' && /mission/i.test(f.name ?? '')) ? 'Mission station / place' : 'Town / place']);
    if (k('kingdom')) rows.push(['oval', 'Kingdom']);
    if (k('route')) rows.push(['arrow', 'Route / movement']);
    if (k('railway')) rows.push(['rail', 'Railway']);
    if (k('road')) rows.push(['road', 'Main road']);
    if (spec.layers?.agroRegions) {
      for (const [zone, sym] of [['I', 'p-dots'], ['IIa', 'p-none'], ['IIb', 'p-hatch'], ['III', 'p-grey']] as const)
        if (!spec.layers.agroLabels?.[zone]) rows.push([sym, `Region ${zone}`]);
    }
    if (k('river') || riverNames !== 'none') rows.push(['river', 'River']);
    if (spec.layers?.provinces) rows.push(['dash', 'Provincial boundary']);
    rows.push(['line', 'International boundary']);
    const kw = 150, kh = 14 + rows.length * 16, kx = W - kw - 8, ky = H - kh - 8;
    parts.push(`<rect x="${kx}" y="${ky}" width="${kw}" height="${kh}" fill="#fff" stroke="${INK}" stroke-width="0.8"/>`);
    parts.push(text(kx + 8, ky + 12, 'Key', { size: 11, weight: 'bold' }));
    rows.forEach(([sym, label], i) => {
      const y = ky + 25 + i * 16, x = kx + 10;
      parts.push(
        sym === 'dot' ? `<circle cx="${x + 9}" cy="${y - 4}" r="3" fill="${INK}"/>`
          : sym === 'oval' ? `<ellipse cx="${x + 9}" cy="${y - 4}" rx="9" ry="5" fill="none" stroke="${INK}"/>`
          : sym === 'arrow' ? `<line x1="${x}" y1="${y - 4}" x2="${x + 18}" y2="${y - 4}" stroke="${INK}" stroke-width="1.4" marker-end="url(#${id}-arrow)"/>`
          : sym === 'river' ? `<path d="M${x},${y - 2} q4,-6 9,-2 t9,-2" fill="none" stroke="${INK}"/>`
          : sym === 'rail' ? `<line x1="${x}" y1="${y - 4}" x2="${x + 18}" y2="${y - 4}" stroke="${INK}" stroke-width="1.5"/>` + [3, 9, 15].map((t) => `<line x1="${x + t}" y1="${y - 8}" x2="${x + t}" y2="${y}" stroke="${INK}"/>`).join('')
          : sym === 'road' ? `<line x1="${x}" y1="${y - 4}" x2="${x + 18}" y2="${y - 4}" stroke="${INK}" stroke-width="4.2"/><line x1="${x}" y1="${y - 4}" x2="${x + 18}" y2="${y - 4}" stroke="#fff" stroke-width="2"/>`
          : sym.startsWith('p-') ? `<rect x="${x}" y="${y - 10}" width="18" height="11" fill="${sym === 'p-none' ? '#fff' : fillFor(id, sym.slice(2))}" stroke="${INK}" stroke-width="0.8"/>`
          : sym === 'dash' ? `<line x1="${x}" y1="${y - 4}" x2="${x + 18}" y2="${y - 4}" stroke="${INK}" stroke-dasharray="5 3"/>`
          : `<line x1="${x}" y1="${y - 4}" x2="${x + 18}" y2="${y - 4}" stroke="${INK}"/>`,
      );
      parts.push(text(x + 26, y, label, { size: 10.5 }));
    });
  }
  // Licence credit for the Zambian boundary data (CC BY 4.0 asks for it), under the frame.
  const credit = spec.layers?.provinces || spec.layers?.districts || spec.layers?.agroRegions || spec.features.some((f) => f.kind === 'province' || f.kind === 'district');
  if (credit) parts.push(text(W, H + 11, `Boundaries: Zambia Data Hub / geoBoundaries (CC BY 4.0)${spec.layers?.agroRegions ? '. Regions by district, approximate.' : ''}`, { size: 8, anchor: 'end' }));

  return { svg: svg(W, credit ? H + 14 : H, parts.join(''), esc(spec.title ?? 'Map')), problems };
}

export function mapPlaceholder(message: string) {
  return placeholder(message);
}
