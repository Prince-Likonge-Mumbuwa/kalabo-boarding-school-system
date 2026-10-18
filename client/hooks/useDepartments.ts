// @/hooks/useDepartments.ts — departments list, a teacher's own departments,
// and Heads of Department.
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import { getDepartmentConfig, getDepartmentList, getHodRole, listHods, listSlotsForSubjects, teacherDepartments } from '@/services/departmentService';

/** The school's list of departments (defaults until an admin adds one). */
export function useDepartmentList() {
  return useQuery({ queryKey: ['departments', 'list'], queryFn: getDepartmentList, staleTime: 5 * 60_000 });
}

/** Every HoD role (active and ended) — Teacher Management. */
export function useHods(enabled = true) {
  return useQuery({ queryKey: ['staffRoles', 'hod', 'all'], queryFn: listHods, enabled, staleTime: 60_000 });
}

/** The department the signed-in teacher heads, if any. */
export function useMyHodRole() {
  const { user } = useAuth();
  const uid = user?.uid;
  const isTeacher = user?.userType === 'teacher';
  const q = useQuery({
    queryKey: ['staffRoles', 'hod', uid],
    queryFn: () => getHodRole(uid),
    enabled: !!uid && isTeacher,
    staleTime: 60_000,
  });
  return { role: q.data ?? null, isHod: !!q.data, isLoading: q.isLoading && !!uid && isTeacher };
}

/** The signed-in user's departments, read from their users/{uid} record. */
export function useMyDepartments() {
  const { user } = useAuth();
  const uid = user?.uid;
  return useQuery({
    queryKey: ['departments', 'mine', uid],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'users', uid!));
      return teacherDepartments(snap.exists() ? snap.data() : null);
    },
    enabled: !!uid,
    staleTime: 60_000,
  });
}

/** Refresh everything that shows departments or HoDs. */
export function useInvalidateDepartments() {
  const qc = useQueryClient();
  return useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['departments'] }),
      qc.invalidateQueries({ queryKey: ['staffRoles'] }),
      qc.invalidateQueries({ queryKey: ['teachers'] }),
      qc.invalidateQueries({ queryKey: ['dashboardStats'] }),
    ]);
  }, [qc]);
}

/** Department list + which subjects belong to which department. */
export function useDepartmentConfig() {
  return useQuery({ queryKey: ['departments', 'config'], queryFn: getDepartmentConfig, staleTime: 60_000 });
}

/**
 * Class slots of these subjects. Under the 'class_slots' key so every
 * assignment change (admin or HoD) refreshes it.
 */
export function useSlotsForSubjects(subjects: string[]) {
  const sorted = [...subjects].sort();
  return useQuery({
    queryKey: ['class_slots', 'subjects', sorted.join('|')],
    queryFn: () => listSlotsForSubjects(sorted),
    enabled: sorted.length > 0,
    staleTime: 30_000,
  });
}
