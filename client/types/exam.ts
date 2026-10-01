// @/types/exam.ts
import type { TermName } from '@/utils/academicTerm';

// Re-export for convenience so consumers can import from one place
export type { TermName } from '@/utils/academicTerm';

// ─────────────────────────────────────────────────────────────────────────────
// Exam Configuration
// ─────────────────────────────────────────────────────────────────────────────

export interface ExamConfig {
  id: string;

  /** Term name — one of 'Term 1' | 'Term 2' | 'Term 3' */
  term: TermName;

  /**
   * Academic year this config belongs to.
   * For Term 3, this is the year the term STARTED (e.g. Sept 2025 → Jan 2026
   * is "Term 3, 2025").
   */
  year: number;

  /** Which exam types are enabled for this term */
  examTypes: {
    week4: boolean;
    week8: boolean;
    endOfTerm: boolean;
  };

  // ── Exam dates (ISO strings) ───────────────────────────────────────────
  week4Date?: string;
  week8Date?: string;
  endOfTermDate?: string;

  // ── Total marks per exam type ──────────────────────────────────────────
  week4TotalMarks?: number;
  week8TotalMarks?: number;
  endOfTermTotalMarks?: number;

  // ── Lifecycle ──────────────────────────────────────────────────────────
  isActive: boolean;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;

  // ── NEW: Term window metadata (derived from academic calendar) ─────────
  /**
   * First day of the academic term (inclusive).
   * Populated by `examConfigService` when reading configs, so the UI can
   * display "Term 2 runs May 1 – Aug 31" without recomputing.
   */
  termStartDate?: Date;

  /**
   * Last day of the academic term (inclusive).
   * For Term 3, this falls in January of the following calendar year.
   */
  termEndDate?: Date;

  /**
   * Full display label, e.g. "Term 2 2025".
   * Convenience field — same as `formatTermLabel(term, year)`.
   */
  termLabel?: string;

  /**
   * Short display label, e.g. "T2 2025".
   * Convenience field for compact UI badges.
   */
  termShortLabel?: string;

  /**
   * Whether this config is for the currently active academic term.
   * Computed by the service at read-time so components can render a
   * "Current Term" badge without an extra hook call.
   */
  isCurrentTerm?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filters
// ─────────────────────────────────────────────────────────────────────────────

export interface ExamConfigFilters {
  year?: number;
  term?: TermName;
  isActive?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived / helper types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A fully-resolved exam config with all term metadata populated.
 * Returned by service methods that enrich raw Firestore data.
 */
export type ResolvedExamConfig = ExamConfig & {
  termStartDate: Date;
  termEndDate: Date;
  termLabel: string;
  termShortLabel: string;
  isCurrentTerm: boolean;
};

/**
 * Partial input for creating a new exam config.
 * `id`, `createdAt`, `updatedAt`, and all derived term-metadata fields
 * are managed by the service and must not be supplied by callers.
 */
export type ExamConfigInput = Omit<
  ExamConfig,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'termStartDate'
  | 'termEndDate'
  | 'termLabel'
  | 'termShortLabel'
  | 'isCurrentTerm'
>;

/**
 * Partial input for updating an existing exam config.
 * All fields are optional.
 */
export type ExamConfigUpdate = Partial<ExamConfigInput>;

/**
 * Convenience type: the minimal identity of a term config.
 * Useful for keys, routing, and lightweight state.
 */
export interface ExamConfigIdentity {
  term: TermName;
  year: number;
}