import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { learnerService } from '@/services/schoolService';
import { Learner, CSVImportData } from '@/types/school';

export const useSchoolLearners = (classId?: string) => {
  const queryClient = useQueryClient();

  // Query: Get learners by class
  const learnersQuery = useQuery({
    queryKey: ['learners', classId],
    queryFn: () => {
      if (!classId) throw new Error('Class ID is required');
      return learnerService.getLearnersByClass(classId);
    },
    enabled: !!classId,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Query: Search learners in class
  const searchLearnersQuery = useMutation({
    mutationFn: ({ classId, searchTerm }: { classId: string; searchTerm: string }) =>
      learnerService.searchLearnersInClass(classId, searchTerm),
  });

  // Mutation: Add individual learner
  const addLearnerMutation = useMutation({
    mutationFn: (data: {
      name: string;
      age: number;
      parentPhone: string;
      classId: string;
    }) => learnerService.addLearner(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['learners', variables.classId] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  // Mutation: Bulk import learners
  const bulkImportLearnersMutation = useMutation({
    mutationFn: ({ classId, learnersData }: { classId: string; learnersData: CSVImportData[] }) =>
      learnerService.bulkImportLearners(classId, learnersData),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['learners', variables.classId] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  // Mutation: Transfer learner
  const transferLearnerMutation = useMutation({
    mutationFn: ({ learnerId, fromClassId, toClassId }: {
      learnerId: string;
      fromClassId: string;
      toClassId: string;
    }) => learnerService.transferLearner(learnerId, fromClassId, toClassId),
    onSuccess: (_, variables) => {
      // Invalidate both old and new class data
      queryClient.invalidateQueries({ queryKey: ['learners', variables.fromClassId] });
      queryClient.invalidateQueries({ queryKey: ['learners', variables.toClassId] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
    },
  });

  // Mutation: Remove learner
  const removeLearnerMutation = useMutation({
    mutationFn: ({ learnerId, classId }: { learnerId: string; classId: string }) =>
      learnerService.removeLearner(learnerId, classId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['learners', variables.classId] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  return {
    // Data
    learners: learnersQuery.data || [],
    
    // Query states
    isLoading: learnersQuery.isLoading,
    isError: learnersQuery.isError,
    error: learnersQuery.error,
    
    // Mutation states
    isAddingLearner: addLearnerMutation.isPending,
    isImportingLearners: bulkImportLearnersMutation.isPending,
    isTransferringLearner: transferLearnerMutation.isPending,
    isRemovingLearner: removeLearnerMutation.isPending,
    isSearching: searchLearnersQuery.isPending,
    
    // Mutations
    addLearner: addLearnerMutation.mutateAsync,
    bulkImportLearners: bulkImportLearnersMutation.mutateAsync,
    transferLearner: transferLearnerMutation.mutateAsync,
    removeLearner: removeLearnerMutation.mutateAsync,
    searchLearners: searchLearnersQuery.mutateAsync,
    
    // Search results
    searchResults: searchLearnersQuery.data,
    
    // Refetch
    refetch: learnersQuery.refetch,
  };
};