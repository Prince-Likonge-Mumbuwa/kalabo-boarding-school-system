// @/services/resultsGrid.ts
//
// ============================================================================
//  RESULTS GRID — the single definition of "what has been entered"
// ============================================================================
//
//  Every results screen used to count on its own: the Results Entry page, the
//  admin Results Entry Monitor, the teacher dashboard warning, the Report
//  Cards progress bar, the report card itself, the results SMS and the Parent
//  Portal. They used different class lists, subject lists, exam lists and
//  counting rules, so they disagreed.
//
//  This module defines ONE grid per class + term + year:
//
//        active learners  ×  subjects (slots, no Form Teacher)  ×  active exams
//
//  Each cell is one of:
//        entered        a real mark (marks >= 0)
//        absent         marks === -1
//        not_conducted  marks === -2 (or the whole exam column was marked
//                       not conducted for this subject)
//        pending        nothing saved yet
//
//  Every screen derives its numbers from the grid with the helpers below, so
//  for the same data they cannot disagree.
//
//  This file is PURE (no Firebase imports) so it can be unit-tested. The
//  Firestore loading lives in resultsGridLoader.ts.
// ============================================================================

import { isExamActive, type ExamConfig, type ExamType } from '@/types/exam';

export type { ExamType } from '@/types/exam';

// ==================== CONSTANTS ====================

export const ALL_EXAM_TYPES: ExamType[] = ['week4', 'week8', 'endOfTerm'];

export const EXAM_LABELS: Record<ExamType, string> = {
  week4: 'Week 4',
  week8: 'Week 8',
  endOfTerm: 'End of Term',
};

/**
 * Sentinel values used in mark fields across the app (results rows, report
 * card subject rows, PDF inputs).
 *   -1  absent
 *   -2  not conducted
 *   -3  pending (no mark saved yet). Used on report cards so a missing mark is
 *       never printed as "ABS".
 */
export const MARK = {
  ABSENT: -1,
  NOT_CONDUCTED: -2,
  PENDING: -3,
} as const;

// ==================== GRADES (ECZ 1–9) ====================

export const GRADE_BANDS: Array<{ grade: number; min: number; description: string; code: string }> = [
  { grade: 1, min: 75, description: 'Distinction', code: 'D1' },
  { grade: 2, min: 70, description: 'Distinction', code: 'D2' },
  { grade: 3, min: 65, description: 'Merit', code: 'M1' },
  { grade: 4, min: 60, description: 'Merit', code: 'M2' },
  { grade: 5, min: 55, description: 'Credit', code: 'C1' },
  { grade: 6, min: 50, description: 'Credit', code: 'C2' },
  { grade: 7, min: 45, description: 'Satisfactory', code: 'S1' },
  { grade: 8, min: 40, description: 'Satisfactory', code: 'S2' },
  { grade: 9, min: 0, description: 'Unsatisfactory', code: 'U' },
];

/** ECZ grade 1–9 for a percentage; -1 when there is no percentage. */
export const gradeForPercentage = (percentage: number | null | undefined): number => {
  if (typeof percentage !== 'number' || percentage < 0 || Number.isNaN(percentage)) return -1;
  for (const band of GRADE_BANDS) if (percentage >= band.min) return band.grade;
  return 9;
};

/** "Distinction", "Merit"… or "Incomplete" for -1. */
export const gradeDescription = (grade: number): string =>
  GRADE_BANDS.find(b => b.grade === grade)?.description ?? 'Incomplete';

/** "D1", "M2"… or "X" for -1. */
export const gradeCode = (grade: number): string =>
  GRADE_BANDS.find(b => b.grade === grade)?.code ?? 'X';

// ==================== TERM / EXAM CONFIG ====================

/**
 * The config for a term: the first matching config that is not switched off.
 * If every matching config is switched off, returns the first one anyway —
 * `isExamActive()` then treats all its exams as inactive.
 */
export function pickTermConfig<T extends Pick<ExamConfig, 'term' | 'year' | 'isActive'>>(
  configs: T[] | undefined | null,
  term: string,
  year: number
): T | undefined {
  if (!configs?.length) return undefined;
  const matching = configs.filter(c => c.term === term && Number(c.year) === Number(year));
  return matching.find(c => c.isActive !== false) ?? matching[0];
}

/** Active exams, in canonical order, by the app-wide `isExamActive()` rule. */
export const activeExamsFor = (config: ExamConfig | undefined | null): ExamType[] =>
  ALL_EXAM_TYPES.filter(t => isExamActive(config, t));

/** Total marks configured for an exam, or null when not configured. */
export const totalMarksFor = (
  config: ExamConfig | undefined | null,
  examType: ExamType
): number | null => {
  if (!config) return null;
  const v =
    examType === 'week4'
      ? config.week4TotalMarks
      : examType === 'week8'
      ? config.week8TotalMarks
      : config.endOfTermTotalMarks;
  return typeof v === 'number' && v > 0 ? v : null;
};

// ==================== INPUT TYPES ====================

/** A learner as stored in `learners` (only the fields the grid needs). */
export interface RawLearner {
  /** Firestore document id — the key results rows store in `studentId`. */
  id: string;
  /** Custom id such as "F1A_001" (may be empty on old records). */
  studentId?: string;
  name: string;
  status?: string;
  gender?: string;
  studentIndex?: number;
  classId?: string;
}

export interface GridLearner {
  id: string;
  studentId: string;
  name: string;
  gender?: string;
  studentIndex?: number;
}

/** A subject the class takes, with who is responsible for it. */
export interface GridSubject {
  /** Normalised subject id, e.g. "Mathematics" — what results store. */
  subjectId: string;
  /** Display name. */
  subjectName: string;
  /** Owner (Primary Owner) of the slot. */
  ownerTeacherId: string | null;
  ownerTeacherName: string | null;
  /** Who may enter marks right now (cover/TP while live, else the owner). */
  operatorTeacherId: string | null;
  operatorTeacherName: string | null;
  /** 'owner' | 'leave-cover' | 'tp' | null (vacant). */
  operatorRole: string | null;
}

/** A results row (only the fields the grid needs). */
export interface RawResult {
  studentId: string;
  subjectId: string;
  examType: string;
  marks: number;
  totalMarks?: number;
  percentage?: number;
  updatedAt?: string;
}

// ==================== ROSTER ====================

/**
 * Who counts in a class: learners whose status is "active", or who have no
 * status at all (records created before the status field existed are
 * treated as active, matching how the learner mapper reads them).
 * Archived / withdrawn / transferred learners do not count.
 */
export const isCountedLearner = (l: Pick<RawLearner, 'status'>): boolean =>
  l.status === undefined || l.status === null || l.status === '' || l.status === 'active';

export function buildRoster(learners: RawLearner[]): GridLearner[] {
  return learners
    .filter(isCountedLearner)
    .map(l => ({
      id: l.id,
      studentId: l.studentId || '',
      name: l.name || 'Unknown',
      gender: l.gender,
      studentIndex: l.studentIndex,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ==================== GRID ====================

export type CellStatus = 'entered' | 'absent' | 'not_conducted' | 'pending';

export interface GridCell {
  status: CellStatus;
  /** Raw marks as saved (null when pending). */
  marks: number | null;
  /** Percentage for an entered mark, else null. */
  percentage: number | null;
}

export interface ResultsGrid {
  activeExams: ExamType[];
  learners: GridLearner[];
  subjects: GridSubject[];
  /** key: `${learnerId}|${subjectId}|${examType}` */
  cells: Map<string, GridCell>;
  /** (subjectId|examType) columns marked not conducted for the whole class. */
  notConductedColumns: Set<string>;
  /** Rows ignored, with the reason — shown by the data check. */
  ignored: {
    offRoster: number;
    unknownSubject: number;
    inactiveExam: number;
  };
}

export const cellKey = (learnerId: string, subjectId: string, examType: string) =>
  `${learnerId}|${subjectId}|${examType}`;

const columnKey = (subjectId: string, examType: string) => `${subjectId}|${examType}`;

const PENDING_CELL: GridCell = { status: 'pending', marks: null, percentage: null };

const percentageOf = (r: RawResult): number => {
  if (typeof r.percentage === 'number' && r.percentage >= 0) return r.percentage;
  if (typeof r.totalMarks === 'number' && r.totalMarks > 0) {
    return Math.round((r.marks / r.totalMarks) * 100);
  }
  return r.marks; // last resort: treat as a percentage
};

/**
 * Build the grid.
 *
 * Rules:
 *  - Only learners on the roster count. A result for anyone else (moved out,
 *    archived) is ignored and counted in `ignored.offRoster`.
 *  - A result is matched to a learner by Firestore document id, or by the
 *    learner's custom id for rows saved by older code.
 *  - Only subjects in `subjects` count (Form Teacher is never one).
 *  - Only active exams count.
 *  - Whole-column "not conducted": if a subject's exam has at least one -2
 *    row and NO real mark or absence, the exam was not held for that subject
 *    and every learner's cell is not_conducted — including learners who
 *    joined later.
 */
export function buildResultsGrid(input: {
  learners: GridLearner[];
  subjects: GridSubject[];
  activeExams: ExamType[];
  results: RawResult[];
}): ResultsGrid {
  const { learners, subjects, activeExams, results } = input;

  const byDocId = new Map(learners.map(l => [l.id, l]));
  const byCustomId = new Map<string, GridLearner>();
  for (const l of learners) {
    if (l.studentId && !byDocId.has(l.studentId)) byCustomId.set(l.studentId, l);
  }
  const subjectIds = new Set(subjects.map(s => s.subjectId));
  const examSet = new Set<string>(activeExams);

  const cells = new Map<string, GridCell>();
  const cellUpdatedAt = new Map<string, string>();
  const ignored = { offRoster: 0, unknownSubject: 0, inactiveExam: 0 };

  // Per column: does it have any real mark / absence, and any -2?
  const columnHasReal = new Set<string>();
  const columnHasNC = new Set<string>();

  for (const r of results) {
    if (!subjectIds.has(r.subjectId)) {
      ignored.unknownSubject++;
      continue;
    }
    if (!examSet.has(r.examType)) {
      ignored.inactiveExam++;
      continue;
    }
    const learner = byDocId.get(r.studentId) ?? byCustomId.get(r.studentId);
    if (!learner) {
      ignored.offRoster++;
      continue;
    }

    const col = columnKey(r.subjectId, r.examType);
    let cell: GridCell;
    if (r.marks === MARK.NOT_CONDUCTED) {
      cell = { status: 'not_conducted', marks: r.marks, percentage: null };
      columnHasNC.add(col);
    } else if (r.marks === MARK.ABSENT) {
      cell = { status: 'absent', marks: r.marks, percentage: null };
      columnHasReal.add(col);
    } else if (typeof r.marks === 'number' && r.marks >= 0) {
      cell = { status: 'entered', marks: r.marks, percentage: percentageOf(r) };
      columnHasReal.add(col);
    } else {
      continue; // unknown sentinel — treat as nothing saved
    }

    const key = cellKey(learner.id, r.subjectId, r.examType);
    // If two rows exist for one cell (legacy duplicates), keep the newest.
    const prev = cellUpdatedAt.get(key);
    if (prev !== undefined && (r.updatedAt ?? '') < prev) continue;
    cells.set(key, cell);
    cellUpdatedAt.set(key, r.updatedAt ?? '');
  }

  const notConductedColumns = new Set<string>();
  for (const col of columnHasNC) {
    if (!columnHasReal.has(col)) notConductedColumns.add(col);
  }

  // Fill the whole-column not-conducted cells and the pending cells.
  for (const l of learners) {
    for (const s of subjects) {
      for (const e of activeExams) {
        const key = cellKey(l.id, s.subjectId, e);
        if (notConductedColumns.has(columnKey(s.subjectId, e))) {
          cells.set(key, { status: 'not_conducted', marks: MARK.NOT_CONDUCTED, percentage: null });
        } else if (!cells.has(key)) {
          cells.set(key, PENDING_CELL);
        }
      }
    }
  }

  return { activeExams, learners, subjects, cells, notConductedColumns, ignored };
}

export const getCell = (
  grid: ResultsGrid,
  learnerId: string,
  subjectId: string,
  examType: ExamType
): GridCell => grid.cells.get(cellKey(learnerId, subjectId, examType)) ?? PENDING_CELL;

/** A cell that needs no more work (entered, absent or not conducted). */
export const isDone = (c: GridCell) => c.status !== 'pending';

// ==================== SUBJECT VIEW (Results Entry + Monitor) ====================

export interface ExamProgress {
  examType: ExamType;
  /** Learners whose cell is done (entered + absent + not conducted). */
  doneCount: number;
  enteredCount: number;
  absentCount: number;
  notConductedCount: number;
  totalCount: number;
  percentage: number;
  /** Whole exam marked not conducted for this subject. */
  notConducted: boolean;
  missingLearnerIds: string[];
}

export interface SubjectProgress {
  subjectId: string;
  subjectName: string;
  totalStudents: number;
  exams: ExamProgress[];
  requiredEntries: number;
  doneEntries: number;
  missingEntries: number;
  completionPercentage: number;
  isComplete: boolean;
}

const pct = (done: number, total: number, emptyValue: number) =>
  total > 0 ? Math.round((done / total) * 100) : emptyValue;

export function subjectProgress(grid: ResultsGrid, subjectId: string): SubjectProgress {
  const subject = grid.subjects.find(s => s.subjectId === subjectId);
  const total = grid.learners.length;
  const exams: ExamProgress[] = grid.activeExams.map(examType => {
    let entered = 0;
    let absent = 0;
    let nc = 0;
    const missing: string[] = [];
    for (const l of grid.learners) {
      const c = getCell(grid, l.id, subjectId, examType);
      if (c.status === 'entered') entered++;
      else if (c.status === 'absent') absent++;
      else if (c.status === 'not_conducted') nc++;
      else missing.push(l.id);
    }
    const done = entered + absent + nc;
    return {
      examType,
      doneCount: done,
      enteredCount: entered,
      absentCount: absent,
      notConductedCount: nc,
      totalCount: total,
      percentage: pct(done, total, 100),
      notConducted: grid.notConductedColumns.has(columnKey(subjectId, examType)),
      missingLearnerIds: missing,
    };
  });
  const required = total * grid.activeExams.length;
  const done = exams.reduce((s, e) => s + e.doneCount, 0);
  return {
    subjectId,
    subjectName: subject?.subjectName ?? subjectId,
    totalStudents: total,
    exams,
    requiredEntries: required,
    doneEntries: done,
    missingEntries: required - done,
    completionPercentage: pct(done, required, 100),
    isComplete: required - done === 0,
  };
}

// ==================== LEARNER VIEW (Report Cards) ====================

export interface LearnerSubjectRow {
  subjectId: string;
  subjectName: string;
  teacherName: string;
  /** Per active exam: the cell. */
  cells: Record<string, GridCell>;
  /** Mean of entered percentages across active exams (rounded), or -1. */
  average: number;
  grade: number;
  isComplete: boolean;
  /** Labels of active exams still pending, e.g. ["End of Term"]. */
  pendingExams: string[];
}

export interface LearnerProgress {
  learnerId: string;
  studentId: string;
  name: string;
  subjects: LearnerSubjectRow[];
  totalSubjects: number;
  completedSubjects: number;
  /** completedSubjects / totalSubjects — the Report Cards progress bar. */
  completionPercentage: number;
  isComplete: boolean;
  /** Mean of subject averages (rounded); 0 when no averages. */
  overallPercentage: number;
  overallGrade: number;
  hasAnyMarks: boolean;
  status: 'pass' | 'fail' | 'pending';
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function learnerProgress(grid: ResultsGrid, learnerId: string): LearnerProgress {
  const learner = grid.learners.find(l => l.id === learnerId);
  const rows: LearnerSubjectRow[] = grid.subjects.map(s => {
    const cells: Record<string, GridCell> = {};
    const scores: number[] = [];
    const pending: string[] = [];
    for (const e of grid.activeExams) {
      const c = getCell(grid, learnerId, s.subjectId, e);
      cells[e] = c;
      if (c.status === 'entered' && c.percentage !== null) scores.push(c.percentage);
      if (c.status === 'pending') pending.push(EXAM_LABELS[e]);
    }
    const average = scores.length ? Math.round(mean(scores)) : -1;
    return {
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      teacherName: s.operatorTeacherName || s.ownerTeacherName || 'Not assigned',
      cells,
      average,
      grade: gradeForPercentage(average),
      isComplete: pending.length === 0,
      pendingExams: pending,
    };
  });

  const total = rows.length;
  const completed = rows.filter(r => r.isComplete).length;
  const averages = rows.filter(r => r.average >= 0).map(r => r.average);
  const hasAnyMarks = averages.length > 0;
  const overall = hasAnyMarks ? Math.round(mean(averages)) : 0;

  return {
    learnerId,
    studentId: learner?.studentId ?? '',
    name: learner?.name ?? 'Unknown',
    subjects: rows,
    totalSubjects: total,
    completedSubjects: completed,
    completionPercentage: pct(completed, total, 0),
    isComplete: total > 0 && completed === total && grid.activeExams.length > 0,
    overallPercentage: overall,
    overallGrade: hasAnyMarks ? gradeForPercentage(overall) : -1,
    hasAnyMarks,
    status: !hasAnyMarks ? 'pending' : overall >= 50 ? 'pass' : 'fail',
  };
}

/**
 * Class positions from the same grid: ranked by overall percentage among
 * learners who have at least one mark. Ties share a position (1, 2, 2, 4).
 * Learners with no marks get "—".
 */
export function classPositions(grid: ResultsGrid): Map<string, string> {
  const ranked = grid.learners
    .map(l => learnerProgress(grid, l.id))
    .filter(p => p.hasAnyMarks)
    .sort((a, b) => b.overallPercentage - a.overallPercentage);
  const out = new Map<string, string>();
  let lastScore: number | null = null;
  let lastPos = 0;
  ranked.forEach((p, i) => {
    const pos = p.overallPercentage === lastScore ? lastPos : i + 1;
    lastScore = p.overallPercentage;
    lastPos = pos;
    out.set(p.learnerId, `${pos}/${ranked.length}`);
  });
  for (const l of grid.learners) if (!out.has(l.id)) out.set(l.id, '—');
  return out;
}

// ==================== TEACHER VIEW (Monitor) ====================

export interface TeacherSubjectEntry {
  classId: string;
  className: string;
  subject: GridSubject;
  progress: SubjectProgress;
  /** True when the teacher operates as a cover / TP delegate. */
  isDelegate: boolean;
}

/**
 * Who a slot's work is credited to: the operator (live cover/TP, else owner).
 * Vacant slots (no owner, no operator) return null and are reported
 * separately by the monitor.
 */
export const responsibleTeacherId = (s: GridSubject): string | null =>
  s.operatorTeacherId ?? s.ownerTeacherId ?? null;

export const isDelegateRole = (role: string | null | undefined) =>
  role === 'leave-cover' || role === 'tp';

// ==================== REPORT CARD ====================

/** Mark value for a report card column: pct, -1 absent, -2 NC, -3 pending. */
export const cardMarkValue = (c: GridCell | undefined): number => {
  if (!c) return MARK.PENDING;
  if (c.status === 'entered') return c.percentage ?? MARK.PENDING;
  if (c.status === 'absent') return MARK.ABSENT;
  if (c.status === 'not_conducted') return MARK.NOT_CONDUCTED;
  return MARK.PENDING;
};

export interface ReportCardSubject {
  subjectId: string;
  subjectName: string;
  teacherName: string;
  week4: number;
  week8: number;
  endOfTerm: number;
  /** Same value under both names: the admin PDF reads `average`, older code `averagePercentage`. */
  average: number;
  averagePercentage: number;
  grade: number;
  gradeDescription: string;
  isComplete: boolean;
  missingExams: string[];
  comment: string;
}

export interface ReportCard {
  id: string;
  /** Custom learner id for display (falls back to the document id). */
  studentId: string;
  documentId: string;
  studentName: string;
  className: string;
  classId: string;
  form: string;
  gender: string;
  term: string;
  year: number;
  subjects: ReportCardSubject[];
  /** Overall percentage (mean of subject averages). */
  percentage: number;
  /** Overall grade, under both names used by older code. */
  grade: number;
  overallGrade: number;
  overallGradeDescription: string;
  position: string;
  status: 'pass' | 'fail' | 'pending';
  isComplete: boolean;
  /** True whenever any subject still has a pending exam. */
  isProvisional: boolean;
  completionPercentage: number;
  completedSubjects: number;
  totalSubjects: number;
  activeExams: ExamType[];
  examConfigSummary?: string;
  /** Sum of subject averages (kept for older consumers). */
  totalMarks: number;
  generatedDate: string;
  // Pass-through fields the cards already printed:
  improvement: 'improved' | 'declined' | 'stable';
  teachersComment: string;
  parentsPhone: string;
  parentsEmail: string;
  attendance?: number;
}

export function buildReportCard(
  grid: ResultsGrid,
  learnerId: string,
  ctx: {
    classId: string;
    className: string;
    form: string;
    term: string;
    year: number;
    gender?: string;
    parentsPhone?: string;
    parentsEmail?: string;
    positions?: Map<string, string>;
    improvement?: 'improved' | 'declined' | 'stable';
    teachersComment?: string;
    generatedDate?: string;
  }
): ReportCard {
  const p = learnerProgress(grid, learnerId);
  const learner = grid.learners.find(l => l.id === learnerId);
  const positions = ctx.positions ?? classPositions(grid);

  const subjects: ReportCardSubject[] = p.subjects.map(s => ({
    subjectId: s.subjectId,
    subjectName: s.subjectName,
    teacherName: s.teacherName,
    week4: grid.activeExams.includes('week4') ? cardMarkValue(s.cells.week4) : MARK.PENDING,
    week8: grid.activeExams.includes('week8') ? cardMarkValue(s.cells.week8) : MARK.PENDING,
    endOfTerm: grid.activeExams.includes('endOfTerm') ? cardMarkValue(s.cells.endOfTerm) : MARK.PENDING,
    average: s.average,
    averagePercentage: s.average,
    grade: s.grade,
    gradeDescription: gradeDescription(s.grade),
    isComplete: s.isComplete,
    missingExams: s.pendingExams,
    comment: '',
  }));
  for (const s of subjects) s.comment = subjectCommentFor(s);

  const customId = learner?.studentId || learnerId;
  const card: ReportCard = {
    id: `report-${customId}-${ctx.term}-${ctx.year}`,
    studentId: customId,
    documentId: learnerId,
    studentName: p.name,
    className: ctx.className,
    classId: ctx.classId,
    form: ctx.form,
    gender: ctx.gender || learner?.gender || 'Not specified',
    term: ctx.term,
    year: ctx.year,
    subjects,
    percentage: p.overallPercentage,
    grade: p.overallGrade,
    overallGrade: p.overallGrade,
    overallGradeDescription: gradeDescription(p.overallGrade),
    position: positions.get(learnerId) ?? '—',
    status: p.status,
    isComplete: p.isComplete,
    isProvisional: !p.isComplete,
    completionPercentage: p.completionPercentage,
    completedSubjects: p.completedSubjects,
    totalSubjects: p.totalSubjects,
    activeExams: grid.activeExams,
    examConfigSummary: grid.activeExams.length
      ? `Based on: ${grid.activeExams.map(e => EXAM_LABELS[e]).join(' + ')}`
      : undefined,
    totalMarks: subjects.filter(s => s.average >= 0).reduce((a, s) => a + s.average, 0),
    generatedDate: ctx.generatedDate ?? new Date().toLocaleDateString('en-GB'),
    improvement: ctx.improvement ?? 'stable',
    teachersComment: ctx.teachersComment ?? '',
    parentsPhone: ctx.parentsPhone ?? '',
    parentsEmail: ctx.parentsEmail ?? '',
  };
  card.teachersComment = ctx.teachersComment ?? teacherCommentFor(card);
  return card;
}

// ==================== COMMENTS ====================
// Same wording the report cards already used, now fed from the grid.

const SUBJECT_COMMENTS: Record<number, string> = {
  1: 'Outstanding performance showing exceptional mastery across all assessments.',
  2: 'Excellent work with strong understanding demonstrated consistently.',
  3: 'Very good performance with solid comprehension throughout.',
  4: 'Good grasp of concepts with consistent effort shown in all tests.',
  5: 'Commendable effort showing satisfactory understanding overall.',
  6: 'Acceptable performance meeting basic subject requirements.',
  7: 'Fair performance across assessments; more practice and review needed.',
  8: 'Below expectations; requires additional support and guidance.',
  9: 'Needs immediate intervention and intensive remedial work.',
};

export function subjectCommentFor(s: Pick<ReportCardSubject, 'grade' | 'average' | 'missingExams'>): string {
  if (s.missingExams.length > 0) {
    return `Pending: ${s.missingExams.join(', ')}.${s.average >= 0 ? ` Average so far: ${s.average}%.` : ''}`;
  }
  if (s.average < 0) return 'No assessment data available.';
  return SUBJECT_COMMENTS[s.grade] || 'Assessment completed.';
}

/** Overall comment, from the same numbers the card prints. */
export function teacherCommentFor(card: Pick<ReportCard, 'percentage' | 'isProvisional' | 'subjects'>): string {
  const valid = card.subjects.filter(s => s.average >= 0);
  if (valid.length === 0) return 'No marks have been entered yet for this term.';
  const sorted = [...valid].sort((a, b) => b.average - a.average);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];
  const passCount = valid.filter(s => s.average >= 50).length;
  const p = card.percentage;

  let text: string;
  if (p >= 70) {
    text = `Excellent overall performance with ${p}% average. Particularly strong in ${strongest.subjectName}. Keep up the outstanding work across all subjects!`;
  } else if (p >= 50) {
    text = `Good overall performance with ${passCount}/${valid.length} subjects passed (${p}% average). Focus more attention on ${weakest.subjectName} for improvement next term.`;
  } else {
    text = `Performance requires improvement with ${p}% average. Need to focus on ${weakest.subjectName} and all core subjects. Additional support and remedial classes recommended.`;
  }
  if (card.isProvisional) {
    const pending = card.subjects.filter(s => !s.isComplete).length;
    text = `PROVISIONAL — ${pending} subject${pending === 1 ? '' : 's'} still awaiting marks. ` + text;
  }
  return text;
}
