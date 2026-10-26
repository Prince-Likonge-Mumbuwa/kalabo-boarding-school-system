// @/services/markScheduleProgress.ts
//
// The "performance & progress" part of a subject's mark schedule: how each
// learner, and the class, is doing as the tests of the year go by —
// Term 1 Week 4, Week 8, End of Term, then Term 2 … up to the term shown.
//
// Built from the SAME results grids as Results Entry and the report cards
// (resultsGrid.ts), one per term, so a learner's term average here is the
// subject average on their report card for that term.
//
// PURE: no Firebase. Loading is in markScheduleProgressLoader.ts.

import {
  EXAM_LABELS,
  getCell,
  gradeForPercentage,
  totalMarksFor,
  type ExamType,
  type GridCell,
  type ResultsGrid,
} from '@/services/resultsGrid';
import type { ExamConfig } from '@/types/exam';

export interface TermGridInput {
  term: string;
  year: number;
  /** null when the term could not be loaded (see `error`). */
  grid: ResultsGrid | null;
  config?: ExamConfig | null;
  error?: string;
}

/** One test in the year, e.g. Term 1 Week 4. */
export interface ProgressPoint {
  key: string;
  term: string;
  year: number;
  examType: ExamType;
  /** "T1 W4", "T2 EOT" */
  short: string;
  /** "Term 1 Week 4" */
  label: string;
  totalMarks: number | null;
}

export interface ProgressTerm {
  key: string;
  term: string;
  year: number;
  short: string;
  points: ProgressPoint[];
}

export interface ProgressCell {
  status: GridCell['status'] | 'not_in_class';
  marks: number | null;
  percentage: number | null;
}

export interface LearnerProgressRow {
  learnerId: string;
  studentId: string;
  name: string;
  cells: Record<string, ProgressCell>;
  /** Per term key: mean of entered percentages (rounded) — the report card's subject average. */
  termAverages: Record<string, number | null>;
  /** Mean of the term averages so far (rounded). */
  yearAverage: number | null;
  /** Grade of the year average (1–9), -1 when no marks. */
  grade: number;
  /** First and latest entered percentage in test order. */
  first: number | null;
  latest: number | null;
  /** latest − first, when there are at least two marks. */
  change: number | null;
  /** Position in class by year average (ties share), '—' with no marks. */
  position: string;
}

export interface PointStats {
  key: string;
  entered: number;
  absent: number;
  notConducted: number;
  pending: number;
  /** Class mean of entered percentages (rounded), null when none. */
  mean: number | null;
  highest: number | null;
  lowest: number | null;
  /** % of entered marks at 40% or more (pass = grades 1–8). */
  passRate: number | null;
  /** % of entered marks at 70% or more (grades 1–2). */
  qualityRate: number | null;
}

export interface SubjectProgressReport {
  subjectName: string;
  terms: ProgressTerm[];
  points: ProgressPoint[];
  rows: LearnerProgressRow[];
  stats: Record<string, PointStats>;
  /** Learners per grade 1–9 by year average (index 0 = grade 1). */
  gradeDistribution: number[];
  /** Biggest rises (≥ 10 points), best first, at most 5. */
  improved: LearnerProgressRow[];
  /** Latest mark below 40%, or a fall of 10 points or more. */
  needsAttention: LearnerProgressRow[];
  /** Terms that could not be loaded, with the reason. */
  problems: string[];
  /** True when at least one mark exists anywhere. */
  hasMarks: boolean;
}

const SHORT_EXAM: Record<ExamType, string> = { week4: 'W4', week8: 'W8', endOfTerm: 'EOT' };
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (x: number | null) => (x === null ? null : Math.round(x));

/** The grid's id for a subject, matched however it is spelled. */
export function findSubjectId(grid: ResultsGrid, candidates: Array<string | null | undefined>): string | null {
  const keys = candidates.filter((c): c is string => !!c).map(squash);
  const s = grid.subjects.find(x => keys.includes(squash(x.subjectId)) || keys.includes(squash(x.subjectName)));
  return s?.subjectId ?? null;
}

/**
 * Build the report for one subject of one class.
 * `terms` in order (Term 1 first); the LAST is the term shown, and its
 * class list is the list of learners.
 */
export function buildSubjectProgressReport(input: {
  subject: string;
  subjectCandidates?: Array<string | null | undefined>;
  terms: TermGridInput[];
}): SubjectProgressReport {
  const candidates = [input.subject, ...(input.subjectCandidates ?? [])];
  const problems: string[] = [];
  const terms: ProgressTerm[] = [];
  const termData: Array<{ t: ProgressTerm; grid: ResultsGrid; subjectId: string | null }> = [];

  for (const ti of input.terms) {
    const short = ti.term.replace(/^Term\s*/i, 'T');
    if (!ti.grid) {
      problems.push(`${ti.term} ${ti.year} could not be loaded${ti.error ? `: ${ti.error}` : ''}.`);
      continue;
    }
    const subjectId = findSubjectId(ti.grid, candidates);
    const key = `${ti.year}|${ti.term}`;
    const points: ProgressPoint[] = ti.grid.activeExams.map(examType => ({
      key: `${key}|${examType}`,
      term: ti.term,
      year: ti.year,
      examType,
      short: `${short} ${SHORT_EXAM[examType]}`,
      label: `${ti.term} ${EXAM_LABELS[examType]}`,
      totalMarks: totalMarksFor(ti.config ?? undefined, examType),
    }));
    if (!points.length) continue;
    const t: ProgressTerm = { key, term: ti.term, year: ti.year, short, points };
    terms.push(t);
    termData.push({ t, grid: ti.grid, subjectId });
  }

  const points = terms.flatMap(t => t.points);
  const shown = input.terms.length ? input.terms[input.terms.length - 1] : null;
  const roster = shown?.grid?.learners ?? [];

  const rows: LearnerProgressRow[] = roster.map(l => {
    const cells: Record<string, ProgressCell> = {};
    const termAverages: Record<string, number | null> = {};
    const series: number[] = [];
    for (const { t, grid, subjectId } of termData) {
      // The same learner in an earlier term: by record id, else by admission number.
      const inTerm = grid.learners.find(x => x.id === l.id) ?? (l.studentId ? grid.learners.find(x => x.studentId === l.studentId) : undefined);
      const scores: number[] = [];
      for (const p of t.points) {
        if (!inTerm || !subjectId) {
          cells[p.key] = { status: 'not_in_class', marks: null, percentage: null };
          continue;
        }
        const c = getCell(grid, inTerm.id, subjectId, p.examType);
        cells[p.key] = { status: c.status, marks: c.marks, percentage: c.percentage };
        if (c.status === 'entered' && c.percentage !== null) {
          scores.push(c.percentage);
          series.push(c.percentage);
        }
      }
      termAverages[t.key] = round(mean(scores));
    }
    const avgs = Object.values(termAverages).filter((x): x is number => x !== null);
    const yearAverage = round(mean(avgs));
    const first = series.length ? series[0] : null;
    const latest = series.length ? series[series.length - 1] : null;
    return {
      learnerId: l.id,
      studentId: l.studentId,
      name: l.name,
      cells,
      termAverages,
      yearAverage,
      grade: yearAverage === null ? -1 : gradeForPercentage(yearAverage),
      first,
      latest,
      change: series.length >= 2 ? latest! - first! : null,
      position: '—',
    };
  });

  // Positions by year average; ties share (1, 2, 2, 4).
  const ranked = rows.filter(r => r.yearAverage !== null).sort((a, b) => b.yearAverage! - a.yearAverage!);
  ranked.forEach((r, i) => {
    r.position = i > 0 && ranked[i - 1].yearAverage === r.yearAverage ? ranked[i - 1].position : String(i + 1);
  });

  const stats: Record<string, PointStats> = {};
  for (const p of points) {
    const entered: number[] = [];
    let absent = 0, nc = 0, pending = 0;
    for (const r of rows) {
      const c = r.cells[p.key];
      if (!c || c.status === 'not_in_class') continue;
      if (c.status === 'entered' && c.percentage !== null) entered.push(c.percentage);
      else if (c.status === 'absent') absent++;
      else if (c.status === 'not_conducted') nc++;
      else pending++;
    }
    const n = entered.length;
    stats[p.key] = {
      key: p.key,
      entered: n,
      absent,
      notConducted: nc,
      pending,
      mean: round(mean(entered)),
      highest: n ? Math.max(...entered) : null,
      lowest: n ? Math.min(...entered) : null,
      passRate: n ? Math.round((entered.filter(x => Math.round(x) >= 40).length / n) * 100) : null,
      qualityRate: n ? Math.round((entered.filter(x => Math.round(x) >= 70).length / n) * 100) : null,
    };
  }

  const gradeDistribution = Array.from({ length: 9 }, () => 0);
  for (const r of rows) if (r.grade >= 1 && r.grade <= 9) gradeDistribution[r.grade - 1]++;

  const improved = rows
    .filter(r => r.change !== null && r.change >= 10)
    .sort((a, b) => b.change! - a.change! || a.name.localeCompare(b.name))
    .slice(0, 5);
  const needsAttention = rows
    .filter(r => (r.latest !== null && Math.round(r.latest) < 40) || (r.change !== null && r.change <= -10))
    .sort((a, b) => (a.latest ?? 0) - (b.latest ?? 0) || a.name.localeCompare(b.name));

  return {
    subjectName: input.subject,
    terms,
    points,
    rows,
    stats,
    gradeDistribution,
    improved,
    needsAttention,
    problems,
    hasMarks: Object.values(stats).some(s => s.entered > 0),
  };
}

/** What a cell prints as: "72", "ABS", "N/C", "—" (pending), "" (not in class). */
export function cellText(c: ProgressCell | undefined): string {
  if (!c || c.status === 'not_in_class') return '';
  if (c.status === 'entered') return c.percentage === null ? '—' : String(Math.round(c.percentage));
  if (c.status === 'absent') return 'ABS';
  if (c.status === 'not_conducted') return 'N/C';
  return '—';
}
