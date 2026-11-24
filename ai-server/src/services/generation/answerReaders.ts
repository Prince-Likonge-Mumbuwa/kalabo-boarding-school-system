/**
 * More answer figures for Mathematics marking keys: each reader takes one
 * question and builds the figure of its complete, correct answer from the
 * question's own numbers. No AI call. Used by addAnswerFigures (answerFigures.ts).
 *
 *   transformationFrom  "Triangle ABC has vertices A(1, 1), B(3, 1), C(1, 4). Draw and label A1B1C1,
 *                        the image of ABC under a reflection in the line y = x …"
 *                        → a plane: the shape and every image asked for (reflect, rotate, enlarge,
 *                          translate, stretch, shear, matrix), each labelled.
 *   statsFrom           A frequency table, then "draw a histogram / bar chart / frequency polygon /
 *                        cumulative frequency curve / pie chart" → that chart, from the table.
 *   treeFrom            "A bag contains 5 red and 3 blue balls. Two are taken without replacement.
 *                        Draw a tree diagram" or two events with given probabilities
 *                        → the tree with every branch probability and each outcome's probability.
 *   arrowFrom           "f: x → 2x + 1, domain {1, 2, 3}. Draw an arrow diagram" / "the relation
 *                        'is a factor of' from A to B" → the arrow (mapping) diagram.
 *   bearingsFrom        "A ship sails from P on a bearing of 060° for 40 km to Q, then 150° for
 *                        30 km to R …" → the scale drawing with north lines and bearing angles.
 *   travelFrom          "starts from rest and accelerates uniformly to 20 m/s in 10 s, …" (velocity–
 *                        time), "travels 30 km in 1 hour, rests for 30 minutes, returns at …"
 *                        (distance–time), or a table of times and distances → the travel graph.
 *   linesFrom           "Solve graphically 2x + y = 7 and x − y = 2" → both lines and where they meet.
 *   pointsFrom          "Plot the points A(1, 2), B(5, 4) and C(3, 7) and join them" → the points on a grid.
 *
 * Each returns null when it cannot read the question; the question is then
 * drawn by one short AI call (drawMissingFigures).
 */
import { applyTransform, type Transform } from "../figures/figureMath.js";
import { figureSchema } from "../figures/spec.js";
import { plain } from "./answerFigures.js";

type Spec = Record<string, unknown>;
type Pt = { x: number; y: number };

const ok = (spec: Spec): Spec | null => (figureSchema.safeParse(spec).success ? spec : null);
const n = (s: string) => {
  const t = s.replace(/[−–]/g, "-").trim();
  const f = /^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(t);
  return f ? Number(f[1]) / Number(f[2]) : Number(t);
};
const NUM = String.raw`-?\d+(?:\.\d+)?`;
const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const count = (s: string) => WORD_NUM[s.toLowerCase()] ?? Number(s);
const niceStep = (span: number) => [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000].find((s) => span / s <= 12) ?? 2000;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Text with TeX column vectors and matrices written out: "(3, −2)" and "[[2, 0], [0, 1]]". */
function withMatrices(raw: string): string {
  return raw.replace(/\\begin\{[pbv]?matrix\}([\s\S]*?)\\end\{[pbv]?matrix\}/g, (_, body: string) => {
    const rows = body.split(/\\\\/).map((r) => r.split("&").map((c) => c.replace(/[{}$\s]/g, "").replace(/−/g, "-")).filter(Boolean));
    if (rows.length === 2 && rows.every((r) => r.length === 1)) return `(${rows[0][0]}, ${rows[1][0]})`;
    if (rows.length === 2 && rows.every((r) => r.length === 2)) return `[[${rows[0].join(", ")}], [${rows[1].join(", ")}]]`;
    return " ";
  });
}

/** The text of a question, ready to read: TeX out, vectors and matrices written out, minus signs plain. */
const words = (question: string) => plain(withMatrices(question)).replace(/[−–]/g, "-").replace(/\s+/g, " ");

/** Points written as "A(1, 2)" or "A (1; 2)". */
function namedPoints(text: string): Map<string, Pt> {
  const out = new Map<string, Pt>();
  for (const m of text.matchAll(new RegExp(String.raw`\b([A-Z](?:\d|′|')?)\s*\(\s*(${NUM})\s*[,;]\s*(${NUM})\s*\)`, "g")))
    if (!out.has(m[1])) out.set(m[1], { x: Number(m[2]), y: Number(m[3]) });
  return out;
}

const bounds = (pts: Pt[], pad = 1, fixed?: { x?: [number, number]; y?: [number, number] }) => {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const x0 = Math.min(0, Math.floor(Math.min(...xs) - pad)), x1 = Math.max(0, Math.ceil(Math.max(...xs) + pad));
  const y0 = Math.min(0, Math.floor(Math.min(...ys) - pad)), y1 = Math.max(0, Math.ceil(Math.max(...ys) + pad));
  return {
    x: fixed?.x && fixed.x[0] <= x0 && fixed.x[1] >= x1 ? fixed.x : [x0, x1] as [number, number],
    y: fixed?.y && fixed.y[0] <= y0 && fixed.y[1] >= y1 ? fixed.y : [y0, y1] as [number, number],
  };
};

/** "for −9 ≤ x ≤ 6 and −8 ≤ y ≤ 10" as given in the question. */
function axesRange(text: string): { x?: [number, number]; y?: [number, number] } {
  const out: { x?: [number, number]; y?: [number, number] } = {};
  for (const m of text.matchAll(new RegExp(String.raw`(${NUM})\s*(?:≤|<=|<)\s*([xy])\s*(?:≤|<=|<)\s*(${NUM})`, "g")))
    out[m[2] as "x" | "y"] = [Number(m[1]), Number(m[3])];
  return out;
}

// ───────────── Transformations ─────────────

const SHAPE_NAME = /\b(?:triangle|quadrilateral|square|rectangle|parallelogram|trapezium|kite|rhombus|shape|polygon|flag|figure|object|△|Δ)\s+([A-Z](?:\d|′|')?(?:[A-Z](?:\d|′|')?){2,5})\b/g;

function transformIn(part: string): Transform | null {
  const p = part;
  let m: RegExpExecArray | null;
  if (/translat/i.test(p)) {
    m = new RegExp(String.raw`\(\s*(${NUM})\s*,\s*(${NUM})\s*\)`).exec(p.slice(p.search(/translat/i)));
    if (m) return { type: "translate", vector: [Number(m[1]), Number(m[2])] };
  }
  if (/reflect/i.test(p)) {
    m = /reflect\w*[^.]*?\bin\s+(?:the\s+)?(?:line\s+|mirror line\s+)?(x-axis|y-axis|y\s*=\s*-?\s*x|y\s*=\s*-?\d+(?:\.\d+)?|x\s*=\s*-?\d+(?:\.\d+)?|y\s*=\s*-?\d*\s*x\s*[+-]\s*\d+)/i.exec(p);
    if (m) return { type: "reflect", line: m[1].replace(/\s+/g, " ").replace(/=\s*-\s*x/, "= -x") };
  }
  if (/rotat|half[- ]turn|quarter[- ]turn/i.test(p)) {
    const ang = /(\d+)\s*°|(\d+)\s*degrees|(half)[- ]turn|(quarter)[- ]turn/i.exec(p);
    if (ang) {
      let a = ang[3] ? 180 : ang[4] ? 90 : Number(ang[1] ?? ang[2]);
      if (/(?<!anti-?)clockwise/i.test(p) && !/anti-?clockwise/i.test(p)) a = -a;
      const c = new RegExp(String.raw`(?:about|centre|center)\s*(?:of rotation\s*)?(?:at\s+)?(?:the\s+)?(?:(origin)|\(\s*(${NUM})\s*,\s*(${NUM})\s*\))`, "i").exec(p);
      return { type: "rotate", angle: a, centre: c && !c[1] ? [Number(c[2]), Number(c[3])] : [0, 0] };
    }
  }
  if (/enlarg|dilat/i.test(p)) {
    const f = new RegExp(String.raw`(?:scale\s+)?factor\s*(?:of\s*)?(${NUM}(?:\s*/\s*\d+)?)`, "i").exec(p);
    const c = new RegExp(String.raw`(?:centre|center)\s*(?:of enlargement\s*)?(?:at\s+)?(?:the\s+)?(?:(origin)|\(\s*(${NUM})\s*,\s*(${NUM})\s*\))`, "i").exec(p);
    if (f) return { type: "enlarge", factor: n(f[1]), centre: c && !c[1] ? [Number(c[2]), Number(c[3])] : [0, 0] };
  }
  if (/stretch|shear/i.test(p)) {
    const kind = /shear/i.test(p) ? "shear" : "stretch";
    const f = new RegExp(String.raw`factor\s*(?:of\s*)?(${NUM}(?:\s*/\s*\d+)?)`, "i").exec(p);
    const inv = /\b([xy])-axis\s*(?:as\s+(?:the\s+)?|is\s+)?invariant|invariant\s+(?:line\s+)?(?:is\s+)?(?:the\s+)?([xy])-axis/i.exec(p);
    if (f && inv) return { type: kind, factor: n(f[1]), invariant: `${(inv[1] ?? inv[2]).toLowerCase()}-axis` as "x-axis" | "y-axis" };
  }
  if (/matrix/i.test(p)) {
    m = new RegExp(String.raw`\[\[\s*(${NUM})\s*,\s*(${NUM})\s*\]\s*,\s*\[\s*(${NUM})\s*,\s*(${NUM})\s*\]\]`).exec(p);
    if (m) return { type: "matrix", matrix: [[Number(m[1]), Number(m[2])], [Number(m[3]), Number(m[4])]] };
  }
  return null;
}

const corners = (name: string) => name.match(/[A-Z](?:\d|′|')?/g) ?? [];

/**
 * The plane with the shape and every image the question asks the learner to
 * draw. Images are named as the question names them ("A1B1C1", "T2"); the
 * app works them out exactly (figureMath.applyTransform).
 */
export function transformationFrom(question: string, paperFigures: Spec[]): Spec | null {
  const raw = withMatrices(question);
  const t = words(question);
  // The question's own plane, images hidden for the learner: the answer is the same plane with them drawn.
  const paperPlane = paperFigures.find((f) => f.type === "plane") as { images?: { hidden?: boolean }[]; shapes?: { name: string; vertices: [number, number][] }[] } & Spec | undefined;
  if (paperPlane?.images?.some((i) => i.hidden)) {
    const spec = { ...paperPlane, title: "Answer: the images", images: paperPlane.images.map((i) => ({ ...i, hidden: false })) };
    return ok(spec);
  }
  // The shapes: from the question's plane, or from the coordinates in the text.
  const shapes: { name: string; vertices: [number, number][] }[] = [...(paperPlane?.shapes ?? [])];
  const pts = namedPoints(raw.replace(/\\left|\\right/g, ""));
  if (!shapes.length) {
    const named = [...t.matchAll(SHAPE_NAME)].map((m) => m[1]).find((nm) => corners(nm).every((c) => pts.has(c)));
    const letters = named ? corners(named) : [...pts.keys()].filter((k) => !/\d|′|'/.test(k));
    if (letters.length < 3 || letters.length > 8) return null;
    shapes.push({ name: named ?? letters.join(""), vertices: letters.map((c) => [pts.get(c)!.x, pts.get(c)!.y]) });
  }
  // Each part that asks for a transformation adds one image.
  const known = new Map<string, [number, number][]>(shapes.map((s) => [s.name, s.vertices]));
  const images: { of: string; name: string; transform: Transform }[] = [];
  const parts = t.split(/\(\s*(?:[a-h]|i{1,3}|iv|v|vi{0,3})\s*\)|(?<=\.)\s+(?=[A-Z])/).filter((p) => p.trim());
  for (const part of parts) {
    if (!/\b(draw|plot|construct|show|sketch)\b|\bthe image\b|\bmapped\b|\bunder\b/i.test(part)) continue;
    const tr = transformIn(part);
    if (!tr) continue;
    // Of which shape: the one the part names (the latest image if it names none).
    const mentioned = [...known.keys()].filter((k) => new RegExp(String.raw`\b${k.replace(/[′']/g, "[′']")}(?![\d′'])`).test(part));
    const nameMatch = /\b(?:label(?:led)?(?:\s+it)?|onto|to|image\s+(?:is\s+)?|called|named|giving)\s+(?:(?:the\s+)?(?:triangle|quadrilateral|shape|flag|image)\s+)?([A-Z](?:\d|′|')+(?:[A-Z](?:\d|′|')+)*|[A-Z]\d)\b/.exec(part);
    const nameNew = nameMatch && !known.has(nameMatch[1]) ? nameMatch[1] : null;
    const of = mentioned.find((k) => k !== nameNew) ?? (images.length ? images[images.length - 1].name : shapes[0].name);
    const src = known.get(of);
    if (!src) continue;
    const name = nameNew ?? corners(shapes[0].name).map((c) => `${c[0]}${images.length + 1}`).join("");
    let verts: [number, number][];
    try { verts = src.map(([x, y]) => { const q = applyTransform(tr, { x, y }); return [q.x, q.y] as [number, number]; }); } catch { continue; }
    known.set(name, verts);
    images.push({ of, name, transform: tr });
  }
  if (!images.length) return null;
  const all = [...known.values()].flat().map(([x, y]) => ({ x, y }));
  const b = bounds(all, 1, axesRange(t));
  return ok({ type: "plane", title: "Answer: the shape and its images", x: { min: b.x[0], max: b.x[1] }, y: { min: b.y[0], max: b.y[1] }, grid: "paper", shapes, images });
}

// ───────────── Statistics: frequency tables and their charts ─────────────

interface Row { label: string; cells: string[] }

/** The Markdown tables in a question. */
function tablesIn(text: string): Row[][] {
  const tables: Row[][] = [];
  let cur: Row[] = [];
  for (const line of text.split("\n")) {
    if (/^\s*\|/.test(line)) {
      const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => plain(c).replace(/[−–]/g, "-").trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === "")) continue; // the separator row
      cur.push({ label: cells[0], cells: cells.slice(1) });
    } else if (cur.length) { tables.push(cur); cur = []; }
  }
  if (cur.length) tables.push(cur);
  return tables;
}

interface Freq { classes: string[]; freq: number[]; lo?: number[]; hi?: number[]; title: string }

/** A class like "10 – 19", "0 < x ≤ 10", "10 ≤ h < 20", "40-" or a single value. */
function classBounds(c: string): [number, number] | null {
  const m = new RegExp(String.raw`(${NUM})\s*(?:<|≤|<=)?\s*[a-zA-Z]?\s*(?:<|≤|<=|-|to)\s*(${NUM})`).exec(c.replace(/[−–]/g, "-"));
  return m ? [Number(m[1]), Number(m[2])] : null;
}

const FREQ_LABEL = /^(frequency|freq\.?|f|number of [a-z ]+|no\.? of [a-z ]+|pupils|learners|students)$/i;

/** A frequency table, read across (rows) or down (columns). */
function frequencyTable(text: string): Freq | null {
  for (const table of tablesIn(text)) {
    // Across: a row of classes, then a row of frequencies.
    if (table.length >= 2) {
      const fi = table.findIndex((r, i) => i > 0 && FREQ_LABEL.test(r.label) && r.cells.every((c) => /^\d+(\.\d+)?$/.test(c)));
      if (fi > 0) {
        const head = table[0];
        return build(head.cells, table[fi].cells.map(Number), head.label);
      }
    }
    // Down: a header row "Marks | Frequency", then one row per class.
    const head = table[0];
    if (head && head.cells.length >= 1) {
      const col = head.cells.findIndex((c) => FREQ_LABEL.test(c));
      if (col >= 0 && table.slice(1).every((r) => /^\d+(\.\d+)?$/.test(r.cells[col] ?? ""))) return build(table.slice(1).map((r) => r.label), table.slice(1).map((r) => Number(r.cells[col])), head.label);
    }
  }
  return null;

  function build(classes: string[], freq: number[], title: string): Freq | null {
    if (classes.length < 2 || classes.length !== freq.length || freq.some((f) => !Number.isFinite(f))) return null;
    const b = classes.map(classBounds);
    if (b.every(Boolean)) {
      // Whole-number classes like 10 – 19, 20 – 29 meet at 19.5.
      const gaps = b.slice(1).map((x, i) => x![0] - b[i]![1]);
      const half = gaps.length && gaps.every((g) => Math.abs(g - gaps[0]) < 1e-9) && gaps[0] > 0 && gaps[0] <= 1 ? gaps[0] / 2 : 0;
      return { classes, freq, lo: b.map((x) => x![0] - half), hi: b.map((x) => x![1] + half), title };
    }
    return { classes, freq, title };
  }
}

/** The chart a statistics question asks the learner to draw, from its table. */
export function statsFrom(question: string): Spec | null {
  const t = words(question);
  const ask = /\b(draw|construct|plot|represent|illustrate|sketch|show)\b/i.test(t);
  if (!ask) return null;
  const tab = frequencyTable(question);
  if (!tab) return null;
  const label = tab.title || "Class";
  const total = tab.freq.reduce((a, b) => a + b, 0);

  if (/cumulative frequency (?:curve|graph|polygon)|ogive/i.test(t)) {
    if (!tab.lo || !tab.hi) return null;
    let run = 0;
    const points: [number, number][] = [[r2(tab.lo[0]), 0], ...tab.hi.map((h, i) => [r2(h), (run += tab.freq[i])] as [number, number])];
    // Median and quartiles, read from the curve (straight-line interpolation).
    const read = (y: number) => {
      for (let i = 1; i < points.length; i++) if (points[i][1] >= y) { const [x0, y0] = points[i - 1], [x1, y1] = points[i]; return r2(x0 + ((y - y0) / (y1 - y0 || 1)) * (x1 - x0)); }
      return points[points.length - 1][0];
    };
    const marks = [{ y: total / 4, label: `LQ ≈ ${read(total / 4)}` }, { y: total / 2, label: `Median ≈ ${read(total / 2)}` }, { y: (3 * total) / 4, label: `UQ ≈ ${read((3 * total) / 4)}` }];
    return ok({ type: "curve", title: "Answer: cumulative frequency curve", x: { label, min: Math.floor(points[0][0]), max: Math.ceil(points[points.length - 1][0]), step: niceStep(points[points.length - 1][0] - points[0][0]) }, y: { label: "Cumulative frequency", min: 0, max: Math.ceil(total / niceStep(total)) * niceStep(total), step: niceStep(total) }, series: [{ points }], marks, smooth: true, grid: true });
  }
  if (/frequency polygon/i.test(t)) {
    if (!tab.lo || !tab.hi) return null;
    const w = tab.hi[0] - tab.lo[0];
    const mids = tab.lo.map((l, i) => r2((l + tab.hi![i]) / 2));
    const points: [number, number][] = [[r2(mids[0] - w), 0], ...mids.map((m, i) => [m, tab.freq[i]] as [number, number]), [r2(mids[mids.length - 1] + w), 0]];
    const top = Math.max(...tab.freq);
    return ok({ type: "curve", title: "Answer: frequency polygon", x: { label: `${label} (mid-points)`, min: Math.floor(points[0][0]), max: Math.ceil(points[points.length - 1][0]), step: niceStep(points[points.length - 1][0] - points[0][0]) }, y: { label: "Frequency", min: 0, max: Math.ceil(top / niceStep(top)) * niceStep(top) + niceStep(top), step: niceStep(top) }, series: [{ points }], smooth: false, grid: true });
  }
  if (/histogram/i.test(t)) {
    const widths = tab.lo && tab.hi ? tab.hi.map((h, i) => h - tab.lo![i]) : null;
    const equal = !widths || widths.every((w) => Math.abs(w - widths[0]) < 1e-9);
    if (equal) return ok({ type: "chart", kind: "histogram", title: "Answer: histogram", x: { label }, y: { label: "Frequency" }, categories: tab.classes, series: [{ values: tab.freq }] });
    // Unequal classes: bars as wide as the class, as tall as the frequency density (the outline of the bars).
    if (tab.classes.length > 9) return null;
    const dens = tab.freq.map((f, i) => r2(f / widths![i]));
    const top = Math.max(...dens);
    const ys = niceStep(top);
    const outline: [number, number][] = [];
    tab.lo!.forEach((l, i) => outline.push([l, 0], [l, dens[i]], [tab.hi![i], dens[i]], [tab.hi![i], 0]));
    const x0 = tab.lo![0], x1 = tab.hi![tab.hi!.length - 1];
    return ok({
      type: "curve", title: `Answer: histogram (frequency density = frequency ÷ class width: ${dens.join(", ")})`,
      x: { label, min: Math.floor(x0), max: Math.ceil(x1), step: niceStep(x1 - x0) },
      y: { label: "Frequency density", min: 0, max: Math.ceil(top / ys) * ys + ys, step: ys },
      series: [{ points: outline }], smooth: false, grid: true,
    });
  }
  if (/pie[- ]chart/i.test(t)) {
    const lines = tab.classes.map((c, i) => `  "${c.replace(/"/g, "")} (${r2((tab.freq[i] / total) * 360)}°)" : ${tab.freq[i]}`);
    return ok({ type: "diagram", title: "Answer: pie chart (angles = frequency ÷ total × 360°)", mermaid: `pie showData\n${lines.join("\n")}` });
  }
  if (/bar (?:chart|graph)|line graph/i.test(t)) {
    return ok({ type: "chart", kind: /line graph/i.test(t) ? "line" : "bar", title: `Answer: ${/line graph/i.test(t) ? "line graph" : "bar chart"}`, x: { label }, y: { label: "Frequency" }, categories: tab.classes, series: [{ values: tab.freq }], showValues: true });
  }
  return null;
}

// ───────────── Probability tree diagrams ─────────────

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
interface Frac { p: number; q: number }
const fr = (p: number, q: number): Frac => { const g = gcd(p, q) || 1; return { p: p / g, q: q / g }; };
const times = (a: Frac, b: Frac) => fr(a.p * b.p, a.q * b.q);
const ft = (f: Frac) => (f.q === 1 ? `${f.p}` : `${f.p}/${f.q}`);
/** A probability as a fraction: "0.3" → 3/10, "2/5" → 2/5. */
const asFrac = (s: string): Frac | null => {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(s.trim());
  if (m) return fr(Number(m[1]), Number(m[2]));
  const d = /^0?\.(\d{1,4})$/.exec(s.trim());
  return d ? fr(Number(d[1]), 10 ** d[1].length) : null;
};

const OPPOSITE: [RegExp, string, string][] = [
  [/\bpass/i, "Pass", "Fail"], [/\bwin/i, "Win", "Lose"], [/\brain/i, "Rain", "No rain"], [/\blate/i, "Late", "Not late"],
  [/\bhit/i, "Hit", "Miss"], [/\bdefective|faulty/i, "Faulty", "Good"], [/\bhead/i, "Head", "Tail"], [/\bscores?\b/i, "Score", "Miss"],
];

/** "Red", "Blue" … from "5 red and 3 blue balls"; or two events with their probabilities. */
export function treeFrom(question: string): Spec | null {
  const t = words(question);
  if (!/tree diagram/i.test(t) || !/\b(draw|construct|complete|copy|illustrate|show)\b/i.test(t)) return null;
  const draws = /\b(two|three|2|3)\b\s+(?:\w+\s+){0,3}(?:are|is)?\s*(?:drawn|picked|selected|taken|chosen|removed)/i.exec(t)
    ?? /\b(?:draws?|picks?|selects?|takes?|chooses?|removes?)\s+(two|three|2|3)\b/i.exec(t);
  const items = [...t.matchAll(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+([a-z]+)(?=\s+(?:and\s+\d+\s+[a-z]+\s+)?(?:balls?|beads?|marbles?|counters?|sweets?|pens?|discs?|cards?|buttons?|boys?|girls?|bulbs?|apples?|oranges?|mangoes|books?)|\s*(?:,|and)\s+\d+\s+[a-z]+\s+(?:balls?|beads?|marbles?|counters?|sweets?|pens?|discs?|cards?))/gi)]
    .map((m) => ({ n: count(m[1]), name: m[2][0].toUpperCase() + m[2].slice(1).toLowerCase() }))
    .filter((x, i, all) => x.n > 0 && !/^(the|of|are|is|balls?|and)$/i.test(x.name) && all.findIndex((y) => y.name === x.name) === i);
  const lines: string[] = ["flowchart LR", "  S(( ))"];
  let id = 0;
  const outcomes: string[] = [];
  if (items.length >= 2 && items.length <= 3) {
    const k = draws ? count(draws[1]) : 2;
    const replace = /without replacement|not replaced|does not replace|without replacing/i.test(t) ? false : /with replacement|is replaced|are replaced|replaces|put back|returned/i.test(t) ? true : null;
    if (replace === null || k < 2 || k > 3 || (k === 3 && items.length > 2)) return null;
    const grow = (node: string, left: { n: number; name: string }[], depth: number, path: string, prob: Frac) => {
      const total = left.reduce((a, b) => a + b.n, 0);
      for (const it of left) {
        if (!it.n || !total) continue;
        const p = fr(it.n, total);
        const me = `N${++id}`;
        const all = times(prob, p);
        const here = `${path}${it.name[0]}`;
        const leaf = depth === k;
        lines.push(`  ${node} -->|${ft(p)}| ${me}[${leaf ? `${it.name}: ${here}, ${ft(all)}` : it.name}]`);
        if (leaf) outcomes.push(`P(${here}) = ${ft(all)}`);
        else grow(me, left.map((x) => (x === it && !replace ? { ...x, n: x.n - 1 } : x)), depth + 1, here, all);
      }
    };
    grow("S", items, 1, "", fr(1, 1));
    return ok({ type: "diagram", title: `Answer: tree diagram (${replace ? "with" : "without"} replacement)`, mermaid: lines.join("\n") });
  }
  // Two independent events with given probabilities.
  const events = [...t.matchAll(/probability (?:that|of)\s+([^.,;]{3,60}?)\s+(?:is|=)\s+(\d+\s*\/\s*\d+|0?\.\d+)/gi)]
    .map((m) => ({ text: m[1], p: asFrac(m[2]) })).filter((e): e is { text: string; p: Frac } => !!e.p && e.p.p < e.p.q).slice(0, 2);
  if (events.length !== 2) return null;
  const names = events.map((e, i) => {
    const o = OPPOSITE.find(([re]) => re.test(e.text));
    const tag = String.fromCharCode(65 + i);
    return o ? [`${o[1]} ${i + 1}`, `${o[2]} ${i + 1}`] : [tag, `${tag}′`];
  });
  const not = (f: Frac) => fr(f.q - f.p, f.q);
  for (const [a, pa] of [[0, events[0].p], [1, not(events[0].p)]] as [number, Frac][]) {
    const me = `N${++id}`;
    lines.push(`  S -->|${ft(pa)}| ${me}[${names[0][a]}]`);
    for (const [b, pb] of [[0, events[1].p], [1, not(events[1].p)]] as [number, Frac][]) {
      const leaf = `N${++id}`;
      lines.push(`  ${me} -->|${ft(pb)}| ${leaf}[${names[1][b]}: ${ft(times(pa, pb))}]`);
    }
  }
  return ok({ type: "diagram", title: "Answer: tree diagram", mermaid: lines.join("\n") });
}

// ───────────── Arrow (mapping) diagrams ─────────────

const RELATIONS: [RegExp, (a: number, b: number) => boolean][] = [
  [/is a factor of|divides/i, (a, b) => a !== 0 && b % a === 0],
  [/is a multiple of/i, (a, b) => b !== 0 && a % b === 0],
  [/is less than|is smaller than/i, (a, b) => a < b],
  [/is greater than|is bigger than|is more than/i, (a, b) => a > b],
  [/is the square of/i, (a, b) => a === b * b],
  [/is the square root of/i, (a, b) => a * a === b],
  [/is half of/i, (a, b) => 2 * a === b],
  [/is (?:double|twice)/i, (a, b) => a === 2 * b],
  [/is one more than/i, (a, b) => a === b + 1],
  [/is one less than/i, (a, b) => a === b - 1],
];

const setIn = (text: string, letter: string) => {
  const m = new RegExp(String.raw`\b${letter}\s*=\s*\{([^}]*)\}`).exec(text);
  return m ? m[1].split(/[,;]/).map((x) => x.trim()).filter(Boolean).map(Number).filter(Number.isFinite) : null;
};

export function arrowFrom(question: string): Spec | null {
  const raw = question.replace(/\\\{/g, "{").replace(/\\\}/g, "}").replace(/\\mapsto|\\to|\\rightarrow|→/g, "→");
  const t = plain(raw.replace(/\{/g, "⟨").replace(/\}/g, "⟩")).replace(/⟨/g, "{").replace(/⟩/g, "}").replace(/[−–]/g, "-");
  if (!/arrow diagram|mapping diagram/i.test(t)) return null;
  const sets = [...t.matchAll(/\b([A-Z])\s*=\s*\{([^}]*)\}/g)].map((m) => ({ id: m[1], items: m[2].split(/[,;]/).map((x) => x.trim()).filter(Boolean) }));
  let domain: string[] | null = null, codomain: string[] | null = null;
  const pairs: [string, string][] = [];
  const fn = /\b([a-z])\s*:\s*x\s*→\s*([-+*/^().\dx\s]+?)(?=[,.;]|\s+(?:for|where|with|on|and|from)\b|$)/.exec(t) ?? /\b([a-z])\s*\(\s*x\s*\)\s*=\s*([-+*/^().\dx\s]+?)(?=[,.;]|\s+(?:for|where|with|on|and|from)\b|$)/.exec(t);
  if (fn) {
    const dom = /domain\s*(?:is\s*)?(?:\{([^}]*)\}|([A-Z])\b)/i.exec(t);
    domain = dom?.[1] ? dom[1].split(/[,;]/).map((x) => x.trim()).filter(Boolean) : dom?.[2] ? sets.find((s) => s.id === dom[2])?.items ?? null : sets[0]?.items ?? null;
    if (!domain) return null;
    const expr = fn[2].trim().replace(/(\d)\s*x/g, "$1*x").replace(/(\d|x)\s*\(/g, "$1*(").replace(/\^/g, "**");
    if (!/^[-+*/().\dx\s]+$/.test(expr)) return null;
    let f: (x: number) => number;
    try { f = new Function("x", `return (${expr});`) as (x: number) => number; } catch { return null; }
    for (const d of domain) { const v = f(Number(d)); if (!Number.isFinite(v)) return null; pairs.push([d, String(r2(v))]); }
    codomain = [...new Set(pairs.map((p) => p[1]))];
  } else {
    const rel = RELATIONS.find(([re]) => re.test(t));
    if (!rel || sets.length < 1) return null;
    domain = sets[0].items; codomain = (sets[1] ?? sets[0]).items;
    for (const a of domain) for (const b of codomain) if (rel[1](Number(a), Number(b))) pairs.push([a, b]);
  }
  if (!domain.length || !codomain.length || domain.length > 10 || codomain.length > 10) return null;
  const left = sets[0]?.id ?? "Domain", right = sets[1]?.id ?? (fn ? "Range" : left);
  const L = domain.map((d, i) => `    L${i}[${d}]`), R = codomain.map((c, i) => `    R${i}[${c}]`);
  const arrows = pairs.map(([a, b]) => `  L${domain!.indexOf(a)} --> R${codomain!.indexOf(b)}`);
  return ok({ type: "diagram", title: "Answer: arrow diagram", mermaid: `flowchart LR\n  subgraph X[${left}]\n    direction TB\n${L.join("\n")}\n  end\n  subgraph Y[${right}]\n    direction TB\n${R.join("\n")}\n  end\n${arrows.join("\n")}` });
}

// ───────────── Bearings and scale drawing ─────────────

/** Each leg "from P on a bearing of 060° for 40 km to Q", in order. */
export function bearingsFrom(question: string): Spec | null {
  const t = words(question).replace(/\bN\s*(\d+)\s*°\s*E\b/g, "$1°");
  if (!/bearing/i.test(t) || !/\b(draw|scale drawing|sketch|construct|diagram)\b/i.test(t)) return null;
  const sentences = t.split(/(?<=[.;])\s+|,\s*(?:then|and then)\s+|\s+then\s+/i);
  const legs: { from: string; to: string; bearing: number; distance: number }[] = [];
  let last: string | null = null;
  const letter = (s: string) => [...s.matchAll(/(?:^|[^A-Za-z])([A-Z])(?![A-Za-z(])/g)].map((m) => m[1]).filter((c, i) => !(c === "A" && i === 0 && /^\s*A\s+[a-z]/.test(s)));
  for (const s of sentences) {
    const b = /bearing\s+of\s+(\d{1,3})(?:\s*°|\s*degrees)?/i.exec(s);
    const d = /(\d+(?:\.\d+)?)\s*(km|m|metres|meters|nautical miles|nm|miles)\b/i.exec(s);
    if (!b || !d) continue;
    const ls = letter(s);
    let from: string | null = null, to: string | null = null;
    const ft = /\bfrom\s+(?:\w+\s+){0,2}?([A-Z])\b[^.]*?\bto\s+(?:\w+\s+){0,2}?([A-Z])\b/.exec(s);
    const isFrom = /\b([A-Z])\s+is\b[^.]*?\bfrom\s+([A-Z])\b/.exec(s);
    if (isFrom) { from = isFrom[2]; to = isFrom[1]; }
    else if (ft) { from = ft[1]; to = ft[2]; }
    else if (ls.length >= 2) { from = ls[0]; to = ls[1]; }
    else if (ls.length === 1 && last) { from = last; to = ls[0]; }
    if (!from || !to || from === to) continue;
    legs.push({ from, to, bearing: Number(b[1]) % 360, distance: Number(d[1]) });
    last = to;
  }
  if (!legs.length) return null;
  // Real distances: the app fits the drawing to the page and measures it (lengths and bearings for the key).
  const unit = /(\d+(?:\.\d+)?)\s*(km|m|metres|meters|nautical miles|nm|miles)\b/i.exec(t)?.[2] ?? "";
  const points: Spec[] = [{ id: legs[0].from, x: 0, y: 0 }];
  const placed = new Set([legs[0].from]);
  for (const l of legs) {
    if (!placed.has(l.from) || placed.has(l.to)) continue;
    points.push({ id: l.to, from: l.from, bearing: l.bearing, distance: l.distance });
    placed.add(l.to);
  }
  if (points.length < 2) return null;
  return ok({
    type: "geometry", title: "Answer: scale drawing",
    points,
    sides: legs.filter((l) => placed.has(l.from) && placed.has(l.to)).map((l) => ({ from: l.from, to: l.to, label: `${l.distance} ${unit}`.trim() })),
    north: [...new Set(legs.map((l) => l.from))].slice(0, 6),
    angles: legs.slice(0, 12).map((l) => ({ at: l.from, arms: ["north", l.to], label: `${String(l.bearing).padStart(3, "0")}°` })),
    // The distance and bearing between the ends, which these questions ask for; the app measures them for the key.
    ...(points.length >= 3 ? { find: [`length ${points[0].id}${points[points.length - 1].id}`, `bearing of ${points[points.length - 1].id} from ${points[0].id}`, `bearing of ${points[0].id} from ${points[points.length - 1].id}`] } : {}),
  });
}

// ───────────── Travel graphs ─────────────

const SECONDS: Record<string, number> = { s: 1, sec: 1, secs: 1, second: 1, seconds: 1, min: 60, mins: 60, minute: 60, minutes: 60, h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600 };

/** Velocity–time from a story, distance–time from a story or a table. */
export function travelFrom(question: string): Spec | null {
  const t = words(question);
  if (!/\b(draw|sketch|plot|construct)\b/i.test(t)) return null;
  if (/(velocity|speed)[- –]time/i.test(t)) return velocityTime(t);
  if (/distance[- –]time|travel graph/i.test(t)) return distanceTime(question, t);
  return null;
}

function velocityTime(t: string): Spec | null {
  const unitV = /(m\/s|km\/h|ms-1|m s-1|kmh-1)/i.exec(t)?.[1] ?? "m/s";
  let v = /from rest|starts? at rest|stationary/i.test(t) ? 0 : Number(/(?:starts?|initially|moving|travelling)\s+(?:at|with)\s+(?:a (?:speed|velocity) of\s+)?(\d+(?:\.\d+)?)/i.exec(t)?.[1] ?? 0);
  let time = 0;
  let unitT = "s";
  const pts: [number, number][] = [[0, v]];
  const step = new RegExp(String.raw`(?:(?:to|reach(?:es|ing)?|reaches a (?:speed|velocity) of)\s+(\d+(?:\.\d+)?)\s*(?:m\/s|km\/h|ms-1|m s-1)?\s+in\s+(\d+(?:\.\d+)?)\s*(s|secs?|seconds?|mins?|minutes?|h|hrs?|hours?)\b)|(?:(?:constant|steady|uniform|same|this)\s+(?:speed|velocity)[^.;]*?\bfor\s+(?:a(?:nother)?\s+(?:further\s+)?)?(\d+(?:\.\d+)?)\s*(s|secs?|seconds?|mins?|minutes?|h|hrs?|hours?)\b)|(?:for\s+(?:a(?:nother)?\s+)?(?:further\s+)?(\d+(?:\.\d+)?)\s*(s|secs?|seconds?|mins?|minutes?|h|hrs?|hours?)\s+at\s+(?:this|that|a constant|constant|the same)\s+(?:speed|velocity))|(?:(?:to rest|comes? to (?:a )?(?:rest|stop)|stops?)\s+in\s+(?:a(?:nother)?\s+)?(?:further\s+)?(\d+(?:\.\d+)?)\s*(s|secs?|seconds?|mins?|minutes?|h|hrs?|hours?)\b)|(?:(?:decelerat|retard)\w*[^.;]*?\bin\s+(\d+(?:\.\d+)?)\s*(s|secs?|seconds?|mins?|minutes?|h|hrs?|hours?)\b[^.;]*?\b(?:rest|stop))`, "gi");
  for (const m of t.matchAll(step)) {
    if (m[1]) { time += Number(m[2]); v = Number(m[1]); unitT = m[3]; }
    else if (m[4]) { time += Number(m[4]); unitT = m[5]; }
    else if (m[6]) { time += Number(m[6]); unitT = m[7]; }
    else if (m[8]) { time += Number(m[8]); v = 0; unitT = m[9]; }
    else if (m[10]) { time += Number(m[10]); v = 0; unitT = m[11]; }
    pts.push([time, v]);
  }
  if (pts.length < 3) return null;
  const vmax = Math.max(...pts.map((p) => p[1])), tmax = time;
  const area = pts.slice(1).reduce((s, p, i) => s + ((p[1] + pts[i][1]) / 2) * (p[0] - pts[i][0]), 0);
  const unit = SECONDS[unitT.toLowerCase()] === 1 ? "s" : SECONDS[unitT.toLowerCase()] === 60 ? "min" : "h";
  return ok({
    type: "curve", title: `Answer: velocity–time graph (area under it = distance = ${r2(area)}${unitV === "m/s" && unit === "s" ? " m" : ""})`,
    x: { label: `Time (${unit})`, min: 0, max: Math.ceil(tmax / niceStep(tmax)) * niceStep(tmax), step: niceStep(tmax) },
    y: { label: `Velocity (${unitV})`, min: 0, max: Math.ceil(vmax / niceStep(vmax)) * niceStep(vmax) + niceStep(vmax), step: niceStep(vmax) },
    series: [{ points: pts }], smooth: false, grid: true,
  });
}

function distanceTime(question: string, t: string): Spec | null {
  // A table of times and distances.
  for (const table of tablesIn(question)) {
    const timeRow = table.find((r) => /time/i.test(r.label)), distRow = table.find((r) => /distance/i.test(r.label));
    if (timeRow && distRow && timeRow.cells.length === distRow.cells.length && timeRow.cells.length >= 2) {
      const pts = timeRow.cells.map((c, i) => [Number(c), Number(distRow.cells[i])] as [number, number]);
      if (pts.some((p) => p.some((v) => !Number.isFinite(v)))) break;
      const tm = Math.max(...pts.map((p) => p[0])), dm = Math.max(...pts.map((p) => p[1]));
      return ok({ type: "curve", title: "Answer: distance–time graph", x: { label: timeRow.label, min: 0, max: Math.ceil(tm / niceStep(tm)) * niceStep(tm), step: niceStep(tm) }, y: { label: distRow.label, min: 0, max: Math.ceil(dm / niceStep(dm)) * niceStep(dm), step: niceStep(dm) }, series: [{ points: pts }], smooth: false, grid: true });
    }
  }
  // A story: "travels 30 km in 1 hour", "rests for 30 minutes", "returns at 15 km/h".
  let time = 0, dist = 0;
  const pts: [number, number][] = [[0, 0]];
  const hours = (v: string, u: string) => (Number(v) * (SECONDS[u.toLowerCase()] ?? 3600)) / 3600;
  const step = /(?:(?:travels?|cycles?|drives?|walks?|runs?|covers?|goes)\s+(\d+(?:\.\d+)?)\s*km\s+in\s+(\d+(?:\.\d+)?)\s*(mins?|minutes?|h|hrs?|hours?))|(?:(?:rests?|stops?|stays?|waits?|stationary)\s+(?:there\s+)?for\s+(\d+(?:\.\d+)?)\s*(mins?|minutes?|h|hrs?|hours?))|(?:returns?\s+(?:home\s+|back\s+|to\s+\w+\s+)?(?:at\s+(?:a\s+(?:constant\s+|steady\s+)?speed\s+of\s+)?(\d+(?:\.\d+)?)\s*km\/h|in\s+(\d+(?:\.\d+)?)\s*(mins?|minutes?|h|hrs?|hours?)))|(?:(?:at\s+)?(?:a\s+)?(?:constant\s+|steady\s+|average\s+|uniform\s+)?(?:speed\s+of\s+)?(\d+(?:\.\d+)?)\s*km\/h\s+for\s+(\d+(?:\.\d+)?)\s*(mins?|minutes?|h|hrs?|hours?))/gi;
  for (const m of t.matchAll(step)) {
    if (m[1]) { time += hours(m[2], m[3]); dist += Number(m[1]); }
    else if (m[4]) time += hours(m[4], m[5]);
    else if (m[6]) { time += dist / Number(m[6]); dist = 0; }
    else if (m[7]) { time += hours(m[7], m[8]); dist = 0; }
    else if (m[9]) { const h = hours(m[10], m[11]); time += h; dist += Number(m[9]) * h; }
    pts.push([r2(time), r2(dist)]);
  }
  if (pts.length < 3) return null;
  const dm = Math.max(...pts.map((p) => p[1]));
  // Average speed = total distance ÷ total time (out and back: the distance both ways).
  const travelled = pts.slice(1).reduce((sum, p, i) => sum + Math.abs(p[1] - pts[i][1]), 0);
  return ok({ type: "curve", title: `Answer: distance–time graph (average speed = ${r2(travelled)} km ÷ ${r2(time)} h = ${r2(travelled / time)} km/h)`, x: { label: "Time (hours)", min: 0, max: Math.ceil(time), step: time > 6 ? 1 : 0.5 }, y: { label: "Distance (km)", min: 0, max: Math.ceil(dm / niceStep(dm)) * niceStep(dm), step: niceStep(dm) }, series: [{ points: pts }], smooth: false, grid: true });
}

// ───────────── Straight lines: graphical simultaneous equations ─────────────

/** "2x + y = 7" → "7 - 2*x"; "x = 3" is a vertical line. */
function lineOf(eq: string): { expr?: string; x?: number; label: string } | null {
  const m = new RegExp(String.raw`^\s*(${NUM})?\s*(?:\*\s*)?([xy])\s*([+-])\s*(${NUM})?\s*(?:\*\s*)?([xy])\s*=\s*(${NUM})\s*$`).exec(eq);
  if (m && m[2] !== m[5]) {
    const c1 = m[1] === undefined ? 1 : m[1] === "-" ? -1 : Number(m[1]);
    const c2 = (m[3] === "-" ? -1 : 1) * (m[4] === undefined ? 1 : Number(m[4]));
    const [a, b] = m[2] === "x" ? [c1, c2] : [c2, c1];
    const c = Number(m[6]);
    if (!b) return a ? { x: c / a, label: `x = ${r2(c / a)}` } : null;
    return { expr: `${r2(c / b)} - ${r2(a / b)}*x`.replace("- -", "+ "), label: eq.replace(/\s+/g, " ").trim() };
  }
  const v = new RegExp(String.raw`^\s*x\s*=\s*(${NUM})\s*$`).exec(eq);
  if (v) return { x: Number(v[1]), label: `x = ${v[1]}` };
  return null;
}

export function linesFrom(question: string): Spec | null {
  const t = words(question);
  if (!/graphical(?:ly)?|graphs? of the (?:lines|equations)|by drawing|draw the lines|on the same axes/i.test(t)) return null;
  const eqs = [...t.matchAll(new RegExp(String.raw`(?:${NUM}\s*)?[xy]\s*[+-]\s*(?:${NUM}\s*)?[xy]\s*=\s*${NUM}`, "g"))].map((m) => m[0]);
  const lines = [...new Set(eqs)].map(lineOf).filter((l): l is NonNullable<ReturnType<typeof lineOf>> => !!l && !!l.expr).slice(0, 4);
  if (lines.length < 2) return null;
  // Where the first two meet.
  const f = (e: string) => (x: number) => Function("x", `return ${e};`)(x) as number;
  const [g, h] = [f(lines[0].expr!), f(lines[1].expr!)];
  const s0 = g(0) - h(0), s1 = g(1) - h(1);
  if (Math.abs(s1 - s0) < 1e-12) return null; // parallel
  const x = r2(-s0 / (s1 - s0)), y = r2(g(x));
  const ys = [y, g(x - 4), g(x + 4), h(x - 4), h(x + 4)];
  const range = axesRange(t);
  const xr = range.x ?? [Math.floor(Math.min(0, x - 4)), Math.ceil(Math.max(0, x + 4))];
  const yr = range.y ?? [Math.floor(Math.min(0, ...ys)), Math.ceil(Math.max(0, ...ys))];
  return ok({
    type: "graph", title: `Answer: the lines meet at (${x}, ${y}), so x = ${x}, y = ${y}`,
    x: { min: xr[0], max: xr[1], label: "x", step: niceStep(xr[1] - xr[0]) }, y: { min: yr[0], max: yr[1], label: "y", step: niceStep(yr[1] - yr[0]) },
    functions: lines.map((l) => ({ expr: l.expr!, label: l.label })), points: [{ x, y, label: `(${x}, ${y})` }], grid: true,
  });
}

// ───────────── Plotting points ─────────────

export function pointsFrom(question: string): Spec | null {
  const raw = withMatrices(question);
  const t = words(question);
  if (!/\bplot\b|\bmark\b[^.]*\bpoints?\b|draw (?:and label )?(?:the )?(?:triangle|quadrilateral|line segment|points)/i.test(t)) return null;
  if (/transformation|reflect|rotat|enlarg|translat|shear|stretch/i.test(t)) return null;
  const pts = namedPoints(raw);
  if (pts.size < 2 || pts.size > 12) return null;
  const list = [...pts.entries()];
  const join = /\bjoin|triangle|quadrilateral|polygon|line segment|the line [A-Z]{2}\b/i.test(t);
  const b = bounds(list.map(([, p]) => p), 1, axesRange(t));
  const segments = join ? list.map(([id], i) => ({ from: id, to: list[(i + 1) % list.length][0] })).slice(0, list.length === 2 ? 1 : list.length) : [];
  return ok({ type: "plane", title: "Answer: the points plotted", grid: "paper", x: { min: b.x[0], max: b.x[1] }, y: { min: b.y[0], max: b.y[1] }, points: list.map(([id, p]) => ({ id, x: p.x, y: p.y, coords: true })), segments });
}
