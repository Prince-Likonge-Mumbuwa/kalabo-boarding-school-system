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
//  Approval workflow:
//    submitTimetable()   → writes rows with status 'pending'
//    approveSubmission() → transactionally promotes to 'active',
//                          archives the previous 'active' rows
//    rejectSubmission()  → marks pending rows 'rejected' with a reason
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
import type { TermName } from '@/utils/academicTerm';
import { getCurrentAcademicTerm } from '@/utils/academicTerm';
import * as engine from '@/services/assignmentEngine';

import type {
  Period,
  PeriodDraft,
  SchoolHoliday,
  HolidayDraft,
  TimetableEntry,
  TimetableEntryStatus,
  ResolvedTimetableEntry,
  TimetableConflict,
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
  return filtered.sort((a, b) => a.order - b.order);
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
  if (draft.order < 1) throw new Error('Period order must be ≥ 1.');
  if (hhmmToMinutes(draft.endTime) <= hhmmToMinutes(draft.startTime)) {
    throw new Error('End time must be after start time.');
  }

  const payload = {
    order: draft.order,
    name: draft.name.trim(),
    startTime: draft.startTime,
    endTime: draft.endTime,
    kind: draft.kind,
    academicYear: draft.academicYear,
    isActive: draft.isActive,
    updatedAt: serverTimestamp(),
  };

  if (draft.id) {
    await updateDoc(doc(db, PERIODS, draft.id), payload);
    return draft.id;
  }

  // Reject duplicate `order` within the same academic year.
  const existing = await listPeriods(draft.academicYear, { includeInactive: true });
  if (existing.some(p => p.order === draft.order)) {
    throw new Error(`Period #${draft.order} already exists for ${draft.academicYear}.`);
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

  const refs = await getDocs(
    query(collection(db, ENTRIES), where('periodIndex', '==', period.order)),
  );
  if (!refs.empty) {
    throw new Error(
      `Cannot delete: ${refs.size} timetable entr${refs.size === 1 ? 'y' : 'ies'} ` +
      `still use period #${period.order}. Deactivate it instead.`,
    );
  }

  await deleteDoc(doc(db, PERIODS, periodId));
}

/**
 * Seed a sensible default bell schedule for a year. Idempotent: skips
 * periods whose `order` already exists for that year.
 *
 * Eight-lesson day with two breaks and a lunch:
 *   P1..P2 | Break | P3..P4 | Lunch | P5..P8
 */
export async function seedDefaultPeriods(academicYear: number): Promise<number> {
  const defaults: Omit<PeriodDraft, 'academicYear'>[] = [
    { order: 1, name: 'P1',    startTime: '07:30', endTime: '08:20', kind: 'lesson', isActive: true },
    { order: 2, name: 'P2',    startTime: '08:20', endTime: '09:10', kind: 'lesson', isActive: true },
    { order: 3, name: 'Break', startTime: '09:10', endTime: '09:30', kind: 'break',  isActive: true },
    { order: 4, name: 'P3',    startTime: '09:30', endTime: '10:20', kind: 'lesson', isActive: true },
    { order: 5, name: 'P4',    startTime: '10:20', endTime: '11:10', kind: 'lesson', isActive: true },
    { order: 6, name: 'Lunch', startTime: '11:10', endTime: '12:00', kind: 'lunch',  isActive: true },
    { order: 7, name: 'P5',    startTime: '12:00', endTime: '12:50', kind: 'lesson', isActive: true },
    { order: 8, name: 'P6',    startTime: '12:50', endTime: '13:40', kind: 'lesson', isActive: true },
    { order: 9, name: 'P7',    startTime: '13:40', endTime: '14:30', kind: 'lesson', isActive: true },
    { order: 10, name: 'P8',   startTime: '14:30', endTime: '15:20', kind: 'lesson', isActive: true },
  ];

  const existing = await listPeriods(academicYear, { includeInactive: true });
  const takenOrders = new Set(existing.map(p => p.order));
  const toWrite = defaults.filter(d => !takenOrders.has(d.order));
  if (toWrite.length === 0) return 0;

  const batch = writeBatch(db);
  for (const d of toWrite) {
    const ref = doc(collection(db, PERIODS));
    batch.set(ref, {
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
  // Build the query dynamically. All call sites pass ≤ 3 equality filters.
  const constraints = filters.map(f => where(f.field, '==', f.value));
  const snap = await getDocs(query(collection(db, ENTRIES), ...constraints));
  return snap.docs.map(d => mapEntry(d.id, d.data()));
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
  return rows.sort(
    (a, b) => a.dayOfWeek - b.dayOfWeek || a.periodIndex - b.periodIndex,
  );
}

/** Entries for one teacher (owner OR delegate), status-filterable. */
async function getEntriesForTeacherSlots(
  teacherId: string,
  term: TermName,
  year: number,
  status: TimetableEntryStatus,
): Promise<TimetableEntry[]> {
  const slotsView = await engine.getSlotsForTeacher(teacherId);
  const slotIds = Array.from(new Set(slotsView.map(s => s.slot.id)));
  if (slotIds.length === 0) return [];

  // Firestore 'in' is capped at 30 — chunk.
  const results: TimetableEntry[] = [];
  for (let i = 0; i < slotIds.length; i += 30) {
    const chunk = slotIds.slice(i, i + 30);
    const snap = await getDocs(
      query(
        collection(db, ENTRIES),
        where('slotId', 'in', chunk),
        where('term', '==', term),
        where('year', '==', year),
        where('status', '==', status),
      ),
    );
    results.push(...snap.docs.map(d => mapEntry(d.id, d.data())));
  }
  return results;
}

// ==================== READ-TIME RESOLUTION ====================

/**
 * Resolve authority for a single entry. Uses the entry's slot to decide
 * who teaches right now (owner, live cover, or live TP). This is the glue
 * that makes covers auto-adjust with zero timetable writes.
 */
async function resolveEntry(
  entry: TimetableEntry,
  slot: engine.ClassSlot | null,
  periodMap: Map<number, Period>,
  now: Date,
): Promise<ResolvedTimetableEntry> {
  const authority = engine.resolveAuthority(slot, now);
  const isCoveredNow =
    authority.delegationState === 'live' &&
    authority.operatorRole !== 'owner' &&
    authority.operatorRole != null;

  return {
    entry,
    ownerTeacherId: slot?.ownerTeacherId ?? null,
    ownerTeacherName: slot?.ownerTeacherName ?? null,
    operatorTeacherId: authority.operatorTeacherId,
    operatorTeacherName: authority.operatorTeacherName,
    operatorRole: authority.operatorRole,
    delegationState: authority.delegationState,
    delegateUntil: authority.delegateUntil,
    isCoveredNow,
    period: periodMap.get(entry.periodIndex) ?? null,
  };
}

/** Bulk-fetch slot docs by id. Uses `in` chunks of 30. */
async function getSlotsByIds(ids: string[]): Promise<Map<string, engine.ClassSlot>> {
  const out = new Map<string, engine.ClassSlot>();
  if (ids.length === 0) return out;
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    const snap = await getDocs(
      query(collection(db, 'class_slots'), where('__name__', 'in', chunk)),
    );
    for (const d of snap.docs) {
      out.set(d.id, engine.mapSlot(d.id, d.data()));
    }
  }
  return out;
}

/** Bulk-fetch periods for a year, indexed by order. */
async function getPeriodMap(academicYear: number): Promise<Map<number, Period>> {
  const periods = await listPeriods(academicYear);
  const map = new Map<number, Period>();
  for (const p of periods) map.set(p.order, p);
  return map;
}

// ==================== PUBLIC READS ====================

/**
 * MyTimetable: every ACTIVE entry the teacher is attached to via a slot
 * (owner OR delegate), resolved with live authority.
 *
 * A cover teacher gets the same rows as the owner, automatically.
 */
export async function getTimetableForTeacher(
  teacherId: string,
  term: TermName,
  year: number,
  now: Date = new Date(),
): Promise<ResolvedTimetableEntry[]> {
  const entries = await getEntriesForTeacherSlots(teacherId, term, year, 'active');
  if (entries.length === 0) return [];

  const slotIds = Array.from(new Set(entries.map(e => e.slotId)));
  const [slotMap, periodMap] = await Promise.all([
    getSlotsByIds(slotIds),
    getPeriodMap(year),
  ]);

  const rows: ResolvedTimetableEntry[] = [];
  for (const e of entries) {
    const slot = slotMap.get(e.slotId) ?? null;
    // Only include entries the teacher is *currently* authorised on OR
    // still owns (owner keeps sight of their periods even while covered).
    const isOwner = slot?.ownerTeacherId === teacherId;
    const isOperator = engine.resolveAuthority(slot, now).operatorTeacherId === teacherId;
    if (!isOwner && !isOperator) continue;
    rows.push(await resolveEntry(e, slot, periodMap, now));
  }

  return rows.sort(
    (a, b) =>
      a.entry.className.localeCompare(b.entry.className) ||
      a.entry.dayOfWeek - b.entry.dayOfWeek ||
      a.entry.periodIndex - b.entry.periodIndex,
  );
}

/**
 * All ACTIVE entries for a class in a term, resolved with live authority.
 * Owner + delegates all visible. Used by the class-grid admin view.
 */
export async function getTimetableForClass(
  classId: string,
  term: TermName,
  year: number,
  now: Date = new Date(),
): Promise<ResolvedTimetableEntry[]> {
  const entries = await getEntriesByFilter([
    { field: 'classId', value: classId },
    { field: 'term', value: term },
    { field: 'year', value: year },
    { field: 'status', value: 'active' },
  ]);
  if (entries.length === 0) return [];

  const slotIds = Array.from(new Set(entries.map(e => e.slotId)));
  const [slotMap, periodMap] = await Promise.all([
    getSlotsByIds(slotIds),
    getPeriodMap(year),
  ]);

  const rows: ResolvedTimetableEntry[] = [];
  for (const e of entries) {
    const slot = slotMap.get(e.slotId) ?? null;
    rows.push(await resolveEntry(e, slot, periodMap, now));
  }

  return rows.sort(
    (a, b) =>
      a.entry.dayOfWeek - b.entry.dayOfWeek ||
      a.entry.periodIndex - b.entry.periodIndex ||
      a.entry.subject.localeCompare(b.entry.subject),
  );
}

/**
 * Entries for today. Filters by weekday, holidays, and (unless asked
 * otherwise) excludes non-lesson periods. Returns resolved rows sorted by
 * periodIndex.
 *
 * A holiday short-circuits to an empty list.
 */
export async function getTodayTimetableForTeacher(
  teacherId: string,
  at: Date = new Date(),
): Promise<ResolvedTimetableEntry[]> {
  const dow = toWeekday1to5(at);
  if (dow === null) return [];

  const holiday = await getHolidayCovering(formatLocalYMD(at));
  if (holiday) return [];

  const { term, year } = getCurrentAcademicTerm(at);
  const all = await getTimetableForTeacher(teacherId, term, year, at);
  return all
    .filter(r => r.entry.dayOfWeek === dow)
    .filter(r => !r.period || r.period.kind === 'lesson')
    .sort((a, b) => a.entry.periodIndex - b.entry.periodIndex);
}

/**
 * The period the teacher is *in* right now, if any. Null outside lessons,
 * on holidays, on weekends, or between periods.
 */
export async function getCurrentPeriod(
  teacherId: string,
  at: Date = new Date(),
): Promise<ResolvedTimetableEntry | null> {
  const today = await getTodayTimetableForTeacher(teacherId, at);
  if (today.length === 0) return null;

  const minutes = at.getHours() * 60 + at.getMinutes();
  for (const row of today) {
    if (!row.period) continue;
    const start = hhmmToMinutes(row.period.startTime);
    const end = hhmmToMinutes(row.period.endTime);
    if (minutes >= start && minutes < end) return row;
  }
  return null;
}

// ==================== CONFLICT DETECTION (PURE) ====================

interface ConflictInput {
  /** id is a temp identifier for new rows; slot lookups use slotId. */
  id: string;
  slotId: string;
  classId: string;
  className: string;
  subject: string;
  dayOfWeek: 1 | 2 | 3 | 4 | 5;
  periodIndex: number;
  isDouble: boolean;
  /** Owner teacherId, from the slot. */
  ownerTeacherId: string | null;
  ownerTeacherName: string | null;
}

/**
 * Expand a batch into (id, day, period) cells, accounting for doubles
 * consuming periodIndex + 1.
 */
function expandCells(rows: ConflictInput[]): Array<{
  id: string;
  slotId: string;
  classId: string;
  className: string;
  subject: string;
  ownerTeacherId: string | null;
  ownerTeacherName: string | null;
  dayOfWeek: 1 | 2 | 3 | 4 | 5;
  period: number;
  /** 'primary' = the row's own periodIndex; 'doubleTail' = the +1 slot. */
  role: 'primary' | 'doubleTail';
}> {
  const out = [] as ReturnType<typeof expandCells>;
  for (const r of rows) {
    const base = {
      id: r.id,
      slotId: r.slotId,
      classId: r.classId,
      className: r.className,
      subject: r.subject,
      ownerTeacherId: r.ownerTeacherId,
      ownerTeacherName: r.ownerTeacherName,
      dayOfWeek: r.dayOfWeek,
      role: 'primary' as const,
    };
    out.push({ ...base, period: r.periodIndex });
    if (r.isDouble) {
      out.push({ ...base, period: r.periodIndex + 1, role: 'doubleTail' as const });
    }
  }
  return out;
}

/**
 * Pure conflict detector.
 *
 *   teacher-clash   — same owner teacher, same day+period, 2+ different slots
 *   class-clash     — same class, same day+period, 2+ different slots
 *   double-overlap  — a double tail lands on a slot's primary periodIndex
 *
 * Holiday warnings are added separately by `attachHolidayWarnings`.
 */
export function detectAllConflicts(rows: ConflictInput[]): TimetableConflict[] {
  const cells = expandCells(rows);
  const conflicts: TimetableConflict[] = [];

  // Group by (day, period).
  const byCell = new Map<string, typeof cells>();
  for (const c of cells) {
    const key = `${c.dayOfWeek}:${c.period}`;
    const arr = byCell.get(key) ?? [];
    arr.push(c);
    byCell.set(key, arr);
  }

  for (const [, group] of byCell) {
    const day = group[0].dayOfWeek;
    const period = group[0].period;

    // Teacher clash — same ownerTeacherId, different slotIds.
    const byTeacher = new Map<string, typeof group>();
    for (const c of group) {
      if (!c.ownerTeacherId) continue;
      const arr = byTeacher.get(c.ownerTeacherId) ?? [];
      arr.push(c);
      byTeacher.set(c.ownerTeacherId, arr);
    }
    for (const [, arr] of byTeacher) {
      const distinctSlots = new Set(arr.map(a => a.slotId));
      if (distinctSlots.size > 1) {
        const teacherName = arr[0].ownerTeacherName ?? 'Teacher';
        const ids = Array.from(new Set(arr.map(a => a.id)));
        conflicts.push({
          kind: 'teacher-clash',
          message:
            `${teacherName} is scheduled in two places on ` +
            `${dayName(day)} period ${period}: ` +
            `${uniqueSubjects(arr).join(' & ')}.`,
          entryIds: ids,
          dayOfWeek: day,
          periodIndex: period,
        });
      }
    }

    // Class clash — same classId, different slotIds.
    const byClass = new Map<string, typeof group>();
    for (const c of group) {
      const arr = byClass.get(c.classId) ?? [];
      arr.push(c);
      byClass.set(c.classId, arr);
    }
    for (const [, arr] of byClass) {
      const distinctSlots = new Set(arr.map(a => a.slotId));
      if (distinctSlots.size > 1) {
        const ids = Array.from(new Set(arr.map(a => a.id)));
        conflicts.push({
          kind: 'class-clash',
          message:
            `${arr[0].className} has two subjects on ` +
            `${dayName(day)} period ${period}: ` +
            `${uniqueSubjects(arr).join(' & ')}.`,
          entryIds: ids,
          dayOfWeek: day,
          periodIndex: period,
        });
      }
    }

    // Double-tail landing on a primary — a double period must not be
    // overlapped by another lesson for the same class.
    const tails = group.filter(g => g.role === 'doubleTail');
    const primaries = group.filter(g => g.role === 'primary');
    if (tails.length > 0 && primaries.length > 0) {
      for (const tail of tails) {
        for (const p of primaries) {
          if (tail.slotId === p.slotId) continue;
          if (tail.classId !== p.classId) continue;
          conflicts.push({
            kind: 'double-overlap',
            message:
              `A double period in ${tail.className} overlaps ` +
              `${p.subject} at ${dayName(day)} period ${period}.`,
            entryIds: Array.from(new Set([tail.id, p.id])),
            dayOfWeek: day,
            periodIndex: period,
          });
        }
      }
    }
  }

  return dedupeConflicts(conflicts);
}

function dedupeConflicts(cs: TimetableConflict[]): TimetableConflict[] {
  const seen = new Set<string>();
  const out: TimetableConflict[] = [];
  for (const c of cs) {
    const key = `${c.kind}|${c.dayOfWeek}|${c.periodIndex}|${[...c.entryIds].sort().join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function uniqueSubjects(arr: Array<{ subject: string }>): string[] {
  return Array.from(new Set(arr.map(a => a.subject)));
}

function dayName(d: 1 | 2 | 3 | 4 | 5): string {
  return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][d - 1];
}

/** Add holiday warnings for the current term's holidays (informational). */
export function attachHolidayWarnings(
  conflicts: TimetableConflict[],
  holidays: SchoolHoliday[],
): TimetableConflict[] {
  // Holidays are date-scoped, not (day, period)-scoped. Counted once each.
  const out = [...conflicts];
  for (const h of holidays) {
    out.push({
      kind: 'holiday',
      message: `Timetable pattern overlaps ${h.name} (${h.startDate}). Lessons on that date will be skipped.`,
      entryIds: [],
      dayOfWeek: null,
      periodIndex: null,
      holidayId: h.id,
      holidayName: h.name,
      holidayDate: h.startDate,
    });
  }
  return out;
}

// ==================== SUBMIT → PENDING ====================

/**
 * Submit a teacher's timetable for admin approval.
 *
 *   classIdsFilter = [c1, c2]  → replaces only pending rows for those
 *                                 classes (per-class submission)
 *   classIdsFilter = null      → replaces ALL of this teacher's pending
 *                                 rows for the term (submit-all flow)
 *
 * ACTIVE rows are NOT touched here. They stay live until an admin
 * approves this submission. This is what "the previous active version
 * stays live until approval" means operationally.
 *
 * Conflicts are detected and returned; they do NOT block submission — an
 * admin decides during approval.
 */
export async function submitTimetable(
  teacherId: string,
  teacherName: string,
  req: SubmitTimetableRequest,
): Promise<SubmitTimetableResult> {
  // 1. Verify the teacher actually operates each slot in the request.
  const slotsById = await getSlotsByIds(
    Array.from(new Set(req.entries.map(e => e.slotId))),
  );
  const now = new Date();
  const periodMap = await getPeriodMap(req.year);

  for (const input of req.entries) {
    const slot = slotsById.get(input.slotId);
    if (!slot) throw new Error(`Unknown slot: ${input.slotId}`);
    const auth = engine.resolveAuthority(slot, now);
    const isOwner = slot.ownerTeacherId === teacherId;
    const isDelegate = auth.operatorTeacherId === teacherId;
    if (!isOwner && !isDelegate) {
      throw new Error(
        `You don't currently teach ${slot.subject} in ${slot.className}.`,
      );
    }
    const period = periodMap.get(input.periodIndex);
    if (!period) throw new Error(`Unknown period #${input.periodIndex}.`);
    if (period.kind !== 'lesson') {
      throw new Error(`${period.name} is a ${period.kind} — a lesson can't be scheduled there.`);
    }
  }

  // 2. Denormalize for storage & run conflict detection.
  const payloadRows: ConflictInput[] = req.entries.map((e, i) => {
    const slot = slotsById.get(e.slotId)!;
    return {
      id: `new-${i}-${e.slotId}-${e.dayOfWeek}-${e.periodIndex}`,
      slotId: e.slotId,
      classId: slot.classId,
      className: slot.className,
      subject: slot.subject,
      dayOfWeek: e.dayOfWeek,
      periodIndex: e.periodIndex,
      isDouble: e.isDouble,
      ownerTeacherId: slot.ownerTeacherId,
      ownerTeacherName: slot.ownerTeacherName,
    };
  });
  const conflicts = detectAllConflicts(payloadRows);

  // 3. Read currently pending rows in the affected scope.
  const pendingRows = await getEntriesForTeacherSlots(
    teacherId,
    req.term,
    req.year,
    'pending',
  );
  const pendingToReplace = req.classIdsFilter
    ? pendingRows.filter(p => req.classIdsFilter!.includes(p.classId))
    : pendingRows;

  // 4. Write in a batch.
  const batch = writeBatch(db);

  for (const p of pendingToReplace) {
    batch.delete(doc(db, ENTRIES, p.id));
  }

  const batchId = `${teacherId}__${Date.now()}`;
  for (const e of req.entries) {
    const slot = slotsById.get(e.slotId)!;
    const ref = doc(collection(db, ENTRIES));
    batch.set(ref, {
      slotId: e.slotId,
      classId: slot.classId,
      className: slot.className,
      subject: slot.subject,
      normalizedSubject: slot.normalizedSubject,
      term: req.term,
      year: req.year,
      dayOfWeek: e.dayOfWeek,
      periodIndex: e.periodIndex,
      isDouble: e.isDouble,
      status: 'pending' as TimetableEntryStatus,
      submittedByUid: teacherId,
      submittedAt: serverTimestamp(),
      approvedByUid: null,
      approvedAt: null,
      rejectedReason: null,
      batchId,
      teacherName,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();

  return {
    submissionId: batchId,
    submittedCount: req.entries.length,
    replacedPendingCount: pendingToReplace.length,
    conflicts,
  };
}

// ==================== APPROVE / REJECT ====================

/**
 * Admin: approve a pending submission batch.
 *
 * Transactionally, for each (slotId, day, period) in the batch:
 *   • archive any ACTIVE row it collides with
 *   • promote the pending row to 'active' and record approver
 *
 * Rows that don't collide simply flip to 'active'.
 */
export async function approveSubmission(
  submissionId: string,
  adminUid: string,
): Promise<ApproveTimetableResult> {
  const pendingSnap = await getDocs(
    query(collection(db, ENTRIES), where('batchId', '==', submissionId)),
  );
  if (pendingSnap.empty) {
    throw new Error('This submission no longer exists.');
  }

  const pendingRows = pendingSnap.docs.map(d => ({
    ref: d.ref,
    ...mapEntry(d.id, d.data()),
  }));
  const term = pendingRows[0].term;
  const year = pendingRows[0].year;
  const slotIds = Array.from(new Set(pendingRows.map(p => p.slotId)));

  // Fetch ACTIVE rows for the involved slots in this term.
  const activeRows: TimetableEntry[] = [];
  for (let i = 0; i < slotIds.length; i += 30) {
    const chunk = slotIds.slice(i, i + 30);
    const snap = await getDocs(
      query(
        collection(db, ENTRIES),
        where('slotId', 'in', chunk),
        where('term', '==', term),
        where('year', '==', year),
        where('status', '==', 'active'),
      ),
    );
    activeRows.push(...snap.docs.map(d => mapEntry(d.id, d.data())));
  }

  const toArchive = activeRows.filter(a =>
    pendingRows.some(
      p => p.slotId === a.slotId && p.dayOfWeek === a.dayOfWeek && p.periodIndex === a.periodIndex,
    ),
  );

  await runTransaction(db, async tx => {
    for (const a of toArchive) {
      tx.set(
        doc(db, ENTRIES, a.id),
        { status: 'archived', updatedAt: serverTimestamp() },
        { merge: true },
      );
    }
    for (const p of pendingRows) {
      tx.set(
        p.ref,
        {
          status: 'active' as TimetableEntryStatus,
          approvedByUid: adminUid,
          approvedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    }
  });

  return {
    submissionId,
    approvedCount: pendingRows.length,
    archivedCount: toArchive.length,
  };
}

export async function rejectSubmission(
  submissionId: string,
  reason: string,
): Promise<RejectTimetableResult> {
  const snap = await getDocs(
    query(collection(db, ENTRIES), where('batchId', '==', submissionId)),
  );
  if (snap.empty) return { submissionId, rejectedCount: 0 };

  const batch = writeBatch(db);
  for (const d of snap.docs) {
    batch.set(
      d.ref,
      {
        status: 'rejected' as TimetableEntryStatus,
        rejectedReason: reason || 'Rejected by admin.',
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }
  await batch.commit();
  return { submissionId, rejectedCount: snap.size };
}

/**
 * Admin approval queue: all pending batches, grouped and enriched.
 */
export async function getPendingSubmissions(): Promise<PendingSubmission[]> {
  const snap = await getDocs(
    query(collection(db, ENTRIES), where('status', '==', 'pending')),
  );
  if (snap.empty) return [];

  const entries = snap.docs.map(d => mapEntry(d.id, d.data()));

  // Group by batchId (fallback to submittedByUid + submittedAt millis).
  const groups = new Map<string, TimetableEntry[]>();
  for (const e of entries) {
    const key =
      e.batchId ??
      `${e.submittedByUid}__${tsToMillis(e.submittedAt) || Date.now()}`;
    const arr = groups.get(key) ?? [];
    arr.push(e);
    groups.set(key, arr);
  }

  // Fetch submitter names in bulk.
  const uids = Array.from(
    new Set(entries.map(e => e.submittedByUid).filter(Boolean)),
  ) as string[];
  const nameMap = new Map<string, string>();
  for (let i = 0; i < uids.length; i += 30) {
    const chunk = uids.slice(i, i + 30);
    const uSnap = await getDocs(
      query(collection(db, USERS), where('__name__', 'in', chunk)),
    );
    for (const u of uSnap.docs) {
      const data = u.data();
      nameMap.set(u.id, data.fullName || data.name || 'Unknown teacher');
    }
  }

  // Build PendingSubmission objects, one per group.
  const out: PendingSubmission[] = [];
  for (const [id, rows] of groups) {
    const first = rows[0];
    const submittedAt = new Date(tsToMillis(first.submittedAt) || Date.now());
    const classIds = Array.from(new Set(rows.map(r => r.classId)));
    const classNames = Array.from(new Set(rows.map(r => r.className)));

    // Reconstruct conflict inputs from the slots.
    const slotIds = Array.from(new Set(rows.map(r => r.slotId)));
    const slotMap = await getSlotsByIds(slotIds);
    const conflictInputs: ConflictInput[] = rows.map((r, i) => {
      const slot = slotMap.get(r.slotId) ?? null;
      return {
        id: `p-${i}-${r.id}`,
        slotId: r.slotId,
        classId: r.classId,
        className: r.className,
        subject: r.subject,
        dayOfWeek: r.dayOfWeek,
        periodIndex: r.periodIndex,
        isDouble: r.isDouble,
        ownerTeacherId: slot?.ownerTeacherId ?? null,
        ownerTeacherName: slot?.ownerTeacherName ?? null,
      };
    });

    out.push({
      id,
      submittedByUid: first.submittedByUid ?? '',
      submittedByName: nameMap.get(first.submittedByUid ?? '') ?? 'Unknown teacher',
      submittedAt,
      entries: rows,
      classIds,
      classNames,
      term: first.term,
      year: first.year,
      conflicts: detectAllConflicts(conflictInputs),
    });
  }

  return out.sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime());
}

// ==================== COVERAGE (ADMIN MONITORING) ====================

/**
 * For a given local date, compute per-class coverage: expected periods
 * (from ACTIVE timetable entries) vs actually-marked attendance sessions.
 *
 * Short-circuits to zero rows on weekends and holidays.
 */
export async function getCoverageForDate(
  dateYMD: string,
  at: Date = new Date(),
): Promise<CoverageRow[]> {
  const dow = toWeekday1to5(new Date(`${dateYMD}T00:00:00`));
  if (dow === null) return [];

  const holiday = await getHolidayCovering(dateYMD);
  if (holiday) return [];

  // Which term are we in on this date?
  const dt = new Date(`${dateYMD}T00:00:00`);
  const { term, year } = getCurrentAcademicTerm(dt);

  // All ACTIVE entries for this weekday.
  const snap = await getDocs(
    query(
      collection(db, ENTRIES),
      where('term', '==', term),
      where('year', '==', year),
      where('status', '==', 'active'),
      where('dayOfWeek', '==', dow),
    ),
  );
  const entries = snap.docs.map(d => mapEntry(d.id, d.data()));
  if (entries.length === 0) return [];

  // Resolve authority for each entry.
  const slotIds = Array.from(new Set(entries.map(e => e.slotId)));
  const [slotMap, periodMap] = await Promise.all([
    getSlotsByIds(slotIds),
    getPeriodMap(year),
  ]);
  const resolved = await Promise.all(
    entries.map(e => resolveEntry(e, slotMap.get(e.slotId) ?? null, periodMap, at)),
  );

  // Fetch attendance sessions for the date.
  const sessionSnap = await getDocs(
    query(collection(db, 'attendance_sessions'), where('date', '==', dateYMD)),
  );
  const sessionsByClass = new Map<
    string,
    Array<{
      period: number;
      subject: string;
      normalizedSubject: string;
      markedBy: string;
      markedByName: string;
    }>
  >();
  for (const s of sessionSnap.docs) {
    const d = s.data() as DocumentData;
    if (d.kind !== 'periodic') continue;
    const arr = sessionsByClass.get(d.classId) ?? [];
    arr.push({
      period: d.period,
      subject: d.subject,
      normalizedSubject: d.subject ? d.subject.toLowerCase() : '',
      markedBy: d.markedBy,
      markedByName: d.markedByName,
    });
    sessionsByClass.set(d.classId, arr);
  }

  // Group by class, compute missing & rate.
  const byClass = new Map<string, ResolvedTimetableEntry[]>();
  for (const r of resolved) {
    const arr = byClass.get(r.entry.classId) ?? [];
    arr.push(r);
    byClass.set(r.entry.classId, arr);
  }

  const rows: CoverageRow[] = [];
  for (const [classId, expected] of byClass) {
    const marked = sessionsByClass.get(classId) ?? [];

    const missing = expected.filter(e => {
      const anyMatch = marked.some(
        m =>
          m.period === e.entry.periodIndex &&
          (m.normalizedSubject === e.entry.normalizedSubject ||
            m.subject === e.entry.subject),
      );
      return !anyMatch;
    });

    const expectedCount = expected.length;
    const missingCount = missing.length;
    const coverageRate =
      expectedCount === 0
        ? 100
        : Math.round(((expectedCount - missingCount) / expectedCount) * 100);

    rows.push({
      classId,
      className: expected[0].entry.className,
      expectedEntries: expected,
      expectedCount,
      markedSessions: marked,
      markedCount: marked.length,
      missingEntries: missing,
      missingCount,
      coverageRate,
    });
  }

  return rows.sort((a, b) => a.className.localeCompare(b.className));
}

/**
 * Per-teacher coverage for a given date. Combines:
 *   • what they were expected to teach (from ACTIVE entries they operate)
 *   • what they actually marked (from attendance_sessions.markedBy)
 *   • whether any of their owned slots still need cover
 */
export async function getCoverageForTeachers(
  dateYMD: string,
  at: Date = new Date(),
): Promise<TeacherCoverageRow[]> {
  const byClass = await getCoverageForDate(dateYMD, at);
  if (byClass.length === 0) return [];

  // Flatten expected entries.
  const expected = byClass.flatMap(c => c.expectedEntries);

  // Group by operator teacher.
  const byTeacher = new Map<string, ResolvedTimetableEntry[]>();
  for (const e of expected) {
    if (!e.operatorTeacherId) continue;
    const arr = byTeacher.get(e.operatorTeacherId) ?? [];
    arr.push(e);
    byTeacher.set(e.operatorTeacherId, arr);
  }
  if (byTeacher.size === 0) return [];

  // Fetch user docs for names + status.
  const teacherIds = Array.from(byTeacher.keys());
  const userMap = new Map<string, { name: string; status: TeacherCoverageRow['status'] }>();
  for (let i = 0; i < teacherIds.length; i += 30) {
    const chunk = teacherIds.slice(i, i + 30);
    const uSnap = await getDocs(query(collection(db, USERS), where('__name__', 'in', chunk)));
    for (const u of uSnap.docs) {
      const d = u.data();
      userMap.set(u.id, {
        name: d.fullName || d.name || 'Unknown teacher',
        status: (d.status as TeacherCoverageRow['status']) || 'active',
      });
    }
  }

  // Fetch sessions for the date, group by markedBy.
  const sessionSnap = await getDocs(
    query(collection(db, 'attendance_sessions'), where('date', '==', dateYMD)),
  );
  const markedByTeacher = new Map<string, number>();
  for (const s of sessionSnap.docs) {
    const d = s.data() as DocumentData;
    if (d.kind !== 'periodic') continue;
    markedByTeacher.set(d.markedBy, (markedByTeacher.get(d.markedBy) ?? 0) + 1);
  }

  // Uncovered slots per teacher (owner on leave with no cover).
  const uncoveredSlots = await engine.getUncoveredSlots(at);
  const uncoveredOwners = new Set(
    uncoveredSlots.map(s => s.ownerTeacherId).filter(Boolean),
  );

  const rows: TeacherCoverageRow[] = [];
  for (const [teacherId, entries] of byTeacher) {
    const meta = userMap.get(teacherId) ?? { name: 'Unknown teacher', status: 'active' as const };
    const expectedCount = entries.length;
    const markedCount = markedByTeacher.get(teacherId) ?? 0;
    const missingCount = Math.max(0, expectedCount - markedCount);
    rows.push({
      teacherId,
      teacherName: meta.name,
      status: meta.status,
      expectedEntries: entries,
      expectedCount,
      markedCount,
      missingEntries: entries.slice(0, missingCount),
      missingCount,
      coverageRate:
        expectedCount === 0
          ? 100
          : Math.round((markedCount / expectedCount) * 100),
      hasUncoveredSlots: uncoveredOwners.has(teacherId),
    });
  }

  return rows.sort(
    (a, b) =>
      a.coverageRate - b.coverageRate ||
      a.teacherName.localeCompare(b.teacherName),
  );
}

// ==================== MY CLASSES (helper for teacher UI) ====================

/**
 * Distinct classes a teacher operates ACTIVE entries for, in the given
 * term. Used by MyTimetable to render one grid per class.
 */
export async function getMyTimetableClasses(
  teacherId: string,
  term: TermName,
  year: number,
): Promise<Array<{ classId: string; className: string; subjects: string[] }>> {
  const rows = await getTimetableForTeacher(teacherId, term, year);
  const byClass = new Map<string, { classId: string; className: string; subjects: Set<string> }>();
  for (const r of rows) {
    let e = byClass.get(r.entry.classId);
    if (!e) {
      e = { classId: r.entry.classId, className: r.entry.className, subjects: new Set() };
      byClass.set(r.entry.classId, e);
    }
    e.subjects.add(r.entry.subject);
  }
  return Array.from(byClass.values())
    .map(e => ({
      classId: e.classId,
      className: e.className,
      subjects: Array.from(e.subjects).sort(),
    }))
    .sort((a, b) => a.className.localeCompare(b.className));
}

// ==================== EXPORTS ====================

export const timetableService = {
  // Periods
  listPeriods,
  getPeriodById,
  upsertPeriod,
  deletePeriod,
  seedDefaultPeriods,

  // Holidays
  listHolidays,
  listHolidaysForYear,
  upsertHoliday,
  deleteHoliday,
  getHolidayCovering,

  // Reads
  getEntriesForSlot,
  getTimetableForTeacher,
  getTimetableForClass,
  getTodayTimetableForTeacher,
  getCurrentPeriod,
  getMyTimetableClasses,

  // Workflow
  submitTimetable,
  approveSubmission,
  rejectSubmission,
  getPendingSubmissions,

  // Coverage
  getCoverageForDate,
  getCoverageForTeachers,

  // Utilities
  formatLocalYMD,
  detectAllConflicts,
  attachHolidayWarnings,
};