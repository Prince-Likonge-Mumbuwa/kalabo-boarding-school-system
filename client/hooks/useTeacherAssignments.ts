// @/hooks/useTeacherAssignments.ts
//
// Per-teacher assignments for admin views such as the Teacher Management
// right panel.
//
// Two sources are combined:
//   - teacher_assignments rows: tenure history (what the teacher holds)
//   - class_slots: who OPERATES each slot right now (covers / TP)
//
// Under the slot model the Primary Owner is never "suspended". A covered
// owner keeps an active row; the slot says a delegate is operating. The
// helpers below expose that as `canOperate`, `isCovered`, `coveredBy...`.

import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, DocumentData } from 'firebase/firestore';
import { mapAssignmentDoc, normalizeSubjectName } from '@/services/schoolService';
import * as engine from '@/services/assignmentEngine';
import type {
  TeacherAssignment,
  AssignmentRoleType,
  AssignmentStatus,
} from '@/types/school';

// ==================== TYPES ====================

export interface SubjectDetail {
  assignmentId: string;
  subject: string;
  normalizedSubjectId: string;

  roleType: AssignmentRoleType;
  status: AssignmentStatus;

  startDate: Date | null;
  endDate: Date | null;

  coversTeacherId: string | null;
  isFormTeacher: boolean;

  // ── NEW: slot model ────────────────────────────────────────────
  slotId: string | null;
  relation: 'owner' | 'delegate';
  /** Does this teacher hold operational authority on the slot right now? */
  canOperate: boolean;
  delegationState: engine.DelegationState;
  /** Owner whose slot is covered (live or pending) by someone else. */
  isCovered: boolean;
  coveredByTeacherName: string | null;
  coveredByRole: engine.DelegateRole | null;
  coveredUntil: Date | null;
  /** For delegates: the Primary Owner's name. */
  ownerTeacherName: string | null;
}

export interface TeacherClassWithSubjects {
  classId: string;
  className: string;
  isFormTeacher: boolean;

  /** Every current subject the teacher holds in this class. */
  subjectDetails: SubjectDetail[];

  /** Convenience arrays — same data, flatter shape. */
  subjects: string[];
  subjectIds: string[];
}

/**
 * An owned slot that is currently covered (or has a cover scheduled).
 * `substantive` is the owner row and stays ACTIVE — ownership is preserved.
 */
export interface CoveredSlotInfo {
  substantive: TeacherAssignment;
  cover: TeacherAssignment | null;
  delegationState: engine.DelegationState;
}

export interface UseTeacherAssignmentsOptions {
  /**
   * true (default): only current rows — not ended, and not covers past their
   * end date. false: full history.
   */
  activeOnly?: boolean;
}

// ==================== HELPERS ====================

const toNormalized = (subject: string) =>
  subject === 'Form Teacher' ? 'form-teacher' : normalizeSubjectName(subject);

const isDelegateRole = (r: string | undefined | null) => r === 'tp' || r === 'leave-cover';

/** Build a TeacherAssignment-shaped object for a slot's delegate. */
const delegateFromSlot = (slot: engine.ClassSlot): TeacherAssignment =>
  ({
    id: slot.delegateAssignmentId || `${slot.id}#delegate`,
    teacherId: slot.delegateTeacherId || '',
    teacherName: slot.delegateTeacherName || '',
    classId: slot.classId,
    className: slot.className,
    subject: slot.subject,
    normalizedSubjectId: slot.normalizedSubject,
    isFormTeacher: false,
    roleType: (slot.delegateRole || 'leave-cover') as AssignmentRoleType,
    status: 'active' as AssignmentStatus,
    startDate: slot.delegateStart ?? undefined,
    endDate: slot.delegateEnd,
    coversTeacherId: slot.ownerTeacherId,
    coversAssignmentId: slot.ownerAssignmentId,
    endReason: null,
  }) as unknown as TeacherAssignment;

// ==================== HOOK ====================

export const useTeacherAssignments = (
  teacherId?: string,
  options: UseTeacherAssignmentsOptions = {}
) => {
  const { activeOnly = true } = options;

  const assignmentsQuery = useQuery({
    // Prefix 'teacher_assignments' so every assignment mutation invalidates this.
    queryKey: ['teacher_assignments', teacherId, activeOnly],
    enabled: !!teacherId,
    queryFn: async (): Promise<{ rows: TeacherAssignment[]; slots: engine.ClassSlot[] }> => {
      if (!teacherId) return { rows: [], slots: [] };

      const [snapshot, slotRows] = await Promise.all([
        getDocs(query(collection(db, 'teacher_assignments'), where('teacherId', '==', teacherId))),
        engine.getSlotsForTeacher(teacherId).catch(err => {
          console.warn('Slots unavailable (engine not migrated yet?):', err);
          return [] as Array<{ slot: engine.ClassSlot; relation: 'owner' | 'delegate' }>;
        }),
      ]);

      const now = new Date();
      let rows = snapshot.docs.map(d => mapAssignmentDoc(d.id, d.data() as DocumentData));

      if (activeOnly) {
        rows = rows.filter(a => {
          if (a.status === 'ended') return false;
          // Expired-but-not-yet-closed covers are no longer current.
          if (isDelegateRole(a.roleType) && a.endDate && a.endDate < now) return false;
          return true;
        });
      }

      // De-duplicate slots (a teacher can't be owner and delegate of one slot,
      // but be defensive).
      const slots = Array.from(new Map(slotRows.map(r => [r.slot.id, r.slot])).values());
      return { rows, slots };
    },
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    retry: 2,
    refetchOnWindowFocus: true,
    // Covers start/expire by date — re-evaluate every minute.
    refetchInterval: 60 * 1000,
  });

  const rows = assignmentsQuery.data?.rows ?? [];
  const slots = assignmentsQuery.data?.slots ?? [];

  // ── Slot lookup ──────────────────────────────────────────────────

  const getSlot = (classId: string, subject: string): engine.ClassSlot | null => {
    const n = toNormalized(subject);
    return slots.find(s => s.classId === classId && s.normalizedSubject === n) ?? null;
  };

  /** Live authority for a slot (who operates it right now). */
  const getAuthority = (classId: string, subject: string): engine.SlotAuthority =>
    engine.resolveAuthority(getSlot(classId, subject));

  /** Can THIS teacher operate the slot right now? */
  const canOperate = (classId: string, subject: string): boolean =>
    !!teacherId && getAuthority(classId, subject).operatorTeacherId === teacherId;

  // ── Per-class helpers ────────────────────────────────────────────

  const getAssignmentsForClass = (classId: string): TeacherAssignment[] =>
    rows.filter(a => a.classId === classId);

  const getSubjectsForClass = (classId: string): string[] =>
    getAssignmentsForClass(classId).map(a => a.normalizedSubjectId);

  const getRawSubjectsForClass = (classId: string): string[] =>
    getAssignmentsForClass(classId).map(a => a.subject);

  const getSubjectAssignmentsForClass = (
    classId: string
  ): Array<{ raw: string; normalized: string; assignmentId: string }> =>
    getAssignmentsForClass(classId).map(a => ({
      raw: a.subject,
      normalized: a.normalizedSubjectId,
      assignmentId: a.id,
    }));

  /** Form Teacher = Primary Owner of the class's Form Teacher slot. */
  const isFormTeacherForClass = (classId: string): boolean => {
    const slot = slots.find(s => s.classId === classId && s.isFormTeacherSlot);
    if (slot) return slot.ownerTeacherId === teacherId;
    // Legacy fallback (before migration)
    return rows.some(
      a =>
        a.classId === classId &&
        a.isFormTeacher &&
        a.subject === 'Form Teacher' &&
        a.roleType === 'substantive' &&
        a.status !== 'ended'
    );
  };

  const getAssignedClasses = (): string[] => [...new Set(rows.map(a => a.classId))];

  const getActiveForClass = (classId: string): TeacherAssignment[] => getAssignmentsForClass(classId);

  // ── Per-slot helpers ─────────────────────────────────────────────

  /** This teacher's current rows on a slot. */
  const getActiveForSlot = (classId: string, subject: string): TeacherAssignment[] => {
    const n = toNormalized(subject);
    return rows.filter(a => a.classId === classId && a.normalizedSubjectId === n);
  };

  /**
   * The row through which this teacher relates to the slot. Prefers the row
   * that currently has authority, else the owner row.
   */
  const getEffectiveForSlot = (classId: string, subject: string): TeacherAssignment | null => {
    const mine = getActiveForSlot(classId, subject);
    if (mine.length === 0) return null;

    const slot = getSlot(classId, subject);
    if (slot) {
      const auth = engine.resolveAuthority(slot);
      if (auth.operatorTeacherId === teacherId) {
        const opId = auth.operatorRole === 'owner' ? slot.ownerAssignmentId : slot.delegateAssignmentId;
        const opRow = mine.find(r => r.id === opId);
        if (opRow) return opRow;
      }
    }
    return mine.find(r => r.roleType === 'substantive') ?? mine[0];
  };

  /**
   * For a slot this teacher OWNS: the cover (live or scheduled), if any.
   * The owner row is returned unchanged — ownership is never suspended.
   */
  const getCoveredSlot = (classId: string, subject: string): CoveredSlotInfo | null => {
    const slot = getSlot(classId, subject);
    if (!slot || slot.ownerTeacherId !== teacherId) return null;

    const state = engine.delegationState(slot);
    if (state !== 'live' && state !== 'pending') return null;

    const ownerRow =
      rows.find(r => r.id === slot.ownerAssignmentId) ??
      getActiveForSlot(classId, subject).find(r => r.roleType === 'substantive');
    if (!ownerRow) return null;

    return { substantive: ownerRow, cover: delegateFromSlot(slot), delegationState: state };
  };

  // ── Aggregated view ──────────────────────────────────────────────

  /** Group by class with role, time window and live authority per subject. */
  const getClassesWithSubjectDetails = (): TeacherClassWithSubjects[] => {
    const classMap = new Map<string, TeacherClassWithSubjects>();
    const now = new Date();

    for (const a of rows) {
      if (a.status === 'ended') continue;

      let entry = classMap.get(a.classId);
      if (!entry) {
        entry = {
          classId: a.classId,
          className: a.className,
          isFormTeacher: false,
          subjectDetails: [],
          subjects: [],
          subjectIds: [],
        };
        classMap.set(a.classId, entry);
      }

      const isDelegate = isDelegateRole(a.roleType);
      const slot = getSlot(a.classId, a.subject);
      const auth = engine.resolveAuthority(slot, now);
      const state = auth.delegationState;
      const coveredForOwner =
        !isDelegate && !!slot && slot.ownerTeacherId === teacherId && (state === 'live' || state === 'pending');

      const isFT = !isDelegate && a.isFormTeacher && a.normalizedSubjectId === 'form-teacher';

      entry.subjectDetails.push({
        assignmentId: a.id,
        subject: a.subject,
        normalizedSubjectId: a.normalizedSubjectId,
        roleType: a.roleType,
        status: a.status,
        startDate: a.startDate ?? null,
        endDate: a.endDate ?? null,
        coversTeacherId: a.coversTeacherId ?? null,
        isFormTeacher: isFT,

        slotId: slot?.id ?? null,
        relation: isDelegate ? 'delegate' : 'owner',
        // Before migration (no slot), fall back to the row's own status.
        canOperate: slot ? auth.operatorTeacherId === teacherId : a.status === 'active',
        delegationState: state,
        isCovered: coveredForOwner,
        coveredByTeacherName: coveredForOwner ? slot!.delegateTeacherName : null,
        coveredByRole: coveredForOwner ? slot!.delegateRole : null,
        coveredUntil: coveredForOwner ? slot!.delegateEnd : null,
        ownerTeacherName: isDelegate ? slot?.ownerTeacherName ?? null : null,
      });

      entry.subjects.push(a.subject);
      entry.subjectIds.push(a.normalizedSubjectId);
      if (isFT) entry.isFormTeacher = true;
    }

    return Array.from(classMap.values()).map(entry => ({
      ...entry,
      subjects: [...new Set(entry.subjects)],
      subjectIds: [...new Set(entry.subjectIds)],
    }));
  };

  /** Legacy shape kept for existing consumers. */
  const getClassesWithSubjects = () =>
    getClassesWithSubjectDetails().map(c => ({
      classId: c.classId,
      className: c.className,
      subjects: c.subjects,
      subjectIds: c.subjectIds,
      isFormTeacher: c.isFormTeacher,
    }));

  // ── Return ───────────────────────────────────────────────────────

  return {
    assignments: rows,
    slots,

    isLoading: assignmentsQuery.isLoading,
    isFetching: assignmentsQuery.isFetching,
    isError: assignmentsQuery.isError,
    error: assignmentsQuery.error,
    isSuccess: assignmentsQuery.isSuccess,

    hasAssignments: rows.length > 0,
    totalAssignments: rows.length,

    // Per-class
    getAssignmentsForClass,
    getActiveForClass,
    getSubjectsForClass,
    getRawSubjectsForClass,
    getSubjectAssignmentsForClass,
    isFormTeacherForClass,
    getAssignedClasses,

    // Per-slot
    getSlot,
    getAuthority,
    canOperate,
    getEffectiveForSlot,
    getActiveForSlot,
    getCoveredSlot,

    // Aggregated
    getClassesWithSubjectDetails,
    getClassesWithSubjects,

    refetch: assignmentsQuery.refetch,
  };
};