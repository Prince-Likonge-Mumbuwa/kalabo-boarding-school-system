/**
 * After the AI has written an assessment: every ```figure block is read,
 * checked and given its worked-out answers (`_check`), before the document
 * is saved.
 *
 *   1. read every block (forgiving small JSON slips: curly quotes, trailing commas);
 *   2. if any block is broken or names something that does not exist, ask the
 *      AI once for small find-and-replace edits to fix those blocks;
 *   3. check again and write `_check` into each block (problems and answers),
 *      which the app shows to the teacher on screen only.
 *
 * Problems left after the repair stay visible to the teacher; the document is
 * still saved (it is the teacher's draft).
 */
import { z } from "zod";
import type { Writer } from "../ai/NemotronProvider.js";
import { logError } from "../../utils/errors.js";
import { checkFigure, type CheckContext } from "./check.js";
import { figureSchema, type FigureCheck } from "./spec.js";

const BLOCK = /```figure[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```/g;
const FIGURE_TYPES = ["graph", "chart", "diagram", "timeline", "tree", "map", "molecule", "image", "circle", "globe", "venn", "plane", "geometry", "solid", "scene", "climate", "population", "curve", "food-web", "genetic-cross", "construction"];

/**
 * The AI sometimes fences a figure as ```json or plain ``` instead of
 * ```figure; the app would then print the JSON as code. Renames those fences
 * when the block really is a figure description. Reads line by line so a
 * closing fence is never mistaken for an opening one.
 */
export function normaliseFigureFences(content: string): string {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const open = /^\s*```[ \t]*([\w-]*)[ \t]*\r?$/.exec(lines[i]);
    if (!open) continue;
    let end = i + 1;
    while (end < lines.length && !/^\s*```[ \t]*\r?$/.test(lines[end])) end++;
    if (end >= lines.length) break; // unclosed: leave it
    const lang = open[1].toLowerCase();
    if (lang === "" || lang === "json") {
      try {
        const data = readJson(lines.slice(i + 1, end).join("\n")) as { type?: unknown } | null;
        if (data && typeof data === "object" && FIGURE_TYPES.includes(String(data.type))) lines[i] = lines[i].replace(/```[ \t]*[\w-]*/, "```figure");
      } catch { /* ordinary code block */ }
    }
    i = end; // carry on after the closing fence
  }
  return lines.join("\n");
}

export const hasFigures = (content: string) => /```figure[ \t]*\r?\n/.test(normaliseFigureFences(content));

function readJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const fixed = text
      .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(fixed);
  }
}

interface Analysed {
  /** The block exactly as written (with its fences). */
  raw: string;
  /** Where the block starts in the document. */
  at: number;
  /** For a scene: what each letter on it marks (letter -> part name), from the catalog. */
  letters?: Record<string, string>;
  /** The block as it should be saved (with _check), or null if unreadable. */
  output: string | null;
  problems: string[];
  /** Problems the AI may be able to fix (everything except a missing library picture). */
  fixable: boolean;
}

/** A question starts at a numbered line ("6. At Chibombo…", "**7.**", "Question 7") or a heading. */
const QUESTION_START = /^(?:#{1,4}\s|\s*(?:\*\*)?(?:Question\s+)?\d{1,2}(?:\*\*)?[.)]\s)/gm;

/** The text of the question a figure sits in: from its number to the next question. */
export function questionAround(content: string, start: number, end: number): string {
  let from = 0;
  for (const m of content.slice(0, start).matchAll(QUESTION_START)) from = m.index ?? from;
  const rest = content.slice(end);
  QUESTION_START.lastIndex = 0;
  const next = rest.search(QUESTION_START);
  const to = next < 0 ? Math.min(rest.length, 2000) : next;
  return content.slice(Math.max(from, start - 2500), start) + "\n" + rest.slice(0, Math.min(to, 2000));
}

async function analyse(content: string, ctx: CheckContext): Promise<Analysed[]> {
  const out: Analysed[] = [];
  for (const m of content.matchAll(BLOCK)) {
    const raw = m[0];
    const at = m.index ?? 0;
    let data: unknown;
    try {
      data = readJson(m[1]);
    } catch (err) {
      out.push({ raw, at, output: null, problems: [`Not valid JSON: ${(err as Error).message}`], fixable: true });
      continue;
    }
    const parsed = figureSchema.safeParse(data);
    if (!parsed.success) {
      out.push({ raw, at, output: null, problems: [`The description does not fit the figure format: ${z.prettifyError(parsed.error).replace(/\n+/g, "; ")}`], fixable: true });
      continue;
    }
    const { spec, check } = await checkFigure(parsed.data, { ...ctx, text: questionAround(content, at, at + raw.length) });
    const saved: Record<string, unknown> & { _check?: FigureCheck } = { ...spec };
    if (check.problems || check.answers) saved._check = check;
    const letters = parsed.data.type === "scene" && check.answers
      ? Object.fromEntries(Object.entries(check.answers).filter(([k]) => /^[A-Z]{1,2}\d?$/.test(k)))
      : undefined;
    out.push({
      raw,
      at,
      letters,
      output: "```figure\n" + JSON.stringify(saved) + "\n```",
      problems: check.problems ?? [],
      fixable: Boolean(check.problems?.some((p) => !/diagram library|PubChem could not be reached/.test(p))),
    });
  }
  return out;
}

const REPAIR_SYSTEM = `You correct figure descriptions (\`\`\`figure JSON blocks) in a school test, using the problems a checker found.
Reply with JSON only, no other text: {"edits":[{"find":"...","replace":"..."}]}
- "find" is text copied EXACTLY from the document (short but unique, e.g. one "name" pair or one line); "replace" is its correction. To rewrite a whole block, "find" the whole block from \`\`\`figure to \`\`\`.
- Use only names that exist: take a "Did you mean" suggestion, or a better-known nearby place, lake, country or region.
- If you change what a letter marks, also correct the question text and the marking key that mention it.
- Keep valid JSON inside every block: double quotes, no comments, no trailing commas.
- Maths figures (circle, geometry, globe, venn, plane, solid, construction): the checker measured the figure. Make the figure and the question agree: move points ("at", "bearing", "angle", "distance") or change the numbers in the question, its marked angles and the marking key together. Inscribed angle = half its arc; a diameter joins points 180° apart.
- If a figure truly cannot be fixed, replace its block with a short written description the question can still use.`;

async function repair(content: string, broken: Analysed[], writer: Writer, signal?: AbortSignal): Promise<string> {
  const list = broken.map((b, i) => {
    const at = content.indexOf(b.raw);
    const before = content.slice(Math.max(0, at - 500), at).split("\n").slice(-6).join("\n");
    const after = content.slice(at + b.raw.length, at + b.raw.length + 400).split("\n").slice(0, 6).join("\n");
    return `FIGURE ${i + 1}\nProblems:\n- ${b.problems.join("\n- ")}\nQuestion text before it:\n"""\n${before}\n"""\nThe block:\n${b.raw}\nText after it:\n"""\n${after}\n"""`;
  }).join("\n\n");
  const reply = await writer.generate({ system: REPAIR_SYSTEM, user: `${list}\n\nWrite the edits.`, signal, job: "figureRepair" });
  const json = /\{[\s\S]*\}/.exec(reply)?.[0];
  if (!json) return content;
  let edits: { find?: unknown; replace?: unknown }[] = [];
  try { edits = (JSON.parse(json) as { edits?: typeof edits }).edits ?? []; } catch { return content; }
  let fixed = content;
  for (const e of edits) {
    if (typeof e.find !== "string" || typeof e.replace !== "string" || !e.find) continue;
    const first = fixed.indexOf(e.find);
    if (first < 0 || fixed.indexOf(e.find, first + 1) >= 0) continue; // missing or not unique: skip
    fixed = fixed.slice(0, first) + e.replace + fixed.slice(first + e.find.length);
  }
  return fixed;
}

// ─────────────── The marking key must agree with the lettered diagrams ───────────────

const STOP = new Set(["the", "of", "a", "an", "and", "or", "to", "in", "on", "with", "from", "for", "which", "that", "its", "is", "are", "part", "labelled"]);
const words = (s: string) => s.toLowerCase().replace(/[^a-z\s'-]/g, " ").split(/[\s'-]+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/(?:es|s)$/, ""));
/** "tendons (chordae tendineae)" -> "tendons": the name a key writes. */
const shortName = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, "").trim();
/** True when the key's words name the same part as the catalog answer (all the core words of one are in the other). */
function sameName(keyText: string, answer: string): boolean {
  const k = words(keyText), core = words(shortName(answer)), all = new Set(words(answer));
  if (!k.length || !core.length) return true;
  return core.every((w) => k.includes(w)) || k.slice(0, Math.max(1, core.length)).every((w) => all.has(w));
}
const QNUM = /^\s*(?:\|\s*)?(?:\*\*)?(?:Q(?:uestion)?\.?\s*)?(\d{1,2})(?:\*\*)?(?:\s*\([a-z]\))?[.):|\s]/gm;

export interface KeyFix { question: number; letter: string; was: string; now: string }

/**
 * Corrects the Marking Key where it names a lettered part of a scene
 * differently from the drawing (the drawing comes from the catalog, so it is
 * right). Looks only inside the key's entry for the question the figure is in.
 */
export function alignKeyWithFigures(content: string, analysed: Analysed[]): { content: string; fixes: KeyFix[] } {
  const keyStart = content.search(/^##\s*Marking Key/m);
  if (keyStart < 0) return { content, fixes: [] };
  const rest = content.slice(keyStart + 3);
  const nextHead = rest.search(/^##\s/m);
  const keyEnd = nextHead < 0 ? content.length : keyStart + 3 + nextHead;
  let key = content.slice(keyStart, keyEnd);
  const fixes: KeyFix[] = [];
  for (const a of analysed) {
    if (!a.letters || !Object.keys(a.letters).length || a.at >= keyStart) continue;
    let q = 0;
    for (const m of content.slice(0, a.at).matchAll(QNUM)) q = Number(m[1]);
    if (!q) continue;
    // The key's entry for question q: from its number to the next question's number.
    const marks = [...key.matchAll(QNUM)].map((m) => ({ n: Number(m[1]), i: m.index ?? 0 }));
    const first = marks.findIndex((m) => m.n === q);
    if (first < 0) continue;
    const next = marks.slice(first + 1).find((m) => m.n !== q);
    const from = marks[first].i, to = next ? next.i : key.length;
    let entry = key.slice(from, to);
    for (const [letter, answer] of Object.entries(a.letters)) {
      const re = new RegExp(`(^|[\\s(|*])${letter}(\\*\\*)?(\\s*(?:[-–—:=]|\\bis\\b|\\))\\s*(?:\\*\\*)?)([A-Za-z][A-Za-z ,'()/-]{1,60}?)(?=\\s*(?:\\[|\\(\\d|;|\\||\\*\\*|$|\\.\\s|,\\s*[A-Z]{1,2}\\s*[-–—:=]))`, "m");
      const m = re.exec(entry);
      if (!m) continue;
      const said = m[4].trim();
      if (sameName(said, answer)) continue;
      const now = shortName(answer);
      const right = /^[A-Z]/.test(said) ? now[0].toUpperCase() + now.slice(1) : now;
      entry = entry.slice(0, m.index) + m[1] + letter + (m[2] ?? "") + m[3] + right + entry.slice(m.index + m[0].length);
      fixes.push({ question: q, letter, was: said, now: right });
    }
    key = key.slice(0, from) + entry + key.slice(to);
  }
  return { content: content.slice(0, keyStart) + key + content.slice(keyEnd), fixes };
}

export interface FigureReport {
  content: string;
  figures: number;
  /** Figures that still have problems after the repair. */
  withProblems: number;
  repaired: boolean;
  /** Marking-key entries corrected to match lettered diagrams. */
  keyFixes?: KeyFix[];
}

/**
 * Checks, repairs (once, if `writer` is given) and annotates every figure.
 * `onStatus` reports progress to the browser.
 */
export async function processFigures(
  content: string,
  ctx: CheckContext,
  opts: { writer?: Writer; signal?: AbortSignal; onStatus?: (message: string) => void; keep?: string[] } = {},
): Promise<FigureReport> {
  content = normaliseFigureFences(content);
  let analysed = await analyse(content, ctx);
  if (!analysed.length) return { content, figures: 0, withProblems: 0, repaired: false };
  let repaired = false;
  // Figures the server built from the question's own numbers (answerFigures.ts) are never rewritten by the AI.
  const broken = analysed.filter((a) => a.fixable && !opts.keep?.some((k) => a.raw.includes(k)));
  if (broken.length && opts.writer) {
    opts.onStatus?.(`Fixing ${broken.length} figure${broken.length === 1 ? "" : "s"}…`);
    try {
      const fixed = await repair(content, broken, opts.writer, opts.signal);
      if (fixed !== content) {
        content = fixed;
        repaired = true;
        analysed = await analyse(content, ctx);
      }
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      logError("figure-repair", err);
    }
  }
  // Swap each block for its checked version (unreadable ones stay as written; the app says so).
  const aligned = alignKeyWithFigures(content, analysed);
  if (aligned.fixes.length) {
    content = aligned.content;
    analysed = await analyse(content, ctx); // positions moved
  }
  let out = content;
  for (const a of analysed) if (a.output) out = out.replace(a.raw, () => a.output!);
  return { content: out, figures: analysed.length, withProblems: analysed.filter((a) => a.problems.length || !a.output).length, repaired, keyFixes: aligned.fixes };
}
