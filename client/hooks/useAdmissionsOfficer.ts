// @/hooks/useAdmissionsOfficer.ts
// Is the signed-in teacher an admissions officer? (Admins always may admit.)
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { isAdmissionsOfficer } from '@/services/admissionsService';

export function useAdmissionsOfficer() {
  const { user } = useAuth();
  const uid = user?.uid;
  const isTeacher = user?.userType === 'teacher';
  const q = useQuery({
    queryKey: ['staffRoles', 'admissionsOfficer', uid],
    queryFn: () => isAdmissionsOfficer(uid),
    enabled: !!uid && isTeacher,
    staleTime: 60_000,
  });
  return { isOfficer: q.data === true, isLoading: q.isLoading && !!uid && isTeacher };
}
