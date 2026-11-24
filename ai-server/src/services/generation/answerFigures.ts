/**
 * Answer figures for the marking key, made by the server, not the model.
 *
 * The model is asked to draw the answer to every drawing question in the
 * marking key, but it often writes only "Region shaded" or "Completed Venn
 * diagram". Teachers need to see the answer. So after the paper is written,
 * the server reads each question and, where the key has no figure, builds
 * the answer figure itself from the question's own numbers:
 *
 *   Venn word problem   "In a survey of 50 farmers … 28 grow maize (M) … 4 grow all three …
 *                        Draw a Venn diagram to illustrate this information."
 *                        → a venn figure with "totals": the server works out every region.
 *   Venn shading        "On the diagram, shade the region representing (F ∪ N) ∩ B′."
 *                        → the question's own Venn diagram with that region hatched.
 *   Construction / loci "Construct triangle ABC in which AB = 9 cm, BC = 7 cm and angle ABC = 60° …
 *                        the locus of points 5 cm from B … equidistant from AB and BC …
 *                        shade the region … less than 5 cm from B and nearer to AB than to BC."
 *                        → a construction figure: the triangle to scale, every arc, the loci
 *                          and the hatched region (drawn and measured by the app and checker).
 *   Graph of a function "Draw the graph of y = x² − 2x − 3 for −2 ≤ x ≤ 4." / "Sketch y = x³ − 4x."
 *                        → a graph figure of that function over that range; a sketch with no
 *                          range is drawn where the curve crosses the axes and turns, with those
 *                          points labelled. A paper graph with the curve or table hidden is
 *                          given back complete.
 *   Linear programming  "x ≥ 0, y ≥ 2, x + y ≤ 8 … shade the unwanted region … maximise P = 3x + 2y"
 *                        → a graph with those inequalities: lines labelled, the unwanted side
 *                          shaded, R and its corners lettered; the checker adds the objective
 *                          at every corner. For a word problem, the inequalities the key wrote.
 *
 * Every figure goes through the usual checks afterwards (figures/process.ts),
 * which also measure the lengths and angles for the key. Questions this code
 * cannot read are listed (`unreadable`) so one short AI call can draw them
 * (drawMissingFigures).
 */
import { compile } from "mathjs";
import type { Writer } from "../ai/NemotronProvider.js";
import { isAbortError, logError } from "../../utils/errors.js";
import { constructionLayout, feasibleRegion, objectiveAt, parseInequality, solveVenn, type Inequality } from "../figures/figureMath.js";
import { constructionSchema, figureSchema } from "../figures/spec.js";
import { figureGuide } from "./figures.js";
import { splitKey } from "./keyCheck.js";
import { arrowFrom, bearingsFrom, linesFrom, pointsFrom, statsFrom, transformationFrom, travelFrom, treeFrom } from "./answerReaders.js";

type Spec = Record<string, unknown>;

// ───────────── Reading the paper ─────────────

/** "### Question 16", "### 16. Constructions and loci [10]", "### 16) …": the AI writes either. */
const QUESTION = /^###\s+(?:Question\s+)?(\d+)(?![.\d]*\d)\b[.:)]?[^\n]*$/gim;

/** The paper (or key) cut into questions: number → text (and where it sits). */
function questionsOf(text: string): { n: number; start: number; end: number; body: string }[] {
  const heads = [...text.matchAll(QUESTION)].map((m) => ({ n: Number(m[1]), at: m.index! }));
  return heads.map((h, k) => {
    const end = k + 1 < heads.length ? heads[k + 1].at : text.length;
    return { n: h.n, start: h.at, end, body: text.slice(h.at, end) };
  });
}

/** Figures already in a piece of Markdown. */
function figuresIn(text: string): Spec[] {
  return [...text.matchAll(/```figure\s*\n([\s\S]*?)```/g)].flatMap((m) => {
    try { return [JSON.parse(m[1]) as Spec]; } catch { return []; }
  });
}

/** Plain words from Markdown and TeX: "$\angle ABC = 60^\circ$" → "angle ABC = 60°". */
export function plain(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\\text\{([^}]*)\}/g, "$1").replace(/\\mathrm\{([^}]*)\}/g, "$1")
    .replace(/\\(sin|cos|tan|log|ln)\b/g, "$1").replace(/\\angle\s*/g, "angle ").replace(/\^\s*\{?\\circ\}?/g, "°").replace(/\\degree/g, "°")
    .replace(/\\cup/g, "∪").replace(/\\cap/g, "∩").replace(/\\xi/g, "ξ").replace(/\\varepsilon|\\epsilon/g, "ξ")
    .replace(/\^\s*\{?\\prime\}?|\\prime|\^\s*\{?'\}?/g, "′").replace(/(?<=[A-Z)])'/g, "′").replace(/\^c\b/g, "′")
    .replace(/\\leq?\b|\\leqslant/g, "≤").replace(/\\geq?\b|\\geqslant/g, "≥").replace(/\\times/g, "×")
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1)/($2)").replace(/\\sqrt\{([^}]*)\}/g, "sqrt($1)")
    .replace(/\\[,;!: ]/g, " ").replace(/\\left|\\right/g, "").replace(/[{}$*_]/g, "")
    .replace(/[ \t]+/g, " ");
}

const num = (s: string) => Number(s.replace("−", "-"));

// ───────────── Venn diagrams ─────────────

const UNIVERSE = /(?:survey of|class of|group of|sample of|total of|out of|the|ξ\s*(?:has|=|contains))\s+(\d+)\s*(?:[a-z]+\s+){0,2}?(?:pupils|learners|students|farmers|people|members|traders|customers|teachers|households|boys|girls|players|patients|workers|families|children|elements|residents|women|men|candidates|athletes|visitors|shops|villagers|employees)?\b/i;

/**
 * "28 grow maize (M), 22 grow soya beans (S) … 10 grow maize and soya beans …
 * 4 grow all three" → the Venn totals, if every set and overlap is given.
 */
export function vennTotalsFrom(question: string): { sets: { id: string; label: string }[]; totals: Record<string, number> } | null {
  const text = plain(question);
  // Sets named with their letters: "maize (M)", "Football (F)".
  const named = [...text.matchAll(/([A-Za-z][A-Za-z-]*(?:\s+[a-z][A-Za-z-]*){0,2})\s*\(([A-Z])\)/g)]
    .map((m) => ({ id: m[2], label: m[1].replace(/^(grow|play|like|study|take|read|own|use|speak|watch|visit|drink|eat|keep)\s+/i, "").trim() }));
  const sets = [...new Map(named.map((s) => [s.id, s])).values()].slice(0, 3);
  if (sets.length < 2) return null;
  const word = (s: { id: string; label: string }) => new RegExp(`\\b(${s.label.split(/\s+/)[0].replace(/[^A-Za-z-]/g, "")}|\\(${s.id}\\))`, "i");
  const totals: Record<string, number> = {};
  // Each clause with a number: which sets does it name?
  for (const clause of text.split(/[.;\n]|,(?![^(]*\))/)) {
    const n = /(\d+)/.exec(clause);
    if (!n) continue;
    const value = Number(n[1]);
    if (/all (three|3)|all of them|every one of/i.test(clause) && sets.length === 3) { totals[sets.map((s) => s.id).join("")] = value; continue; }
    if (/\b(none|neither|not any)\b/i.test(clause)) continue; // a "none" count is the outside, worked out from ξ
    const hit = sets.filter((s) => word(s).test(clause));
    if (hit.length === 1 && !/\bonly\b/i.test(clause)) totals[hit[0].id] ??= value;
    else if (hit.length === 2 && /\band\b|both/i.test(clause) && !/\bonly\b/i.test(clause)) totals[hit.map((s) => s.id).join("")] ??= value;
  }
  const u = UNIVERSE.exec(text);
  if (u) totals["ξ"] = Number(u[1]);
  const ids = sets.map((s) => s.id);
  const solved = solveVenn(ids, totals);
  if (!solved || Object.values(solved).some((v) => v < 0 || !Number.isFinite(v))) return null;
  return { sets, totals };
}

/** "shade the region representing (F ∪ N) ∩ B′" → "(F ∪ N) ∩ B′". */
export function shadeExpression(part: string, ids: string[]): string | null {
  const text = plain(part);
  if (!/shad|hatch/i.test(text)) return null;
  const letters = ids.join("");
  const re = new RegExp(`[(\\s]*[${letters}ξ][${letters}ξ∪∩′()\\s]*`, "g");
  const candidates = [...text.matchAll(re)].map((m) => m[0].trim()).filter((s) => /[∪∩′]/.test(s));
  const best = candidates.sort((a, b) => b.length - a.length)[0];
  if (!best) return null;
  // Balanced brackets only.
  let depth = 0;
  for (const c of best) { if (c === "(") depth++; if (c === ")") depth--; if (depth < 0) return null; }
  return depth === 0 ? best.replace(/\s+/g, " ") : null;
}

// ───────────── Constructions and loci ─────────────

interface Locus { kind: string; centre?: string; radius?: number; to?: string; distance?: number; at?: string; of?: string; label?: string }

/** The scale of a drawing: "1 cm to 2 m", "1 cm represents 50 m". Lengths in m become cm on paper. */
function scaleOf(text: string): number | null {
  const m = /1\s*cm\s*(?:to|represents|:|=)\s*(\d+(?:\.\d+)?)\s*m\b/i.exec(text);
  return m ? Number(m[1]) : null;
}

function lengthCm(value: string, unit: string, scale: number | null): number {
  const v = Number(value);
  return unit.toLowerCase() === "m" && scale ? v / scale : v;
}

/** Which locus a phrase describes ("5 cm from B", "equidistant from AB and BC", …). */
function locusFrom(phrase: string, scale: number | null, vertices: string): Locus | null {
  const V = `[${vertices}]`;
  let m = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(cm|m)\\s+(?:from|of)\\s+(?:the\\s+)?(?:line|side|boundary)?\\s*(${V}${V})\\b`).exec(phrase);
  if (m) return { kind: "parallel", to: m[3], distance: lengthCm(m[1], m[2], scale) };
  m = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(cm|m)\\s+(?:from|of)\\s+(?:the\\s+)?(?:point\\s+)?(${V})\\b`).exec(phrase);
  if (m) return { kind: "circle", centre: m[3], radius: lengthCm(m[1], m[2], scale) };
  m = new RegExp(`equidistant from\\s+(?:the\\s+)?(?:lines?|sides?)?\\s*(${V}${V})\\s+and\\s+(?:the\\s+)?(?:line|side)?\\s*(${V}${V})`).exec(phrase);
  if (m) {
    const common = [...m[1]].find((c) => m![2].includes(c));
    if (common) return { kind: "angle-bisector", at: common };
  }
  m = new RegExp(`equidistant from\\s+(?:the\\s+)?(?:points?\\s+)?(${V})\\s+and\\s+(${V})\\b(?!${V})`).exec(phrase);
  if (m) return { kind: "perpendicular-bisector", of: `${m[1]}${m[2]}` };
  return null;
}

const sameLocus = (a: Locus, b: Locus) =>
  a.kind === b.kind && (a.centre ?? "") === (b.centre ?? "") && (a.at ?? "") === (b.at ?? "")
  && sortPair(a.to) === sortPair(b.to) && sortPair(a.of) === sortPair(b.of)
  && Math.abs((a.radius ?? a.distance ?? 0) - (b.radius ?? b.distance ?? 0)) < 1e-6;
const sortPair = (s?: string) => (s ? [...s].sort().join("") : "");

/** The triangle, loci and shaded region of a construction question, if it can be read. */
export function constructionFrom(question: string): Spec | null {
  const text = plain(question);
  const tri = /construct\s+(?:a\s+|the\s+)?(?:triangle|△)\s*([A-Z]{3})\b/i.exec(text);
  if (!tri) return null;
  const name = tri[1].toUpperCase();
  const V = `[${name}]`;
  const sides: Record<string, number> = {};
  for (const m of text.matchAll(new RegExp(`\\b(${V}${V})\\s*=\\s*(\\d+(?:\\.\\d+)?)\\s*cm`, "g"))) sides[m[1]] ??= Number(m[2]);
  const angles: Record<string, number> = {};
  for (const m of text.matchAll(new RegExp(`(?:angle|∠)\\s*(${V}{3}|${V})\\s*=\\s*(\\d+(?:\\.\\d+)?)\\s*°?`, "gi"))) angles[m[1].toUpperCase()] ??= Number(m[2]);
  if (Object.keys(sides).length + Object.keys(angles).length < 3) return null;
  // The first side named is the base: the name starts with it.
  const first = Object.keys(sides)[0];
  const third = [...name].find((c) => !first.includes(c))!;
  const ordered = `${first}${third}`;
  const scale = scaleOf(text);

  // Loci: the "(i) …, (ii) …" list after "locus", and any single "construct the locus of points …".
  const loci: Locus[] = [];
  const add = (l: Locus | null, label?: string) => { if (l && !loci.some((x) => sameLocus(x, l)) && loci.length < 4) loci.push({ ...l, label }); };
  const after = text.slice(Math.max(0, text.search(/locus|loci/i)));
  for (const item of after.matchAll(/\(([ivx]+)\)\s*([^\n(]*)/g)) add(locusFrom(item[2], scale, name), `(${item[1]})`);
  for (const m of text.matchAll(/locus of (?:the )?points?[^.\n]*/gi)) add(locusFrom(m[0], scale, name));

  // The region: "shade the region … less than 5 cm from B and nearer to AB than to BC".
  const region: { locus: number; keep: string }[] = [];
  // The conditions are on the line that asks for the shading (often just before "shade": "A point T … is at most
  // 7 cm from L, … Indicate clearly, by shading, the region in which T must lie.").
  // The conditions may also be on the lines just before it ("• T is at most 6 cm from Y," one per line):
  // back to the start of that part ("(d) A point T …").
  const textLines = text.split("\n");
  const at = textLines.findIndex((l) => /shad|indicate[^.]*region/i.test(l));
  let from = at;
  while (from > 0 && at - from < 8 && !/^\s*(?:\*\*)?\([a-h]\)/i.test(textLines[from]) && /^\s*(?:•|-|\*|\((?:i{1,3}|iv|v)\))|\b(?:point|satisf|region|from|than)\b/i.test(textLines[from - 1])) from--;
  const shadeLine = at >= 0 ? textLines.slice(from, at + 1).join(" ") : undefined;
  if (shadeLine) {
    const s = shadeLine;
    const keep = (l: Locus | null, side: string) => {
      if (!l) return;
      let k = loci.findIndex((x) => sameLocus(x, l));
      if (k < 0 && loci.length < 4) { loci.push(l); k = loci.length - 1; }
      if (k >= 0 && !region.some((r) => r.locus === k)) region.push({ locus: k, keep: side });
    };
    for (const m of s.matchAll(new RegExp(`(less than|within|at most|not more than|no more than|inside|more than|at least|further than|greater than|outside|not less than)\\s+(\\d+(?:\\.\\d+)?)\\s*(cm|m)\\s+(?:from|of)\\s+(?:the\\s+)?(?:line|side|boundary|point)?\\s*(${V}{1,2})\\b`, "gi"))) {
      const near = /less|within|at most|not more|no more|inside/i.test(m[1]);
      const d = lengthCm(m[2], m[3], scale);
      if (m[4].length === 1) keep({ kind: "circle", centre: m[4], radius: d }, near ? "inside" : "outside");
      else keep({ kind: "parallel", to: m[4], distance: d }, near ? "near" : "far");
    }
    for (const m of s.matchAll(new RegExp(`(?:nearer|closer)\\s+(?:to\\s+)?(?:the\\s+)?(?:line|side)?\\s*(${V}${V})\\s+than\\s+(?:to\\s+)?(?:the\\s+)?(?:line|side)?\\s*(${V}${V})`, "gi"))) {
      const common = [...m[1]].find((c) => m[2].includes(c));
      if (common) keep({ kind: "angle-bisector", at: common }, m[1]);
    }
    for (const m of s.matchAll(new RegExp(`(?:nearer|closer)\\s+(?:to\\s+)?(?:the\\s+)?(?:point\\s+)?(${V})\\s+than\\s+(?:to\\s+)?(?:the\\s+)?(?:point\\s+)?(${V})\\b(?!${V})`, "gi")))
      keep({ kind: "perpendicular-bisector", of: `${m[1]}${m[2]}` }, m[1]);
  }

  const spec: Spec = {
    type: "construction",
    title: `Answer: triangle ${name} constructed${loci.length ? ", with the loci" : ""}${region.length ? " and the required region shaded" : ""}`,
    triangle: { name: ordered, sides, ...(Object.keys(angles).length ? { angles } : {}) },
    ...(loci.length ? { loci } : {}),
    ...(region.length ? { region, regionLabel: /\b(?:region|point)\s+([A-Z])\b(?![A-Z])/.exec(shadeLine ?? "")?.[1] ?? "R" } : {}),
  };
  const parsed = constructionSchema.safeParse(spec);
  if (!parsed.success) return null;
  try {
    const layout = constructionLayout(parsed.data as never) as { problems?: string[] };
    if (layout.problems?.length) return null;
  } catch {
    return null;
  }
  return spec;
}

// ───────────── Graphs of functions ─────────────

/** "Draw the graph of y = x² − 2x − 3 for −2 ≤ x ≤ 4" → a graph figure. */
// ───────────── Graphs of functions (draw, plot, sketch) ─────────────

const EXPR_CHARS = /^[-+*/^().\dx\s]+$/;
const TRIG = /\b(sin|cos|tan)\b/;

/**
 * "x² − 4x + 3", "(x − 1)(x + 2)(x − 3)", "2x(x − 3)", "2 sin x", "3^x", "log x" → what mathjs reads:
 * "x^2 - 4*x + 3", "(x-1)*(x+2)*(x-3)", "2*sin((x)*pi/180)" (x in degrees), "3^x", "log10(x)".
 */
function mathOf(raw: string): string | null {
  let e = raw.replace(/²/g, "^2").replace(/³/g, "^3").replace(/[−–]/g, "-").replace(/°/g, "").replace(/\s+/g, " ").trim()
    .replace(/[.,;:]+$/, "").trim();
  if (!e || !/x/.test(e)) return null;
  e = e.replace(/\|([^|]+)\|/g, "abs($1)")
    .replace(/(?<![a-z])(sin|cos|tan|log|ln|sqrt)\s*(?!\()(\d*\s*x(?:\s*[+-]\s*\d+)?)/g, "$1($2)") // "sin x", "sin 2x" → sin(x), sin(2x)
    .replace(/\be\s*\^/g, "exp(1)^");
  // Only numbers, x, operators and these functions.
  const bare = e.replace(/(?<![a-z])(sin|cos|tan|log|ln|sqrt|abs|exp)(?=\()/g, "");
  if (!EXPR_CHARS.test(bare)) return null;
  e = e.replace(/(\d)\s*(?=[x(a-z])/g, "$1*").replace(/([x)])\s*(?=[x(\da-z])/g, "$1*");
  // Degrees, as school trigonometry uses them; mathjs log is ln.
  e = e.replace(/(?<![a-z])(sin|cos|tan)\(/g, "$1(pi/180*").replace(/(?<![a-z])log\(/g, "log10(").replace(/(?<![a-z])ln\(/g, "log(");
  return e;
}

const functionOf = (expr: string): ((x: number) => number) | null => {
  try {
    const code = compile(expr);
    const f = (x: number) => Number(code.evaluate({ x }));
    return Number.isFinite(f(0.37)) ? f : null;
  } catch { return null; }
};

const round2 = (v: number) => Math.round(v * 100) / 100;
const show = (v: number) => String(round2(v)).replace("-", "−");

/** Where the curve crosses the x-axis and turns, for −10 ≤ x ≤ 10. */
function featuresOf(f: (x: number) => number) {
  const roots: number[] = [], turns: number[] = [];
  const h = 0.005;
  let prev = f(-10), prevD = f(-10 + h) - f(-10 - h);
  for (let x = -10 + 0.01; x <= 10 + 1e-9; x += 0.01) {
    const y = f(x), d = f(x + h) - f(x - h);
    if (Math.abs(y) < 1e-9) { if (!roots.some((r) => Math.abs(r - x) < 0.02)) roots.push(x); }
    else if (prev * y < 0) { const r = bisect(f, x - 0.01, x); if (!roots.some((o) => Math.abs(o - r) < 0.02)) roots.push(r); }
    if (prevD * d < 0) turns.push(bisect((t) => f(t + h) - f(t - h), x - 0.01, x));
    prev = y; prevD = d;
  }
  const tidy = (v: number) => (Math.abs(v - Math.round(v)) < 1e-6 ? Math.round(v) : round2(v));
  return { roots: [...new Set(roots.map(tidy))], turns: [...new Set(turns.map(tidy))] };
}
function bisect(f: (x: number) => number, a: number, b: number) {
  for (let i = 0; i < 50; i++) { const m = (a + b) / 2; if (f(a) * f(m) <= 0) b = m; else a = m; }
  return (a + b) / 2;
}

/** The functions a question asks for: "y = …" after draw/plot/sketch (and any others "on the same axes"). */
function functionsAsked(text: string): { label: string; expr: string }[] {
  const out: { label: string; expr: string }[] = [];
  for (const m of text.matchAll(/\b(y|f\s*\(\s*x\s*\))\s*=\s*([-+*\/^().\dx\s²³−–°|a-z]+?)(?=\s*(?:for\b|from\b|in the\b|where\b|when\b|on\b|and\b|using\b|with\b|between\b|as\b|[,;:\[]|\.(?!\d)|$))/gim)) {
    const expr = mathOf(m[2]);
    if (expr && functionOf(expr) && !out.some((o) => o.expr === expr)) out.push({ label: `y = ${m[2].trim().replace(/[.,;:]+$/, "").replace(/\^2/g, "²").replace(/\^3/g, "³").replace(/\^x/g, "ˣ").replace(/ - /g, " − ")}`, expr });
  }
  return out;
}

const niceStep = (span: number) => (span <= 3 ? [0.5] : []).concat([1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000, 2000, 5000]).find((s) => span / s <= 12) ?? 10000;

/**
 * The answer graph of a "draw / plot / sketch the graph of y = …" question.
 * The range is the question's ("for −2 ≤ x ≤ 4"); a sketch with no range is
 * drawn where the curve crosses the axes and turns, and those points are
 * labelled, as the learner must show them.
 */
export function graphFrom(question: string): Spec | null {
  const text = plain(question);
  const asked = functionsAsked(text);
  if (!asked.length) return null;
  const main = asked[0];
  const f = functionOf(main.expr)!;
  const trig = TRIG.test(main.expr);
  const sketch = /\bsketch/i.test(text) && !/table/i.test(text) && !trig;
  const flat = text.replace(/−/g, "-").replace(/°/g, "");
  const r = /(-?\d+(?:\.\d+)?)\s*(?:≤|<=|<)\s*x\s*(?:≤|<=|<)\s*(-?\d+(?:\.\d+)?)/.exec(flat)
    ?? /x\s*=\s*(-?\d+(?:\.\d+)?)\s*to\s*x\s*=\s*(-?\d+(?:\.\d+)?)/i.exec(flat);
  const feats = trig ? { roots: [], turns: [] } : featuresOf(f);
  let from: number, to: number;
  if (r) [from, to] = [num(r[1]), num(r[2])];
  else if (trig) [from, to] = [0, 360];
  else {
    const xs = [0, ...feats.roots, ...feats.turns];
    from = Math.floor(Math.min(...xs) - 1); to = Math.ceil(Math.max(...xs) + 1);
    if (to - from < 4) { from -= 1; to += 1; }
  }
  if (!(to > from)) return null;
  const ys = Array.from({ length: 81 }, (_, k) => f(from + ((to - from) * k) / 80)).filter(Number.isFinite);
  if (ys.length < 20) return null;
  const yStep = niceStep(Math.max(...ys) - Math.min(...ys) || 1);
  const xStep = trig ? ((to - from) <= 180 ? 15 : (to - from) <= 360 ? 30 : 90) : (to - from) / 1 <= 12 ? 1 : niceStep(to - from);
  const sameAxes = /same axes|same graph|same diagram|same grid/i.test(text);
  const functions = [{ expr: main.expr, label: main.label, from, to }, ...(sameAxes ? asked.slice(1, 4).map((a) => ({ expr: a.expr, label: a.label, from, to })) : [])];
  let points: { x: number; y: number; label?: string }[];
  if (sketch || !r) {
    // The points a sketch must show: where it crosses the axes and where it turns.
    const inRange = (x: number) => x >= from - 1e-9 && x <= to + 1e-9;
    points = [
      ...feats.roots.filter(inRange).map((x) => ({ x, y: 0, label: `(${show(x)}, 0)` })),
      ...(feats.roots.some((x) => Math.abs(x) < 1e-6) ? [] : [{ x: 0, y: round2(f(0)), label: `(0, ${show(f(0))})` }]),
      ...feats.turns.filter(inRange).map((x) => ({ x, y: round2(f(x)), label: `(${show(x)}, ${show(f(x))})` })),
    ].slice(0, 20);
  } else {
    const step = trig ? xStep : Math.max(1, Math.round((to - from) / 10));
    points = Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, k) => from + k * step)
      .map((x) => ({ x, y: round2(f(x)) })).filter((p) => Number.isFinite(p.y));
  }
  const lo = Math.min(0, ...ys), hi = Math.max(0, ...ys);
  const spec: Spec = {
    type: "graph", title: `Answer: the graph of ${main.label}${functions.length > 1 ? ` and ${functions.slice(1).map((g) => g.label).join(", ")}` : ""}`,
    x: { min: Math.floor(from), max: Math.ceil(to), label: trig ? "x (degrees)" : "x", step: xStep },
    y: { min: Math.floor(lo / yStep) * yStep - (lo < 0 ? 0 : 0), max: Math.ceil(hi / yStep) * yStep + (hi === Math.ceil(hi / yStep) * yStep ? yStep : 0), label: "y", step: yStep },
    functions,
    points,
    grid: true,
  };
  return figureSchema.safeParse(spec).success ? spec : null;
}

/** The question's own graph with the curve or table hidden for the learner: the answer is the same graph complete. */
export function completedGraph(paperFigure: Spec): Spec | null {
  const g = paperFigure as { type?: string; hideCurves?: boolean; functions?: unknown[]; table?: { blanks?: unknown } ; inequalities?: unknown[] };
  if (g.type !== "graph" || !(g.hideCurves || g.table?.blanks) || !(g.functions?.length || g.inequalities?.length)) return null;
  const spec: Spec = { ...paperFigure, hideCurves: false, title: `Answer: ${String(paperFigure.title ?? "the completed graph").replace(/^Answer:\s*/i, "")}` };
  if (g.table) spec.table = { ...g.table, blanks: undefined };
  return figureSchema.safeParse(spec).success ? spec : null;
}

// ───────────── Inequalities and linear programming ─────────────

/** Every inequality in x and y in a piece of text: "x ≥ 0", "y > 2", "x + y ≤ 8", "0 ≤ x ≤ 10" (two). */
export function inequalitiesIn(text: string): string[] {
  const t = plain(text).replace(/[−–]/g, "-").replace(/⩽/g, "≤").replace(/⩾/g, "≥");
  const out: string[] = [];
  const key = (q: Inequality) => { const n = Math.hypot(q.a, q.b) || 1; return `${(q.a / n).toFixed(4)},${(q.b / n).toFixed(4)},${(q.c / n).toFixed(4)},${q.strict}`; };
  const seen = new Set<string>();
  for (const m of t.matchAll(/[-+\d.\sxy]*?(?:≤|≥|<=|>=|<|>)[-+\d.\sxy]*(?:(?:≤|≥|<=|>=|<|>)[-+\d.\sxy]*)?/g)) {
    const run = m[0].trim();
    if (!/[xy]/.test(run)) continue;
    const parts = run.split(/(≤|≥|<=|>=|<|>)/).map((x) => x.trim());
    // "a ≤ x ≤ b" is two inequalities.
    const pieces = parts.length === 5 ? [`${parts[0]} ${parts[1]} ${parts[2]}`, `${parts[2]} ${parts[3]} ${parts[4]}`] : parts.length === 3 ? [run] : [];
    for (const piece of pieces) {
      const [l, , r] = piece.split(/(≤|≥|<=|>=|<|>)/).map((x) => x.trim());
      if (!l || !r || !/^[-+\d.\sxy]+$/.test(l + r) || /[xy]\s*[xy]|\d\s+\d/.test(l + " " + r)) continue;
      const q = parseInequality(piece);
      if (!q || seen.has(key(q))) continue;
      seen.add(key(q));
      out.push(piece.replace(/\s+/g, " "));
    }
  }
  return out;
}

/** "Maximise P = 15x + 20y", "the minimum cost … C = 4x + 3y". */
function objectiveIn(text: string): { expr: string; goal: "max" | "min" } | null {
  const t = plain(text).replace(/[−–]/g, "-");
  const m = /\b(maximi[sz]e|minimi[sz]e|maximum|minimum|greatest|least|largest|smallest|most|cheapest)\b[^.?]*?(?:\b[A-Za-z]\s*=\s*)?(K?\s*\d*\.?\d*\s*x\s*[+-]\s*K?\s*\d*\.?\d*\s*y)\b/i.exec(t)
    ?? /\b([A-Z])\s*=\s*(K?\s*\d*\.?\d*\s*x\s*[+-]\s*K?\s*\d*\.?\d*\s*y)\b/.exec(t)
    ?? /\b(profit|cost|income|revenue|takings|value|total)\b[^.?]*?(K?\s*\d*\.?\d*\s*x\s*[+-]\s*K?\s*\d*\.?\d*\s*y)\b/i.exec(t);
  if (!m) return null;
  const expr = m[2].replace(/K/g, "").replace(/\s+/g, " ").trim();
  if (objectiveAt(expr, { x: 1, y: 1 }) === null) return null;
  const goal = /minim|least|smallest|cheapest/i.test(m[1]) || (!/maxim|greatest|largest|most/i.test(m[1]) && /minim|least|cheapest|lowest|smallest/i.test(t) && !/maxim|greatest|largest/i.test(t)) ? "min" : "max";
  return { expr, goal };
}

/**
 * The answer graph of an inequalities or linear programming question: every
 * boundary line (labelled), the unwanted side shaded and R left clear, the
 * corners lettered and, when the question gives one, the objective. The
 * figure checker then writes R's corners and the objective at each corner
 * under it (figures/checkMaths.ts). The inequalities are the question's, or,
 * for a word problem, those the key writes down in its answer.
 */
export function feasibleFrom(question: string, keyAnswer: string): Spec | null {
  let found = inequalitiesIn(question);
  const fromKey = inequalitiesIn(keyAnswer);
  if (found.length < 3 && fromKey.length > found.length) found = fromKey;
  const ineqs = found.map(parseInequality).filter((q): q is Inequality => !!q);
  if (ineqs.length < 2 || !ineqs.some((q) => Math.abs(q.b) > 1e-9) || !ineqs.some((q) => Math.abs(q.a) > 1e-9)) return null;
  const big = 1e4;
  const R0 = feasibleRegion(ineqs, { x0: -big, x1: big, y0: -big, y1: big });
  if (R0.length < 3) return null;
  const xs = R0.map((p) => p.x), ys = R0.map((p) => p.y);
  if (Math.max(...xs.map(Math.abs), ...ys.map(Math.abs)) > big * 0.99) return null; // R is not closed: not a drawable answer
  // The axes reach a little past R and, where it is close, to where each line meets the axes.
  const reach = (vals: number[], intercepts: number[], up: boolean) => {
    const edge = up ? Math.max(...vals) : Math.min(...vals);
    const near = intercepts.filter((v) => (up ? v > edge && v <= edge * 2 + 2 : v < edge && v >= edge * 2 - 2));
    const far = near.length ? (up ? Math.max(...near) : Math.min(...near)) : edge;
    return up ? Math.max(far, edge + Math.abs(edge) * 0.15 + 1) : Math.min(far, edge - Math.abs(edge) * 0.15 - 1);
  };
  const xi = ineqs.filter((q) => Math.abs(q.a) > 1e-9).map((q) => q.c / q.a), yi = ineqs.filter((q) => Math.abs(q.b) > 1e-9).map((q) => q.c / q.b);
  const xMax = reach(xs, xi, true), yMax = reach(ys, yi, true);
  const xMin = Math.min(...xs) >= 0 ? 0 : reach(xs, xi, false), yMin = Math.min(...ys) >= 0 ? 0 : reach(ys, yi, false);
  const xStep = niceStep(xMax - xMin), yStep = niceStep(yMax - yMin);
  const box = { x0: Math.floor(xMin / xStep) * xStep, x1: Math.ceil(xMax / xStep) * xStep, y0: Math.floor(yMin / yStep) * yStep, y1: Math.ceil(yMax / yStep) * yStep };
  const R = feasibleRegion(ineqs, box);
  const objective = objectiveIn(question) ?? objectiveIn(keyAnswer);
  const labels = /x\s*(?:=|represents?|is|be)\s*(?:the\s+)?(?:number of\s+)?([a-z][a-z ]{2,24}?)(?=[,.;]| and\b)/i.exec(plain(question));
  const ylabels = /y\s*(?:=|represents?|is|be)\s*(?:the\s+)?(?:number of\s+)?([a-z][a-z ]{2,24}?)(?=[,.;]| and\b)/i.exec(plain(question));
  const spec: Spec = {
    type: "graph", title: "Answer: the region R",
    x: { min: box.x0, max: box.x1, step: xStep, label: labels ? `x (${labels[1].trim()})` : "x" },
    y: { min: box.y0, max: box.y1, step: yStep, label: ylabels ? `y (${ylabels[1].trim()})` : "y" },
    functions: [],
    inequalities: found.slice(0, 8).map((t) => t.replace(/≤/g, "<=").replace(/≥/g, ">=")),
    labelLines: true,
    corners: R.map((_, i) => String.fromCharCode(65 + i)).slice(0, 8),
    grid: true,
    ...(objective ? { objective } : {}),
  };
  return figureSchema.safeParse(spec).success ? spec : null;
}

// ───────────── Putting the figures into the key ─────────────

const fence = (spec: Spec) => `\`\`\`figure\n${JSON.stringify(spec)}\n\`\`\``;
const DRAWING = /\b(construct|draw|plot|sketch|shade|illustrate|indicate[^.]*shad|on the (?:same )?(?:axes|grid|diagram)|reflect|rotate|enlarge|translate)\b/i;

export interface AnswerFigures {
  content: string;
  added: string[];
  unreadable: number[];
  /** The figures made here (their JSON). They come from the question's own numbers, so the AI repair must leave them alone. */
  made: string[];
}

/** Adds the answer figures the key is missing. Pure: no AI call. */
export function addAnswerFigures(content: string): AnswerFigures {
  const parts = splitKey(content);
  if (!parts) return { content, added: [], unreadable: [], made: [] };
  const paper = questionsOf(parts.paper);
  let key = parts.key;
  const added: string[] = [];
  const unreadable: number[] = [];
  const made: string[] = [];

  for (const q of paper) {
    const kq = questionsOf(key).find((k) => k.n === q.n);
    if (!kq) continue;
    const have = figuresIn(kq.body).map((f) => String(f.type));
    const inQuestion = figuresIn(q.body);
    const inserts: { after: RegExp | null; spec: Spec; what: string }[] = [];

    // Venn: shade a region of the question's diagram.
    const venn = inQuestion.find((f) => f.type === "venn") as { sets?: ({ id: string } | string)[]; counts?: Record<string, number> } | undefined;
    if (venn?.sets && !have.includes("venn")) {
      const ids = venn.sets.map((s) => (typeof s === "string" ? s : s.id));
      for (const line of q.body.split("\n")) {
        const expr = shadeExpression(line, ids);
        if (!expr) continue;
        const counts = venn.counts && Object.values(venn.counts).some((v) => Number(v) !== 0) ? { counts: venn.counts } : {};
        // A set labelled with its own letter is drawn with the letter only ("F", not "F (F)").
        const sets = venn.sets.map((x) => (typeof x === "string" || !(x as { label?: string }).label || (x as { label?: string }).label === x.id ? (typeof x === "string" ? x : x.id) : x));
        inserts.push({ after: new RegExp(expr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*").replace(/′/g, "(?:′|'|\\\\prime|\\^\\{?\\\\prime\\}?)"), "i"), spec: { type: "venn", title: `Answer: ${expr} shaded`, sets, ...counts, shade: expr }, what: `Question ${q.n}: Venn diagram with ${expr} shaded` });
        break;
      }
    }
    // Venn: illustrate the survey.
    if (!venn && !have.includes("venn") && /venn diagram/i.test(q.body) && /illustrat|represent|show (?:this|the) information|draw a venn/i.test(q.body)) {
      const t = vennTotalsFrom(q.body);
      // Every region's number written in (worked out from the totals), as the learner must show it.
      const counts = t ? solveVenn(t.sets.map((x) => x.id), t.totals) : null;
      if (t && counts) inserts.push({ after: /venn/i, spec: { type: "venn", title: "Answer: the completed Venn diagram", sets: t.sets, counts, totals: t.totals }, what: `Question ${q.n}: completed Venn diagram` });
      else unreadable.push(q.n);
    }
    // Construction and loci.
    if (!have.includes("construction") && /construct\s+(?:a\s+|the\s+)?(?:triangle|△)/i.test(plain(q.body))) {
      const spec = constructionFrom(q.body);
      if (spec) inserts.push({ after: null, spec, what: `Question ${q.n}: construction with loci` });
      else unreadable.push(q.n);
    }
    const words = plain(q.body);
    // Inequalities and linear programming: the region R.
    const regionAsked = /linear programming|feasible|region\s+R\b|\bR\b[^.]*region|inequalit/i.test(words) && /\b(draw|shade|show|illustrate|represent|indicate|graph|grid|axes|plot)\b/i.test(words);
    if (!have.includes("graph") && regionAsked) {
      const spec = feasibleFrom(q.body, kq.body);
      if (spec) inserts.push({ after: null, spec, what: `Question ${q.n}: region R` });
      else unreadable.push(q.n);
    }
    // The other kinds of drawing, each with its own reader (answerReaders.ts): asked for → drawn, or left for the AI.
    const draws = /\b(draw|plot|construct|sketch|illustrate|represent|complete|copy|show)\b/i.test(words);
    const readers: { asked: boolean; done: boolean; read: () => Spec | null; what: string }[] = [
      { asked: draws && /\b(reflect|rotat|enlarg|translat|shear|stretch|dilat|half[- ]turn|quarter[- ]turn)/i.test(words), done: have.includes("plane"), read: () => transformationFrom(q.body, inQuestion), what: "transformation" },
      { asked: draws && /histogram|bar (?:chart|graph)|frequency polygon|cumulative frequency (?:curve|graph|polygon)|ogive|pie[- ]chart|line graph/i.test(words), done: have.some((h) => ["chart", "curve", "diagram"].includes(h)), read: () => statsFrom(q.body), what: "statistical chart" },
      { asked: draws && /tree diagram/i.test(words), done: have.includes("diagram") || have.includes("tree"), read: () => treeFrom(q.body), what: "tree diagram" },
      { asked: /arrow diagram|mapping diagram/i.test(words), done: have.includes("diagram"), read: () => arrowFrom(q.body), what: "arrow diagram" },
      { asked: draws && /bearing/i.test(words) && /scale drawing|\bdraw|\bsketch|diagram/i.test(words), done: have.includes("geometry"), read: () => bearingsFrom(q.body), what: "scale drawing" },
      { asked: draws && /(?:velocity|speed|distance)\s*[-–]\s*time|travel graph/i.test(words), done: have.includes("curve") || have.includes("graph"), read: () => travelFrom(q.body), what: "travel graph" },
      { asked: /graphical(?:ly)?|by drawing|draw the (?:lines|graphs of the (?:lines|equations))/i.test(words) && (words.match(/[xy]\s*[+-]\s*\d*\s*[xy]\s*=/g) ?? []).length >= 2, done: have.includes("graph"), read: () => linesFrom(q.body), what: "graphical solution" },
    ];
    for (const r of readers) {
      // A question may need more than one drawing (a travel graph in (a), a tree diagram in (b)), but one of each kind.
      if (!r.asked || r.done || inserts.some((x) => x.what.endsWith(r.what)) || inserts.some((x) => x.spec.type === "construction" || x.spec.type === "venn" && r.what !== "tree diagram")) continue;
      const spec = r.read();
      if (spec) inserts.push({ after: null, spec, what: `Question ${q.n}: ${r.what}` });
      else unreadable.push(q.n);
    }
    // Graph of a function: drawn, plotted or sketched (quadratic, cubic, line…).
    const curveAsked = /\b(draw|plot|sketch)\b[^.]*\b(graph|curve)\b|\bsketch\b[^.]*\b(y|f\s*\(\s*x\s*\))\s*=/i.test(words);
    if (!have.includes("graph") && !inserts.some((x) => ["graph", "curve", "plane"].includes(String(x.spec.type))) && curveAsked) {
      const paperGraph = inQuestion.map(completedGraph).find(Boolean);
      const spec = paperGraph ?? graphFrom(q.body);
      if (spec) inserts.push({ after: null, spec, what: `Question ${q.n}: graph` });
      else unreadable.push(q.n);
    }
    // Points to plot (coordinate geometry).
    if (!inserts.length && !have.length) {
      const spec = pointsFrom(q.body);
      if (spec) inserts.push({ after: null, spec, what: `Question ${q.n}: points plotted` });
    }
    // Any other drawing the key has no figure for (transformations, inequalities, …).
    if (!inserts.length && !have.length && !unreadable.includes(q.n) && DRAWING.test(plain(q.body)) && !inQuestion.some((f) => f.type === "graph" || f.type === "chart"))
      unreadable.push(q.n);
    if (!inserts.length) continue;

    // Into the key: after the line that matches, else right under the question heading.
    let body = kq.body;
    let underHeading = 0; // figures with no line to follow go under the heading, in the order of the parts
    for (const ins of inserts) {
      const lines = body.split("\n");
      let at = ins.after ? lines.findIndex((l, k) => k > 0 && ins.after!.test(plain(l))) : -1;
      const block = ["", ...fence(ins.spec).split("\n"), ""];
      if (at < 0) { at = underHeading; underHeading += block.length; }
      lines.splice(at + 1, 0, ...block);
      made.push(JSON.stringify(ins.spec));
      body = lines.join("\n");
      added.push(ins.what);
    }
    key = key.slice(0, kq.start) + body + key.slice(kq.end);
  }
  return { content: [parts.paper, key, parts.rest].filter(Boolean).join("\n\n"), added, unreadable: [...new Set(unreadable)], made };
}

// ───────────── The rest: one short AI call ─────────────

const DRAW_SYSTEM = (subject: string) => `You draw the answers in a ${subject} marking key. For each question given, write the figure of its complete, correct answer as the learner should draw it: every construction arc and locus, the plotted graph or the transformed shape, the shaded region, labelled.

Output, for each question in order, a line "### Question n" followed by exactly one \`\`\`figure block. Nothing else: no explanations, no notes, no thinking aloud.

${figureGuide(subject, "some")}`;

/** For drawing questions the server could not read: the model draws only those, in one short call. */
export async function drawMissingFigures(writer: Writer, content: string, numbers: number[], subject: string, signal?: AbortSignal): Promise<{ content: string; added: string[] }> {
  const parts = splitKey(content);
  if (!parts || !numbers.length) return { content, added: [] };
  const paper = questionsOf(parts.paper).filter((q) => numbers.includes(q.n));
  const keyQs = questionsOf(parts.key);
  if (!paper.length) return { content, added: [] };
  try {
    const reply = await writer.generate({
      system: DRAW_SYSTEM(subject),
      user: paper.map((q) => `QUESTION:\n${q.body.trim()}\n\nITS MARKING KEY:\n${(keyQs.find((k) => k.n === q.n)?.body ?? "").trim()}`).join("\n\n---\n\n"),
      signal,
      job: "figureRepair",
    });
    let key = parts.key;
    const added: string[] = [];
    for (const block of questionsOf(reply)) {
      const spec = figuresIn(block.body)[0];
      if (!spec || !figureSchema.safeParse(spec).success) continue;
      const kq = questionsOf(key).find((k) => k.n === block.n);
      if (!kq || !numbers.includes(block.n)) continue;
      const lines = kq.body.split("\n");
      lines.splice(1, 0, "", fence(spec), "");
      key = key.slice(0, kq.start) + lines.join("\n") + key.slice(kq.end);
      added.push(`Question ${block.n}: ${String(spec.type)}`);
    }
    return { content: [parts.paper, key, parts.rest].filter(Boolean).join("\n\n"), added };
  } catch (err) {
    if (isAbortError(err)) throw err;
    logError("draw-missing", err);
    return { content, added: [] };
  }
}
