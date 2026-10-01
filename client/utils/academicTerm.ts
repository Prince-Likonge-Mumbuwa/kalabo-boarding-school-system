// @/utils/academicTerm.ts

/**
 * Academic Calendar Utility
 * ─────────────────────────────────────────────────────────────────────────────
 * Defines the school's academic year structure and provides real-time helpers
 * to detect the current term, navigate between terms, and format labels.
 *
 * Academic Calendar (as per school policy):
 *   • Term 1: January 1   – April 30    (same calendar year)
 *   • Term 2: May 1       – August 31   (same calendar year)
 *   • Term 3: September 1 – January 31  (crosses into the next calendar year)
 *
 * Important note on Term 3:
 *   Term 3 STARTS in September and ENDS in January of the following year.
 *   The "academic year" of a Term 3 is always the year it STARTED in.
 *   Example: Sept 2025 → Jan 2026  is  "Term 3, 2025".
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TermName = 'Term 1' | 'Term 2' | 'Term 3';

export interface AcademicTermInfo {
  /** Term name, e.g. "Term 2" */
  term: TermName;
  /** Academic year this term belongs to (the year it started) */
  year: number;
  /** First day of the term (inclusive) */
  startDate: Date;
  /** Last day of the term (inclusive) */
  endDate: Date;
  /** Full display label, e.g. "Term 2 2025" */
  label: string;
  /** Short display label, e.g. "T2 2025" */
  shortLabel: string;
  /** Whether this is the currently active term */
  isCurrent: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Month boundaries (0-indexed) for each term within a calendar year. */
const TERM_MONTHS = {
  TERM_1_START: 0,  // January
  TERM_1_END: 3,    // April
  TERM_2_START: 4,  // May
  TERM_2_END: 7,    // August
  TERM_3_START: 8,  // September
  TERM_3_END: 11,   // December
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a fully-populated `AcademicTermInfo` object.
 */
function buildTermInfo(
  term: TermName,
  year: number,
  startDate: Date,
  endDate: Date,
  isCurrent: boolean = false
): AcademicTermInfo {
  return {
    term,
    year,
    startDate,
    endDate,
    label: formatTermLabel(term, year),
    shortLabel: `${term.replace('Term ', 'T')} ${year}`,
    isCurrent,
  };
}

/**
 * Formats a term label, e.g. "Term 2 2025".
 */
export function formatTermLabel(term: string, year: number): string {
  return `${term} ${year}`;
}

/**
 * Returns the exclusive end-of-day for a given year/month/day.
 * Using end-of-day avoids off-by-one issues when comparing dates.
 */
function endOfDay(year: number, month: number, day: number): Date {
  const d = new Date(year, month, day, 23, 59, 59, 999);
  return d;
}

/**
 * Returns the start-of-day for a given year/month/day.
 */
function startOfDay(year: number, month: number, day: number): Date {
  const d = new Date(year, month, day, 0, 0, 0, 0);
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the current academic term based on the real-time system date.
 *
 * Rules:
 *   • Jan – Apr  →  Term 1 of the same calendar year
 *   • May – Aug  →  Term 2 of the same calendar year
 *   • Sep – Dec  →  Term 3 of the same calendar year (ends Jan next year)
 *
 * @param date Optional date override (defaults to `new Date()`)
 */
export function getCurrentAcademicTerm(date: Date = new Date()): AcademicTermInfo {
  const month = date.getMonth();        // 0-indexed (0 = Jan, 11 = Dec)
  const calendarYear = date.getFullYear();

  // ── Term 1: January – April ────────────────────────────────────────────
  if (month >= TERM_MONTHS.TERM_1_START && month <= TERM_MONTHS.TERM_1_END) {
    return buildTermInfo(
      'Term 1',
      calendarYear,
      startOfDay(calendarYear, 0, 1),   // Jan 1
      endOfDay(calendarYear, 3, 30),    // Apr 30
      true
    );
  }

  // ── Term 2: May – August ──────────────────────────────────────────────
  if (month >= TERM_MONTHS.TERM_2_START && month <= TERM_MONTHS.TERM_2_END) {
    return buildTermInfo(
      'Term 2',
      calendarYear,
      startOfDay(calendarYear, 4, 1),   // May 1
      endOfDay(calendarYear, 7, 31),    // Aug 31
      true
    );
  }

  // ── Term 3: September – December ──────────────────────────────────────
  // The academic year is the calendar year the term STARTED in.
  // The term ENDS in January of the following calendar year.
  if (month >= TERM_MONTHS.TERM_3_START && month <= TERM_MONTHS.TERM_3_END) {
    return buildTermInfo(
      'Term 3',
      calendarYear,
      startOfDay(calendarYear, 8, 1),        // Sep 1
      endOfDay(calendarYear + 1, 0, 31),     // Jan 31 (next year)
      true
    );
  }

  // Fallback — should never be reached since all months 0-11 are covered.
  return buildTermInfo(
    'Term 1',
    calendarYear,
    startOfDay(calendarYear, 0, 1),
    endOfDay(calendarYear, 3, 30),
    true
  );
}

/**
 * Returns the previous academic term (handles year rollover for Term 1 ↔ Term 3).
 */
export function getPreviousAcademicTerm(info: AcademicTermInfo): AcademicTermInfo {
  switch (info.term) {
    case 'Term 1':
      // Previous is Term 3 of the PREVIOUS academic year (Sep → Jan).
      return buildTermInfo(
        'Term 3',
        info.year - 1,
        startOfDay(info.year - 1, 8, 1),   // Sep 1 (prev year)
        endOfDay(info.year, 0, 31)         // Jan 31 (this year)
      );

    case 'Term 2':
      // Previous is Term 1 of the SAME academic year.
      return buildTermInfo(
        'Term 1',
        info.year,
        startOfDay(info.year, 0, 1),       // Jan 1
        endOfDay(info.year, 3, 30)         // Apr 30
      );

    case 'Term 3':
      // Previous is Term 2 of the SAME academic year.
      return buildTermInfo(
        'Term 2',
        info.year,
        startOfDay(info.year, 4, 1),       // May 1
        endOfDay(info.year, 7, 31)         // Aug 31
      );
  }
}

/**
 * Returns the next academic term (handles year rollover for Term 3 ↔ Term 1).
 */
export function getNextAcademicTerm(info: AcademicTermInfo): AcademicTermInfo {
  switch (info.term) {
    case 'Term 1':
      // Next is Term 2 of the SAME academic year.
      return buildTermInfo(
        'Term 2',
        info.year,
        startOfDay(info.year, 4, 1),       // May 1
        endOfDay(info.year, 7, 31)         // Aug 31
      );

    case 'Term 2':
      // Next is Term 3 of the SAME academic year (Sep → Jan next year).
      return buildTermInfo(
        'Term 3',
        info.year,
        startOfDay(info.year, 8, 1),       // Sep 1
        endOfDay(info.year + 1, 0, 31)     // Jan 31 (next year)
      );

    case 'Term 3':
      // Next is Term 1 of the NEXT academic year.
      return buildTermInfo(
        'Term 1',
        info.year + 1,
        startOfDay(info.year + 1, 0, 1),   // Jan 1 (next year)
        endOfDay(info.year + 1, 3, 30)     // Apr 30 (next year)
      );
  }
}

/**
 * Returns all three terms for a given academic year.
 * Useful for populating term-selector dropdowns.
 */
export function getAllTermsForYear(year: number): AcademicTermInfo[] {
  return [
    buildTermInfo(
      'Term 1',
      year,
      startOfDay(year, 0, 1),
      endOfDay(year, 3, 30)
    ),
    buildTermInfo(
      'Term 2',
      year,
      startOfDay(year, 4, 1),
      endOfDay(year, 7, 31)
    ),
    buildTermInfo(
      'Term 3',
      year,
      startOfDay(year, 8, 1),
      endOfDay(year + 1, 0, 31)
    ),
  ];
}

/**
 * Returns all terms across a range of academic years (inclusive).
 * e.g. getAllTermsForRange(2024, 2026) → Term 1/2/3 for 2024, 2025, 2026
 */
export function getAllTermsForRange(
  fromYear: number,
  toYear: number
): AcademicTermInfo[] {
  const result: AcademicTermInfo[] = [];
  for (let y = fromYear; y <= toYear; y++) {
    result.push(...getAllTermsForYear(y));
  }
  return result;
}

/**
 * Checks whether a given term/year pair is the currently active term.
 */
export function isCurrentTerm(term: string, year: number): boolean {
  const current = getCurrentAcademicTerm();
  return current.term === term && current.year === year;
}

/**
 * Finds a specific term by name and year.
 * Returns `null` if the term is not recognized.
 */
export function getTermByName(
  term: string,
  year: number
): AcademicTermInfo | null {
  const validTerms: TermName[] = ['Term 1', 'Term 2', 'Term 3'];
  if (!validTerms.includes(term as TermName)) return null;

  const allTerms = getAllTermsForYear(year);
  return allTerms.find(t => t.term === term) ?? null;
}

/**
 * Returns the number of days remaining in the current term.
 * Returns 0 if the current date is outside the term window.
 */
export function getDaysRemainingInTerm(
  info: AcademicTermInfo = getCurrentAcademicTerm()
): number {
  const now = new Date();
  if (now < info.startDate || now > info.endDate) return 0;
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.ceil((info.endDate.getTime() - now.getTime()) / msPerDay);
}

/**
 * Returns the progress (0–100) through the current term based on today's date.
 * Useful for progress bars on dashboards.
 */
export function getTermProgressPercentage(
  info: AcademicTermInfo = getCurrentAcademicTerm()
): number {
  const now = new Date();
  const total = info.endDate.getTime() - info.startDate.getTime();
  if (total <= 0) return 100;

  const elapsed = now.getTime() - info.startDate.getTime();
  const pct = Math.round((elapsed / total) * 100);

  // Clamp to [0, 100]
  return Math.max(0, Math.min(100, pct));
}

/**
 * Returns a friendly human-readable description of the current term,
 * e.g. "Term 2 2025 • Week 3 of 16".
 */
export function getTermDescription(
  info: AcademicTermInfo = getCurrentAcademicTerm()
): string {
  const weeksElapsed = Math.floor(
    (Date.now() - info.startDate.getTime()) / (1000 * 60 * 60 * 24 * 7)
  );
  const totalWeeks = Math.ceil(
    (info.endDate.getTime() - info.startDate.getTime()) /
      (1000 * 60 * 60 * 24 * 7)
  );
  const weekNum = Math.min(Math.max(weeksElapsed + 1, 1), totalWeeks);
  return `${info.label} • Week ${weekNum} of ${totalWeeks}`;
}

/**
 * Returns the academic year that a given calendar date falls into.
 * (Useful for grouping records even when they don't map cleanly to a term.)
 */
export function getAcademicYearForDate(date: Date = new Date()): number {
  return getCurrentAcademicTerm(date).year;
}