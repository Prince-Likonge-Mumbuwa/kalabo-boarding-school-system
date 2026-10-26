// @/hooks/useNerveCentre.ts
//
// Everything the admin nerve centre shows. Each panel has its own query, so
// a slow or failing source never blanks the whole dashboard; live sources
// (lessons, registers, activity) refresh by themselves.

import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getCurrentAcademicTerm, getPreviousAcademicTerm } from '@/utils/academicTerm';
import { formatLocalYMD } from '@/services/timetableService';
import { useSchoolDayBoard } from '@/hooks/useTimetable';
import { useResultsEntryMonitor } from '@/hooks/useResultsEntryMonitor';
import { useSponsorList } from '@/hooks/useSponsorList';
import {
  loadClassesLite,
  loadDailyRegisters,
  loadHolidaysBetween,
  loadLearnersLite,
  loadRecentActivity,
  loadSlotsLite,
  loadSmsFailures,
  loadSponsorCodesExpiring,
  loadTeachersLite,
  loadTermConfigs,
  loadTermRows,
} from '@/services/nerveCentreLoader';
import { ymd } from '@/services/nerveCentre';

const MIN = 60_000;
export const NERVE_KEY = ['nerve-centre'] as const;

export function useNerveCentre(now: Date = new Date()) {
  const qc = useQueryClient();
  const term = getCurrentAcademicTerm(now);
  const prev = getPreviousAcademicTerm(term);
  const today = formatLocalYMD(now);
  // Registers: this term so far, at most the last 60 days (for at-risk attendance).
  const from = ymd(new Date(Math.max(term.startDate.getTime(), now.getTime() - 60 * 86_400_000)));

  const opt = { refetchOnWindowFocus: false } as const;
  const classes = useQuery({ queryKey: [...NERVE_KEY, 'classes'], queryFn: loadClassesLite, staleTime: 10 * MIN, ...opt });
  const activeClassIds = useMemo(() => (classes.data ?? []).filter(c => c.isActive !== false).map(c => c.id), [classes.data]);
  const learners = useQuery({ queryKey: [...NERVE_KEY, 'learners'], queryFn: loadLearnersLite, staleTime: 10 * MIN, ...opt });
  const registers = useQuery({
    queryKey: [...NERVE_KEY, 'registers', from, today, activeClassIds.join(',')],
    queryFn: () => loadDailyRegisters(activeClassIds, from, today),
    enabled: activeClassIds.length > 0,
    staleTime: MIN,
    refetchInterval: 2 * MIN,
    ...opt,
  });
  const board = useSchoolDayBoard(today);
  const rowsThis = useQuery({ queryKey: [...NERVE_KEY, 'rows', term.term, term.year], queryFn: () => loadTermRows(term.term, term.year), staleTime: 5 * MIN, ...opt });
  const rowsLast = useQuery({ queryKey: [...NERVE_KEY, 'rows', prev.term, prev.year], queryFn: () => loadTermRows(prev.term, prev.year), staleTime: 60 * MIN, ...opt });
  const configs = useQuery({ queryKey: [...NERVE_KEY, 'configs', term.term, term.year], queryFn: () => loadTermConfigs(term.term, term.year), staleTime: 5 * MIN, ...opt });
  const teachers = useQuery({ queryKey: [...NERVE_KEY, 'teachers'], queryFn: loadTeachersLite, staleTime: 10 * MIN, ...opt });
  const slots = useQuery({ queryKey: [...NERVE_KEY, 'slots'], queryFn: () => loadSlotsLite(), staleTime: 5 * MIN, ...opt });
  const holidays = useQuery({ queryKey: [...NERVE_KEY, 'holidays', term.term, term.year], queryFn: () => loadHolidaysBetween(ymd(term.startDate), ymd(term.endDate)), staleTime: 60 * MIN, ...opt });
  const sms = useQuery({ queryKey: [...NERVE_KEY, 'sms'], queryFn: () => loadSmsFailures(7), staleTime: 10 * MIN, ...opt });
  const activity = useQuery({ queryKey: [...NERVE_KEY, 'activity'], queryFn: () => loadRecentActivity(12), staleTime: 30_000, refetchInterval: MIN, ...opt });
  const codes = useQuery({ queryKey: [...NERVE_KEY, 'codes'], queryFn: () => loadSponsorCodesExpiring(3), staleTime: 30 * MIN, ...opt });
  const sponsor = useSponsorList();
  const monitor = useResultsEntryMonitor({ term: term.term, year: term.year });

  const all = [classes, learners, registers, board, rowsThis, rowsLast, configs, teachers, slots, holidays, sms, activity, codes];
  const updatedAt = Math.max(0, ...all.map(q => q.dataUpdatedAt || 0));

  return {
    now,
    today,
    term,
    prev,
    classes,
    learners,
    registers,
    board,
    rowsThis,
    rowsLast,
    configs,
    teachers,
    slots,
    holidays,
    sms,
    activity,
    codes,
    sponsorList: sponsor.list,
    monitor,
    updatedAt: updatedAt ? new Date(updatedAt) : null,
    isFetching: all.some(q => q.isFetching) || monitor.isFetching,
    refresh: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: NERVE_KEY }), board.refetch(), monitor.refetch()]);
    },
  };
}
