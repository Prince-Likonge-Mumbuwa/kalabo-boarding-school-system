// @/services/resultsMonitor.ts
//
// Results Entry Monitor data, built from the SAME per-class grids the
// Results Entry page and Report Cards use (see resultsGrid.ts). A teacher's
// numbers here are the sum of the per-subject numbers they see on Results
// Entry, so the two screens always agree.
//
// Work is credited to whoever may enter marks right now: a live cover/TP
// teacher, otherwise the owner. Vacant subjects that already have marks are
// reported separately (no teacher to credit).

import {
  EXAM_LABELS,
  isDelegateRole,
  responsibleTeacherId,
  subjectProgress,
  type ExamType,
  type ResultsGrid,
  type SubjectProgress as GridSubjectProgress,
} from '@/services/resultsGrid';
import {
  loadClassGrid,
  loadTermContext,
  loadTermResults,
  totalMarksForExam,
  type TermContext,
} from '@/services/resultsGridLoader';

// ==================== TYPES (unchanged shape for existing screens) ====================

export interface MissingEntry {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  examType: ExamType;
  examName: string;
  totalMarks?: number;
  configuredDate?: string;
  missingStudentCount: number;
  totalStudentCount: number;
  /** Document ids of learners still without a mark. */
  missingStudentIds: string[];
  /** Names of those learners, in the same order. */
  missingStudentNames: string[];
  notConducted: boolean;
}

export interface SubjectProgress {
  subjectId: string;
  subjectName: string;
  week4Complete: boolean;
  week8Complete: boolean;
  endOfTermComplete: boolean;
  week4StudentCount: number;
  week8StudentCount: number;
  endOfTermStudentCount: number;
  totalStudents: number;
  completionPercentage: number;
  expectedExams: ExamType[];
  completedExams: ExamType[];
  missingExams: ExamType[];
  notConductedExams: ExamType[];
  examProgress: {
    examType: ExamType;
    enteredCount: number;
    totalCount: number;
    percentage: number;
    notConducted: boolean;
  }[];
}

export interface ClassProgress {
  classId: string;
  className: string;
  totalRequired: number;
  completedCount: number;
  missingCount: number;
  completionPercentage: number;
  subjects: SubjectProgress[];
}

export type MonitorStatus = 'complete' | 'on-track' | 'behind' | 'critical';

export interface TeacherProgress {
  teacherId: string;
  teacherName: string;
  teacherEmail?: string;
  missingCount: number;
  totalRequired: number;
  completedCount: number;
  completionPercentage: number;
  status: MonitorStatus;
  missingEntries: MissingEntry[];
  classProgress: ClassProgress[];
  formTeacherClasses: string[];
  teachingAssignments: Array<{
    classId: string;
    className: string;
    subjectId: string;
    subjectName: string;
    isOwner: boolean;
    isDelegate: boolean;
  }>;
}

export interface VacantSubject {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  progress: SubjectProgress;
}

export interface MonitorClass {
  id: string;
  name: string;
  formTeacherId?: string | null;
}

export interface MonitorData {
  ctx: TermContext;
  teachers: TeacherProgress[];
  vacant: VacantSubject[];
  /** Classes whose data could not be loaded — shown as an error, never as 0%/100%. */
  failedClasses: Array<{ classId: string; className: string; error: string }>;
}

// ==================== HELPERS ====================

export const COMPLETE_THRESHOLD = 100;

/** "complete" means nothing is missing — not "96% is close enough". */
export const statusFor = (missing: number, pct: number): MonitorStatus => {
  if (missing <= 0) return 'complete';
  if (pct >= 75) return 'on-track';
  if (pct >= 50) return 'behind';
  return 'critical';
};

/** Convert a grid subject progress into the shape the existing screens render. */
export function toScreenSubjectProgress(sp: GridSubjectProgress, activeExams: ExamType[]): SubjectProgress {
  const ex = (t: ExamType) => sp.exams.find(e => e.examType === t);
  const done = (t: ExamType) => ex(t)?.doneCount ?? 0;
  const full = (t: ExamType) => !!ex(t) && ex(t)!.doneCount === ex(t)!.totalCount;
  return {
    subjectId: sp.subjectId,
    subjectName: sp.subjectName,
    week4Complete: full('week4'),
    week8Complete: full('week8'),
    endOfTermComplete: full('endOfTerm'),
    week4StudentCount: done('week4'),
    week8StudentCount: done('week8'),
    endOfTermStudentCount: done('endOfTerm'),
    totalStudents: sp.totalStudents,
    completionPercentage: sp.completionPercentage,
    expectedExams: activeExams,
    completedExams: activeExams.filter(full),
    missingExams: activeExams.filter(t => !full(t)),
    notConductedExams: activeExams.filter(t => ex(t)?.notConducted),
    examProgress: sp.exams.map(e => ({
      examType: e.examType,
      enteredCount: e.doneCount,
      totalCount: e.totalCount,
      percentage: e.percentage,
      notConducted: e.notConducted,
    })),
  };
}

// ==================== AGGREGATION (pure) ====================

export interface ClassGridInput {
  classId: string;
  className: string;
  formTeacherId?: string | null;
  grid: ResultsGrid;
}

export function aggregateMonitor(
  ctx: TermContext,
  grids: ClassGridInput[],
  teacherInfo: (id: string) => { name?: string; email?: string } = () => ({})
): { teachers: TeacherProgress[]; vacant: VacantSubject[] } {
  type Acc = {
    entries: Array<{ classId: string; className: string; subjectName: string; isDelegate: boolean; sp: GridSubjectProgress; names: Map<string, string> }>;
    formClasses: Set<string>;
    nameHint: string | null;
  };
  const byTeacher = new Map<string, Acc>();
  const vacant: VacantSubject[] = [];
  const acc = (id: string) => {
    if (!byTeacher.has(id)) byTeacher.set(id, { entries: [], formClasses: new Set(), nameHint: null });
    return byTeacher.get(id)!;
  };

  for (const g of grids) {
    const names = new Map(g.grid.learners.map(l => [l.id, l.name]));
    if (g.formTeacherId) acc(g.formTeacherId).formClasses.add(g.classId);
    for (const s of g.grid.subjects) {
      const sp = subjectProgress(g.grid, s.subjectId);
      const tid = responsibleTeacherId(s);
      if (!tid) {
        vacant.push({
          classId: g.classId,
          className: g.className,
          subjectId: s.subjectId,
          subjectName: s.subjectName,
          progress: toScreenSubjectProgress(sp, g.grid.activeExams),
        });
        continue;
      }
      const a = acc(tid);
      a.nameHint = a.nameHint ?? (s.operatorTeacherId === tid ? s.operatorTeacherName : s.ownerTeacherName);
      a.entries.push({
        classId: g.classId,
        className: g.className,
        subjectName: s.subjectName,
        isDelegate: s.operatorTeacherId === tid && isDelegateRole(s.operatorRole),
        sp,
        names,
      });
    }
  }

  const teachers: TeacherProgress[] = [];
  for (const [teacherId, a] of byTeacher) {
    if (a.entries.length === 0 && a.formClasses.size === 0) continue;
    const classMap = new Map<string, ClassProgress>();
    const missingEntries: MissingEntry[] = [];
    let required = 0;
    let done = 0;

    for (const e of a.entries) {
      if (!classMap.has(e.classId)) {
        classMap.set(e.classId, {
          classId: e.classId, className: e.className,
          totalRequired: 0, completedCount: 0, missingCount: 0, completionPercentage: 100, subjects: [],
        });
      }
      const cp = classMap.get(e.classId)!;
      cp.subjects.push(toScreenSubjectProgress(e.sp, ctx.activeExams));
      cp.totalRequired += e.sp.requiredEntries;
      cp.completedCount += e.sp.doneEntries;
      cp.missingCount += e.sp.missingEntries;
      required += e.sp.requiredEntries;
      done += e.sp.doneEntries;

      for (const ex of e.sp.exams) {
        const missing = ex.totalCount - ex.doneCount;
        if (missing <= 0) continue;
        missingEntries.push({
          classId: e.classId,
          className: e.className,
          subjectId: e.sp.subjectId,
          subjectName: e.sp.subjectName,
          examType: ex.examType,
          examName: `${EXAM_LABELS[ex.examType]} ${ex.examType === 'endOfTerm' ? 'Exam' : 'Test'}`,
          totalMarks: totalMarksForExam(ctx.config, ex.examType) ?? undefined,
          configuredDate: ctx.config
            ? (ex.examType === 'week4' ? ctx.config.week4Date : ex.examType === 'week8' ? ctx.config.week8Date : ctx.config.endOfTermDate)
            : undefined,
          missingStudentCount: missing,
          totalStudentCount: ex.totalCount,
          missingStudentIds: ex.missingLearnerIds,
          missingStudentNames: ex.missingLearnerIds.map(id => e.names.get(id) ?? id),
          notConducted: ex.notConducted,
        });
      }
    }
    for (const cp of classMap.values()) {
      cp.completionPercentage = cp.totalRequired > 0 ? Math.round((cp.completedCount / cp.totalRequired) * 100) : 100;
    }

    const pct = required > 0 ? Math.round((done / required) * 100) : 100;
    const info = teacherInfo(teacherId);
    teachers.push({
      teacherId,
      teacherName: info.name || a.nameHint || teacherId,
      teacherEmail: info.email,
      missingCount: required - done,
      totalRequired: required,
      completedCount: done,
      completionPercentage: pct,
      status: statusFor(required - done, pct),
      missingEntries,
      classProgress: [...classMap.values()],
      formTeacherClasses: [...a.formClasses],
      teachingAssignments: a.entries.map(e => ({
        classId: e.classId,
        className: e.className,
        subjectId: e.sp.subjectId,
        subjectName: e.subjectName,
        isOwner: !e.isDelegate,
        isDelegate: e.isDelegate,
      })),
    });
  }

  teachers.sort((x, y) => x.completionPercentage - y.completionPercentage || x.teacherName.localeCompare(y.teacherName));
  return { teachers, vacant };
}

// ==================== LOADING ====================

/**
 * Load the monitor for a term. One results query for the whole term, then
 * each class's roster and subjects. A class that fails to load is reported
 * in `failedClasses` instead of being shown as empty or complete.
 */
export async function loadMonitorData(
  term: string | undefined,
  year: number | undefined,
  classes: MonitorClass[],
  teacherInfo?: (id: string) => { name?: string; email?: string }
): Promise<MonitorData> {
  const ctx = await loadTermContext(term, year);
  if (ctx.activeExams.length === 0 || classes.length === 0) {
    return { ctx, teachers: [], vacant: [], failedClasses: [] };
  }
  const termResults = await loadTermResults(ctx.term, ctx.year);
  const failedClasses: MonitorData['failedClasses'] = [];
  const loaded = await Promise.all(
    classes.map(async c => {
      try {
        const g = await loadClassGrid(c.id, ctx.term, ctx.year, {
          ctx,
          termResults,
          classInfo: { id: c.id, name: c.name, form: '' },
        });
        return { classId: c.id, className: c.name, formTeacherId: c.formTeacherId ?? null, grid: g.grid };
      } catch (e: any) {
        failedClasses.push({ classId: c.id, className: c.name, error: e?.message || String(e) });
        return null;
      }
    })
  );
  const grids = loaded.filter((g): g is NonNullable<typeof g> => g !== null);
  const { teachers, vacant } = aggregateMonitor(ctx, grids, teacherInfo);
  return { ctx, teachers, vacant, failedClasses };
}
