// @/services/resultsGridLoader.ts
//
// Firestore loading for the shared results grid (see resultsGrid.ts).
// Everything that shows results — Results Entry, the Monitor, the teacher
// dashboard warning, Report Cards, the SMS and the Parent Portal — loads its
// data through these functions so they all read the same class list, the
// same subjects and the same exam settings.
//
// Errors are NOT swallowed: a failed read throws, so screens can show an
// error instead of a false 0% or 100%.

import { collection, doc, getDoc, getDocs, query, where, type DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import * as engine from '@/services/assignmentEngine';
import { examConfigService } from '@/services/examConfigService';
import { normalizeSubjectName } from '@/services/resultsService';
import { getCurrentAcademicTerm, type TermName } from '@/utils/academicTerm';
import type { ExamConfig } from '@/types/exam';
import {
  ALL_EXAM_TYPES,
  activeExamsFor,
  buildResultsGrid,
  buildRoster,
  pickTermConfig,
  type ExamType,
  type GridLearner,
  type GridSubject,
  type RawLearner,
  type RawResult,
  type ResultsGrid,
} from '@/services/resultsGrid';

const isPermissionDenied = (e: any) =>
  e?.code === 'permission-denied' || /missing or insufficient permissions/i.test(e?.message ?? '');

// ==================== TERM CONTEXT ====================

export interface TermContext {
  term: TermName;
  year: number;
  config: ExamConfig | undefined;
  activeExams: ExamType[];
}

/** Defaults to the current academic term (not "Term 1"). */
export const currentTerm = (): { term: TermName; year: number } => {
  const t = getCurrentAcademicTerm();
  return { term: t.term, year: t.year };
};

export async function loadTermContext(
  term?: string,
  year?: number,
  opts: { publicFallback?: boolean } = {}
): Promise<TermContext & { degraded?: boolean }> {
  const cur = currentTerm();
  const t = (term || cur.term) as TermName;
  const y = year ?? cur.year;
  try {
    const configs = await examConfigService.getConfigs({ year: y, term: t });
    const config = pickTermConfig(configs as ExamConfig[], t, y);
    return { term: t, year: y, config, activeExams: activeExamsFor(config) };
  } catch (e) {
    // Signed-out visitors (Parent Portal) can only read exam settings once
    // the updated firestore.rules are deployed. Until then, fall back to
    // all exams and flag the result as degraded.
    if (opts.publicFallback && isPermissionDenied(e)) {
      return { term: t, year: y, config: undefined, activeExams: [...ALL_EXAM_TYPES], degraded: true };
    }
    throw e;
  }
}

// ==================== ROSTER ====================

export const learnerFromDoc = (id: string, d: DocumentData): RawLearner => ({
  id,
  studentId: d.studentId || '',
  name: d.fullName || d.name || d.studentName || 'Unknown',
  status: d.status,
  gender: d.gender,
  studentIndex: typeof d.studentIndex === 'number' ? d.studentIndex : undefined,
  classId: d.classId,
});

/**
 * Learners counted for a class. Queried by classId only (no orderBy), so
 * learners without `studentIndex` are not silently dropped, then filtered to
 * active / no-status learners and sorted by name.
 */
export async function loadClassRoster(classId: string): Promise<GridLearner[]> {
  const snap = await getDocs(query(collection(db, 'learners'), where('classId', '==', classId)));
  return buildRoster(snap.docs.map(d => learnerFromDoc(d.id, d.data())));
}

// ==================== SUBJECTS ====================

/** The id segment of a slot doc after `${classId}__` — what the rules use. */
export const slotKeyFor = (classId: string, normalizedSubject: string): string =>
  engine.slotIdForNormalized(classId, normalizedSubject).slice(classId.length + 2);

export interface LoadedSubject extends GridSubject {
  /** Segment used in the slot document id (for Firestore rules). */
  slotKey: string;
  /** Slot has no owner and no delegate. */
  isVacant: boolean;
}

const subjectFromSlot = (slot: engine.ClassSlot, now: Date): LoadedSubject => {
  const auth = engine.resolveAuthority(slot, now);
  // Results are saved under the normalized subject name; the rules check
  // the slot's real document id (older slots may use an older spelling).
  const normalized = normalizeSubjectName(slot.normalizedSubject || slot.subject);
  return {
    subjectId: normalized,
    subjectName: slot.subject || normalized,
    ownerTeacherId: slot.ownerTeacherId,
    ownerTeacherName: slot.ownerTeacherName,
    operatorTeacherId: auth.operatorTeacherId,
    operatorTeacherName: auth.operatorTeacherName,
    operatorRole: auth.operatorRole,
    slotKey: slot.id.startsWith(`${slot.classId}__`) ? slot.id.slice(slot.classId.length + 2) : slotKeyFor(slot.classId, normalized),
    isVacant: !auth.operatorTeacherId && !slot.ownerTeacherId,
  };
};

/**
 * Legacy path (before migrateToSlots): current, non-Form-Teacher rows only.
 * Ended rows and covers past their end date are skipped.
 */
async function subjectsFromAssignments(classId: string, now: Date): Promise<LoadedSubject[]> {
  const snap = await getDocs(query(collection(db, 'teacher_assignments'), where('classId', '==', classId)));
  const bySubject = new Map<string, LoadedSubject>();
  for (const d of snap.docs) {
    const a = d.data();
    if (a.status === 'ended') continue;
    const raw = (a.subject || '').trim();
    if (!raw || raw === engine.FORM_TEACHER_SUBJECT || a.normalizedSubject === engine.FORM_TEACHER_SLOT) continue;
    const isDelegate = a.roleType === 'tp' || a.roleType === 'leave-cover';
    const end = a.endDate?.toDate ? a.endDate.toDate() : a.endDate ? new Date(a.endDate) : null;
    const start = a.startDate?.toDate ? a.startDate.toDate() : a.startDate ? new Date(a.startDate) : null;
    if (isDelegate && end && end < now) continue;
    const delegateLive = isDelegate && (!start || start <= now);
    const normalized = a.normalizedSubject || normalizeSubjectName(raw);
    const entry = bySubject.get(normalized) ?? {
      subjectId: normalized,
      subjectName: raw,
      ownerTeacherId: null,
      ownerTeacherName: null,
      operatorTeacherId: null,
      operatorTeacherName: null,
      operatorRole: null,
      slotKey: slotKeyFor(classId, normalized),
      isVacant: true,
    };
    if (!isDelegate) {
      entry.ownerTeacherId = a.teacherId ?? null;
      entry.ownerTeacherName = a.teacherName ?? null;
      if (entry.operatorRole !== 'leave-cover' && entry.operatorRole !== 'tp') {
        entry.operatorTeacherId = a.teacherId ?? null;
        entry.operatorTeacherName = a.teacherName ?? null;
        entry.operatorRole = 'owner';
      }
    } else if (delegateLive) {
      entry.operatorTeacherId = a.teacherId ?? null;
      entry.operatorTeacherName = a.teacherName ?? null;
      entry.operatorRole = a.roleType;
    }
    entry.isVacant = !entry.operatorTeacherId && !entry.ownerTeacherId;
    bySubject.set(normalized, entry);
  }
  return [...bySubject.values()];
}

/**
 * Every subject slot for the class (never the Form Teacher slot).
 * Uses class_slots when they exist, otherwise current assignment rows.
 */
export async function loadClassSubjects(classId: string, now = new Date()): Promise<LoadedSubject[]> {
  const slotSnap = await getDocs(query(collection(db, 'class_slots'), where('classId', '==', classId)));
  const slots = slotSnap.docs.map(d => engine.mapSlot(d.id, d.data())).filter(s => !s.isFormTeacherSlot);
  const subjects = slots.length > 0
    ? slots.map(s => subjectFromSlot(s, now))
    : await subjectsFromAssignments(classId, now);
  return subjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
}

/**
 * Subjects that count in the grid: every slot with a teacher, plus vacant
 * slots that already have marks this term (a teacher left mid-term — their
 * marks still belong on the report card). Vacant slots without marks are
 * treated as subjects no longer taught.
 */
export function gridSubjects(subjects: LoadedSubject[], results: RawResult[]): LoadedSubject[] {
  const withMarks = new Set(results.map(r => r.subjectId));
  return subjects.filter(s => !s.isVacant || withMarks.has(s.subjectId));
}

// ==================== RESULTS ====================

export const resultFromDoc = (d: DocumentData): RawResult & { classId: string; teacherId?: string } => ({
  studentId: d.studentId,
  subjectId: d.subjectId,
  examType: d.examType,
  marks: typeof d.marks === 'number' ? d.marks : Number(d.marks),
  totalMarks: d.totalMarks,
  percentage: d.percentage,
  updatedAt: d.updatedAt,
  classId: d.classId,
  teacherId: d.teacherId,
});

export async function loadClassResults(classId: string, term: string, year: number) {
  const snap = await getDocs(query(
    collection(db, 'results'),
    where('classId', '==', classId),
    where('term', '==', term),
    where('year', '==', year)
  ));
  return snap.docs.map(d => resultFromDoc(d.data()));
}

export async function loadTermResults(term: string, year: number) {
  const snap = await getDocs(query(
    collection(db, 'results'),
    where('term', '==', term),
    where('year', '==', year)
  ));
  return snap.docs.map(d => resultFromDoc(d.data()));
}

// ==================== CLASS GRID ====================

export interface ClassInfo {
  id: string;
  name: string;
  form: string;
}

export async function loadClassInfo(classId: string): Promise<ClassInfo> {
  const snap = await getDoc(doc(db, 'classes', classId));
  if (!snap.exists()) throw new Error('Class not found');
  const d = snap.data();
  return { id: classId, name: d.name || 'Unknown class', form: d.level?.toString() || '1' };
}

export interface LoadedClassGrid {
  /** True when some data could not be read (signed-out visitor before the
   *  updated rules are deployed) and a fallback was used. */
  degraded?: boolean;
  grid: ResultsGrid;
  classInfo: ClassInfo;
  term: TermName;
  year: number;
  config: ExamConfig | undefined;
  /** All subject slots, including vacant ones left out of the grid. */
  allSubjects: LoadedSubject[];
}

/**
 * Load one class's grid for a term.
 * Pass `ctx` when the caller already loaded the term (e.g. the monitor) and
 * `termResults` to reuse one term-wide results query.
 */
export async function loadClassGrid(
  classId: string,
  term?: string,
  year?: number,
  opts: {
    ctx?: TermContext;
    termResults?: Array<RawResult & { classId: string }>;
    classInfo?: ClassInfo;
    /** Parent Portal (signed out): tolerate rules that do not yet allow
     *  public reads of exam settings / class slots. */
    publicFallback?: boolean;
  } = {}
): Promise<LoadedClassGrid> {
  const ctx = opts.ctx ?? (await loadTermContext(term, year, { publicFallback: opts.publicFallback }));
  let degraded = !!(ctx as any).degraded;
  const [classInfo, learners, results] = await Promise.all([
    opts.classInfo ? Promise.resolve(opts.classInfo) : loadClassInfo(classId),
    loadClassRoster(classId),
    opts.termResults
      ? Promise.resolve(opts.termResults.filter(r => r.classId === classId))
      : loadClassResults(classId, ctx.term, ctx.year),
  ]);
  let allSubjects: LoadedSubject[];
  try {
    allSubjects = await loadClassSubjects(classId);
  } catch (e) {
    if (!opts.publicFallback || !isPermissionDenied(e)) throw e;
    // Fallback: the subjects that have marks this term.
    degraded = true;
    const seen = new Map<string, LoadedSubject>();
    for (const r of results) {
      if (!seen.has(r.subjectId)) {
        seen.set(r.subjectId, {
          subjectId: r.subjectId, subjectName: r.subjectId,
          ownerTeacherId: null, ownerTeacherName: null,
          operatorTeacherId: null, operatorTeacherName: null, operatorRole: null,
          slotKey: slotKeyFor(classId, r.subjectId), isVacant: true,
        });
      }
    }
    allSubjects = [...seen.values()].sort((a, b) => a.subjectName.localeCompare(b.subjectName));
  }
  const subjects = gridSubjects(allSubjects, results);
  const grid = buildResultsGrid({ learners, subjects, activeExams: ctx.activeExams, results });
  return { grid, classInfo, term: ctx.term, year: ctx.year, config: ctx.config, allSubjects, degraded };
}

/** Re-export so callers don't need two imports. */
export { ALL_EXAM_TYPES };
export { totalMarksFor as totalMarksForExam } from '@/services/resultsGrid';
