// @/services/timetableGenerator/types.ts
//
// Automatic timetable generator — shared types.
//
// The school week is fixed: Monday–Friday, P1–P8, with the break between P4
// and P5 (see SCHOOL_BELL in services/timetableModel). A lesson (single,
// double or triple) never crosses the break.
//
// What is stored in Firestore:
//   timetable_config/school        TimetableConfig — subjects per level
//                                   (periods a week, doubles, triples, time
//                                   of day, room), class exceptions, rooms,
//                                   fixed school events
//   timetable_signoffs/{y}_{t}_{d} AllocationSignoff — a HoD (or the admin)
//                                   says the department's allocations for the
//                                   term are complete
//   timetable_versions/{id}        TimetableVersion — a generated timetable
//                                   (draft → published → archived)
//   staff_roles/{uid}__timetabler   a HoD the admin allows to generate
//
// Publishing writes the lessons into timetable_entries (one row per period,
// status 'active'), which every existing screen already reads: My
// Timetable, Attendance Tracking, Now & Next, Who's Teaching, coverage.

import type { TermName } from '@/utils/academicTerm';

export type Weekday = 1 | 2 | 3 | 4 | 5;

export const DAYS: Weekday[] = [1, 2, 3, 4, 5];
export const PERIODS_PER_DAY = 8;
/** The break falls after this period. */
export const MORNING_LAST = 4;
export const CELLS = DAYS.length * PERIODS_PER_DAY; // 40

/** When in the day a subject may / should be taught. */
export type TimePreference = 'any' | 'prefer-morning' | 'morning-only';

export const TIME_LABEL: Record<TimePreference, string> = {
  any: 'Any time',
  'prefer-morning': 'Prefer mornings',
  'morning-only': 'Mornings only (P1–P4)',
};

/** One subject of a level: how it is to be timetabled. */
export interface SubjectRequirement {
  normalizedSubject: string;
  /** Display name. */
  subject: string;
  /** Periods a week that MUST be timetabled. */
  min: number;
  /** Periods a week wanted when there is room (≥ min). */
  max: number;
  /** How many of the periods are taught as doubles (2 periods together). */
  doubles: number;
  /** How many as triples (3 periods together). */
  triples: number;
  time: TimePreference;
  /** Avoid the last period of the day (P8). */
  notLast?: boolean;
  /** A special room the subject must use (lab…); two classes can't share it. */
  roomId?: string | null;
}

export interface LevelCurriculum {
  /** e.g. 'form-1', 'grade-10'. */
  key: string;
  /** e.g. 'Form 1'. */
  label: string;
  subjects: SubjectRequirement[];
}

/** A class that differs from its level for one subject. */
export interface ClassException {
  classId: string;
  normalizedSubject: string;
  /** The class does not take the subject. */
  excluded?: boolean;
  min?: number;
  max?: number;
  doubles?: number;
  triples?: number;
}

export interface Room {
  id: string;
  name: string;
}

/** A period kept free of lessons every week (assembly, clubs, sports…). */
export interface FixedEvent {
  id: string;
  name: string;
  days: Weekday[];
  periods: number[];
  /** Level keys it applies to; empty = the whole school. */
  levels: string[];
}

export interface TimetableConfig {
  levels: Record<string, LevelCurriculum>;
  exceptions: ClassException[];
  rooms: Room[];
  events: FixedEvent[];
  /** A teacher teaching more than this many periods in a day is avoided. */
  maxTeacherPeriodsPerDay: number;
  updatedBy?: string | null;
  updatedByName?: string | null;
}

export const EMPTY_CONFIG: TimetableConfig = {
  levels: {},
  exceptions: [],
  rooms: [],
  events: [],
  maxTeacherPeriodsPerDay: 6,
};

export interface AllocationSignoff {
  id: string;
  department: string;
  term: TermName;
  year: number;
  byUid: string;
  byName: string;
  /** 'hod' when the department's HoD signed off, 'admin' otherwise. */
  byRole: 'hod' | 'admin';
  at: Date | null;
  /** Vacant allocations at the time of sign-off (for the record). */
  vacantCount: number;
}

// ==================== PROBLEM (solver input) ====================

/** One class's subject: a class slot to be timetabled. */
export interface ProblemSlot {
  slotId: string;
  classId: string;
  className: string;
  levelKey: string;
  subject: string;
  normalizedSubject: string;
  /** Owner and live cover/TP teacher (both must be free). */
  teacherIds: string[];
  teacherNames: string[];
  roomId: string | null;
  min: number;
  max: number;
  doubles: number;
  triples: number;
  time: TimePreference;
  notLast: boolean;
}

export interface ProblemClass {
  id: string;
  name: string;
  levelKey: string;
  /** Cells (0..39) kept free by fixed events. */
  blocked: number[];
}

/** One lesson to place: `size` consecutive periods of one slot on one day. */
export interface Unit {
  id: number;
  slot: number; // index into Problem.slots
  size: 1 | 2 | 3;
  /** Extra periods (between min and max): placed only when there is room. */
  optional: boolean;
}

export interface Problem {
  term: TermName;
  year: number;
  classes: ProblemClass[];
  slots: ProblemSlot[];
  teachers: Array<{ id: string; name: string }>;
  rooms: Room[];
  units: Unit[];
  maxTeacherPeriodsPerDay: number;
}

export type IssueLevel = 'error' | 'warning';

export interface Issue {
  level: IssueLevel;
  message: string;
}

// ==================== RESULT ====================

/** A placed lesson. `start` is the first period (1..8). */
export interface PlacedLesson {
  slotId: string;
  classId: string;
  day: Weekday;
  start: number;
  size: number;
  locked?: boolean;
}

export interface UnplacedLesson {
  slotId: string;
  classId: string;
  className: string;
  subject: string;
  size: number;
  reason: string;
}

export interface SolveStats {
  required: number;
  placedRequired: number;
  optional: number;
  placedOptional: number;
  score: number;
  iterations: number;
  millis: number;
  seed: number;
}

export interface SolveResult {
  lessons: PlacedLesson[];
  unplaced: UnplacedLesson[];
  /** Preferences not met, worst first (for the review screen). */
  notes: string[];
  stats: SolveStats;
}

// ==================== VERSIONS ====================

export type VersionStatus = 'draft' | 'published' | 'archived';

/** Per-slot details stored with a version, so it renders without lookups. */
export interface VersionSlotInfo {
  classId: string;
  className: string;
  subject: string;
  normalizedSubject: string;
  roomName: string | null;
}

export interface TimetableVersion {
  id: string;
  name: string;
  term: TermName;
  year: number;
  status: VersionStatus;
  lessons: PlacedLesson[];
  slots: Record<string, VersionSlotInfo>;
  unplaced: UnplacedLesson[];
  notes: string[];
  stats: SolveStats | null;
  createdBy: string;
  createdByName: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  publishedBy: string | null;
  publishedByName: string | null;
  publishedAt: Date | null;
  /** 'YYYY-MM-DD' the published timetable took effect. */
  effectiveFrom: string | null;
}
