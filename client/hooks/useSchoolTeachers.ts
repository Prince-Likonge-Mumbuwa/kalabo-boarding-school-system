// @/hooks/useSchoolTeachers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { teacherService } from '@/services/schoolService';
import { normalizeSubjectName } from '@/services/resultsService';
import * as engine from '@/services/assignmentEngine';
import {
  Teacher,
  TeacherStatusUpdate,
  AssignmentRoleType,
  AssignmentEndReason,
} from '@/types/school';

// Re-exported for backward compatibility with existing call sites.
import { useTeacherAssignments } from '@/hooks/useTeacherAssignments';

const FORM_TEACHER = 'Form Teacher';

// ==================== CENTRALIZED INVALIDATION ====================

/**
 * Invalidate every cache that depends on teacher ↔ class ↔ subject state.
 *
 * Broad on purpose: a single assignment change can affect the replaced
 * owner, an ended cover, both classes in a transfer, and every teacher's
 * dashboard. Prefix matching makes this cheap — only mounted queries refetch.
 */
function invalidateAssignmentCaches(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['teachers'] });
  queryClient.invalidateQueries({ queryKey: ['classes'] });
  queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
  queryClient.invalidateQueries({ queryKey: ['teacher_assignments'] }); // per-teacher + per-class
  queryClient.invalidateQueries({ queryKey: ['class_slots'] });
  queryClient.invalidateQueries({ queryKey: ['teacher_classes'] }); // teacher dashboards
}

const isDelegateRole = (r?: string | null) => r === 'tp' || r === 'leave-cover';

// ==================== HOOK ====================

export const useSchoolTeachers = (classId?: string) => {
  const queryClient = useQueryClient();
  const onChanged = () => invalidateAssignmentCaches(queryClient);

  // ── Queries ─────────────────────────────────────────────────────

  const teachersQuery = useQuery({
    queryKey: ['teachers'],
    queryFn: teacherService.getTeachers,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const classTeachersQuery = useQuery({
    queryKey: ['teachers', 'class', classId],
    queryFn: () => teacherService.getTeachersByClass(classId!),
    enabled: !!classId,
    staleTime: 30 * 1000,
  });

  const classAssignmentsQuery = useQuery({
    queryKey: ['teacher_assignments', 'class', classId],
    queryFn: () => teacherService.getTeacherAssignmentsByClass(classId!),
    enabled: !!classId,
    staleTime: 30 * 1000,
  });

  /** NEW: the class's slots with live authority (who operates each subject now). */
  const classSlotsQuery = useQuery({
    queryKey: ['class_slots', 'class', classId],
    enabled: !!classId,
    queryFn: async () => {
      const slots = await engine.getSlotsForClass(classId!);
      const now = new Date();
      return slots.map(slot => ({ slot, authority: engine.resolveAuthority(slot, now) }));
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  // ── Assign: single subject ──────────────────────────────────────
  //
  // substantive → Primary Owner (replaces the previous owner automatically).
  // tp / leave-cover → delegate; startDate AND endDate are required.
  // Form Teacher is assigned with subject "Form Teacher".
  const assignTeacherMutation = useMutation({
    mutationFn: async ({
      teacherId,
      classId,
      subject,
      isFormTeacher = false,
      roleType = 'substantive',
      startDate,
      endDate,
      coversTeacherId,
    }: {
      teacherId: string;
      classId: string;
      subject?: string;
      isFormTeacher?: boolean;
      roleType?: AssignmentRoleType;
      startDate?: Date;
      endDate?: Date | null;
      coversTeacherId?: string | null;
    }) => {
      const subjectToUse = subject?.trim() || (isFormTeacher ? FORM_TEACHER : '');
      if (!subjectToUse) {
        throw new Error('Subject is required when assigning a teacher to a class');
      }
      if (isDelegateRole(roleType) && (!startDate || !endDate)) {
        throw new Error('Covering and TP assignments need both a start and an end date.');
      }
      return teacherService.assignTeacherToClass(
        teacherId,
        classId,
        subjectToUse,
        subjectToUse === FORM_TEACHER,
        { roleType, startDate, endDate, coversTeacherId }
      );
    },
    onSuccess: onChanged,
  });

  // ── Assign: several subjects (+ optional Form Teacher) ──────────
  //
  // Subjects and the Form Teacher role are separate slots. `isFormTeacher`
  // assigns the "Form Teacher" slot IN ADDITION to the subjects; it is never
  // stamped onto subject rows.
  //
  // Runs sequentially so a failure stops early with a clear message. The
  // engine's transactions guarantee uniqueness either way.
  const assignTeacherWithMultipleSubjectsMutation = useMutation({
    mutationFn: async ({
      teacherId,
      classId,
      subjects,
      isFormTeacher = false,
      roleType = 'substantive',
      startDate,
      endDate,
      coversTeacherId,
    }: {
      teacherId: string;
      classId: string;
      subjects: string[];
      isFormTeacher?: boolean;
      roleType?: AssignmentRoleType;
      startDate?: Date;
      endDate?: Date | null;
      coversTeacherId?: string | null;
    }) => {
      if (isDelegateRole(roleType) && (!startDate || !endDate)) {
        throw new Error('Covering and TP assignments need both a start and an end date.');
      }

      const list = Array.from(
        new Set(subjects.map(s => s.trim()).filter(s => s && s !== FORM_TEACHER))
      );
      if (isFormTeacher) list.push(FORM_TEACHER);

      const done: string[] = [];
      for (const subject of list) {
        try {
          await teacherService.assignTeacherToClass(
            teacherId,
            classId,
            subject,
            subject === FORM_TEACHER,
            { roleType, startDate, endDate, coversTeacherId }
          );
          done.push(subject);
        } catch (err: any) {
          const prefix = done.length ? `Assigned ${done.join(', ')}; ` : '';
          throw new Error(`${prefix}failed on ${subject}: ${err?.message || err}`);
        }
      }
      return done;
    },
    // Invalidate even on failure: earlier subjects may already be assigned.
    onSettled: onChanged,
  });

  // ── End an assignment ───────────────────────────────────────────
  //
  // Delegate row → delegation ends; the Primary Owner operates again at once.
  // Owner row    → owner leaves the slot (a running cover continues).
  const endAssignmentMutation = useMutation({
    mutationFn: async ({
      assignmentId,
      reason = 'removed',
    }: {
      assignmentId: string;
      reason?: AssignmentEndReason;
    }) => teacherService.endAssignment(assignmentId, reason),
    onSuccess: onChanged,
  });

  // ── Tidy expired covers / TP in the log ─────────────────────────
  //
  // Authority already reverted at the end date; this only closes records.
  const reactivateExpiredCoversMutation = useMutation({
    mutationFn: async () => teacherService.reactivateExpiredCovers(),
    onSuccess: count => {
      if (count && count > 0) onChanged();
    },
  });

  // ── Resolve overlapping assignments on a slot ───────────────────
  const resolveSlotConflictMutation = useMutation({
    mutationFn: async ({
      classId,
      normalizedSubject,
      keepAssignmentId,
    }: {
      classId: string;
      normalizedSubject: string;
      keepAssignmentId: string;
    }) => teacherService.resolveSlotConflict(classId, normalizedSubject, keepAssignmentId),
    onSettled: onChanged,
  });

  // ── Teacher records ─────────────────────────────────────────────

  const updateTeacherMutation = useMutation({
    mutationFn: ({ teacherId, updates }: { teacherId: string; updates: Partial<Teacher> }) =>
      teacherService.updateTeacher(teacherId, updates),
    onSuccess: onChanged,
  });

  const deleteTeacherMutation = useMutation({
    mutationFn: async (teacherId: string) => teacherService.deleteTeacher(teacherId),
    onSuccess: onChanged,
  });

  const removeTeacherSubjectMutation = useMutation({
    mutationFn: ({ teacherId, classId, subject }: { teacherId: string; classId: string; subject: string }) =>
      teacherService.removeTeacherSubject(teacherId, classId, subject),
    onSuccess: onChanged,
  });

  /** Atomic transfer. Returns a report of what moved, what was replaced, etc. */
  const transferTeacherMutation = useMutation({
    mutationFn: ({
      teacherId,
      fromClassId,
      toClassId,
      subjectMapping,
    }: {
      teacherId: string;
      fromClassId: string;
      toClassId: string;
      subjectMapping?: Record<string, string>;
    }) => teacherService.transferTeacher(teacherId, fromClassId, toClassId, subjectMapping),
    onSuccess: onChanged,
  });

  const removeTeacherMutation = useMutation({
    mutationFn: async ({ teacherId, classId }: { teacherId: string; classId: string }) =>
      teacherService.removeTeacherFromClass(teacherId, classId),
    onSuccess: onChanged,
  });

  /**
   * on_leave: status only — ownership is kept; assign covers next.
   * on_leave → active: "Return to Duty" — leave covers end, TP continues.
   */
  const updateTeacherStatusMutation = useMutation({
    mutationFn: async ({ teacherId, status }: TeacherStatusUpdate) =>
      teacherService.updateTeacherStatus(teacherId, status),
    onSuccess: onChanged,
  });

  // ── NEW: leave / cover / TP controls ────────────────────────────

  /** Marks the teacher on leave; returns their slots that still need cover. */
  const setOnLeaveMutation = useMutation({
    mutationFn: (teacherId: string) => engine.setTeacherOnLeave(teacherId),
    onSuccess: onChanged,
  });

  /** "Return to Duty" switch. */
  const returnToDutyMutation = useMutation({
    mutationFn: (teacherId: string) => engine.returnTeacherToDuty(teacherId),
    onSuccess: onChanged,
  });

  /** End TP early and hand the slot back to the Primary Owner. */
  const handBackTpMutation = useMutation({
    mutationFn: (slotId: string) => engine.handBackTp(slotId),
    onSuccess: onChanged,
  });

  /** End whatever delegation is on a slot (cover or TP). */
  const endDelegationMutation = useMutation({
    mutationFn: ({
      slotId,
      reason = 'returned-to-duty',
      expectedAssignmentId,
    }: {
      slotId: string;
      reason?: engine.EngineEndReason;
      expectedAssignmentId?: string;
    }) => engine.endDelegation(slotId, reason, { expectedAssignmentId }),
    onSuccess: onChanged,
  });

  // ── Helpers ─────────────────────────────────────────────────────

  const getAvailableTeachers = (): Teacher[] =>
    (teachersQuery.data || []).filter(t => t.status === 'active' || !t.status);

  /** Current (non-ended, non-expired) rows for a teacher in the class. */
  const currentRows = (teacherId: string, cId: string) => {
    const now = new Date();
    return (classAssignmentsQuery.data || []).filter(
      a =>
        a.teacherId === teacherId &&
        a.classId === cId &&
        a.status !== 'ended' &&
        !(isDelegateRole(a.roleType) && a.endDate && a.endDate < now)
    );
  };

  /** Normalized subject IDs the teacher currently holds in the class (owner or delegate). */
  const getTeacherSubjectsForClass = (teacherId: string, cId: string): string[] =>
    currentRows(teacherId, cId).map(a => a.normalizedSubjectId || normalizeSubjectName(a.subject));

  const isTeacherAssignedToClass = (teacherId: string, cId: string): boolean =>
    currentRows(teacherId, cId).length > 0;

  /** Who operates a subject in the loaded class right now (needs `classId`). */
  const getOperatorForSubject = (subject: string) => {
    const n = subject === FORM_TEACHER ? 'form-teacher' : normalizeSubjectName(subject);
    return classSlotsQuery.data?.find(x => x.slot.normalizedSubject === n)?.authority ?? null;
  };

  return {
    // ── Data ────────────────────────────────────────────────────────
    allTeachers: teachersQuery.data || [],
    classTeachers: classTeachersQuery.data || [],
    teacherAssignments: classAssignmentsQuery.data || [],
    classSlots: classSlotsQuery.data || [],
    availableTeachers: getAvailableTeachers(),

    // ── Query states ────────────────────────────────────────────────
    isLoading: teachersQuery.isLoading,
    isFetching: teachersQuery.isFetching,
    isLoadingClassTeachers: classTeachersQuery.isLoading,
    isLoadingAssignments: classAssignmentsQuery.isLoading,
    isLoadingClassSlots: classSlotsQuery.isLoading,
    isError: teachersQuery.isError || classTeachersQuery.isError || classAssignmentsQuery.isError,
    error: teachersQuery.error || classTeachersQuery.error || classAssignmentsQuery.error,

    // ── Mutation states ─────────────────────────────────────────────
    isAssigningTeacher:
      assignTeacherMutation.isPending || assignTeacherWithMultipleSubjectsMutation.isPending,
    isRemovingTeacher: removeTeacherMutation.isPending,
    isRemovingSubject: removeTeacherSubjectMutation.isPending,
    isUpdatingTeacherStatus:
      updateTeacherStatusMutation.isPending || setOnLeaveMutation.isPending || returnToDutyMutation.isPending,
    isUpdatingTeacher: updateTeacherMutation.isPending,
    isDeletingTeacher: deleteTeacherMutation.isPending,
    isTransferringTeacher: transferTeacherMutation.isPending,
    isEndingAssignment:
      endAssignmentMutation.isPending || endDelegationMutation.isPending || handBackTpMutation.isPending,
    isReactivatingCovers: reactivateExpiredCoversMutation.isPending,
    isResolvingSlotConflict: resolveSlotConflictMutation.isPending,

    // ── Mutations ───────────────────────────────────────────────────
    assignTeacherToClass: assignTeacherMutation.mutateAsync,
    assignTeacherWithMultipleSubjects: assignTeacherWithMultipleSubjectsMutation.mutateAsync,
    removeTeacherFromClass: removeTeacherMutation.mutateAsync,
    removeTeacherSubject: removeTeacherSubjectMutation.mutateAsync,
    updateTeacherStatus: updateTeacherStatusMutation.mutateAsync,
    updateTeacher: updateTeacherMutation.mutateAsync,
    deleteTeacher: deleteTeacherMutation.mutateAsync,
    transferTeacher: transferTeacherMutation.mutateAsync,
    endAssignment: endAssignmentMutation.mutateAsync,
    reactivateExpiredCovers: reactivateExpiredCoversMutation.mutateAsync,
    resolveSlotConflict: resolveSlotConflictMutation.mutateAsync,

    // NEW
    setTeacherOnLeave: setOnLeaveMutation.mutateAsync,
    returnTeacherToDuty: returnToDutyMutation.mutateAsync,
    handBackTp: handBackTpMutation.mutateAsync,
    endDelegation: endDelegationMutation.mutateAsync,
    /** Overlaps report (same-kind duplicates only) — use for the Overlaps modal. */
    findSlotOverlaps: teacherService.findSlotOverlaps,
    getUncoveredSlots: engine.getUncoveredSlots,

    // ── Re-export ───────────────────────────────────────────────────
    useTeacherAssignments,

    // ── Helpers ─────────────────────────────────────────────────────
    getTeacherSubjectsForClass,
    isTeacherAssignedToClass,
    getOperatorForSubject,

    // ── Refetch ─────────────────────────────────────────────────────
    refetchTeachers: teachersQuery.refetch,
    refetchClassTeachers: classTeachersQuery.refetch,
    refetchAssignments: classAssignmentsQuery.refetch,
    refetchClassSlots: classSlotsQuery.refetch,
  };
};