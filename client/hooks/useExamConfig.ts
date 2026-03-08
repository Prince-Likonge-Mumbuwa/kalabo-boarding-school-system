// @/hooks/useExamConfig.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { examConfigService } from '@/services/examConfigService';
import { ExamConfig, ExamConfigFilters } from '@/types/exam';

export const useExamConfig = (filters?: ExamConfigFilters) => {
  const queryClient = useQueryClient();

  // Query: Get exam configurations
  const configsQuery = useQuery({
    queryKey: ['examConfigs', filters],
    queryFn: () => examConfigService.getConfigs(filters),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  // Mutation: Create new configuration
  const createConfigMutation = useMutation({
    mutationFn: (data: Partial<ExamConfig>) => examConfigService.createConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['examConfigs'] });
    },
  });

  // Mutation: Update configuration
  const updateConfigMutation = useMutation({
    mutationFn: ({ configId, updates }: { configId: string; updates: Partial<ExamConfig> }) =>
      examConfigService.updateConfig(configId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['examConfigs'] });
    },
  });

  // Mutation: Delete configuration
  const deleteConfigMutation = useMutation({
    mutationFn: (configId: string) => examConfigService.deleteConfig(configId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['examConfigs'] });
    },
  });

  // Mutation: Copy configurations from one term to another
  const copyConfigsMutation = useMutation({
    mutationFn: ({ fromYear, fromTerm, toYear, toTerm }: {
      fromYear: number;
      fromTerm: string;
      toYear: number;
      toTerm: string;
    }) => examConfigService.copyConfigs(fromYear, fromTerm, toYear, toTerm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['examConfigs'] });
    },
  });

  return {
    // Data
    configs: configsQuery.data || [],
    
    // Query states
    isLoading: configsQuery.isLoading,
    isFetching: configsQuery.isFetching,
    isError: configsQuery.isError,
    error: configsQuery.error,
    
    // Mutation states
    isCreating: createConfigMutation.isPending,
    isUpdating: updateConfigMutation.isPending,
    isDeleting: deleteConfigMutation.isPending,
    isCopying: copyConfigsMutation.isPending,
    
    // Mutations
    createConfig: createConfigMutation.mutateAsync,
    updateConfig: updateConfigMutation.mutateAsync,
    deleteConfig: deleteConfigMutation.mutateAsync,
    copyConfigs: copyConfigsMutation.mutateAsync,
    
    // Refetch
    refetch: configsQuery.refetch,
  };
};