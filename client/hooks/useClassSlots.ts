// @/hooks/useClassSlots.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import * as engine from '@/services/assignmentEngine';

/** Re-evaluate authority every minute so an expiring cover flips back on screen. */
const AUTHORITY_TICK_MS = 60 * 1000;

export function invalidateAllAssignmentViews(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['class_slots'] });
  qc.invalidateQueries({ queryKey: ['teacher_assignments'] });
  qc.invalidateQueries({ queryKey: ['teachers'] });
  qc.invalidateQueries({ queryKey: ['classes'] });
  qc.invalidateQueries({ queryKey: ['teacher_classes'] });
  qc.invalidateQueries({ queryKey: ['dashboardStats'] });
}

/** All slots of a class, each with who operates it right now. */
export function useClassSlots(classId?: string) {
  return useQuery({
    queryKey: ['class_slots', 'class', classId],
    enabled: !!classId,
    queryFn: async () => {
      const slots = await engine.getSlotsForClass(classId!);
      const now = new Date();
      return slots
        .map(slot => ({ slot, authority: engine.resolveAuthority(slot, now) }))
        .sort((a, b) =>
          a.slot.isFormTeacherSlot ? -1 : b.slot.isFormTeacherSlot ? 1 : a.slot.subject.localeCompare(b.slot.subject)
        );
    },
    staleTime: 30 * 1000,
    refetchInterval: AUTHORITY_TICK_MS,
  });
}

/**
 * Teacher dashboard: every slot the teacher is attached to, with `canOperate`.
 * Owners see covered slots as read-only; delegates see their placements.
 * Gate grade / attendance / coursework UI on `canOperate`.
 */
export function useMyOperationalSlots(teacherId?: string) {
  return useQuery({
    queryKey: ['class_slots', 'teacher', teacherId],
    enabled: !!teacherId,
    queryFn: () => engine.getOperationalViewForTeacher(teacherId!),
    staleTime: 30 * 1000,
    refetchInterval: AUTHORITY_TICK_MS,
  });
}

/** Admin: owners on leave with no live or pending cover. */
export function useUncoveredSlots(enabled = true) {
  return useQuery({
    queryKey: ['class_slots', 'uncovered'],
    enabled,
    queryFn: () => engine.getUncoveredSlots(),
    staleTime: 60 * 1000,
  });
}

/** All engine mutations, with consistent cache invalidation. */
export function useAssignmentEngine() {
  const qc = useQueryClient();
  const onSuccess = () => invalidateAllAssignmentViews(qc);

  const assignOwner = useMutation({ mutationFn: engine.assignOwner, onSuccess });
  const assignDelegate = useMutation({ mutationFn: engine.assignDelegate, onSuccess });

  const endDelegation = useMutation({
    mutationFn: (v: { slotId: string; reason: engine.EngineEndReason; expectedAssignmentId?: string }) =>
      engine.endDelegation(v.slotId, v.reason, { expectedAssignmentId: v.expectedAssignmentId }),
    onSuccess,
  });

  const handBackTp = useMutation({ mutationFn: (slotId: string) => engine.handBackTp(slotId), onSuccess });
  const setOnLeave = useMutation({ mutationFn: (teacherId: string) => engine.setTeacherOnLeave(teacherId), onSuccess });
  const returnToDuty = useMutation({ mutationFn: (teacherId: string) => engine.returnTeacherToDuty(teacherId), onSuccess });
  const transfer = useMutation({ mutationFn: engine.transferTeacher, onSuccess });

  const removeFromClass = useMutation({
    mutationFn: (v: { teacherId: string; classId: string }) => engine.removeTeacherFromClass(v.teacherId, v.classId),
    onSuccess,
  });

  const closeExpired = useMutation({
    mutationFn: () => engine.closeExpiredDelegations(),
    onSuccess: n => {
      if (n > 0) invalidateAllAssignmentViews(qc);
    },
  });

  return {
    assignOwner: assignOwner.mutateAsync,
    assignDelegate: assignDelegate.mutateAsync,
    endDelegation: endDelegation.mutateAsync,
    handBackTp: handBackTp.mutateAsync,
    setOnLeave: setOnLeave.mutateAsync,
    returnToDuty: returnToDuty.mutateAsync,
    transfer: transfer.mutateAsync,
    removeFromClass: removeFromClass.mutateAsync,
    closeExpired: closeExpired.mutateAsync,

    isBusy:
      assignOwner.isPending ||
      assignDelegate.isPending ||
      endDelegation.isPending ||
      handBackTp.isPending ||
      setOnLeave.isPending ||
      returnToDuty.isPending ||
      transfer.isPending ||
      removeFromClass.isPending,
  };
}