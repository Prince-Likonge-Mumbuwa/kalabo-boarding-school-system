// @/hooks/useExamConfig.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { examConfigService } from '@/services/examConfigService';
import type {
  ExamConfigFilters,
  ExamConfigInput,
  ExamConfigUpdate,
  ResolvedExamConfig,
  TermName,
} from '@/types/exam';
import { getCurrentAcademicTerm } from '@/utils/academicTerm';

// ─────────────────────────────────────────────────────────────────────────────
// Query Keys
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Centralized query-key factory so every hook/mutation invalidates the same
 * keys consistently. Follows TanStack Query's recommended pattern.
 */
export const examConfigKeys = {
  all: ['examConfigs'] as const,
  lists: () => [...examConfigKeys.all, 'list'] as const,
  list: (filters?: ExamConfigFilters) =>
    [...examConfigKeys.lists(), filters ?? {}] as const,
  details: () => [...examConfigKeys.all, 'detail'] as const,
  detail: (id: string) => [...examConfigKeys.details(), id] as const,
  current: () => [...examConfigKeys.all, 'current'] as const,
  currentList: () => [...examConfigKeys.all, 'currentList'] as const,
};

// ─────────────────────────────────────────────────────────────────────────────
// Main hook — filtered list of configs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch and mutate exam configurations.
 *
 * @param filters Optional filters (year, term, isActive).
 *                Pass `undefined` to fetch all configs.
 *
 * @example
 * ```tsx
 * const { configs, isLoading, createConfig } = useExamConfig({ year: 2025 });
 * ```
 */
export const useExamConfig = (filters?: ExamConfigFilters) => {
  const queryClient = useQueryClient();

  // ── Query: list of configs ─────────────────────────────────────────────
  const configsQuery = useQuery({
    queryKey: examConfigKeys.list(filters),
    queryFn: () => examConfigService.getConfigs(filters),
    staleTime: 30 * 1000,        // 30 seconds
    gcTime: 5 * 60 * 1000,       // 5 minutes
    refetchOnWindowFocus: true,
  });

  // ── Mutation: create ───────────────────────────────────────────────────
  const createConfigMutation = useMutation({
    mutationFn: (data: ExamConfigInput) =>
      examConfigService.createConfig(data),
    onSuccess: () => {
      // Invalidate every list AND the current-term views
      queryClient.invalidateQueries({ queryKey: examConfigKeys.lists() });
      queryClient.invalidateQueries({ queryKey: examConfigKeys.current() });
      queryClient.invalidateQueries({ queryKey: examConfigKeys.currentList() });
    },
  });

  // ── Mutation: update ───────────────────────────────────────────────────
  const updateConfigMutation = useMutation({
    mutationFn: ({
      configId,
      updates,
    }: {
      configId: string;
      updates: ExamConfigUpdate;
    }) => examConfigService.updateConfig(configId, updates),
    onSuccess: (_data, variables) => {
      // Invalidate the specific detail + all lists + current-term views
      queryClient.invalidateQueries({
        queryKey: examConfigKeys.detail(variables.configId),
      });
      queryClient.invalidateQueries({ queryKey: examConfigKeys.lists() });
      queryClient.invalidateQueries({ queryKey: examConfigKeys.current() });
      queryClient.invalidateQueries({ queryKey: examConfigKeys.currentList() });
    },
  });

  // ── Mutation: delete (hard) ────────────────────────────────────────────
  const deleteConfigMutation = useMutation({
    mutationFn: (configId: string) =>
      examConfigService.deleteConfig(configId),
    onSuccess: (_data, configId) => {
      queryClient.removeQueries({
        queryKey: examConfigKeys.detail(configId),
      });
      queryClient.invalidateQueries({ queryKey: examConfigKeys.lists() });
      queryClient.invalidateQueries({ queryKey: examConfigKeys.current() });
      queryClient.invalidateQueries({ queryKey: examConfigKeys.currentList() });
    },
  });

  // ── Mutation: deactivate (soft delete) ─────────────────────────────────
  const deactivateConfigMutation = useMutation({
    mutationFn: (configId: string) =>
      examConfigService.deactivateConfig(configId),
    onSuccess: (_data, configId) => {
      queryClient.invalidateQueries({
        queryKey: examConfigKeys.detail(configId),
      });
      queryClient.invalidateQueries({ queryKey: examConfigKeys.lists() });
      queryClient.invalidateQueries({ queryKey: examConfigKeys.current() });
      queryClient.invalidateQueries({ queryKey: examConfigKeys.currentList() });
    },
  });

  // ── Mutation: copy configs between terms ───────────────────────────────
  const copyConfigsMutation = useMutation({
    mutationFn: ({
      fromYear,
      fromTerm,
      toYear,
      toTerm,
    }: {
      fromYear: number;
      fromTerm: TermName;
      toYear: number;
      toTerm: TermName;
    }) =>
      examConfigService.copyConfigs(
        fromYear,
        fromTerm,
        toYear,
        toTerm
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: examConfigKeys.lists() });
      queryClient.invalidateQueries({ queryKey: examConfigKeys.current() });
      queryClient.invalidateQueries({ queryKey: examConfigKeys.currentList() });
    },
  });

  return {
    // ── Data ─────────────────────────────────────────────────────────────
    /** Enriched configs (each carries termStartDate, termEndDate, etc.) */
    configs: configsQuery.data ?? [],

    // ── Query states ─────────────────────────────────────────────────────
    isLoading: configsQuery.isLoading,
    isFetching: configsQuery.isFetching,
    isError: configsQuery.isError,
    error: configsQuery.error,
    isSuccess: configsQuery.isSuccess,

    // ── Mutation states ──────────────────────────────────────────────────
    isCreating: createConfigMutation.isPending,
    isUpdating: updateConfigMutation.isPending,
    isDeleting: deleteConfigMutation.isPending,
    isDeactivating: deactivateConfigMutation.isPending,
    isCopying: copyConfigsMutation.isPending,

    // ── Mutations ────────────────────────────────────────────────────────
    createConfig: createConfigMutation.mutateAsync,
    updateConfig: updateConfigMutation.mutateAsync,
    deleteConfig: deleteConfigMutation.mutateAsync,
    deactivateConfig: deactivateConfigMutation.mutateAsync,
    copyConfigs: copyConfigsMutation.mutateAsync,

    // ── Refetch ──────────────────────────────────────────────────────────
    refetch: configsQuery.refetch,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Single config by ID
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch a single exam config by ID.
 *
 * @example
 * ```tsx
 * const { config, isLoading } = useExamConfigById(configId);
 * ```
 */
export function useExamConfigById(configId: string | undefined) {
  return useQuery({
    queryKey: examConfigKeys.detail(configId ?? ''),
    queryFn: () => examConfigService.getConfigById(configId!),
    enabled: !!configId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Current-term config (auto-detected)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch the exam config for the CURRENT academic term (auto-detected from
 * the real-time calendar). This is the preferred hook for dashboards,
 * warnings, and any UI that should reflect "right now".
 *
 * The query key is derived from the current term + year so React Query
 * naturally refetches when the term rolls over.
 *
 * @example
 * ```tsx
 * const { config, isLoading } = useCurrentTermExamConfig();
 * if (config) {
 *   console.log(`${config.termLabel} — ${config.isCurrentTerm}`);
 * }
 * ```
 */
export function useCurrentTermExamConfig() {
  const current = getCurrentAcademicTerm();

  return useQuery({
    queryKey: [...examConfigKeys.current(), current.term, current.year],
    queryFn: () => examConfigService.getCurrentTermConfig(),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

/**
 * Fetch ALL active configs for the current academic term.
 * Normally just one, but this handles edge cases where multiple configs
 * exist for the same term.
 */
export function useCurrentTermExamConfigs() {
  const current = getCurrentAcademicTerm();

  return useQuery({
    queryKey: [...examConfigKeys.currentList(), current.term, current.year],
    queryFn: () => examConfigService.getCurrentTermConfigs(),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience re-exports
// ─────────────────────────────────────────────────────────────────────────────

export type {
  ExamConfigFilters,
  ExamConfigInput,
  ExamConfigUpdate,
  ResolvedExamConfig,
  TermName,
};