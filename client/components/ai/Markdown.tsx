// @/components/ai/Markdown.tsx — shows the Markdown that Nemotron writes as
// a clean document: headings, paragraphs, bullet and numbered lists,
// tables, **bold**, *italics* and dividers — and, for assessments, maths
// ($x^2$ inline, $$…$$ on its own line, \ce{} chemistry), fenced code, and
// ```figure blocks (a JSON description the app draws: graphs, charts, maps,
// diagrams, timelines, family trees, structures, library pictures).
//
// Why not a library: the website has none installed, and this builds React
// elements directly (never raw HTML), so text from the AI can never run as
// code on the page. It also copes with a half-written document while it is
// still arriving.
//
// The look is set by the `doc-*` classes in DocumentPaper's style sheet, so
// the same document prints and exports to Word exactly as it is shown.
import type { ReactNode } from 'react';
import { Figure } from './figures/Figure';
import { MathText } from './figures/MathText';
import { parseFigure } from './figures/spec';

/**
 * **bold**, *italic*, `code`, <br> and maths inside one line. Maths is
 * $…$ (no space just inside the dollars, so "$5 and $10" stays text) or \(…\).
 */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(\$(?=[^\s$])[^$\n]*?[^\s$\\]\$|\$[^\s$]\$|\\\(.+?\\\)|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|<br\s*\/?>)/gi;
  let last = 0;
  let i = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index! > last) out.push(text.slice(last, match.index));
    const token = match[0];
    const k = `${key}-${i++}`;
    const isMath = token.startsWith('$') || token.startsWith('\\(');
    if (token.startsWith('$')) out.push(<MathText key={k} tex={token.slice(1, -1)} />);
    else if (token.startsWith('\\(')) out.push(<MathText key={k} tex={token.slice(2, -2)} />);
    else if (token.startsWith('**')) out.push(<strong key={k}>{inline(token.slice(2, -2), k)}</strong>);
    else if (token.startsWith('`')) out.push(<code key={k}>{token.slice(1, -1)}</code>);
    else if (token.startsWith('<')) out.push(<br key={k} />);
    else out.push(<em key={k}>{token.slice(1, -1)}</em>);
    last = match.index! + token.length;
    // The AI sometimes writes "$x = 10$(ii)" or "$B$and": put back the missing space.
    if (isMath && /^[\p{L}\d([]/u.test(text.slice(last, last + 1))) out.push(' ');
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (row: string) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const isTableRow = (line: string) => line.trim().startsWith('|');
const isDivider = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const bullet = /^\s*[-*•]\s+(.*)$/;
const numbered = /^\s*\d+[.)]\s+(.*)$/;
const fence = /^\s*```\s*([\w-]*)\s*$/;
const displayStart = /^\s*(\$\$|\\\[)/;
/** Sub-parts (i), (ii) … (x) written in the middle of a paragraph: each starts a new line, as in ECZ papers. */
const subPart = /\s+(?=\((?:i{1,3}|iv|vi{0,3}|ix|x)\)\s)/g;
/**
 * Joins a paragraph's lines, keeping on a line of its own (as in ECZ papers
 * and marking keys): a sub-part "(a)", "(ii)", a "•" condition, an "Answer:" line, any line
 * after a line break (two spaces at the end), and any line after one that ends with its
 * marks "[2]" or a mark code (M1, A1, B1).
 * KEEP IN STEP with joinLines in services/pdf/efilePDF.ts.
 */
function joinLines(lines: string[]): string {
  return lines.reduce((out, line, k) => {
    if (!k) return line;
    const prev = lines[k - 1].trimEnd();
    // Also a line starting with a "•" condition, and any line after a Markdown line break (two spaces at the end).
    const own = /^\s*(\((?:[a-h]|i{1,3}|iv|vi{0,3}|ix|x)\)|Answer\b|Answers\b|•)/i.test(line) || /(\]|\b[MAB]\d|\bft|\bcao)\s*$/i.test(prev) || / {2}$/.test(lines[k - 1]);
    return `${out}${own ? ' <br>' : ''} ${line}`;
  }, '');
}

// ───────────── Worked solutions (marking keys of Mathematics and Physics) ─────────────
//
// A paragraph made of steps, one equation per line with its marks
//   **(a)**
//   $PR^2 = 12^2 + 9^2 - 2(12)(9)\cos 50^\circ$ M1
//   $PR = 9.28\ \text{cm}$ A1
//   **Answer:** $PR = 9.28\ \text{cm}$ [3]
// is shown as a column of equations (displayed fractions and roots) with the
// marks lined up on the right as small badges, and the answer in a box. It is
// a table so that Print and the Word file keep the same layout.

const MARK_TAIL = /((?:\s+(?:[MAB]\d|ft|cao|oe|isw|\[\d+\]|\(\d+\)))+)\s*$/i;
const PART_ONLY = /^\s*(\*\*)?\((?:[a-h]|i{1,3}|iv|vi{0,3}|ix|x)\)(\*\*)?\s*$/i;
const ANSWER = /^\s*(\*\*)?Answers?:?(\*\*)?:?\s*/i;
const startsWithMath = (line: string) => /^\s*(\*\*)?(\((?:[a-h]|i{1,3}|iv|vi{0,3}|ix|x)\))?(\*\*)?\s*(\$|\\\()/i.test(line);

/** Is this paragraph a worked solution? Most lines are maths steps, part labels or the answer. */
function isWorking(lines: string[]): boolean {
  if (lines.length < 2 || !lines.some(startsWithMath)) return false;
  const fit = lines.filter((l) => startsWithMath(l) || PART_ONLY.test(l) || ANSWER.test(l) || (MARK_TAIL.test(l) && /\$/.test(l)));
  return fit.length / lines.length >= 0.6;
}

/** Shows the maths at the start of a step in display size (fractions and roots full height). */
const displayMaths = (text: string) => text.replace(/\$(?=[^\s$])([^$\n]*?[^\s$\\])\$/g, (_m, tex: string) => `$\\displaystyle ${tex}$`);

function WorkingBlock({ lines, k }: { lines: string[]; k: string }) {
  return (
    <table className="doc-work" role="presentation">
      <tbody>
        {lines.map((raw, r) => {
          const key = `${k}w${r}`;
          if (PART_ONLY.test(raw)) {
            const label = raw.replace(/\*/g, '').trim();
            return <tr key={key} className="doc-work-part"><td colSpan={2}><span className="doc-work-label">{label}</span></td></tr>;
          }
          const tail = MARK_TAIL.exec(raw);
          const marks = tail ? tail[1].trim().split(/\s+/) : [];
          let body = tail ? raw.slice(0, tail.index) : raw;
          const answer = ANSWER.test(body);
          if (answer) body = body.replace(ANSWER, '');
          // A leading "(a)" stays as a small label in front of the first step.
          const lead = /^\s*(\*\*)?(\((?:[a-h]|i{1,3}|iv|vi{0,3}|ix|x)\))(\*\*)?\s+/i.exec(body);
          if (lead) body = body.slice(lead[0].length);
          return (
            <tr key={key} className={answer ? 'doc-work-answer' : 'doc-work-step'}>
              <td className="doc-work-math">
                {lead && <span className="doc-work-label">{lead[2]}</span>}
                {answer && <span className="doc-work-answer-label">Answer</span>}
                {inline(startsWithMath(body) || answer ? displayMaths(body) : body, key)}
              </td>
              <td className="doc-work-marks">{marks.map((m, j) => <span key={j} className={/^\[|\(/.test(m) ? 'doc-mark doc-mark-total' : 'doc-mark'}>{m.replace(/[()]/g, '')}</span>)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let figures = 0;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = `b${i}`;
    if (!line.trim()) { i++; continue; }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const Tag = (['h2', 'h3', 'h4', 'h5'] as const)[level - 1];
      blocks.push(<Tag key={key} className={`doc-h${level}`}>{inline(heading[2], key)}</Tag>);
      i++;
      continue;
    }

    // ```figure … ``` (a drawing) or ``` … ``` (code, pseudocode, program output).
    const open = fence.exec(line);
    if (open) {
      const lang = open[1].toLowerCase();
      const body: string[] = [];
      i++;
      while (i < lines.length && !fence.test(lines[i])) body.push(lines[i++]);
      const closed = i < lines.length;
      if (closed) i++;
      // The AI sometimes fences a figure as ```json or plain ```: if the block is
      // a figure description, draw it anyway instead of printing the JSON.
      const looseFigure = closed && (lang === '' || lang === 'json') ? parseFigure(body.join('\n')) : null;
      if (lang === 'figure' || looseFigure) {
        if (!closed) { blocks.push(<div key={key} className="doc-figure-wait">Drawing figure {figures + 1}…</div>); continue; }
        const spec = looseFigure ?? parseFigure(body.join('\n'));
        if (spec) blocks.push(<Figure key={key} spec={spec} number={++figures} />);
        else blocks.push(<p key={key} data-screen-only className="doc-figure-check"><strong>A figure could not be read</strong> and is left out. Shown here only.</p>);
      } else {
        blocks.push(<pre key={key} className="doc-pre"><code>{body.join('\n')}</code></pre>);
      }
      continue;
    }

    // $$ … $$ or \[ … \] on lines of their own: maths set out in the middle.
    if (displayStart.test(line)) {
      const closer = line.trim().startsWith('$$') ? '$$' : '\\]';
      let tex = line.trim().slice(2);
      let done = tex.trimEnd().endsWith(closer) && tex.trim().length >= closer.length;
      i++;
      while (!done && i < lines.length) {
        const next = lines[i++];
        tex += '\n' + next;
        done = next.trimEnd().endsWith(closer);
      }
      tex = tex.trimEnd();
      if (tex.endsWith(closer)) tex = tex.slice(0, -closer.length);
      blocks.push(<MathText key={key} tex={tex.trim()} display />);
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { blocks.push(<hr key={key} className="doc-hr" />); i++; continue; }

    if (isTableRow(line)) {
      const rows: string[] = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(lines[i++]);
      const hasHeader = rows.length > 1 && isDivider(rows[1]);
      const head = hasHeader ? cells(rows[0]) : null;
      const body = (hasHeader ? rows.slice(2) : rows).filter((r) => !isDivider(r)).map(cells);
      // Wide tables (4+ columns) keep a readable width on phones and scroll sideways.
      const columns = Math.max(head?.length ?? 0, ...body.map((r) => r.length));
      blocks.push(
        <div key={key} className="doc-table-wrap">
          <table className={columns >= 4 ? 'doc-table doc-table-wide' : 'doc-table'}>
            {head && (
              <thead>
                <tr>{head.map((c, j) => <th key={j}>{inline(c, `${key}h${j}`)}</th>)}</tr>
              </thead>
            )}
            <tbody>
              {body.map((row, r) => (
                <tr key={r}>{row.map((c, j) => <td key={j}>{inline(c, `${key}r${r}c${j}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line) && !bullet.test(line);
      const pattern = ordered ? numbered : bullet;
      const items: string[] = [];
      // A numbered list broken by a figure or an equation carries on from its own number.
      const start = ordered ? Number(/^\s*(\d+)/.exec(line)![1]) : 1;
      while (i < lines.length && pattern.test(lines[i])) items.push(pattern.exec(lines[i++])![1]);
      const List = ordered ? 'ol' : 'ul';
      blocks.push(
        <List key={key} className={ordered ? 'doc-ol' : 'doc-ul'} start={ordered && start !== 1 ? start : undefined}>
          {items.map((item, j) => <li key={j}>{inline(item, `${key}i${j}`)}</li>)}
        </List>,
      );
      continue;
    }

    // A paragraph: consecutive ordinary lines.
    const text: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4})\s/.test(lines[i]) && !isTableRow(lines[i]) && !bullet.test(lines[i]) && !numbered.test(lines[i]) && !fence.test(lines[i]) && !displayStart.test(lines[i]))
      text.push(lines[i++]);
    if (isWorking(text)) { blocks.push(<WorkingBlock key={key} lines={text} k={key} />); continue; }
    const joined = joinLines(text);
    // Only when the paragraph really holds a list of sub-parts, so "f (x) = …" is left alone.
    const withBreaks = /(^|\s)\(i\)\s/.test(joined) && /\s\(ii\)\s/.test(joined) ? joined.replace(subPart, '<br>') : joined;
    blocks.push(<p key={key} className="doc-p">{inline(withBreaks, key)}</p>);
  }
  return <div className="doc-body">{blocks}</div>;
}
