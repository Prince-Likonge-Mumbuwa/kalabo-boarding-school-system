import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { learnerService } from '@/services/schoolService';
import { Learner, CSVLearnerData, LearnerFilterOptions } from '@/types/school';
import { useMemo } from 'react';

// Extended types for enhanced learner system
interface AddEnhancedLearnerData {
  fullName: string;
  address: string;
  dateOfFirstEntry: string;
  gender: 'male' | 'female';
  guardian: string;
  sponsor: string;
  guardianPhone: string;
  birthYear: number;
  classId: string;
  preferredName?: string;
  alternativeGuardian?: string;
  alternativeGuardianPhone?: string;
  previousSchool?: string;
  medicalNotes?: string;
  allergies?: string[];
}

// Update learner data interface
interface UpdateLearnerData {
  fullName?: string;
  preferredName?: string;
  address?: string;
  gender?: 'male' | 'female';
  guardian?: string;
  guardianPhone?: string;
  alternativeGuardian?: string;
  alternativeGuardianPhone?: string;
  sponsor?: string;
  birthYear?: number;
  previousSchool?: string;
  medicalNotes?: string;
  allergies?: string[];
}

// Keep backward compatibility with old interface
interface AddLearnerData {
  name: string;
  age: number;
  gender: 'male' | 'female';
  parentPhone: string;
  classId: string;
}

export const useSchoolLearners = (classId?: string) => {
  const queryClient = useQueryClient();

  // Query: Get learners - handles both class-specific and all learners
  const learnersQuery = useQuery({
    queryKey: classId ? ['learners', classId] : ['allLearners'],
    queryFn: async () => {
      if (classId) {
        // Get learners for a specific class with enhanced fields
        return await learnerService.getLearnersByClass(classId);
      } else {
        // Get all learners (for admin view) with enhanced fields
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

  // SAFE: Memoized sponsor statistics
  const sponsorStats = useMemo(() => {
    const sponsorMap = new Map<string, number>();
    
    learners.forEach(learner => {
      if (learner.sponsor) {
        const count = sponsorMap.get(learner.sponsor) || 0;
        sponsorMap.set(learner.sponsor, count + 1);
      }
    });
    
    return Object.fromEntries(sponsorMap);
  }, [learners]);

  // Query: Search learners in class
  const searchLearnersQuery = useMutation({
    mutationFn: ({ classId, searchTerm }: { classId: string; searchTerm: string }) =>
      learnerService.searchLearnersInClass(classId, searchTerm),
  });

  // Query: Filter learners with multiple criteria
  const filterLearnersQuery = useMutation({
    mutationFn: (filters: LearnerFilterOptions) =>
      learnerService.getFilteredLearners(filters),
  });

  // Mutation: Add individual learner (enhanced version)
  const addEnhancedLearnerMutation = useMutation({
    mutationFn: (data: AddEnhancedLearnerData) => learnerService.addLearner(data),
    onSuccess: (result, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['learners', variables.classId] });
      queryClient.invalidateQueries({ queryKey: ['allLearners'] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      
      // Also invalidate sponsor stats
      queryClient.invalidateQueries({ queryKey: ['learners', 'bySponsor'] });
      
      console.log(`✅ Learner added with ID: ${result.studentId}`);
    },
  });

  // Keep backward compatibility with old addLearner
  const addLearnerMutation = useMutation({
    mutationFn: async (data: AddLearnerData) => {
      // Convert old format to new format
      const currentYear = new Date().getFullYear();
      const enhancedData: AddEnhancedLearnerData = {
        fullName: data.name,
        address: '', // Default empty for backward compatibility
        dateOfFirstEntry: new Date().toISOString().split('T')[0], // Today as default
        gender: data.gender,
        guardian: '', // Default empty for backward compatibility
        sponsor: 'Self', // Default sponsor
        guardianPhone: data.parentPhone,
        birthYear: currentYear - data.age, // Calculate birth year from age
        classId: data.classId,
      };
      
      return learnerService.addLearner(enhancedData);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['learners', variables.classId] });
      queryClient.invalidateQueries({ queryKey: ['allLearners'] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  // Mutation: Update learner (UPDATED - now uses the actual service method)
  const updateLearnerMutation = useMutation({
    mutationFn: ({ learnerId, updates }: { learnerId: string; updates: UpdateLearnerData }) => {
      // Now directly calling the service method that we added
      return learnerService.updateLearner(learnerId, updates);
    },
    onSuccess: (_, variables) => {
      // Invalidate relevant queries
      if (classId) {
        queryClient.invalidateQueries({ queryKey: ['learners', classId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['allLearners'] });
      }
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      queryClient.invalidateQueries({ queryKey: ['learners', 'bySponsor'] });
      
      console.log(`✅ Learner updated successfully`);
    },
    onError: (error) => {
      console.error('❌ Error updating learner:', error);
    },
  });

  // Mutation: Bulk import learners
  const bulkImportLearnersMutation = useMutation({
    mutationFn: ({ classId, learnersData }: { classId: string; learnersData: CSVLearnerData[] }) =>
      learnerService.bulkImportLearners(classId, learnersData),
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['learners', variables.classId] });
      queryClient.invalidateQueries({ queryKey: ['allLearners'] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      queryClient.invalidateQueries({ queryKey: ['learners', 'bySponsor'] });
      
      console.log(`✅ Bulk import completed: ${result.success} learners added`);
      console.log(`📋 Generated student IDs:`, result.studentIds);
    },
  });

  // Mutation: Transfer learner
  const transferLearnerMutation = useMutation({
    mutationFn: ({ learnerId, fromClassId, toClassId }: {
      learnerId: string;
      fromClassId: string;
      toClassId: string;
    }) => learnerService.transferLearner(learnerId, fromClassId, toClassId),
    onSuccess: (newStudentId, variables) => {
      // Invalidate both old and new class data
      queryClient.invalidateQueries({ queryKey: ['learners', variables.fromClassId] });
      queryClient.invalidateQueries({ queryKey: ['learners', variables.toClassId] });
      queryClient.invalidateQueries({ queryKey: ['allLearners'] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      
      console.log(`✅ Learner transferred with new ID: ${newStudentId}`);
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
      if (classId) {
        queryClient.invalidateQueries({ queryKey: ['learners', classId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['allLearners'] });
      }
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  // Mutation: Get learners by sponsor
  const getLearnersBySponsorQuery = useMutation({
    mutationFn: (sponsorName: string) => learnerService.getLearnersBySponsor(sponsorName),
  });

  // Mutation: Get learner by student ID
  const getLearnerByStudentIdQuery = useMutation({
    mutationFn: (studentId: string) => learnerService.getLearnerByStudentId(studentId),
  });

  // Helper function: Generate student ID preview
  const previewStudentId = async (classId: string, className?: string): Promise<string | null> => {
    try {
      // This would need class details - you might want to pass class type/level/section
      // For now, return null and let components handle it
      return null;
    } catch (error) {
      console.error('Error previewing student ID:', error);
      return null;
    }
  };

  return {
    // Data - SAFE: Always returns array (never undefined)
    learners,
    
    // Gender stats - SAFE: Always returns valid stats object
    genderStats,
    
    // Sponsor stats
    sponsorStats,
    
    // Query states
    isLoading: learnersQuery.isLoading,
    isFetching: learnersQuery.isFetching,
    isError: learnersQuery.isError,
    error: learnersQuery.error,
    
    // Mutation states
    isAddingLearner: addLearnerMutation.isPending || addEnhancedLearnerMutation.isPending,
    isImportingLearners: bulkImportLearnersMutation.isPending,
    isTransferringLearner: transferLearnerMutation.isPending,
    isRemovingLearner: removeLearnerMutation.isPending,
    isSearching: searchLearnersQuery.isPending,
    isFiltering: filterLearnersQuery.isPending,
    isUpdatingGender: updateLearnerGenderMutation.isPending,
    isFetchingBySponsor: getLearnersBySponsorQuery.isPending,
    isUpdatingLearner: updateLearnerMutation.isPending,
    
    // Mutations (enhanced)
    addEnhancedLearner: addEnhancedLearnerMutation.mutateAsync,
    addLearner: addLearnerMutation.mutateAsync, // Keep for backward compatibility
    bulkImportLearners: bulkImportLearnersMutation.mutateAsync,
    transferLearner: transferLearnerMutation.mutateAsync,
    removeLearner: removeLearnerMutation.mutateAsync,
    searchLearners: searchLearnersQuery.mutateAsync,
    filterLearners: filterLearnersQuery.mutateAsync,
    updateLearnerGender: updateLearnerGenderMutation.mutateAsync,
    getLearnersBySponsor: getLearnersBySponsorQuery.mutateAsync,
    getLearnerByStudentId: getLearnerByStudentIdQuery.mutateAsync,
    updateLearner: updateLearnerMutation.mutateAsync,
    
    // Search results
    searchResults: searchLearnersQuery.data,
    filterResults: filterLearnersQuery.data,
    learnersBySponsor: getLearnersBySponsorQuery.data,
    learnerByStudentId: getLearnerByStudentIdQuery.data,
    
    // Helper functions
    previewStudentId,
    
    // Refetch
    refetch: learnersQuery.refetch,
  };
};