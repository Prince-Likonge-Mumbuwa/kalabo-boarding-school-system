/**
 * Checks one figure and works out its answers, so the marking key can be
 * verified against the drawing (and the teacher sees on screen if anything
 * is wrong). Nothing here asks the AI: graphs are solved with mathjs, map
 * names are looked up in the map data, molecules on PubChem.
 */
import { compile } from "mathjs";
import type { ClimateSpec, CurveSpec, FigureCheck, FigureSpec, FoodWebSpec, GeneticCrossSpec, GraphSpec, MapSpec, PopulationSpec, SceneSpec } from "./spec.js";
import { cross, parseGenotype, phenotype, ratio, show } from "./geneticsMath.js";
import { SCENES } from "./sceneCatalog.js";
import { REGIONS, type GeoNames } from "./geoNames.js";
import { lookupCompound } from "./pubchem.js";
import { checkCircle, checkConstruction, checkGeometry, checkGlobe, checkInequalities, checkPlane, checkSolid, checkVenn } from "./checkMaths.js";

export interface LibraryEntry { title: string; labels: { letter: string; meaning?: string }[] }

export interface CheckContext {
  geo: GeoNames | null;
  /** A picture in the teacher's diagram library (null when missing or not theirs). */
  picture?: (id: string) => Promise<LibraryEntry | null>;
  /** Look molecules up on PubChem (off in tests). */
  pubchem?: boolean;
  /** The question the figure belongs to, so stated angles and bearings can be checked against it. */
  text?: string;
}

const fmt = (v: number) => {
  if (Math.abs(v - Math.round(v)) < 1e-6) return String(Math.round(v));
  return String(Number(v.toFixed(2)));
};

type Fn = (x: number) => number;
function toFn(expr: string): Fn {
  const code = compile(expr.replace(/^\s*y\s*=/, ""));
  return (x) => {
    try {
      const v = code.evaluate({ x, e: Math.E, pi: Math.PI });
      return typeof v === "number" ? v : Number.NaN;
    } catch {
      return Number.NaN;
    }
  };
}

function roots(h: Fn, a: number, b: number): number[] {
  const out: number[] = [];
  const steps = 600;
  const dx = (b - a) / steps;
  let x0 = a, y0 = h(a);
  const add = (r: number) => { if (!out.some((o) => Math.abs(o - r) < dx)) out.push(r); };
  if (Math.abs(y0) < 1e-9) add(a);
  for (let i = 1; i <= steps; i++) {
    const x1 = a + i * dx, y1 = h(x1);
    if (Number.isFinite(y0) && Number.isFinite(y1)) {
      if (Math.abs(y1) < 1e-9) add(x1);
      else if (y0 * y1 < 0) {
        let lo = x0, hi = x1, flo = y0;
        for (let k = 0; k < 60; k++) {
          const mid = (lo + hi) / 2, fm = h(mid);
          if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; }
        }
        // A jump (like 1/x at 0) is not a root.
        if (Math.abs(h((lo + hi) / 2)) < 1e-3 * (1 + Math.abs(y0) + Math.abs(y1))) add((lo + hi) / 2);
      }
    }
    x0 = x1; y0 = y1;
  }
  // Exact roots at "nice" x values (whole numbers and halves) can sit where the
  // function only starts (sqrt at 0) and show no sign change.
  for (let x = Math.ceil(a * 2) / 2; x <= b + 1e-9; x += 0.5) if (Math.abs(h(x)) < 1e-9) add(x);
  return out.sort((p, q) => p - q).slice(0, 8);
}

function checkGraph(spec: GraphSpec, problems: string[], answers: Record<string, string>) {
  if (spec.x.min >= spec.x.max || spec.y.min >= spec.y.max) problems.push("An axis has its minimum at or above its maximum.");
  const fns: { f: Fn; name: string; from: number; to: number }[] = [];
  spec.functions.forEach((g) => {
    const name = g.label ?? `y = ${g.expr}`;
    // "functions" are y = f(x), so a bare number is a HORIZONTAL line. A label
    // like "x = 10" means the AI wanted a vertical line, which must go in "lines".
    if (/^\s*-?\d+(\.\d+)?\s*$/.test(g.expr) && /^\s*x\s*=/i.test(g.label ?? ""))
      problems.push(`"${g.label}" is a vertical line: write it as "lines":[{"x":${g.expr.trim()},"label":"${g.label}"}], not as a function (a function "${g.expr.trim()}" is the horizontal line y = ${g.expr.trim()}).`);
    let f: Fn;
    try { f = toFn(g.expr); } catch { problems.push(`The graph of "${g.expr}" cannot be read (write it in mathjs form, e.g. x^2 - 4, sqrt(x), 2*sin(x)).`); return; }
    const from = Math.max(spec.x.min, g.from ?? spec.x.min), to = Math.min(spec.x.max, g.to ?? spec.x.max);
    let ok = 0, inView = 0;
    for (let i = 0; i <= 50; i++) {
      const y = f(from + ((to - from) * i) / 50);
      if (Number.isFinite(y)) { ok++; if (y >= spec.y.min && y <= spec.y.max) inView++; }
    }
    if (ok === 0) { problems.push(`"${g.expr}" gives no values between x = ${from} and x = ${to}.`); return; }
    if (inView === 0) problems.push(`"${g.expr}" never appears inside the y-axis range ${spec.y.min} to ${spec.y.max}.`);
    fns.push({ f, name, from, to });
  });
  // Where the lines meet each other (and, with one line, where it crosses the x-axis).
  for (let i = 0; i < fns.length; i++)
    for (let j = i + 1; j < fns.length; j++) {
      const a = Math.max(fns[i].from, fns[j].from), b = Math.min(fns[i].to, fns[j].to);
      if (a >= b) continue;
      const xs = roots((x) => fns[i].f(x) - fns[j].f(x), a, b);
      if (xs.length) answers[`Intersection of ${fns[i].name} and ${fns[j].name}`] = xs.map((x) => `(${fmt(x)}, ${fmt(fns[i].f(x))})`).join("; ");
    }
  if (fns.length === 1) {
    const xs = roots(fns[0].f, fns[0].from, fns[0].to);
    if (xs.length) answers[`${fns[0].name} crosses the x-axis at`] = xs.map((x) => `x = ${fmt(x)}`).join("; ");
  }
  for (const p of spec.points ?? []) {
    if (p.x < spec.x.min || p.x > spec.x.max || p.y < spec.y.min || p.y > spec.y.max) problems.push(`Point ${p.label ?? `(${p.x}, ${p.y})`} is outside the axes.`);
    if (p.label) answers[`Point ${p.label}`] = `(${fmt(p.x)}, ${fmt(p.y)})`;
  }
  if (spec.shade) {
    const pick = (k: number | null): Fn | null => (k === null ? () => 0 : fns[k]?.f ?? null);
    const top = pick(spec.shade.top), bottom = pick(spec.shade.bottom);
    if (!top || !bottom) problems.push("The shaded region refers to a line that does not exist.");
    else {
      const n = 600, a = spec.shade.from, b = spec.shade.to, h = (b - a) / n;
      let s = 0;
      for (let i = 0; i <= n; i++) {
        const v = Math.abs(top(a + i * h) - bottom(a + i * h));
        s += (Number.isFinite(v) ? v : 0) * (i === 0 || i === n ? 1 : i % 2 ? 4 : 2);
      }
      answers["Area of the shaded region"] = `${fmt((s * h) / 3)} square units (x = ${fmt(a)} to ${fmt(b)})`;
    }
  }
  if (spec.inequalities?.length) checkInequalities(spec, problems, answers);
  if (spec.table && fns[0]) {
    const dp = spec.table.decimals ?? 1;
    for (const [xv, letter] of Object.entries(spec.table.blanks ?? {})) {
      const y = fns[0].f(Number(xv));
      answers[`${letter} (y when x = ${xv})`] = Number.isFinite(y) ? String(Number(y.toFixed(dp))) : "undefined";
      if (!spec.table.x.includes(Number(xv))) problems.push(`The blank ${letter} is at x = ${xv}, which is not in the table.`);
    }
  }
  if (spec.region) {
    const pts = spec.region.points;
    if (pts.some((p) => p.x < spec.x.min || p.x > spec.x.max || p.y < spec.y.min || p.y > spec.y.max))
      problems.push("A corner of the shaded region is outside the axes.");
    // Shoelace formula: area of a polygon from its corners.
    let twice = 0;
    pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; twice += p.x * q.y - q.x * p.y; });
    answers["Shaded region corners"] = pts.map((p) => `(${fmt(p.x)}, ${fmt(p.y)})`).join(", ");
    answers["Area of the shaded region"] = `${fmt(Math.abs(twice) / 2)} square units`;
  }
}

const yearOf = (d: string) => {
  const m = /(\d{1,4})\s*(BC|BCE)?/i.exec(d);
  return m ? Number(m[1]) * (m[2] ? -1 : 1) : null;
};

async function checkMap(spec: MapSpec, ctx: CheckContext, problems: string[], answers: Record<string, string>) {
  if (typeof spec.region === "string" && !REGIONS.some((r) => r.toLowerCase() === (spec.region as string).toLowerCase()))
    problems.push(`Unknown map region "${spec.region}". Use one of: ${REGIONS.join(", ")}, or [west, south, east, north] in degrees.`);
  const geo = ctx.geo;
  if (!geo) return;
  const missing = (kind: Parameters<GeoNames["find"]>[0], name: string, what: string) => {
    const close = geo.suggest(kind, name);
    problems.push(`${what} "${name}" is not on the map data.${close.length ? ` Did you mean: ${close.join(", ")}?` : ""}`);
  };
  const letters: string[] = [];
  for (const f of spec.features) {
    if (f.label) letters.push(f.label);
    if (f.kind === "route" || f.kind === "railway" || f.kind === "road") {
      const what = f.kind === "route" ? "Route" : f.kind === "railway" ? "Railway" : "Road";
      const ends = [f.from, ...(f.via ?? []), f.to].filter((x): x is string => Boolean(x));
      if (ends.length < 2) { problems.push(`${what} ${f.label ?? ""} needs "from" and "to".`); continue; }
      const found = ends.map((e) => geo.findPoint(e));
      ends.forEach((e, i) => { if (!found[i]) missing("place", e, `${what} point`); });
      if (f.label && found.every(Boolean))
        answers[f.label] = f.kind === "route" ? `${f.name ? `${f.name}: ` : ""}movement from ${found[0]} to ${found[found.length - 1]}`
          : `${f.name ? `${f.name}: ` : ""}${f.kind === "railway" ? "railway line" : "main road"} from ${found[0]} to ${found[found.length - 1]}`;
      continue;
    }
    if (!f.name) { if (!f.text) problems.push(`A ${f.kind} on the map has no name.`); continue; }
    const kind = f.kind === "kingdom" ? "place" : f.kind;
    const hit = geo.find(kind, f.name);
    if (!hit) { missing(kind, f.name, f.kind[0].toUpperCase() + f.kind.slice(1)); continue; }
    if ((f.kind === "province" || f.kind === "district") && typeof spec.region === "string" && !["zambia", "central africa", "southern africa"].includes(spec.region.toLowerCase()))
      problems.push(`${f.name} is a Zambian ${f.kind}; use the region "Zambia".`);
    if (f.label) answers[f.label] = f.name === hit ? hit : `${f.name} (${hit})`;
  }
  if (spec.layers?.agroRegions) {
    if (typeof spec.region === "string" && !["zambia", "auto"].includes(spec.region.toLowerCase())) problems.push(`Agro-ecological regions are Zambian; use the region "Zambia".`);
    for (const [zone, letter] of Object.entries(spec.layers.agroLabels ?? {})) if (letter) { letters.push(letter); answers[letter] = AGRO_INFO[zone] ?? `Region ${zone}`; }
  }
  const dupes = letters.filter((l, i) => letters.indexOf(l) !== i);
  if (dupes.length) problems.push(`The same letter is used twice on the map: ${[...new Set(dupes)].join(", ")}.`);
  missingAsked(ctx.text, letters, problems);
}

const AGRO_INFO: Record<string, string> = {
  I: "Agro-ecological Region I: low rainfall (below 800 mm), hot valleys of the south, south-west and the Luangwa/Zambezi valleys",
  IIa: "Agro-ecological Region IIa: medium rainfall (800-1000 mm), fertile plateau soils of Central, Lusaka, Eastern and Southern provinces",
  IIb: "Agro-ecological Region IIb: medium rainfall (800-1000 mm), Kalahari sands and the Barotse flood plain of Western Province",
  III: "Agro-ecological Region III: high rainfall (above 1000 mm), leached acidic soils of Northern, Luapula, Muchinga, Copperbelt and North-Western provinces",
};

const LETTER = /^([A-Za-z]{1,2}\d{0,2}|\d{1,2}|[ivx]{1,4})$/;

/**
 * Letters the question refers to ("the feature labelled X", "railways marked
 * R1 and R2") must be on the figure, or the learner cannot answer.
 */
function missingAsked(text: string | undefined, have: string[], problems: string[]) {
  if (!text) return;
  const asked = new Set<string>();
  const re = /\b(?:labell?ed|marked|shown as|lettered|named|letters?)\s+((?:[A-Z]{1,2}\d{0,2})(?:\s*(?:,|and|&|to)\s*[A-Z]{1,2}\d{0,2})*)\b/g;
  for (const m of text.matchAll(re)) {
    // "A to D" means A, B, C and D
    const range = /^([A-Z])\s*to\s*([A-Z])$/.exec(m[1].trim());
    if (range) { for (let c = range[1].charCodeAt(0); c <= range[2].charCodeAt(0); c++) asked.add(String.fromCharCode(c)); continue; }
    for (const l of m[1].split(/\s*(?:,|and|&|to)\s*/)) if (l) asked.add(l);
  }
  const missing = [...asked].filter((l) => l && !have.includes(l));
  if (missing.length) problems.push(`The question refers to ${missing.join(", ")} but the figure has no ${missing.length > 1 ? "such letters" : "such letter"}.`);
}

function checkScene(spec: SceneSpec, text: string | undefined, problems: string[], answers: Record<string, string>) {
  const info = SCENES[spec.scene];
  if (!info) { problems.push(`There is no diagram called "${spec.scene}". Use one of: ${Object.keys(SCENES).join(", ")}.`); return; }
  if (spec.variant && !(info.variants ?? []).includes(spec.variant))
    problems.push(info.variants ? `"${spec.variant}" is not a kind of ${spec.scene}; use one of: ${info.variants.join(", ")}.` : `${spec.scene} has no variants.`);
  const letters: string[] = [];
  for (const [part, words] of Object.entries(spec.labels ?? {})) {
    if (!(part in info.parts)) { problems.push(`${spec.scene} has no part "${part}". Its parts are: ${Object.keys(info.parts).join(", ")}.`); continue; }
    if (LETTER.test(words.trim())) { letters.push(words.trim()); answers[words.trim()] = info.parts[part]; }
  }
  if (info.items && spec.items && spec.items.length < 2) problems.push(`${spec.scene} needs at least two items.`);
  if (info.items && spec.items && /pyramid|chain/.test(spec.scene)) {
    const levels = ["producer", "primary consumer", "secondary consumer", "tertiary consumer", "quaternary consumer"];
    spec.items.forEach((it, i) => { answers[`${it}`] = levels[i] ?? `trophic level ${i + 1}`; });
  }
  const dupes = letters.filter((l, i) => letters.indexOf(l) !== i);
  if (dupes.length) problems.push(`The same letter is used twice: ${[...new Set(dupes)].join(", ")}.`);
  missingAsked(text, letters, problems);
}

function checkCurve(spec: CurveSpec, problems: string[], answers: Record<string, string>) {
  const xName = spec.x?.label?.replace(/\s*[/(].*$/, "") || "x";
  spec.series.forEach((s, k) => {
    const pts = [...s.points].sort((a, b) => a[0] - b[0]);
    const top = pts.reduce((m, p) => (p[1] > m[1] ? p : m), pts[0]);
    const tag = s.name ?? (spec.series.length > 1 ? `curve ${k + 1}` : "the curve");
    answers[`Highest point of ${tag} (optimum)`] = `${xName} ${fmt(top[0])} (value ${fmt(top[1])})`;
    const last = pts[pts.length - 1], prev = pts[pts.length - 2];
    if (Math.abs(last[1] - prev[1]) <= Math.abs(top[1]) * 0.03 && last[1] >= top[1] * 0.95) answers[`${tag} levels off at`] = `about ${fmt(last[1])} (from ${xName} ${fmt(prev[0])})`;
  });
  for (const m of spec.marks ?? []) {
    if (m.x !== undefined) {
      const ys = spec.series.map((s) => interpAt(s.points, m.x!)).filter((v): v is number => v !== null);
      answers[m.label] = `${xName} = ${fmt(m.x)}${ys.length ? ` (value ${ys.map(fmt).join(" / ")})` : ""}`;
    } else if (m.y !== undefined) answers[m.label] = `value ${fmt(m.y)}`;
    else problems.push(`Mark ${m.label} needs an x or a y.`);
  }
}
function interpAt(points: [number, number][], x: number): number | null {
  const p = [...points].sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < p.length; i++) if (x >= p[i - 1][0] && x <= p[i][0]) { const t = (x - p[i - 1][0]) / (p[i][0] - p[i - 1][0] || 1); return +(p[i - 1][1] + t * (p[i][1] - p[i - 1][1])).toFixed(2); }
  return null;
}

function checkFoodWeb(spec: FoodWebSpec, text: string | undefined, problems: string[], answers: Record<string, string>) {
  const names = [...new Set(spec.links.flat())];
  const eats = new Map<string, string[]>(), eatenBy = new Map<string, string[]>();
  for (const [food, eater] of spec.links) {
    if (food === eater) { problems.push(`${food} cannot eat itself.`); continue; }
    eats.set(eater, [...(eats.get(eater) ?? []), food]);
    eatenBy.set(food, [...(eatenBy.get(food) ?? []), eater]);
  }
  const producers = names.filter((x) => !eats.has(x));
  const top = names.filter((x) => !eatenBy.has(x));
  const herbivores = names.filter((x) => (eats.get(x) ?? []).length && (eats.get(x) ?? []).every((f) => producers.includes(f)));
  const chains: string[][] = [];
  const walk = (x: string, path: string[]) => { if (path.length > 12) return; const next = eatenBy.get(x) ?? []; if (!next.length) chains.push(path); for (const y of next) if (!path.includes(y)) walk(y, [...path, y]); };
  for (const p of producers) walk(p, [p]);
  answers["Producers"] = producers.join(", ");
  if (herbivores.length) answers["Primary consumers (herbivores)"] = herbivores.join(", ");
  answers["Top consumers"] = top.join(", ");
  answers["Number of food chains"] = String(chains.length);
  const longest = chains.reduce((m, c) => (c.length > m.length ? c : m), [] as string[]);
  if (longest.length) answers["Longest food chain"] = longest.join(" → ");
  const letters: string[] = [];
  for (const [org, letter] of Object.entries(spec.labels ?? {})) {
    if (!names.includes(org)) { problems.push(`The letter ${letter} is on "${org}", which is not in the food web.`); continue; }
    letters.push(letter);
    const role = producers.includes(org) ? "producer" : herbivores.includes(org) ? "primary consumer (herbivore)" : top.includes(org) ? "top consumer" : "consumer";
    answers[letter] = `${org} (${role})`;
  }
  missingAsked(text, letters, problems);
}

function checkGeneticCross(spec: GeneticCrossSpec, problems: string[], answers: Record<string, string>) {
  const [a, b] = spec.parents.map(parseGenotype);
  for (const [g, al] of [[spec.parents[0], a], [spec.parents[1], b]] as const)
    if (al.length !== 2) problems.push(`"${g}" is not a genotype of two alleles (write e.g. Tt, X^H X^h, X^h Y or I^A I^O).`);
  if (problems.length) return;
  const sexLinked = [...a, ...b].some((x) => x.startsWith("X^") || x === "Y");
  if (sexLinked && !(a.includes("Y") !== b.includes("Y"))) problems.push("A sex-linked cross needs one father (X^? Y) and one mother (X^? X^?).");
  const c = cross(spec.parents[0], spec.parents[1]);
  const traits = spec.traits ?? {};
  const ph = c.offspring.map((o) => phenotype(o, traits));
  answers["Parents"] = `${show(c.parents[0])} (${phenotype(c.parents[0], traits)}) × ${show(c.parents[1])} (${phenotype(c.parents[1], traits)})`;
  answers["Gametes"] = `${[...new Set(c.gametes[0])].join(", ")} and ${[...new Set(c.gametes[1])].join(", ")}`;
  answers["Offspring genotypes"] = ratio(c.offspring.map(show));
  answers["Offspring phenotypes"] = ratio(ph);
  const frac = (k: number) => (k === 4 ? "1" : k === 2 ? "1/2" : `${k}/4`);
  for (const p of [...new Set(ph)]) { const k = ph.filter((x) => x === p).length; answers[`Probability of ${p}`] = `${frac(k)} (${k * 25}%)`; }
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function checkClimate(spec: ClimateSpec, answers: Record<string, string>) {
  const r = spec.rainfall, t = spec.temperature;
  const total = r.reduce((a, b) => a + b, 0);
  // Every month that ties (June, July and August can all have 0 mm)
  const months = (vals: number[], v: number) => MONTH_NAMES.filter((_, i) => vals[i] === v).join(", ");
  const wetV = Math.max(...r), dryV = Math.min(...r);
  answers["Total annual rainfall"] = `${fmt(total)} mm`;
  answers["Wettest month"] = `${months(r, wetV)} (${fmt(wetV)} mm)`;
  answers["Driest month"] = `${months(r, dryV)} (${fmt(dryV)} mm)`;
  if (t) {
    const hot = Math.max(...t), cool = Math.min(...t);
    answers["Mean annual temperature"] = `${(t.reduce((a, b) => a + b, 0) / 12).toFixed(1)} °C`;
    answers["Annual temperature range"] = `${fmt(+(hot - cool).toFixed(2))} °C (${fmt(hot)} - ${fmt(cool)})`;
    answers["Hottest month"] = `${months(t, hot)} (${fmt(hot)} °C)`;
    answers["Coolest month"] = `${months(t, cool)} (${fmt(cool)} °C)`;
  }
  const wetMonths = r.filter((v) => v >= 50).length;
  answers["Months with 50 mm or more of rain"] = String(wetMonths);
}

function checkPopulation(spec: PopulationSpec, problems: string[], answers: Record<string, string>) {
  const groups = spec.groups ?? ["0-4", "5-9", "10-14", "15-19", "20-24", "25-29", "30-34", "35-39", "40-44", "45-49", "50-54", "55-59", "60-64", "65-69", "70-74", "75-79", "80+"].slice(0, spec.male.length);
  if (spec.male.length !== spec.female.length) problems.push(`There are ${spec.male.length} male values but ${spec.female.length} female values.`);
  if (groups.length !== spec.male.length) problems.push(`There are ${groups.length} age groups but ${spec.male.length} values.`);
  const n = Math.min(groups.length, spec.male.length, spec.female.length);
  const unit = spec.unit === "thousands" ? " thousand" : spec.unit === "millions" ? " million" : "%";
  const sum = (a: number[]) => a.slice(0, n).reduce((x, y) => x + y, 0);
  answers["Total males"] = `${fmt(sum(spec.male))}${unit}`;
  answers["Total females"] = `${fmt(sum(spec.female))}${unit}`;
  const bounds = groups.slice(0, n).map((g) => /^(\d+)\s*(?:-|–|to)\s*(\d+)$/.exec(g.trim()) ?? /^(\d+)\s*\+$/.exec(g.trim()));
  if (bounds.every(Boolean)) {
    let young = 0, old = 0, working = 0;
    bounds.forEach((b, i) => {
      const lo = Number(b![1]), hi = b![2] !== undefined ? Number(b![2]) : 200, v = spec.male[i] + spec.female[i];
      if (hi <= 14) young += v; else if (lo >= 65) old += v; else if (lo >= 15 && hi <= 64) working += v;
    });
    const all = sum(spec.male) + sum(spec.female);
    if (working > 0) {
      answers["Aged 0-14"] = `${fmt(young)}${unit}${spec.unit ? ` (${((young / all) * 100).toFixed(1)}%)` : ""}`;
      answers["Aged 65 and over"] = `${fmt(old)}${unit}${spec.unit ? ` (${((old / all) * 100).toFixed(1)}%)` : ""}`;
      answers["Dependency ratio"] = `${(((young + old) / working) * 100).toFixed(1)} dependants per 100 people aged 15-64`;
    }
  }
}

/** Checks a figure. May fill in a molecule's SMILES (so the app can draw it). */
export async function checkFigure(spec: FigureSpec, ctx: CheckContext): Promise<{ spec: FigureSpec; check: FigureCheck }> {
  const problems: string[] = [];
  const answers: Record<string, string> = {};
  switch (spec.type) {
    case "graph":
      checkGraph(spec, problems, answers);
      break;
    case "circle":
      checkCircle(spec, ctx.text, { problems, answers });
      break;
    case "globe":
      checkGlobe(spec, ctx.text, { problems, answers });
      break;
    case "venn":
      checkVenn(spec, { problems, answers });
      break;
    case "plane":
      checkPlane(spec, { problems, answers });
      break;
    case "geometry":
      checkGeometry(spec, ctx.text, { problems, answers });
      break;
    case "construction":
      checkConstruction(spec, ctx.text, { problems, answers });
      break;
    case "solid":
      checkSolid(spec, { problems, answers });
      break;
    case "chart": {
      const chart = spec;
      chart.series.forEach((s, k) => {
        if (s.values.length !== chart.categories.length) problems.push(`Series ${s.name ?? k + 1} has ${s.values.length} values for ${chart.categories.length} categories.`);
        const n = Math.min(s.values.length, chart.categories.length);
        if (!n) return;
        const vals = s.values.slice(0, n);
        const hi = vals.indexOf(Math.max(...vals)), lo = vals.indexOf(Math.min(...vals));
        const tag = chart.series.length > 1 ? ` (${s.name ?? `series ${k + 1}`})` : "";
        answers[`Highest${tag}`] = `${chart.categories[hi]}: ${fmt(vals[hi])}`;
        answers[`Lowest${tag}`] = `${chart.categories[lo]}: ${fmt(vals[lo])}`;
        answers[`Total${tag}`] = fmt(vals.reduce((a, b) => a + b, 0));
        answers[`Range${tag}`] = fmt(vals[hi] - vals[lo]);
      });
      break;
    }
    case "timeline": {
      const years = spec.events.map((e) => yearOf(e.date));
      for (let i = 1; i < years.length; i++)
        if (years[i] !== null && years[i - 1] !== null && years[i]! < years[i - 1]!) { problems.push("The events are not in date order."); break; }
      for (const e of spec.events) if (e.blank) answers[e.blank] = `${e.label} (${e.date})`;
      break;
    }
    case "tree": {
      const ids = new Set<string>();
      for (const n of spec.nodes) {
        if (ids.has(n.id)) problems.push(`Two people/boxes share the id "${n.id}".`);
        ids.add(n.id);
      }
      for (const n of spec.nodes) {
        if (n.parent && !ids.has(n.parent)) problems.push(`"${n.label}" has a parent "${n.parent}" that is not in the chart.`);
        if (n.partner && !ids.has(n.partner)) problems.push(`"${n.label}" has a partner "${n.partner}" that is not in the chart.`);
        if (n.blank) answers[n.blank] = n.label;
      }
      if (!spec.nodes.some((n) => !n.parent)) problems.push("The chart has no top box (every box has a parent).");
      break;
    }
    case "diagram": {
      const first = spec.mermaid.trim().split("\n")[0].trim();
      if (!/^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|mindmap|pie|timeline|block-beta|journey|quadrantChart|gitGraph)\b/.test(first))
        problems.push(`The diagram must start with a Mermaid diagram type (e.g. "flowchart TD"), not "${first.slice(0, 30)}".`);
      for (const [letter, meaning] of Object.entries(spec.blanks ?? {})) {
        if (!new RegExp(`[\\[(>{|"\\s]${letter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\])}|"\\s]`).test(` ${spec.mermaid} `)) problems.push(`Letter ${letter} is not written in the diagram.`);
        answers[letter] = meaning;
      }
      break;
    }
    case "map":
      await checkMap(spec, ctx, problems, answers);
      break;
    case "scene":
      checkScene(spec, ctx.text, problems, answers);
      break;
    case "climate":
      checkClimate(spec, answers);
      break;
    case "population":
      checkPopulation(spec, problems, answers);
      break;
    case "curve":
      checkCurve(spec, problems, answers);
      break;
    case "food-web":
      checkFoodWeb(spec, ctx.text, problems, answers);
      break;
    case "genetic-cross":
      checkGeneticCross(spec, problems, answers);
      break;
    case "molecule": {
      const name = spec.name;
      if (ctx.pubchem !== false && name) {
        const c = await lookupCompound(name);
        if (c === "offline") {
          if (!spec.smiles) problems.push(`PubChem could not be reached to find the structure of ${name}; it is shown when PubChem is reachable or when SMILES is given.`);
        } else if (c) {
          if (!spec.smiles) spec = { ...spec, smiles: c.smiles };
          if (spec.label) answers[spec.label] = name;
          answers[`Molecular formula of ${name}`] = c.formula;
          answers[`Relative molecular mass of ${name}`] = c.weight;
        } else if (!spec.smiles) problems.push(`"${spec.name}" was not found on PubChem; give its structure as SMILES or use another name.`);
      } else if (spec.label && spec.name) answers[spec.label] = spec.name;
      if (!spec.smiles && !problems.length) problems.push(`No structure is available for ${spec.name ?? "this molecule"}.`);
      break;
    }
    case "image": {
      const pic = ctx.picture ? await ctx.picture(spec.id) : null;
      if (!pic) { problems.push(`The picture "${spec.id}" is not in your diagram library.`); break; }
      const want = spec.showLabels?.map((l) => l.toUpperCase());
      for (const l of pic.labels) if ((!want || want.includes(l.letter.toUpperCase())) && l.meaning) answers[l.letter] = l.meaning;
      for (const l of want ?? []) if (!pic.labels.some((x) => x.letter.toUpperCase() === l)) problems.push(`The picture "${pic.title}" has no letter ${l}.`);
      break;
    }
  }
  const check: FigureCheck = {};
  if (problems.length) check.problems = problems;
  if (Object.keys(answers).length) check.answers = answers;
  return { spec, check };
}
