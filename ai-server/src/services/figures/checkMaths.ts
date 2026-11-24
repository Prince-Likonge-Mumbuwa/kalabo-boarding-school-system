/**
 * Checks the exact maths figures (circle theorems, Earth geometry, Venn
 * diagrams, coordinate geometry and transformations, bearings and
 * trigonometry, solids) and works out the marking-key answers from them.
 *
 * The figure is measured with figureMath.ts — the same file the app draws
 * with — so "angle ABT = 40°" in the yellow box is exactly the angle in the
 * picture. Any number the question states that the figure contradicts
 * ("angle EFG = 52°" where EG is a diameter, so it must be 90°) is reported
 * as a problem, which the AI is then asked to fix.
 */
import {
  EARTH, angleAt, bearing, circleLayout, describeTransformation, dist, earthPair, fmt, frac, labelDegrees, labelLength,
  latText, lineEquation, longText, measureAngle, parallelLength, planeLayout, pointText, polygonArea, readLatLong,
  regionKey, shadeRegions, solidMeasures, solveVenn, splitIds, subscript, threeFigure, applyTransform, vennTotals, type Pt,
  bestWholePoint, boundaryText, feasibleRegion, objectiveAt, parseInequality, setNotation, type Inequality,
  constructionLayout,
} from "./figureMath.js";
import type { CircleSpec, ConstructionSpec, GeometrySpec, GlobeSpec, GraphSpec, PlaneSpec, SolidSpec, VennSpec } from "./spec.js";

type Out = { problems: string[]; answers: Record<string, string> };

/** "angle ABC = 52°", "∠ABC = 52^\circ", "$\angle EFG = 52^{\circ}$", "angle OBC = 40°" in the question. */
export function statedAngles(text: string): { name: string; value: number }[] {
  const out: { name: string; value: number }[] = [];
  const re = /(?:\\angle\s*|∠\s*|\bangle\s+)\{?\s*([A-Z][A-Z0-9′'\\hat{}]{2,12}?)\s*\}?\s*=\s*(\d+(?:\.\d+)?)\s*(?:°|\^\s*\{?\s*\\circ\s*\}?|\\degree|degrees)/g;
  for (const m of text.matchAll(re)) out.push({ name: m[1].replace(/\\hat\{?|[{}]/g, ""), value: Number(m[2]) });
  return out;
}

/** "the bearing of M from L is 110°" in the question. */
export function statedBearings(text: string): { of: string; from: string; value: number }[] {
  const out: { of: string; from: string; value: number }[] = [];
  const re = /bearing of\s+\$?([A-Z][0-9′']*)\$?\s+from\s+\$?([A-Z][0-9′']*)\$?\s+is\s+\$?(\d{1,3}(?:\.\d+)?)\s*(?:°|\^\s*\{?\s*\\circ\s*\}?)?/gi;
  for (const m of text.matchAll(re)) out.push({ of: m[1], from: m[2], value: Number(m[3]) });
  return out;
}

const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

/** Checks angles the question text states against the figure (only angles whose three letters are all in it). */
function checkStatedAngles(text: string | undefined, pos: Record<string, Pt>, problems: string[], marked: Set<string>) {
  for (const s of statedAngles(text ?? "")) {
    const ids = splitIds(s.name, Object.keys(pos));
    if (!ids || ids.length !== 3 || marked.has(ids.join(""))) continue;
    const real = measureAngle(ids, pos);
    if (real !== null && !close(real, s.value, 1))
      problems.push(`The question says angle ${s.name} = ${fmt(s.value)}°, but in this figure it is ${fmt(real, 1)}°. Move the points so the figure fits the question (or change the question).`);
  }
}

// ─────────────────────────── Circle theorems ───────────────────────────

export function checkCircle(spec: CircleSpec, text: string | undefined, { problems, answers }: Out) {
  const centre = spec.centre === false ? "O" : spec.centre ?? "O";
  const { pos, problems: layout } = circleLayout(spec.points, centre);
  problems.push(...layout);
  const marked = new Set<string>();
  for (const m of spec.angles ?? []) {
    const ids = [m.arms[0], m.at, m.arms[1]];
    marked.add(ids.join("")); marked.add([...ids].reverse().join(""));
    const real = measureAngle(ids, pos);
    if (real === null) { problems.push(`Angle mark at ${m.at} uses a point that is not in the figure.`); continue; }
    const want = m.right ? 90 : labelDegrees(m.label);
    if (want !== null && !close(real, want, 1))
      problems.push(`Angle ${ids.join("")} is marked ${fmt(want)}° but in this figure it is ${fmt(real, 1)}°. Move the points so it is ${fmt(want)}°.`);
  }
  checkStatedAngles(text, pos, problems, marked);
  // "The tangent at P meets OQ extended at R": R must lie beyond Q, not back past O.
  for (const p of spec.points) {
    for (const ref of p.meet ?? []) {
      if (typeof ref === "string" || !pos[p.id] || !pos[ref[0]] || !pos[ref[1]]) continue;
      const [a, b, x] = [pos[ref[0]], pos[ref[1]], pos[p.id]];
      const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
      const t = len2 ? ((x.x - a.x) * (b.x - a.x) + (x.y - a.y) * (b.y - a.y)) / len2 : 0;
      if (t < -1e-6)
        problems.push(`${p.id} is on ${ref[1]}${ref[0]} extended beyond ${ref[0]}, not on ${ref[0]}${ref[1]} extended beyond ${ref[1]}. If the question says "${ref[0]}${ref[1]} extended", it cannot happen with these angles.`);
    }
  }
  for (const [a, b] of spec.diameters ?? []) {
    const pa = pos[a], pb = pos[b];
    if (pa && pb && dist({ x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }, { x: 0, y: 0 }) > 1e-3)
      problems.push(`${a}${b} is called a diameter but does not pass through the centre ${centre} (put ${b} 180° round from ${a}).`);
  }
  for (const name of spec.find ?? []) {
    const real = measureAngle(name, pos);
    if (real === null) problems.push(`Cannot measure angle ${name} in the figure (use three point letters, e.g. ABT).`);
    else answers[`Angle ${name}`] = `${fmt(real, 1)}°`;
  }
  if (spec.sector) {
    const a = pos[spec.sector.from], b = pos[spec.sector.to];
    if (a && b) {
      let span = (Math.atan2(b.y, b.x) - Math.atan2(a.y, a.x)) * (180 / Math.PI);
      while (span <= 0) span += 360;
      answers["Sector angle"] = `${fmt(span, 1)}°`;
    }
  }
}

// ─────────────────────────── Earth geometry ───────────────────────────

export function checkGlobe(spec: GlobeSpec, text: string | undefined, { problems, answers }: Out) {
  const places: Record<string, { lat: number; long: number }> = {};
  for (const p of spec.points) {
    const lat = readLatLong(p.lat, "lat"), long = readLatLong(p.long, "long");
    if (lat === null || Math.abs(lat) > 90) { problems.push(`Cannot read the latitude of ${p.id} ("${p.lat}"); write e.g. "52°N" or -15.`); continue; }
    if (long === null || Math.abs(long) > 180) { problems.push(`Cannot read the longitude of ${p.id} ("${p.long}"); write e.g. "43°W" or 28.`); continue; }
    places[p.id] = { lat, long };
    answers[`Position of ${p.id}`] = `(${latText(lat)}, ${longText(long)})`;
  }
  const drawnLats = (spec.parallels ?? []).map((v) => readLatLong(v, "lat")).filter((v): v is number => v !== null);
  const drawnLongs = (spec.meridians ?? []).map((v) => readLatLong(v, "long")).filter((v): v is number => v !== null);
  for (const [id, p] of Object.entries(places)) {
    if (p.lat !== 0 && Math.abs(p.lat) !== 90 && !drawnLats.some((l) => close(l, p.lat, 1e-6))) problems.push(`${id} is on ${latText(p.lat)} but that circle of latitude is not drawn; add it to "parallels".`);
    if (!drawnLongs.some((l) => close(l, p.long, 1e-6))) problems.push(`${id} is on ${longText(p.long)} but that meridian is not drawn; add it to "meridians".`);
  }
  for (const lat of drawnLats) if (lat !== 0) answers[`Length of the circle of latitude ${latText(lat)}`] = parallelLength(lat);
  for (const [a, b] of spec.find ?? []) {
    if (!places[a] || !places[b]) { problems.push(`Cannot work out ${a}–${b}: both must be places in the figure.`); continue; }
    for (const [k, v] of Object.entries(earthPair(places[a], places[b]))) answers[`${a} to ${b}: ${k}`] = v;
  }
  // ECZ always gives the constants the calculation needs.
  const t = text ?? "";
  if ((spec.find?.length ?? 0) > 0 && /\bkm\b|kilomet|circumference|radius|length of the (circle|parallel)/i.test(t) && !/6\s?370|3\s?437/.test(t))
    problems.push(`The question should state the radius of the Earth, as ECZ does: "[Take π = 3.142 and R = 6370 km]" (or R = 3437 nm).`);
}

// ─────────────────────────── Venn diagrams ───────────────────────────

export function checkVenn(spec: VennSpec, { problems, answers }: Out) {
  const ids = spec.sets.map((s) => (typeof s === "string" ? s : s.id));
  if (new Set(ids).size !== ids.length) problems.push("Two sets have the same letter.");
  if (typeof spec.shade === "string" && spec.shade.trim()) {
    try {
      const regions = shadeRegions(spec.shade, ids);
      answers["Shaded region in set notation"] = setNotation(regions, ids);
    } catch (err) { problems.push((err as Error).message); }
  }
  if (Array.isArray(spec.shade) && spec.shade.length) {
    const regions = spec.shade.map((k) => regionKey(k, ids)).filter((k): k is string => k !== null);
    answers["Shaded region in set notation"] = setNotation(regions, ids);
  }
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(spec.counts ?? {})) {
    const key = regionKey(k, ids);
    if (key === null) { problems.push(`"${k}" is not a region of this Venn diagram (use ${ids.join(", ")} or "" for outside).`); continue; }
    if (typeof v === "number") counts[key] = v;
  }
  if (spec.totals) {
    const solved = solveVenn(ids, spec.totals);
    if (!solved) problems.push("The totals given are not enough to work out every region (give every set, every overlap and the overlap of all of them).");
    else {
      for (const [k, v] of Object.entries(solved)) {
        if (v < 0) problems.push(`The totals are impossible: region ${k || "outside"} would have ${fmt(v)}.`);
        if (typeof counts[k] === "number" && !close(counts[k], v, 1e-9)) problems.push(`Region ${k || "outside"} shows ${fmt(counts[k])} but the totals in the question give ${fmt(v)}.`);
        answers[`Region ${k ? k.split("").join(" ∩ ") + " only" : "outside the sets"}`] = fmt(v);
      }
      Object.assign(counts, Object.fromEntries(Object.entries(solved).filter(([k]) => counts[k] === undefined)));
    }
  }
  Object.assign(answers, vennTotals(ids, counts));
}

// ─────────────────────────── Coordinate geometry and transformations ───────────────────────────

const cornerNames = (name: string) => name.match(/[A-Z][0-9′']*/g) ?? [name];

function lengthText(a: Pt, b: Pt) {
  const d2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const d = Math.sqrt(d2);
  if (close(d, Math.round(d), 1e-9)) return `${Math.round(d)} units`;
  return Number.isInteger(Math.round(d2 * 1e6) / 1e6) ? `√${Math.round(d2)} ≈ ${fmt(d)} units` : `${fmt(d)} units`;
}

export function checkPlane(spec: PlaneSpec, { problems, answers }: Out) {
  const named: Record<string, Pt> = {};
  for (const p of spec.points ?? []) {
    if (p.id) named[p.id] = { x: p.x, y: p.y };
    if (p.x < spec.x.min || p.x > spec.x.max || p.y < spec.y.min || p.y > spec.y.max) problems.push(`Point ${p.id ?? pointText(p)} is outside the axes.`);
  }
  const ref = (r: string | [number, number]): Pt | null => (Array.isArray(r) ? { x: r[0], y: r[1] } : named[r] ?? null);
  const nameOf = (r: string | [number, number]) => (Array.isArray(r) ? pointText({ x: r[0], y: r[1] }) : r);
  for (const s of spec.segments ?? []) {
    const a = ref(s.from), b = ref(s.to);
    if (!a || !b) { problems.push(`A segment uses a point that is not given.`); continue; }
    const k = `${nameOf(s.from)}${nameOf(s.to)}`;
    answers[`Length of ${k}`] = lengthText(a, b);
    answers[`Midpoint of ${k}`] = pointText({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    if (!close(a.x, b.x, 1e-12)) answers[`Gradient of ${k}`] = frac((b.y - a.y) / (b.x - a.x));
  }
  for (const l of spec.lines ?? []) {
    if (!l.through) continue;
    const a = ref(l.through[0]), b = ref(l.through[1]);
    if (!a || !b) { problems.push("A line goes through a point that is not given."); continue; }
    const k = `${nameOf(l.through[0])}${nameOf(l.through[1])}`;
    answers[`Line ${k}`] = lineEquation(a, b);
    if (!close(a.x, b.x, 1e-12)) {
      const m = (b.y - a.y) / (b.x - a.x);
      answers[`Gradient of ${k}`] = frac(m);
      if (!close(m, 0, 1e-12)) answers[`Gradient perpendicular to ${k}`] = frac(-1 / m);
    }
  }
  const shapes: Record<string, Pt[]> = {};
  for (const sh of spec.shapes ?? []) shapes[sh.name] = sh.vertices.map(([x, y]) => ({ x, y }));
  for (const im of spec.images ?? []) {
    const src = shapes[im.of];
    if (!src) { problems.push(`Image ${im.name}: there is no shape "${im.of}".`); continue; }
    try {
      const pts = src.map((p) => applyTransform(im.transform, p));
      shapes[im.name] = pts;
      const names = cornerNames(im.name);
      answers[`Image ${subscript(im.name)}`] = pts.map((p, i) => `${names.length === pts.length ? subscript(names[i]) : ""}${pointText(p)}`).join(", ");
      if (pts.some((p) => p.x < spec.x.min || p.x > spec.x.max || p.y < spec.y.min || p.y > spec.y.max))
        problems.push(`Image ${im.name} goes outside the axes${im.hidden ? " (learners will draw it there)" : ""}; widen the axes.`);
    } catch (err) { problems.push((err as Error).message); }
  }
  for (const [a, b] of spec.describe ?? []) {
    if (!shapes[a] || !shapes[b]) { problems.push(`Cannot describe ${a} → ${b}: both must be shapes in the figure.`); continue; }
    const d = describeTransformation(shapes[a], shapes[b]);
    if (d) answers[`${subscript(a)} → ${subscript(b)}`] = d;
    else problems.push(`${b} is not the image of ${a} under one single transformation (check the corners are listed in matching order).`);
  }
}

// ─────────────────────────── Bearings and trigonometry ───────────────────────────

export function checkGeometry(spec: GeometrySpec, text: string | undefined, { problems, answers }: Out) {
  const { pos, problems: layout } = planeLayout(spec.points);
  problems.push(...layout);
  const isNorth = (k: string) => k.toLowerCase() === "north" || (k === "N" && !pos.N);
  const marked = new Set<string>();
  for (const s of spec.sides ?? []) {
    const a = pos[s.from], b = pos[s.to], want = labelLength(s.label);
    if (a && b && want !== null && Math.abs(dist(a, b) - want) > 0.02 * want + 1e-6)
      problems.push(`Side ${s.from}${s.to} is labelled ${s.label} but in the figure it is ${fmt(dist(a, b))}. Place the points with these lengths.`);
  }
  for (const m of spec.angles ?? []) {
    const v = pos[m.at];
    if (!v) continue;
    const want = m.right ? 90 : labelDegrees(m.label);
    if (isNorth(m.arms[0]) || isNorth(m.arms[1])) {
      const other = pos[isNorth(m.arms[0]) ? m.arms[1] : m.arms[0]];
      if (other && want !== null) {
        const b = bearing(v, other);
        if (!close(b, want, 1) && !close(360 - b, want, 1)) problems.push(`The angle from north at ${m.at} is marked ${fmt(want)}° but the bearing in the figure is ${fmt(b, 1)}°.`);
      }
      continue;
    }
    const a = pos[m.arms[0]], b = pos[m.arms[1]];
    if (!a || !b) { problems.push(`Angle mark at ${m.at} uses a point that is not in the figure.`); continue; }
    marked.add(`${m.arms[0]}${m.at}${m.arms[1]}`); marked.add(`${m.arms[1]}${m.at}${m.arms[0]}`);
    const real = angleAt(v, a, b);
    if (want !== null && !close(real, want, 1)) problems.push(`Angle ${m.arms[0]}${m.at}${m.arms[1]} is marked ${fmt(want)}° but in the figure it is ${fmt(real, 1)}°.`);
  }
  checkStatedAngles(text, pos, problems, marked);
  for (const s of statedBearings(text ?? "")) {
    const a = pos[s.from], b = pos[s.of];
    if (a && b && !close(bearing(a, b), s.value, 1)) problems.push(`The question says the bearing of ${s.of} from ${s.from} is ${threeFigure(s.value)}, but in the figure it is ${threeFigure(bearing(a, b))}.`);
  }
  const unit = (spec.sides ?? []).map((sd) => /\d\s*(mm|cm|km|m)\s*$/.exec(sd.label ?? "")?.[1]).find(Boolean);
  const withUnit = (v: number, squared = false) => `${fmt(v)}${unit ? ` ${unit}${squared ? "²" : ""}` : ""}`;
  for (const q of spec.find ?? []) {
    const f = q.trim();
    let m = /^bearing of\s+(\S+)\s+from\s+(\S+)$/i.exec(f);
    if (m) {
      const [a, b] = [pos[m[2]], pos[m[1]]];
      if (a && b) { answers[`Bearing of ${m[1]} from ${m[2]}`] = threeFigure(bearing(a, b)); continue; }
    }
    m = /^angle\s+(\S+)$/i.exec(f);
    if (m) {
      const v = measureAngle(m[1], pos);
      if (v !== null) { answers[`Angle ${m[1]}`] = `${fmt(v, 1)}°`; continue; }
    }
    m = /^(?:length|distance)\s+(?:of\s+)?(\S+)$/i.exec(f);
    if (m) {
      const ids = splitIds(m[1], Object.keys(pos));
      if (ids?.length === 2) { answers[`Length ${m[1]}`] = withUnit(dist(pos[ids[0]], pos[ids[1]])); continue; }
    }
    m = /^area(?:\s+of)?(?:\s+triangle)?\s+(\S+)$/i.exec(f);
    if (m) {
      const ids = splitIds(m[1], Object.keys(pos));
      if (ids && ids.length >= 3) { answers[`Area of ${m[1]}`] = withUnit(polygonArea(ids.map((k) => pos[k])), true); continue; }
    }
    problems.push(`Cannot work out "${f}" (write "bearing of K from M", "angle LKM", "length LN" or "area of LMN").`);
  }
}

// ─────────────────────────── Solids ───────────────────────────

export function checkSolid(spec: SolidSpec, { problems, answers }: Out) {
  const d = spec.dims;
  const want: Record<string, number | undefined> = {
    length: d.length, width: d.width, height: d.height, radius: d.radius, topRadius: d.topRadius, topLength: d.topLength, topWidth: d.topWidth,
    base: d.base, triangleHeight: d.triangleHeight,
    diameter: d.radius !== undefined ? 2 * d.radius : undefined, topDiameter: d.topRadius !== undefined ? 2 * d.topRadius : undefined,
  };
  for (const [k, label] of Object.entries(spec.labels ?? {})) {
    const shown = labelLength(label), real = want[k];
    if (shown !== null && real !== undefined && !close(shown, real, 1e-6)) problems.push(`The ${k} is labelled ${label} but "dims" gives ${fmt(real)}.`);
  }
  const pi = spec.pi ?? EARTH.pi;
  const piText = close(pi, 22 / 7, 1e-6) ? "22/7" : fmt(pi, 4);
  // Units from the labels ("15 cm" -> cm), else plain "units".
  const unit = Object.values(spec.labels ?? {}).map((l) => /\d\s*(mm|cm|km|m)\s*$/.exec(l)?.[1]).find(Boolean);
  const as = (k: string, v: string) => (/area/.test(k) ? `${v} ${unit ? `${unit}²` : "square units"}` : /volume/.test(k) ? `${v} ${unit ? `${unit}³` : "cubic units"}` : unit ? `${v} ${unit}` : v);
  for (const [k, v] of Object.entries(solidMeasures(spec.shape, d, pi))) answers[k[0].toUpperCase() + k.slice(1)] = as(k, v);
  if (Object.keys(answers).length) answers["Worked with π"] = piText;
}

// ─────────────────────────── Inequalities and linear programming ───────────────────────────

/**
 * The region R that a graph's inequalities define: its corners, the boundary
 * lines, and for linear programming the objective at every corner and the
 * best choice — what ECZ marking keys give. Flags inequalities that cannot be
 * read, a region that is empty or runs off the axes, and constraints that
 * never touch R (they do nothing, so the question needs other numbers).
 */
export function checkInequalities(spec: GraphSpec, problems: string[], answers: Record<string, string>) {
  const ineqs: Inequality[] = [];
  for (const t of spec.inequalities ?? []) {
    const q = parseInequality(t);
    if (q) ineqs.push(q);
    else problems.push(`Cannot read the inequality "${t}" (write e.g. x + y <= 60, y >= 2x, 0.2x + 0.3y <= 60).`);
  }
  if (!ineqs.length) return;
  const box = { x0: spec.x.min, x1: spec.x.max, y0: spec.y.min, y1: spec.y.max };
  const R = feasibleRegion(ineqs, box);
  answers["Inequalities"] = ineqs.map((q) => q.text.replace(/<=/g, "≤").replace(/>=/g, "≥")).join(", ");
  answers["Boundary lines"] = ineqs.map(boundaryText).join("; ");
  if (R.length < 3) { problems.push("No point satisfies all the inequalities together inside the axes: the region R is empty. Check the numbers and the directions of the signs."); return; }
  const onLine = (p: Pt, q: Inequality) => Math.abs(q.a * p.x + q.b * p.y - q.c) <= 1e-6 * (1 + Math.abs(q.c));
  // A true corner is where two boundary lines meet; one on a single line is where R is cut off by the axes.
  const offGraph = R.filter((p) => ineqs.filter((q) => onLine(p, q)).length < 2);
  if (offGraph.length)
    problems.push(`The region R runs off the graph at ${offGraph.map(pointText).join(", ")}; widen the axes so the whole of R shows (ECZ regions are closed).`);
  for (const q of ineqs) if (!R.some((p) => onLine(p, q)))
    problems.push(`The line ${boundaryText(q)} never touches R, so "${q.text}" makes no difference. Change its numbers so every condition matters.`);
  const letters = spec.corners ?? [];
  const name = (i: number) => (letters[i] ? `${letters[i]}` : `corner ${i + 1} `);
  answers["Corners of R"] = R.map((p, i) => `${letters[i] ? `${letters[i]}` : ""}${pointText(p)}`).join(", ");
  if (letters.filter(Boolean).length > R.length) problems.push(`R has ${R.length} corners but ${letters.filter(Boolean).length} letters were given for them.`);
  // Labelled points that are not corners of R (the AI's own working) are suspicious.
  for (const p of spec.points ?? []) {
    if (!p.label || !/^[A-Z]$/.test(p.label)) continue;
    if (!R.some((c) => Math.abs(c.x - p.x) < 1e-6 && Math.abs(c.y - p.y) < 1e-6))
      problems.push(`Point ${p.label}${pointText(p)} is not a corner of R; the corners are ${R.map(pointText).join(", ")}. Use "corners" to letter them instead.`);
  }
  if (spec.objective) {
    const values = R.map((p) => objectiveAt(spec.objective!.expr, p));
    if (values.some((v) => v === null)) { problems.push(`Cannot read the objective "${spec.objective.expr}" (write e.g. 15x + 20y).`); return; }
    answers[`${spec.objective.expr} at each corner`] = R.map((p, i) => `${name(i)}${pointText(p)}: ${fmt(values[i]!)}`).join("; ");
    const pick = spec.objective.goal === "max" ? Math.max(...(values as number[])) : Math.min(...(values as number[]));
    const at = R[values.indexOf(pick)];
    const whole = Number.isInteger(Math.round(at.x * 1e9) / 1e9) && Number.isInteger(Math.round(at.y * 1e9) / 1e9);
    answers[`${spec.objective.goal === "max" ? "Maximum" : "Minimum"}`] = `${fmt(pick)} at ${pointText(at)}${whole ? "" : " (not whole numbers)"}`;
    if (!whole) {
      const best = bestWholePoint(ineqs, R, spec.objective.expr, spec.objective.goal);
      if (best) answers["Best whole-number choice"] = `${pointText(best)}, giving ${fmt(objectiveAt(spec.objective.expr, best)!)}`;
    }
  }
}

// ─────────────────────────── Constructions and loci ───────────────────────────

/**
 * Solves the triangle, checks every locus and the region, and gives the
 * marking key the measured lengths and angles (to 0.1 cm and 1°, as learners
 * measure them) and which side of each locus the region lies on.
 */
export function checkConstruction(spec: ConstructionSpec, text: string | undefined, { problems, answers }: Out) {
  const L = constructionLayout(spec);
  problems.push(...L.problems);
  if (!L.pos[L.ids[0]]) return;
  for (const [k, v] of Object.entries(L.answers)) answers[`${k} (measured)`] = `${v} (accept ± ${k.startsWith("Angle") ? "2°" : "0.2 cm"})`;
  const [P, Q, R] = L.ids;
  // Stated measurements in the question must be the figure's.
  for (const m of (text ?? "").matchAll(/\b([A-Z])([A-Z])\s*=\s*(\d+(?:\.\d+)?)\s*cm/g)) {
    const [a, b] = [m[1], m[2]];
    if (L.pos[a] && L.pos[b] && Math.abs(dist(L.pos[a], L.pos[b]) - Number(m[3])) > 0.05) problems.push(`The question says ${a}${b} = ${m[3]} cm but the construction has ${a}${b} = ${fmt(dist(L.pos[a], L.pos[b]), 1)} cm.`);
  }
  const describe: string[] = [];
  (spec.loci ?? []).forEach((l, i) => {
    const name = l.kind === "circle" ? `arc of radius ${l.radius} cm, centre ${l.centre}`
      : l.kind === "parallel" ? `line parallel to ${l.to}, ${l.distance} cm from it`
      : l.kind === "angle-bisector" ? `bisector of angle ${[P, Q, R].filter((v) => v !== l.at)[0]}${l.at}${[P, Q, R].filter((v) => v !== l.at)[1]} (equidistant from ${l.at}${[P, Q, R].filter((v) => v !== l.at)[0]} and ${l.at}${[P, Q, R].filter((v) => v !== l.at)[1]})`
      : l.kind === "perpendicular-bisector" ? `perpendicular bisector of ${l.of} (equidistant from ${l.of?.[0]} and ${l.of?.slice(-1)})`
      : `perpendicular from ${l.from} to ${l.to}`;
    answers[`Locus ${l.label ?? i + 1}`] = name;
    const keep = spec.region?.find((r) => r.locus === i)?.keep;
    if (keep) describe.push(l.kind === "circle" ? `${/inside/i.test(keep) ? "inside" : "outside"} the arc (${/inside/i.test(keep) ? "≤" : "≥"} ${l.radius} cm from ${l.centre})`
      : l.kind === "parallel" ? `${/near/i.test(keep) ? "between " + l.to + " and the parallel line (less than" : "beyond the parallel line (more than"} ${l.distance} cm from ${l.to})`
      : l.kind === "angle-bisector" ? `on the ${keep} side of the angle bisector (nearer ${keep})`
      : l.kind === "perpendicular-bisector" ? `on ${keep}'s side of the perpendicular bisector (nearer ${keep})`
      : `on ${keep}'s side of the perpendicular`);
  });
  if (describe.length) answers[`Region${spec.regionLabel ? " " + spec.regionLabel : ""}`] = `inside triangle ${P}${Q}${R}, ${describe.join(", ")}: shaded`;
}
