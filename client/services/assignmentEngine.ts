// @/services/assignmentEngine.ts
//
// ============================================================================
//  CLASS & TEACHER ASSIGNMENT ENGINE
// ============================================================================
//
//  DATA MODEL
//  ----------
//  class_slots/{classId}__{normalizedSubject}      ← ONE doc per (class, subject)
//      The single source of truth for "who is responsible right now".
//      The Form Teacher role is the slot `{classId}__form-teacher`.
//
//      ownerAssignmentId / ownerTeacherId / ownerTeacherName / ownerSince
//          → the PRIMARY OWNER. Changes only on replacement, removal or transfer.
//      delegateAssignmentId / delegateTeacherId / delegateTeacherName /
//      delegateRole ('leave-cover' | 'tp') / delegateStart / delegateEnd
//          → at most ONE covering / TP delegate. Never touches the owner fields.
//
//  teacher_assignments/{id}                        ← APPEND-ONLY HISTORY LOG
//      One row per tenure (owner or delegate). Rows are ended, never deleted.
//      status: 'active' | 'ended'      (legacy 'suspended' is migrated away)
//
//  assignment_events/{id}                          ← AUDIT TRAIL
//      Every mutation writes who / what / when.
//
//  RULES → MECHANISM
//  -----------------
//  1. Uniqueness: the slot doc id IS the uniqueness key. Every mutation runs in
//     a Firestore transaction on that doc, so two admins can't both win.
//  2. Auto-replacement: assigning an owner ends the previous owner's row
//     (endReason 'replaced') in the same transaction.
//     History (rows, results, attendance) is never deleted.
//  3/4. Delegation: covers and TP are delegate fields on the slot. Operational
//     authority is COMPUTED, not stored:
//        delegate is live (start ≤ now ≤ end)  → delegate operates
//        otherwise                              → owner operates
//     So handback at the end date is instant and needs no job and no
//     re-creation. "Return to Duty" / "End TP" end the delegation early.
//     closeExpiredDelegations() only tidies the log afterwards.
//
//  Membership arrays (classes.teachers, users.assignedClasses, form-teacher
//  pointers) are CACHES derived from slots, rebuilt by reconcile*().
// ============================================================================

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  runTransaction,
  writeBatch,
  updateDoc,
  serverTimestamp,
  Timestamp,
  arrayUnion,
  arrayRemove,
  DocumentData,
} from 'firebase/firestore';
import type { Transaction, DocumentReference, DocumentSnapshot } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '@/lib/firebase';
import { normalizeSubjectName } from './resultsService';

// ==================== CONSTANTS & TYPES ====================

export const FORM_TEACHER_SUBJECT = 'Form Teacher';
export const FORM_TEACHER_SLOT = 'form-teacher';

const SLOTS = 'class_slots';
const ASSIGNMENTS = 'teacher_assignments';
const EVENTS = 'assignment_events';
const META_REF = () => doc(db, 'system', 'assignmentEngine');

export type DelegateRole = 'leave-cover' | 'tp';
export type EngineRole = 'substantive' | DelegateRole;

export type EngineEndReason =
  | 'replaced'          // a new owner took the slot
  | 'removed'           // admin removed the teacher
  | 'transferred'       // teacher moved to another class
  | 'returned-to-duty'  // owner returned early; leave cover ended
  | 'tp-completed'      // TP placement handed back
  | 'expired'           // delegation reached its end date
  | 'owner-replaced'    // delegation ended because the owner changed
  | 'promoted-to-owner' // the delegate became the owner
  | 'cancelled'         // delegation withdrawn
  | 'handover';         // legacy

export type DelegationState = 'none' | 'pending' | 'live' | 'expired';

export interface ClassSlot {
  id: string;
  classId: string;
  className: string;
  subject: string;
  normalizedSubject: string;
  isFormTeacherSlot: boolean;

  ownerAssignmentId: string | null;
  ownerTeacherId: string | null;
  ownerTeacherName: string | null;
  ownerSince: Date | null;

  delegateAssignmentId: string | null;
  delegateTeacherId: string | null;
  delegateTeacherName: string | null;
  delegateRole: DelegateRole | null;
  delegateStart: Date | null;
  delegateEnd: Date | null;

  updatedAt: Date | null;
}

export interface SlotAuthority {
  slotId: string | null;
  /** Who may mark attendance / enter grades / create assignments right now. */
  operatorTeacherId: string | null;
  operatorTeacherName: string | null;
  operatorRole: 'owner' | DelegateRole | null;
  /** Primary Owner — unchanged by covers and TP. */
  ownerTeacherId: string | null;
  ownerTeacherName: string | null;
  delegationState: DelegationState;
  delegateUntil: Date | null;
}

export class AssignmentRuleError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'AssignmentRuleError';
  }
}

// ==================== SMALL HELPERS ====================

const toNormalized = (subject: string): string => {
  const s = subject.trim();
  return s === FORM_TEACHER_SUBJECT ? FORM_TEACHER_SLOT : normalizeSubjectName(s);
};

/** Firestore doc ids can't contain '/'. */
const safeKey = (s: string) => s.replace(/[\/#\[\]?]/g, '-');

export const slotIdForNormalized = (classId: string, normalizedSubject: string) =>
  `${classId}__${safeKey(normalizedSubject)}`;

export const slotIdFor = (classId: string, subject: string) =>
  slotIdForNormalized(classId, toNormalized(subject));

const tsToDate = (v: any): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  return null;
};

const ts = (d: Date) => Timestamp.fromDate(d);

const endOfDay = (d: Date): Date => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const fmt = (d: Date | null) =>
  d ? d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const displayName = (d: DocumentData | undefined) =>
  (d && (d.fullName || d.name)) || 'Unknown teacher';

const currentActor = (): string | null => {
  try {
    return getAuth().currentUser?.uid ?? null;
  } catch {
    return null;
  }
};

const ROLE_LABEL: Record<string, string> = {
  substantive: 'Primary Owner',
  'leave-cover': 'Covering Teacher',
  tp: 'TP Delegate',
};

const NO_DELEGATE = {
  delegateAssignmentId: null,
  delegateTeacherId: null,
  delegateTeacherName: null,
  delegateRole: null,
  delegateStart: null,
  delegateEnd: null,
};

const NO_OWNER = {
  ownerAssignmentId: null,
  ownerTeacherId: null,
  ownerTeacherName: null,
  ownerSince: null,
};

const NO_FORM_CLASS = {
  formClassId: null,
  formClassName: null,
  isFormTeacher: false,
  assignedClassId: null,
  assignedClassName: null,
};

const formClassFields = (classId: string, className: string) => ({
  formClassId: classId,
  formClassName: className,
  isFormTeacher: true,
  assignedClassId: classId,
  assignedClassName: className,
});

export const mapSlot = (id: string, d: DocumentData): ClassSlot => ({
  id,
  classId: d.classId,
  className: d.className || '',
  subject: d.subject || '',
  normalizedSubject: d.normalizedSubject || '',
  isFormTeacherSlot: d.isFormTeacherSlot === true,

  ownerAssignmentId: d.ownerAssignmentId ?? null,
  ownerTeacherId: d.ownerTeacherId ?? null,
  ownerTeacherName: d.ownerTeacherName ?? null,
  ownerSince: tsToDate(d.ownerSince),

  delegateAssignmentId: d.delegateAssignmentId ?? null,
  delegateTeacherId: d.delegateTeacherId ?? null,
  delegateTeacherName: d.delegateTeacherName ?? null,
  delegateRole: (d.delegateRole as DelegateRole) ?? null,
  delegateStart: tsToDate(d.delegateStart),
  delegateEnd: tsToDate(d.delegateEnd),

  updatedAt: tsToDate(d.updatedAt),
});

// ==================== AUTHORITY (PURE) ====================

export const delegationState = (slot: ClassSlot | null, now = new Date()): DelegationState => {
  if (!slot?.delegateTeacherId || !slot.delegateStart || !slot.delegateEnd) return 'none';
  if (now < slot.delegateStart) return 'pending';
  if (now > slot.delegateEnd) return 'expired';
  return 'live';
};

/**
 * Who holds operational authority on a slot at `now`.
 * Reversion to the owner is instant at delegateEnd, with no job needed.
 */
export const resolveAuthority = (slot: ClassSlot | null, now = new Date()): SlotAuthority => {
  const state = delegationState(slot, now);
  const base = {
    slotId: slot?.id ?? null,
    ownerTeacherId: slot?.ownerTeacherId ?? null,
    ownerTeacherName: slot?.ownerTeacherName ?? null,
    delegationState: state,
    delegateUntil: state === 'live' || state === 'pending' ? slot?.delegateEnd ?? null : null,
  };

  if (slot && state === 'live') {
    return {
      ...base,
      operatorTeacherId: slot.delegateTeacherId,
      operatorTeacherName: slot.delegateTeacherName,
      operatorRole: slot.delegateRole,
    };
  }
  return {
    ...base,
    operatorTeacherId: slot?.ownerTeacherId ?? null,
    operatorTeacherName: slot?.ownerTeacherName ?? null,
    operatorRole: slot?.ownerTeacherId ? 'owner' : null,
  };
};

// ==================== ENGINE STATUS ====================

/** True once migrateToSlots() has run. Hooks use this to fall back to legacy rows. */
export async function isEngineReady(): Promise<boolean> {
  try {
    return (await getDoc(META_REF())).exists();
  } catch {
    return false;
  }
}

// ==================== READS ====================

export async function getSlot(classId: string, subject: string): Promise<ClassSlot | null> {
  const snap = await getDoc(doc(db, SLOTS, slotIdFor(classId, subject)));
  return snap.exists() ? mapSlot(snap.id, snap.data()) : null;
}

export async function getSlotById(slotId: string): Promise<ClassSlot | null> {
  const snap = await getDoc(doc(db, SLOTS, slotId));
  return snap.exists() ? mapSlot(snap.id, snap.data()) : null;
}

export async function getSlotsForClass(classId: string): Promise<ClassSlot[]> {
  const snap = await getDocs(query(collection(db, SLOTS), where('classId', '==', classId)));
  return snap.docs.map(d => mapSlot(d.id, d.data()));
}

/** Slots where the teacher is owner OR delegate (live, pending or expired-not-yet-closed). */
export async function getSlotsForTeacher(
  teacherId: string
): Promise<Array<{ slot: ClassSlot; relation: 'owner' | 'delegate' }>> {
  const [own, del] = await Promise.all([
    getDocs(query(collection(db, SLOTS), where('ownerTeacherId', '==', teacherId))),
    getDocs(query(collection(db, SLOTS), where('delegateTeacherId', '==', teacherId))),
  ]);
  return [
    ...own.docs.map(d => ({ slot: mapSlot(d.id, d.data()), relation: 'owner' as const })),
    ...del.docs.map(d => ({ slot: mapSlot(d.id, d.data()), relation: 'delegate' as const })),
  ];
}

/**
 * Teacher dashboard view: every slot the teacher is attached to and whether
 * they can operate it right now (owner is read-only while covered).
 */
export async function getOperationalViewForTeacher(teacherId: string, now = new Date()) {
  const rows = await getSlotsForTeacher(teacherId);
  return rows
    .map(({ slot, relation }) => {
      const authority = resolveAuthority(slot, now);
      return {
        slot,
        relation,
        authority,
        canOperate: authority.operatorTeacherId === teacherId,
      };
    })
    // An expired or pending delegation gives the delegate nothing to show yet
    .filter(r => r.relation === 'owner' || r.authority.delegationState !== 'expired')
    .sort((a, b) =>
      (a.slot.className + a.slot.subject).localeCompare(b.slot.className + b.slot.subject)
    );
}

export async function canOperate(
  teacherId: string,
  classId: string,
  subject: string,
  now = new Date()
): Promise<boolean> {
  return resolveAuthority(await getSlot(classId, subject), now).operatorTeacherId === teacherId;
}

/**
 * Call before writing grades, attendance or assignments in the client.
 * Firestore rules enforce the same check server-side (see firestore.rules).
 */
export async function assertCanOperate(
  teacherId: string,
  classId: string,
  subject: string
): Promise<SlotAuthority> {
  const slot = await getSlot(classId, subject);
  const auth = resolveAuthority(slot);
  if (auth.operatorTeacherId !== teacherId) {
    const who = auth.operatorTeacherName
      ? `${auth.operatorTeacherName} (${ROLE_LABEL[auth.operatorRole === 'owner' ? 'substantive' : auth.operatorRole!]}` +
        (auth.delegateUntil ? ` until ${fmt(auth.delegateUntil)})` : ')')
      : 'nobody — the slot is vacant';
    throw new AssignmentRuleError(
      'NOT_OPERATOR',
      `You don't currently have operational authority for ${slot?.subject || subject} in ` +
        `${slot?.className || 'this class'}. It is handled by ${who}.`
    );
  }
  return auth;
}

/** Slots owned by teachers on leave that have no live or pending cover. */
export async function getUncoveredSlots(now = new Date()): Promise<ClassSlot[]> {
  const onLeave = await getDocs(
    query(collection(db, 'users'), where('userType', '==', 'teacher'), where('status', '==', 'on_leave'))
  );
  const ids = onLeave.docs.map(d => d.id);
  const out: ClassSlot[] = [];
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    const snap = await getDocs(query(collection(db, SLOTS), where('ownerTeacherId', 'in', chunk)));
    for (const d of snap.docs) {
      const slot = mapSlot(d.id, d.data());
      const st = delegationState(slot, now);
      if (st !== 'live' && st !== 'pending') out.push(slot);
    }
  }
  return out;
}

// ==================== TRANSACTION BUILDING BLOCKS ====================

async function requireMigrated(tx: Transaction) {
  const meta = await tx.get(META_REF());
  if (!meta.exists()) {
    throw new AssignmentRuleError(
      'NOT_MIGRATED',
      'Assignment engine not initialised. Run migrateToSlots() once from the admin tools.'
    );
  }
}

function logEvent(tx: Transaction, event: Record<string, any>) {
  tx.set(doc(collection(db, EVENTS)), {
    ...event,
    actorId: currentActor(),
    at: serverTimestamp(),
  });
}

/** End a history row. merge:true so a missing legacy row can't abort the transaction. */
function endRow(tx: Transaction, assignmentId: string, reason: EngineEndReason, endDate: Date) {
  tx.set(
    doc(db, ASSIGNMENTS, assignmentId),
    { status: 'ended', endReason: reason, endDate: ts(endDate), updatedAt: serverTimestamp() },
    { merge: true }
  );
}

function assertOwnerEligible(teacher: DocumentData, name: string) {
  const status = teacher.status || 'active';
  // An owner may be on leave (e.g. planned term allocation); they'll need cover.
  if (status !== 'active' && status !== 'on_leave') {
    throw new AssignmentRuleError(
      'TEACHER_NOT_ASSIGNABLE',
      `${name} is ${String(status).replace('_', ' ')} and cannot be a Primary Owner.`
    );
  }
}

function assertDelegateEligible(teacher: DocumentData, name: string) {
  const status = teacher.status || 'active';
  if (status !== 'active') {
    throw new AssignmentRuleError(
      'TEACHER_NOT_ACTIVE',
      `${name} is ${String(status).replace('_', ' ')} and cannot cover or take a TP placement.`
    );
  }
}

interface OwnerChangeCtx {
  slotRef: DocumentReference;
  slot: ClassSlot | null;
  classId: string;
  className: string;
  subject: string;
  normalized: string;
  isFT: boolean;
  teacherId: string;
  teacherName: string;
  teacherEmail: string | null;
  start: Date;
  keepDelegation: boolean;
  actor: string | null;
}

/**
 * RULE 2: install a new owner, archiving the previous one in the same transaction.
 * The caller updates class/user caches.
 */
function writeOwnerChange(tx: Transaction, c: OwnerChangeCtx) {
  const newRef = doc(collection(db, ASSIGNMENTS));
  let replacedTeacherId: string | null = null;
  let endedDelegateTeacherId: string | null = null;

  const slotUpdate: Record<string, any> = {
    classId: c.classId,
    className: c.className,
    subject: c.subject,
    normalizedSubject: c.normalized,
    isFormTeacherSlot: c.isFT,
    ownerAssignmentId: newRef.id,
    ownerTeacherId: c.teacherId,
    ownerTeacherName: c.teacherName,
    ownerSince: ts(c.start),
    updatedAt: serverTimestamp(),
  };

  if (c.slot?.ownerAssignmentId) {
    endRow(tx, c.slot.ownerAssignmentId, 'replaced', c.start);
    replacedTeacherId = c.slot.ownerTeacherId;
  }

  let coversRow: string | null = null;
  if (c.slot?.delegateAssignmentId) {
    const promoted = c.slot.delegateTeacherId === c.teacherId;
    if (promoted || !c.keepDelegation) {
      endRow(tx, c.slot.delegateAssignmentId, promoted ? 'promoted-to-owner' : 'owner-replaced', c.start);
      Object.assign(slotUpdate, NO_DELEGATE);
      if (!promoted) endedDelegateTeacherId = c.slot.delegateTeacherId;
    } else {
      coversRow = c.slot.delegateAssignmentId;
    }
  }

  tx.set(newRef, {
    teacherId: c.teacherId,
    teacherName: c.teacherName,
    teacherEmail: c.teacherEmail,
    classId: c.classId,
    className: c.className,
    subject: c.subject,
    normalizedSubject: c.normalized,
    slotId: c.slotRef.id,
    isFormTeacher: c.isFT,
    roleType: 'substantive',
    status: 'active',
    startDate: ts(c.start),
    endDate: null,
    coversTeacherId: null,
    coversAssignmentId: null,
    endReason: null,
    assignedBy: c.actor,
    assignedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (coversRow) {
    // Delegation kept: it now covers the new owner.
    tx.set(
      doc(db, ASSIGNMENTS, coversRow),
      { coversAssignmentId: newRef.id, coversTeacherId: c.teacherId, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  tx.set(c.slotRef, slotUpdate, { merge: true });

  return { newAssignmentId: newRef.id, replacedTeacherId, endedDelegateTeacherId };
}

/** Owner leaves the slot. A running delegation keeps going (the class still needs teaching). */
function writeVacateOwner(
  tx: Transaction,
  slotRef: DocumentReference,
  slot: ClassSlot,
  reason: EngineEndReason,
  endDate: Date
) {
  if (slot.ownerAssignmentId) endRow(tx, slot.ownerAssignmentId, reason, endDate);
  tx.set(slotRef, { ...NO_OWNER, updatedAt: serverTimestamp() }, { merge: true });
}

function writeEndDelegation(
  tx: Transaction,
  slotRef: DocumentReference,
  slot: ClassSlot,
  reason: EngineEndReason,
  endDate: Date
) {
  if (slot.delegateAssignmentId) endRow(tx, slot.delegateAssignmentId, reason, endDate);
  tx.set(slotRef, { ...NO_DELEGATE, updatedAt: serverTimestamp() }, { merge: true });
}

// ==================== RULES 1 & 2: PRIMARY OWNER ====================

export interface AssignOwnerInput {
  teacherId: string;
  classId: string;
  /** Subject name, or "Form Teacher" for the form-teacher role. */
  subject: string;
  startDate?: Date;
  /**
   * Default false: a new owner ends any running cover/TP on the slot.
   * Pass true to keep it (it is re-pointed at the new owner).
   */
  keepDelegation?: boolean;
}

export interface AssignOwnerResult {
  changed: boolean;
  assignmentId: string | null;
  replacedTeacherId: string | null;
  endedDelegateTeacherId: string | null;
}

export async function assignOwner(input: AssignOwnerInput): Promise<AssignOwnerResult> {
  const subjectRaw = (input.subject || '').trim();
  if (!subjectRaw) throw new AssignmentRuleError('SUBJECT_REQUIRED', 'Subject is required.');

  const normalized = toNormalized(subjectRaw);
  const isFT = normalized === FORM_TEACHER_SLOT;
  const subject = isFT ? FORM_TEACHER_SUBJECT : subjectRaw;
  const slotRef = doc(db, SLOTS, slotIdForNormalized(input.classId, normalized));
  const teacherRef = doc(db, 'users', input.teacherId);
  const classRef = doc(db, 'classes', input.classId);
  const start = input.startDate ?? new Date();
  const actor = currentActor();

  const result = await runTransaction(db, async tx => {
    await requireMigrated(tx);
    const [slotSnap, teacherSnap, classSnap] = await Promise.all([
      tx.get(slotRef),
      tx.get(teacherRef),
      tx.get(classRef),
    ]);
    if (!teacherSnap.exists()) throw new AssignmentRuleError('TEACHER_NOT_FOUND', 'Teacher not found');
    if (!classSnap.exists()) throw new AssignmentRuleError('CLASS_NOT_FOUND', 'Class not found');

    const teacher = teacherSnap.data();
    const cls = classSnap.data();
    const teacherName = displayName(teacher);
    assertOwnerEligible(teacher, teacherName);

    const slot = slotSnap.exists() ? mapSlot(slotSnap.id, slotSnap.data()) : null;

    // Idempotent: already the owner.
    if (slot?.ownerTeacherId === input.teacherId) {
      return {
        changed: false,
        assignmentId: slot.ownerAssignmentId,
        replacedTeacherId: null,
        endedDelegateTeacherId: null,
      } as AssignOwnerResult;
    }

    // A teacher can be Form Teacher of only one class.
    if (isFT && teacher.formClassId && teacher.formClassId !== input.classId) {
      throw new AssignmentRuleError(
        'TEACHER_ALREADY_FORM_TEACHER',
        `${teacherName} is already Form Teacher of ${teacher.formClassName || 'another class'}. ` +
          `Assign that class a new Form Teacher (or remove ${teacherName}) first.`
      );
    }

    // Read the previous Form Teacher's user doc so we can clear their pointer.
    let prevOwnerSnap: DocumentSnapshot<DocumentData> | null = null;
    if (isFT && slot?.ownerTeacherId) {
      prevOwnerSnap = await tx.get(doc(db, 'users', slot.ownerTeacherId));
    }

    // ---- writes ----
    const change = writeOwnerChange(tx, {
      slotRef,
      slot,
      classId: input.classId,
      className: cls.name,
      subject,
      normalized,
      isFT,
      teacherId: input.teacherId,
      teacherName,
      teacherEmail: teacher.email || null,
      start,
      keepDelegation: !!input.keepDelegation,
      actor,
    });

    tx.update(classRef, {
      teachers: arrayUnion(input.teacherId),
      ...(isFT ? { formTeacherId: input.teacherId, formTeacherName: teacherName } : {}),
      updatedAt: serverTimestamp(),
    });
    tx.update(teacherRef, {
      assignedClasses: arrayUnion(input.classId),
      ...(isFT ? formClassFields(input.classId, cls.name) : {}),
      updatedAt: serverTimestamp(),
    });
    if (prevOwnerSnap?.exists() && prevOwnerSnap.data().formClassId === input.classId) {
      tx.update(prevOwnerSnap.ref, { ...NO_FORM_CLASS, updatedAt: serverTimestamp() });
    }

    logEvent(tx, {
      type: 'owner-assigned',
      slotId: slotRef.id,
      classId: input.classId,
      subject,
      teacherId: input.teacherId,
      previousOwnerId: change.replacedTeacherId,
      endedDelegateId: change.endedDelegateTeacherId,
      assignmentId: change.newAssignmentId,
    });

    return {
      changed: true,
      assignmentId: change.newAssignmentId,
      replacedTeacherId: change.replacedTeacherId,
      endedDelegateTeacherId: change.endedDelegateTeacherId,
    } as AssignOwnerResult;
  });

  if (result.changed) {
    await reconcileAfter([result.replacedTeacherId, result.endedDelegateTeacherId], [input.classId]);
  }
  return result;
}

/** Owner leaves the slot (not replaced). Any running delegation continues. */
export async function removeOwner(
  slotId: string,
  reason: EngineEndReason = 'removed',
  opts: { expectedAssignmentId?: string; alsoEndDelegation?: boolean } = {}
): Promise<boolean> {
  const slotRef = doc(db, SLOTS, slotId);
  const now = new Date();

  const out = await runTransaction(db, async tx => {
    await requireMigrated(tx);
    const slotSnap = await tx.get(slotRef);
    if (!slotSnap.exists()) return null;
    const slot = mapSlot(slotSnap.id, slotSnap.data());
    if (!slot.ownerTeacherId) return null;
    if (opts.expectedAssignmentId && slot.ownerAssignmentId !== opts.expectedAssignmentId) return null;

    const classRef = doc(db, 'classes', slot.classId);
    const ownerRef = doc(db, 'users', slot.ownerTeacherId);
    const [classSnap, ownerSnap] = await Promise.all([tx.get(classRef), tx.get(ownerRef)]);

    writeVacateOwner(tx, slotRef, slot, reason, now);
    let endedDelegate: string | null = null;
    if (opts.alsoEndDelegation && slot.delegateAssignmentId) {
      writeEndDelegation(tx, slotRef, slot, 'cancelled', now);
      endedDelegate = slot.delegateTeacherId;
    }

    if (slot.isFormTeacherSlot) {
      if (classSnap.exists() && classSnap.data().formTeacherId === slot.ownerTeacherId) {
        tx.update(classRef, { formTeacherId: null, formTeacherName: null, updatedAt: serverTimestamp() });
      }
      if (ownerSnap.exists() && ownerSnap.data().formClassId === slot.classId) {
        tx.update(ownerRef, { ...NO_FORM_CLASS, updatedAt: serverTimestamp() });
      }
    }

    logEvent(tx, {
      type: 'owner-removed',
      slotId,
      classId: slot.classId,
      subject: slot.subject,
      teacherId: slot.ownerTeacherId,
      reason,
    });
    return { ownerId: slot.ownerTeacherId, classId: slot.classId, endedDelegate };
  });

  if (out) await reconcileAfter([out.ownerId, out.endedDelegate], [out.classId]);
  return !!out;
}

// ==================== RULES 3 & 4: COVER / TP DELEGATION ====================

export interface AssignDelegateInput {
  teacherId: string;
  classId: string;
  subject: string;
  role: DelegateRole;
  /** Required. */
  startDate: Date;
  /** Required. Stored as 23:59:59.999 local time on that day. */
  endDate: Date;
  note?: string;
}

export async function assignDelegate(input: AssignDelegateInput): Promise<{ assignmentId: string; extended: boolean }> {
  if (input.role !== 'leave-cover' && input.role !== 'tp') {
    throw new AssignmentRuleError('BAD_ROLE', `Unknown delegate role: ${input.role}`);
  }
  if (!input.startDate || !input.endDate) {
    throw new AssignmentRuleError('DATES_REQUIRED', `${ROLE_LABEL[input.role]} requires a start and an end date.`);
  }
  const start = input.startDate;
  const end = endOfDay(input.endDate);
  const now = new Date();
  if (end.getTime() <= start.getTime()) {
    throw new AssignmentRuleError('BAD_DATES', 'End date must be after the start date.');
  }
  if (end.getTime() <= now.getTime()) {
    throw new AssignmentRuleError('END_IN_PAST', 'End date is already in the past.');
  }

  const subjectRaw = (input.subject || '').trim();
  const normalized = toNormalized(subjectRaw);
  const slotRef = doc(db, SLOTS, slotIdForNormalized(input.classId, normalized));
  const teacherRef = doc(db, 'users', input.teacherId);
  const classRef = doc(db, 'classes', input.classId);
  const actor = currentActor();

  const out = await runTransaction(db, async tx => {
    await requireMigrated(tx);
    const [slotSnap, teacherSnap, classSnap] = await Promise.all([
      tx.get(slotRef),
      tx.get(teacherRef),
      tx.get(classRef),
    ]);
    if (!teacherSnap.exists()) throw new AssignmentRuleError('TEACHER_NOT_FOUND', 'Teacher not found');
    if (!classSnap.exists()) throw new AssignmentRuleError('CLASS_NOT_FOUND', 'Class not found');

    const teacher = teacherSnap.data();
    const cls = classSnap.data();
    const teacherName = displayName(teacher);
    const slot = slotSnap.exists() ? mapSlot(slotSnap.id, slotSnap.data()) : null;

    if (!slot?.ownerTeacherId) {
      throw new AssignmentRuleError(
        'NO_PRIMARY_OWNER',
        `${subjectRaw} in ${cls.name} has no Primary Owner. ` +
          `Assign the primary teacher first; covers and TP placements delegate from an owner.`
      );
    }
    if (slot.ownerTeacherId === input.teacherId) {
      throw new AssignmentRuleError('DELEGATE_IS_OWNER', `${teacherName} is already the Primary Owner of this slot.`);
    }
    assertDelegateEligible(teacher, teacherName);

    const state = delegationState(slot, now);
    let closedPrevious: string | null = null;

    if (state === 'live' || state === 'pending') {
      // Same delegate, same role → treat as "change dates / extend".
      if (slot.delegateTeacherId === input.teacherId && slot.delegateRole === input.role && slot.delegateAssignmentId) {
        tx.set(
          doc(db, ASSIGNMENTS, slot.delegateAssignmentId),
          { startDate: ts(start), endDate: ts(end), updatedAt: serverTimestamp() },
          { merge: true }
        );
        tx.set(slotRef, { delegateStart: ts(start), delegateEnd: ts(end), updatedAt: serverTimestamp() }, { merge: true });
        logEvent(tx, {
          type: 'delegation-dates-changed',
          slotId: slotRef.id,
          teacherId: input.teacherId,
          start: ts(start),
          end: ts(end),
        });
        return { assignmentId: slot.delegateAssignmentId, extended: true, closedPrevious };
      }
      throw new AssignmentRuleError(
        'DELEGATION_EXISTS',
        `${slot.subject} in ${slot.className} already has ${slot.delegateTeacherName} as ` +
          `${ROLE_LABEL[slot.delegateRole!]} (${fmt(slot.delegateStart)} – ${fmt(slot.delegateEnd)}). ` +
          `End that first.`
      );
    }

    if (state === 'expired' && slot.delegateAssignmentId) {
      // Housekeeping: close the stale delegation in the same transaction.
      endRow(tx, slot.delegateAssignmentId, 'expired', slot.delegateEnd || now);
      closedPrevious = slot.delegateTeacherId;
    }

    const newRef = doc(collection(db, ASSIGNMENTS));
    tx.set(newRef, {
      teacherId: input.teacherId,
      teacherName,
      teacherEmail: teacher.email || null,
      classId: input.classId,
      className: cls.name,
      subject: slot.subject,
      normalizedSubject: normalized,
      slotId: slotRef.id,
      isFormTeacher: false, // a form-teacher COVER never becomes the official Form Teacher
      roleType: input.role,
      status: 'active',
      startDate: ts(start),
      endDate: ts(end),
      coversTeacherId: slot.ownerTeacherId,
      coversAssignmentId: slot.ownerAssignmentId,
      endReason: null,
      note: input.note || null,
      assignedBy: actor,
      assignedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Owner fields are NOT touched — Primary Owner preserved.
    tx.set(
      slotRef,
      {
        delegateAssignmentId: newRef.id,
        delegateTeacherId: input.teacherId,
        delegateTeacherName: teacherName,
        delegateRole: input.role,
        delegateStart: ts(start),
        delegateEnd: ts(end),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    tx.update(classRef, { teachers: arrayUnion(input.teacherId), updatedAt: serverTimestamp() });
    tx.update(teacherRef, { assignedClasses: arrayUnion(input.classId), updatedAt: serverTimestamp() });

    logEvent(tx, {
      type: input.role === 'tp' ? 'tp-assigned' : 'cover-assigned',
      slotId: slotRef.id,
      classId: input.classId,
      subject: slot.subject,
      teacherId: input.teacherId,
      ownerTeacherId: slot.ownerTeacherId,
      start: ts(start),
      end: ts(end),
      assignmentId: newRef.id,
    });

    return { assignmentId: newRef.id, extended: false, closedPrevious };
  });

  if (out.closedPrevious) await reconcileAfter([out.closedPrevious], [input.classId]);
  return { assignmentId: out.assignmentId, extended: out.extended };
}

/**
 * End a delegation → authority reverts to the Primary Owner instantly.
 * Used by "Return to Duty", "End TP / Hand back", cancellation and expiry.
 */
export async function endDelegation(
  slotId: string,
  reason: EngineEndReason,
  opts: { expectedAssignmentId?: string; onlyIfExpired?: boolean } = {}
): Promise<boolean> {
  const slotRef = doc(db, SLOTS, slotId);
  const now = new Date();

  const out = await runTransaction(db, async tx => {
    await requireMigrated(tx);
    const snap = await tx.get(slotRef);
    if (!snap.exists()) return null;
    const slot = mapSlot(snap.id, snap.data());
    if (!slot.delegateAssignmentId) return null;
    if (opts.expectedAssignmentId && slot.delegateAssignmentId !== opts.expectedAssignmentId) return null;

    const state = delegationState(slot, now);
    if (opts.onlyIfExpired && state !== 'expired') return null;

    const endDate = state === 'expired' && slot.delegateEnd ? slot.delegateEnd : now;
    writeEndDelegation(tx, slotRef, slot, reason, endDate);

    logEvent(tx, {
      type: 'delegation-ended',
      slotId,
      classId: slot.classId,
      subject: slot.subject,
      teacherId: slot.delegateTeacherId,
      role: slot.delegateRole,
      ownerTeacherId: slot.ownerTeacherId,
      reason,
    });
    return { delegateId: slot.delegateTeacherId, classId: slot.classId };
  });

  if (out) await reconcileAfter([out.delegateId], [out.classId]);
  return !!out;
}

/** TP handback: end the TP placement; the owner operates again immediately. */
export const handBackTp = (slotId: string) => endDelegation(slotId, 'tp-completed');

/** Mark a teacher on leave. Ownership is unchanged; returns slots that need cover. */
export async function setTeacherOnLeave(teacherId: string): Promise<{ slotsNeedingCover: ClassSlot[] }> {
  await updateDoc(doc(db, 'users', teacherId), { status: 'on_leave', updatedAt: serverTimestamp() });
  const owned = (await getSlotsForTeacher(teacherId)).filter(r => r.relation === 'owner').map(r => r.slot);
  const now = new Date();
  return {
    slotsNeedingCover: owned.filter(s => {
      const st = delegationState(s, now);
      return st !== 'live' && st !== 'pending';
    }),
  };
}

/**
 * "RETURN TO DUTY" switch: ends every leave-cover (live or pending) on the
 * teacher's owned slots and sets them Active. TP placements are NOT ended —
 * they're independent of the owner's leave.
 */
export async function returnTeacherToDuty(
  teacherId: string
): Promise<{ coversEnded: number; tpPlacementsContinuing: number }> {
  const owned = (await getSlotsForTeacher(teacherId)).filter(r => r.relation === 'owner').map(r => r.slot);

  let coversEnded = 0;
  let tpPlacementsContinuing = 0;
  for (const s of owned) {
    if (s.delegateRole === 'leave-cover' && s.delegateAssignmentId) {
      if (await endDelegation(s.id, 'returned-to-duty', { expectedAssignmentId: s.delegateAssignmentId })) {
        coversEnded++;
      }
    } else if (s.delegateRole === 'tp' && delegationState(s) !== 'expired') {
      tpPlacementsContinuing++;
    }
  }

  await updateDoc(doc(db, 'users', teacherId), { status: 'active', updatedAt: serverTimestamp() });
  return { coversEnded, tpPlacementsContinuing };
}

/**
 * Housekeeping. Authority has already reverted at read time; this only
 * closes expired delegations in the log. Safe to run anytime
 * (admin page mount, or a scheduled Cloud Function).
 */
export async function closeExpiredDelegations(): Promise<number> {
  const snap = await getDocs(
    query(collection(db, SLOTS), where('delegateEnd', '<=', Timestamp.now()))
  );
  let n = 0;
  for (const d of snap.docs) {
    const slot = mapSlot(d.id, d.data());
    try {
      if (
        await endDelegation(slot.id, 'expired', {
          onlyIfExpired: true,
          expectedAssignmentId: slot.delegateAssignmentId ?? undefined,
        })
      ) {
        n++;
      }
    } catch (e) {
      console.warn(`closeExpiredDelegations: ${slot.id}`, e);
    }
  }
  return n;
}

// ==================== REMOVAL & TRANSFER ====================

/**
 * Remove a teacher from every role in a class (ownership and delegation) atomically.
 * Running delegations on their owned slots continue until their end date.
 */
export async function removeTeacherFromClass(
  teacherId: string,
  classId: string,
  reason: EngineEndReason = 'removed'
): Promise<{ ownedVacated: number; delegationsEnded: number }> {
  const plan = (await getSlotsForClass(classId)).filter(
    s => s.ownerTeacherId === teacherId || s.delegateTeacherId === teacherId
  );
  const now = new Date();

  const out = await runTransaction(db, async tx => {
    await requireMigrated(tx);
    const slotRefs = plan.map(s => doc(db, SLOTS, s.id));
    const classRef = doc(db, 'classes', classId);
    const teacherRef = doc(db, 'users', teacherId);
    const [classSnap, teacherSnap, ...slotSnaps] = await Promise.all([
      tx.get(classRef),
      tx.get(teacherRef),
      ...slotRefs.map(r => tx.get(r)),
    ]);

    let ownedVacated = 0;
    let delegationsEnded = 0;
    let vacatedFT = false;

    slotSnaps.forEach((snap, i) => {
      if (!snap.exists()) return;
      const slot = mapSlot(snap.id, snap.data());
      if (slot.ownerTeacherId === teacherId) {
        writeVacateOwner(tx, slotRefs[i], slot, reason, now);
        ownedVacated++;
        if (slot.isFormTeacherSlot) vacatedFT = true;
      }
      if (slot.delegateTeacherId === teacherId) {
        writeEndDelegation(tx, slotRefs[i], slot, 'cancelled', now);
        delegationsEnded++;
      }
    });

    if (classSnap.exists()) {
      tx.update(classRef, {
        teachers: arrayRemove(teacherId),
        ...(vacatedFT || classSnap.data().formTeacherId === teacherId
          ? { formTeacherId: null, formTeacherName: null }
          : {}),
        updatedAt: serverTimestamp(),
      });
    }
    if (teacherSnap.exists()) {
      tx.update(teacherRef, {
        assignedClasses: arrayRemove(classId),
        ...(teacherSnap.data().formClassId === classId ? NO_FORM_CLASS : {}),
        updatedAt: serverTimestamp(),
      });
    }

    logEvent(tx, { type: 'teacher-removed-from-class', classId, teacherId, ownedVacated, delegationsEnded, reason });
    return { ownedVacated, delegationsEnded };
  });

  await reconcileAfter([teacherId], [classId]);
  return out;
}

export interface TransferInput {
  teacherId: string;
  fromClassId: string;
  toClassId: string;
  /** Rename subjects on the way, e.g. { 'Mathematics': 'Additional Mathematics' }. */
  subjectMapping?: Record<string, string>;
  /** Carry the Form Teacher role to the target class (default true). */
  includeFormTeacher?: boolean;
  /** Keep delegations running on target slots whose owner gets replaced (default false). */
  keepTargetDelegations?: boolean;
  startDate?: Date;
}

export interface TransferReport {
  carried: string[];
  vacatedInSource: string[];
  sourceSlotsStillCovered: string[];
  delegationsEndedInSource: string[];
  replacedOwnersInTarget: Array<{ subject: string; teacherId: string }>;
  delegationsEndedInTarget: Array<{ subject: string; teacherId: string }>;
}

/**
 * CONFLICT-FREE MIGRATION — one atomic transaction.
 *   Source: every role the teacher holds is archived ('transferred').
 *   Target: the teacher becomes Primary Owner of each carried subject,
 *           auto-replacing current owners (RULE 2).
 * Either everything happens or nothing does. If another admin changed any
 * involved slot meanwhile, the transaction retries or fails with TRANSFER_CONFLICT.
 */
export async function transferTeacher(input: TransferInput): Promise<TransferReport> {
  const { teacherId, fromClassId, toClassId } = input;
  const includeFT = input.includeFormTeacher !== false;
  if (fromClassId === toClassId) {
    throw new AssignmentRuleError('SAME_CLASS', 'Source and target class are the same.');
  }

  // ── Plan (outside the transaction — queries aren't allowed inside) ──
  const sourceSlots = await getSlotsForClass(fromClassId);
  const ownedPlan = sourceSlots.filter(s => s.ownerTeacherId === teacherId);
  const delegatedPlan = sourceSlots.filter(s => s.delegateTeacherId === teacherId);
  if (ownedPlan.length === 0 && delegatedPlan.length === 0) {
    throw new AssignmentRuleError('NOTHING_TO_TRANSFER', 'The teacher holds no roles in the source class.');
  }

  const carryMap = new Map<string, string>(); // normalized → display subject
  for (const s of ownedPlan) {
    if (s.isFormTeacherSlot && !includeFT) continue;
    const target = s.isFormTeacherSlot ? FORM_TEACHER_SUBJECT : input.subjectMapping?.[s.subject] || s.subject;
    carryMap.set(toNormalized(target), s.isFormTeacherSlot ? FORM_TEACHER_SUBJECT : target);
  }
  const carry = Array.from(carryMap.entries()); // [normalized, subject]
  const sourceIds = Array.from(new Set([...ownedPlan, ...delegatedPlan].map(s => s.id)));
  const start = input.startDate ?? new Date();
  const actor = currentActor();

  const report = await runTransaction(db, async tx => {
    await requireMigrated(tx);

    const teacherRef = doc(db, 'users', teacherId);
    const fromRef = doc(db, 'classes', fromClassId);
    const toRef = doc(db, 'classes', toClassId);
    const sourceRefs = sourceIds.map(id => doc(db, SLOTS, id));
    const targetRefs = carry.map(([n]) => doc(db, SLOTS, slotIdForNormalized(toClassId, n)));

    // ---- ALL reads first ----
    const [teacherSnap, fromSnap, toSnap] = await Promise.all([tx.get(teacherRef), tx.get(fromRef), tx.get(toRef)]);
    const sourceSnaps = await Promise.all(sourceRefs.map(r => tx.get(r)));
    const targetSnaps = await Promise.all(targetRefs.map(r => tx.get(r)));

    if (!teacherSnap.exists()) throw new AssignmentRuleError('TEACHER_NOT_FOUND', 'Teacher not found');
    if (!toSnap.exists()) throw new AssignmentRuleError('CLASS_NOT_FOUND', 'Target class not found');
    const teacher = teacherSnap.data();
    const toClass = toSnap.data();
    const teacherName = displayName(teacher);
    assertOwnerEligible(teacher, teacherName);

    const sources = sourceSnaps.map(s => (s.exists() ? mapSlot(s.id, s.data()) : null));
    const targets = targetSnaps.map(s => (s.exists() ? mapSlot(s.id, s.data()) : null));

    // Verify the plan still holds (another admin may have acted).
    for (const planned of ownedPlan) {
      const now = sources[sourceIds.indexOf(planned.id)];
      if (now?.ownerTeacherId !== teacherId) {
        throw new AssignmentRuleError('TRANSFER_CONFLICT', `${planned.subject} in ${planned.className} changed since the transfer was planned. Please retry.`);
      }
    }

    // Form-teacher rule: if carrying FT, the teacher can't be FT anywhere else (except the source).
    const carriesFT = carry.some(([n]) => n === FORM_TEACHER_SLOT);
    if (carriesFT && teacher.formClassId && teacher.formClassId !== fromClassId && teacher.formClassId !== toClassId) {
      throw new AssignmentRuleError(
        'TEACHER_ALREADY_FORM_TEACHER',
        `${teacherName} is Form Teacher of ${teacher.formClassName || 'another class'}.`
      );
    }

    // Previous FT owner in target (to clear their pointer)
    const targetFTIdx = carry.findIndex(([n]) => n === FORM_TEACHER_SLOT);
    const prevTargetFT = targetFTIdx >= 0 ? targets[targetFTIdx] : null;
    let prevTargetFTUser: DocumentSnapshot<DocumentData> | null = null;
    if (prevTargetFT?.ownerTeacherId && prevTargetFT.ownerTeacherId !== teacherId) {
      prevTargetFTUser = await tx.get(doc(db, 'users', prevTargetFT.ownerTeacherId));
    }

    // ---- writes ----
    const r: TransferReport = {
      carried: [],
      vacatedInSource: [],
      sourceSlotsStillCovered: [],
      delegationsEndedInSource: [],
      replacedOwnersInTarget: [],
      delegationsEndedInTarget: [],
    };

    let sourceHadFT = false;
    sources.forEach((slot, i) => {
      if (!slot) return;
      if (slot.ownerTeacherId === teacherId) {
        writeVacateOwner(tx, sourceRefs[i], slot, 'transferred', start);
        r.vacatedInSource.push(slot.subject);
        if (slot.isFormTeacherSlot) sourceHadFT = true;
        if (slot.delegateTeacherId && slot.delegateTeacherId !== teacherId) {
          r.sourceSlotsStillCovered.push(`${slot.subject} (${slot.delegateTeacherName})`);
        }
      }
      if (slot.delegateTeacherId === teacherId) {
        writeEndDelegation(tx, sourceRefs[i], slot, 'transferred', start);
        r.delegationsEndedInSource.push(slot.subject);
      }
    });

    carry.forEach(([normalized, subject], i) => {
      const slot = targets[i];
      if (slot?.ownerTeacherId === teacherId) {
        r.carried.push(subject); // already owner there
        return;
      }
      const change = writeOwnerChange(tx, {
        slotRef: targetRefs[i],
        slot,
        classId: toClassId,
        className: toClass.name,
        subject,
        normalized,
        isFT: normalized === FORM_TEACHER_SLOT,
        teacherId,
        teacherName,
        teacherEmail: teacher.email || null,
        start,
        keepDelegation: !!input.keepTargetDelegations,
        actor,
      });
      r.carried.push(subject);
      if (change.replacedTeacherId) r.replacedOwnersInTarget.push({ subject, teacherId: change.replacedTeacherId });
      if (change.endedDelegateTeacherId) r.delegationsEndedInTarget.push({ subject, teacherId: change.endedDelegateTeacherId });
    });

    // Class caches
    if (fromSnap.exists()) {
      tx.update(fromRef, {
        teachers: arrayRemove(teacherId),
        ...(sourceHadFT || fromSnap.data().formTeacherId === teacherId ? { formTeacherId: null, formTeacherName: null } : {}),
        updatedAt: serverTimestamp(),
      });
    }
    if (carry.length > 0) {
      tx.update(toRef, {
        teachers: arrayUnion(teacherId),
        ...(carriesFT ? { formTeacherId: teacherId, formTeacherName: teacherName } : {}),
        updatedAt: serverTimestamp(),
      });
    }

    // Teacher cache (explicit array: arrayRemove + arrayUnion can't share one update)
    const classes = new Set<string>(teacher.assignedClasses || []);
    classes.delete(fromClassId);
    if (carry.length > 0) classes.add(toClassId);
    tx.update(teacherRef, {
      assignedClasses: Array.from(classes),
      ...(carriesFT
        ? formClassFields(toClassId, toClass.name)
        : teacher.formClassId === fromClassId
        ? NO_FORM_CLASS
        : {}),
      updatedAt: serverTimestamp(),
    });

    if (prevTargetFTUser?.exists() && prevTargetFTUser.data().formClassId === toClassId) {
      tx.update(prevTargetFTUser.ref, { ...NO_FORM_CLASS, updatedAt: serverTimestamp() });
    }

    logEvent(tx, { type: 'teacher-transferred', teacherId, fromClassId, toClassId, ...r });
    return r;
  });

  await reconcileAfter(
    [
      teacherId,
      ...report.replacedOwnersInTarget.map(x => x.teacherId),
      ...report.delegationsEndedInTarget.map(x => x.teacherId),
    ],
    [fromClassId, toClassId]
  );
  return report;
}

// ==================== OVERLAP DETECTION & RESOLUTION ====================
//
// WHY THE OLD "RESOLVE" BUTTON ALWAYS FAILED
//   1. Detection and resolution saw different rows. The Overlaps list is
//      built from mapAssignmentDoc, which treats a missing `status` as
//      'active' and computes a missing `normalizedSubject`. The resolver
//      queried Firestore with where('normalizedSubject','==',…) and
//      where('status','in',…), which can't match rows MISSING those fields.
//      Older rows (the ones that create overlaps) lack them, so the resolver
//      threw "assignment to keep was not found" / "No assignments found".
//   2. It used batch.update() on the losing teachers' users docs. If any of
//      those teachers had been deleted, the WHOLE batch failed
//      ("No document to update").
//   3. An owner plus their cover was listed as an "overlap". Under the slot
//      model that pair is legitimate, so "resolving" it would wrongly end a cover.
//
// FIX: detection and resolution share one in-memory definition of an
// "open row on a slot". Only same-kind duplicates count (2+ owners, or
// 2+ delegates). Every write is set(…, {merge:true}), which can't fail on a
// missing doc. After commit the result is re-read and verified.

export type RowKind = 'owner' | 'delegate';

const isOpenRow = (d: DocumentData) => (d.status || 'active') !== 'ended';
const rowNorm = (d: DocumentData) => d.normalizedSubject || toNormalized(d.subject || '');
const rowKind = (d: DocumentData): RowKind =>
  d.roleType === 'tp' || d.roleType === 'leave-cover' ? 'delegate' : 'owner';

export interface OverlapRow {
  id: string;
  teacherId: string;
  teacherName: string;
  classId: string;
  className: string;
  subject: string;
  normalizedSubjectId: string;
  roleType: EngineRole;
  status: string;
  isFormTeacher: boolean;
  startDate: Date | null;
  endDate: Date | null;
  kind: RowKind;
}

export interface SlotOverlap {
  slotId: string;
  classId: string;
  className: string;
  subject: string;
  normalizedSubjectId: string;
  /** 'owner' = several Primary Owners; 'delegate' = several covers/TP at once. */
  kind: RowKind;
  assignments: OverlapRow[];
}

const toOverlapRow = (id: string, d: DocumentData): OverlapRow => ({
  id,
  teacherId: d.teacherId,
  teacherName: d.teacherName || 'Unknown teacher',
  classId: d.classId,
  className: d.className || '',
  subject: d.subject || '',
  normalizedSubjectId: rowNorm(d),
  roleType: (d.roleType as EngineRole) || 'substantive',
  status: d.status || 'active',
  isFormTeacher: d.isFormTeacher === true,
  startDate: tsToDate(d.startDate) || tsToDate(d.assignedAt) || tsToDate(d.createdAt),
  endDate: tsToDate(d.endDate),
  kind: rowKind(d),
});

/** Every (class, subject) with 2+ open rows of the SAME kind. */
export async function findSlotOverlaps(classNames: Record<string, string> = {}): Promise<SlotOverlap[]> {
  const all = await getDocs(collection(db, ASSIGNMENTS));
  const groups = new Map<string, OverlapRow[]>();

  for (const snap of all.docs) {
    const d = snap.data();
    if (!d.classId || !isOpenRow(d)) continue;
    const row = toOverlapRow(snap.id, d);
    const key = `${slotIdForNormalized(row.classId, row.normalizedSubjectId)}::${row.kind}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  return Array.from(groups.entries())
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => {
      const first = rows[0];
      return {
        slotId: key.split('::')[0],
        classId: first.classId,
        className: classNames[first.classId] || first.className || 'Unknown class',
        subject: first.subject,
        normalizedSubjectId: first.normalizedSubjectId,
        kind: first.kind,
        assignments: rows.sort((a, b) => (b.startDate?.getTime() ?? 0) - (a.startDate?.getTime() ?? 0)),
      };
    })
    .sort((a, b) => a.className.localeCompare(b.className) || a.subject.localeCompare(b.subject));
}

export interface ResolveResult {
  kept: OverlapRow;
  ended: number;
  warnings: string[];
}

/**
 * Keep `keepAssignmentId` and archive every other open row of the same kind
 * on its slot (plus any other-kind row held by the SAME teacher, since a
 * teacher can't own and cover the same slot). Rows of the other kind held by
 * other teachers (e.g. the owner when you resolve duplicate covers) are untouched.
 * History is archived, never deleted. Works before and after migrateToSlots().
 */
export async function resolveSlotOverlap(
  classId: string,
  normalizedSubject: string,
  keepAssignmentId: string
): Promise<ResolveResult> {
  const all = await getDocs(query(collection(db, ASSIGNMENTS), where('classId', '==', classId)));
  const open = all.docs.filter(d => isOpenRow(d.data()) && rowNorm(d.data()) === normalizedSubject);

  const keepSnap = open.find(d => d.id === keepAssignmentId);
  if (!keepSnap) {
    const raw = all.docs.find(d => d.id === keepAssignmentId);
    if (!raw) {
      throw new AssignmentRuleError('KEEP_NOT_FOUND', 'The selected assignment no longer exists. Refresh the overlaps list.');
    }
    if (!isOpenRow(raw.data())) {
      throw new AssignmentRuleError('KEEP_ALREADY_ENDED', 'The selected assignment has already been ended. Refresh the overlaps list.');
    }
    throw new AssignmentRuleError(
      'KEEP_WRONG_SLOT',
      `The selected assignment belongs to "${raw.data().subject}", not this slot. Refresh the overlaps list.`
    );
  }

  const keep = keepSnap.data();
  const kind = rowKind(keep);
  const toEnd = open.filter(d => {
    if (d.id === keepAssignmentId) return false;
    const x = d.data();
    return rowKind(x) === kind || x.teacherId === keep.teacherId;
  });
  const endingIds = new Set(toEnd.map(d => d.id));
  const remaining = open.filter(d => !endingIds.has(d.id));

  const warnings: string[] = [];
  const now = new Date();
  const isFT = normalizedSubject === FORM_TEACHER_SLOT;
  const slotId = slotIdForNormalized(classId, normalizedSubject);
  const batch = writeBatch(db);

  // 1) Archive the losers (merge → never fails on a missing/odd doc)
  for (const d of toEnd) {
    batch.set(
      d.ref,
      { status: 'ended', endReason: 'replaced', endDate: ts(now), updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  // 2) Normalise the kept row (backfills legacy fields)
  batch.set(
    keepSnap.ref,
    {
      status: 'active',
      endReason: null,
      normalizedSubject,
      slotId,
      roleType: keep.roleType || 'substantive',
      isFormTeacher: isFT && kind === 'owner',
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  // 3) Rebuild the slot from what remains open
  const ownerSnap = remaining.find(d => rowKind(d.data()) === 'owner') || null;
  const delegateSnap = remaining.find(d => rowKind(d.data()) === 'delegate') || null;
  const o = ownerSnap?.data();
  const g = delegateSnap?.data();

  if (g && !g.endDate) {
    warnings.push(
      `${g.teacherName || 'The covering teacher'} has no end date, so they won't have authority ` +
        `until you set one (re-assign the cover with dates).`
    );
  }
  if (g && !o) {
    warnings.push('This slot now has a cover/TP but no Primary Owner. Assign a primary teacher.');
  }

  batch.set(
    doc(db, SLOTS, slotId),
    {
      classId,
      className: (o || g || keep).className || '',
      subject: isFT ? FORM_TEACHER_SUBJECT : (o || g || keep).subject || '',
      normalizedSubject,
      isFormTeacherSlot: isFT,
      ...(o && ownerSnap
        ? {
            ownerAssignmentId: ownerSnap.id,
            ownerTeacherId: o.teacherId,
            ownerTeacherName: o.teacherName || null,
            ownerSince: o.startDate || o.assignedAt || o.createdAt || ts(now),
          }
        : NO_OWNER),
      ...(g && delegateSnap
        ? {
            delegateAssignmentId: delegateSnap.id,
            delegateTeacherId: g.teacherId,
            delegateTeacherName: g.teacherName || null,
            delegateRole: g.roleType,
            delegateStart: g.startDate || g.assignedAt || ts(now),
            delegateEnd: g.endDate || null,
          }
        : NO_DELEGATE),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  // 4) Form Teacher pointer on the class (merge: safe even if fields are missing)
  if (isFT) {
    batch.set(
      doc(db, 'classes', classId),
      {
        formTeacherId: o?.teacherId ?? null,
        formTeacherName: o?.teacherName ?? null,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  // 5) Audit
  batch.set(doc(collection(db, EVENTS)), {
    type: 'overlap-resolved',
    slotId,
    kind,
    keepAssignmentId,
    endedAssignmentIds: Array.from(endingIds),
    actorId: currentActor(),
    at: serverTimestamp(),
  });

  await batch.commit();

  // 6) Verify — fail loudly instead of "succeeding" with the overlap still there.
  const after = await getDocs(query(collection(db, ASSIGNMENTS), where('classId', '==', classId)));
  const stillOverlapping = after.docs.filter(
    d =>
      d.id !== keepAssignmentId &&
      isOpenRow(d.data()) &&
      rowNorm(d.data()) === normalizedSubject &&
      rowKind(d.data()) === kind
  );
  if (stillOverlapping.length > 0) {
    throw new AssignmentRuleError(
      'RESOLVE_INCOMPLETE',
      `${stillOverlapping.length} assignment(s) are still open on this slot ` +
        `(ids: ${stillOverlapping.map(d => d.id).join(', ')}). Check Firestore rules for teacher_assignments writes.`
    );
  }

  // 7) Membership caches (no-op before migration — see reconcileAfter)
  const teacherIds = open.map(d => d.data().teacherId as string);
  await reconcileAfter(teacherIds, [classId]);

  return { kept: toOverlapRow(keepSnap.id, keep), ended: toEnd.length, warnings };
}

// ==================== CACHE RECONCILIATION ====================

/** Rebuild users.assignedClasses + form-class pointers from slots. Idempotent. */
export async function reconcileTeacherMembership(teacherId: string): Promise<void> {
  const rows = await getSlotsForTeacher(teacherId);
  const now = new Date();
  const classIds = new Set<string>();
  let ft: ClassSlot | null = null;

  for (const { slot, relation } of rows) {
    if (relation === 'owner') {
      classIds.add(slot.classId);
      if (slot.isFormTeacherSlot) ft = slot;
    } else if (delegationState(slot, now) !== 'expired') {
      classIds.add(slot.classId);
    }
  }

  const ftSlot = ft as ClassSlot | null;
  await updateDoc(doc(db, 'users', teacherId), {
    assignedClasses: Array.from(classIds),
    ...(ftSlot ? formClassFields(ftSlot.classId, ftSlot.className) : NO_FORM_CLASS),
    updatedAt: serverTimestamp(),
  });
}

/** Rebuild classes.teachers + formTeacher pointer from slots. Idempotent. */
export async function reconcileClassMembership(classId: string): Promise<void> {
  const slots = await getSlotsForClass(classId);
  const now = new Date();
  const teachers = new Set<string>();
  let ft: ClassSlot | null = null;

  for (const s of slots) {
    if (s.ownerTeacherId) teachers.add(s.ownerTeacherId);
    if (s.delegateTeacherId && delegationState(s, now) !== 'expired') teachers.add(s.delegateTeacherId);
    if (s.isFormTeacherSlot) ft = s;
  }

  const ftSlot = ft as ClassSlot | null;
  await updateDoc(doc(db, 'classes', classId), {
    teachers: Array.from(teachers),
    formTeacherId: ftSlot?.ownerTeacherId ?? null,
    formTeacherName: ftSlot?.ownerTeacherName ?? null,
    updatedAt: serverTimestamp(),
  });
}

/** Best-effort cache repair after a committed transaction. Never throws. */
async function reconcileAfter(teacherIds: Array<string | null | undefined>, classIds: string[]) {
  // Before migrateToSlots() the slots are incomplete; rebuilding caches from
  // them would wipe classes.teachers / users.assignedClasses. Skip.
  try {
    const meta = await getDoc(META_REF());
    if (!meta.exists()) return;
  } catch {
    return;
  }
  const t = Array.from(new Set(teacherIds.filter((x): x is string => !!x)));
  const c = Array.from(new Set(classIds.filter(Boolean)));
  await Promise.all([
    ...t.map(id => reconcileTeacherMembership(id).catch(e => console.warn('reconcile teacher', id, e))),
    ...c.map(id => reconcileClassMembership(id).catch(e => console.warn('reconcile class', id, e))),
  ]);
}

// ==================== ONE-TIME MIGRATION ====================

export interface MigrationReport {
  slotsWritten: number;
  rowsNormalised: number;
  duplicateOwnersArchived: number;
  duplicateDelegatesArchived: number;
  delegatesWithoutEndDateClosed: number;
  orphanDelegates: string[];
  formTeacherFlagsCleared: number;
  dryRun: boolean;
}

/**
 * Build class_slots from existing teacher_assignments. Run ONCE, from an
 * admin-only tool, at a quiet time. Safe to re-run (it rebuilds slot docs from rows).
 *
 *   - suspended substantive rows → active (owners are never suspended now)
 *   - multiple open owners on a slot → newest kept, the rest archived ('replaced')
 *   - multiple open covers → the one ending last kept, the rest archived
 *   - covers with no end date → closed ('expired'); re-assign them with dates
 *   - isFormTeacher on subject rows → cleared
 */
export async function migrateToSlots(opts: { dryRun?: boolean } = {}): Promise<MigrationReport> {
  const dryRun = !!opts.dryRun;
  const report: MigrationReport = {
    slotsWritten: 0,
    rowsNormalised: 0,
    duplicateOwnersArchived: 0,
    duplicateDelegatesArchived: 0,
    delegatesWithoutEndDateClosed: 0,
    orphanDelegates: [],
    formTeacherFlagsCleared: 0,
    dryRun,
  };

  const all = await getDocs(collection(db, ASSIGNMENTS));
  const now = new Date();

  let batch = writeBatch(db);
  let ops = 0;
  const write = async (fn: (b: ReturnType<typeof writeBatch>) => void) => {
    if (dryRun) return;
    fn(batch);
    ops++;
    if (ops >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
  };

  type Row = { id: string; ref: DocumentReference; d: DocumentData; normalized: string; role: EngineRole };
  const groups = new Map<string, Row[]>();

  for (const snap of all.docs) {
    const d = snap.data();
    const normalized = d.normalizedSubject || toNormalized(d.subject || '');
    const role: EngineRole = d.roleType === 'tp' || d.roleType === 'leave-cover' ? d.roleType : 'substantive';
    const isFTRow = normalized === FORM_TEACHER_SLOT;
    const status = d.status || 'active';

    // Normalise every row, including history.
    const fix: Record<string, any> = {};
    if (!d.normalizedSubject) fix.normalizedSubject = normalized;
    if (!d.roleType) fix.roleType = role;
    if (!d.status) fix.status = 'active';
    if (!d.slotId && d.classId) fix.slotId = slotIdForNormalized(d.classId, normalized);
    if (!d.startDate && (d.assignedAt || d.createdAt)) fix.startDate = d.assignedAt || d.createdAt;
    if (d.isFormTeacher === true && !isFTRow) {
      fix.isFormTeacher = false;
      report.formTeacherFlagsCleared++;
    }
    if (status === 'suspended' && role === 'substantive') fix.status = 'active';

    if (Object.keys(fix).length) {
      report.rowsNormalised++;
      await write(b => b.set(snap.ref, { ...fix, updatedAt: serverTimestamp() }, { merge: true }));
    }

    if (status === 'ended' || !d.classId) continue;
    const key = slotIdForNormalized(d.classId, normalized);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ id: snap.id, ref: snap.ref, d, normalized, role });
  }

  const archive = (row: Row, reason: EngineEndReason) =>
    write(b =>
      b.set(row.ref, { status: 'ended', endReason: reason, endDate: ts(now), updatedAt: serverTimestamp() }, { merge: true })
    );

  const startOf = (r: Row) => (tsToDate(r.d.startDate) || tsToDate(r.d.assignedAt) || tsToDate(r.d.createdAt) || new Date(0)).getTime();

  for (const [slotId, rows] of groups) {
    const owners = rows
      .filter(r => r.role === 'substantive')
      .sort((a, b) => {
        // prefer previously-active over suspended, then newest
        const sa = (a.d.status || 'active') === 'active' ? 1 : 0;
        const sb = (b.d.status || 'active') === 'active' ? 1 : 0;
        return sb - sa || startOf(b) - startOf(a);
      });
    const delegates = rows
      .filter(r => r.role !== 'substantive' && (r.d.status || 'active') === 'active')
      .sort((a, b) => (tsToDate(b.d.endDate)?.getTime() ?? 0) - (tsToDate(a.d.endDate)?.getTime() ?? 0));

    const owner = owners[0] ?? null;
    for (const extra of owners.slice(1)) {
      report.duplicateOwnersArchived++;
      await archive(extra, 'replaced');
    }

    let delegate: Row | null = delegates[0] ?? null;
    for (const extra of delegates.slice(1)) {
      report.duplicateDelegatesArchived++;
      await archive(extra, 'replaced');
    }
    if (delegate && !delegate.d.endDate) {
      report.delegatesWithoutEndDateClosed++;
      await archive(delegate, 'expired');
      delegate = null;
    }
    if (delegate && !owner) report.orphanDelegates.push(slotId);

    const any = owner || delegate || rows[0];
    const normalized = any.normalized;
    const slotDoc: Record<string, any> = {
      classId: any.d.classId,
      className: any.d.className || '',
      subject: normalized === FORM_TEACHER_SLOT ? FORM_TEACHER_SUBJECT : any.d.subject || '',
      normalizedSubject: normalized,
      isFormTeacherSlot: normalized === FORM_TEACHER_SLOT,
      ...(owner
        ? {
            ownerAssignmentId: owner.id,
            ownerTeacherId: owner.d.teacherId,
            ownerTeacherName: owner.d.teacherName || null,
            ownerSince: owner.d.startDate || owner.d.assignedAt || owner.d.createdAt || ts(now),
          }
        : NO_OWNER),
      ...(delegate
        ? {
            delegateAssignmentId: delegate.id,
            delegateTeacherId: delegate.d.teacherId,
            delegateTeacherName: delegate.d.teacherName || null,
            delegateRole: delegate.role,
            delegateStart: delegate.d.startDate || delegate.d.assignedAt || ts(now),
            delegateEnd: delegate.d.endDate,
          }
        : NO_DELEGATE),
      updatedAt: serverTimestamp(),
    };

    if (delegate && owner) {
      await write(b =>
        b.set(delegate!.ref, { coversAssignmentId: owner.id, coversTeacherId: owner.d.teacherId }, { merge: true })
      );
    }
    report.slotsWritten++;
    await write(b => b.set(doc(db, SLOTS, slotId), slotDoc));
  }

  if (!dryRun) {
    batch.set(META_REF(), { migratedAt: serverTimestamp(), version: 1, report }, { merge: true });
    await batch.commit();

    // Rebuild caches for everyone.
    const [teachers, classes] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('userType', '==', 'teacher'))),
      getDocs(collection(db, 'classes')),
    ]);
    for (const t of teachers.docs) await reconcileTeacherMembership(t.id).catch(e => console.warn(e));
    for (const c of classes.docs) await reconcileClassMembership(c.id).catch(e => console.warn(e));
  }

  console.log('🧭 migrateToSlots report:', report);
  return report;
}