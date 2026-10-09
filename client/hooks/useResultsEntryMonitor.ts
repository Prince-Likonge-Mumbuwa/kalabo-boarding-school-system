// @/hooks/useResultsEntryMonitor.ts
//
// Standalone results entry monitor — slot-aware, roster-aware, always-live.
//
// Design principles:
//   1. Operator attribution follows the SLOT MODEL. If a cover is live, the
//      delegate is credited/blamed, not the owner. Falls back to legacy rows
//      if migrateToSlots() hasn't run.
//   2. Exam activity uses `isExamActive()` — one rule for the whole app.
//   3. Completion is ROSTER-AWARE. A subject is only complete when every
//      learner currently in the class has a mark (or the exam was marked
//      not-conducted, which counts as complete).
//   4. Not-conducted exams report as 100% so the count and the flag agree.
//   5. Authority is re-evaluated every 60s so covers start/expire on screen.

import { useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useExamConfig } from './useExamConfig';
import { useSchoolClasses } from './useSchoolClasses';
import { useSchoolTeachers } from './useSchoolTeachers';
import { resultsService } from '@/services/resultsService';
import { learnerService } from '@/services/schoolService';
import * as engine from '@/services/assignmentEngine';
import {
  getCurrentAcademicTerm,
  formatTermLabel,
  isCurrentTerm,
  type TermName,
} from '@/utils/academicTerm';
import { isExamActive } from '@/types/exam';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ExamType = 'week4' | 'week8' | 'endOfTerm';

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
  /** IDs of students missing a mark (for drill-down). */
  missingStudentIds: string[];
  /** True if the exam was flagged not-conducted (no marks needed). */
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

export interface TeacherProgress {
  teacherId: string;
  teacherName: string;
  teacherEmail?: string;
  missingCount: number;
  totalRequired: number;
  completedCount: number;
  completionPercentage: number;
  status: 'complete' | 'on-track' | 'behind' | 'critical';
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

interface UseResultsEntryMonitorOptions {
  term?: string;
  year?: number;
  teacherId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const EXAM_NAMES: Record<ExamType, string> = {
  week4: 'Week 4 Test',
  week8: 'Week 8 Test',
  endOfTerm: 'End of Term Exam',
};

const ALL_EXAM_TYPES: ExamType[] = ['week4', 'week8', 'endOfTerm'];

const COMPLETE_THRESHOLD = 96;
const AUTHORITY_TICK_MS = 60 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const getStatusFromPercentage = (
  percentage: number
): 'complete' | 'on-track' | 'behind' | 'critical' => {
  if (percentage >= COMPLETE_THRESHOLD) return 'complete';
  if (percentage >= 75) return 'on-track';
  if (percentage >= 50) return 'behind';
  return 'critical';
};

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export const useResultsEntryMonitor = (
  options: UseResultsEntryMonitorOptions = {}
) => {
  // ── Resolve term/year — auto-detect if not provided ───────────────────
  const autoTerm = getCurrentAcademicTerm();
  const term = (options.term ?? autoTerm.term) as TermName;
  const year = options.year ?? autoTerm.year;
  const filterTeacherId = options.teacherId;

  const termLabel = useMemo(() => formatTermLabel(term, year), [term, year]);
  const isTermCurrent = useMemo(() => isCurrentTerm(term, year), [term, year]);

  // ── Data sources ──────────────────────────────────────────────────────
  const { configs, isLoading: configsLoading } = useExamConfig({ year });
  const { allTeachers, isLoading: teachersLoading } = useSchoolTeachers();
  const { classes, isLoading: classesLoading } = useSchoolClasses({
    year,
    isActive: true,
  });

  // ── Active exam types (single source of truth) ────────────────────────
  const termConfig = useMemo(() => {
    if (!configs) return undefined;
    return configs.find(
      c => c.term === term && c.year === year && c.isActive !== false
    );
  }, [configs, term, year]);

  const activeExamTypes = useMemo((): ExamType[] => {
    return ALL_EXAM_TYPES.filter(t => isExamActive(termConfig, t));
  }, [termConfig]);

  // ── Slot-aware authority + results, fetched together ──────────────────
  //
  // One query fetches:
  //   • slots for every class (if engine migrated)
  //   • learners per class (for roster)
  //   • all results for the term (for entry status)
  //
  // Then assembles per-(teacher, class, subject) progress entirely in memory.
  const monitorQuery = useQuery({
    queryKey: ['results_monitor', term, year, filterTeacherId ?? 'all'],
    enabled:
      !configsLoading &&
      !teachersLoading &&
      !classesLoading &&
      activeExamTypes.length > 0 &&
      classes.length > 0,
    refetchInterval: AUTHORITY_TICK_MS,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const now = new Date();

      // 1. Detect slot migration once.
      const engineReady = await engine.isEngineReady();

      // 2. Fetch all results for the term in ONE query.
      const allResults = await resultsService.getAllResults({ term, year });

      // 3. Fetch roster + slots per class in parallel.
      const perClassData = await Promise.all(
        classes.map(async cls => {
          const [learners, slots] = await Promise.all([
            learnerService.getLearnersByClass(cls.id).catch(() => []),
            engineReady
              ? engine.getSlotsForClass(cls.id).catch(() => [])
              : Promise.resolve([]),
          ]);
          return { class: cls, learners, slots };
        })
      );

      // 4. Build a lookup: (classId, subjectId) → results[]
      const resultsIndex = new Map<string, typeof allResults>();
      for (const r of allResults) {
        const key = `${r.classId}_${r.subjectId}`;
        if (!resultsIndex.has(key)) resultsIndex.set(key, []);
        resultsIndex.get(key)!.push(r);
      }

      // 5. Build per-slot entries with operator + completion.
      type SlotEntry = {
        classId: string;
        className: string;
        subjectId: string;
        subjectName: string;
        operatorTeacherId: string;
        ownerTeacherId: string | null;
        ownerTeacherName: string | null;
        delegationState: engine.DelegationState;
        isDelegate: boolean;
        completion: SubjectProgress;
      };

      const slotEntries: SlotEntry[] = [];
      // For teachers that are form-teacher-only, we still need their list of
      // classes so we can show them in the teacher list (but with 0 required).
      const formTeacherOnly = new Map<string, Set<string>>();

      for (const { class: cls, learners, slots } of perClassData) {
        // `Learner.id` is the Firestore document ID — the exact same key
        // that `resultsService.saveClassResults` stores on
        // `StudentResult.studentId`. Using anything else (custom studentId,
        // studentIndex, etc.) would silently break roster matching.
        const rosterIds = new Set(learners.map(l => l.id));
        const totalStudents = rosterIds.size;

        // Ensure we consider every expected subject for this class, even if
        // there's no slot yet (pre-migration or unassigned).
        const seenSubjects = new Set<string>();

        for (const slot of slots) {
          seenSubjects.add(slot.normalizedSubject);

          const authority = engine.resolveAuthority(slot, now);
          const operatorTeacherId = authority.operatorTeacherId;

          // If the slot has no operator (vacant), attribute it to the owner
          // so at least it shows up somewhere.
          if (!operatorTeacherId && !slot.ownerTeacherId) continue;

          const resultsForSubject =
            resultsIndex.get(`${cls.id}_${slot.normalizedSubject}`) ?? [];

          const completion = buildSubjectProgress(
            slot.normalizedSubject,
            slot.subject,
            activeExamTypes,
            rosterIds,
            resultsForSubject
          );

          slotEntries.push({
            classId: cls.id,
            className: cls.name,
            subjectId: slot.normalizedSubject,
            subjectName: slot.subject,
            operatorTeacherId: operatorTeacherId ?? slot.ownerTeacherId!,
            ownerTeacherId: slot.ownerTeacherId,
            ownerTeacherName: slot.ownerTeacherName,
            delegationState: authority.delegationState,
            isDelegate:
              authority.operatorRole === 'leave-cover' ||
              authority.operatorRole === 'tp',
            completion,
          });

          // Track form-teacher class membership separately so those teachers
          // still appear even with no subject.
          if (slot.isFormTeacherSlot && slot.ownerTeacherId) {
            if (!formTeacherOnly.has(slot.ownerTeacherId)) {
              formTeacherOnly.set(slot.ownerTeacherId, new Set());
            }
            formTeacherOnly.get(slot.ownerTeacherId)!.add(cls.id);
          }
        }

        // Legacy fallback: if the engine isn't ready, we can't see slots.
        // Pull subjects from teacher_assignments rows instead.
        if (!engineReady) {
          const legacySubjects = await resultsService
            .getTeacherAssignmentsForClass(cls.id)
            .catch(() => []);
          for (const a of legacySubjects) {
            if (!a.subjectId || seenSubjects.has(a.subjectId)) continue;
            seenSubjects.add(a.subjectId);

            const resultsForSubject =
              resultsIndex.get(`${cls.id}_${a.subjectId}`) ?? [];

            const completion = buildSubjectProgress(
              a.subjectId,
              a.subject,
              activeExamTypes,
              rosterIds,
              resultsForSubject
            );

            slotEntries.push({
              classId: cls.id,
              className: cls.name,
              subjectId: a.subjectId,
              subjectName: a.subject,
              operatorTeacherId: a.teacherId,
              ownerTeacherId: a.teacherId,
              ownerTeacherName: a.teacherName,
              delegationState: 'none',
              isDelegate: false,
              completion,
            });
          }
        }
      }

      return { slotEntries, formTeacherOnly };
    },
  });

  // ── Roll up per teacher ───────────────────────────────────────────────
  const teacherProgress = useMemo((): TeacherProgress[] => {
    const entries = monitorQuery.data?.slotEntries ?? [];
    const formOnly =
      monitorQuery.data?.formTeacherOnly ?? new Map<string, Set<string>>();

    // Group entries by operator teacher.
    const byTeacher = new Map<
      string,
      {
        assignments: Array<{
          classId: string;
          className: string;
          subjectId: string;
          subjectName: string;
          isOwner: boolean;
          isDelegate: boolean;
          completion: SubjectProgress;
        }>;
        formClasses: Set<string>;
      }
    >();

    for (const entry of entries) {
      const tid = entry.operatorTeacherId;
      if (!byTeacher.has(tid)) {
        byTeacher.set(tid, { assignments: [], formClasses: new Set() });
      }
      byTeacher.get(tid)!.assignments.push({
        classId: entry.classId,
        className: entry.className,
        subjectId: entry.subjectId,
        subjectName: entry.subjectName,
        isOwner: !entry.isDelegate,
        isDelegate: entry.isDelegate,
        completion: entry.completion,
      });
    }

    // Form-teacher-only teachers: add them with no subject assignments.
    for (const [tid, classIds] of formOnly) {
      if (!byTeacher.has(tid)) {
        byTeacher.set(tid, { assignments: [], formClasses: new Set() });
      }
      for (const cid of classIds) byTeacher.get(tid)!.formClasses.add(cid);
    }

    const results: TeacherProgress[] = [];

    for (const [teacherId, data] of byTeacher) {
      if (filterTeacherId && teacherId !== filterTeacherId) continue;

      // Resolve teacher info.
      const teacher = allTeachers.find(t => t.id === teacherId);
      const teacherName = teacher?.name || teacherId;
      const teacherEmail = teacher?.email;

      // Skip if there are no teaching assignments AND no form classes.
      if (data.assignments.length === 0 && data.formClasses.size === 0) continue;

      const classProgressMap = new Map<string, ClassProgress>();
      const missingEntries: MissingEntry[] = [];
      let totalRequired = 0;
      let totalCompleted = 0;

      for (const a of data.assignments) {
        const c = a.completion;

        if (!classProgressMap.has(a.classId)) {
          classProgressMap.set(a.classId, {
            classId: a.classId,
            className: a.className,
            totalRequired: 0,
            completedCount: 0,
            missingCount: 0,
            completionPercentage: 0,
            subjects: [],
          });
        }
        const cp = classProgressMap.get(a.classId)!;
        cp.subjects.push(c);

        // Roll up counts.
        const expectedEntries = c.totalStudents * c.expectedExams.length;
        const completedEntries = c.examProgress.reduce(
          (sum, e) => sum + e.enteredCount,
          0
        );
        const missingForSubject = expectedEntries - completedEntries;

        cp.totalRequired += expectedEntries;
        cp.completedCount += completedEntries;
        cp.missingCount += missingForSubject;

        totalRequired += expectedEntries;
        totalCompleted += completedEntries;

        // Build missing entries for the drill-down.
        for (const exam of c.examProgress) {
          if (exam.notConducted) continue; // not a miss
          const missingForExam = exam.totalCount - exam.enteredCount;
          if (missingForExam <= 0) continue;

          const meta = examMeta(termConfig, exam.examType);

          missingEntries.push({
            classId: a.classId,
            className: a.className,
            subjectId: c.subjectId,
            subjectName: c.subjectName,
            examType: exam.examType,
            examName: EXAM_NAMES[exam.examType],
            totalMarks: meta.totalMarks,
            configuredDate: meta.configuredDate,
            missingStudentCount: missingForExam,
            totalStudentCount: exam.totalCount,
            missingStudentIds: [], // filled below if you want
            notConducted: exam.notConducted,
          });
        }
      }

      // Recompute class completion percentages.
      for (const cp of classProgressMap.values()) {
        cp.completionPercentage =
          cp.totalRequired > 0
            ? Math.round((cp.completedCount / cp.totalRequired) * 100)
            : 100;
      }

      const missingCount = totalRequired - totalCompleted;
      const completionPercentage =
        totalRequired > 0
          ? Math.round((totalCompleted / totalRequired) * 100)
          : 100;

      results.push({
        teacherId,
        teacherName,
        teacherEmail,
        missingCount,
        totalRequired,
        completedCount: totalCompleted,
        completionPercentage,
        status: getStatusFromPercentage(completionPercentage),
        missingEntries,
        classProgress: Array.from(classProgressMap.values()),
        formTeacherClasses: Array.from(data.formClasses),
        teachingAssignments: data.assignments.map(a => ({
          classId: a.classId,
          className: a.className,
          subjectId: a.subjectId,
          subjectName: a.subjectName,
          isOwner: a.isOwner,
          isDelegate: a.isDelegate,
        })),
      });
    }

    return results.sort(
      (a, b) => a.completionPercentage - b.completionPercentage
    );
  }, [monitorQuery.data, allTeachers, filterTeacherId, termConfig]);

  // ── Aggregates ─────────────────────────────────────────────────────────
  const myProgress = useMemo(() => {
    if (!filterTeacherId) return null;
    return teacherProgress.find(t => t.teacherId === filterTeacherId) ?? null;
  }, [teacherProgress, filterTeacherId]);

  const summary = useMemo(() => {
    const totalTeachers = teacherProgress.length;
    const totalMissingEntries = teacherProgress.reduce(
      (sum, t) => sum + t.missingCount,
      0
    );
    const totalRequiredEntries = teacherProgress.reduce(
      (sum, t) => sum + t.totalRequired,
      0
    );
    const teachersComplete = teacherProgress.filter(
      t => t.completionPercentage >= COMPLETE_THRESHOLD
    ).length;
    const teachersOnTrack = teacherProgress.filter(
      t =>
        t.completionPercentage >= 75 &&
        t.completionPercentage < COMPLETE_THRESHOLD
    ).length;
    const teachersBehind = teacherProgress.filter(
      t => t.completionPercentage >= 50 && t.completionPercentage < 75
    ).length;
    const teachersCritical = teacherProgress.filter(
      t => t.completionPercentage < 50
    ).length;
    const overallCompletion =
      totalRequiredEntries > 0
        ? Math.round(
            ((totalRequiredEntries - totalMissingEntries) /
              totalRequiredEntries) *
              100
          )
        : 100;

    return {
      totalTeachers,
      totalMissingEntries,
      totalRequiredEntries,
      completedEntries: totalRequiredEntries - totalMissingEntries,
      overallCompletion,
      teachersComplete,
      teachersOnTrack,
      teachersBehind,
      teachersCritical,
    };
  }, [teacherProgress]);

  const missingByExamType = useMemo(() => {
    const map: Record<ExamType, MissingEntry[]> = {
      week4: [],
      week8: [],
      endOfTerm: [],
    };
    for (const teacher of teacherProgress) {
      for (const entry of teacher.missingEntries) {
        if (activeExamTypes.includes(entry.examType)) {
          map[entry.examType].push(entry);
        }
      }
    }
    return map;
  }, [teacherProgress, activeExamTypes]);

  const isOnlyFormTeacher = useCallback(
    (tid: string): boolean => {
      const t = teacherProgress.find(x => x.teacherId === tid);
      if (!t) return false;
      return (
        t.teachingAssignments.length === 0 && t.formTeacherClasses.length > 0
      );
    },
    [teacherProgress]
  );

  return {
    teacherProgress,
    myProgress,
    activeExamTypes,
    summary,
    missingByExamType,
    isLoading: monitorQuery.isLoading,
    isFetching: monitorQuery.isFetching,
    isError: monitorQuery.isError,
    error: monitorQuery.error,
    isOnlyFormTeacher,
    getExamName: (examType: ExamType) => EXAM_NAMES[examType],
    term,
    year,
    termLabel,
    isCurrentTerm: isTermCurrent,
    refetch: monitorQuery.refetch,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (exported for tests)
// ─────────────────────────────────────────────────────────────────────────────

export function buildSubjectProgress(
  subjectId: string,
  subjectName: string,
  activeExamTypes: ExamType[],
  rosterIds: Set<string>,
  resultsForSubject: Array<{
    examType: string;
    studentId: string;
    marks: number;
  }>
): SubjectProgress {
  const totalStudents = rosterIds.size;

  const examProgress: SubjectProgress['examProgress'] = [];
  const completedExams: ExamType[] = [];
  const missingExams: ExamType[] = [];
  const notConductedExams: ExamType[] = [];

  for (const examType of activeExamTypes) {
    const examRows = resultsForSubject.filter(r => r.examType === examType);

    // Not-conducted: EVERY row for this exam has marks === -2 AND there is at
    // least one row (a subject with zero rows isn't "not conducted", it's
    // "not entered").
    const notConducted =
      examRows.length > 0 && examRows.every(r => r.marks === -2);

    const enteredIds = new Set(examRows.map(r => r.studentId));
    const missingIds = [...rosterIds].filter(id => !enteredIds.has(id));

    // Effective counts: not-conducted is treated as fully handled.
    const effectiveEntered = notConducted ? totalStudents : enteredIds.size;
    const percentage =
      totalStudents > 0
        ? Math.round((effectiveEntered / totalStudents) * 100)
        : 0;

    examProgress.push({
      examType,
      enteredCount: effectiveEntered,
      totalCount: totalStudents,
      percentage,
      notConducted,
    });

    if (notConducted) {
      notConductedExams.push(examType);
      completedExams.push(examType); // counts toward completion
    } else if (missingIds.length === 0 && totalStudents > 0) {
      completedExams.push(examType);
    } else if (totalStudents > 0) {
      missingExams.push(examType);
    } else {
      // Zero students → treat as complete (nothing to enter).
      completedExams.push(examType);
    }
  }

  // Subject-level percentage.
  const expected = totalStudents * activeExamTypes.length;
  const completed = examProgress.reduce((s, e) => s + e.enteredCount, 0);
  const completionPercentage =
    expected > 0 ? Math.round((completed / expected) * 100) : 100;

  const has = (t: ExamType) =>
    examProgress.find(e => e.examType === t)?.percentage === 100;

  return {
    subjectId,
    subjectName,
    week4Complete: has('week4'),
    week8Complete: has('week8'),
    endOfTermComplete: has('endOfTerm'),
    week4StudentCount:
      examProgress.find(e => e.examType === 'week4')?.enteredCount ?? 0,
    week8StudentCount:
      examProgress.find(e => e.examType === 'week8')?.enteredCount ?? 0,
    endOfTermStudentCount:
      examProgress.find(e => e.examType === 'endOfTerm')?.enteredCount ?? 0,
    totalStudents,
    completionPercentage,
    expectedExams: activeExamTypes,
    completedExams,
    missingExams,
    notConductedExams,
    examProgress,
  };
}

function examMeta(
  config: any,
  examType: ExamType
): { totalMarks?: number; configuredDate?: string } {
  if (!config) return {};
  if (examType === 'week4') {
    return {
      totalMarks: config.week4TotalMarks,
      configuredDate: config.week4Date,
    };
  }
  if (examType === 'week8') {
    return {
      totalMarks: config.week8TotalMarks,
      configuredDate: config.week8Date,
    };
  }
  return {
    totalMarks: config.endOfTermTotalMarks,
    configuredDate: config.endOfTermDate,
  };
}