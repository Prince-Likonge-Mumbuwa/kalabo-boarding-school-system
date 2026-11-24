// @/services/efileSystemTables.ts — the tables of the Teacher's File that
// come from the school system, as Markdown (plain functions from data, so the
// screen and the PDF show exactly the same thing). efileSystem.ts fetches the
// data and calls these.
//
//   4        timetableMd          the teacher's weekly timetable
//   5        classListMd          one list per class taught
//            registerMd           the subject register from the attendance taken in its lessons
//   11 (ii)  progressChartMd      Week 4, Week 8 and End of Term marks
//   11 (vi)  analysisMd           grades 1–9 by sex, pass rate (grade 9 is the only fail), mean
//   11 (vii) remedialLearnersMd   learners who failed (grade 9)
//            remedialLessonsMd    lessons whose evaluation called for remedial or continuation work
//   11 (v)   scriptSuggestions    which learners' scripts to scan (highest, average, lowest)
//   1, 2     statementsMd         vision / mission of the Ministry, school and department (admin's Settings)
//   6        syllabusMd           a class's official syllabus (the superAdmin's curriculum)
//   9        recordsOfWorkMd      lessons taught, from the evaluated lesson plans
//   11 (i)   homeworkMd           homework set in the lesson plans
import type { StudentResult } from '@/services/resultsService';
import type { AttendanceSession, AttendanceStatus } from '@/types/attendance';
import { followUpFor, type ClassCurriculum, type EFileSectionId, type EFileSummary } from '@/types/ai';
import type { SchoolStatements } from '@/services/schoolStatementsService';

/** One table (or a few) shown in a section and printed in the PDF like a document. */
export interface SystemRecord {
  key: string;
  section: EFileSectionId;
  title: string;
  /** Lines for the letterhead, e.g. [['Class', 'Form 3A'], ['Subject', 'Computer Studies']]. */
  details: [string, string | undefined][];
  markdown: string;
  landscape?: boolean;
}

export interface LearnerRow { id: string; fullName: string; gender?: string; studentId?: string }
export interface TimetableRow { day: number; period: number; periodName: string; start?: string; end?: string; className: string; subject: string; venue?: string | null }

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const esc = (s: string) => s.replace(/\|/g, '/').replace(/\n/g, ' ');
const sexOf = (g?: string) => (g === 'male' ? 'M' : g === 'female' ? 'F' : '–');
const byName = (a: LearnerRow, b: LearnerRow) => a.fullName.localeCompare(b.fullName);
const pct = (n: number) => `${Math.round(n * 10) / 10}%`;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "2026-03-24", "24/03/2026" or "24 March 2026" (how lesson plans save it) -> a Date at noon, or null. */
export function readDate(text: string | undefined): Date | null {
  if (!text) return null;
  const t = text.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12);
  m = /^(?:[A-Za-z]+,?\s+)?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(t);
  if (m) {
    const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (month >= 0) return new Date(Number(m[3]), month, Number(m[1]), 12);
  }
  return null;
}
/** A day as "24 Mar" (any date format above; the text itself if it cannot be read). */
const shortDate = (text: string) => {
  const d = readDate(text);
  return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : text;
};
/** The date a lesson was taught: its plan's date, else when it was evaluated, else when the plan was made. */
export const lessonDay = (d: EFileSummary): Date =>
  readDate(d.inputs.date) ?? new Date(d.evaluation?.evaluatedAt ?? d.createdAt);
const byLessonDay = (a: EFileSummary, b: EFileSummary) => lessonDay(a).getTime() - lessonDay(b).getTime();
const dayCell = (d: EFileSummary) => lessonDay(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
/** Text for one table cell: one line, no pipes, Markdown lists and tables flattened. */
const flat = (text: string | undefined, max = 400) => {
  // A two-column table (| Item | Detail |) reads as "Item: detail; …".
  const lines = (text ?? '').split('\n');
  const tableRows = lines.filter((l) => l.trim().startsWith('|') && !/^\s*\|?[\s:|-]+\|?\s*$/.test(l));
  const asText = tableRows.length >= 2 && tableRows.length === lines.filter((l) => l.trim().startsWith('|')).length - 1
    ? [...lines.filter((l) => !l.trim().startsWith('|')), tableRows.slice(1).map((l) => l.split('|').map((c) => c.trim()).filter(Boolean).join(': ')).join('; ')].join(' ')
    : text ?? '';
  const one = asText.replace(/^\s*\|?\s*-{3,}.*$/gm, '').replace(/^\s*[-*]\s+/gm, '').replace(/\|/g, ' ').replace(/[*_#>]/g, '').replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max).replace(/\s+\S*$/, '')} …` : one;
};

// ───────────── 4 Time Table ─────────────

export function timetableMd(rows: TimetableRow[]): string {
  if (!rows.length) return '_No lessons on the timetable for this term yet._';
  const periods = [...new Map(rows.map((r) => [r.period, r])).values()].sort((a, b) => a.period - b.period);
  const cell = (day: number, period: number) =>
    rows.filter((r) => r.day === day && r.period === period).map((r) => `${esc(r.className)}<br>${esc(r.subject)}${r.venue ? ` (${esc(r.venue)})` : ''}`).join('<br>') || '';
  const head = `| Period | Time | ${DAYS.join(' | ')} |\n|---|---|${DAYS.map(() => '---').join('|')}|`;
  const body = periods.map((p) => `| ${esc(p.periodName)} | ${p.start && p.end ? `${p.start}–${p.end}` : ''} | ${DAYS.map((_, d) => cell(d + 1, p.period)).join(' | ')} |`);
  const perWeek = rows.length;
  const classes = [...new Set(rows.map((r) => `${r.className} ${r.subject}`))];
  return `${head}\n${body.join('\n')}\n\n**Lessons a week:** ${perWeek} (${classes.map((c) => `${c}: ${rows.filter((r) => `${r.className} ${r.subject}` === c).length}`).join('; ')})`;
}

// ───────────── 5 Class List / Register ─────────────

export function classListMd(learners: LearnerRow[]): string {
  if (!learners.length) return '_No learners in this class yet._';
  const list = [...learners].sort(byName);
  const boys = list.filter((l) => l.gender === 'male').length, girls = list.filter((l) => l.gender === 'female').length;
  return `| No. | Name | Sex | Learner No. |\n|---|---|---|---|\n${list.map((l, n) => `| ${n + 1} | ${esc(l.fullName)} | ${sexOf(l.gender)} | ${esc(l.studentId ?? '')} |`).join('\n')}\n\n**Total:** ${list.length} (Boys ${boys}, Girls ${girls})`;
}

const MARK: Record<AttendanceStatus, string> = { present: '/', absent: 'A', late: 'L', excused: 'E' };

/**
 * The subject register: one column per lesson taken this term (date and
 * period), one row per learner, / present, A absent, L late, E excused.
 * Twelve lessons per table, so it fits a landscape page.
 */
export function registerMd(learners: LearnerRow[], sessions: AttendanceSession[]): string {
  if (!sessions.length) return '_No attendance has been taken in this subject this term yet. Registers appear here as soon as attendance is taken._';
  const list = [...learners].sort(byName);
  const lessons = [...sessions].sort((a, b) => a.date.localeCompare(b.date) || (a.period ?? 0) - (b.period ?? 0));
  const chunks: AttendanceSession[][] = [];
  for (let k = 0; k < lessons.length; k += 12) chunks.push(lessons.slice(k, k + 12));
  const tables = chunks.map((chunk, c) => {
    const last = c === chunks.length - 1;
    const head = `| No. | Name | ${chunk.map((s) => `${shortDate(s.date)}${s.period ? `<br>P${s.period}` : ''}`).join(' | ')} |${last ? ' Present | % |' : ''}`;
    const rule = `|---|---|${chunk.map(() => '---').join('|')}|${last ? '---|---|' : ''}`;
    const rows = list.map((l, n) => {
      const marks = chunk.map((s) => (s.roster[l.id] ? MARK[s.roster[l.id]] : ''));
      if (!last) return `| ${n + 1} | ${esc(l.fullName)} | ${marks.join(' | ')} |`;
      const taken = lessons.filter((s) => s.roster[l.id]);
      const present = taken.filter((s) => s.roster[l.id] === 'present' || s.roster[l.id] === 'late').length;
      return `| ${n + 1} | ${esc(l.fullName)} | ${marks.join(' | ')} | ${present}/${taken.length} | ${taken.length ? Math.round((present / taken.length) * 100) : 0} |`;
    });
    const total = `| | **Present** | ${chunk.map((s) => `${s.summary.present + s.summary.late}/${s.summary.total}`).join(' | ')} |${last ? ' | |' : ''}`;
    return [head, rule, ...rows, total].join('\n');
  });
  return `${tables.join('\n\n')}\n\n**Key:** / present · A absent · L late · E excused. **Lessons taken:** ${lessons.length}.`;
}

// ───────────── 11 (ii) Progress Chart ─────────────

export const EXAMS = [
  { type: 'week4', label: 'Week 4' }, { type: 'week8', label: 'Week 8' }, { type: 'endOfTerm', label: 'End of Term' },
] as const;
export type ExamType = (typeof EXAMS)[number]['type'];

const entered = (r: StudentResult) => r.status === 'entered' && r.marks >= 0;
const cellOf = (r?: StudentResult) => (!r ? '' : r.status === 'absent' || r.marks === -1 ? 'Abs' : r.status === 'not_conducted' || r.marks === -2 ? 'N/C' : entered(r) ? `${Math.round(r.percentage)}` : '');

export function progressChartMd(learners: LearnerRow[], results: StudentResult[]): string {
  if (!results.length) return '_No marks have been entered for this class and subject this term yet._';
  const of = (id: string, t: ExamType) => results.find((r) => r.studentId === id && r.examType === t);
  // Learners with results but no longer on the class list still appear.
  const names = new Map(learners.map((l) => [l.id, l]));
  for (const r of results) if (!names.has(r.studentId)) names.set(r.studentId, { id: r.studentId, fullName: r.studentName });
  const list = [...names.values()].sort(byName);
  const trend = (id: string) => {
    const done = EXAMS.map((e) => of(id, e.type)).filter((r): r is StudentResult => !!r && entered(r));
    if (done.length < 2) return '';
    const d = done[done.length - 1].percentage - done[done.length - 2].percentage;
    return d >= 5 ? '▲' : d <= -5 ? '▼' : '►';
  };
  const head = `| No. | Name | Sex | ${EXAMS.map((e) => `${e.label} %`).join(' | ')} | Grade | Trend |\n|---|---|---|${EXAMS.map(() => '---').join('|')}|---|---|`;
  const rows = list.map((l, n) => {
    const latest = [...EXAMS].reverse().map((e) => of(l.id, e.type)).find((r) => r && entered(r));
    return `| ${n + 1} | ${esc(l.fullName)} | ${sexOf(l.gender)} | ${EXAMS.map((e) => cellOf(of(l.id, e.type))).join(' | ')} | ${latest ? latest.grade : ''} | ${trend(l.id)} |`;
  });
  return `${head}\n${rows.join('\n')}\n\n**Key:** marks in per cent; Grade = latest assessment (1 Distinction … 8 Pass, 9 Fail); ▲ up 5 or more, ▼ down 5 or more, ► about the same; Abs absent; N/C not conducted.`;
}

// ───────────── 11 (vi) Analysis Sheet ─────────────

export interface ExamStats { label: string; sat: number; boys: number; girls: number; passed: number; mean: number; highest?: StudentResult; lowest?: StudentResult; grades: { boys: number[]; girls: number[]; unknown: number[] } }

export function examStats(label: string, learners: LearnerRow[], results: StudentResult[]): ExamStats | null {
  const sat = results.filter(entered);
  if (!sat.length) return null;
  const sex = new Map(learners.map((l) => [l.id, l.gender]));
  const grades = { boys: Array(9).fill(0) as number[], girls: Array(9).fill(0) as number[], unknown: Array(9).fill(0) as number[] };
  for (const r of sat) {
    const g = Math.min(9, Math.max(1, r.grade)) - 1;
    const sx = sex.get(r.studentId);
    if (sx === 'female') grades.girls[g]++;
    else if (sx === 'male') grades.boys[g]++;
    else grades.unknown[g]++;
  }
  const sorted = [...sat].sort((a, b) => b.percentage - a.percentage);
  return {
    label, sat: sat.length, boys: grades.boys.reduce((a, b) => a + b, 0), girls: grades.girls.reduce((a, b) => a + b, 0),
    passed: sat.filter((r) => r.grade <= 8).length, mean: sat.reduce((a, r) => a + r.percentage, 0) / sat.length,
    highest: sorted[0], lowest: sorted[sorted.length - 1], grades,
  };
}

export function analysisMd(learners: LearnerRow[], results: StudentResult[]): string {
  const stats = EXAMS.map((e) => examStats(e.label, learners, results.filter((r) => r.examType === e.type))).filter((s): s is ExamStats => s !== null);
  if (!stats.length) return '_The analysis appears once marks are entered._';
  const g = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const blocks = stats.map((s) => {
    const passB = s.grades.boys.slice(0, 8).reduce((a, b) => a + b, 0), passG = s.grades.girls.slice(0, 8).reduce((a, b) => a + b, 0);
    const row = (name: string, counts: number[], sat: number, pass: number) => `| ${name} | ${counts.join(' | ')} | ${sat} | ${pass} | ${sat - pass} | ${sat ? pct((pass / sat) * 100) : '–'} |`;
    const total = s.grades.boys.map((b, k) => b + s.grades.girls[k] + s.grades.unknown[k]);
    const unknown = s.grades.unknown.reduce((a, b) => a + b, 0);
    const unknownRow = unknown ? `\n${row('Sex not recorded', s.grades.unknown, unknown, s.grades.unknown.slice(0, 8).reduce((a, b) => a + b, 0))}` : '';
    return `### ${s.label}\n\n| | ${g.map((x) => `G${x}`).join(' | ')} | Sat | Pass | Fail | Pass % |\n|---|${g.map(() => '---').join('|')}|---|---|---|---|\n${row('Boys', s.grades.boys, s.boys, passB)}\n${row('Girls', s.grades.girls, s.girls, passG)}${unknownRow}\n${row('**Total**', total, s.sat, s.passed)}\n\n**Mean mark:** ${pct(s.mean)} · **Highest:** ${s.highest ? `${esc(s.highest.studentName)} (${Math.round(s.highest.percentage)}%)` : '–'} · **Lowest:** ${s.lowest ? `${esc(s.lowest.studentName)} (${Math.round(s.lowest.percentage)}%)` : '–'} · **Quality (grades 1–4):** ${pct((total.slice(0, 4).reduce((a, b) => a + b, 0) / s.sat) * 100)}`;
  });
  return `${blocks.join('\n\n')}\n\n**Grades:** 1–2 Distinction, 3–4 Merit, 5–6 Credit, 7–8 Pass, 9 Fail (0–39%). Grade 9 is the only fail.`;
}

// ───────────── 11 (vii) Remedial Work Plan ─────────────

/** Learners who failed (grade 9) the latest assessment with marks, for remedial work. */
export function remedialLearnersMd(results: StudentResult[]): string {
  const latest = [...EXAMS].reverse().find((e) => results.some((r) => r.examType === e.type && entered(r)));
  if (!latest) return '';
  const failed = results.filter((r) => r.examType === latest.type && entered(r) && r.grade === 9).sort((a, b) => a.percentage - b.percentage);
  if (!failed.length) return `No learner failed the ${latest.label} assessment (grade 9).`;
  return `Learners who failed the **${latest.label}** assessment (grade 9, 0–39%):\n\n| No. | Name | Mark % | Area needing remedial work | Remedial activity | Date done | Mark after |\n|---|---|---|---|---|---|---|\n${failed.map((r, n) => `| ${n + 1} | ${esc(r.studentName)} | ${Math.round(r.percentage)} | | | | |`).join('\n')}`;
}

const ADVICE_PROBLEM = {
  remedial: 'Competence not achieved by enough learners',
  continuation: 'Part of the lesson not covered',
  revision: 'Most learners achieved it; a few need a recap',
};

/**
 * Lessons whose evaluation called for follow-up work, from the eFile's
 * lesson plans: what was found, what is planned, and whether it is done.
 */
export function remedialLessonsMd(documents: EFileSummary[]): string {
  const plans = documents.filter((d) => d.feature === 'lessonPlan' && d.evaluation);
  const rows = plans.flatMap((d) => {
    const advice = followUpFor(d.evaluation!.answers);
    if (!advice) return [];
    const a = d.evaluation!.answers;
    const follow = d.followUp ? documents.find((x) => x.id === d.followUp!.id) : undefined;
    const detail = [a.notCovered, a.support].map((x) => x.trim()).filter(Boolean).join('; ');
    const action = advice === 'revision' ? 'Recap at the start of the next lesson'
      : follow ? `${d.followUp!.kind === 'remedial' ? 'Remedial' : 'Continuation'} lesson planned${follow.inputs.date ? ` for ${shortDate(follow.inputs.date)}` : ''}`
        : `${advice === 'remedial' ? 'Remedial' : 'Continuation'} lesson recommended (not yet planned)`;
    const status = advice === 'revision' ? '' : follow?.evaluation ? (followUpFor(follow.evaluation.answers) === 'remedial' ? 'Taught; still not achieved' : 'Done') : follow ? 'Planned' : 'Pending';
    return [{ date: lessonDay(d).toISOString(), row: `| ${dayCell(d)} | ${esc(d.inputs.className || d.inputs.level || '')} | ${esc(d.inputs.subTopic || d.inputs.topic || d.title)} | ${ADVICE_PROBLEM[advice]}${detail ? `: ${esc(detail)}` : ''} | ${action} | ${status} |` }];
  });
  if (!rows.length) return '';
  rows.sort((x, y) => x.date.localeCompare(y.date));
  return `Lessons whose evaluation called for follow-up work:\n\n| Date | Class | Sub-topic | Problem identified | Remedial action | Status |\n|---|---|---|---|---|---|\n${rows.map((r) => r.row).join('\n')}`;
}

// ───────────── 11 (v) Scripts Samples: which scripts to scan ─────────────

/** The Results exam an assessment was written for, from its type ("Week 4 test", "End of term examination"). */
export function examTypeOf(kind: string): ExamType | null {
  if (/week\s*4/i.test(kind)) return 'week4';
  if (/week\s*8/i.test(kind)) return 'week8';
  if (/end[\s-]*of[\s-]*term|final|examination/i.test(kind)) return 'endOfTerm';
  return null;
}

/**
 * The learners whose scripts to keep, from the marks entered in Results:
 * the highest mark, the mark closest to the class mean, and the lowest.
 */
export function scriptSuggestions(results: StudentResult[], examType: ExamType): Partial<Record<'highest' | 'average' | 'lowest', { learner: string; mark: number; outOf: number }>> {
  const sat = results.filter((r) => r.examType === examType && entered(r)).sort((a, b) => b.percentage - a.percentage);
  if (!sat.length) return {};
  const mean = sat.reduce((a, r) => a + r.percentage, 0) / sat.length;
  const middle = sat.slice(1, -1).length ? sat.slice(1, -1) : sat;
  const average = middle.reduce((best, r) => (Math.abs(r.percentage - mean) < Math.abs(best.percentage - mean) ? r : best));
  const one = (r: StudentResult) => ({ learner: r.studentName, mark: r.marks, outOf: r.totalMarks });
  return { highest: one(sat[0]), average: one(average), lowest: one(sat[sat.length - 1]) };
}

// ───────────── 1 Vision, 2 Mission Statement (written by the admin) ─────────────

/** The admin's statements for one section, with the teacher's own departments. Empty string if none are written yet. */
export function statementsMd(kind: 'vision' | 'mission', st: SchoolStatements, departments: string[], schoolName: string): string {
  const label = kind === 'vision' ? 'Vision' : 'Mission statement';
  const blocks = [
    [`${label} of the Ministry of Education`, st.ministry[kind]],
    [`${label} of ${schoolName}`, st.school[kind]],
    ...departments.map((d) => [`${label} of the ${d} Department`, st.departments[d]?.[kind] ?? ''] as const),
  ].filter(([, text]) => text.trim());
  return blocks.map(([heading, text]) => `## ${heading}\n${text.trim()}`).join('\n\n');
}

// ───────────── 6 Syllabus (the official curriculum, from the AI server) ─────────────

/**
 * A class's syllabus as tables, one per topic: sub-topic, specific
 * competences, learning activities and expected standards. Only the term's
 * topics when the teaching module says which term each is taught in (and
 * `term` is given). Curriculum document names are never printed.
 */
export function syllabusMd(c: ClassCurriculum, term?: number | null): string {
  const ofTerm = term && c.terms ? c.topics.filter((t) => c.terms![t.code] === term) : [];
  const topics = ofTerm.length ? ofTerm : c.topics;
  if (!topics.length) return '_No topics are loaded for this class yet._';
  const list = (items: string[]) => items.map((x) => esc(x.trim())).filter(Boolean).join('<br>');
  const head = '| Sub-topic | Specific competences | Learning activities | Expected standards |\n|---|---|---|---|';
  const blocks = topics.map((t) => {
    const rowsOf = t.subTopics.map((s) => `| **${esc(s.code)}** ${esc(s.name)} | ${list(s.competences.map((k) => `${k.code} ${k.text}`))} | ${list(s.competences.flatMap((k) => k.activities))} | ${list(s.competences.flatMap((k) => k.standards))} |`);
    const when = c.terms?.[t.code] ? ` (Term ${c.terms[t.code]})` : '';
    return `### ${esc(t.code)} ${esc(t.name)}${when}\n\n${head}\n${rowsOf.join('\n')}`;
  });
  const note = ofTerm.length ? `\n\n_Topics taught in Term ${term}, as the teaching module sets them out._` : '';
  return blocks.join('\n\n') + note;
}

// ───────────── Lesson plans → 10, 11 (i) ─────────────

const subTopicOf = (d: EFileSummary) => [d.inputs.subTopicCode, d.inputs.subTopic].filter(Boolean).join(' ') || d.inputs.topic || d.title;
const lessonOfLabel = (d: EFileSummary) => (d.inputs.lessonNumber ? `Lesson ${d.inputs.lessonNumber}${d.inputs.lessonsTotal ? ` of ${d.inputs.lessonsTotal}` : ''}` : '');

/** "By the end of the lesson, learners will be able to name …" -> "Name …". */
const workCovered = (goal?: string) => {
  const rest = (goal ?? '').replace(/^\s*by the end of (the|this) lesson,?\s*/i, '').replace(/^(the )?learners (will|should) be able to\s*/i, '').trim();
  return rest ? rest[0].toUpperCase() + rest.slice(1) : '';
};

const ACHIEVED_LABEL: Record<string, string> = { fully: 'Fully achieved', mostly: 'Mostly achieved', partly: 'Partly achieved', not: 'Not achieved' };
const REACHED_LABEL: Record<string, string> = { all: 'all learners', most: 'most learners', half: 'about half the learners', few: 'a few learners' };
const COVERAGE_LABEL: Record<string, string> = { all: 'whole plan covered', most: 'most of the plan covered', part: 'only part covered' };

/**
 * 10 Records of Work: the lessons actually taught, i.e. the lesson plans
 * evaluated after the lesson, in date order. One table per class and subject.
 */
export function recordsOfWorkMd(plans: EFileSummary[]): string {
  const taught = plans.filter((d) => d.evaluation).sort(byLessonDay);
  const notYet = plans.length - taught.length;
  const waiting = notYet ? `\n\n_${notYet} lesson plan${notYet === 1 ? ' is' : 's are'} not evaluated yet: evaluate ${notYet === 1 ? 'it' : 'them'} after teaching to add ${notYet === 1 ? 'it' : 'them'} here._` : '';
  if (!taught.length) return `_No lessons recorded yet. A lesson is recorded here as soon as its lesson plan is evaluated after teaching._${waiting}`;
  const head = '| Date | Topic / Sub-topic | Work covered | Homework / exercise | How it went | Follow-up |\n|---|---|---|---|---|---|';
  const rows = taught.map((d) => {
    const a = d.evaluation!.answers;
    const how = [ACHIEVED_LABEL[a.achieved], REACHED_LABEL[a.reached] && `${REACHED_LABEL[a.reached]} met the standard`, COVERAGE_LABEL[a.coverage]].filter(Boolean).join('; ');
    const advice = followUpFor(a);
    const follow = d.followUp
      ? `${d.followUp.kind === 'remedial' ? 'Remedial' : 'Continuation'} lesson planned`
      : advice === 'remedial' ? 'Remedial lesson needed' : advice === 'continuation' ? 'Continue next lesson' : advice === 'revision' ? 'Recap next lesson' : 'None';
    const topic = [d.inputs.topic, subTopicOf(d) !== d.inputs.topic ? subTopicOf(d) : '', lessonOfLabel(d)].filter(Boolean).map((x) => esc(x)).join('<br>');
    return `| ${dayCell(d)} | ${topic} | ${esc(flat(workCovered(d.extracts?.goal), 260)) || '________'} | ${esc(flat(d.extracts?.homework, 200)) || '________'} | ${esc(how)} | ${follow} |`;
  });
  return `${head}\n${rows.join('\n')}\n\n**Lessons taught:** ${taught.length}.${waiting}`;
}

/** 11 (i) Homework: the homework set in each lesson plan, with columns left for marking. */
export function homeworkMd(plans: EFileSummary[]): string {
  const set = plans.filter((d) => d.extracts?.homework).sort(byLessonDay);
  if (!set.length) return '_No homework yet. The homework in each lesson plan appears here._';
  const head = '| Date given | Sub-topic | Homework | Date marked | Learners who did it | Remarks |\n|---|---|---|---|---|---|';
  return `${head}\n${set.map((d) => `| ${dayCell(d)} | ${esc(subTopicOf(d))} | ${esc(flat(d.extracts!.homework, 500))} | | | |`).join('\n')}`;
}

