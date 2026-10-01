// @/hooks/useSchoolLearners.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { learnerService } from '@/services/schoolService';
import { Learner, CSVLearnerData, LearnerFilterOptions } from '@/types/school';
import { useMemo } from 'react';

// ==================== TYPES ====================

// Extended types for enhanced learner system
interface AddEnhancedLearnerData {
  fullName: string;
  address: string;
  dateOfFirstEntry: string;
  gender: 'male' | 'female';
  guardian: string;
  sponsor: string;
  guardianPhone: string;

  // ✅ Primary DOB (ISO "YYYY-MM-DD") — preferred going forward
  dateOfBirth?: string;
  // ⚠️ Legacy fallback — service derives dateOfBirth from this if needed
  birthYear?: number;

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

  // ✅ New: DOB is the source of truth for edits
  dateOfBirth?: string;
  // ⚠️ Legacy: still accepted, service recomputes dateOfBirth + age
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

// ==================== HOOK ====================

export const useSchoolLearners = (classId?: string) => {
  const queryClient = useQueryClient();

  // ==================== QUERIES ====================

  // Query: Get learners — handles both class-specific and all learners
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

  // ==================== DERIVED STATS ====================

  // SAFE: Memoized gender statistics — won't cause errors even if learners is empty
  const genderStats = useMemo(() => {
    const boys = learners.filter((l) => l?.gender === 'male').length;
    const girls = learners.filter((l) => l?.gender === 'female').length;
    const unspecified = learners.filter((l) => !l?.gender).length;
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

    learners.forEach((learner) => {
      if (learner.sponsor) {
        const count = sponsorMap.get(learner.sponsor) || 0;
        sponsorMap.set(learner.sponsor, count + 1);
      }
    });

    return Object.fromEntries(sponsorMap);
  }, [learners]);

  // ✅ NEW: Memoized age distribution — handy for reports
  const ageStats = useMemo(() => {
    const buckets: Record<string, number> = {
      '10-12': 0,
      '13-15': 0,
      '16-18': 0,
      '19+': 0,
      unknown: 0,
    };

    learners.forEach((learner) => {
      const age = learner.age;
      if (!age || age <= 0) {
        buckets.unknown++;
      } else if (age <= 12) {
        buckets['10-12']++;
      } else if (age <= 15) {
        buckets['13-15']++;
      } else if (age <= 18) {
        buckets['16-18']++;
      } else {
        buckets['19+']++;
      }
    });

    return buckets;
  }, [learners]);

  // ==================== SEARCH / FILTER (as mutations) ====================

  const searchLearnersQuery = useMutation({
    mutationFn: ({ classId, searchTerm }: { classId: string; searchTerm: string }) =>
      learnerService.searchLearnersInClass(classId, searchTerm),
  });

  const filterLearnersQuery = useMutation({
    mutationFn: (filters: LearnerFilterOptions) =>
      learnerService.getFilteredLearners(filters),
  });

  // ==================== ADD (ENHANCED) ====================

  const addEnhancedLearnerMutation = useMutation({
    mutationFn: (data: AddEnhancedLearnerData) => learnerService.addLearner(data),
    onSuccess: (result, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['learners', variables.classId] });
      queryClient.invalidateQueries({ queryKey: ['allLearners'] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      queryClient.invalidateQueries({ queryKey: ['learners', 'bySponsor'] });

      console.log(`✅ Learner added with ID: ${result.studentId}`);
    },
  });

  // ==================== ADD (LEGACY) ====================
  // Keeps backward compat with old AddLearnerData shape.
  // Now derives dateOfBirth from the age instead of storing birthYear.

  const addLearnerMutation = useMutation({
    mutationFn: async (data: AddLearnerData) => {
      const currentYear = new Date().getFullYear();
      const approxBirthYear = currentYear - data.age;

      // ✅ Send dateOfBirth (preferred). Keep birthYear as belt-and-braces.
      const enhancedData: AddEnhancedLearnerData = {
        fullName: data.name,
        address: '',
        dateOfFirstEntry: new Date().toISOString().split('T')[0],
        gender: data.gender,
        guardian: '',
        sponsor: 'Self',
        guardianPhone: data.parentPhone,
        dateOfBirth: `${approxBirthYear}-01-01`, // ✅ derived from age
        birthYear: approxBirthYear,              // ⚠️ legacy mirror
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

  // ==================== UPDATE ====================
  // The service recomputes birthYear + age whenever dateOfBirth is present.

  const updateLearnerMutation = useMutation({
    mutationFn: ({
      learnerId,
      updates,
    }: {
      learnerId: string;
      updates: UpdateLearnerData;
    }) => {
      // Direct passthrough — the service handles DOB normalization + derivation.
      return learnerService.updateLearner(learnerId, updates);
    },
    onSuccess: (_, variables) => {
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

  // ==================== BULK IMPORT ====================

  const bulkImportLearnersMutation = useMutation({
    mutationFn: ({
      classId,
      learnersData,
    }: {
      classId: string;
      learnersData: CSVLearnerData[];
    }) => learnerService.bulkImportLearners(classId, learnersData),
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

  // ==================== TRANSFER ====================

  const transferLearnerMutation = useMutation({
    mutationFn: ({
      learnerId,
      fromClassId,
      toClassId,
    }: {
      learnerId: string;
      fromClassId: string;
      toClassId: string;
    }) => learnerService.transferLearner(learnerId, fromClassId, toClassId),
    onSuccess: (newStudentId, variables) => {
      queryClient.invalidateQueries({ queryKey: ['learners', variables.fromClassId] });
      queryClient.invalidateQueries({ queryKey: ['learners', variables.toClassId] });
      queryClient.invalidateQueries({ queryKey: ['allLearners'] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });

      console.log(`✅ Learner transferred with new ID: ${newStudentId}`);
    },
  });

  // ==================== ARCHIVE (SOFT DELETE) ====================

  const removeLearnerMutation = useMutation({
    mutationFn: ({ learnerId, classId }: { learnerId: string; classId: string }) =>
      learnerService.removeLearner(learnerId, classId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['learners', variables.classId] });
      queryClient.invalidateQueries({ queryKey: ['allLearners'] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      console.log(`✅ Learner archived successfully`);
    },
  });

  // ==================== HARD DELETE (PERMANENT) ====================
  // Optimistically removes the learner from both class + all-learners caches.

  const hardDeleteLearnerMutation = useMutation({
    mutationFn: ({ learnerId, classId }: { learnerId: string; classId: string }) =>
      learnerService.hardDeleteLearner(learnerId, classId),
    onMutate: async ({ learnerId, classId }) => {
      await queryClient.cancelQueries({ queryKey: ['learners', classId] });
      await queryClient.cancelQueries({ queryKey: ['allLearners'] });

      const previousClassLearners = queryClient.getQueryData(['learners', classId]);
      const previousAllLearners = queryClient.getQueryData(['allLearners']);

      // Optimistically remove the learner from the cache
      queryClient.setQueryData(['learners', classId], (old: Learner[] = []) =>
        old.filter((l) => l.id !== learnerId)
      );

      queryClient.setQueryData(['allLearners'], (old: Learner[] = []) =>
        old.filter((l) => l.id !== learnerId)
      );

      return { previousClassLearners, previousAllLearners };
    },
    onError: (error, variables, context) => {
      // Rollback on error
      if (context?.previousClassLearners) {
        queryClient.setQueryData(
          ['learners', variables.classId],
          context.previousClassLearners
        );
      }
      if (context?.previousAllLearners) {
        queryClient.setQueryData(['allLearners'], context.previousAllLearners);
      }
      console.error('❌ Error hard deleting learner:', error);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['learners', variables.classId] });
      queryClient.invalidateQueries({ queryKey: ['allLearners'] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      console.log(`✅ Learner permanently deleted`);
    },
  });

  // ==================== UPDATE GENDER ====================

  const updateLearnerGenderMutation = useMutation({
    mutationFn: ({ learnerId, gender }: { learnerId: string; gender: 'male' | 'female' }) =>
      learnerService.updateLearnerGender(learnerId, gender),
    onSuccess: () => {
      if (classId) {
        queryClient.invalidateQueries({ queryKey: ['learners', classId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['allLearners'] });
      }
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
  });

  // ==================== LOOKUP MUTATIONS ====================

  const getLearnersBySponsorQuery = useMutation({
    mutationFn: (sponsorName: string) => learnerService.getLearnersBySponsor(sponsorName),
  });

  const getLearnerByStudentIdQuery = useMutation({
    mutationFn: (studentId: string) => learnerService.getLearnerByStudentId(studentId),
  });

  // ==================== HELPERS ====================

  const previewStudentId = async (
    classId: string,
    className?: string
  ): Promise<string | null> => {
    try {
      // Placeholder — components compute the preview themselves
      // using classPrefix + nextStudentIndex from the class doc.
      return null;
    } catch (error) {
      console.error('Error previewing student ID:', error);
      return null;
    }
  };

  // ==================== RETURN ====================

  return {
    // Data — SAFE: Always returns array (never undefined)
    learners,

    // Stats — SAFE: Always return valid objects
    genderStats,
    sponsorStats,
    ageStats, // ✅ New: age distribution

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
    isHardDeletingLearner: hardDeleteLearnerMutation.isPending,
    isSearching: searchLearnersQuery.isPending,
    isFiltering: filterLearnersQuery.isPending,
    isUpdatingGender: updateLearnerGenderMutation.isPending,
    isFetchingBySponsor: getLearnersBySponsorQuery.isPending,
    isUpdatingLearner: updateLearnerMutation.isPending,

    // Mutations (enhanced)
    addEnhancedLearner: addEnhancedLearnerMutation.mutateAsync,
    addLearner: addLearnerMutation.mutateAsync, // Backward compatible
    bulkImportLearners: bulkImportLearnersMutation.mutateAsync,
    transferLearner: transferLearnerMutation.mutateAsync,
    removeLearner: removeLearnerMutation.mutateAsync, // Soft delete (archive)
    hardDeleteLearner: hardDeleteLearnerMutation.mutateAsync, // Permanent delete
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