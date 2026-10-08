// @/hooks/useStudentIndex.ts
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { attendanceService } from '@/services/attendanceService';
import {
  computeStudentIndex,
  formatLocalYMD,
} from '@/utils/attendanceMath';
import type { StudentAttendanceIndex } from '@/types/attendance';

/**
 * One class's student risk indexes, derived from a term's sessions.
 * Cost: 1 sessions query + 1 learners query.
 *
 * Pass `classId: undefined` to disable the query (used when the admin
 * dashboard is in "all classes" mode and risk can't be scoped).
 */
export function useClassRiskIndex(
  classId: string | undefined,
  className: string,
  termStartDate: string,
) {
  const today = useMemo(() => formatLocalYMD(new Date()), []);

  const sessionsQuery = useQuery({
    queryKey: [
      'attendance_sessions',
      'for_class_risk',
      classId,
      termStartDate,
      today,
    ],
    queryFn: () =>
      attendanceService.getSessionsForClassRange(classId!, termStartDate, today),
    enabled: !!classId,
    staleTime: 5 * 60_000,
  });

  const learnersQuery = useQuery({
    queryKey: ['learners', 'active_indexed'],
    queryFn: () => attendanceService.getActiveLearnersIndexed(),
    enabled: !!classId,
    staleTime: 5 * 60_000,
  });

  const data: StudentAttendanceIndex[] = useMemo(() => {
    if (!sessionsQuery.data || !learnersQuery.data || !classId) return [];
    const classLearners = learnersQuery.data.filter(l => l.classId === classId);
    return classLearners.map(l =>
      computeStudentIndex(
        l.id,
        l.fullName,
        classId,
        className,
        sessionsQuery.data!,
        today,
      ),
    );
  }, [sessionsQuery.data, learnersQuery.data, classId, className, today]);

  const atRisk = useMemo(
    () => data.filter(i => i.riskLevel === 'high' || i.riskLevel === 'medium'),
    [data],
  );

  return {
    data,
    atRisk,
    isLoading: sessionsQuery.isLoading || learnersQuery.isLoading,
    isError: sessionsQuery.isError || learnersQuery.isError,
    error: sessionsQuery.error ?? learnersQuery.error,
    refetch: async () => {
      await Promise.all([sessionsQuery.refetch(), learnersQuery.refetch()]);
    },
  };
}

/**
 * One student's attendance index, derived from their class's sessions.
 * Cost: 1 sessions query + (learners query shared with other hooks).
 */
export function useStudentIndex(
  studentId: string | undefined,
  studentName: string,
  classId: string | undefined,
  className: string,
  termStartDate: string,
) {
  const today = useMemo(() => formatLocalYMD(new Date()), []);

  const sessionsQuery = useQuery({
    queryKey: [
      'attendance_sessions',
      'for_student_index',
      classId,
      termStartDate,
      today,
    ],
    queryFn: () =>
      attendanceService.getSessionsForClassRange(classId!, termStartDate, today),
    enabled: !!classId,
    staleTime: 5 * 60_000,
  });

  const index: StudentAttendanceIndex | null = useMemo(() => {
    if (!sessionsQuery.data || !studentId || !classId) return null;
    return computeStudentIndex(
      studentId,
      studentName,
      classId,
      className,
      sessionsQuery.data,
      today,
    );
  }, [sessionsQuery.data, studentId, studentName, classId, className, today]);

  return {
    data: index,
    isLoading: sessionsQuery.isLoading,
    isError: sessionsQuery.isError,
    error: sessionsQuery.error,
    refetch: sessionsQuery.refetch,
  };
}