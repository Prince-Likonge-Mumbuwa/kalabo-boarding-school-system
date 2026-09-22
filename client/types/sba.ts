// @/types/sba.ts
// SBA (School Based Assessment) types for ECSEOL 2026
// Aligned to ECZ Assessment Schemes + Kalabo CPD (Conducting SBA ECSEOL 2026)
//
// v2 — Per-task mark entry
//   Marks are entered per task. Task marks aggregate to a per-form total,
//   form totals aggregate to the SBA raw score, which weights into the
//   final SBA contribution (30%, 40%, or 50% of the subject).

export type SbaForm = 'form1' | 'form2' | 'form3';
export type SbaStatus = 'draft' | 'submitted' | 'locked';
export type SbaCategory =
  | 'languages'
  | 'social'
  | 'maths-sciences'
  | 'creative'
  | 'computing'
  | 'business';

// ==================== CONFIG ====================

export interface SbaConfig {
  id: string;                       // subjectCode, e.g. "1021"
  subjectCode: string;
  subjectName: string;              // "English Language"
  aliases: string[];                // ["English", "Eng"]
  category: SbaCategory;

  // Weighting
  sbaWeightPercent: 30 | 40 | 50;
  examWeightPercent: 70 | 60 | 50;

  // Which forms have SBA
  sbaForms: SbaForm[];

  // Task metadata (from CPD)
  // tasksPerForm: how many tasks the subject requires per form
  // marksPerForm: the form total (usually 100, but D&T is 45, Art is 100, etc.)
  tasksPerForm: {
    form1: number | null;
    form2: number | null;
    form3: number | null;
  };
  marksPerForm: {
    form1: number | null;
    form2: number | null;
    form3: number | null;
  };

  // Project (folded into a form's total; metadata only — not tracked separately)
  hasProject: boolean;
  projectForm?: 'form2' | 'form3';
  projectMarks?: number;

  // Totals
  sbaRawMax: number;                // sum of marksPerForm
  finalExamMarks: number;           // 100 (raw)
  finalExamDuration: string;        // "2h 30min"

  // Meta
  notes?: string;
  seeded: boolean;
  createdAt: string;
  updatedAt: string;
}

// ==================== PER-TASK COMPUTATION (PURE) ====================

/**
 * Status of a single form's task aggregation.
 *   complete      → all tasks have valid marks
 *   partial       → some tasks entered, none absent/not-conducted
 *   absent        → at least one task marked absent (-1)
 *   not_conducted → at least one task marked not conducted (-2)
 *   empty         → no tasks entered
 */
export type FormTaskStatus =
  | 'complete'
  | 'partial'
  | 'absent'
  | 'not_conducted'
  | 'empty';

/**
 * Result of aggregating a form's task marks.
 * `total` = sum of valid task marks (0 if any absent/not-conducted).
 * `max`   = sum of per-task full marks.
 */
export interface FormTaskResult {
  total: number;
  max: number;
  status: FormTaskStatus;
  enteredCount: number;
  absentCount: number;
  notConductedCount: number;
}

// ==================== RESULT ====================

export interface SbaResult {
  id: string;                       // `${studentDocumentId}_${subjectId}_${examYear}`

  // Identity — student
  studentId: string;                // Firestore document ID (for queries)
  customStudentId: string;          // G10B_001 (for display)
  studentName: string;
  classId: string;
  className: string;
  form: string;                     // current form of student

  // Identity — subject
  subjectId: string;                // normalized
  subjectName: string;
  subjectCode: string;              // "1021"
  teacherId: string;
  teacherName: string;

  // Raw form totals (derived from task arrays on save).
  //   >= 0 → numeric form total
  //   -1   → absent (any task marked absent)
  //   -2   → not conducted (any task marked not conducted)
  //   null → not yet a valid form total (partial or empty)
  form1Mark: number | null;
  form2Mark: number | null;
  form3Mark: number | null;

  // Task-level marks (persisted for audit + UI rehydration).
  // Length matches config.tasksPerForm[form] at save time.
  // Values: 0..taskMax for valid, -1 = absent, -2 = not conducted.
  form1Tasks: number[];
  form2Tasks: number[];
  form3Tasks: number[];

  // Computed at save time (audit trail)
  sbaRawTotal: number;
  sbaRawMax: number;
  sbaRawPercentage: number;         // -1 if incomplete
  sbaWeightPercent: number;
  weightedSbaScore: number;         // out of sbaWeightPercent, e.g. 26.25
  sbaOnlyCompetencyLevel: number;   // 1–5, or -1
  sbaOnlyCompetencyLabel: string;

  // Meta
  examYear: number;                 // year candidate sits Form 4
  status: SbaStatus;
  createdAt: string;
  updatedAt: string;
}

// ==================== COMPUTATION ====================

/**
 * Input accepted by `computeSbaTotals`.
 * Only form totals — the per-task aggregation happens before this step.
 */
export interface SbaMarksInput {
  form1Mark: number | null;
  form2Mark: number | null;
  form3Mark: number | null;
}

export interface SbaComputed {
  sbaRawTotal: number;
  sbaRawMax: number;
  sbaRawPercentage: number;         // -1 if incomplete or absent
  weightedSbaScore: number;         // -1 if incomplete or absent
  sbaOnlyCompetencyLevel: number;   // -1 if incomplete
  sbaOnlyCompetencyLabel: string;
  hasAnyMissing: boolean;
  hasAnyAbsent: boolean;
}

// ==================== SAVE INPUT ====================

/**
 * A single student's payload for `saveSbaMarks`.
 *
 * Preferred: send `formNTasks` arrays. The service aggregates them into
 * form totals, using `defaultPerTaskMarks()` for the per-task maxima.
 *
 * Legacy: send `formNMark` scalars directly. The service treats them as
 * pre-computed form totals. Used only by callers that haven't migrated.
 *
 * If both are sent, task arrays win.
 */
export interface SaveSbaStudentInput {
  studentId: string;                // custom or document — resolver handles both
  studentName: string;

  // Per-task marks (preferred). Values: 0..taskMax, or -1/-2, or null.
  form1Tasks?: Array<number | null>;
  form2Tasks?: Array<number | null>;
  form3Tasks?: Array<number | null>;

  // Legacy form totals (fallback). Values: 0..formMax, or -1/-2, or null.
  form1Mark?: number | null;
  form2Mark?: number | null;
  form3Mark?: number | null;
}

export interface SaveSbaInput {
  classId: string;
  className: string;
  subjectId: string;                // normalized
  subjectName: string;
  subjectCode: string;
  teacherId: string;
  teacherName: string;
  examYear: number;
  students: SaveSbaStudentInput[];
  overwrite?: boolean;
}

export interface SaveSbaResult {
  success: boolean;
  count: number;
  overwritten: boolean;
  results: SbaResult[];
}

export interface DeleteSbaInput {
  classId: string;
  subjectId: string;
  examYear: number;
}

// ==================== COMPLETION ====================

export interface SbaSubjectCompletion {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  teacherId: string;
  teacherName: string;
  classId: string;
  className: string;
  examYear: number;

  totalStudents: number;

  // Students with any form mark entered
  enteredStudents: number;
  // Students with ALL required forms entered (non-null)
  completeStudents: number;

  // Per-form entry counts
  enteredByForm: {
    form1: number;
    form2: number;
    form3: number;
  };

  percentComplete: number;           // completeStudents / totalStudents * 100

  // Averages across students who have a valid SBA percentage
  avgSbaRawPercentage: number;       // -1 if none

  // Level distribution (level 1–5 → count of students)
  levelDistribution: Record<number, number>;

  // Student document IDs that have any entry (for lookup)
  enteredStudentIds: string[];
}

export interface SbaClassCompletion {
  classId: string;
  className: string;
  totalStudents: number;
  subjects: SbaSubjectCompletion[];
  overallPercentComplete: number;    // average across subjects
}

// ==================== SCHOOL OVERVIEW ====================

export interface SbaSchoolOverviewRow {
  classId: string;
  className: string;
  totalStudents: number;
  subjectsTracked: number;
  subjectsComplete: number;          // subjects with 100% student entries
  overallPercentComplete: number;
  avgSbaRawPercentage: number;       // -1 if no data
  levelDistribution: Record<number, number>;
}

export interface SbaSchoolOverview {
  examYear: number;
  totalClasses: number;
  totalStudents: number;
  totalSbaRecords: number;
  overallPercentComplete: number;
  avgSbaRawPercentage: number;
  levelDistribution: Record<number, number>;
  perClass: SbaSchoolOverviewRow[];
  // Subjects with zero entries (red flag)
  subjectsWithZeroEntries: Array<{
    classId: string;
    className: string;
    subjectId: string;
    subjectName: string;
    teacherName: string;
  }>;
}