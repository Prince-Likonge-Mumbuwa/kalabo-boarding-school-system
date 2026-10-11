// @/types/promotion.ts
//
// Year transition (promotion) types.
//
// Model
// ─────
// Classes are STREAMS that persist from year to year ("Form 2A" is the same
// class document every year). Learners move between streams when a new
// academic year begins. Their Firestore document id never changes, so every
// result, attendance register and SBA record stays linked to them.
//
// Because a stream holds a different cohort each year, the learners a class
// had in a CLOSED year are recorded in `enrollments` when the year is closed.
// Screens that look at a past year (report cards, results entry for a late
// Term 3, data check, parent portal) read that snapshot instead of the
// class's current learners.

export type PromotionAction =
  /** Move up to the next level (or into a chosen class). */
  | 'promote'
  /** Stay at the same level for another year (same class unless moved). */
  | 'repeat'
  /** Completed the final year (Grade 12 / final Form). */
  | 'graduate'
  /** Leaves the school at year end (transfer out, withdrawal, …). */
  | 'leave'
  /** Already belongs to the new year (e.g. admitted early for the new
   *  year). Kept where they are, only stamped with the new year. */
  | 'stay';

export type EnrollmentOutcome = 'promoted' | 'repeated' | 'graduated' | 'left' | 'continuing';

export interface ClassRef {
  id: string;
  name: string;
  type: 'grade' | 'form';
  level: number;
  section: string;
  isActive: boolean;
  /** Active learners currently in the class. */
  learnerCount: number;
}

/** A class the run has to create, e.g. the first "Form 4A". */
export interface NewClassSpec {
  /** Temporary id used in the plan until the class exists: `new:form-4-A`. */
  tempId: string;
  name: string;
  type: 'grade' | 'form';
  level: number;
  section: string;
}

/** Where a source class's learners go by default. */
export type ClassDestination =
  | { kind: 'class'; classId: string }   // existing or new (tempId) class
  | { kind: 'graduate' };

export interface PromotionSettings {
  fromYear: number;
  toYear: number;
  /** Final Form level; learners in it graduate. Default 4 (O-level). */
  finalFormLevel: number;
  /** Final Grade level; learners in it graduate. Default 12. */
  finalGradeLevel: number;
}

/** One learner's decision, as chosen in the wizard. */
export interface LearnerDecision {
  action: PromotionAction;
  /** Destination for promote/repeat/stay. Defaults from the class map. */
  toClassId?: string;
  /** Free text kept on the learner for 'leave' (e.g. "Transferred to …"). */
  reason?: string;
}

/** Snapshot of a learner as the planner needs it. */
export interface PlanLearner {
  id: string;
  fullName: string;
  gender?: string;
  studentId: string;
  studentIndex?: number;
  classId: string;
  status?: string;
  /** Year the learner's current placement belongs to (absent on old records). */
  academicYear?: number;
  /** YYYY-MM-DD from the admission form. */
  dateOfFirstEntry?: string;
}

/** One line of the executable plan. */
export interface PlanItem {
  learnerId: string;
  fullName: string;
  gender?: string;
  action: PromotionAction;
  outcome: EnrollmentOutcome;

  fromClassId: string;
  fromClassName: string;
  fromStudentId: string;
  fromStudentIndex: number;

  /** Destination (equal to `from…` for graduate/leave). May be a tempId. */
  toClassId: string;
  toClassName: string;
  toStudentId: string;
  toStudentIndex: number;
  reason?: string;
}

export type PlanIssueLevel = 'error' | 'warning' | 'info';

export interface PlanIssue {
  level: PlanIssueLevel;
  message: string;
  classId?: string;
  learnerId?: string;
}

export interface PlanClassSummary {
  classId: string;   // may be a tempId
  name: string;
  type: 'grade' | 'form';
  level: number;
  isNew: boolean;
  /** Learners in the class before the move. */
  before: number;
  /** Learners in the class after the move. */
  after: number;
  incoming: number;
  outgoing: number;
  staying: number;
}

export interface PromotionPlan {
  settings: PromotionSettings;
  items: PlanItem[];
  newClasses: NewClassSpec[];
  /** Classes with nobody in them after the move. */
  emptyAfter: string[];
  classSummaries: PlanClassSummary[];
  issues: PlanIssue[];
  /** Learners left out of the plan (already in the new year, or unplaced). */
  skipped: Array<{ learnerId: string; fullName: string; reason: string }>;
  counts: Record<PromotionAction, number>;
}

export type PromotionRunStatus = 'running' | 'completed' | 'failed' | 'reverted';

/** `promotion_runs/{fromYear}-{toYear}` */
export interface PromotionRun {
  id: string;
  fromYear: number;
  toYear: number;
  status: PromotionRunStatus;
  settings: PromotionSettings;
  /** Loaded from `promotion_run_items` chunks. */
  items: PlanItem[];
  itemCount?: number;
  newClasses: NewClassSpec[];
  /** tempId → real class id, filled as classes are created. */
  createdClassIds: Record<string, string>;
  /** Classes the admin chose to archive (only archived if empty). */
  requestedArchiveIds?: string[];
  archivedClassIds: string[];
  /** Archived classes brought back into use as destinations. */
  reactivatedClassIds?: string[];
  /** Classes whose `year` was moved to toYear (restored on undo). */
  yearUpdatedClassIds: string[];
  classYearBefore?: Record<string, number | null>;
  warnings?: string[];
  undoWarnings?: string[];
  counts: Record<PromotionAction, number>;
  sbaMoved?: number;
  startedAt?: any;
  completedAt?: any;
  revertedAt?: any;
  startedBy?: string;
  startedByName?: string;
  error?: string;
}

/** `enrollments/{learnerId}_{year}` — the learner's class in a closed year. */
export interface Enrollment {
  learnerId: string;
  year: number;
  classId: string;
  className: string;
  classType?: 'grade' | 'form';
  classLevel?: number;
  classSection?: string;
  /** The custom id the learner had in that year (e.g. F1A_007). */
  studentId: string;
  studentIndex?: number;
  fullName: string;
  gender?: string;
  outcome: EnrollmentOutcome;
  nextClassId?: string | null;
  nextClassName?: string | null;
  nextStudentId?: string | null;
  /** True once the year has been closed by a promotion run. */
  closed: boolean;
  runId: string;
  /** SBA documents moved for this learner: [oldId, newId, oldClassId, oldClassName, oldForm] */
  sbaMoves?: Array<{ fromId: string; toId: string; classId: string; className: string; form: string }>;
  createdAt?: any;
}

/** `system/academicYear` */
export interface AcademicYearState {
  currentYear: number;
  lastRunId?: string;
  updatedAt?: any;
}
