/**
 * Cleans a finished document before it is saved.
 *
 * The large Nemotron models sometimes "think out loud" inside the answer:
 * they write a draft, then notes to themselves ("Wait: angle ADC = 55° …
 * Let's recalc … We'll change the JSON …"), then the whole document again.
 * The teacher then sees two copies, the notes, and the figure JSON quoted
 * inside the notes. This finds the last complete copy and keeps only it, then
 * drops any paragraph that is the model talking to itself.
 *
 * Plain text in, plain text out; no AI call. Used for every tool
 * (routes/teacher.ts) and after the marking-key check (keyCheck.ts).
 * The school app has the same restart rule for the live view while the
 * document is still arriving (client/components/ai/cleanStream.ts).
 */

/** Phrases that only appear when the model is talking to itself, not writing a document. */
const SELF_TALK = [
  /\bWait[:,.]/, /\bHmm\b/, /\bLet['’]s (recalc|redo|re-?check|re-?design|adjust|assume|use|change|set|simplify|do|write|proceed|make|create|compute|fix|try)\b/i,
  /\bLet me\b/, /\bWe['’]ll (change|adjust|assume|set|use|write|make|create|need|do|proceed|update|fix|rewrite)\b/i, /\bwe need to\b/i,
  /\bActually,/, /\bthe (instruction|instructions) (say|says|said)\b/i, /\bthe (figure )?JSON\b/i, /\bin the final (answer|output)\b/i,
  /\bthought process\b/i, /\bI think\b/, /\bthis is (getting )?(messy|too complicated|confusing)\b/i, /\bGiven the complexity\b/i,
  /\bBut the (figure|question|source|document)\b/i, /\bThat was a mistake\b/i, /\bContradiction\b/i, /\bOops\b/i, /\bno, wait\b/i,
  /\bLet['’]s\b/, /\bWe['’]ll\b/, /\bNot (given|sure|direct|needed)\b/, /\?\s*(No|Not)\b/, /\bBetter:/, /\bso (it|they) should be\b/i, /\bmust have been\b/i,
];

const selfTalkScore = (text: string) => SELF_TALK.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0);

/** Headings of the document, including one the model glued to the end of a sentence ("…now.## Paper Details"). */
function headingsOf(content: string): { at: number; text: string }[] {
  return [...content.matchAll(/(^|[^\n#])(##)[ \t]+([^\n#][^\n]*)/gm)].map((m) => ({ at: m.index! + m[1].length, text: m[3].trim() }));
}

/**
 * When the document starts again (its first heading, or "## Marking Key",
 * appears a second time), keep the last copy, which is the corrected one.
 */
export function lastCopy(content: string): { content: string; restarted: boolean } {
  const heads = headingsOf(content);
  if (heads.length < 2) return { content, restarted: false };
  const first = heads[0].text.toLowerCase();
  const again = heads.filter((h, k) => k > 0 && h.text.toLowerCase() === first);
  const keys = heads.filter((h) => /^marking key\b/i.test(h.text));
  let cut = again.length ? again[again.length - 1].at : -1;
  // The second copy may start one section later ("## Instructions…" after a first "## Paper Details").
  if (cut < 0 && keys.length > 1) {
    const second = heads[1]?.text.toLowerCase();
    const restart = heads.filter((h, k) => k > 1 && h.text.toLowerCase() === second && h.at > keys[0].at);
    if (restart.length) {
      // Keep the first copy's opening sections (before its second heading) and the last copy's rest.
      const opening = content.slice(0, heads[1].at);
      return { content: `${opening.trimEnd()}\n\n${content.slice(restart[restart.length - 1].at)}`, restarted: true };
    }
  }
  if (cut <= 0) return { content, restarted: false };
  return { content: content.slice(cut), restarted: true };
}

/** Splits into blocks separated by blank lines, keeping fenced blocks (figures, code) whole. */
function blocksOf(content: string): string[] {
  const out: string[] = [];
  let current: string[] = [];
  let inFence = false;
  for (const line of content.split("\n")) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence && !line.trim()) {
      if (current.length) out.push(current.join("\n"));
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length) out.push(current.join("\n"));
  return out;
}

/**
 * Drops the lines where the model talks to itself (headings, tables and
 * fenced blocks are never touched). Line by line, so a working line next to
 * a stray note survives; the marking-key check then re-solves anything left
 * without an answer.
 */
export function withoutSelfTalk(content: string): { content: string; removed: number } {
  let removed = 0;
  const kept = blocksOf(content).flatMap((block) => {
    if (/^\s*(```|\|)/.test(block)) return [block];
    const lines = block.split("\n").filter((line) => {
      if (/^\s*(#|\|)/.test(line)) return true;
      const bad = selfTalkScore(line) >= 2
        || /^\s*(Wait|Hmm|Let['’]s|Let me|We['’]ll|We need|Actually,|But the|So maybe|Perhaps the|This is messy|Not sure)\b/.test(line);
      if (bad) removed++;
      return !bad;
    });
    return lines.length ? [lines.join("\n")] : [];
  });
  return { content: kept.join("\n\n"), removed };
}

/** A heading glued to the end of a sentence goes back onto its own line. */
/**
 * HTML spacing the model sometimes uses for layout ("&nbsp;&nbsp;&nbsp;&nbsp;(i) …",
 * "&nbsp;• T is at most 6 cm from Y"): Markdown shows it as raw text. A run of
 * such spaces in the middle of a line was meant as a new line, so it becomes a
 * line break (in a table cell, <br>); at the start of a line it is dropped; a
 * single one is a plain space. Figure and code blocks are left alone.
 */
const SPACE = String.raw`(?:&(?:amp;)?(?:nbsp|ensp|emsp|thinsp|#160|#xa0|#8194|#8195);?| | | )`;
export function plainSpacing(content: string): string {
  if (!new RegExp(SPACE, "i").test(content)) return content;
  const run = new RegExp(String.raw`[ \t]*(?:${SPACE}[ \t]*){2,}`, "gi");
  const one = new RegExp(SPACE, "gi");
  return content.split(/(```[\s\S]*?```)/).map((part, k) => (k % 2 ? part : part.split("\n").map((line) => {
    const table = line.trim().startsWith("|");
    return line
      .replace(new RegExp(String.raw`^(\s*(?:\|\s*)?)(?:${SPACE}[ \t]*)+`, "i"), "$1") // at the start of a line (or cell): dropped
      .replace(new RegExp(String.raw`(\|\s*)(?:${SPACE}[ \t]*)+`, "gi"), "$1")
      .replace(run, table ? "<br>" : "  \n") // in the middle: a new line
      .replace(one, " ");
  }).join("\n"))).join("");
}

const unglueHeadings = (content: string) => content.replace(/([^\n#])(##[ \t]+[A-Z])/g, "$1\n\n$2");

export interface Cleaned { content: string; restarted: boolean; removed: number }

export function cleanDocument(raw: string): Cleaned {
  const copy = lastCopy(raw.trim());
  const talk = withoutSelfTalk(unglueHeadings(plainSpacing(copy.content)));
  return { content: talk.content.replace(/\n{3,}/g, "\n\n").trim(), restarted: copy.restarted, removed: talk.removed };
}
