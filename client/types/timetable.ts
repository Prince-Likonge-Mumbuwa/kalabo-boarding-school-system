// @/types/timetable.ts
//
// ============================================================================
//  TIMETABLE DOMAIN TYPES
// ============================================================================
//
//  DESIGN NOTES
//  ────────────
//  A timetable entry is keyed to a SLOT (class_slots doc id), never to a
//  teacher. This makes cover / TP / new-assignment changes automatically
//  reflected everywhere: authority over a slot is resolved at read time via
//  assignmentEngine.resolveAuthority(slot, now). No timetable write is ever
//  needed when an assignment changes — the teacher who actually teaches a
//  slot right now simply inherits that slot's periods.
//
//  Rows are keyed by (term, year) using the TermName from
//  @/utils/academicTerm. `year` is the academic year the term STARTED in,
//  so Term 3 2025 = Sep 2025 → Jan 2026. This matches the rest of the
//  system (attendance, results, report cards).
//
//  APPROVAL WORKFLOW
//  ─────────────────
//  Teacher submits   → rows written with status 'pending'
//  Admin approves    → previous 'active' rows archived, pending promoted
//  Admin rejects     → pending marked 'rejected' with a reason
//  Teacher edits     → rows start in 'draft' until submitted
//
//  Only 'active' rows drive MyTimetable, the attendance picker, and
//  coverage reporting.
// ============================================================================

import type { Timestamp } from 'firebase/firestore';
import type { TermName } from '@/utils/academicTerm';
import type { DelegateRole, DelegationState } from '@/services/assignmentEngine';

// ==================== PERIODS ====================

export type PeriodKind = 'lesson' | 'break' | 'assembly' | 'lunch';

/**
 * One row of the daily bell schedule.
 *
 * `order` is the integer used as `period` in attendance sessions and as
 * `periodIndex` on timetable rows, so the two systems share a single
 * numbering. Never reuse an order — breaks and assemblies also occupy a
 * slot so a lesson can never be scheduled over them.
 */
export interface Period {
  id: string;
  /** 1..n, unique per academic year. */
  order: number;
  /** Short label shown in the grid: 'P1', 'Break', 'Lunch'. */
  name: string;
  /** 'HH:mm' local time, 24-hour. */
  startTime: string;
  /** 'HH:mm' local time, 24-hour. */
  endTime: string;
  kind: PeriodKind;
  academicYear: number;
  isActive: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface PeriodDraft {
  /** Undefined when creating a new period. */
  id?: string;
  order: number;
  name: string;
  startTime: string;
  endTime: string;
  kind: PeriodKind;
  academicYear: number;
  isActive: boolean;
}

// ==================== SCHOOL HOLIDAYS ====================

export type HolidayKind = 'public' | 'school' | 'exam-week';

/**
 * One holiday window. `startDate` and `endDate` are local 'YYYY-MM-DD'
 * strings (inclusive). A single-day holiday has startDate === endDate.
 *
 * In-lieu Mondays are stored as separate rows with "(in lieu)" in the
 * name, so both the real date and the observed date block teaching.
 */
export interface SchoolHoliday {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  kind: HolidayKind;
  createdBy: string | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface HolidayDraft {
  id?: string;
  name: string;
  startDate: string;
  endDate: string;
  kind: HolidayKind;
}

// ==================== TIMETABLE ENTRIES ====================

/**
 *   draft    — teacher is editing, never visible to admin as pending
 *   pending  — teacher submitted; awaiting admin approval; the previous
 *              `active` version (if any) stays live until approval
 *   active   — approved; drives MyTimetable, attendance picker, coverage
 *   rejected — set when an admin rejects a pending submission
 *
 * Rejected rows keep `rejectedReason` and stay visible to the teacher so
 * they can fix and resubmit.
 */
export type TimetableEntryStatus = 'draft' | 'pending' | 'active' | 'rejected';

/**
 * One timetable slot: "this SLOT runs on this day in this period, for
 * this term". Not attached to a teacher — the engine decides who operates
 * the slot right now.
 */
export interface TimetableEntry {
  id: string;
  /** class_slots/{slotId}. The authority unit. */
  slotId: string;

  // Denormalized for direct queries without a slot lookup.
  classId: string;
  className: string;
  subject: string;
  normalizedSubject: string;

  term: TermName;
  /** Academic year the term STARTED in. */
  year: number;

  /** 1=Mon … 5=Fri. */
  dayOfWeek: 1 | 2 | 3 | 4 | 5;
  /** Matches `Period.order` and `attendance_sessions.period`. */
  periodIndex: number;
  /** When true, occupies `periodIndex` AND `periodIndex + 1`. One session. */
  isDouble: boolean;

  status: TimetableEntryStatus;

  /**
   * Groups all rows written in one submit call. Optional: legacy rows
   * may lack it. Used by the admin approval queue to reconstruct the
   * batch that was submitted together.
   */
  batchId?: string;

  submittedByUid: string | null;
  submittedAt: Timestamp | null;
  approvedByUid: string | null;
  approvedAt: Timestamp | null;
  rejectedReason: string | null;

  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

/**
 * Input shape for a submit request. `slotId` must be a slot the submitting
 * teacher currently has operational authority over (owner OR live delegate).
 * Denormalized fields are filled by the service from the slot doc.
 */
export interface TimetableEntryInput {
  slotId: string;
  dayOfWeek: 1 | 2 | 3 | 4 | 5;
  periodIndex: number;
  isDouble: boolean;
}

// ==================== RESOLVED VIEW (READ-TIME) ====================

/**
 * A timetable row with live authority resolved at read time.
 * `operatorTeacherId` is who actually teaches this slot right now — may be
 * the owner, a live cover, or a live TP delegate.
 *
 * This is the shape that makes "auto-adjust on cover / new assignment"
 * work with zero timetable writes.
 */
export interface ResolvedTimetableEntry {
  entry: TimetableEntry;

  /** Snapshot of the owning teacher at resolution time. */
  ownerTeacherId: string | null;
  ownerTeacherName: string | null;

  /** Who teaches right now. */
  operatorTeacherId: string | null;
  operatorTeacherName: string | null;
  operatorRole: 'owner' | DelegateRole | null;

  delegationState: DelegationState;
  delegateUntil: Date | null;

  /** True if `operatorTeacherId` is a delegate (cover or TP). */
  isCoveredNow: boolean;

  /** Resolved period metadata, for display. Null if the period was deleted. */
  period: Period | null;
}

/**
 * One row of a teacher's weekly grid, ready to render.
 * Same shape as `ResolvedTimetableEntry`, kept as an alias so the teacher
 * UI can read from a semantically-named type.
 */
export type TeacherTimetableRow = ResolvedTimetableEntry;

// ==================== CONFLICTS ====================

export type ConflictKind =
  | 'teacher-clash'      // same teacher, same day+period, two different slots
  | 'class-clash'        // same class, same day+period, two different slots
  | 'double-overlap'     // a double period overlaps a single period
  | 'holiday';           // entry lands on a holiday (warning only, allowed)

export interface TimetableConflict {
  kind: ConflictKind;
  /** Human-readable summary for the UI. */
  message: string;
  /** Every entry id involved in the conflict. */
  entryIds: string[];
  /** Populated for teacher/class/double clashes; null for holiday warnings. */
  dayOfWeek: 1 | 2 | 3 | 4 | 5 | null;
  periodIndex: number | null;
  /** Holiday info, when kind === 'holiday'. */
  holidayId?: string;
  holidayName?: string;
  holidayDate?: string;
}

// ==================== COVERAGE (ADMIN MONITORING) ====================

/**
 * One row of the admin coverage table: for one class on one date,
 * "what was scheduled vs what was actually marked".
 */
export interface CoverageRow {
  classId: string;
  className: string;

  /** Entries active on this class today (weekday match, holiday-excluded). */
  expectedEntries: ResolvedTimetableEntry[];
  expectedCount: number;

  /** Sessions found in attendance_sessions for this class + date. */
  markedSessions: Array<{
    period: number;
    subject: string;
    normalizedSubject: string;
    markedBy: string;
    markedByName: string;
  }>;
  markedCount: number;

  /** Expected entries with no corresponding session doc yet. */
  missingEntries: ResolvedTimetableEntry[];
  missingCount: number;

  /** Coverage rate 0..100. 100 when expectedCount === 0 (nothing scheduled). */
  coverageRate: number;
}

/**
 * Coverage grouped by teacher, for the "uncovered periods" admin view.
 */
export interface TeacherCoverageRow {
  teacherId: string;
  teacherName: string;
  status: 'active' | 'inactive' | 'on_leave' | 'transferred';

  /** Slots they operate today (owner or live delegate). */
  expectedEntries: ResolvedTimetableEntry[];
  expectedCount: number;

  markedCount: number;
  missingEntries: ResolvedTimetableEntry[];
  missingCount: number;
  coverageRate: number;

  /** True if some of their owned slots have no live cover and no timetable. */
  hasUncoveredSlots: boolean;
}

// ==================== PENDING SUBMISSIONS (ADMIN APPROVAL QUEUE) ====================

/**
 * A batch of pending rows submitted at once by a teacher. Grouped by
 * (submittedByUid, submittedAt) since that identifies the batch.
 */
export interface PendingSubmission {
  /** Deterministic id: `${submittedByUid}__${submittedAtMs}`. */
  id: string;
  submittedByUid: string;
  submittedByName: string;
  submittedAt: Date;

  /** Entries in this submission batch. */
  entries: TimetableEntry[];

  /** Classes affected by this batch. */
  classIds: string[];
  classNames: string[];

  term: TermName;
  year: number;

  /** Detected conflicts on this batch (empty = clean). */
  conflicts: TimetableConflict[];
}

// ==================== REQUEST / RESPONSE SHAPES ====================

export interface SubmitTimetableRequest {
  /**
   * When set, only these classIds are replaced by this submission.
   * When null, ALL of the teacher's classes for the term are replaced
   * (the "Submit all my classes" flow).
   */
  classIdsFilter: string[] | null;

  term: TermName;
  year: number;

  /** Every entry the teacher wants live in this term (for the filtered set). */
  entries: TimetableEntryInput[];
}

export interface SubmitTimetableResult {
  /** Batch id of the pending submission. */
  submissionId: string;
  submittedCount: number;
  /** Number of previously-pending rows this submission replaced. */
  replacedPendingCount: number;
  /** Conflicts detected on this submission. Non-empty = admin must review. */
  conflicts: TimetableConflict[];
}

export interface ApproveTimetableResult {
  submissionId: string;
  approvedCount: number;
  /** Rows archived because they were replaced by this approval. */
  archivedCount: number;
}

export interface RejectTimetableResult {
  submissionId: string;
  rejectedCount: number;
}

// ==================== RE-EXPORTS ====================

// Consumers of this file often need these; re-export so they can import
// everything timetable-related from a single module.
export type { TermName, DelegateRole, DelegationState };