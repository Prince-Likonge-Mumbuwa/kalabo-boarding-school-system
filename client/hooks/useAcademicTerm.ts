// @/hooks/useAcademicTerm.ts
import { useMemo, useState, useEffect } from 'react';
import {
  getCurrentAcademicTerm,
  getPreviousAcademicTerm,
  getNextAcademicTerm,
  getAllTermsForYear,
  getAllTermsForRange,
  getTermByName,
  getDaysRemainingInTerm,
  getTermProgressPercentage,
  getTermDescription,
  isCurrentTerm,
  formatTermLabel,
  type AcademicTermInfo,
  type TermName,
} from '@/utils/academicTerm';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface UseAcademicTermOptions {
  /**
   * If `true`, the hook will schedule a check at the start of each new day
   * (midnight) and re-render if the academic term has changed. This keeps
   * long-lived dashboards in sync across month boundaries without a manual
   * refresh.
   *
   * Default: `true`
   */
  watchForChanges?: boolean;

  /**
   * Optional override date. When provided, all computed values are based on
   * this date instead of `new Date()`. Useful for testing or for previewing
   * historical/ future terms.
   */
  date?: Date;
}

export interface UseAcademicTermReturn {
  // ── Current term (primary data) ────────────────────────────────────────
  /** Full info about the current academic term */
  current: AcademicTermInfo;
  /** Convenience: current term name, e.g. "Term 2" */
  term: TermName;
  /** Convenience: current academic year, e.g. 2025 */
  year: number;
  /** Convenience: full label, e.g. "Term 2 2025" */
  label: string;
  /** Convenience: short label, e.g. "T2 2025" */
  shortLabel: string;

  // ── All terms for the current academic year ────────────────────────────
  /** All 3 terms of the current academic year (for dropdowns) */
  availableTerms: AcademicTermInfo[];

  // ── Term navigation helpers ────────────────────────────────────────────
  /** Get the previous academic term (handles year rollover) */
  getPrevious: () => AcademicTermInfo;
  /** Get the next academic term (handles year rollover) */
  getNext: () => AcademicTermInfo;
  /** Look up a specific term by name (within the current academic year) */
  getByName: (term: TermName, year?: number) => AcademicTermInfo | null;

  // ── Term timing helpers ────────────────────────────────────────────────
  /** Days remaining in the current term (0 if outside the window) */
  daysRemaining: number;
  /** Progress through the current term, 0–100 */
  progressPercentage: number;
  /** Human-readable description, e.g. "Term 2 2025 • Week 3 of 16" */
  description: string;

  // ── Utility ────────────────────────────────────────────────────────────
  /** Check whether a given term/year pair is the current one */
  isCurrent: (term: string, year: number) => boolean;
  /** Format an arbitrary term label */
  format: (term: string, year: number) => string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * React hook that provides real-time academic term information.
 *
 * By default, the hook computes the current term on every render from
 * `new Date()`. When `watchForChanges` is enabled (default), it also
 * schedules a timer to re-render at the next local midnight so the
 * term auto-updates across month boundaries (e.g. April 30 → May 1).
 *
 * @example
 * ```tsx
 * const { term, year, label, daysRemaining } = useAcademicTerm();
 *
 * return (
 *   <div>
 *     <h2>{label}</h2>
 *     <p>{daysRemaining} days remaining</p>
 *   </div>
 * );
 * ```
 */
export function useAcademicTerm(
  options: UseAcademicTermOptions = {}
): UseAcademicTermReturn {
  const { watchForChanges = true, date: dateOverride } = options;

  // ── "Tick" state forces re-render when the day changes ─────────────────
  // We don't store the date itself — we just bump this counter to trigger
  // a fresh `getCurrentAcademicTerm()` computation.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!watchForChanges || dateOverride) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleNextMidnight = () => {
      const now = new Date();
      const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
        0, 0, 1, 0 // 1 second past midnight to be safe
      );
      const msUntilMidnight = nextMidnight.getTime() - now.getTime();

      timeoutId = setTimeout(() => {
        setTick(t => t + 1);          // force re-render
        scheduleNextMidnight();        // reschedule for the next day
      }, msUntilMidnight);
    };

    scheduleNextMidnight();

    return () => clearTimeout(timeoutId);
  }, [watchForChanges, dateOverride]);

  // ── Compute current term ───────────────────────────────────────────────
  // Recomputes on every render. Cheap (a few Date operations).
  const current = useMemo<AcademicTermInfo>(
    () => getCurrentAcademicTerm(dateOverride),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dateOverride, /* tick via re-render */]
  );

  // ── All terms for the current academic year ────────────────────────────
  const availableTerms = useMemo<AcademicTermInfo[]>(
    () => getAllTermsForYear(current.year),
    [current.year]
  );

  // ── Timing helpers ─────────────────────────────────────────────────────
  const daysRemaining = useMemo(
    () => getDaysRemainingInTerm(current),
    [current]
  );

  const progressPercentage = useMemo(
    () => getTermProgressPercentage(current),
    [current]
  );

  const description = useMemo(
    () => getTermDescription(current),
    [current]
  );

  // ── Stable callbacks (bound to the current term) ───────────────────────
  const getPrevious = useMemo(
    () => () => getPreviousAcademicTerm(current),
    [current]
  );

  const getNext = useMemo(
    () => () => getNextAcademicTerm(current),
    [current]
  );

  const getByName = useMemo(
    () => (term: TermName, year?: number) =>
      getTermByName(term, year ?? current.year),
    [current.year]
  );

  const isCurrent = useMemo(
    () => (term: string, year: number) => isCurrentTerm(term, year),
    []
  );

  const format = useMemo(
    () => (term: string, year: number) => formatTermLabel(term, year),
    []
  );

  // ── Return everything ──────────────────────────────────────────────────
  return {
    // Primary data
    current,
    term: current.term,
    year: current.year,
    label: current.label,
    shortLabel: current.shortLabel,

    // Term list
    availableTerms,

    // Navigation helpers
    getPrevious,
    getNext,
    getByName,

    // Timing helpers
    daysRemaining,
    progressPercentage,
    description,

    // Utility
    isCurrent,
    format,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Additional Hooks (optional convenience wrappers)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lightweight variant that only returns the current term name + year.
 * Use this when you only need the term identifier (e.g. for passing as props).
 *
 * @example
 * ```tsx
 * const { term, year } = useCurrentTermIdentity();
 * ```
 */
export function useCurrentTermIdentity(): {
  term: TermName;
  year: number;
  label: string;
} {
  const current = useMemo(() => getCurrentAcademicTerm(), []);
  return {
    term: current.term,
    year: current.year,
    label: current.label,
  };
}

/**
 * Returns a list of all terms across a range of academic years.
 * Useful for building "select term" dropdowns that span multiple years.
 *
 * @example
 * ```tsx
 * const terms = useTermsForRange(2023, 2026);
 * ```
 */
export function useTermsForRange(
  fromYear: number,
  toYear: number
): AcademicTermInfo[] {
  return useMemo(
    () => getAllTermsForRange(fromYear, toYear),
    [fromYear, toYear]
  );
}

/**
 * Returns the previous, current, and next academic terms as a tuple.
 * Handy for building a term-picker with "← | →" navigation.
 *
 * @example
 * ```tsx
 * const { previous, current, next } = useTermNavigation();
 * ```
 */
export function useTermNavigation(): {
  previous: AcademicTermInfo;
  current: AcademicTermInfo;
  next: AcademicTermInfo;
} {
  return useMemo(() => {
    const current = getCurrentAcademicTerm();
    return {
      previous: getPreviousAcademicTerm(current),
      current,
      next: getNextAcademicTerm(current),
    };
  }, []);
}