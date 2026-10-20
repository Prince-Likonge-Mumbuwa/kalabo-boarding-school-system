// @/hooks/useGuidanceOfficer.ts
// Is the signed-in teacher a guidance & counselling officer? (Admins always may.)
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { isGuidanceOfficer } from '@/services/guidanceService';

export function useGuidanceOfficer() {
  const { user } = useAuth();
  const uid = user?.uid;
  const isTeacher = user?.userType === 'teacher';
  const q = useQuery({
    queryKey: ['staffRoles', 'guidanceOfficer', uid],
    queryFn: () => isGuidanceOfficer(uid),
    enabled: !!uid && isTeacher,
    staleTime: 60_000,
  });
  return { isOfficer: q.data === true, isLoading: q.isLoading && !!uid && isTeacher };
}
