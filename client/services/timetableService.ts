// @/services/timetableService.ts
//
// ============================================================================
//  TIMETABLE SERVICE
// ============================================================================
//
//  Owns:
//    • periods      — the school bell schedule
//    • school_holidays — public + school-specific holidays
//    • timetable_entries — one row per (slot, term, year, day, period)
//
//  Authority over each entry is resolved at READ time via assignmentEngine.
//  resolveAuthority(slot, now). Nothing needs to be written to
//  timetable_entries when a cover, TP, or new owner is assigned — the
//  delegate/owner simply inherits the slot's periods automatically.
//
//  One row = one subject in one period on one day. Doubles and triples
//  are worked out at read time (timetableModel.groupIntoBlocks).
//
//  Approval workflow (timetable_submissions/{id}):
//    submitTimetable()   → a submission doc + 'pending' rows. It covers a
//                          set of subjects (scopeSlotIds). Blocked on clashes.
//    approveSubmission() → re-checks clashes, then in one transaction
//                          archives EVERY live row of those subjects and
//                          makes the new rows live (moves/removals work).
//    rejectSubmission()  → rows + doc 'rejected' with a reason
//
//  Only 'active' rows drive MyTimetable, the attendance picker, and
//  coverage reporting.
// ============================================================================

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  runTransaction,
  deleteDoc,
  DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { normalizeSubjectName } from '@/services/resultsService';
import type { TermName } from '@/utils/academicTerm';
import { getCurrentAcademicTerm } from '@/utils/academicTerm';
import * as engine from '@/services/assignmentEngine';
import {
  bellOrder,
  blockingConflicts,
  checkClashes,
  dayName,
  legacyDoubleOrders,
  lessonPeriods,
  MAX_LESSON_PERIODS,
  SCHOOL_BELL,
  SCHOOL_DAY_START,
  SCHOOL_DAY_END,
  type ClashContext,
  type RowLike,
} from '@/services/timetableModel';

import type {
  Period,
  PeriodDraft,
  SchoolHoliday,
  HolidayDraft,
  TimetableEntry,
  TimetableEntryStatus,
  ResolvedTimetableEntry,
  TimetableConflict,
  TimetableSubmission,
  CoverageRow,
  TeacherCoverageRow,
  PendingSubmission,
  SubmitTimetableRequest,
  SubmitTimetableResult,
  ApproveTimetableResult,
  RejectTimetableResult,
} from '@/types/timetable';

// ==================== COLLECTION NAMES ====================

const PERIODS = 'periods';
const HOLIDAYS = 'school_holidays';
const ENTRIES = 'timetable_entries';
const SUBMISSIONS = 'timetable_submissions';
const USERS = 'users';

// ==================== DATE / TIME HELPERS ====================

const pad = (n: number) => String(n).padStart(2, '0');

/** Local 'YYYY-MM-DD'. Never use toISOString here (UTC shift in CAT). */
export function formatLocalYMD(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ISO weekday: 1=Mon … 5=Fri. Returns null for Sat/Sun. */
function toWeekday1to5(d: Date): 1 | 2 | 3 | 4 | 5 | null {
  const dow = d.getDay(); // 0=Sun..6=Sat
  if (dow === 0 || dow === 6) return null;
  return dow as 1 | 2 | 3 | 4 | 5;
}

/** The moment a period starts on a given local date. */
function periodStartOn(dateYMD: string, period: Period | null | undefined): Date {
  return new Date(`${dateYMD}T${period?.startTime ?? '12:00'}:00`);
}

/** 'HH:mm' → minutes since midnight. */
function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Is `date` inside [start, end] inclusive? Both are 'YYYY-MM-DD'. */
function isWithin(dateYMD: string, startYMD: string, endYMD: string): boolean {
  return dateYMD >= startYMD && dateYMD <= endYMD;
}

const tsToDate = (v: any): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  return null;
};

/**
 * Millisecond epoch from any Firestore-timestamp-ish value.
 * Handles: Timestamp, Date, { seconds }, number, undefined.
 */
const tsToMillis = (v: any): number => {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return 0;
};

// ==================== MAPPERS ====================

function mapPeriod(id: string, d: DocumentData): Period {
  return {
    id,
    order: d.order ?? 0,
    name: d.name ?? '',
    startTime: d.startTime ?? '00:00',
    endTime: d.endTime ?? '00:00',
    kind: d.kind ?? 'lesson',
    academicYear: d.academicYear ?? new Date().getFullYear(),
    isActive: d.isActive !== false,
    createdAt: tsToDate(d.createdAt) as any,
    updatedAt: tsToDate(d.updatedAt) as any,
  };
}

function mapHoliday(id: string, d: DocumentData): SchoolHoliday {
  return {
    id,
    name: d.name ?? '',
    startDate: d.startDate ?? '',
    endDate: d.endDate ?? d.startDate ?? '',
    kind: d.kind ?? 'public',
    createdBy: d.createdBy ?? null,
    createdAt: tsToDate(d.createdAt) as any,
    updatedAt: tsToDate(d.updatedAt) as any,
  };
}

function mapEntry(id: string, d: DocumentData): TimetableEntry {
  return {
    id,
    slotId: d.slotId ?? '',
    classId: d.classId ?? '',
    className: d.className ?? '',
    subject: d.subject ?? '',
    normalizedSubject: d.normalizedSubject ?? '',
    term: d.term ?? 'Term 1',
    year: d.year ?? new Date().getFullYear(),
    dayOfWeek: d.dayOfWeek ?? 1,
    periodIndex: d.periodIndex ?? 1,
    isDouble: d.isDouble === true,
    venue: d.venue ?? null,
    status: (d.status as TimetableEntryStatus) ?? 'active',

    // Batch id is denormalized onto the entry by submitTimetable() so
    // approve/reject can group rows without a join.
    batchId: d.batchId ?? undefined,

    submittedByUid: d.submittedByUid ?? null,
    submittedAt: tsToDate(d.submittedAt) as any,
    approvedByUid: d.approvedByUid ?? null,
    approvedAt: tsToDate(d.approvedAt) as any,
    rejectedReason: d.rejectedReason ?? null,
    createdAt: tsToDate(d.createdAt) as any,
    updatedAt: tsToDate(d.updatedAt) as any,
  };
}

// ==================== PERIODS — CRUD ====================

/**
 * All periods for a given academic year, sorted by `order`.
 * Reads only active rows by default. Pass `{ includeInactive: true }`
 * for admin editors.
 */
export async function listPeriods(
  academicYear: number,
  opts: { includeInactive?: boolean } = {},
): Promise<Period[]> {
  const snap = await getDocs(
    query(collection(db, PERIODS), where('academicYear', '==', academicYear)),
  );
  const rows = snap.docs.map(d => mapPeriod(d.id, d.data()));
  const filtered = opts.includeInactive ? rows : rows.filter(p => p.isActive);
  // Time order: breaks (order 0) sit between the lessons they separate.
  return filtered.sort(
    (a, b) => hhmmToMinutes(a.startTime) - hhmmToMinutes(b.startTime) || a.order - b.order,
  );
}

export async function getPeriodById(periodId: string): Promise<Period | null> {
  const snap = await getDoc(doc(db, PERIODS, periodId));
  return snap.exists() ? mapPeriod(snap.id, snap.data()) : null;
}

/**
 * Create or update a period. When creating, `id` must be undefined.
 * Returns the period id.
 */
export async function upsertPeriod(draft: PeriodDraft): Promise<string> {
  if (!draft.name.trim()) throw new Error('Period name is required.');
  if (hhmmToMinutes(draft.endTime) <= hhmmToMinutes(draft.startTime)) {
    throw new Error('End time must be after start time.');
  }
  if (
    hhmmToMinutes(draft.startTime) < hhmmToMinutes(SCHOOL_DAY_START) ||
    hhmmToMinutes(draft.endTime) > hhmmToMinutes(SCHOOL_DAY_END)
  ) {
    throw new Error(`The school day runs ${SCHOOL_DAY_START}–${SCHOOL_DAY_END}. Nothing can be scheduled outside it.`);
  }
  // Lessons are numbered 1..8; breaks, lunch and assembly are not periods.
  const order = draft.kind === 'lesson' ? draft.order : 0;
  if (draft.kind === 'lesson' && !(Number.isInteger(order) && order >= 1 && order <= MAX_LESSON_PERIODS)) {
    throw new Error(`A lesson's period number must be 1 to ${MAX_LESSON_PERIODS}.`);
  }

  const payload = {
    order,
    name: draft.name.trim(),
    startTime: draft.startTime,
    endTime: draft.endTime,
    kind: draft.kind,
    academicYear: draft.academicYear,
    isActive: draft.isActive,
    updatedAt: serverTimestamp(),
  };

  if (draft.id) {
    // Timetable rows and registers point at a period by its `order`.
    // Renumbering it, or turning a lesson into a break, would silently move
    // or hide every lesson in that period.
    const before = await getPeriodById(draft.id);
    if (before && before.kind === 'lesson' && (before.order !== order || draft.kind !== 'lesson')) {
      const used = await getDocs(
        query(collection(db, ENTRIES), where('periodIndex', '==', before.order), where('status', 'in', ['active', 'pending'])),
      );
      const inYear = used.docs.filter(d => d.data().year === draft.academicYear);
      if (inYear.length > 0) {
        throw new Error(
          `${inYear.length} lesson(s) are timetabled in ${before.name}. Change its times or name instead, ` +
            `or have teachers move those lessons first.`,
        );
      }
    }
    await updateDoc(doc(db, PERIODS, draft.id), payload);
    return draft.id;
  }

  // Each lesson number once per academic year.
  const existing = await listPeriods(draft.academicYear, { includeInactive: true });
  if (draft.kind === 'lesson' && existing.some(p => p.kind === 'lesson' && p.order === order)) {
    throw new Error(`Period ${order} already exists for ${draft.academicYear}.`);
  }

  const ref = doc(collection(db, PERIODS));
  await setDoc(ref, { ...payload, createdAt: serverTimestamp() });
  return ref.id;
}

/**
 * Delete a period. Blocked if any timetable entry (any status) references
 * it for any term/year, to avoid orphaned rows silently disappearing from
 * the grid. Deactivate the period instead if you need to retire it.
 */
export async function deletePeriod(periodId: string): Promise<void> {
  const period = await getPeriodById(periodId);
  if (!period) return;

  // Breaks are not periods: nothing refers to them.
  const refs = period.kind === 'lesson'
    ? await getDocs(query(collection(db, ENTRIES), where('periodIndex', '==', period.order)))
    : { empty: true, size: 0 };
  if (!refs.empty) {
    throw new Error(
      `Cannot delete: ${refs.size} timetable entr${refs.size === 1 ? 'y' : 'ies'} ` +
      `still use period #${period.order}. Deactivate it instead.`,
    );
  }

  await deleteDoc(doc(db, PERIODS, periodId));
}

/**
 * Seed the school bell schedule for an empty year: P1–P4 07:20–10:00,
 * Break 10:00–10:20, P5–P8 10:20–13:00. Idempotent: skips lessons whose
 * number exists and breaks whose name exists. To correct an existing
 * schedule use applySchoolBell (Timetable data check / Periods tab).
 */
export async function seedDefaultPeriods(academicYear: number): Promise<number> {
  const defaults: Omit<PeriodDraft, 'academicYear'>[] = SCHOOL_BELL.map(r => ({ ...r, isActive: true }));

  const existing = await listPeriods(academicYear, { includeInactive: true });
  const toWrite = defaults.filter(d =>
    d.kind === 'lesson'
      ? !existing.some(p => p.kind === 'lesson' && p.order === d.order)
      : !existing.some(p => p.kind !== 'lesson' && p.name.toLowerCase() === d.name.toLowerCase()),
  );
  if (toWrite.length === 0) return 0;

  const batch = writeBatch(db);
  for (const d of toWrite) {
    batch.set(doc(collection(db, PERIODS)), {
      ...d,
      academicYear,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  return toWrite.length;
}

// ==================== HOLIDAYS — CRUD ====================

/**
 * All holidays that touch the given window (any overlap).
 * A holiday starting in one year and ending in the next is included when
 * either endpoint falls within the window.
 */
export async function listHolidays(
  termStartYMD: string,
  termEndYMD: string,
): Promise<SchoolHoliday[]> {
  // Firestore can't express range-overlap in one query, so fetch by
  // startDate inside a broad window and filter in JS for the overlap.
  const snap = await getDocs(
    query(
      collection(db, HOLIDAYS),
      where('startDate', '<=', termEndYMD),
    ),
  );
  const rows = snap.docs
    .map(d => mapHoliday(d.id, d.data()))
    .filter(h => h.endDate >= termStartYMD && h.startDate <= termEndYMD);
  return rows.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export async function listHolidaysForYear(year: number): Promise<SchoolHoliday[]> {
  return listHolidays(`${year}-01-01`, `${year}-12-31`);
}

export async function upsertHoliday(
  draft: HolidayDraft,
  actorUid: string | null,
): Promise<string> {
  if (!draft.name.trim()) throw new Error('Holiday name is required.');
  if (!draft.startDate || !draft.endDate) throw new Error('Start and end dates are required.');
  if (draft.endDate < draft.startDate) throw new Error('End date must be on or after start date.');

  const payload = {
    name: draft.name.trim(),
    startDate: draft.startDate,
    endDate: draft.endDate,
    kind: draft.kind,
    updatedAt: serverTimestamp(),
  };

  if (draft.id) {
    await updateDoc(doc(db, HOLIDAYS, draft.id), payload);
    return draft.id;
  }

  const ref = doc(collection(db, HOLIDAYS));
  await setDoc(ref, {
    ...payload,
    createdBy: actorUid,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteHoliday(holidayId: string): Promise<void> {
  await deleteDoc(doc(db, HOLIDAYS, holidayId));
}

/**
 * Fast check: is the given local date a holiday?
 * Reads once per call; callers doing per-day loops should fetch once with
 * `listHolidays()` and check in memory.
 */
export async function getHolidayCovering(
  dateYMD: string,
): Promise<SchoolHoliday | null> {
  const snap = await getDocs(
    query(collection(db, HOLIDAYS), where('startDate', '<=', dateYMD)),
  );
  for (const d of snap.docs) {
    const h = mapHoliday(d.id, d.data());
    if (isWithin(dateYMD, h.startDate, h.endDate)) return h;
  }
  return null;
}

// ==================== ENTRY READ HELPERS ====================

async function getEntriesByFilter(
  filters: Array<{ field: string; value: unknown }>,
): Promise<TimetableEntry[]> {
  const constraints = filters.map(f => where(f.field, '==', f.value));
  const snap = await getDocs(query(collection(db, ENTRIES), ...constraints));
  return snap.docs.map(d => mapEntry(d.id, d.data()));
}

/**
 * Old rows may say `isDouble: true` (one row = two periods). Expand them
 * into one row per period so every reader sees the same shape. The added
 * row's id is `<id>#2`; the data check makes this permanent.
 */
export function expandLegacyDoubles(entries: TimetableEntry[], periods: Period[]): TimetableEntry[] {
  const out: TimetableEntry[] = [];
  for (const e of entries) {
    if (!e.isDouble) {
      out.push(e);
      continue;
    }
    const orders = legacyDoubleOrders(e.periodIndex, periods);
    out.push({ ...e, isDouble: false });
    if (orders[1] !== undefined) out.push({ ...e, id: `${e.id}#2`, periodIndex: orders[1], isDouble: false });
  }
  return out;
}

/** All entries (any status) for a slot in a term. */
export async function getEntriesForSlot(
  slotId: string,
  term: TermName,
  year: number,
): Promise<TimetableEntry[]> {
  const rows = await getEntriesByFilter([
    { field: 'slotId', value: slotId },
    { field: 'term', value: term },
    { field: 'year', value: year },
  ]);
  return rows.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.periodIndex - b.periodIndex);
}

/** Entries of these slots in a term with the given status (raw, not expanded). */
async function entriesForSlots(
  slotIds: string[],
  term: TermName,
  year: number,
  status: TimetableEntryStatus,
): Promise<TimetableEntry[]> {
  const ids = Array.from(new Set(slotIds));
  const results: TimetableEntry[] = [];
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await getDocs(
      query(
        collection(db, ENTRIES),
        where('slotId', 'in', ids.slice(i, i + 30)),
        where('term', '==', term),
        where('year', '==', year),
        where('status', '==', status),
      ),
    );
    results.push(...snap.docs.map(d => mapEntry(d.id, d.data())));
  }
  return results;
}

/** Bulk-fetch slot docs by id. Uses `in` chunks of 30. */
async function getSlotsByIds(ids: string[]): Promise<Map<string, engine.ClassSlot>> {
  const out = new Map<string, engine.ClassSlot>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  for (let i = 0; i < unique.length; i += 30) {
    const snap = await getDocs(
      query(collection(db, 'class_slots'), where('__name__', 'in', unique.slice(i, i + 30))),
    );
    for (const d of snap.docs) out.set(d.id, engine.mapSlot(d.id, d.data()));
  }
  return out;
}

async function getPeriodMap(academicYear: number): Promise<{ periods: Period[]; map: Map<number, Period> }> {
  const periods = await listPeriods(academicYear);
  // Only lessons carry a period number (breaks are order 0).
  return { periods, map: new Map(lessonPeriods(periods).map(p => [p.order, p])) };
}

// ==================== READ-TIME RESOLUTION ====================

/** Resolve who teaches this row at `at` (owner, live cover or live TP). */
export function resolveRow(
  entry: TimetableEntry,
  slot: engine.ClassSlot | null,
  periodMap: Map<number, Period>,
  at: Date,
): ResolvedTimetableEntry {
  const authority = engine.resolveAuthority(slot, at);
  return {
    entry,
    ownerTeacherId: slot?.ownerTeacherId ?? null,
    ownerTeacherName: slot?.ownerTeacherName ?? null,
    operatorTeacherId: authority.operatorTeacherId,
    operatorTeacherName: authority.operatorTeacherName,
    operatorRole: authority.operatorRole,
    delegationState: authority.delegationState,
    delegateUntil: authority.delegateUntil,
    isCoveredNow:
      authority.delegationState === 'live' &&
      authority.operatorRole != null &&
      authority.operatorRole !== 'owner',
    period: periodMap.get(entry.periodIndex) ?? null,
  };
}

const sortRows = (rows: ResolvedTimetableEntry[]) =>
  rows.sort(
    (a, b) =>
      a.entry.dayOfWeek - b.entry.dayOfWeek ||
      a.entry.periodIndex - b.entry.periodIndex ||
      a.entry.className.localeCompare(b.entry.className),
  );

// ==================== PUBLIC READS ====================

/**
 * Every live row the teacher is attached to (owner, or cover/TP live at
 * `at`). An owner keeps sight of their rows while covered.
 */
export async function getTimetableForTeacher(
  teacherId: string,
  term: TermName,
  year: number,
  at: Date = new Date(),
): Promise<ResolvedTimetableEntry[]> {
  const attached = await engine.getSlotsForTeacher(teacherId);
  const slotIds = attached.map(s => s.slot.id);
  if (slotIds.length === 0) return [];
  const [raw, { periods, map }] = await Promise.all([
    entriesForSlots(slotIds, term, year, 'active'),
    getPeriodMap(year),
  ]);
  const slotMap = new Map(attached.map(s => [s.slot.id, s.slot]));
  const rows: ResolvedTimetableEntry[] = [];
  for (const e of expandLegacyDoubles(raw, periods)) {
    const slot = slotMap.get(e.slotId) ?? null;
    const isOwner = slot?.ownerTeacherId === teacherId;
    const isOperator = engine.resolveAuthority(slot, at).operatorTeacherId === teacherId;
    if (isOwner || isOperator) rows.push(resolveRow(e, slot, map, at));
  }
  return sortRows(rows);
}

/** All live rows of a class in a term. */
export async function getTimetableForClass(
  classId: string,
  term: TermName,
  year: number,
  at: Date = new Date(),
): Promise<ResolvedTimetableEntry[]> {
  const raw = await getEntriesByFilter([
    { field: 'classId', value: classId },
    { field: 'term', value: term },
    { field: 'year', value: year },
    { field: 'status', value: 'active' },
  ]);
  if (raw.length === 0) return [];
  const [slotMap, { periods, map }] = await Promise.all([
    getSlotsByIds(raw.map(e => e.slotId)),
    getPeriodMap(year),
  ]);
  return sortRows(
    expandLegacyDoubles(raw, periods).map(e => resolveRow(e, slotMap.get(e.slotId) ?? null, map, at)),
  );
}

/**
 * The lessons a teacher TEACHES on a date: weekday rows whose period is a
 * lesson, where the teacher is the operator at the moment that period
 * starts on that date (so a cover counts only on the days it runs).
 * Empty on weekends and holidays.
 */
export async function getTodayTimetableForTeacher(
  teacherId: string,
  at: Date = new Date(),
): Promise<ResolvedTimetableEntry[]> {
  const dow = toWeekday1to5(at);
  if (dow === null) return [];
  const dateYMD = formatLocalYMD(at);
  if (await getHolidayCovering(dateYMD)) return [];

  const { term, year } = getCurrentAcademicTerm(at);
  const attached = await engine.getSlotsForTeacher(teacherId);
  if (attached.length === 0) return [];
  const [raw, { periods, map }] = await Promise.all([
    entriesForSlots(attached.map(s => s.slot.id), term, year, 'active'),
    getPeriodMap(year),
  ]);
  const slotMap = new Map(attached.map(s => [s.slot.id, s.slot]));
  const rows: ResolvedTimetableEntry[] = [];
  for (const e of expandLegacyDoubles(raw, periods)) {
    if (e.dayOfWeek !== dow) continue;
    const period = map.get(e.periodIndex);
    if (!period || period.kind !== 'lesson') continue;
    const slot = slotMap.get(e.slotId) ?? null;
    const when = periodStartOn(dateYMD, period);
    if (engine.resolveAuthority(slot, when).operatorTeacherId !== teacherId) continue;
    rows.push(resolveRow(e, slot, map, when));
  }
  return sortRows(rows);
}

/** The row the teacher is teaching at `at`, if any (works inside doubles). */
export async function getCurrentPeriod(
  teacherId: string,
  at: Date = new Date(),
): Promise<ResolvedTimetableEntry | null> {
  const today = await getTodayTimetableForTeacher(teacherId, at);
  const minutes = at.getHours() * 60 + at.getMinutes();
  return (
    today.find(
      r =>
        r.period &&
        minutes >= hhmmToMinutes(r.period.startTime) &&
        minutes < hhmmToMinutes(r.period.endTime),
    ) ?? null
  );
}

/** Classes a teacher has live rows for (used by MyTimetable headings). */
export async function getMyTimetableClasses(
  teacherId: string,
  term: TermName,
  year: number,
): Promise<Array<{ classId: string; className: string; subjects: string[] }>> {
  const rows = await getTimetableForTeacher(teacherId, term, year);
  const byClass = new Map<string, { classId: string; className: string; subjects: Set<string> }>();
  for (const r of rows) {
    const c = byClass.get(r.entry.classId) ?? {
      classId: r.entry.classId,
      className: r.entry.className,
      subjects: new Set<string>(),
    };
    c.subjects.add(r.entry.subject);
    byClass.set(r.entry.classId, c);
  }
  return Array.from(byClass.values())
    .map(c => ({ classId: c.classId, className: c.className, subjects: Array.from(c.subjects).sort() }))
    .sort((a, b) => a.className.localeCompare(b.className));
}

// ==================== CLASH CONTEXT ====================

const teachersOf = (slot: engine.ClassSlot | null | undefined, at: Date) => {
  const out: Array<{ id: string; name: string }> = [];
  if (!slot) return out;
  if (slot.ownerTeacherId) out.push({ id: slot.ownerTeacherId, name: slot.ownerTeacherName ?? 'Teacher' });
  const auth = engine.resolveAuthority(slot, at);
  if (auth.delegationState === 'live' && auth.operatorTeacherId && auth.operatorTeacherId !== slot.ownerTeacherId) {
    out.push({ id: auth.operatorTeacherId, name: auth.operatorTeacherName ?? 'Teacher' });
  }
  return out;
};

export interface TimetableClashContext extends ClashContext {
  slots: Map<string, engine.ClassSlot>;
}

/**
 * Everything needed to clash-check a change to these subjects: the live
 * rows of their classes, the live rows of every subject their teachers
 * (owner and live cover) teach, and who teaches what.
 */
export async function getClashContext(
  scopeSlotIds: string[],
  term: TermName,
  year: number,
  at: Date = new Date(),
): Promise<TimetableClashContext> {
  const scope = await getSlotsByIds(scopeSlotIds);
  const teachersBySlot = new Map<string, Array<{ id: string; name: string }>>();
  const teacherIds = new Set<string>();
  for (const s of scope.values()) {
    const ts = teachersOf(s, at);
    teachersBySlot.set(s.id, ts);
    ts.forEach(t => teacherIds.add(t.id));
  }

  // Every subject those teachers are attached to.
  const allSlots = new Map(scope);
  for (const t of teacherIds) {
    for (const { slot } of await engine.getSlotsForTeacher(t)) allSlots.set(slot.id, slot);
  }
  for (const s of allSlots.values()) if (!teachersBySlot.has(s.id)) teachersBySlot.set(s.id, teachersOf(s, at));

  const classIds = Array.from(new Set(Array.from(scope.values()).map(s => s.classId)));
  const [{ periods }, teacherRows, ...classRows] = await Promise.all([
    getPeriodMap(year),
    entriesForSlots(Array.from(allSlots.keys()), term, year, 'active'),
    ...classIds.map(c =>
      getEntriesByFilter([
        { field: 'classId', value: c },
        { field: 'term', value: term },
        { field: 'year', value: year },
        { field: 'status', value: 'active' },
      ]),
    ),
  ]);
  const byId = new Map<string, TimetableEntry>();
  for (const e of [...teacherRows, ...classRows.flat()]) byId.set(e.id, e);
  // Teachers of class rows we haven't seen (other teachers in the class).
  const missing = Array.from(byId.values()).map(e => e.slotId).filter(id => !teachersBySlot.has(id));
  const more = await getSlotsByIds(missing);
  for (const s of more.values()) {
    allSlots.set(s.id, s);
    teachersBySlot.set(s.id, teachersOf(s, at));
  }

  return {
    live: expandLegacyDoubles(Array.from(byId.values()), periods) as RowLike[],
    teachersBySlot,
    replaceSlotIds: new Set(scopeSlotIds),
    periods,
    slots: allSlots,
  };
}

const conflictSummary = (cs: TimetableConflict[]) =>
  cs.slice(0, 3).map(c => c.message).join(' ') + (cs.length > 3 ? ` (+${cs.length - 3} more)` : '');

// ==================== SUBMIT → PENDING ====================

function mapSubmission(id: string, d: DocumentData): TimetableSubmission {
  return {
    id,
    teacherId: d.teacherId ?? '',
    teacherName: d.teacherName ?? 'Teacher',
    term: d.term,
    year: d.year,
    scopeSlotIds: Array.isArray(d.scopeSlotIds) ? d.scopeSlotIds : [],
    classIds: Array.isArray(d.classIds) ? d.classIds : [],
    entryCount: d.entryCount ?? 0,
    status: d.status ?? 'pending',
    submittedAt: tsToDate(d.submittedAt),
    decidedBy: d.decidedBy ?? null,
    decidedAt: tsToDate(d.decidedAt),
    rejectedReason: d.rejectedReason ?? null,
  };
}

/**
 * Submit the full timetable of some subjects for approval. Every period
 * ticked for a subject in `scopeSlotIds` is one row; a subject with nothing
 * ticked is submitted as "clear this subject". Refused when:
 *   • the teacher neither owns nor currently covers a subject,
 *   • a period is not a lesson, or
 *   • it clashes with the class's or the teacher's live timetable.
 * The live timetable stays in force until an admin approves.
 */
export async function submitTimetable(
  teacherId: string,
  teacherName: string,
  req: SubmitTimetableRequest,
): Promise<SubmitTimetableResult> {
  const scope = Array.from(new Set(req.scopeSlotIds));
  if (scope.length === 0) throw new Error('Choose at least one subject to submit.');
  const now = new Date();

  const ctx = await getClashContext(scope, req.term, req.year, now);
  for (const id of scope) {
    const slot = ctx.slots.get(id);
    if (!slot) throw new Error(`Unknown subject: ${id}`);
    const isOwner = slot.ownerTeacherId === teacherId;
    const isOperator = engine.resolveAuthority(slot, now).operatorTeacherId === teacherId;
    if (!isOwner && !isOperator) {
      throw new Error(`You don't currently teach ${slot.subject} in ${slot.className}.`);
    }
  }

  // One row per (subject, day, period).
  const seen = new Set<string>();
  const rows: Array<RowLike & { normalizedSubject: string; venue: string | null }> = [];
  for (const e of req.entries) {
    if (!scope.includes(e.slotId)) throw new Error('A ticked period belongs to a subject outside this submission.');
    const k = `${e.slotId}|${e.dayOfWeek}|${e.periodIndex}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const slot = ctx.slots.get(e.slotId)!;
    rows.push({
      slotId: e.slotId,
      classId: slot.classId,
      className: slot.className,
      subject: slot.subject,
      normalizedSubject: slot.normalizedSubject,
      dayOfWeek: e.dayOfWeek,
      periodIndex: e.periodIndex,
      venue: e.venue?.trim() ? e.venue.trim() : null,
    });
  }

  const conflicts = blockingConflicts(checkClashes(rows, ctx));
  if (conflicts.length > 0) {
    throw new Error(`Fix these clashes first: ${conflictSummary(conflicts)}`);
  }

  // Earlier pending work of mine on the same subjects is replaced.
  const mineSnap = await getDocs(
    query(collection(db, SUBMISSIONS), where('teacherId', '==', teacherId), where('status', '==', 'pending')),
  );
  const batch = writeBatch(db);
  let replacedPendingCount = 0;
  for (const d of mineSnap.docs) {
    const sub = mapSubmission(d.id, d.data());
    if (sub.term !== req.term || sub.year !== req.year) continue;
    const overlap = sub.scopeSlotIds.filter(id => scope.includes(id));
    if (overlap.length === 0) continue;
    const subRows = await getDocs(query(collection(db, ENTRIES), where('batchId', '==', sub.id)));
    let kept = 0;
    for (const r of subRows.docs) {
      if (overlap.includes(r.data().slotId)) {
        batch.delete(r.ref);
        replacedPendingCount++;
      } else kept++;
    }
    const left = sub.scopeSlotIds.filter(id => !scope.includes(id));
    batch.set(
      d.ref,
      left.length === 0
        ? { status: 'superseded', updatedAt: serverTimestamp() }
        : { scopeSlotIds: left, entryCount: kept, updatedAt: serverTimestamp() },
      { merge: true },
    );
  }
  // Legacy pending rows (from before submissions existed).
  for (const p of await entriesForSlots(scope, req.term, req.year, 'pending')) {
    if (p.submittedByUid === teacherId && !mineSnap.docs.some(d => d.id === p.batchId)) {
      batch.delete(doc(db, ENTRIES, p.id));
      replacedPendingCount++;
    }
  }

  const subRef = doc(collection(db, SUBMISSIONS));
  const classIds = Array.from(new Set(scope.map(id => ctx.slots.get(id)!.classId)));
  batch.set(subRef, {
    teacherId,
    teacherName,
    term: req.term,
    year: req.year,
    scopeSlotIds: scope,
    classIds,
    entryCount: rows.length,
    status: 'pending',
    submittedAt: serverTimestamp(),
    decidedBy: null,
    decidedAt: null,
    rejectedReason: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  for (const r of rows) {
    batch.set(doc(collection(db, ENTRIES)), {
      slotId: r.slotId,
      classId: r.classId,
      className: r.className,
      subject: r.subject,
      normalizedSubject: r.normalizedSubject,
      term: req.term,
      year: req.year,
      dayOfWeek: r.dayOfWeek,
      periodIndex: r.periodIndex,
      isDouble: false,
      venue: r.venue,
      status: 'pending' as TimetableEntryStatus,
      submittedByUid: teacherId,
      submittedAt: serverTimestamp(),
      approvedByUid: null,
      approvedAt: null,
      rejectedReason: null,
      batchId: subRef.id,
      teacherName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();

  return { submissionId: subRef.id, submittedCount: rows.length, replacedPendingCount, conflicts: [] };
}

// ==================== ADMIN QUEUE / APPROVE / REJECT ====================

interface LoadedSubmission {
  id: string;
  doc: TimetableSubmission | null;
  rows: Array<TimetableEntry & { ref: any }>;
  scope: string[];
  term: TermName;
  year: number;
}

async function loadSubmission(submissionId: string): Promise<LoadedSubmission> {
  const [docSnap, rowSnap] = await Promise.all([
    getDoc(doc(db, SUBMISSIONS, submissionId)),
    getDocs(query(collection(db, ENTRIES), where('batchId', '==', submissionId))),
  ]);
  const rows = rowSnap.docs
    .map(d => ({ ref: d.ref, ...mapEntry(d.id, d.data()) }))
    .filter(r => r.status === 'pending');
  const sub = docSnap.exists() ? mapSubmission(docSnap.id, docSnap.data()!) : null;
  if (!sub && rows.length === 0) throw new Error('This submission no longer exists.');
  if (sub && sub.status !== 'pending') throw new Error(`This submission was already ${sub.status}.`);
  return {
    id: submissionId,
    doc: sub,
    rows,
    // Legacy batches (no doc) replace only the subjects they contain.
    scope: sub ? sub.scopeSlotIds : Array.from(new Set(rows.map(r => r.slotId))),
    term: sub?.term ?? rows[0].term,
    year: sub?.year ?? rows[0].year,
  };
}

/**
 * Approve: re-check clashes against the CURRENT live timetable, then in one
 * transaction retire every live row of the submission's subjects and make
 * the submitted rows live.
 */
export async function approveSubmission(
  submissionId: string,
  adminUid: string,
): Promise<ApproveTimetableResult> {
  const sub = await loadSubmission(submissionId);
  const ctx = await getClashContext(sub.scope, sub.term, sub.year);
  const conflicts = blockingConflicts(checkClashes(sub.rows, ctx));
  if (conflicts.length > 0) {
    throw new Error(`Cannot approve — the timetable has changed since this was submitted: ${conflictSummary(conflicts)}`);
  }
  const live = await entriesForSlots(sub.scope, sub.term, sub.year, 'active');

  await runTransaction(db, async tx => {
    if (sub.doc) {
      const fresh = await tx.get(doc(db, SUBMISSIONS, sub.id));
      if (!fresh.exists() || fresh.data()?.status !== 'pending') {
        throw new Error('This submission was changed by someone else. Refresh and try again.');
      }
      tx.set(
        doc(db, SUBMISSIONS, sub.id),
        { status: 'approved', decidedBy: adminUid, decidedAt: serverTimestamp(), updatedAt: serverTimestamp() },
        { merge: true },
      );
    }
    for (const a of live) {
      tx.set(doc(db, ENTRIES, a.id), { status: 'archived', updatedAt: serverTimestamp() }, { merge: true });
    }
    for (const p of sub.rows) {
      tx.set(
        p.ref,
        { status: 'active', approvedByUid: adminUid, approvedAt: serverTimestamp(), updatedAt: serverTimestamp() },
        { merge: true },
      );
    }
  });

  return { submissionId, approvedCount: sub.rows.length, archivedCount: live.length };
}

export async function rejectSubmission(
  submissionId: string,
  reason: string,
  adminUid: string | null = null,
): Promise<RejectTimetableResult> {
  const sub = await loadSubmission(submissionId);
  const why = reason?.trim() || 'Rejected by admin.';
  const batch = writeBatch(db);
  for (const r of sub.rows) {
    batch.set(r.ref, { status: 'rejected', rejectedReason: why, updatedAt: serverTimestamp() }, { merge: true });
  }
  if (sub.doc) {
    batch.set(
      doc(db, SUBMISSIONS, sub.id),
      { status: 'rejected', rejectedReason: why, decidedBy: adminUid, decidedAt: serverTimestamp(), updatedAt: serverTimestamp() },
      { merge: true },
    );
  }
  await batch.commit();
  return { submissionId, rejectedCount: sub.rows.length };
}

/** Admin approval queue, each with a fresh clash check and a before/after. */
export async function getPendingSubmissions(): Promise<PendingSubmission[]> {
  const [docSnap, rowSnap] = await Promise.all([
    getDocs(query(collection(db, SUBMISSIONS), where('status', '==', 'pending'))),
    getDocs(query(collection(db, ENTRIES), where('status', '==', 'pending'))),
  ]);
  const ids = new Set<string>(docSnap.docs.map(d => d.id));
  for (const r of rowSnap.docs) {
    const e = mapEntry(r.id, r.data());
    ids.add(e.batchId ?? `${e.submittedByUid}__${tsToMillis(r.data().submittedAt)}`);
  }

  const out: PendingSubmission[] = [];
  for (const id of ids) {
    let sub: LoadedSubmission;
    try {
      sub = await loadSubmission(id);
    } catch {
      continue;
    }
    const [ctx, replaced] = await Promise.all([
      getClashContext(sub.scope, sub.term, sub.year),
      entriesForSlots(sub.scope, sub.term, sub.year, 'active'),
    ]);
    const entries = sub.rows.map(({ ref: _ref, ...e }) => e as TimetableEntry);
    const classIds = Array.from(new Set(sub.scope.map(s => ctx.slots.get(s)?.classId).filter(Boolean))) as string[];
    out.push({
      id,
      submittedByUid: sub.doc?.teacherId ?? entries[0]?.submittedByUid ?? '',
      submittedByName: sub.doc?.teacherName ?? (sub.rows[0] as any)?.teacherName ?? 'Teacher',
      submittedAt: sub.doc?.submittedAt ?? new Date(tsToMillis(entries[0]?.submittedAt) || Date.now()),
      entries,
      scopeSlotIds: sub.scope,
      replacedEntries: replaced,
      classIds,
      classNames: classIds.map(c => Array.from(ctx.slots.values()).find(s => s.classId === c)?.className ?? c),
      term: sub.term,
      year: sub.year,
      conflicts: blockingConflicts(checkClashes(sub.rows, ctx)),
    });
  }
  return out.sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());
}

/** A teacher's own submissions this term, newest first (for status badges). */
export async function getMySubmissions(
  teacherId: string,
  term: TermName,
  year: number,
): Promise<Array<TimetableSubmission & { entries: TimetableEntry[] }>> {
  const snap = await getDocs(query(collection(db, SUBMISSIONS), where('teacherId', '==', teacherId)));
  const subs = snap.docs
    .map(d => mapSubmission(d.id, d.data()))
    .filter(s => s.term === term && s.year === year && (s.status === 'pending' || s.status === 'rejected'))
    .sort((a, b) => (b.submittedAt?.getTime() ?? 0) - (a.submittedAt?.getTime() ?? 0));
  const out = [];
  for (const s of subs) {
    const rows = await getDocs(query(collection(db, ENTRIES), where('batchId', '==', s.id)));
    out.push({ ...s, entries: rows.docs.map(d => mapEntry(d.id, d.data())) });
  }
  return out;
}

export { dayName, bellOrder };

// ==================== SCHOOL DAY BOARD (WHO IS TEACHING) ====================

export type BoardStatus = 'taken' | 'in-progress' | 'missed' | 'uncovered' | 'upcoming';

export interface BoardLesson {
  /** Resolved at the moment the period starts on that date. */
  row: ResolvedTimetableEntry;
  status: BoardStatus;
  markedByName: string | null;
}

export interface BoardClass {
  classId: string;
  className: string;
  lessons: BoardLesson[];
  /** Daily register (form teacher) taken for this date. */
  dailyTaken: boolean;
  dailyMarkedByName: string | null;
}

export interface SchoolDayBoard {
  date: string;
  dayOfWeek: 1 | 2 | 3 | 4 | 5 | null;
  holiday: SchoolHoliday | null;
  term: TermName;
  year: number;
  periods: Period[];
  classes: BoardClass[];
}

interface DaySession {
  classId: string;
  kind: string;
  period?: number;
  subject?: string;
  normalizedSubject?: string;
  markedBy: string;
  markedByName: string;
}

/** Does a register belong to this timetable row? */
export function sessionMatchesRow(s: DaySession, e: TimetableEntry): boolean {
  if (s.kind !== 'periodic' || s.classId !== e.classId || s.period !== e.periodIndex) return false;
  if (s.normalizedSubject) return s.normalizedSubject === e.normalizedSubject;
  return (
    (s.subject ?? '').trim().toLowerCase() === e.subject.trim().toLowerCase() ||
    normalizeSubjectName(s.subject ?? '') === e.normalizedSubject
  );
}

/**
 * One date, every class: each lesson with who teaches it (cover worked out
 * for that date) and whether its register was taken; plus the daily register.
 *   taken        register saved
 *   in-progress  lesson running now, no register yet
 *   missed       lesson over, no register
 *   uncovered    nobody can teach it (vacant, or owner on leave with no cover)
 *   upcoming     later today / a future date
 */
export async function getSchoolDayBoard(dateYMD: string, at: Date = new Date()): Promise<SchoolDayBoard> {
  const day = new Date(`${dateYMD}T12:00:00`);
  const dow = toWeekday1to5(day);
  const { term, year } = getCurrentAcademicTerm(day);
  const [holiday, { periods, map }, classSnap] = await Promise.all([
    getHolidayCovering(dateYMD),
    getPeriodMap(year),
    getDocs(collection(db, 'classes')),
  ]);
  const board: SchoolDayBoard = { date: dateYMD, dayOfWeek: dow, holiday, term, year, periods, classes: [] };
  if (dow === null || holiday) return board;

  const [raw, sessionSnap, leaveSnap] = await Promise.all([
    getEntriesByFilter([
      { field: 'term', value: term },
      { field: 'year', value: year },
      { field: 'status', value: 'active' },
      { field: 'dayOfWeek', value: dow },
    ]),
    getDocs(query(collection(db, 'attendance_sessions'), where('date', '==', dateYMD))),
    getDocs(query(collection(db, USERS), where('status', '==', 'on_leave'))),
  ]);
  const onLeave = new Set(leaveSnap.docs.map(d => d.id));
  const sessions = sessionSnap.docs.map(d => d.data() as DaySession);
  const slotMap = await getSlotsByIds(raw.map(e => e.slotId));
  const nowMin = at.getHours() * 60 + at.getMinutes();
  const today = formatLocalYMD(at);

  const classes = new Map<string, BoardClass>();
  const classFor = (id: string, name: string) => {
    let c = classes.get(id);
    if (!c) {
      const daily = sessions.find(s => s.classId === id && s.kind === 'daily');
      c = { classId: id, className: name, lessons: [], dailyTaken: !!daily, dailyMarkedByName: daily?.markedByName ?? null };
      classes.set(id, c);
    }
    return c;
  };
  for (const d of classSnap.docs) {
    const data = d.data();
    if (data.isActive === false) continue;
    classFor(d.id, data.name || d.id);
  }

  for (const e of expandLegacyDoubles(raw, periods)) {
    const period = map.get(e.periodIndex);
    if (!period || period.kind !== 'lesson') continue;
    const row = resolveRow(e, slotMap.get(e.slotId) ?? null, map, periodStartOn(dateYMD, period));
    const session = sessions.find(s => sessionMatchesRow(s, e));
    const ended = dateYMD < today || (dateYMD === today && nowMin >= hhmmToMinutes(period.endTime));
    const started = dateYMD < today || (dateYMD === today && nowMin >= hhmmToMinutes(period.startTime));
    const uncovered =
      !row.operatorTeacherId || (row.operatorRole === 'owner' && onLeave.has(row.operatorTeacherId));
    const status: BoardStatus = session
      ? 'taken'
      : uncovered
        ? 'uncovered'
        : ended
          ? 'missed'
          : started
            ? 'in-progress'
            : 'upcoming';
    classFor(e.classId, e.className).lessons.push({ row, status, markedByName: session?.markedByName ?? null });
  }

  board.classes = Array.from(classes.values())
    .map(c => ({ ...c, lessons: c.lessons.sort((a, b) => a.row.entry.periodIndex - b.row.entry.periodIndex) }))
    .sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true }));
  return board;
}

// ==================== COVERAGE (built on the board) ====================

const hasStarted = (l: BoardLesson) => l.status !== 'upcoming';

/** Per class: lessons that have started vs registers taken. */
export async function getCoverageForDate(dateYMD: string, at: Date = new Date()): Promise<CoverageRow[]> {
  const board = await getSchoolDayBoard(dateYMD, at);
  const sessionsByClass = new Map<string, CoverageRow['markedSessions']>();
  const snap = board.classes.length
    ? await getDocs(query(collection(db, 'attendance_sessions'), where('date', '==', dateYMD)))
    : { docs: [] as any[] };
  for (const s of snap.docs) {
    const d = s.data() as DaySession;
    if (d.kind !== 'periodic') continue;
    const arr = sessionsByClass.get(d.classId) ?? [];
    arr.push({
      period: d.period ?? 0,
      subject: d.subject ?? '',
      normalizedSubject: d.normalizedSubject ?? normalizeSubjectName(d.subject ?? ''),
      markedBy: d.markedBy,
      markedByName: d.markedByName,
    });
    sessionsByClass.set(d.classId, arr);
  }
  return board.classes
    .filter(c => c.lessons.length > 0)
    .map(c => {
      const expected = c.lessons.filter(hasStarted);
      const missing = expected.filter(l => l.status !== 'taken');
      const marked = sessionsByClass.get(c.classId) ?? [];
      return {
        classId: c.classId,
        className: c.className,
        expectedEntries: expected.map(l => l.row),
        expectedCount: expected.length,
        markedSessions: marked,
        markedCount: expected.length - missing.length,
        missingEntries: missing.map(l => l.row),
        missingCount: missing.length,
        coverageRate:
          expected.length === 0 ? 100 : Math.round(((expected.length - missing.length) / expected.length) * 100),
      };
    });
}

/** Per teacher who taught (operator on that date): their lessons vs registers. */
export async function getCoverageForTeachers(dateYMD: string, at: Date = new Date()): Promise<TeacherCoverageRow[]> {
  const board = await getSchoolDayBoard(dateYMD, at);
  const lessons = board.classes.flatMap(c => c.lessons).filter(hasStarted);
  const byTeacher = new Map<string, BoardLesson[]>();
  const uncoveredOwners = new Set<string>();
  for (const l of lessons) {
    if (l.status === 'uncovered') {
      if (l.row.ownerTeacherId) uncoveredOwners.add(l.row.ownerTeacherId);
      continue;
    }
    const t = l.row.operatorTeacherId;
    if (!t) continue;
    const arr = byTeacher.get(t) ?? [];
    arr.push(l);
    byTeacher.set(t, arr);
  }
  const ids = Array.from(new Set([...byTeacher.keys(), ...uncoveredOwners]));
  const users = new Map<string, { name: string; status: TeacherCoverageRow['status'] }>();
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await getDocs(query(collection(db, USERS), where('__name__', 'in', ids.slice(i, i + 30))));
    for (const u of snap.docs) {
      const d = u.data();
      users.set(u.id, { name: d.fullName || d.name || 'Teacher', status: d.status || 'active' });
    }
  }
  const rows: TeacherCoverageRow[] = [];
  for (const id of ids) {
    const mine = byTeacher.get(id) ?? [];
    const missing = mine.filter(l => l.status !== 'taken');
    const meta = users.get(id) ?? {
      name: mine[0]?.row.operatorTeacherName ?? 'Teacher',
      status: 'active' as const,
    };
    rows.push({
      teacherId: id,
      teacherName: meta.name,
      status: meta.status,
      expectedEntries: mine.map(l => l.row),
      expectedCount: mine.length,
      markedCount: mine.length - missing.length,
      missingEntries: missing.map(l => l.row),
      missingCount: missing.length,
      coverageRate: mine.length === 0 ? 100 : Math.round(((mine.length - missing.length) / mine.length) * 100),
      hasUncoveredSlots: uncoveredOwners.has(id),
    });
  }
  return rows.sort((a, b) => a.coverageRate - b.coverageRate || a.teacherName.localeCompare(b.teacherName));
}

// ==================== EXPORTS ====================

export const timetableService = {
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
  getClashContext,
  submitTimetable,
  approveSubmission,
  rejectSubmission,
  getPendingSubmissions,
  getMySubmissions,
  getSchoolDayBoard,
  getCoverageForDate,
  getCoverageForTeachers,
  formatLocalYMD,
};