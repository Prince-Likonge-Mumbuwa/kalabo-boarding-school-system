// figureMath.ts — the mathematics behind the exact maths figures: circle
// theorems, Earth geometry, Venn diagrams, transformations, coordinate
// geometry, bearings/trigonometry and solids (mensuration).
//
// The same file is used twice, so the drawing and the marking key always
// agree:
//   client/components/ai/figures/figureMath.ts      (the app draws with it)
//   ai-server/src/services/figures/figureMath.ts    (the server checks and
//                                                     works out answers)
// KEEP THE TWO COPIES IDENTICAL: change one, copy it over the other.
// It has no imports and touches no screen, so it runs in both places.
//
// Coordinates here are mathematical: x to the right, y UP. The drawers flip
// y when they put things on screen.

export interface Pt { x: number; y: number }

export const rad = (d: number) => (d * Math.PI) / 180;
export const deg = (r: number) => (r * 180) / Math.PI;
export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;

/** A number for a marking key: whole numbers stay whole, otherwise 2 d.p. at most. */
export function fmt(v: number, dp = 2): string {
  if (!Number.isFinite(v)) return '?';
  if (Math.abs(v - Math.round(v)) < 1e-6) return String(Math.round(v));
  return String(Number(v.toFixed(dp)));
}

/** A simple fraction when the value is one (4/3, −1/2), else a decimal. */
export function frac(v: number): string {
  for (let d = 1; d <= 12; d++) {
    const n = Math.round(v * d);
    if (Math.abs(n / d - v) < 1e-9) {
      if (d === 1) return String(n);
      const g = gcd(Math.abs(n), d);
      return `${n / g < 0 ? '−' : ''}${Math.abs(n / g)}/${d / g}`;
    }
  }
  return fmt(v, 3);
}
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** The angle AVB at V in degrees (0 to 180). */
export function angleAt(v: Pt, a: Pt, b: Pt): number {
  const a1 = Math.atan2(a.y - v.y, a.x - v.x), b1 = Math.atan2(b.y - v.y, b.x - v.x);
  let d = Math.abs(deg(a1 - b1)) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

/** Bearing of `to` from `from`: degrees clockwise from north (0 to 360). */
export function bearing(from: Pt, to: Pt): number {
  const b = deg(Math.atan2(to.x - from.x, to.y - from.y));
  return (b + 360) % 360;
}
export const threeFigure = (b: number) => `${String(Math.round(b) % 360).padStart(3, '0')}°`;

/** Point `distance` away from `p` on the bearing `b` (clockwise from north). */
export const onBearing = (p: Pt, b: number, distance: number): Pt => ({ x: p.x + distance * Math.sin(rad(b)), y: p.y + distance * Math.cos(rad(b)) });

/**
 * Splits an angle or shape name like "ABT", "OAB", "A1B1C1" or "T'CB" into
 * point ids, trying the longest known id first. Null if it cannot be split.
 */
export function splitIds(name: string, ids: string[]): string[] | null {
  const byLength = [...ids].sort((a, b) => b.length - a.length);
  const out: string[] = [];
  let i = 0;
  const s = name.replace(/[∠\s^]|\\angle|\\hat\{?|}/g, '');
  while (i < s.length) {
    const id = byLength.find((k) => s.startsWith(k, i));
    if (!id) return null;
    out.push(id);
    i += id.length;
  }
  return out;
}

/** Turns "A1" into "A₁" for labels on a drawing. */
export const subscript = (s: string) => s.replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]);

// ─────────────────────────── Lines ───────────────────────────

/** A line through p in direction d. */
export interface Line { p: Pt; d: Pt }

export function intersect(l1: Line, l2: Line): Pt | null {
  const den = l1.d.x * l2.d.y - l1.d.y * l2.d.x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((l2.p.x - l1.p.x) * l2.d.y - (l2.p.y - l1.p.y) * l2.d.x) / den;
  return { x: l1.p.x + t * l1.d.x, y: l1.p.y + t * l1.d.y };
}

/** "y = 2x + 3", "x = 4", "y = −x/2 + 1" for the line through two points. */
export function lineEquation(a: Pt, b: Pt): string {
  if (near(a.x, b.x)) return `x = ${frac(a.x)}`;
  const m = (b.y - a.y) / (b.x - a.x);
  const c = a.y - m * a.x;
  return equationFrom(m, c);
}
export function equationFrom(m: number, c: number): string {
  const mx = near(m, 0) ? '' : near(m, 1) ? 'x' : near(m, -1) ? '−x' : `${frac(m)}x`;
  if (!mx) return `y = ${frac(c)}`;
  if (near(c, 0)) return `y = ${mx}`;
  return `y = ${mx} ${c < 0 ? '−' : '+'} ${frac(Math.abs(c))}`;
}

/**
 * Reads a line written as text: "x-axis", "y-axis", "y = x", "y = -x",
 * "x = 2", "y = -1", "y = 2x + 3", "y = -x/2 + 1". Returns ax + by = c.
 */
export function parseLine(text: string): { a: number; b: number; c: number } | null {
  const s = text.toLowerCase().replace(/\s+/g, '').replace(/−/g, '-');
  if (s === 'x-axis' || s === 'y=0') return { a: 0, b: 1, c: 0 };
  if (s === 'y-axis' || s === 'x=0') return { a: 1, b: 0, c: 0 };
  let m = /^x=(-?\d*\.?\d+(?:\/\d+)?)$/.exec(s);
  if (m) return { a: 1, b: 0, c: num(m[1]) };
  m = /^y=(-?\d*\.?\d*(?:\/\d+)?)\*?x(?:\/(\d+))?([+-]\d*\.?\d+(?:\/\d+)?)?$/.exec(s);
  if (m) {
    const coef = m[1] === '' ? 1 : m[1] === '-' ? -1 : num(m[1]);
    const slope = m[2] ? coef / Number(m[2]) : coef;
    return { a: -slope, b: 1, c: m[3] ? num(m[3]) : 0 };
  }
  m = /^y=(-?\d*\.?\d+(?:\/\d+)?)$/.exec(s);
  if (m) return { a: 0, b: 1, c: num(m[1]) };
  return null;
}
const num = (s: string) => {
  const [p, q] = s.split('/');
  return q ? Number(p) / Number(q) : Number(p);
};

// ─────────────────────────── Circle theorems ───────────────────────────

/**
 * A point in a circle-theorem figure (the circle has radius 1, centre at 0,0):
 *   { id, at }        on the circle, `at` degrees anticlockwise from the right
 *   { id, x, y }      anywhere (in radii)
 *   { id, meet }      where two lines cross: ["A","C"] is the line AC,
 *                     "tangent:B" the tangent at B
 *   { id, along, distance }  on a line ("tangent:B" or ["A","C"]) at this many
 *                     radii from its first point (negative = the other way)
 */
export type LineRef = string | [string, string];
export interface CirclePoint { id: string; at?: number; x?: number; y?: number; meet?: [LineRef, LineRef]; along?: LineRef; distance?: number }

export function circleLayout(points: CirclePoint[], centre = 'O'): { pos: Record<string, Pt>; problems: string[] } {
  const pos: Record<string, Pt> = { [centre]: { x: 0, y: 0 } };
  const problems: string[] = [];
  const lineOf = (ref: LineRef): Line | null => {
    if (typeof ref === 'string') {
      const t = /^tangent:(.+)$/.exec(ref.trim());
      const p = t ? pos[t[1]] : null;
      return p ? { p, d: { x: -p.y, y: p.x } } : null;
    }
    const [a, b] = [pos[ref[0]], pos[ref[1]]];
    return a && b ? { p: a, d: { x: b.x - a.x, y: b.y - a.y } } : null;
  };
  // Points may refer to points defined after them: keep going while progress is made.
  let pending = points.filter((p) => p.id !== centre);
  for (let pass = 0; pass < 6 && pending.length; pass++) {
    const left: CirclePoint[] = [];
    for (const p of pending) {
      if (typeof p.at === 'number') pos[p.id] = { x: Math.cos(rad(p.at)), y: Math.sin(rad(p.at)) };
      else if (typeof p.x === 'number' && typeof p.y === 'number') pos[p.id] = { x: p.x, y: p.y };
      else if (p.meet) {
        const [l1, l2] = [lineOf(p.meet[0]), lineOf(p.meet[1])];
        if (!l1 || !l2) { left.push(p); continue; }
        const q = intersect(l1, l2);
        if (!q) problems.push(`Point ${p.id}: the two lines are parallel and never meet.`);
        else if (Math.hypot(q.x, q.y) > 6) problems.push(`Point ${p.id} is very far from the circle (the lines almost never meet); change the positions.`);
        else pos[p.id] = q;
      } else if (p.along) {
        const l = lineOf(p.along);
        if (!l) { left.push(p); continue; }
        const len = Math.hypot(l.d.x, l.d.y) || 1;
        const k = (p.distance ?? 1) / len;
        pos[p.id] = { x: l.p.x + k * l.d.x, y: l.p.y + k * l.d.y };
      } else problems.push(`Point ${p.id} needs "at", "x"/"y", "meet" or "along".`);
    }
    pending = left;
  }
  for (const p of pending) problems.push(`Point ${p.id} refers to points that do not exist.`);
  return { pos, problems };
}

/** Is `name` an angle that can be measured from these points? Returns degrees. */
export function measureAngle(name: string | string[], pos: Record<string, Pt>): number | null {
  const ids = Array.isArray(name) ? name : splitIds(name, Object.keys(pos));
  if (!ids || ids.length !== 3) return null;
  const [a, v, b] = ids.map((k) => pos[k]);
  if (!a || !v || !b || dist(a, v) < 1e-9 || dist(b, v) < 1e-9) return null;
  return angleAt(v, a, b);
}

/** The number in an angle label: "40°" -> 40, "x" -> null. */
export const labelDegrees = (label: string | undefined) => {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*(?:°|\^\\circ|\\circ|deg)?\s*$/.exec(label ?? '');
  return m ? Number(m[1]) : null;
};

// ─────────────────────────── Earth geometry ───────────────────────────

/** ECZ constants: R = 6370 km = 3437 nautical miles, π = 3.142, 1° = 60 nm. */
export const EARTH = { km: 6370, nm: 3437, pi: 3.142 };

/** Latitude/longitude as written on a paper: "52°N", "43°W", "0°". North/east positive. */
export function readLatLong(v: number | string, kind: 'lat' | 'long'): number | null {
  if (typeof v === 'number') return v;
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*°?\s*([NSEW])?\s*$/i.exec(v);
  if (!m) return null;
  const x = Number(m[1]);
  const h = (m[2] ?? '').toUpperCase();
  if ((kind === 'lat' && /[EW]/.test(h)) || (kind === 'long' && /[NS]/.test(h))) return null;
  return h === 'S' || h === 'W' ? -x : x;
}
export const latText = (lat: number) => (near(lat, 0) ? '0° (equator)' : `${fmt(Math.abs(lat))}°${lat > 0 ? 'N' : 'S'}`);
export const longText = (long: number) => (near(long, 0) ? '0°' : `${fmt(Math.abs(long))}°${long > 0 ? 'E' : 'W'}`);

/** Difference in longitude, the short way round (0 to 180). */
export const longDifference = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** Distances and time difference between two places, as ECZ marking keys give them. */
export function earthPair(a: { lat: number; long: number }, b: { lat: number; long: number }): Record<string, string> {
  const out: Record<string, string> = {};
  const dLong = longDifference(a.long, b.long);
  const { km, nm, pi } = EARTH;
  if (dLong > 0) {
    out['difference in longitude'] = `${fmt(dLong)}°`;
    const mins = dLong * 4;
    out['time difference'] = mins < 60 ? `${fmt(mins)} min` : `${fmt(mins)} min = ${Math.floor(mins / 60)} h ${fmt(mins % 60)} min`;
  }
  if (near(a.lat, b.lat, 1e-9) && dLong > 0) {
    const c = Math.cos(rad(a.lat));
    out['distance along the parallel'] = `${fmt(dLong * 60 * c, 1)} nm = ${fmt((dLong / 360) * 2 * pi * km * c, 0)} km (2πR cos ${fmt(Math.abs(a.lat))}° × ${fmt(dLong)}/360)`;
  }
  if (near(dLong, 0) && !near(a.lat, b.lat)) {
    const dLat = Math.abs(a.lat - b.lat);
    out['distance along the meridian'] = `${fmt(dLat * 60)} nm = ${fmt((dLat / 360) * 2 * pi * km, 0)} km (difference in latitude ${fmt(dLat)}°)`;
  }
  if (near(dLong, 180)) {
    const over = 180 - Math.abs(a.lat + b.lat);
    out['distance over the pole'] = `${fmt(over * 60)} nm = ${fmt((over / 360) * 2 * pi * km, 0)} km (angle ${fmt(over)}°)`;
  }
  return out;
}

/** Length of a circle of latitude. */
export const parallelLength = (lat: number) =>
  `${fmt(2 * EARTH.pi * EARTH.nm * Math.cos(rad(lat)), 0)} nm = ${fmt(2 * EARTH.pi * EARTH.km * Math.cos(rad(lat)), 0)} km`;

// ─────────────────────────── Venn diagrams ───────────────────────────

/**
 * Regions of a 2- or 3-set Venn diagram are named by the sets they are
 * inside, in the order the sets are listed: "A", "AB", "ABC" … and "" for
 * the part outside every circle. Set ids are single letters.
 */
export function vennRegions(ids: string[]): string[] {
  const out: string[] = [];
  for (let mask = 0; mask < 1 << ids.length; mask++) out.push(ids.filter((_, i) => mask & (1 << i)).join(''));
  return out;
}
/** Puts a region key into the standard order ("BA" -> "AB"); null if it names an unknown set. */
export function regionKey(key: string, ids: string[]): string | null {
  const k = key.replace(/\s|∩/g, '');
  if (k === '' || /^(none|outside|ξ|ε|universal)$/i.test(k)) return '';
  if ([...k].some((c) => !ids.includes(c)) || new Set(k).size !== k.length) return null;
  return ids.filter((i) => k.includes(i)).join('');
}

/**
 * The regions a set expression covers: "A′ ∩ (B ∩ C)", "(P ∪ Q)' ∩ R",
 * "A - B". ∩ is done before ∪. Throws a readable error on a mistake.
 */
export function shadeRegions(expr: string, ids: string[]): string[] {
  const all = vennRegions(ids);
  const s = expr.replace(/\\cup|\bunion\b/gi, '∪').replace(/\\cap|\bintersection\b/gi, '∩').replace(/\^\{?(?:c|\\prime|′|')\}?|[′’]/g, "'").replace(/\s+/g, '');
  let i = 0;
  const fail = (why: string): never => { throw new Error(`Cannot read the set expression "${expr}": ${why}.`); };
  const atom = (): Set<string> => {
    let r: Set<string>;
    const c = s[i];
    if (c === '(') { i++; r = union(); if (s[i] !== ')') fail('a bracket is not closed'); i++; }
    else if (c && /[ξε]/.test(c)) { i++; r = new Set(all); }
    else if (c && ids.includes(c)) { i++; r = new Set(all.filter((k) => k.includes(c))); }
    else r = fail(c ? `"${c}" is not one of the sets ${ids.join(', ')}` : 'it ends too early');
    while (s[i] === "'") { i++; r = new Set(all.filter((k) => !r.has(k))); }
    return r;
  };
  const inter = (): Set<string> => {
    let r = atom();
    while (s[i] === '∩') { i++; const b = atom(); r = new Set([...r].filter((k) => b.has(k))); }
    return r;
  };
  const union = (): Set<string> => {
    let r = inter();
    while (s[i] === '∪' || s[i] === '-' || s[i] === '\\') {
      const op = s[i++];
      const b = inter();
      r = op === '∪' ? new Set([...r, ...b]) : new Set([...r].filter((k) => !b.has(k)));
    }
    return r;
  };
  const out = union();
  if (i < s.length) fail(`unexpected "${s[i]}"`);
  return all.filter((k) => out.has(k));
}

/**
 * Region counts from the totals a question gives (inclusion–exclusion).
 * `totals` keys: "A" = n(A), "AB" = n(A ∩ B), "ABC" = n(A ∩ B ∩ C), "ξ" = n(ξ).
 * Returns null when not enough is given.
 */
export function solveVenn(ids: string[], totals: Record<string, number>): Record<string, number> | null {
  const regions = vennRegions(ids);
  const tot: Record<string, number> = {};
  for (const [k, v] of Object.entries(totals)) {
    const key = /^(ξ|ε|E|universal|total)$/i.test(k) && !ids.includes(k) ? 'ξ' : regionKey(k, ids);
    if (key !== null) tot[key] = v;
  }
  const inside = regions.filter((r) => r !== '');
  if (!inside.every((r) => typeof tot[r] === 'number')) return null;
  // Exactly the region r = n(∩ of r) − (regions strictly containing r), largest first.
  const out: Record<string, number> = {};
  for (const r of [...inside].sort((a, b) => b.length - a.length))
    out[r] = tot[r] - inside.filter((s) => s.length > r.length && [...r].every((c) => s.includes(c))).reduce((sum, s) => sum + out[s], 0);
  if (typeof tot['ξ'] === 'number') out[''] = tot['ξ'] - inside.reduce((sum, r) => sum + out[r], 0);
  return out;
}

/** n(A), n(A ∩ B) … and the usual "only" counts from region counts. */
export function vennTotals(ids: string[], counts: Record<string, number>): Record<string, string> {
  const regions = vennRegions(ids);
  const out: Record<string, string> = {};
  const has = (r: string) => typeof counts[r] === 'number';
  const sum = (rs: string[]) => rs.reduce((s, r) => s + (counts[r] ?? 0), 0);
  if (!regions.filter((r) => r !== '').every(has)) return out;
  for (const id of ids) out[`n(${id})`] = fmt(sum(regions.filter((r) => r.includes(id))));
  for (const id of ids) out[`${id} only`] = fmt(counts[id]);
  if (ids.length === 3) {
    out['exactly one set'] = fmt(sum(regions.filter((r) => r.length === 1)));
    out['exactly two sets'] = fmt(sum(regions.filter((r) => r.length === 2)));
  }
  out['at least one set'] = fmt(sum(regions.filter((r) => r !== '')));
  if (has('')) out['n(ξ)'] = fmt(sum(regions));
  return out;
}

// ─────────────────────────── Transformations ───────────────────────────

export type Transform =
  | { type: 'translate'; vector: [number, number] }
  | { type: 'reflect'; line: string }
  | { type: 'rotate'; angle: number; centre?: [number, number] }
  | { type: 'enlarge'; factor: number; centre?: [number, number] }
  | { type: 'stretch'; factor: number; invariant: 'x-axis' | 'y-axis' }
  | { type: 'shear'; factor: number; invariant: 'x-axis' | 'y-axis' }
  | { type: 'matrix'; matrix: [[number, number], [number, number]] };

/** Where a transformation sends a point. Rotation angles: anticlockwise positive. */
export function applyTransform(t: Transform, p: Pt): Pt {
  switch (t.type) {
    case 'translate': return { x: p.x + t.vector[0], y: p.y + t.vector[1] };
    case 'reflect': {
      const l = parseLine(t.line);
      if (!l) throw new Error(`Cannot read the mirror line "${t.line}" (write e.g. y = x, x = 2, y = -1, y-axis).`);
      const k = (2 * (l.a * p.x + l.b * p.y - l.c)) / (l.a * l.a + l.b * l.b);
      return { x: p.x - k * l.a, y: p.y - k * l.b };
    }
    case 'rotate': {
      const [cx, cy] = t.centre ?? [0, 0];
      const c = Math.cos(rad(t.angle)), s = Math.sin(rad(t.angle));
      return clean({ x: cx + c * (p.x - cx) - s * (p.y - cy), y: cy + s * (p.x - cx) + c * (p.y - cy) });
    }
    case 'enlarge': {
      const [cx, cy] = t.centre ?? [0, 0];
      return { x: cx + t.factor * (p.x - cx), y: cy + t.factor * (p.y - cy) };
    }
    case 'stretch':
      return t.invariant === 'x-axis' ? { x: p.x, y: t.factor * p.y } : { x: t.factor * p.x, y: p.y };
    case 'shear':
      return t.invariant === 'x-axis' ? { x: p.x + t.factor * p.y, y: p.y } : { x: p.x, y: p.y + t.factor * p.x };
    case 'matrix': {
      const [[a, b], [c, d]] = t.matrix;
      return { x: a * p.x + b * p.y, y: c * p.x + d * p.y };
    }
  }
}
const clean = (p: Pt): Pt => ({ x: Math.round(p.x * 1e9) / 1e9, y: Math.round(p.y * 1e9) / 1e9 });

export const pointText = (p: Pt) => `(${frac(p.x)}, ${frac(p.y)})`;
const matrixText = (m: number[][]) => `(${frac(m[0][0])} ${frac(m[0][1])} / ${frac(m[1][0])} ${frac(m[1][1])})`;

/**
 * Describes fully the single transformation that maps one shape onto
 * another (vertices in matching order), as an ECZ answer would.
 */
export function describeTransformation(src: Pt[], dst: Pt[]): string | null {
  if (src.length !== dst.length || src.length < 3) return null;
  // Fit x' = a x + b y + e, y' = c x + d y + f on three corners that are not in a line.
  const idx = findTriangle(src);
  if (!idx) return null;
  const [p, q, r] = idx.map((i) => src[i]);
  const [p2, q2, r2] = idx.map((i) => dst[i]);
  const det = (q.x - p.x) * (r.y - p.y) - (r.x - p.x) * (q.y - p.y);
  const solve = (u: number, v: number, w: number) => {
    const A = ((v - u) * (r.y - p.y) - (w - u) * (q.y - p.y)) / det;
    const B = ((w - u) * (q.x - p.x) - (v - u) * (r.x - p.x)) / det;
    return [A, B, u - A * p.x - B * p.y];
  };
  const [a, b, e] = solve(p2.x, q2.x, r2.x);
  const [c, d, f] = solve(p2.y, q2.y, r2.y);
  const map = (s: Pt) => ({ x: a * s.x + b * s.y + e, y: c * s.x + d * s.y + f });
  if (!src.every((s, i) => dist(map(s), dst[i]) < 1e-6)) return null; // not one transformation
  const eq = (x: number, y: number) => near(x, y, 1e-6);
  const M = [[a, b], [c, d]];
  const t = { x: e, y: f };
  if (eq(a, 1) && eq(b, 0) && eq(c, 0) && eq(d, 1))
    return eq(e, 0) && eq(f, 0) ? 'no change (identity)' : `translation by the vector (${frac(e)} / ${frac(f)})`;
  if (eq(b, 0) && eq(c, 0) && eq(a, d)) {
    const k = a, centre = { x: e / (1 - k), y: f / (1 - k) };
    return `enlargement, scale factor ${frac(k)}, centre ${pointText(centre)}`;
  }
  const detM = a * d - b * c;
  const orthogonal = eq(a * a + c * c, 1) && eq(b * b + d * d, 1) && eq(a * b + c * d, 0);
  if (orthogonal && eq(detM, 1)) {
    const angle = Math.round(deg(Math.atan2(c, a)) * 1e6) / 1e6;
    // Centre: solve (I − M) z = t
    const m11 = 1 - a, m12 = -b, m21 = -c, m22 = 1 - d, dd = m11 * m22 - m12 * m21;
    const centre = { x: (t.x * m22 - m12 * t.y) / dd, y: (m11 * t.y - m21 * t.x) / dd };
    const turn = Math.abs(angle) === 180 ? 'rotation of 180° (half turn)' : `rotation of ${fmt(Math.abs(angle))}° ${angle > 0 ? 'anticlockwise' : 'clockwise'}`;
    return `${turn} about ${pointText(centre)}`;
  }
  if (orthogonal && eq(detM, -1)) {
    // Mirror direction at half the angle of the first column; t/2 lies on the mirror.
    const alpha = Math.atan2(c, a) / 2;
    const dir = { x: Math.cos(alpha), y: Math.sin(alpha) };
    const on = { x: t.x / 2, y: t.y / 2 };
    return `reflection in the line ${mirrorText(on, dir)}`;
  }
  if (eq(e, 0) && eq(f, 0)) {
    if (eq(a, 1) && eq(d, 1) && eq(c, 0)) return `shear, x-axis invariant, shear factor ${frac(b)} (matrix ${matrixText(M)})`;
    if (eq(a, 1) && eq(d, 1) && eq(b, 0)) return `shear, y-axis invariant, shear factor ${frac(c)} (matrix ${matrixText(M)})`;
    if (eq(b, 0) && eq(c, 0) && eq(d, 1)) return `stretch parallel to the x-axis, y-axis invariant, scale factor ${frac(a)} (matrix ${matrixText(M)})`;
    if (eq(b, 0) && eq(c, 0) && eq(a, 1)) return `stretch parallel to the y-axis, x-axis invariant, scale factor ${frac(d)} (matrix ${matrixText(M)})`;
    return `the transformation with matrix ${matrixText(M)}`;
  }
  return `matrix ${matrixText(M)} followed by translation (${frac(e)} / ${frac(f)})`;
}
function findTriangle(ps: Pt[]): [number, number, number] | null {
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++)
      for (let k = j + 1; k < ps.length; k++) {
        const cross = (ps[j].x - ps[i].x) * (ps[k].y - ps[i].y) - (ps[k].x - ps[i].x) * (ps[j].y - ps[i].y);
        if (Math.abs(cross) > 1e-9) return [i, j, k];
      }
  return null;
}
function mirrorText(on: Pt, dir: Pt): string {
  if (Math.abs(dir.x) < 1e-9) return near(on.x, 0) ? 'y-axis (x = 0)' : `x = ${frac(on.x)}`;
  const m = dir.y / dir.x;
  const c = on.y - m * on.x;
  if (near(m, 0) && near(c, 0)) return 'x-axis (y = 0)';
  return equationFrom(Math.round(m * 1e9) / 1e9, Math.round(c * 1e9) / 1e9);
}

// ─────────────────────────── Bearings and trigonometry ───────────────────────────

/**
 * A point in a bearings or trigonometry figure (any units, y up):
 *   { id, x, y }                         where it is
 *   { id, from, bearing, distance }      from another point on a bearing
 *   { id, from, angle, distance }        from another point, `angle` degrees
 *                                        anticlockwise from the right
 */
export interface PlanePoint { id: string; x?: number; y?: number; from?: string; bearing?: number; angle?: number; distance?: number }

export function planeLayout(points: PlanePoint[]): { pos: Record<string, Pt>; problems: string[] } {
  const pos: Record<string, Pt> = {};
  const problems: string[] = [];
  let pending = [...points];
  for (let pass = 0; pass < 6 && pending.length; pass++) {
    const left: PlanePoint[] = [];
    for (const p of pending) {
      if (typeof p.x === 'number' && typeof p.y === 'number') pos[p.id] = { x: p.x, y: p.y };
      else if (p.from) {
        const o = pos[p.from];
        if (!o) { left.push(p); continue; }
        const d = p.distance ?? 1;
        if (typeof p.bearing === 'number') pos[p.id] = onBearing(o, p.bearing, d);
        else if (typeof p.angle === 'number') pos[p.id] = { x: o.x + d * Math.cos(rad(p.angle)), y: o.y + d * Math.sin(rad(p.angle)) };
        else problems.push(`Point ${p.id} needs a "bearing" or an "angle" from ${p.from}.`);
      } else if (!pass) pos[p.id] = { x: 0, y: 0 }; // the first point with no position is the origin
      else problems.push(`Point ${p.id} has no position.`);
    }
    pending = left;
  }
  for (const p of pending) problems.push(`Point ${p.id} is placed from a point that does not exist.`);
  return { pos, problems };
}

/** The length in a side label: "23.7 m" -> 23.7. */
export const labelLength = (label: string | undefined) => {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(?:k?m|cm|mm|units?|nm)?\s*$/i.exec(label ?? '');
  return m ? Number(m[1]) : null;
};

export function polygonArea(ps: Pt[]): number {
  let s = 0;
  ps.forEach((p, i) => { const q = ps[(i + 1) % ps.length]; s += p.x * q.y - q.x * p.y; });
  return Math.abs(s) / 2;
}

// ─────────────────────────── Solids (mensuration) ───────────────────────────

export type SolidShape = 'cuboid' | 'cube' | 'cylinder' | 'cone' | 'frustum' | 'pyramid' | 'pyramid-frustum' | 'prism' | 'sphere' | 'hemisphere';
export interface SolidDims {
  length?: number; width?: number; height?: number;
  radius?: number; topRadius?: number;
  /** pyramid-frustum: the top rectangle. prism: the triangle's base. */
  topLength?: number; topWidth?: number; base?: number; triangleHeight?: number;
}

/** Volumes and surface areas, worked with π = 3.142 (ECZ) unless told otherwise. */
export function solidMeasures(shape: SolidShape, d: SolidDims, pi = EARTH.pi): Record<string, string> {
  const out: Record<string, string> = {};
  const L = d.length, W = d.width ?? d.length, H = d.height, r = d.radius, r2 = d.topRadius;
  const put = (k: string, v: number | undefined) => { if (typeof v === 'number' && Number.isFinite(v)) out[k] = fmt(v); };
  switch (shape) {
    case 'cube':
    case 'cuboid': {
      const h = shape === 'cube' ? L : H;
      if (L && W && h) { put('volume', L * W * h); put('total surface area', 2 * (L * W + L * h + W * h)); put('space diagonal', Math.hypot(L, W, h)); }
      break;
    }
    case 'cylinder':
      if (r && H) { put('volume', pi * r * r * H); put('curved surface area', 2 * pi * r * H); put('total surface area', 2 * pi * r * (r + H)); }
      break;
    case 'cone':
      if (r && H) { const l = Math.hypot(r, H); put('slant height', l); put('volume', (pi * r * r * H) / 3); put('curved surface area', pi * r * l); put('total surface area', pi * r * (r + l)); }
      break;
    case 'frustum':
      if (r && r2 !== undefined && H) {
        const big = Math.max(r, r2), small = Math.min(r, r2);
        put('volume', ((pi * H) / 3) * (big * big + big * small + small * small));
        put('slant height', Math.hypot(H, big - small));
        if (big > small) {
          const apex = (H * big) / (big - small);
          put('height of the whole cone', apex);
          put('height of the small cone removed', apex - H);
          put('volume of the whole cone', (pi * big * big * apex) / 3);
          put('volume of the small cone removed', (pi * small * small * (apex - H)) / 3);
        }
      }
      break;
    case 'pyramid':
      if (L && W && H) { put('volume', (L * W * H) / 3); put('slant edge', Math.hypot(L / 2, W / 2, H)); }
      break;
    case 'pyramid-frustum': {
      const tl = d.topLength, tw = d.topWidth ?? d.topLength;
      if (L && W && tl && tw && H) {
        const A1 = L * W, A2 = tl * tw;
        put('area of the bottom', A1); put('area of the top', A2);
        put('volume', (H / 3) * (A1 + A2 + Math.sqrt(A1 * A2)));
      }
      break;
    }
    case 'prism':
      if (d.base && d.triangleHeight && L) { put('cross-section area', (d.base * d.triangleHeight) / 2); put('volume', ((d.base * d.triangleHeight) / 2) * L); }
      break;
    case 'sphere':
      if (r) { put('volume', (4 / 3) * pi * r ** 3); put('surface area', 4 * pi * r * r); }
      break;
    case 'hemisphere':
      if (r) { put('volume', (2 / 3) * pi * r ** 3); put('curved surface area', 2 * pi * r * r); put('total surface area', 3 * pi * r * r); }
      break;
  }
  return out;
}

// ─────────────────────────── Inequalities and linear programming ───────────────────────────

/** ax + by + k, read from text like "0.2x + 0.3y", "2x", "-y", "x/2", "60 - x", "15". */
export function parseLinear(text: string): { a: number; b: number; k: number } | null {
  const s = text.replace(/\s+/g, '').replace(/−/g, '-').replace(/\*/g, '');
  if (!s) return null;
  const terms = s.match(/[+-]?[^+-]+/g);
  if (!terms || terms.join('') !== s) return null;
  let a = 0, b = 0, k = 0;
  for (const t of terms) {
    const m = /^([+-]?)(\d*\.?\d*)(?:\/(\d+(?:\.\d+)?))?([xy])?(?:\/(\d+(?:\.\d+)?))?$/.exec(t);
    if (!m || (!m[2] && !m[4])) return null;
    const sign = m[1] === '-' ? -1 : 1;
    let v = m[2] === '' ? 1 : Number(m[2]);
    if (m[3]) v /= Number(m[3]);
    if (m[5]) v /= Number(m[5]);
    if (!Number.isFinite(v)) return null;
    if (m[4] === 'x') a += sign * v; else if (m[4] === 'y') b += sign * v; else k += sign * v;
  }
  return { a, b, k };
}

/** An inequality as a·x + b·y ≤ c (or < c when strict), read from "x + y <= 60", "y ≥ 2x", "3 < x". */
export interface Inequality { a: number; b: number; c: number; strict: boolean; text: string }
export function parseInequality(text: string): Inequality | null {
  const s = text.replace(/≤|=<|⩽/g, '<=').replace(/≥|=>|⩾/g, '>=').replace(/\\le(q)?/g, '<=').replace(/\\ge(q)?/g, '>=').replace(/\$/g, '');
  const m = /^(.*?)(<=|>=|<|>)(.*)$/.exec(s);
  if (!m) return null;
  const left = parseLinear(m[1]), right = parseLinear(m[3]);
  if (!left || !right) return null;
  // left − right  (op)  0
  let a = left.a - right.a, b = left.b - right.b, c = right.k - left.k;
  if (m[2].startsWith('>')) { a = -a; b = -b; c = -c; }
  if (Math.abs(a) < 1e-12 && Math.abs(b) < 1e-12) return null;
  return { a, b, c, strict: !m[2].endsWith('='), text: text.trim() };
}

/** The boundary line of an inequality, written nicely: "x + y = 60", "y = 2x", "x = 10". */
export function boundaryText(q: Inequality): string {
  const { a, b, c } = q;
  const term = (v: number, s: string, first: boolean) => {
    if (Math.abs(v) < 1e-12) return '';
    const mag = Math.abs(v), coef = Math.abs(mag - 1) < 1e-12 ? '' : fmt(mag, 3);
    return `${v < 0 ? (first ? '−' : ' − ') : first ? '' : ' + '}${coef}${s}`;
  };
  if (Math.abs(b) < 1e-12) return `x = ${fmt(c / a, 3)}`;
  if (Math.abs(a) < 1e-12) return `y = ${fmt(c / b, 3)}`;
  if (Math.abs(c) < 1e-12) return `y = ${frac(-a / b)}x`.replace('= 1x', '= x').replace('= −1x', '= −x');
  const flip = a < 0 && b < 0;
  const [A, B, C] = flip ? [-a, -b, -c] : [a, b, c];
  return `${term(A, 'x', true)}${term(B, 'y', false)} = ${fmt(C, 3)}`;
}

/** Cuts a convex polygon down to the part where a·x + b·y ≤ c. */
function clip(poly: Pt[], q: Inequality): Pt[] {
  const out: Pt[] = [];
  const side = (p: Pt) => q.a * p.x + q.b * p.y - q.c;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], r = poly[(i + 1) % poly.length];
    const sp = side(p), sr = side(r);
    if (sp <= 1e-9) out.push(p);
    if ((sp < -1e-9 && sr > 1e-9) || (sp > 1e-9 && sr < -1e-9)) {
      const t = sp / (sp - sr);
      out.push({ x: p.x + t * (r.x - p.x), y: p.y + t * (r.y - p.y) });
    }
  }
  return out;
}

/**
 * The region R that satisfies every inequality, inside the axes box: its
 * corners in anticlockwise order, starting from the bottom-left one. Corners
 * on the box edge are kept (the region may run off the graph).
 */
export function feasibleRegion(ineqs: Inequality[], box: { x0: number; x1: number; y0: number; y1: number }): Pt[] {
  let poly: Pt[] = [{ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y0 }, { x: box.x1, y: box.y1 }, { x: box.x0, y: box.y1 }];
  for (const q of ineqs) { poly = clip(poly, q); if (!poly.length) return []; }
  // Tidy: round away floating dust and drop repeated corners.
  const clean = poly.map((p) => ({ x: Math.round(p.x * 1e9) / 1e9, y: Math.round(p.y * 1e9) / 1e9 }))
    .filter((p, i, all) => dist(p, all[(i + 1) % all.length]) > 1e-7);
  if (clean.length < 3) return clean;
  const start = clean.reduce((best, p, i) => (p.y < clean[best].y - 1e-9 || (Math.abs(p.y - clean[best].y) < 1e-9 && p.x < clean[best].x) ? i : best), 0);
  const ordered = [...clean.slice(start), ...clean.slice(0, start)];
  // Anticlockwise (positive signed area)
  let s = 0;
  ordered.forEach((p, i) => { const q = ordered[(i + 1) % ordered.length]; s += p.x * q.y - q.x * p.y; });
  return s < 0 ? [ordered[0], ...ordered.slice(1).reverse()] : ordered;
}

/** Value of a linear objective like "15x + 20y" at a point. */
export function objectiveAt(expr: string, p: Pt): number | null {
  const l = parseLinear(expr.replace(/^[A-Za-z]\s*=\s*/, '').replace(/K/g, ''));
  return l ? l.a * p.x + l.b * p.y + l.k : null;
}

/** The whole-number point in the region with the best objective (for "how many of each" when a corner is not whole). */
export function bestWholePoint(ineqs: Inequality[], corners: Pt[], expr: string, goal: 'max' | 'min'): Pt | null {
  if (!corners.length) return null;
  const xs = corners.map((p) => p.x), ys = corners.map((p) => p.y);
  const x0 = Math.ceil(Math.min(...xs) - 1e-9), x1 = Math.floor(Math.max(...xs) + 1e-9);
  const y0 = Math.ceil(Math.min(...ys) - 1e-9), y1 = Math.floor(Math.max(...ys) + 1e-9);
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > 2_000_000) return null; // too many to try
  let best: Pt | null = null, bestV = goal === 'max' ? -Infinity : Infinity;
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++) {
      if (!ineqs.every((q) => q.a * x + q.b * y < q.c + (q.strict ? -1e-9 : 1e-9))) continue;
      const v = objectiveAt(expr, { x, y })!;
      if (goal === 'max' ? v > bestV : v < bestV) { bestV = v; best = { x, y }; }
    }
  return best;
}

// ─────────────────────────── Set notation for shaded regions ───────────────────────────

/**
 * The shortest usual way to write a set of Venn regions in set notation
 * (A′ ∩ B, (A ∪ B)′, A ∩ B ∩ C′ …), for "Use set notation to describe the
 * shaded region". Falls back to a union of the regions.
 */
export function setNotation(regions: string[], ids: string[]): string {
  const all = vennRegions(ids);
  const bit = (r: string) => 1 << all.indexOf(r);
  const want = regions.reduce((m, r) => m | bit(r), 0);
  const full = (1 << all.length) - 1;
  if (want === full) return 'ξ';
  if (want === 0) return '∅';
  // Simplest first: fewest operations, then fewest primes, so "(A ∪ B)′" beats "A′ ∩ B′" as ECZ writes it.
  const cost = (s: string) => 2 * (s.match(/[∩∪]/g)?.length ?? 0) + (s.match(/′/g)?.length ?? 0);
  const best = new Map<number, string>();
  const offer = (mask: number, s: string) => { const cur = best.get(mask); if (!cur || cost(s) < cost(cur) || (cost(s) === cost(cur) && s.length < cur.length)) best.set(mask, s); };
  const atoms: { mask: number; s: string; id: string }[] = [];
  for (const id of ids) {
    const m = all.reduce((acc, r) => (r.includes(id) ? acc | bit(r) : acc), 0);
    atoms.push({ mask: m, s: id, id }, { mask: full & ~m, s: `${id}′`, id });
  }
  for (const a of atoms) offer(a.mask, a.s);
  const pairs: { mask: number; s: string; ids: string }[] = [];
  for (const p of atoms) for (const q of atoms) {
    if (p.id >= q.id) continue;
    pairs.push({ mask: p.mask & q.mask, s: `${p.s} ∩ ${q.s}`, ids: p.id + q.id }, { mask: p.mask | q.mask, s: `${p.s} ∪ ${q.s}`, ids: p.id + q.id });
    if (!p.s.endsWith('′') && !q.s.endsWith('′')) {
      pairs.push({ mask: full & ~(p.mask | q.mask), s: `(${p.s} ∪ ${q.s})′`, ids: p.id + q.id }, { mask: full & ~(p.mask & q.mask), s: `(${p.s} ∩ ${q.s})′`, ids: p.id + q.id });
    }
  }
  for (const p of pairs) offer(p.mask, p.s);
  if (ids.length === 3) {
    const [x, y, z] = ids.map((id) => atoms.filter((a) => a.id === id));
    for (const p of x) for (const q of y) for (const r of z) {
      offer(p.mask & q.mask & r.mask, `${p.s} ∩ ${q.s} ∩ ${r.s}`);
      offer(p.mask | q.mask | r.mask, `${p.s} ∪ ${q.s} ∪ ${r.s}`);
    }
    offer(full & ~(x[0].mask | y[0].mask | z[0].mask), `(${ids.join(' ∪ ')})′`);
    for (const p of pairs) for (const r of atoms) {
      if (p.ids.includes(r.id)) continue;
      const inner = /^\(.*\)′$/.test(p.s) ? p.s : `(${p.s})`;
      if (inner === p.s) offer(p.mask & r.mask, `${r.s} ∩ ${inner}`); // "A ∩ (B ∪ C)′" reads best with the single set first
      offer(p.mask & r.mask, p.s.includes('∪') ? `${inner} ∩ ${r.s}` : `${p.s} ∩ ${r.s}`);
      offer(p.mask | r.mask, p.s.includes('∩') && !p.s.includes('∪') ? `${p.s} ∪ ${r.s}` : `${inner} ∪ ${r.s}`);
    }
  }
  return best.get(want) ?? regions.map((r) => (r === '' ? `(${ids.join(' ∪ ')})′` : ids.map((i) => (r.includes(i) ? i : `${i}′`)).join(' ∩ '))).join(' ∪ ');
}

// ─────────────────────────── Constructions and loci ───────────────────────────
// ECZ Paper 2: "Using ruler and compasses only, construct triangle PQR in which
// PQ = 10 cm, QR = 7 cm and angle PQR = 50°", then loci inside it and a region
// to shade. Lengths are in cm; the first two letters of the name are the base
// (drawn left to right), the third vertex above it.

export type LocusKind = 'circle' | 'parallel' | 'angle-bisector' | 'perpendicular-bisector' | 'perpendicular';
export interface LocusSpec { kind: LocusKind; centre?: string; radius?: number; to?: string; distance?: number; side?: string; at?: string; of?: string; from?: string; label?: string }
export interface KeepSpec { locus: number; keep: string }
export interface ConstructionInput { triangle: { name: string; sides?: Record<string, number>; angles?: Record<string, number> }; loci?: LocusSpec[]; region?: KeepSpec[] }

/** A locus worked out: a circle, or a line through p in direction d (unit). */
export type Locus = { kind: 'circle'; c: Pt; r: number; spec: LocusSpec } | { kind: 'line'; p: Pt; d: Pt; spec: LocusSpec; ends?: [Pt, Pt] };

export interface ConstructionLayout {
  ids: [string, string, string];
  pos: Record<string, Pt>;
  /** Given values (for the construction marks): side keys like "PQ", angle keys like "Q". */
  givenSides: string[];
  givenAngles: string[];
  loci: Locus[];
  inRegion: ((p: Pt) => boolean) | null;
  problems: string[];
  answers: Record<string, string>;
}

const unit = (v: Pt): Pt => { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; };
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
/** Distance from p to the infinite line through a and b. */
export const lineDistance = (p: Pt, a: Pt, b: Pt) => Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / (dist(a, b) || 1);
/** Which side of line ab the point p is on (+1 / −1 / 0). */
const sideOf = (p: Pt, a: Pt, b: Pt) => Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
export const insideTriangle = (p: Pt, a: Pt, b: Pt, c: Pt) => {
  const s1 = sideOf(p, a, b), s2 = sideOf(p, b, c), s3 = sideOf(p, c, a);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
};

/** Solves and places the triangle from its given sides and angles (SSS, SAS, SSA, ASA/AAS). */
export function constructionLayout(spec: ConstructionInput): ConstructionLayout {
  const problems: string[] = [], answers: Record<string, string> = {};
  const name = spec.triangle.name.replace(/\s+/g, '');
  const ids = (name.match(/[A-Z][0-9]?/g) ?? []) as string[];
  const empty: ConstructionLayout = { ids: ['A', 'B', 'C'], pos: {}, givenSides: [], givenAngles: [], loci: [], inRegion: null, problems, answers };
  if (ids.length !== 3) { problems.push(`The triangle "${spec.triangle.name}" needs three vertex letters, e.g. "PQR".`); return empty; }
  const [P, Q, R] = ids;
  const sideKey = (k: string): string | null => {
    const two = splitIds(k.replace(/\s+/g, ''), ids);
    if (!two || two.length !== 2 || two[0] === two[1]) return null;
    return [P, Q, R].filter((v) => two.includes(v)).join('');
  };
  const angleKey = (k: string): string | null => {
    const v = splitIds(k.replace(/\s+|angle/gi, ''), ids);
    if (!v) return null;
    if (v.length === 1) return v[0];
    if (v.length === 3 && new Set(v).size === 3) return v[1];
    return null;
  };
  const s: Record<string, number> = {}, a: Record<string, number> = {};
  for (const [k, v] of Object.entries(spec.triangle.sides ?? {})) { const key = sideKey(k); if (key && v > 0) s[key] = v; else problems.push(`"${k}" is not a side of triangle ${name}.`); }
  for (const [k, v] of Object.entries(spec.triangle.angles ?? {})) { const key = angleKey(k); if (key && v > 0 && v < 180) a[key] = v; else problems.push(`"${k}" is not an angle of triangle ${name} (or ${v}° is impossible).`); }
  // Opposite sides: side opposite vertex X.
  const opp: Record<string, string> = { [P]: Q + R, [Q]: P + R, [R]: P + Q };
  const sumA = Object.values(a).reduce((t, v) => t + v, 0);
  if (Object.keys(a).length === 3 && Math.abs(sumA - 180) > 0.5) problems.push(`The three angles add up to ${fmt(sumA)}°, not 180°.`);
  if (Object.keys(a).length === 2) { const third = [P, Q, R].find((v) => !(v in a))!; a[third] = 180 - sumA; if (a[third] <= 0) { problems.push(`The two angles add up to ${fmt(sumA)}°, so there is no triangle.`); return empty; } }
  const len = (k: string) => s[k];
  const lawCos = (b: number, c: number, A: number) => Math.sqrt(b * b + c * c - 2 * b * c * Math.cos(rad(A)));
  const angCos = (opposite: number, b: number, c: number) => deg(Math.acos(Math.max(-1, Math.min(1, (b * b + c * c - opposite * opposite) / (2 * b * c)))));
  for (let pass = 0; pass < 4; pass++) {
    // SSS → angles
    if (Object.keys(s).length === 3) for (const v of [P, Q, R]) if (!(v in a)) { const others = Object.keys(s).filter((k) => k !== opp[v]); a[v] = angCos(len(opp[v]), len(others[0]), len(others[1])); }
    // SAS → the third side
    for (const v of [P, Q, R]) {
      const adj = Object.keys(opp).filter((x) => x !== v).map((x) => opp[x]); // the two sides meeting at v
      if (v in a && adj.every((k) => k in s) && !(opp[v] in s)) s[opp[v]] = lawCos(len(adj[0]), len(adj[1]), a[v]);
    }
    // Two angles known → third; then sine rule from any side with its opposite angle
    if (Object.keys(a).length === 2) { const third = [P, Q, R].find((v) => !(v in a))!; a[third] = 180 - Object.values(a).reduce((t, x) => t + x, 0); }
    const pair = [P, Q, R].find((v) => v in a && opp[v] in s);
    if (pair) {
      const k = len(opp[pair]) / Math.sin(rad(a[pair]));
      for (const v of [P, Q, R]) {
        if (v in a && !(opp[v] in s)) s[opp[v]] = k * Math.sin(rad(a[v]));
        else if (!(v in a) && opp[v] in s && Object.keys(a).length < 3) {
          const sinV = len(opp[v]) / k;
          if (sinV > 1 + 1e-9) { problems.push(`No triangle has these measurements (side ${opp[v]} is too long for the angle at ${pair}).`); return empty; }
          a[v] = deg(Math.asin(Math.min(1, sinV)));
        }
      }
    }
  }
  if (Object.keys(s).length < 3 || Object.keys(a).length < 3) { problems.push(`Triangle ${name} needs three facts that fix it: three sides, two sides and an angle, or a side and two angles.`); return empty; }
  const [x, y, z] = [len(Q + R) ?? len(opp[P]), len(opp[Q]), len(opp[R])];
  if (x + y <= z || x + z <= y || y + z <= x) { problems.push('These three lengths cannot make a triangle.'); return empty; }
  // Place: P at the origin, Q along the x-axis, R above.
  const pos: Record<string, Pt> = { [P]: { x: 0, y: 0 }, [Q]: { x: len(opp[R]), y: 0 } };
  pos[R] = { x: len(opp[Q]) * Math.cos(rad(a[P])), y: len(opp[Q]) * Math.sin(rad(a[P])) };
  const givenSides = Object.keys(spec.triangle.sides ?? {}).map(sideKey).filter((k): k is string => !!k);
  const givenAngles = Object.keys(spec.triangle.angles ?? {}).map(angleKey).filter((k): k is string => !!k);
  for (const k of [P + Q, Q + R, P + R]) if (!givenSides.includes(k)) answers[`Length ${k}`] = `${fmt(dist(pos[k[0]], pos[k[1]]), 1)} cm`;
  for (const v of [P, Q, R]) if (!givenAngles.includes(v)) { const [m, w] = [P, Q, R].filter((u) => u !== v); answers[`Angle ${m}${v}${w}`] = `${fmt(a[v], 0)}°`; }

  // Loci
  const pt = (id?: string) => (id && pos[id] ? pos[id] : null);
  const ends = (k?: string): [Pt, Pt] | null => { const key = k ? sideKey(k) : null; return key ? [pos[key[0]], pos[key[1]]] : null; };
  const loci: Locus[] = [];
  (spec.loci ?? []).forEach((l, i) => {
    const tag = `Locus ${i + 1} (${l.kind})`;
    if (l.kind === 'circle') {
      const c = pt(l.centre);
      if (!c || !(Number(l.radius) > 0)) { problems.push(`${tag} needs "centre" (a vertex) and "radius" in cm.`); return; }
      loci.push({ kind: 'circle', c, r: Number(l.radius), spec: l });
    } else if (l.kind === 'parallel') {
      const e = ends(l.to);
      if (!e || !(Number(l.distance) > 0)) { problems.push(`${tag} needs "to" (a side such as "QR") and "distance" in cm.`); return; }
      const towards = pt(l.side) ?? [pos[P], pos[Q], pos[R]].find((p) => p !== e[0] && p !== e[1])!;
      const d = unit(sub(e[1], e[0]));
      let nrm = { x: -d.y, y: d.x };
      if (sideOf({ x: e[0].x + nrm.x, y: e[0].y + nrm.y }, e[0], e[1]) !== sideOf(towards, e[0], e[1])) nrm = { x: -nrm.x, y: -nrm.y };
      const h = lineDistance(towards, e[0], e[1]);
      if (Number(l.distance) >= h) problems.push(`${tag}: the line ${l.distance} cm from ${l.to} misses the triangle (the opposite vertex is only ${fmt(h, 1)} cm away).`);
      loci.push({ kind: 'line', p: { x: e[0].x + nrm.x * Number(l.distance), y: e[0].y + nrm.y * Number(l.distance) }, d, spec: l, ends: e });
    } else if (l.kind === 'angle-bisector') {
      const v = pt(l.at);
      if (!v) { problems.push(`${tag} needs "at" (a vertex).`); return; }
      const [m, w] = [P, Q, R].filter((u) => pos[u] !== v);
      loci.push({ kind: 'line', p: v, d: unit({ x: unit(sub(pos[m], v)).x + unit(sub(pos[w], v)).x, y: unit(sub(pos[m], v)).y + unit(sub(pos[w], v)).y }), spec: l });
    } else if (l.kind === 'perpendicular-bisector') {
      const e = ends(l.of);
      if (!e) { problems.push(`${tag} needs "of" (a side such as "PQ").`); return; }
      const d = unit(sub(e[1], e[0]));
      loci.push({ kind: 'line', p: { x: (e[0].x + e[1].x) / 2, y: (e[0].y + e[1].y) / 2 }, d: { x: -d.y, y: d.x }, spec: l, ends: e });
    } else if (l.kind === 'perpendicular') {
      const f = pt(l.from), e = ends(l.to);
      if (!f || !e) { problems.push(`${tag} needs "from" (a vertex) and "to" (the opposite side).`); return; }
      const d = unit(sub(e[1], e[0]));
      loci.push({ kind: 'line', p: f, d: { x: -d.y, y: d.x }, spec: l, ends: e });
    } else problems.push(`Unknown locus "${(l as LocusSpec).kind}".`);
  });

  // The region: inside the triangle and on the kept side of every listed locus.
  let inRegion: ((p: Pt) => boolean) | null = null;
  if (spec.region?.length) {
    const tests: ((p: Pt) => boolean)[] = [];
    for (const k of spec.region) {
      const L = loci[k.locus], keep = String(k.keep ?? '').trim();
      if (!L) { problems.push(`The region refers to locus ${k.locus + 1}, which does not exist (loci are numbered from 0).`); continue; }
      const l = L.spec;
      if (L.kind === 'circle') {
        if (!/^(inside|outside)$/i.test(keep)) { problems.push(`Locus ${k.locus + 1}: keep "inside" or "outside" the circle.`); continue; }
        const inside = /inside/i.test(keep);
        tests.push((p) => (dist(p, L.c) <= L.r) === inside);
      } else if (l.kind === 'parallel') {
        if (!/^(near|far)$/i.test(keep)) { problems.push(`Locus ${k.locus + 1}: keep "near" (less than ${l.distance} cm from ${l.to}) or "far".`); continue; }
        const [e0, e1] = L.ends!;
        const near = /near/i.test(keep);
        tests.push((p) => (lineDistance(p, e0, e1) < Number(l.distance)) === near);
      } else if (l.kind === 'angle-bisector') {
        const v = pos[l.at!];
        const arm = splitIds(keep.replace(/\s+/g, ''), ids)?.find((u) => pos[u] !== v);
        if (!arm) { problems.push(`Locus ${k.locus + 1}: keep the side nearer one arm, e.g. "${l.at}${[P, Q, R].find((u) => u !== l.at)}".`); continue; }
        const other = [P, Q, R].find((u) => u !== l.at && u !== arm)!;
        tests.push((p) => lineDistance(p, v, pos[arm]) < lineDistance(p, v, pos[other]));
      } else if (l.kind === 'perpendicular-bisector') {
        const [e0, e1] = L.ends!;
        const target = pt(keep);
        if (!target || (target !== e0 && target !== e1)) { problems.push(`Locus ${k.locus + 1}: keep the side nearer ${l.of![0]} or ${l.of!.slice(-1)}.`); continue; }
        const other = target === e0 ? e1 : e0;
        tests.push((p) => dist(p, target) < dist(p, other));
      } else if (l.kind === 'perpendicular') {
        const target = pt(keep);
        if (!target) { problems.push(`Locus ${k.locus + 1}: keep the side of the perpendicular that holds a vertex, e.g. "${P}".`); continue; }
        const q2 = { x: L.p.x + L.d.x, y: L.p.y + L.d.y };
        const want = sideOf(target, L.p, q2);
        tests.push((p) => sideOf(p, L.p, q2) === want);
      }
    }
    const [A, B, C] = [pos[P], pos[Q], pos[R]];
    inRegion = (p) => insideTriangle(p, A, B, C) && tests.every((t) => t(p));
    let hits = 0;
    const xs = [A.x, B.x, C.x], ys = [A.y, B.y, C.y];
    for (let i = 1; i < 60; i++) for (let j = 1; j < 60; j++) {
      const p = { x: Math.min(...xs) + ((Math.max(...xs) - Math.min(...xs)) * i) / 60, y: Math.min(...ys) + ((Math.max(...ys) - Math.min(...ys)) * j) / 60 };
      if (inRegion(p)) hits++;
    }
    if (!hits) problems.push('No point of the triangle satisfies all the conditions of the region: check which side of each locus to keep.');
  }
  return { ids: [P, Q, R], pos, givenSides, givenAngles, loci, inRegion, problems, answers };
}
