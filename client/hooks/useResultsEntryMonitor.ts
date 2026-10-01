// @/hooks/useResultsEntryMonitor.ts
import { useMemo, useCallback, useState, useEffect } from 'react';
import { useExamConfig } from './useExamConfig';
import { useSchoolClasses } from './useSchoolClasses';
import { useSchoolTeachers } from './useSchoolTeachers';
import { resultsService } from '@/services/resultsService';
import {
  getCurrentAcademicTerm,
  formatTermLabel,
  isCurrentTerm,
  type TermName,
} from '@/utils/academicTerm';

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
  examProgress: {
    examType: ExamType;
    enteredCount: number;
    totalCount: number;
    percentage: number;
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
  }>;
}

interface UseResultsEntryMonitorOptions {
  /**
   * Term name. If omitted, the current academic term is auto-detected.
   * Accepts any string for backwards compatibility, but `TermName` is
   * strongly recommended.
   */
  term?: string;
  /** Academic year. If omitted, auto-detected from the current term. */
  year?: number;
  /** Restrict results to a single teacher. */
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

const EXAM_ORDER: ExamType[] = ['week4', 'week8', 'endOfTerm'];

/** Percentage at or above which an exam/subject/teacher is considered complete. */
const COMPLETE_THRESHOLD = 96;

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

const isExamComplete = (percentage: number): boolean =>
  percentage >= COMPLETE_THRESHOLD;

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export const useResultsEntryMonitor = (
  options: UseResultsEntryMonitorOptions
) => {
  // ── Resolve term/year — auto-detect if not provided ────────────────────
  const autoTerm = getCurrentAcademicTerm();
  const term = (options.term ?? autoTerm.term) as TermName;
  const year = options.year ?? autoTerm.year;
  const teacherId = options.teacherId;

  // ── Term metadata exposed to consumers ─────────────────────────────────
  const termLabel = useMemo(() => formatTermLabel(term, year), [term, year]);
  const isTermCurrent = useMemo(() => isCurrentTerm(term, year), [term, year]);

  const [completionCache, setCompletionCache] = useState<Map<string, any>>(
    new Map()
  );
  const [isLoadingCompletions, setIsLoadingCompletions] = useState(true);

  const { configs, isLoading: configsLoading } = useExamConfig({ year });
  const { allTeachers, isLoading: teachersLoading } = useSchoolTeachers();
  const { classes, isLoading: classesLoading } = useSchoolClasses({
    year,
    isActive: true,
  });

  const isLoading =
    configsLoading ||
    teachersLoading ||
    classesLoading ||
    isLoadingCompletions;

  // ── Active exam types for this term ────────────────────────────────────
  const activeExamTypes = useMemo((): ExamType[] => {
    if (!configs || configs.length === 0) {
      console.warn(`[useResultsEntryMonitor] No exam configs found for ${termLabel}`);
      return [];
    }

    // Prefer the enriched `term` + `year` fields (new service returns them).
    const termConfig = configs.find(
      (c: any) => c.term === term && c.year === year
    );

    if (!termConfig) {
      console.warn(
        `[useResultsEntryMonitor] No config found for ${termLabel} — returning empty array`
      );
      return [];
    }

    const active: ExamType[] = [];

    if (termConfig.examTypes?.week4 === true && termConfig.week4TotalMarks > 0) {
      active.push('week4');
    }
    if (termConfig.examTypes?.week8 === true && termConfig.week8TotalMarks > 0) {
      active.push('week8');
    }
    if (
      termConfig.examTypes?.endOfTerm === true &&
      termConfig.endOfTermTotalMarks > 0
    ) {
      active.push('endOfTerm');
    }

    console.log(
      `[useResultsEntryMonitor] Active exams for ${termLabel}:`,
      active
    );
    return active;
  }, [configs, term, year, termLabel]);

  // ── Build teacher → assignment map ─────────────────────────────────────
  const allTeacherAssignmentsMap = useMemo(() => {
    const map = new Map<
      string,
      {
        teacherId: string;
        teacherName: string;
        teacherEmail?: string;
        formTeacherClasses: Set<string>;
        teachingAssignments: Array<{
          classId: string;
          className: string;
          subjectId: string;
          subjectName: string;
        }>;
      }
    >();

    for (const cls of classes) {
      const teacherAssignments = (cls as any).teacherAssignments;
      if (!teacherAssignments || !Array.isArray(teacherAssignments)) continue;

      let classFormTeacherId: string | null = null;

      for (const assignment of teacherAssignments) {
        if (assignment.isFormTeacher === true) {
          classFormTeacherId = assignment.teacherId;
          break;
        }
      }

      for (const assignment of teacherAssignments) {
        const teacherIdKey = assignment.teacherId;
        if (!teacherIdKey) continue;

        const subjectName =
          assignment.subject || assignment.subjectName || '';
        const isFormTeacherOnly =
          assignment.isFormTeacher === true && !subjectName;
        const isSubjectTeaching =
          !isFormTeacherOnly &&
          subjectName &&
          subjectName !== 'Form Teacher';

        if (!isSubjectTeaching) continue;

        const normalizedSubjectId =
          assignment.subjectId ||
          subjectName.toLowerCase().replace(/\s+/g, '_');

        if (!map.has(teacherIdKey)) {
          const teacher = allTeachers.find(t => t.id === teacherIdKey);
          map.set(teacherIdKey, {
            teacherId: teacherIdKey,
            teacherName:
              teacher?.name || teacher?.id || assignment.teacherName || 'Unknown',
            teacherEmail: teacher?.email,
            formTeacherClasses: new Set<string>(),
            teachingAssignments: [],
          });
        }

        const teacherData = map.get(teacherIdKey)!;

        if (classFormTeacherId === teacherIdKey) {
          teacherData.formTeacherClasses.add(cls.id);
        }

        teacherData.teachingAssignments.push({
          classId: cls.id,
          className: cls.name,
          subjectId: normalizedSubjectId,
          subjectName: subjectName,
        });
      }
    }

    return map;
  }, [classes, allTeachers]);

  // ── Fetch completion statuses for every class ──────────────────────────
  useEffect(() => {
    const fetchAllCompletionStatuses = async () => {
      if (!classes.length || !activeExamTypes.length) {
        setIsLoadingCompletions(false);
        return;
      }

      setIsLoadingCompletions(true);
      const cache = new Map<string, any>();

      try {
        const completionPromises = classes.map(async cls => {
          try {
            const statuses = await resultsService.getSubjectCompletionStatus(
              cls.id,
              term,
              year
            );
            return { classId: cls.id, statuses };
          } catch (error) {
            console.error(
              `Error fetching completion for class ${cls.id}:`,
              error
            );
            return { classId: cls.id, statuses: [] };
          }
        });

        const results = await Promise.all(completionPromises);

        for (const { classId, statuses } of results) {
          for (const status of statuses) {
            const key = `${classId}_${status.subjectId}`;
            cache.set(key, status);
          }
        }

        setCompletionCache(cache);
      } catch (error) {
        console.error('Error fetching completion statuses:', error);
      } finally {
        setIsLoadingCompletions(false);
      }
    };

    if (classes.length > 0 && !classesLoading && activeExamTypes.length > 0) {
      fetchAllCompletionStatuses();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, term, year, activeExamTypes, classesLoading]);

  const getCompletionStatus = useCallback(
    (classId: string, subjectId: string) => {
      const key = `${classId}_${subjectId}`;
      return completionCache.get(key);
    },
    [completionCache]
  );

  // ── Compute teacher progress ───────────────────────────────────────────
  const teacherProgress = useMemo((): TeacherProgress[] => {
    if (isLoading || activeExamTypes.length === 0) return [];

    let targetTeachers: Array<{
      teacherId: string;
      teacherName: string;
      teacherEmail?: string;
      formTeacherClasses: Set<string>;
      teachingAssignments: Array<{
        classId: string;
        className: string;
        subjectId: string;
        subjectName: string;
      }>;
    }> = [];

    if (teacherId) {
      const teacherData = allTeacherAssignmentsMap.get(teacherId);
      if (teacherData) {
        targetTeachers = [teacherData];
      }
    } else {
      targetTeachers = Array.from(allTeacherAssignmentsMap.values());
    }

    const results: TeacherProgress[] = [];

    // Prefer the enriched config (has week4Date, week4TotalMarks, etc.)
    const termConfig = configs?.find(
      (c: any) => c.term === term && c.year === year
    );

    for (const teacher of targetTeachers) {
      if (teacher.teachingAssignments.length === 0) continue;

      const classProgressMap = new Map<string, ClassProgress>();
      const allMissingEntries: MissingEntry[] = [];
      let totalRequired = 0;
      let totalCompleted = 0;

      for (const assignment of teacher.teachingAssignments) {
        const completion = getCompletionStatus(
          assignment.classId,
          assignment.subjectId
        );

        let totalStudents = 0;
        const examProgress: SubjectProgress['examProgress'] = [];

        for (const examType of activeExamTypes) {
          let enteredCount = 0;

          if (completion) {
            if (examType === 'week4') {
              enteredCount = completion.enteredStudents?.week4 || 0;
            } else if (examType === 'week8') {
              enteredCount = completion.enteredStudents?.week8 || 0;
            } else if (examType === 'endOfTerm') {
              enteredCount = completion.enteredStudents?.endOfTerm || 0;
            }
            totalStudents = completion.totalStudents || 0;
          }

          const examPercentage =
            totalStudents > 0
              ? Math.round((enteredCount / totalStudents) * 100)
              : 0;

          examProgress.push({
            examType,
            enteredCount,
            totalCount: totalStudents,
            percentage: examPercentage,
          });
        }

        const subjectExpectedEntries = totalStudents * activeExamTypes.length;
        const subjectCompletedEntries = examProgress.reduce(
          (sum, exam) => sum + exam.enteredCount,
          0
        );
        const subjectMissingEntries =
          subjectExpectedEntries - subjectCompletedEntries;
        const subjectCompletionPercentage =
          subjectExpectedEntries > 0
            ? Math.round(
                (subjectCompletedEntries / subjectExpectedEntries) * 100
              )
            : 100;

        const week4Complete = isExamComplete(
          examProgress.find(e => e.examType === 'week4')?.percentage || 0
        );
        const week8Complete = isExamComplete(
          examProgress.find(e => e.examType === 'week8')?.percentage || 0
        );
        const endOfTermComplete = isExamComplete(
          examProgress.find(e => e.examType === 'endOfTerm')?.percentage || 0
        );

        const week4StudentCount =
          examProgress.find(e => e.examType === 'week4')?.enteredCount || 0;
        const week8StudentCount =
          examProgress.find(e => e.examType === 'week8')?.enteredCount || 0;
        const endOfTermStudentCount =
          examProgress.find(e => e.examType === 'endOfTerm')?.enteredCount || 0;

        const expectedExams: ExamType[] = [...activeExamTypes];
        const completedExams: ExamType[] = [];
        const missingExams: ExamType[] = [];

        if (week4Complete) completedExams.push('week4');
        else if (activeExamTypes.includes('week4')) missingExams.push('week4');

        if (week8Complete) completedExams.push('week8');
        else if (activeExamTypes.includes('week8')) missingExams.push('week8');

        if (endOfTermComplete) completedExams.push('endOfTerm');
        else if (activeExamTypes.includes('endOfTerm'))
          missingExams.push('endOfTerm');

        for (const examType of missingExams) {
          const exam = examProgress.find(e => e.examType === examType);
          const missingStudentCount =
            (exam?.totalCount || 0) - (exam?.enteredCount || 0);

          let totalMarks: number | undefined;
          let configuredDate: string | undefined;

          if (termConfig) {
            if (examType === 'week4') {
              totalMarks = termConfig.week4TotalMarks;
              configuredDate = termConfig.week4Date;
            } else if (examType === 'week8') {
              totalMarks = termConfig.week8TotalMarks;
              configuredDate = termConfig.week8Date;
            } else if (examType === 'endOfTerm') {
              totalMarks = termConfig.endOfTermTotalMarks;
              configuredDate = termConfig.endOfTermDate;
            }
          }

          allMissingEntries.push({
            classId: assignment.classId,
            className: assignment.className,
            subjectId: assignment.subjectId,
            subjectName: assignment.subjectName,
            examType,
            examName: EXAM_NAMES[examType],
            totalMarks,
            configuredDate: configuredDate
              ? new Date(configuredDate).toISOString()
              : undefined,
            missingStudentCount,
            totalStudentCount: exam?.totalCount || 0,
          });
        }

        if (!classProgressMap.has(assignment.classId)) {
          classProgressMap.set(assignment.classId, {
            classId: assignment.classId,
            className: assignment.className,
            totalRequired: 0,
            completedCount: 0,
            missingCount: 0,
            completionPercentage: 0,
            subjects: [],
          });
        }

        const classProgress = classProgressMap.get(assignment.classId)!;
        classProgress.subjects.push({
          subjectId: assignment.subjectId,
          subjectName: assignment.subjectName,
          week4Complete,
          week8Complete,
          endOfTermComplete,
          week4StudentCount,
          week8StudentCount,
          endOfTermStudentCount,
          totalStudents,
          completionPercentage: subjectCompletionPercentage,
          expectedExams,
          completedExams,
          missingExams,
          examProgress,
        });

        classProgress.totalRequired += subjectExpectedEntries;
        classProgress.completedCount += subjectCompletedEntries;
        classProgress.missingCount += subjectMissingEntries;
        classProgress.completionPercentage =
          classProgress.totalRequired > 0
            ? Math.round(
                (classProgress.completedCount / classProgress.totalRequired) *
                  100
              )
            : 100;

        totalRequired += subjectExpectedEntries;
        totalCompleted += subjectCompletedEntries;
      }

      const missingCount = totalRequired - totalCompleted;
      const completionPercentage =
        totalRequired > 0
          ? Math.round((totalCompleted / totalRequired) * 100)
          : 100;

      const status = getStatusFromPercentage(completionPercentage);

      results.push({
        teacherId: teacher.teacherId,
        teacherName: teacher.teacherName,
        teacherEmail: teacher.teacherEmail,
        missingCount,
        totalRequired,
        completedCount: totalCompleted,
        completionPercentage,
        status,
        missingEntries: allMissingEntries,
        classProgress: Array.from(classProgressMap.values()),
        formTeacherClasses: Array.from(teacher.formTeacherClasses),
        teachingAssignments: teacher.teachingAssignments,
      });
    }

    return results.sort(
      (a, b) => a.completionPercentage - b.completionPercentage
    );
  }, [
    isLoading,
    allTeacherAssignmentsMap,
    activeExamTypes,
    configs,
    term,
    year,
    teacherId,
    getCompletionStatus,
  ]);

  const myProgress = useMemo(() => {
    if (!teacherId) return null;
    return teacherProgress.find(t => t.teacherId === teacherId) || null;
  }, [teacherProgress, teacherId]);

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
    (teacherIdToCheck: string): boolean => {
      const teacherData = allTeacherAssignmentsMap.get(teacherIdToCheck);
      if (!teacherData) return false;
      return (
        teacherData.teachingAssignments.length === 0 &&
        teacherData.formTeacherClasses.size > 0
      );
    },
    [allTeacherAssignmentsMap]
  );

  return {
    teacherProgress,
    myProgress,
    activeExamTypes,
    summary,
    missingByExamType,
    isLoading,
    isOnlyFormTeacher,
    getExamName: (examType: ExamType) => EXAM_NAMES[examType],

    // ── NEW: term context exposed to consumers ───────────────────────────
    /** Resolved term name (auto-detected if not supplied). */
    term,
    /** Resolved academic year (auto-detected if not supplied). */
    year,
    /** Formatted label, e.g. "Term 2 2025". */
    termLabel,
    /** Whether the resolved term/year is the currently active academic term. */
    isCurrentTerm: isTermCurrent,

    refetch: () => {
      setIsLoadingCompletions(true);
      setCompletionCache(new Map());
      setTimeout(() => {
        setIsLoadingCompletions(false);
      }, 100);
    },
  };
};