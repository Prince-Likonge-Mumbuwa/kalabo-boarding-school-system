import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { learnerService } from '@/services/schoolService';
import { Learner, CSVImportData } from '@/types/school';
import { useMemo } from 'react';

// Extended types for gender support
interface AddLearnerData {
  name: string;
  age: number;
  gender: 'male' | 'female';
  parentPhone: string;
  classId: string;
}

interface CSVLearnerData extends CSVImportData {
  name: string;
  age: number;
  gender: 'male' | 'female';
  parentPhone: string;
}

export const useSchoolLearners = (classId?: string) => {
  const queryClient = useQueryClient();

  // Query: Get learners - handles both class-specific and all learners
  const learnersQuery = useQuery({
    queryKey: classId ? ['learners', classId] : ['allLearners'],
    queryFn: async () => {
      if (classId) {
        // Get learners for a specific class
        return await learnerService.getLearnersByClass(classId);
      } else {
        // Get all learners (for admin view)
        return await learnerService.getAllLearners();
      }
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // SAFE: Always use empty array fallback
  const learners = learnersQuery.data || [];

  // SAFE: Memoized gender statistics - won't cause errors even if learners is empty
  const genderStats = useMemo(() => {
    const boys = learners.filter(l => l?.gender === 'male').length;
    const girls = learners.filter(l => l?.gender === 'female').length;
    const unspecified = learners.filter(l => !l?.gender).length;
    const total = learners.length;
    
    return {
      boys,
      girls,
      unspecified,
      total,
      boysPercentage: total > 0 ? Math.round((boys / total) * 100) : 0,
      girlsPercentage: total > 0 ? Math.round((girls / total) * 100) : 0,
    };
  }, [learners]);

  // Query: Search learners in class
  const searchLearnersQuery = useMutation({
    mutationFn: ({ classId, searchTerm }: { classId: string; searchTerm: string }) =>
      learnerService.searchLearnersInClass(classId, searchTerm),
  });

  // Mutation: Add individual learner
  const addLearnerMutation = useMutation({
    mutationFn: (data: AddLearnerData) => learnerService.addLearner(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['learners', variables.classId] });
      queryClient.invalidateQueries({ queryKey: ['allLearners'] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  // Mutation: Bulk import learners
  const bulkImportLearnersMutation = useMutation({
    mutationFn: ({ classId, learnersData }: { classId: string; learnersData: CSVLearnerData[] }) =>
      learnerService.bulkImportLearners(classId, learnersData),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['learners', variables.classId] });
      queryClient.invalidateQueries({ queryKey: ['allLearners'] });
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
      queryClient.invalidateQueries({ queryKey: ['allLearners'] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
    },
  });

  // Mutation: Remove learner
  const removeLearnerMutation = useMutation({
    mutationFn: ({ learnerId, classId }: { learnerId: string; classId: string }) =>
      learnerService.removeLearner(learnerId, classId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['learners', variables.classId] });
      queryClient.invalidateQueries({ queryKey: ['allLearners'] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  // Mutation: Update learner gender
  const updateLearnerGenderMutation = useMutation({
    mutationFn: ({ learnerId, gender }: { learnerId: string; gender: 'male' | 'female' }) =>
      learnerService.updateLearnerGender(learnerId, gender),
    onSuccess: () => {
      // Invalidate all learners queries since gender might affect multiple views
      queryClient.invalidateQueries({ queryKey: ['learners'] });
      queryClient.invalidateQueries({ queryKey: ['allLearners'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  return {
    // Data - SAFE: Always returns array (never undefined)
    learners,
    
    // Gender stats - SAFE: Always returns valid stats object
    genderStats,
    
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
    isUpdatingGender: updateLearnerGenderMutation.isPending,
    
    // Mutations
    addLearner: addLearnerMutation.mutateAsync,
    bulkImportLearners: bulkImportLearnersMutation.mutateAsync,
    transferLearner: transferLearnerMutation.mutateAsync,
    removeLearner: removeLearnerMutation.mutateAsync,
    searchLearners: searchLearnersQuery.mutateAsync,
    updateLearnerGender: updateLearnerGenderMutation.mutateAsync,
    
    // Search results
    searchResults: searchLearnersQuery.data,
    
    // Refetch
    refetch: learnersQuery.refetch,
  };
};