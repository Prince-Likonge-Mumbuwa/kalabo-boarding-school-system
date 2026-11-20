// @/hooks/useClassLearnerCounts.ts — boys, girls and total active learners in
// one class, counted live from Firestore (classService.getClassGenderStats,
// the same count the class pages use). Printed on every AI document.
import { useQuery } from '@tanstack/react-query';
import { classService } from '@/services/schoolService';

export function useClassLearnerCounts(classId: string | undefined) {
  return useQuery({
    queryKey: ['class-learner-counts', classId],
    queryFn: () => classService.getClassGenderStats(classId!),
    enabled: !!classId,
    staleTime: 5 * 60_000,
  });
}
