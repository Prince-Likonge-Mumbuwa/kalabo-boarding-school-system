// @/hooks/useResultsEntryMonitor.ts
//
// Results entry monitor — used by the admin Results Entry Monitor and by the
// teacher dashboard warning.
//
// All counting now happens in services/resultsMonitor.ts on top of the
// shared results grid (services/resultsGrid.ts), the same grid behind the
// Results Entry page and Report Cards. For one teacher, class and subject
// the monitor therefore shows exactly what the Results Entry page shows.
//
//   - Term defaults to the current academic term.
//   - Active exams come from isExamActive() (box ticked AND total marks > 0).
//   - Class list = active learners; marks for anyone else are ignored.
//   - Subjects = class slots (never Form Teacher); credited to whoever may
//     enter marks now (live cover/TP, else the owner).
//   - "Complete" means nothing missing.
//   - Load failures are reported, never shown as 0% or 100%.
//   - Re-evaluated every 60s so covers start/expire on screen.

import { useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSchoolClasses } from './useSchoolClasses';
import { useSchoolTeachers } from './useSchoolTeachers';
import {
  getCurrentAcademicTerm,
  formatTermLabel,
  isCurrentTerm,
  type TermName,
} from '@/utils/academicTerm';
import { EXAM_LABELS, type ExamType } from '@/services/resultsGrid';
import {
  loadMonitorData,
  type MissingEntry,
  type TeacherProgress,
  type VacantSubject,
} from '@/services/resultsMonitor';

export type { ExamType } from '@/services/resultsGrid';
export type {
  MissingEntry,
  SubjectProgress,
  ClassProgress,
  TeacherProgress,
  VacantSubject,
} from '@/services/resultsMonitor';

interface UseResultsEntryMonitorOptions {
  term?: string;
  year?: number;
  teacherId?: string;
  /** Set false to skip loading (e.g. unused slots in the teacher warning). */
  enabled?: boolean;
}

const AUTHORITY_TICK_MS = 60 * 1000;

const EXAM_NAMES: Record<ExamType, string> = {
  week4: 'Week 4 Test',
  week8: 'Week 8 Test',
  endOfTerm: 'End of Term Exam',
};

export const useResultsEntryMonitor = (options: UseResultsEntryMonitorOptions = {}) => {
  const autoTerm = getCurrentAcademicTerm();
  const term = (options.term ?? autoTerm.term) as TermName;
  const year = options.year ?? autoTerm.year;
  const filterTeacherId = options.teacherId;
  const enabled = options.enabled !== false;

  const termLabel = useMemo(() => formatTermLabel(term, year), [term, year]);
  const isTermCurrent = useMemo(() => isCurrentTerm(term, year), [term, year]);

  const { allTeachers, isLoading: teachersLoading } = useSchoolTeachers();
  const { classes, isLoading: classesLoading } = useSchoolClasses({ isActive: true });

  const classList = useMemo(
    () =>
      (classes ?? []).map((c: any) => ({
        id: c.id as string,
        name: (c.name as string) || 'Unknown class',
        formTeacherId: (c.formTeacherId as string | undefined) ?? null,
      })),
    [classes]
  );

  const teacherInfo = useCallback(
    (id: string) => {
      const t = allTeachers.find((x: any) => x.id === id);
      return { name: t?.name, email: t?.email };
    },
    [allTeachers]
  );

  // One shared cache entry per term for every viewer in this browser — the
  // teacher filter is applied after loading.
  const monitorQuery = useQuery({
    queryKey: ['results_monitor', term, year, classList.map(c => c.id).join(',')],
    enabled: enabled && !classesLoading && !teachersLoading,
    refetchInterval: enabled ? AUTHORITY_TICK_MS : false,
    staleTime: 30 * 1000,
    queryFn: () => loadMonitorData(term, year, classList, teacherInfo),
  });

  const activeExamTypes: ExamType[] = monitorQuery.data?.ctx.activeExams ?? [];

  const teacherProgress = useMemo((): TeacherProgress[] => {
    const all = monitorQuery.data?.teachers ?? [];
    return filterTeacherId ? all.filter(t => t.teacherId === filterTeacherId) : all;
  }, [monitorQuery.data, filterTeacherId]);

  const myProgress = useMemo(
    () => (filterTeacherId ? teacherProgress.find(t => t.teacherId === filterTeacherId) ?? null : null),
    [teacherProgress, filterTeacherId]
  );

  const summary = useMemo(() => {
    const totalTeachers = teacherProgress.length;
    const totalRequiredEntries = teacherProgress.reduce((s, t) => s + t.totalRequired, 0);
    const totalMissingEntries = teacherProgress.reduce((s, t) => s + t.missingCount, 0);
    return {
      totalTeachers,
      totalMissingEntries,
      totalRequiredEntries,
      completedEntries: totalRequiredEntries - totalMissingEntries,
      overallCompletion:
        totalRequiredEntries > 0
          ? Math.round(((totalRequiredEntries - totalMissingEntries) / totalRequiredEntries) * 100)
          : 100,
      teachersComplete: teacherProgress.filter(t => t.status === 'complete').length,
      teachersOnTrack: teacherProgress.filter(t => t.status === 'on-track').length,
      teachersBehind: teacherProgress.filter(t => t.status === 'behind').length,
      teachersCritical: teacherProgress.filter(t => t.status === 'critical').length,
    };
  }, [teacherProgress]);

  const missingByExamType = useMemo(() => {
    const map: Record<ExamType, MissingEntry[]> = { week4: [], week8: [], endOfTerm: [] };
    for (const t of teacherProgress) {
      for (const e of t.missingEntries) map[e.examType].push(e);
    }
    return map;
  }, [teacherProgress]);

  const isOnlyFormTeacher = useCallback(
    (tid: string): boolean => {
      const t = teacherProgress.find(x => x.teacherId === tid);
      return !!t && t.teachingAssignments.length === 0 && t.formTeacherClasses.length > 0;
    },
    [teacherProgress]
  );

  return {
    teacherProgress,
    myProgress,
    activeExamTypes,
    summary,
    missingByExamType,
    vacantSubjects: (monitorQuery.data?.vacant ?? []) as VacantSubject[],
    failedClasses: monitorQuery.data?.failedClasses ?? [],
    isLoading: enabled && (monitorQuery.isLoading || classesLoading || teachersLoading),
    isFetching: monitorQuery.isFetching,
    isError: monitorQuery.isError,
    error: monitorQuery.error,
    isOnlyFormTeacher,
    getExamName: (examType: ExamType) => EXAM_NAMES[examType] ?? EXAM_LABELS[examType],
    term,
    year,
    termLabel,
    isCurrentTerm: isTermCurrent,
    refetch: monitorQuery.refetch,
  };
};
