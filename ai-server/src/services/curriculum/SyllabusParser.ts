/**
 * Reads a CDC (Curriculum Development Centre) syllabus PDF into a curriculum map.
 *
 * The CDC syllabi lay their content out in one five-column table:
 *
 *   TOPIC | SUB-TOPIC | SPECIFIC COMPETENCES | LEARNING ACTIVITIES | EXPECTED STANDARD(S)
 *
 * and number everything, which is what makes an exact parse possible:
 *   1.1      topic          (first digit = the Form)
 *   1.1.1    sub-topic
 *   1.1.1.1  specific competence
 *
 * How it works, page by page:
 *   1. find the header row and use its words to work out where each column starts;
 *   2. put every piece of text in its column, then join pieces on the same height into lines;
 *   3. lines starting with a code open a new topic / sub-topic / competence;
 *   4. activity and standard lines belong to the competence whose code sits at or
 *      above them on the page; lines above the first code on a page continue the
 *      competence from the previous page (tables run across pages).
 *
 * The result is a draft: the superAdmin reviews it before teachers see it.
 */
import type { PageItems, TextItem } from "../rag/PDFProcessor.js";

export interface MapCompetence {
  code: string; // 1.1.1.1
  text: string;
  activities: string[];
  standards: string[];
  page: number;
}

export interface MapSubTopic {
  code: string; // 1.1.1
  name: string;
  competences: MapCompetence[];
}

export interface MapTopic {
  code: string; // 1.1
  name: string;
  form: number; // 1–4, from the first digit of the code
  subTopics: MapSubTopic[];
}

export interface ParsedSyllabus {
  topics: MapTopic[];
  /** Things the reviewer should look at: missing names, empty competences, odd codes. */
  warnings: string[];
  /** Pages that held table content. */
  tablePages: number[];
}

type Column = "topic" | "subTopic" | "competence" | "activities" | "standards";
const COLUMNS: Column[] = ["topic", "subTopic", "competence", "activities", "standards"];

const HEADER_WORDS: Array<[Column, RegExp]> = [
  ["topic", /^TOPICS?$/],
  ["subTopic", /^SUB-?\s?TOPICS?$/],
  ["competence", /^SPECIFIC\s+COMPETENCES?$/],
  ["activities", /^LEARNING\s+ACTIVITIES$/],
  ["standards", /^EXPECTED\s+STANDARDS?$/],
];

const TOPIC_CODE = /^(\d{1,2}\.\d{1,2})\.?(?![.\d])\s*(.*)$/;
const SUB_CODE = /^(\d{1,2}\.\d{1,2}\.\d{1,2})\.?(?![.\d])\s*(.*)$/;
const COMP_CODE = /^(\d{1,2}\.\d{1,2}\.\d{1,2}\.\d{1,2})\.?(?![.\d])\s*(.*)$/;

/** Bullet glyphs survive extraction as blanks or odd symbols. */
const BULLET_CHARS = "•·▪●○◦\\u0080-\\u009f\\uf000-\\uf8ff";
const BULLET_ONLY = new RegExp(`^[\\s${BULLET_CHARS}\\-–.,\\u0000-\\u001f]*$`);
const LEADING_BULLET = new RegExp(`^[${BULLET_CHARS}]\\s*`);
const HAS_BULLET = new RegExp(`[${BULLET_CHARS}]`);

interface Line {
  y: number;
  text: string;
  bullet: boolean;
}

const clean = (s: string) =>
  s
    .replace(/«/g, "…") // an ellipsis the font repair cannot place
    .replace(/[\u0080-\u009f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Words cut at the end of a narrow cell ("PRODUCTIV" / "ITY") are rejoined when
 * the joined word appears elsewhere in the same document and one half does not.
 */
const TWO_LETTER_WORDS = new Set("am an as at be by do go he if in is it me my no of on or so to up us we ai os pc ui ux".split(" "));
let vocabulary = new Map<string, number>(); // word → how often it appears
function joinText(a: string, b: string): string {
  a = clean(a);
  b = clean(b);
  if (!a) return b;
  if (!b) return a;
  if (/[A-Za-z]-$/.test(a) && /^[a-z]/.test(b)) return a + b; // "cyber-" + "security"
  const tail = a.match(/([A-Za-z]+)$/)?.[1];
  const head = b.match(/^([A-Za-z]+)/)?.[1];
  if (tail && head) {
    const whole = (tail + head).toLowerCase();
    const rare = (w: string) => {
      const lower = w.toLowerCase();
      if (lower.length <= 2) return !TWO_LETTER_WORDS.has(lower);
      return (vocabulary.get(lower) ?? 0) <= 3;
    };
    if (vocabulary.has(whole) && (rare(tail) || rare(head))) return a + b;
  }
  return `${a} ${b}`;
}
const joinAll = (parts: string[]) => parts.reduce((acc, p) => joinText(acc, p), "");

interface Header {
  /** x of each header word */
  xs: number[];
  /** where most text of each column starts (after calibrate) */
  edges: (number | null)[];
  /** where each column starts */
  starts: number[];
  headerY: number;
}

/** The left edge of each column, from the header row; null when the page has no header. */
function findColumns(page: PageItems): Header | null {
  const found = new Map<Column, { x: number; y: number }>();
  for (const item of page.items) {
    const text = clean(item.str).toUpperCase();
    for (const [column, re] of HEADER_WORDS) {
      if (re.test(text) && !found.has(column)) found.set(column, { x: item.x, y: item.y });
    }
  }
  if (found.size < 5) return null;
  const xs = COLUMNS.map((c) => found.get(c)!.x);
  // First guess: header words sit roughly in the middle of their columns, so a
  // column starts halfway between its own header and the previous one.
  // calibrate() then tightens this from where the text really starts.
  const starts = xs.map((x, i) => (i === 0 ? -Infinity : (xs[i - 1] + x) / 2));
  return { xs, starts, edges: COLUMNS.map(() => null), headerY: Math.max(...[...found.values()].map((v) => v.y)) };
}

/**
 * Long lines sometimes spill past the halfway guess ("…hardware using" ending
 * inside the next column). Across the whole document most lines of a column
 * start at the same left edge, so each column's start is moved up to just
 * before that edge; the odd spill-over then falls back into its own column.
 */
function calibrate(pages: PageItems[], tables: Map<number, Header>): void {
  // measured from each page's own header word, because the table sits at a
  // slightly different place on every page
  const lefts: number[][] = COLUMNS.map(() => []);
  for (const page of pages) {
    const header = tables.get(page.pageNumber);
    if (!header) continue;
    for (const item of page.items) {
      if (item.y <= header.headerY + 4 || item.y >= page.height - 62 || BULLET_ONLY.test(item.str)) continue;
      const i = COLUMNS.indexOf(columnOf(item.x, header.starts));
      lefts[i].push(item.x - header.xs[i]);
    }
  }
  const edge = lefts.map((xs) => {
    if (xs.length < 8) return null;
    const sorted = [...xs].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.1)];
  });
  // the single most common starting position: where ordinary lines of the column begin
  const usual = lefts.map((xs) => {
    if (xs.length < 8) return null;
    const counts = new Map<number, number>();
    for (const x of xs) counts.set(Math.round(x / 3), (counts.get(Math.round(x / 3)) ?? 0) + 1);
    const [bin] = [...counts].sort((a, b) => b[1] - a[1])[0];
    return bin * 3;
  });
  for (const header of tables.values()) {
    for (let i = 1; i < COLUMNS.length; i++) {
      const e = edge[i];
      const u = usual[i];
      if (u !== null) header.edges[i] = header.xs[i] + u;
      // only ever move a start to the right, and never past the column's own edge
      if (e === null) continue;
      const start = header.xs[i] + e - 8;
      if (start > header.starts[i] && start < header.xs[i]) header.starts[i] = start;
    }
  }
}

function columnOf(x: number, starts: number[]): Column {
  let index = 0;
  for (let i = 0; i < starts.length; i++) if (x >= starts[i] - 2) index = i;
  return COLUMNS[index];
}

/** Join the pieces of one column into lines, top to bottom. */
function toLines(items: TextItem[]): Line[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: TextItem[][] = [];
  for (const item of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - item.y) < 3.5) row.push(item);
    else rows.push([item]);
  }
  const lines: Line[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    const firstText = row.findIndex((i) => !BULLET_ONLY.test(i.str));
    // a bullet is a real glyph before the text; blank spacer pieces do not count
    const glyph = row.slice(0, firstText === -1 ? row.length : firstText).some((i) => HAS_BULLET.test(i.str));
    if (firstText === -1) {
      if (!glyph) continue;
      // a bullet on its own line: the text that follows starts a new item
      lines.push({ y: row[0].y, text: "", bullet: true });
      continue;
    }
    let text = clean(row.slice(firstText).map((i) => i.str).join(" "));
    let bullet = glyph;
    const lead = row[firstText].str.trimStart().match(LEADING_BULLET) ?? text.match(LEADING_BULLET);
    if (lead) {
      bullet = true;
      text = text.slice(lead[0].length);
    }
    lines.push({ y: row[0].y, text, bullet });
  }
  return lines;
}

/**
 * Group activity/standard lines into separate statements. Bullets mark the
 * start of each one; some pages have none, and there a new statement starts
 * after a full stop, or (for activities) at a line opening with an "-ing" verb,
 * which is how the CDC words every learning activity ("Discussing…", "Creating…").
 */
function statements(lines: Line[], kind: "activities" | "standards"): string[] {
  const out: string[] = [];
  const bulleted = lines.some((l) => l.bullet);
  let pendingBullet = false;
  for (const line of lines) {
    if (!line.text) {
      pendingBullet = true;
      continue;
    }
    const prev = out[out.length - 1] ?? "";
    const starts = bulleted
      ? line.bullet || pendingBullet
      : (/[.!?]$/.test(prev) && /^[A-Z]/.test(line.text)) || (kind === "activities" && /^[A-Z][a-z]+ing\b/.test(line.text));
    if (out.length === 0 || starts) out.push(line.text);
    else out[out.length - 1] = joinText(out[out.length - 1], line.text);
    pendingBullet = false;
  }
  return out.map((s) => s.replace(/\s+([,.;:])/g, "$1").replace(/[\s.…]+$/, (m) => (m.includes(".") ? "." : ""))).filter(Boolean);
}

/** Split lines into the part before the first anchor (continuation) and one part per anchor. */
function byAnchor<T extends { y: number }>(lines: Line[], anchors: T[]): { before: Line[]; parts: Map<T, Line[]> } {
  const before: Line[] = [];
  const parts = new Map<T, Line[]>(anchors.map((a) => [a, []]));
  for (const line of lines) {
    let owner: T | undefined;
    for (const a of anchors) if (a.y <= line.y + 3) owner = a;
    if (owner) parts.get(owner)!.push(line);
    else before.push(line);
  }
  return { before, parts };
}

export function parseSyllabus(pages: PageItems[]): ParsedSyllabus {
  const topics = new Map<string, MapTopic>();
  const subTopics = new Map<string, MapSubTopic>();
  const warnings: string[] = [];
  const tablePages: number[] = [];

  let starts: number[] | null = null;
  let lastCompetence: MapCompetence | null = null;
  let lastSubTopic: MapSubTopic | null = null;
  let lastTopicName: { topic: MapTopic } | null = null;

  const topicFor = (code: string): MapTopic => {
    let topic = topics.get(code);
    if (!topic) {
      topic = { code, name: "", form: Number(code.split(".")[0]), subTopics: [] };
      topics.set(code, topic);
    }
    return topic;
  };
  const subTopicFor = (code: string): MapSubTopic => {
    let sub = subTopics.get(code);
    if (!sub) {
      sub = { code, name: "", competences: [] };
      subTopics.set(code, sub);
      topicFor(code.split(".").slice(0, 2).join(".")).subTopics.push(sub);
    }
    return sub;
  };

  vocabulary = new Map();
  for (const page of pages)
    for (const item of page.items)
      for (const word of item.str.toLowerCase().match(/[a-z]{2,}/g) ?? []) vocabulary.set(word, (vocabulary.get(word) ?? 0) + 1);
  const headers = new Map<number, Header>();
  for (const page of pages) {
    const header = findColumns(page);
    if (header) headers.set(page.pageNumber, header);
  }
  calibrate(pages, headers);

  for (const page of pages) {
    const header = headers.get(page.pageNumber) ?? null;
    const text = page.items.map((i) => i.str).join(" ");
    if (header) starts = header.starts;
    else if (!starts || !/\b\d+\.\d+\.\d+\.\d+\b/.test(text)) continue; // a cover, intro or summary page

    const top = header ? header.headerY + 4 : 0;
    const bottom = page.height - 62; // the running footer and page number
    const columns = new Map<Column, TextItem[]>(COLUMNS.map((c) => [c, []]));
    const body = page.items.filter((item) => item.y > top && item.y < bottom && item.str.length > 0);
    for (const item of body) {
      let x = item.x;
      if (BULLET_ONLY.test(item.str)) {
        // a bullet goes with the text just to its right
        const next = body
          .filter((o) => o !== item && !BULLET_ONLY.test(o.str) && Math.abs(o.y - item.y) < 3.5 && o.x > item.x && o.x - item.x < 30)
          .sort((a, b) => a.x - b.x)[0];
        if (next) x = next.x;
      }
      columns.get(columnOf(x, starts))!.push(item);
    }
    const edges = header?.edges ?? COLUMNS.map(() => null);
    // Text that runs on from the column to its left (same line, starting right
    // where that text ends) belongs to the column to its left.
    // (Only for the wide text columns: topic and sub-topic cells are narrow and
    // their words sit right against the next column.)
    for (let i = COLUMNS.length - 1; i >= 3; i--) {
      const here = columns.get(COLUMNS[i])!;
      const left = columns.get(COLUMNS[i - 1])!;
      const edge = edges[i];
      const spill = here.filter((item) =>
        // text at the column's usual left edge is the column's own
        (edge === null || item.x < edge - 6) &&
        !BULLET_ONLY.test(item.str) &&
        left.some((l) => l.str.trim() && Math.abs(l.y - item.y) < 3.5 && l.x < item.x && l.x + l.width >= item.x - 6),
      );
      for (const item of spill) {
        here.splice(here.indexOf(item), 1);
        left.push(item);
      }
    }
    const lines = new Map<Column, Line[]>(COLUMNS.map((c) => [c, toLines(columns.get(c)!)]));
    if (COLUMNS.every((c) => lines.get(c)!.every((l) => !l.text))) continue;
    tablePages.push(page.pageNumber);

    // Topics: names only. Which topic a sub-topic belongs to comes from its code.
    for (const line of lines.get("topic")!) {
      if (!line.text) continue;
      const m = line.text.match(TOPIC_CODE);
      if (m) {
        const topic = topicFor(m[1]);
        topic.name = joinText(topic.name, m[2]);
        lastTopicName = { topic };
      } else if (lastTopicName) {
        lastTopicName.topic.name = joinText(lastTopicName.topic.name, line.text);
      }
    }
    lastTopicName = null; // names never continue onto the next page

    // Sub-topics
    const subAnchors: Array<{ y: number; sub: MapSubTopic; rest: string }> = [];
    for (const line of lines.get("subTopic")!) {
      const m = line.text.match(SUB_CODE);
      if (m) subAnchors.push({ y: line.y, sub: subTopicFor(m[1]), rest: m[2] });
    }
    {
      const { before, parts } = byAnchor(lines.get("subTopic")!.filter((l) => l.text), subAnchors);
      if (lastSubTopic) lastSubTopic.name = joinAll([lastSubTopic.name, ...before.map((l) => l.text)]);
      for (const [anchor, own] of parts) {
        const rest = own.filter((l) => !SUB_CODE.test(l.text)).map((l) => l.text);
        anchor.sub.name = joinAll([anchor.sub.name, anchor.rest, ...rest]);
        lastSubTopic = anchor.sub;
      }
    }

    // Competences
    const compAnchors: Array<{ y: number; comp: MapCompetence; rest: string }> = [];
    for (const line of lines.get("competence")!) {
      const m = line.text.match(COMP_CODE);
      if (!m) continue;
      const sub = subTopicFor(m[1].split(".").slice(0, 3).join("."));
      let comp = sub.competences.find((c) => c.code === m[1]);
      if (!comp) {
        comp = { code: m[1], text: "", activities: [], standards: [], page: page.pageNumber };
        sub.competences.push(comp);
      }
      compAnchors.push({ y: line.y, comp, rest: m[2] });
    }
    {
      const { before, parts } = byAnchor(lines.get("competence")!.filter((l) => l.text), compAnchors);
      if (lastCompetence) lastCompetence.text = joinAll([lastCompetence.text, ...before.map((l) => l.text)]);
      for (const [anchor, own] of parts) {
        const rest = own.filter((l) => !COMP_CODE.test(l.text)).map((l) => l.text);
        anchor.comp.text = joinAll([anchor.comp.text, anchor.rest, ...rest]);
      }
    }

    // Activities and expected standards hang off the competences.
    for (const column of ["activities", "standards"] as const) {
      const { before, parts } = byAnchor(lines.get(column)!, compAnchors);
      const add = (comp: MapCompetence | null, own: Line[], continues: boolean) => {
        if (!comp || own.length === 0) return;
        const list = column === "activities" ? comp.activities : comp.standards;
        const found = statements(own, column);
        // A table row cut by the page break carries on the last statement,
        // unless the new page opens with a bullet.
        if (continues && list.length && found.length && !own.find((l) => l.text)?.bullet && !own[0]?.bullet) {
          list[list.length - 1] = joinText(list[list.length - 1], found.shift()!);
        }
        list.push(...found);
      };
      add(lastCompetence, before, true);
      for (const [anchor, own] of parts) add(anchor.comp, own, false);
    }
    if (compAnchors.length) lastCompetence = compAnchors[compAnchors.length - 1].comp;
  }

  // Order everything by code and check it over.
  const byCode = (a: { code: string }, b: { code: string }) => {
    const x = a.code.split(".").map(Number);
    const y = b.code.split(".").map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
    return 0;
  };
  const list = [...topics.values()].sort(byCode);
  for (const topic of list) {
    topic.subTopics.sort(byCode);
    topic.name = tidyName(topic.name);
    if (!topic.name) warnings.push(`Topic ${topic.code} has no name.`);
    if (topic.form < 1 || topic.form > 4) warnings.push(`Topic ${topic.code} does not start with a Form number 1–4.`);
    for (const sub of topic.subTopics) {
      sub.competences.sort(byCode);
      sub.name = tidyName(sub.name);
      if (!sub.name) warnings.push(`Sub-topic ${sub.code} has no name.`);
      if (sub.competences.length === 0) warnings.push(`Sub-topic ${sub.code} has no specific competences.`);
      for (const comp of sub.competences) {
        comp.text = comp.text.replace(/\s+([,.;:])/g, "$1").trim();
        if (!comp.text) warnings.push(`Competence ${comp.code} has no text (page ${comp.page}).`);
        if (comp.activities.length === 0) warnings.push(`Competence ${comp.code} has no learning activities (page ${comp.page}).`);
        if (comp.standards.length === 0) warnings.push(`Competence ${comp.code} has no expected standard (page ${comp.page}).`);
      }
    }
  }
  return { topics: list, warnings, tablePages };
}

/** "INTRODUCTION TO ICT" → "Introduction to ICT"; leaves mixed-case names alone. */
function tidyName(name: string): string {
  // pieces that were cut inside one stored string ("COMPUTI NG")
  const n = clean(name)
    .split(" ")
    .reduce((acc, word) => joinText(acc, word), "")
    .replace(/[.:\s]+$/, "");
  if (!n || n !== n.toUpperCase()) return n;
  const small = new Set(["AND", "OF", "TO", "IN", "THE", "FOR", "ON", "A", "AN", "WITH", "OR"]);
  const keep = new Set(["ICT", "IT", "CPU", "HTML", "CSS", "SQL", "IOT", "AI", "OS", "LAN", "WAN", "PC", "ICTS", "UI", "UX", "GUI", "URL", "WWW", "API", "DBMS"]);
  return n
    .split(" ")
    .map((w, i) => {
      const core = w.replace(/[^A-Z]/g, "");
      if (keep.has(core)) return w;
      if (i > 0 && small.has(w)) return w.toLowerCase();
      return w.charAt(0) + w.slice(1).toLowerCase();
    })
    .join(" ")
    .replace(/:\s*(\w)/g, (_m, c: string) => `: ${c.toUpperCase()}`);
}
