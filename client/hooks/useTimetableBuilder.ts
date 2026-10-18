// Data hooks for the timetable generator (admin and Timetabler HoDs).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import type { TermName } from '@/utils/academicTerm';
import {
  isTimetabler,
  listSignoffs,
  listTimetablers,
  listVersions,
  loadGeneratorInputs,
} from '@/services/timetableGenerator/service';

export const builderKeys = {
  all: ['timetable-builder'] as const,
  inputs: () => ['timetable-builder', 'inputs'] as const,
  signoffs: (term: TermName, year: number) => ['timetable-builder', 'signoffs', term, year] as const,
  versions: (term: TermName, year: number) => ['timetable-builder', 'versions', term, year] as const,
  timetablers: () => ['timetable-builder', 'timetablers'] as const,
  role: (uid?: string) => ['timetable-builder', 'role', uid] as const,
};

/** Is the signed-in teacher allowed to generate timetables? */
export function useTimetablerRole() {
  const { user } = useAuth();
  const enabled = user?.userType === 'teacher' && !!user?.uid;
  const q = useQuery({ queryKey: builderKeys.role(user?.uid), queryFn: () => isTimetabler(user!.uid), enabled, staleTime: 5 * 60_000 });
  return { isTimetabler: q.data === true, isLoading: enabled && q.isLoading };
}

export const useGeneratorInputs = () =>
  useQuery({ queryKey: builderKeys.inputs(), queryFn: loadGeneratorInputs, staleTime: 60_000 });

export const useSignoffs = (term: TermName, year: number) =>
  useQuery({ queryKey: builderKeys.signoffs(term, year), queryFn: () => listSignoffs(term, year), staleTime: 30_000 });

export const useVersions = (term: TermName, year: number) =>
  useQuery({ queryKey: builderKeys.versions(term, year), queryFn: () => listVersions(term, year), staleTime: 30_000 });

export const useTimetablers = (enabled = true) =>
  useQuery({ queryKey: builderKeys.timetablers(), queryFn: listTimetablers, enabled, staleTime: 60_000 });

export function useInvalidateBuilder() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: builderKeys.all });
}
