import { useQuery, useQueryClient } from '@tanstack/react-query';
import { classService } from '@/services/schoolService';
import { DashboardStats } from '@/types/school';

export const useDashboardStats = () => {
  const queryClient = useQueryClient();

  const statsQuery = useQuery<DashboardStats, Error>({
    queryKey: ['dashboardStats'],
    queryFn: classService.getDashboardStats,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });

  const refreshStats = async () => {
    await queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
  };

  return {
    stats: statsQuery.data,
    isLoading: statsQuery.isLoading,
    isError: statsQuery.isError,
    error: statsQuery.error,
    refetch: statsQuery.refetch,
    refreshStats,
  };
};