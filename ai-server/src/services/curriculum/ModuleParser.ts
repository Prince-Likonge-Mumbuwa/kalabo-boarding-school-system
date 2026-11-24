/**
 * Reads a CDC teaching module (for example "Computer Science Teaching Module
 * – Form 2") into a structured guide the generators can use.
 *
 * A syllabus says WHAT to teach (topic, sub-topic, specific competence,
 * expected standard). A teaching module says HOW: for every sub-topic it
 * gives numbered learning activities, and for each activity the learning
 * environment (natural / artificial / technological), the teaching and
 * learning materials, suggested teaching methods, "How to Conduct" steps
 * and a content tip. Each topic also has an overview, general competences,
 * a hook and key terms, and ends with a formative and a summative CBC
 * assessment (a scenario plus a 4-level rubric: Exceeding 4, Meeting 3,
 * Approaching 2, Beginning 1). Separators like "TERM ONE" say which term
 * each topic is taught in.
 *
 * The reader works on the positioned text pieces (PDFProcessor.extractItems),
 * because the rubrics and the general-competence lists are tables and the
 * column a piece sits in says what it is.
 *
 * Everything is best effort: whatever the reader is unsure of goes into
 * `warnings`, which the superAdmin console shows.
 */
import type { PageItems, TextItem } from "../rag/PDFProcessor.js";

export interface ModuleRubricRow {
  criterion: string;
  /** Exceeding (4), Meeting (3), Approaching (2), Beginning (1), in that order. */
  levels: [string, string, string, string];
}

export interface ModuleAssessment {
  scenario: string;
  /** The numbered questions or tasks under the scenario. */
  tasks: string[];
  rubric: ModuleRubricRow[];
}

export interface ModuleActivity {
  number: number;
  title: string;
  /** Background notes printed before the activity's set-up (Term 3 modules have them). */
  background: string;
  environment: { natural: string[]; artificial: string[]; technological: string[] };
  materials: string[];
  methods: string[];
  howToConduct: string;
  learningPoints: string[];
  contentTip: string;
  /** Teaching notes printed after the content tip (tables of examples and the like). */
  notes: string;
  page: number;
}

export interface ModuleSubTopic {
  code: string; // 2.1.1
  name: string;
  introduction: string;
  competences: { code: string; text: string }[];
  activities: ModuleActivity[];
  expectedStandards: string[];
  formative: ModuleAssessment | null;
  summative: ModuleAssessment | null;
  pages: [number, number];
}

export interface ModuleTopic {
  code: string; // 2.1
  name: string;
  /** 1, 2 or 3 when the module says which term ("TERM ONE"); null otherwise. */
  term: number | null;
  overview: string;
  generalCompetences: { name: string; description: string }[];
  hook: string;
  keyTerms: { term: string; meaning: string }[];
  subTopics: ModuleSubTopic[];
  summary: string[];
  pages: [number, number];
}

export interface ParsedModule {
  /** "Computer Science Teaching Module – Form 2" as printed in the running header. */
  title: string;
  form: number | null;
  year: string | null;
  topics: ModuleTopic[];
  warnings: string[];
}

// ── Lines ───────────────────────────────────────────────────────────────────

interface Cell {
  x: number;
  end: number;
  text: string;
}

interface Line {
  page: number;
  y: number;
  height: number;
  cells: Cell[];
  text: string;
}

/** Running headers and footers, repeated on every page. */
const FURNITURE = [
  /teaching module\s*[–-]\s*form \d+\s*\|/i,
  /^form \d+\s*[–-]\s*(term \d+\s*)?secondary education$/i,
  /^\d{1,3}$/,
];

/**
 * Pieces on one page grouped into lines (same baseline), left to right. Two
 * pieces touching each other ("navi" + "gates") join without a space; pieces
 * far apart become separate cells (table columns).
 */
function linesOf(page: PageItems): Line[] {
  // Space-only pieces are dropped: some are drawn as wide boxes that would bridge two table columns.
  const items = page.items.filter((i) => i.str.trim()).slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: TextItem[][] = [];
  for (const item of items) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - item.y) <= 2) row.push(item);
    else rows.push([item]);
  }
  const lines: Line[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    const cells: Cell[] = [];
    for (const item of row) {
      const cell = cells[cells.length - 1];
      const gap = cell ? item.x - cell.end : Infinity;
      // Pieces of one line of text are at most a space apart; a wider gap is the next table column.
      if (cell && gap < 6) {
        // Touching pieces are one word; a small gap is a space.
        cell.text += (gap > 1.2 && !cell.text.endsWith(" ") && !item.str.startsWith(" ") ? " " : "") + item.str;
        cell.end = Math.max(cell.end, item.x + item.width);
      } else cells.push({ x: item.x, end: item.x + item.width, text: item.str });
    }
    for (const c of cells) c.text = c.text.replace(/\s+/g, " ").trim();
    const kept = cells.filter((c) => c.text);
    if (!kept.length) continue;
    const text = kept.map((c) => c.text).join(" ");
    if (FURNITURE.some((f) => f.test(text))) continue;
    lines.push({ page: page.pageNumber, y: row[0].y, height: Math.max(...row.map((i) => i.height || 10)), cells: kept, text });
  }
  return lines;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Bullet and icon glyphs the modules print before lines and headings. */
const strip = (s: string) => s.replace(/^[\s•▪■□◦●○\-–*·\u{1F4A1}\u{FE0F}\u{E000}-\u{F8FF}]+/u, "").trim();

/** Joins wrapped lines into paragraphs: a line ending a sentence closes a paragraph only when the next starts a new one. */
function prose(lines: Line[]): string {
  return lines
    .map((l) => strip(l.text))
    .filter(Boolean)
    .join("\n")
    .replace(/-\n(?=[a-z])/g, "-") // "real-\nlife"
    .replace(/([^.:!?”"])\n(?=[a-z(])/g, "$1 ") // a wrapped sentence
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * Items of a bullet list. Each starts with a capital letter (or a digit);
 * a line starting in lower case continues the item above it.
 */
function items(lines: Line[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const text = strip(line.text);
    if (!text || /^choose any of the following/i.test(text)) continue;
    if (out.length && (/^[a-z(]/.test(text) || /[,(/–-]$/.test(out[out.length - 1]))) out[out.length - 1] += ` ${text}`;
    else out.push(text);
  }
  return out;
}

/** The numbered tasks under a scenario ("1. ...", "2. ..."); text before the first number is the scenario. */
function scenarioAndTasks(lines: Line[]): { scenario: string; tasks: string[] } {
  const scenario: Line[] = [];
  const tasks: Line[][] = [];
  for (const line of lines) {
    const t = strip(line.text);
    if (/^task\s*s?\s*:?$/i.test(t)) continue;
    if (/^\d{1,2}[.)]\s/.test(t) || /^\d{1,2}[.)]$/.test(line.cells[0].text)) tasks.push([line]);
    else if (tasks.length) tasks[tasks.length - 1].push(line);
    else scenario.push(line);
  }
  return {
    scenario: prose(scenario).replace(/^scenario\s*(\([^)]*\))?\s*:\s*/i, (m) => (/\(/.test(m) ? m.replace(/^scenario\s*/i, "").replace(/:\s*$/, ": ") : "")).trim(),
    tasks: tasks.map((t) => prose(t).replace(/^\d{1,2}[.)]\s*/, "")),
  };
}

const RUBRIC_HEADER = /^criteria\b.*exceeding.*meeting.*approaching.*beginning/i;

/**
 * A rubric table: the header row gives the five column positions; each row
 * starts on a line whose Exceeding cell begins with a capital letter.
 */
function rubric(lines: Line[]): ModuleRubricRow[] {
  const headerAt = lines.findIndex((l) => RUBRIC_HEADER.test(l.text));
  if (headerAt < 0) return [];
  const header = lines[headerAt];
  const starts = header.cells.length >= 5 ? header.cells.slice(0, 5).map((c) => c.x) : null;
  if (!starts) return [];
  const column = (x: number) => {
    let best = 0;
    for (let i = 0; i < starts.length; i++) if (x >= starts[i] - 6) best = i;
    return best;
  };
  const body = lines.slice(headerAt + 1).filter((l) => !RUBRIC_HEADER.test(l.text)); // the header repeated on the next page
  // The usual distance between two lines of one cell; a row break is clearly wider.
  const gaps = body.slice(1).map((l, i) => (l.page === body[i].page ? l.y - body[i].y : 0)).filter((g) => g > 0).sort((a, b) => a - b);
  const lineGap = gaps[Math.floor(gaps.length / 4)] ?? 10;
  const rows: string[][] = [];
  body.forEach((line, i) => {
    const parts: string[] = ["", "", "", "", ""];
    for (const cell of line.cells) {
      const col = column(cell.x);
      parts[col] = parts[col] ? `${parts[col]} ${cell.text}` : cell.text;
    }
    const prev = body[i - 1];
    const newPage = prev && prev.page !== line.page;
    const wideGap = prev && !newPage && line.y - prev.y > lineGap * 1.45;
    const startsRow =
      rows.length === 0 || (parts[0] !== "" && /^[A-Z0-9(“"]/.test(parts[1] || parts[0]) && (wideGap || (newPage && /^[A-Z]/.test(parts[1]))));
    if (startsRow) rows.push(parts);
    else rows[rows.length - 1] = rows[rows.length - 1].map((v, j) => (parts[j] ? (v ? `${v} ${parts[j]}` : parts[j]) : v));
  });
  const tidy = (s: string) => s.replace(/\s+-\s*(?=[a-z])/g, "-").replace(/(\w)- (\w)/g, "$1-$2").replace(/\s+/g, " ").trim();
  return rows
    .filter((r) => r[0] && r.slice(1).some(Boolean))
    .map((r) => ({ criterion: tidy(r[0]), levels: [tidy(r[1]), tidy(r[2]), tidy(r[3]), tidy(r[4])] as [string, string, string, string] }));
}

/** The two-column "General Competence(s)" table: a row starts where the description starts with a capital. */
function generalCompetences(lines: Line[]): { name: string; description: string }[] {
  const body = lines.filter((l) => !/^this topic is intended|^general competence/i.test(l.text));
  const descX = body
    .flatMap((l) => l.cells.slice(1).map((c) => Math.round(c.x)))
    .sort((a, b) => a - b)[0];
  const rows: { name: string[]; desc: string[] }[] = [];
  for (const line of body) {
    let name = "";
    let desc = "";
    if (descX === undefined) desc = line.text;
    else
      for (const c of line.cells) {
        if (c.x < descX - 6) name = name ? `${name} ${c.text}` : c.text;
        else desc = desc ? `${desc} ${c.text}` : c.text;
      }
    if (name && desc && /^[A-Z]/.test(desc)) rows.push({ name: [name], desc: [desc] });
    else if (rows.length) {
      if (name) rows[rows.length - 1].name.push(name);
      if (desc) rows[rows.length - 1].desc.push(desc);
    } else if (name || desc) rows.push({ name: [name || desc], desc: name ? [desc] : [] });
  }
  const join = (parts: string[]) => parts.join(" ").replace(/(\w)- (\w)/g, "$1-$2").replace(/\s+/g, " ").replace(/\s+\.$/, "").trim();
  return rows.map((r) => ({ name: join(r.name), description: join(r.desc) })).filter((r) => r.name && !/^(general )?competences?$/i.test(r.name));
}

/** "Term: meaning" lines; a line without a colon continues the meaning above. */
function keyTerms(lines: Line[]): { term: string; meaning: string }[] {
  const out: { term: string; meaning: string }[] = [];
  for (const line of lines) {
    const text = strip(line.text);
    const m = /^([A-Z][^:]{1,60}?)\s*:\s*(.+)$/.exec(text);
    if (m && m[1].split(" ").length <= 7) out.push({ term: m[1].trim(), meaning: m[2].trim() });
    else if (out.length && text) out[out.length - 1].meaning += ` ${text}`;
  }
  return out;
}

// ── Sections ────────────────────────────────────────────────────────────────

const TOPIC = /^TOPIC\s+(\d{1,2}\.\d{1,2})\s*:\s*(.+)$/;
const SUB_TOPIC = /^Sub\s*-?\s*Topic\s+(\d{1,2}\.\d{1,2}\.\d{1,2})\s*:\s*(.+)$/i;
const ACTIVITY = /^Activity\s+(\d{1,2})\s*:\s*(.+)$/i;
const COMPETENCE = /^(\d{1,2}\.\d{1,2}\.\d{1,2}\.\d{1,2})\s+(.+)$/;
const TERM_MARK = /^TERM\s+(ONE|TWO|THREE|1|2|3)$/i;
const TERM_WORD: Record<string, number> = { one: 1, two: 2, three: 3, "1": 1, "2": 2, "3": 3 };
const isContents = (text: string) => /\.{5,}/.test(text);

/** Where a line belongs inside an activity. */
type ActivityPart = "background" | "natural" | "artificial" | "technological" | "materials" | "methods" | "conduct" | "points" | "tip" | "notes";

function activityHeading(text: string): ActivityPart | "setup" | null {
  const t = strip(text);
  if (/^learning environment setup/i.test(t)) return "setup";
  if (/^artificial\b/i.test(t)) return "artificial";
  if (/^technolog(y|ical)\s+environment/i.test(t)) return "technological";
  if (/^natural\s+environment/i.test(t)) return "natural";
  if (/^teaching and learning materials/i.test(t)) return "materials";
  if (/^suggested teaching methods/i.test(t)) return "methods";
  if (/^how to conduct/i.test(t)) return "conduct";
  if (/^suggested learning points/i.test(t)) return "points";
  if (/^content tip\s*:/i.test(t)) return "tip";
  return null;
}

/** Text written on a heading's own line after its label ("Natural Environment: Quiet room") is part of its section. */
function afterLabel(text: string): string {
  const t = strip(text);
  const m = /^(?:artificial[^:]*|technolog(?:y|ical) environment|natural environment|teaching and learning materials|suggested teaching methods|how to conduct|suggested learning points|content tip)\s*:?\s*(.*)$/i.exec(t);
  const rest = (m?.[1] ?? "").trim();
  return /^\(?physical/i.test(rest) && !rest.includes(":") ? "" : rest.replace(/^\(?physical[^):]*\)?\s*:?\s*/i, "");
}

function parseActivity(number: number, title: string, page: number, lines: Line[]): ModuleActivity {
  const parts: Record<ActivityPart, Line[]> = {
    background: [], natural: [], artificial: [], technological: [], materials: [], methods: [], conduct: [], points: [], tip: [], notes: [],
  };
  let part: ActivityPart = "background";
  for (const line of lines) {
    const heading = activityHeading(line.text);
    if (heading === "setup") {
      part = "artificial";
      continue;
    }
    if (heading) {
      part = heading;
      const rest = afterLabel(line.text);
      if (rest) parts[part].push({ ...line, text: rest, cells: [{ ...line.cells[0], text: rest }] });
      continue;
    }
    // After the content tip, a short line that looks like a heading starts the teaching notes.
    if (part === "tip" && parts.tip.length && /^[A-Z][^.]{3,90}$/.test(strip(line.text)) && !/[.,;:]$/.test(line.text) && line.height >= 10.9)
      part = "notes";
    parts[part].push(line);
  }
  return {
    number,
    title,
    background: prose(parts.background),
    environment: { natural: items(parts.natural), artificial: items(parts.artificial), technological: items(parts.technological) },
    materials: items(parts.materials),
    methods: items(parts.methods),
    howToConduct: prose(parts.conduct),
    learningPoints: items(parts.points),
    contentTip: prose(parts.tip),
    notes: prose(parts.notes),
    page,
  };
}

/** Lines between two markers (exclusive). */
const slice = (lines: Line[], from: number, to: number) => lines.slice(Math.max(0, from), to < 0 ? lines.length : to);
const find = (lines: Line[], test: (t: string) => boolean, from = 0) => {
  for (let i = from; i < lines.length; i++) if (test(strip(lines[i].text))) return i;
  return -1;
};

function parseSubTopic(code: string, name: string, lines: Line[], warnings: string[]): ModuleSubTopic {
  const at = (re: RegExp, from = 0) => find(lines, (t) => re.test(t), from);
  const competenceAt = at(/^specific competence/i);
  const firstActivity = at(ACTIVITY);
  const standardAt = at(/^expected standards?\b/i);
  const formativeAt = at(/^(examples? of formative|formative assessment)/i);
  const summativeAt = at(/^examples? of summative/i);
  const summaryAt = at(/^summary\b/i);
  const end = (...candidates: number[]) => {
    const later = candidates.filter((c) => c >= 0);
    return later.length ? Math.min(...later) : lines.length;
  };

  const introduction = prose(slice(lines, 0, end(competenceAt, firstActivity))).replace(/^introduction\s*:\s*/i, "");

  const competences: { code: string; text: string }[] = [];
  for (const line of slice(lines, competenceAt + 1, end(firstActivity, standardAt))) {
    const t = strip(line.text);
    const m = COMPETENCE.exec(t);
    if (m) competences.push({ code: m[1], text: m[2].trim() });
    else if (competences.length && /^[a-z]/.test(t)) competences[competences.length - 1].text += ` ${t}`;
  }
  if (!competences.length) warnings.push(`Sub-topic ${code}: no specific competence found.`);

  // Activities: from each "Activity n:" to the next one (or the expected standard).
  const activities: ModuleActivity[] = [];
  const activityEnd = end(standardAt, formativeAt, summaryAt);
  const starts: number[] = [];
  for (let i = Math.max(firstActivity, 0); i < activityEnd && firstActivity >= 0; i++) if (ACTIVITY.test(strip(lines[i].text))) starts.push(i);
  starts.forEach((start, k) => {
    const stop = k + 1 < starts.length ? starts[k + 1] : activityEnd;
    const m = ACTIVITY.exec(strip(lines[start].text))!;
    let title = m[2].trim();
    let bodyFrom = start + 1;
    // A title that wraps: the next line continues it when it is not a section heading or a sentence.
    const next = lines[bodyFrom];
    if (next && !activityHeading(next.text) && (/[,(&]$|\band$/.test(title) || (title.split("(").length > title.split(")").length))) {
      title = `${title} ${strip(next.text)}`;
      bodyFrom++;
    }
    const body = slice(lines, bodyFrom, stop).filter((l) => !/^learning activities$/i.test(strip(l.text)));
    activities.push(parseActivity(Number(m[1]), title.replace(/\s+/g, " "), lines[start].page, body));
  });
  if (!activities.length) warnings.push(`Sub-topic ${code}: no learning activities found.`);
  for (const a of activities)
    if (!a.howToConduct) warnings.push(`Sub-topic ${code}, Activity ${a.number}: no "How to Conduct" found.`);

  const expectedStandards =
    standardAt >= 0
      ? items(slice(lines, standardAt + 1, end(at(/^assessment$/i, standardAt), formativeAt, summativeAt, summaryAt))).filter((s) => !/^assessment$/i.test(s))
      : [];
  if (!expectedStandards.length) warnings.push(`Sub-topic ${code}: no expected standard found.`);

  const assessment = (from: number, to: number): ModuleAssessment | null => {
    if (from < 0) return null;
    const block = slice(lines, from + 1, to);
    const rubricAt = block.findIndex((l) => /rubric/i.test(strip(l.text)) && strip(l.text).length < 40 || RUBRIC_HEADER.test(l.text));
    const textPart = rubricAt >= 0 ? block.slice(0, rubricAt) : block;
    const { scenario, tasks } = scenarioAndTasks(textPart);
    return { scenario, tasks, rubric: rubricAt >= 0 ? rubric(block.slice(rubricAt)) : [] };
  };
  const formative = assessment(formativeAt, end(summativeAt, summaryAt));
  const summative = assessment(summativeAt, end(summaryAt));
  if (formative && !formative.rubric.length) warnings.push(`Sub-topic ${code}: the formative rubric could not be read.`);
  if (summative && !summative.rubric.length) warnings.push(`Sub-topic ${code}: the summative rubric could not be read.`);

  return {
    code,
    name,
    introduction,
    competences,
    activities,
    expectedStandards,
    formative,
    summative,
    pages: [lines[0]?.page ?? 0, lines[lines.length - 1]?.page ?? 0],
  };
}

function parseTopic(code: string, name: string, term: number | null, lines: Line[], warnings: string[]): ModuleTopic {
  const at = (re: RegExp, from = 0) => find(lines, (t) => re.test(t), from);
  const subAt = lines.findIndex((l) => SUB_TOPIC.test(strip(l.text)) && !isContents(l.text));
  const head = subAt >= 0 ? lines.slice(0, subAt) : lines;
  const hAt = (re: RegExp) => find(head, (t) => re.test(t));
  const overviewAt = hAt(/^overview$/i);
  const generalAt = hAt(/^general competence/i);
  const hookAt = hAt(/^hook$/i);
  const termsAt = hAt(/^key terms/i);
  const next = (...c: number[]) => {
    const later = c.filter((x) => x >= 0);
    return later.length ? Math.min(...later) : head.length;
  };
  const topic: ModuleTopic = {
    code,
    name,
    term,
    overview: overviewAt >= 0 ? prose(slice(head, overviewAt + 1, next(generalAt, hookAt, termsAt))) : "",
    generalCompetences: generalAt >= 0 ? generalCompetences(slice(head, generalAt + 1, next(hookAt, termsAt))) : [],
    hook: hookAt >= 0 ? prose(slice(head, hookAt + 1, next(termsAt))) : "",
    keyTerms: termsAt >= 0 ? keyTerms(slice(head, termsAt + 1, head.length)) : [],
    subTopics: [],
    summary: [],
    pages: [lines[0]?.page ?? 0, lines[lines.length - 1]?.page ?? 0],
  };
  if (!topic.generalCompetences.length) warnings.push(`Topic ${code}: no general competences found.`);

  // Sub-topics, each up to the next one.
  const subStarts: number[] = [];
  lines.forEach((l, i) => {
    if (SUB_TOPIC.test(strip(l.text)) && !isContents(l.text)) subStarts.push(i);
  });
  const summaryAt = at(/^summary\b/i);
  subStarts.forEach((start, k) => {
    const stop = k + 1 < subStarts.length ? subStarts[k + 1] : lines.length;
    const m = SUB_TOPIC.exec(strip(lines[start].text))!;
    topic.subTopics.push(parseSubTopic(m[1], m[2].trim(), lines.slice(start + 1, stop), warnings));
  });
  if (summaryAt >= 0) {
    const recap = lines.slice(summaryAt + 1).filter((l) => !/^key points recap/i.test(strip(l.text)));
    topic.summary = items(recap);
  }
  if (!topic.subTopics.length) warnings.push(`Topic ${code}: no sub-topics found.`);
  return topic;
}

/** True when the PDF looks like a CDC teaching module (sub-topics with numbered learning activities). */
export function looksLikeModule(pages: PageItems[]): boolean {
  const text = pages.map((p) => p.items.map((i) => i.str).join(" ")).join(" ");
  return /sub\s*-?\s*topic\s+\d+\.\d+\.\d+/i.test(text) && /activity\s+\d+\s*:/i.test(text) && /how to conduct/i.test(text);
}

export function parseModule(pages: PageItems[]): ParsedModule {
  const warnings: string[] = [];
  const lines = pages.flatMap(linesOf);

  const headerText = pages
    .flatMap((p) => p.items.map((i) => i.str))
    .find((s) => /teaching module\s*[–-]\s*form \d+/i.test(s));
  const title = headerText?.split("|")[0].trim() ?? "";
  const form = Number(/form\s*(\d)/i.exec(headerText ?? "")?.[1]) || null;
  const year = /\b(20\d\d)\b/.exec(headerText ?? "")?.[1] ?? null;

  // The appendix (a sample lesson plan) and the references are not teaching content.
  const stopAt = lines.findIndex((l) => /^(references|appendix\b)/i.test(strip(l.text)) && !isContents(l.text) && l.height >= 11);
  const body = stopAt >= 0 ? lines.slice(0, stopAt) : lines;

  const topics: ModuleTopic[] = [];
  let term: number | null = null;
  // "TERM THREE" in a module that has only one term part also counts for the whole file.
  const starts: { index: number; code: string; name: string; term: number | null }[] = [];
  body.forEach((line, index) => {
    const text = strip(line.text);
    const t = TERM_MARK.exec(text);
    if (t && !isContents(line.text)) term = TERM_WORD[t[1].toLowerCase()];
    const m = TOPIC.exec(text);
    if (m && !isContents(line.text)) starts.push({ index, code: m[1], name: m[2].trim(), term });
  });
  starts.forEach((s, k) => {
    const stop = k + 1 < starts.length ? starts[k + 1].index : body.length;
    topics.push(parseTopic(s.code, titleCase(s.name), s.term, body.slice(s.index + 1, stop), warnings));
  });
  if (!topics.length) warnings.push("No topics (\"TOPIC 2.1: ...\") were found.");
  return { title, form, year, topics, warnings };
}

/** "PRODUCTIVITY TOOLS" -> "Productivity Tools", keeping short words and acronyms like AI, IoT. */
function titleCase(name: string): string {
  if (name !== name.toUpperCase()) return name;
  const small = new Set(["and", "of", "the", "in", "to", "for", "on"]);
  return name
    .toLowerCase()
    .split(/(\s+|\()/)
    .map((w, i) => {
      if (/^\s+$|^\($/.test(w)) return w;
      if (/^(ai|css|sql|ict|html)\)?$/.test(w)) return w.toUpperCase();
      if (/^iot\)?$/.test(w)) return w.replace("iot", "IoT");
      if (i > 0 && small.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join("")
    .replace(/\bInternet of Things\b/i, "Internet of Things");
}
