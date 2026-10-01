// @/hooks/useTeacherClasses.ts
//
// Teacher dashboard: the classes and subjects the signed-in teacher is attached to.
//
// Source of truth is `class_slots` (via assignmentEngine). For each subject
// it reports both the RELATION (Primary Owner or Covering/TP delegate) and
// whether the teacher can OPERATE it right now (enter grades, mark
// attendance, create coursework):
//
//   - Owner, no live cover         → canOperate = true
//   - Owner, cover/TP is live      → canOperate = false (read-only, "Covered by X until Y")
//   - Delegate, inside date window → canOperate = true
//   - Delegate, before start date  → canOperate = false (pending)
//
// Authority flips at the cover's end date without any admin action, so the
// query re-evaluates every minute.
//
// Before migrateToSlots() has run, it falls back to the legacy row-based logic.

import { useQuery } from '@tanstack/react-query';
import { collection, query, where, getDocs, DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './useAuth';
import { toDate, normalizeSubjectName } from '@/services/schoolService';
import * as engine from '@/services/assignmentEngine';
import type {
  AssignmentRoleType,
  AssignmentStatus,
  AssignmentEndReason,
} from '@/types/school';

// ==================== RETURN TYPES ====================

export interface TeacherClassSubject {
  subject: string;
  normalizedSubjectId: string;

  roleType: AssignmentRoleType;
  status: AssignmentStatus;

  startDate: Date | null;
  endDate: Date | null;

  /** For delegates: the Primary Owner they are covering. */
  coversTeacherId: string | null;
  coversTeacherName: string | null;

  /** True only for the Primary Owner of the Form Teacher slot. */
  isFormTeacher: boolean;
  endReason: AssignmentEndReason;

  assignmentId: string;

  // ── NEW: slot model ────────────────────────────────────────────
  slotId: string | null;
  /** 'owner' = Primary Owner; 'delegate' = covering / TP teacher. */
  relation: 'owner' | 'delegate';
  /** Can this teacher enter grades / attendance / coursework right now? */
  canOperate: boolean;
  delegationState: engine.DelegationState;

  /** For owners: who is covering them (live or pending), and when. */
  coveredByTeacherId: string | null;
  coveredByTeacherName: string | null;
  coveredByRole: engine.DelegateRole | null;
  coveredFrom: Date | null;
  coveredUntil: Date | null;
}

export interface TeacherClass {
  classId: string;
  className: string;

  /** True if the teacher is the (Primary Owner) Form Teacher of this class. */
  isFormTeacher: boolean;

  subjects: TeacherClassSubject[];

  /** Earliest start date across subjects. */
  firstStartedAt: Date | null;

  /** True if the teacher can operate at least one subject in this class right now. */
  hasActiveSubjects: boolean;

  /** True if any subject here is held as a cover or TP delegate. */
  hasCoverRole: boolean;

  /** True if the teacher can't operate ANY subject here (fully covered or pending). */
  isFullySuspended: boolean;

  /** NEW: true if any of the teacher's owned subjects here is covered (live or pending). */
  isCovered: boolean;
}

// ==================== SLOT-BASED (primary path) ====================

function fromSlots(
  view: Awaited<ReturnType<typeof engine.getOperationalViewForTeacher>>
): TeacherClass[] {
  const byClass = new Map<string, TeacherClass>();

  for (const { slot, relation, authority, canOperate } of view) {
    const isOwner = relation === 'owner';
    const state = authority.delegationState;
    const coverVisible = isOwner && (state === 'live' || state === 'pending');

    const entry: TeacherClassSubject = {
      subject: slot.subject,
      normalizedSubjectId: slot.normalizedSubject,

      roleType: (isOwner ? 'substantive' : slot.delegateRole || 'leave-cover') as AssignmentRoleType,
      status: 'active' as AssignmentStatus,

      startDate: isOwner ? slot.ownerSince : slot.delegateStart,
      endDate: isOwner ? null : slot.delegateEnd,

      coversTeacherId: isOwner ? null : slot.ownerTeacherId,
      coversTeacherName: isOwner ? null : slot.ownerTeacherName,

      isFormTeacher: isOwner && slot.isFormTeacherSlot,
      endReason: null as AssignmentEndReason,

      assignmentId: (isOwner ? slot.ownerAssignmentId : slot.delegateAssignmentId) || slot.id,

      slotId: slot.id,
      relation,
      canOperate,
      delegationState: state,

      coveredByTeacherId: coverVisible ? slot.delegateTeacherId : null,
      coveredByTeacherName: coverVisible ? slot.delegateTeacherName : null,
      coveredByRole: coverVisible ? slot.delegateRole : null,
      coveredFrom: coverVisible ? slot.delegateStart : null,
      coveredUntil: coverVisible ? slot.delegateEnd : null,
    };

    addToClass(byClass, slot.classId, slot.className, entry);
  }

  return finalize(byClass);
}

// ==================== LEGACY ROWS (before migration) ====================

async function fromLegacyRows(uid: string): Promise<TeacherClass[]> {
  const snapshot = await getDocs(
    query(
      collection(db, 'teacher_assignments'),
      where('teacherId', '==', uid),
      where('status', 'in', ['active', 'suspended'])
    )
  );

  const byClass = new Map<string, TeacherClass>();
  const now = new Date();

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data() as DocumentData;
    if (!data.classId) continue;

    const subject = data.subject || '';
    const roleType = ((data.roleType as AssignmentRoleType) || 'substantive') as AssignmentRoleType;
    const isDelegate = roleType === 'tp' || roleType === 'leave-cover';
    const status = ((data.status as AssignmentStatus) || 'active') as AssignmentStatus;
    const endDate = toDate(data.endDate) ?? null;

    // Skip covers that have passed their end date but haven't been closed yet.
    if (isDelegate && endDate && endDate < now) continue;

    addToClass(byClass, data.classId, data.className || 'Unknown Class', {
      subject,
      normalizedSubjectId:
        data.normalizedSubject ||
        (subject === 'Form Teacher' ? 'form-teacher' : normalizeSubjectName(subject)),
      roleType,
      status,
      startDate: toDate(data.startDate) || toDate(data.assignedAt) || null,
      endDate,
      coversTeacherId: data.coversTeacherId ?? null,
      coversTeacherName: data.coversTeacherName ?? null,
      isFormTeacher: data.isFormTeacher === true && subject === 'Form Teacher',
      endReason: (data.endReason as AssignmentEndReason) ?? null,
      assignmentId: docSnap.id,

      slotId: null,
      relation: isDelegate ? 'delegate' : 'owner',
      canOperate: status === 'active',
      delegationState: 'none',
      coveredByTeacherId: null,
      coveredByTeacherName: null,
      coveredByRole: null,
      coveredFrom: null,
      coveredUntil: null,
    });
  }

  return finalize(byClass);
}

// ==================== SHARED GROUPING ====================

function addToClass(
  byClass: Map<string, TeacherClass>,
  classId: string,
  className: string,
  subject: TeacherClassSubject
) {
  let entry = byClass.get(classId);
  if (!entry) {
    entry = {
      classId,
      className: className || 'Unknown Class',
      isFormTeacher: false,
      subjects: [],
      firstStartedAt: null,
      hasActiveSubjects: false,
      hasCoverRole: false,
      isFullySuspended: true,
      isCovered: false,
    };
    byClass.set(classId, entry);
  }

  entry.subjects.push(subject);

  if (subject.isFormTeacher) entry.isFormTeacher = true;
  if (subject.canOperate) {
    entry.hasActiveSubjects = true;
    entry.isFullySuspended = false;
  }
  if (subject.relation === 'delegate') entry.hasCoverRole = true;
  if (subject.coveredByTeacherId) entry.isCovered = true;
  if (subject.startDate && (!entry.firstStartedAt || subject.startDate < entry.firstStartedAt)) {
    entry.firstStartedAt = subject.startDate;
  }
}

function finalize(byClass: Map<string, TeacherClass>): TeacherClass[] {
  return Array.from(byClass.values())
    .map(c => ({
      ...c,
      // Form Teacher row first, then subjects alphabetically
      subjects: c.subjects.sort((a, b) =>
        a.normalizedSubjectId === 'form-teacher'
          ? -1
          : b.normalizedSubjectId === 'form-teacher'
          ? 1
          : a.subject.localeCompare(b.subject)
      ),
    }))
    .sort((a, b) => a.className.localeCompare(b.className));
}

// ==================== HOOK ====================

export const useTeacherClasses = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['teacher_classes', user?.uid],
    queryFn: async (): Promise<TeacherClass[]> => {
      if (!user?.uid) return [];

      if (await engine.isEngineReady()) {
        const view = await engine.getOperationalViewForTeacher(user.uid);
        return fromSlots(view);
      }
      return fromLegacyRows(user.uid);
    },
    enabled: !!user?.uid,
    staleTime: 60 * 1000,
    // Re-evaluate authority every minute so covers start/expire on screen.
    refetchInterval: 60 * 1000,
  });
};

/**
 * Convenience for grade / attendance screens:
 * can the signed-in teacher operate this class + subject right now?
 */
export const useCanOperate = (classId?: string, subject?: string) => {
  const { data, isLoading } = useTeacherClasses();
  if (!classId || !subject || !data) return { canOperate: false, isLoading, info: null };

  const normalized = subject === 'Form Teacher' ? 'form-teacher' : normalizeSubjectName(subject);
  const info =
    data
      .find(c => c.classId === classId)
      ?.subjects.find(s => s.normalizedSubjectId === normalized && s.canOperate) ??
    data
      .find(c => c.classId === classId)
      ?.subjects.find(s => s.normalizedSubjectId === normalized) ??
    null;

  return { canOperate: !!info?.canOperate, isLoading, info };
};