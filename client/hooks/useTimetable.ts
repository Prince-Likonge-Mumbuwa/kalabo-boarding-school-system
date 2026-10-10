// @/hooks/useTimetable.ts
//
// ============================================================================
//  TIMETABLE HOOKS
// ============================================================================
//
//  All React Query glue for the timetable feature, bundled into one module:
//    • periods         — CRUD hooks for the bell schedule
//    • school_holidays — CRUD hooks + the seed helper
//    • timetable_entries — reads (with authority resolution), writes,
//                          approval queue, coverage
//
//  Every mutation invalidates the same set of timetable caches, so
//  submitting a timetable, approving one, editing a period, or adding a
//  holiday all keep MyTimetable / attendance picker / coverage screens in
//  sync without any manual refetch.
//
//  Authority is resolved at read time inside the service — hooks never
//  need to know about covers, TP, or delegation.
// ============================================================================

import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { getCurrentAcademicTerm, getAllTermsForYear, type TermName } from '@/utils/academicTerm';

import {
  listPeriods,
  getPeriodById,
  upsertPeriod,
  deletePeriod,
  seedDefaultPeriods,
  listHolidays,
  listHolidaysForYear,
  upsertHoliday,
  deleteHoliday,
  getHolidayCovering,
  getEntriesForSlot,
  getTimetableForTeacher,
  getTimetableForClass,
  getTodayTimetableForTeacher,
  getCurrentPeriod,
  getMyTimetableClasses,
  submitTimetable,
  approveSubmission,
  rejectSubmission,
  getPendingSubmissions,
  getMySubmissions,
  getSchoolDayBoard,
  getClashContext,
  getCoverageForDate,
  getCoverageForTeachers,
  formatLocalYMD,
} from '@/services/timetableService';

import {
  seedZambiaPublicHolidays,
  type SeedResult,
} from '@/services/zambiaHolidays';

import type {
  Period,
  PeriodDraft,
  SchoolHoliday,
  HolidayDraft,
  ResolvedTimetableEntry,
  CoverageRow,
  TeacherCoverageRow,
  PendingSubmission,
  SubmitTimetableRequest,
  SubmitTimetableResult,
  ApproveTimetableResult,
  RejectTimetableResult,
} from '@/types/timetable';

// ==================== CACHE KEYS ====================

export const timetableKeys = {
  periods: (academicYear: number) => ['timetable', 'periods', academicYear] as const,
  periodById: (periodId: string) => ['timetable', 'period', periodId] as const,

  holidays: (startYMD: string, endYMD: string) =>
    ['timetable', 'holidays', startYMD, endYMD] as const,
  holidaysForYear: (year: number) => ['timetable', 'holidays', 'year', year] as const,
  holidayCovering: (dateYMD: string) =>
    ['timetable', 'holiday-covering', dateYMD] as const,

  myTimetable: (teacherId: string, term: TermName, year: number) =>
    ['timetable', 'mine', teacherId, term, year] as const,
  myTimetableClasses: (teacherId: string, term: TermName, year: number) =>
    ['timetable', 'mine-classes', teacherId, term, year] as const,
  classTimetable: (classId: string, term: TermName, year: number) =>
    ['timetable', 'class', classId, term, year] as const,
  todayTimetable: (teacherId: string, dateYMD: string) =>
    ['timetable', 'today', teacherId, dateYMD] as const,
  currentPeriod: (teacherId: string, minuteKey: string) =>
    ['timetable', 'current-period', teacherId, minuteKey] as const,
  entriesForSlot: (slotId: string, term: TermName, year: number) =>
    ['timetable', 'slot', slotId, term, year] as const,

  pendingSubmissions: () => ['timetable', 'pending'] as const,
  mySubmissions: (teacherId: string, term: TermName, year: number) =>
    ['timetable', 'my-submissions', teacherId, term, year] as const,
  dayBoard: (dateYMD: string) => ['timetable', 'day-board', dateYMD] as const,
  coverage: (dateYMD: string) => ['timetable', 'coverage', dateYMD] as const,
  teacherCoverage: (dateYMD: string) =>
    ['timetable', 'coverage-teachers', dateYMD] as const,
};

// ==================== INVALIDATION ====================

/**
 * Invalidate everything the timetable touches. Called after every
 * mutation. Prefix matching means only mounted queries refetch.
 *
 * Deliberately broad: a single period edit can affect every teacher's
 * grid; a submission approval affects coverage tables; a holiday shifts
 * today's timetable to empty. Cheap because there are few mounted
 * timetable queries at any moment.
 */
export function invalidateTimetableCaches(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['timetable'] });
}

// ==================== PERIODS ====================

/**
 * All periods for a year. Defaults to the current academic year.
 * `includeInactive` is used by the admin editor.
 */
export function usePeriods(
  academicYear?: number,
  opts: { includeInactive?: boolean } = {},
) {
  const year = academicYear ?? getCurrentAcademicTerm().year;
  return useQuery({
    queryKey: [...timetableKeys.periods(year), { includeInactive: !!opts.includeInactive }],
    queryFn: () => listPeriods(year, { includeInactive: opts.includeInactive }),
    staleTime: 5 * 60_000, // periods change rarely
    gcTime: 30 * 60_000,
  });
}

export function usePeriod(periodId?: string) {
  return useQuery({
    queryKey: timetableKeys.periodById(periodId ?? ''),
    queryFn: () => getPeriodById(periodId!),
    enabled: !!periodId,
    staleTime: 5 * 60_000,
  });
}

export function useUpsertPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: PeriodDraft) => upsertPeriod(draft),
    onSuccess: () => invalidateTimetableCaches(qc),
  });
}

export function useDeletePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (periodId: string) => deletePeriod(periodId),
    onSuccess: () => invalidateTimetableCaches(qc),
  });
}

/** Make the year's schedule exactly the school's bell (moves rows/registers). */
export function useResetToSchoolBell() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (academicYear: number) => {
      const { resetToSchoolBell } = await import('@/services/timetableDataCheck');
      return resetToSchoolBell(academicYear);
    },
    onSuccess: () => {
      invalidateTimetableCaches(qc);
      qc.invalidateQueries({ queryKey: ['attendance_sessions'] });
    },
  });
}

export function useSeedDefaultPeriods() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (academicYear: number) => seedDefaultPeriods(academicYear),
    onSuccess: () => invalidateTimetableCaches(qc),
  });
}

// ==================== HOLIDAYS ====================

/**
 * Holidays touching a window. Pass either explicit Y-M-D bounds or a
 * year — the second overload is the common case.
 */
export function useSchoolHolidays(
  input: { startYMD: string; endYMD: string } | { year: number },
): ReturnType<typeof useQuery<SchoolHoliday[]>> {
  const isYear = 'year' in input;
  const year = isYear ? input.year : undefined;
  const startYMD = isYear ? `${year}-01-01` : input.startYMD;
  const endYMD = isYear ? `${year}-12-31` : input.endYMD;

  return useQuery({
    queryKey: isYear
      ? timetableKeys.holidaysForYear(year!)
      : timetableKeys.holidays(startYMD, endYMD),
    queryFn: () =>
      isYear ? listHolidaysForYear(year!) : listHolidays(startYMD, endYMD),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}

/** Is a specific date a holiday? Returns the covering row or null. */
export function useHolidayCovering(dateYMD?: string) {
  return useQuery({
    queryKey: timetableKeys.holidayCovering(dateYMD ?? ''),
    queryFn: () => getHolidayCovering(dateYMD!),
    enabled: !!dateYMD,
    staleTime: 5 * 60_000,
  });
}

export function useUpsertHoliday() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (draft: HolidayDraft) => upsertHoliday(draft, user?.uid ?? null),
    onSuccess: () => invalidateTimetableCaches(qc),
  });
}

export function useDeleteHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (holidayId: string) => deleteHoliday(holidayId),
    onSuccess: () => invalidateTimetableCaches(qc),
  });
}

/**
 * Seed a year's Zambian public holidays (including any in-lieu Mondays).
 * Idempotent — re-running only adds what's missing.
 */
export function useSeedZambiaHolidays() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation<SeedResult, Error, number>({
    mutationFn: (year: number) => seedZambiaPublicHolidays(year, user?.uid ?? null),
    onSuccess: () => invalidateTimetableCaches(qc),
  });
}

// ==================== MY TIMETABLE ====================

/**
 * The signed-in teacher's timetable for a term, resolved with live
 * authority. A cover teacher sees the same rows as the owner they're
 * covering — automatically, because authority is resolved at read time.
 */
export function useMyTimetable(opts: { term?: TermName; year?: number } = {}) {
  const { user } = useAuth();
  const cur = getCurrentAcademicTerm();
  const term = opts.term ?? cur.term;
  const year = opts.year ?? cur.year;

  return useQuery<ResolvedTimetableEntry[]>({
    queryKey: timetableKeys.myTimetable(user?.uid ?? '', term, year),
    queryFn: () => getTimetableForTeacher(user!.uid, term, year),
    enabled: !!user?.uid,
    staleTime: 60_000,
    refetchInterval: 60_000, // covers start/expire; keep fresh
  });
}

/**
 * Classes the teacher operates active entries for in a term. Used to
 * render one grid per class inside MyTimetable.
 */
export function useMyTimetableClasses(opts: { term?: TermName; year?: number } = {}) {
  const { user } = useAuth();
  const cur = getCurrentAcademicTerm();
  const term = opts.term ?? cur.term;
  const year = opts.year ?? cur.year;

  return useQuery({
    queryKey: timetableKeys.myTimetableClasses(user?.uid ?? '', term, year),
    queryFn: () => getMyTimetableClasses(user!.uid, term, year),
    enabled: !!user?.uid,
    staleTime: 60_000,
  });
}

// ==================== CLASS TIMETABLE (ADMIN) ====================

export function useClassTimetable(
  classId: string | undefined,
  opts: { term?: TermName; year?: number } = {},
) {
  const cur = getCurrentAcademicTerm();
  const term = opts.term ?? cur.term;
  const year = opts.year ?? cur.year;

  return useQuery<ResolvedTimetableEntry[]>({
    queryKey: timetableKeys.classTimetable(classId ?? '', term, year),
    queryFn: () => getTimetableForClass(classId!, term, year),
    enabled: !!classId,
    staleTime: 60_000,
  });
}

// ==================== TODAY / CURRENT PERIOD ====================

/**
 * Today's resolved periods for the teacher. Empty on weekends and
 * holidays. Re-fetches at midnight so a teacher who leaves the tab open
 * overnight sees fresh data.
 */
export function useTodayTimetable(dateYMD?: string) {
  const { user } = useAuth();
  const date = dateYMD ?? formatLocalYMD(new Date());

  return useQuery<ResolvedTimetableEntry[]>({
    queryKey: timetableKeys.todayTimetable(user?.uid ?? '', date),
    // Cover is worked out at each period's start on that date.
    queryFn: () => getTodayTimetableForTeacher(user!.uid, new Date(`${date}T12:00:00`)),
    enabled: !!user?.uid,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

/**
 * The period the teacher is *in* right now. Recomputes each minute.
 */
export function useCurrentPeriod() {
  const { user } = useAuth();
  const now = new Date();
  const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;

  return useQuery<ResolvedTimetableEntry | null>({
    queryKey: timetableKeys.currentPeriod(user?.uid ?? '', minuteKey),
    queryFn: () => getCurrentPeriod(user!.uid, new Date()),
    enabled: !!user?.uid,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** The teacher's own pending / rejected submissions this term. */
export function useMySubmissions(term: TermName, year: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: timetableKeys.mySubmissions(user?.uid ?? '', term, year),
    queryFn: () => getMySubmissions(user!.uid, term, year),
    enabled: !!user?.uid,
    staleTime: 30_000,
  });
}

/** Live rows of my classes and of everyone teaching my subjects (for clash locks). */
export function useClashContext(slotIds: string[], term: TermName, year: number) {
  const key = [...slotIds].sort().join(',');
  return useQuery({
    queryKey: ['timetable', 'clash-context', key, term, year],
    queryFn: () => getClashContext(slotIds, term, year),
    enabled: slotIds.length > 0,
    staleTime: 60_000,
  });
}

/** Admin: every class's lessons for a date with who teaches and register status. */
export function useSchoolDayBoard(dateYMD: string) {
  return useQuery({
    queryKey: timetableKeys.dayBoard(dateYMD),
    queryFn: () => getSchoolDayBoard(dateYMD, new Date()),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// ==================== ENTRIES FOR A SLOT (ADMIN / DEBUG) ====================

export function useEntriesForSlot(
  slotId: string | undefined,
  term: TermName,
  year: number,
) {
  return useQuery({
    queryKey: timetableKeys.entriesForSlot(slotId ?? '', term, year),
    queryFn: () => getEntriesForSlot(slotId!, term, year),
    enabled: !!slotId,
    staleTime: 60_000,
  });
}

// ==================== SUBMIT ====================

/**
 * Submit a timetable for approval. Rows become 'pending'; the currently
 * 'active' rows stay live until an admin approves.
 *
 * Returns the conflicts the service detected so the UI can warn before
 * the admin sees them.
 */
export function useSubmitTimetable() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation<
    SubmitTimetableResult,
    Error,
    SubmitTimetableRequest
  >({
    mutationFn: (req) =>
      submitTimetable(user!.uid, user?.fullName ?? 'Teacher', req),
    onSuccess: () => invalidateTimetableCaches(qc),
  });
}

// ==================== APPROVAL QUEUE ====================

/** All pending submissions, grouped and enriched. */
export function usePendingSubmissions() {
  return useQuery<PendingSubmission[]>({
    queryKey: timetableKeys.pendingSubmissions(),
    queryFn: () => getPendingSubmissions(),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function useApproveSubmission() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation<
    ApproveTimetableResult,
    Error,
    string // submissionId
  >({
    mutationFn: (submissionId) => approveSubmission(submissionId, user!.uid),
    onSuccess: () => invalidateTimetableCaches(qc),
  });
}

export function useRejectSubmission() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation<
    RejectTimetableResult,
    Error,
    { submissionId: string; reason: string }
  >({
    mutationFn: ({ submissionId, reason }) =>
      rejectSubmission(submissionId, reason, user?.uid ?? null),
    onSuccess: () => invalidateTimetableCaches(qc),
  });
}

// ==================== COVERAGE (ADMIN MONITORING) ====================

/**
 * Per-class coverage for a given date: expected periods vs marked
 * sessions. Empty on weekends and holidays.
 */
export function useTimetableCoverage(dateYMD?: string) {
  const date = dateYMD ?? formatLocalYMD(new Date());
  return useQuery<CoverageRow[]>({
    queryKey: timetableKeys.coverage(date),
    queryFn: () => getCoverageForDate(date),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/**
 * Per-teacher coverage for a given date. Includes whether the teacher
 * has any owned slots with no live cover (leave with no delegate).
 */
export function useTeacherCoverage(dateYMD?: string) {
  const date = dateYMD ?? formatLocalYMD(new Date());
  return useQuery<TeacherCoverageRow[]>({
    queryKey: timetableKeys.teacherCoverage(date),
    queryFn: () => getCoverageForTeachers(date),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// ==================== CONVENIENCE ====================

/**
 * All three terms of the current academic year. Handy for the term
 * selector in MyTimetable and the approval queue.
 */
export function useTermOptions(year?: number) {
  const y = year ?? getCurrentAcademicTerm().year;
  return getAllTermsForYear(y);
}