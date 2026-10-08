// @/hooks/useAttendanceRollup.ts
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { attendanceService } from '@/services/attendanceService';
import {
  buildRollupsForDate,
  buildRollupsForRange,
} from '@/utils/attendanceMath';
import type { AttendanceDailyRollup } from '@/types/attendance';

/**
 * All class rollups for a single date.
 * Cost: 1 sessions query + 1 learners query. Derivation is in-memory.
 */
export function useAttendanceRollupsForDate(date: string) {
  const sessionsQuery = useQuery({
    queryKey: ['attendance_sessions', 'by_date', date],
    queryFn: () => attendanceService.getSessionsByDate(date),
    staleTime: 30_000,
  });

  const learnersQuery = useQuery({
    queryKey: ['learners', 'active_indexed'],
    queryFn: () => attendanceService.getActiveLearnersIndexed(),
    staleTime: 5 * 60_000,
  });

  const data: AttendanceDailyRollup[] = useMemo(() => {
    if (!sessionsQuery.data || !learnersQuery.data) return [];
    return buildRollupsForDate(date, sessionsQuery.data, learnersQuery.data);
  }, [date, sessionsQuery.data, learnersQuery.data]);

  return {
    data,
    isLoading: sessionsQuery.isLoading || learnersQuery.isLoading,
    isError: sessionsQuery.isError || learnersQuery.isError,
    error: sessionsQuery.error ?? learnersQuery.error,
    refetch: async () => {
      await Promise.all([sessionsQuery.refetch(), learnersQuery.refetch()]);
    },
  };
}

/**
 * Rollups over a date range, one entry per (class, date).
 * Keep the range bounded — a term is fine, a year is not.
 */
export function useAttendanceRollupsForRange(
  startDate: string,
  endDate: string,
) {
  const sessionsQuery = useQuery({
    queryKey: ['attendance_sessions', 'by_range', startDate, endDate],
    queryFn: () => attendanceService.getSessionsByDateRange(startDate, endDate),
    staleTime: 60_000,
  });

  const learnersQuery = useQuery({
    queryKey: ['learners', 'active_indexed'],
    queryFn: () => attendanceService.getActiveLearnersIndexed(),
    staleTime: 5 * 60_000,
  });

  const data: AttendanceDailyRollup[] = useMemo(() => {
    if (!sessionsQuery.data || !learnersQuery.data) return [];
    return buildRollupsForRange(sessionsQuery.data, learnersQuery.data);
  }, [sessionsQuery.data, learnersQuery.data]);

  return {
    data,
    isLoading: sessionsQuery.isLoading || learnersQuery.isLoading,
    isError: sessionsQuery.isError || learnersQuery.isError,
    error: sessionsQuery.error ?? learnersQuery.error,
    refetch: async () => {
      await Promise.all([sessionsQuery.refetch(), learnersQuery.refetch()]);
    },
  };
}