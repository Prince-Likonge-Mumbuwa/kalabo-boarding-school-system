// @/hooks/useSba.ts
// React Query hooks for SBA — mirrors the conventions in useResults.ts

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sbaService } from '@/services/sbaService';
import type {
  SbaConfig,
  SbaResult,
  SbaClassCompletion,
  SbaSchoolOverview,
  SaveSbaInput,
  DeleteSbaInput,
} from '@/types/sba';

// ==================== CONFIG ====================

export const useSbaConfigs = () =>
  useQuery<SbaConfig[]>({
    queryKey: ['sba', 'config'],
    queryFn: () => sbaService.getAllConfigs(),
    staleTime: 30 * 60 * 1000, // 30 min — config rarely changes
  });

export const useSbaConfig = (subjectCode?: string) =>
  useQuery<SbaConfig | null>({
    queryKey: ['sba', 'config', subjectCode],
    queryFn: () => (subjectCode ? sbaService.getConfig(subjectCode) : null),
    enabled: !!subjectCode,
    staleTime: 30 * 60 * 1000,
  });

export const useSbaAssignmentsForTeacher = (
  teacherId?: string,
  examYear?: number
) =>
  useQuery({
    queryKey: ['sba', 'teacherAssignments', teacherId, examYear],
    queryFn: () =>
      teacherId && examYear
        ? sbaService.getSbaAssignmentsForTeacher(teacherId, examYear)
        : Promise.resolve([]),
    enabled: !!teacherId && !!examYear,
    staleTime: 2 * 60 * 1000,
  });

// ==================== RESULTS ====================

export const useSbaResults = (options: {
  classId?: string;
  subjectId?: string;
  examYear?: number;
}) =>
  useQuery<SbaResult[]>({
    queryKey: [
      'sba',
      'results',
      options.classId,
      options.subjectId,
      options.examYear,
    ],
    queryFn: () => {
      if (!options.classId || !options.examYear) return Promise.resolve([]);
      if (options.subjectId) {
        return sbaService.getSbaResultsForClassSubject(
          options.classId,
          options.subjectId,
          options.examYear
        );
      }
      return sbaService.getSbaResultsForClass(options.classId, options.examYear);
    },
    enabled: !!options.classId && !!options.examYear,
    staleTime: 0, // always fresh, matches results pattern
    refetchOnWindowFocus: true,
  });

// ==================== COMPLETION ====================

export const useSbaClassCompletion = (options: {
  classId?: string;
  examYear?: number;
}) =>
  useQuery<SbaClassCompletion | null>({
    queryKey: ['sba', 'completion', 'class', options.classId, options.examYear],
    queryFn: () =>
      options.classId && options.examYear
        ? sbaService.getSbaCompletionForClass(options.classId, options.examYear)
        : Promise.resolve(null),
    enabled: !!options.classId && !!options.examYear,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });

export const useSbaSubjectCompletion = (options: {
  classId?: string;
  subjectId?: string;
  examYear?: number;
}) =>
  useQuery({
    queryKey: [
      'sba',
      'completion',
      'subject',
      options.classId,
      options.subjectId,
      options.examYear,
    ],
    queryFn: async () => {
      if (!options.classId || !options.examYear) return null;
      const completion = await sbaService.getSbaCompletionForClass(
        options.classId,
        options.examYear
      );
      if (!completion) return null;
      if (!options.subjectId) return completion;
      const subject = completion.subjects.find(
        s => s.subjectId === options.subjectId
      );
      if (!subject) return null;
      return {
        ...completion,
        subjects: [subject],
      };
    },
    enabled: !!options.classId && !!options.examYear,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });

// ==================== SCHOOL OVERVIEW ====================

export const useSbaSchoolOverview = (examYear?: number) =>
  useQuery<SbaSchoolOverview | null>({
    queryKey: ['sba', 'schoolOverview', examYear],
    queryFn: () =>
      examYear
        ? sbaService.getSchoolOverview(examYear)
        : Promise.resolve(null),
    enabled: !!examYear,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });

// ==================== MUTATIONS ====================

export const useSaveSbaMarks = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: SaveSbaInput) => sbaService.saveSbaMarks(input),
    onSuccess: (result, variables) => {
      console.log(
        `✅ SBA saved: ${result.count} records (overwritten: ${result.overwritten})`
      );
      qc.invalidateQueries({ queryKey: ['sba', 'results'] });
      qc.invalidateQueries({ queryKey: ['sba', 'completion'] });
      qc.invalidateQueries({ queryKey: ['sba', 'schoolOverview'] });
      // Also invalidate teacher-scoped results if the page uses them
      qc.invalidateQueries({
        queryKey: [
          'sba',
          'results',
          variables.classId,
          variables.subjectId,
          variables.examYear,
        ],
      });
    },
    onError: error => {
      console.error('❌ SBA save failed:', error);
    },
  });
};

export const useDeleteSbaMarks = () => {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (input: DeleteSbaInput) => sbaService.deleteSbaMarks(input),
    onSuccess: (result, variables) => {
      console.log(`🗑️ SBA deleted: ${result.deletedCount} records`);
      qc.invalidateQueries({ queryKey: ['sba', 'results'] });
      qc.invalidateQueries({ queryKey: ['sba', 'completion'] });
      qc.invalidateQueries({ queryKey: ['sba', 'schoolOverview'] });
      qc.invalidateQueries({
        queryKey: [
          'sba',
          'results',
          variables.classId,
          variables.subjectId,
          variables.examYear,
        ],
      });
    },
    onError: error => {
      console.error('❌ SBA delete failed:', error);
    },
  });
};

// ==================== SEED (one-time, call from a dev console or admin page) ====================

export const useSeedSbaConfigs = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (force: boolean) => sbaService.seedSbaConfigs(force),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sba', 'config'] });
    },
  });
};