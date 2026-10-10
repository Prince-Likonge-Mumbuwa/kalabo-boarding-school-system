// Timetable data check: find and repair rows written by older versions of
// the app. Read-only until a fix is run; each fix only touches what it lists.

import { collection, doc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import * as engine from '@/services/assignmentEngine';
import { listPeriods } from '@/services/timetableService';
import {
  checkClashes,
  dayName,
  legacyDoubleOrders,
  lessonPeriods,
  planSchoolBell,
  type BellPlan,
  type RowLike,
} from '@/services/timetableModel';
import { makeSessionId } from '@/types/attendance';
import { normalizeSubjectName } from '@/services/resultsService';
import type { Period, TimetableConflict } from '@/types/timetable';
import type { TermName } from '@/utils/academicTerm';

const ENTRIES = 'timetable_entries';

export interface CheckRow extends RowLike {
  id: string;
  status: string;
  isDouble: boolean;
  normalizedSubject: string;
  data: Record<string, any>;
}

export interface TimetableDataCheck {
  term: TermName;
  year: number;
  checkedRows: number;
  /** Old one-row doubles (active or pending). */
  legacyDoubles: CheckRow[];
  /** Live copies of the same subject/day/period beyond the first. */
  duplicates: CheckRow[];
  /** Live rows on a break/lunch/assembly or a period that no longer exists. */
  notLessons: CheckRow[];
  /** Live rows whose subject (class slot) no longer exists. */
  orphans: CheckRow[];
  /** Clashes in the live timetable (fix by editing the timetable). */
  clashes: TimetableConflict[];
  periods: Period[];
  /** `slot|day|period|status` of every row (to avoid creating duplicates). */
  rowKeys: Set<string>;
  /**
   * The year's bell schedule vs the school's (P1–P4 07:20–10:00, Break
   * 10:00–10:20, P5–P8 10:20–13:00). While lesson numbers would change,
   * the other checks are skipped (they would misread old numbers).
   */
  bell: BellPlan;
  needsRenumber: boolean;
}

export const describeRow = (r: CheckRow, periods: Period[]) =>
  `${r.className} ${r.subject} — ${dayName(r.dayOfWeek)} ${periods.find(p => p.order === r.periodIndex)?.name ?? `#${r.periodIndex}`}`;

export async function runTimetableDataCheck(term: TermName, year: number): Promise<TimetableDataCheck> {
  const [snap, periods, allPeriods, slotSnap] = await Promise.all([
    getDocs(query(collection(db, ENTRIES), where('term', '==', term), where('year', '==', year))),
    listPeriods(year),
    listPeriods(year, { includeInactive: true }),
    getDocs(collection(db, 'class_slots')),
  ]);
  const bell = planSchoolBell(allPeriods);
  const needsRenumber = bell.remap.size > 0 || bell.dropped.length > 0;
  const slots = new Map(slotSnap.docs.map(d => [d.id, engine.mapSlot(d.id, d.data())]));
  const rows: CheckRow[] = snap.docs.map(d => {
    const x = d.data();
    return {
      id: d.id,
      slotId: x.slotId,
      classId: x.classId,
      className: x.className ?? '',
      subject: x.subject ?? '',
      normalizedSubject: x.normalizedSubject ?? '',
      dayOfWeek: x.dayOfWeek,
      periodIndex: x.periodIndex,
      status: x.status ?? 'active',
      isDouble: x.isDouble === true,
      data: x,
    };
  });
  const active = rows.filter(r => r.status === 'active');
  const rowKeys = new Set(rows.map(r => `${r.slotId}|${r.dayOfWeek}|${r.periodIndex}|${r.status}`));
  if (needsRenumber) {
    return {
      term, year, checkedRows: rows.length, legacyDoubles: [], duplicates: [], notLessons: [], orphans: [],
      clashes: [], periods, rowKeys, bell, needsRenumber,
    };
  }
  const lessonNumbers = new Set(lessonPeriods(periods).map(p => p.order));

  const legacyDoubles = rows.filter(r => r.isDouble && (r.status === 'active' || r.status === 'pending'));
  const orphans = active.filter(r => !slots.has(r.slotId));
  const notLessons = active.filter(r => slots.has(r.slotId) && !lessonNumbers.has(r.periodIndex));

  const seen = new Set<string>();
  const duplicates: CheckRow[] = [];
  for (const r of [...active].sort((a, b) => a.id.localeCompare(b.id))) {
    const k = `${r.slotId}|${r.dayOfWeek}|${r.periodIndex}`;
    if (seen.has(k)) duplicates.push(r);
    else seen.add(k);
  }

  // Clashes among the remaining live rows (old doubles expanded).
  const skip = new Set([...duplicates, ...orphans, ...notLessons].map(r => r.id));
  const clean: RowLike[] = [];
  for (const r of active) {
    if (skip.has(r.id)) continue;
    clean.push(r);
    if (r.isDouble) {
      const next = legacyDoubleOrders(r.periodIndex, periods)[1];
      if (next !== undefined) clean.push({ ...r, periodIndex: next });
    }
  }
  const teachersBySlot = new Map<string, Array<{ id: string; name: string }>>();
  const now = new Date();
  for (const s of slots.values()) {
    const ts: Array<{ id: string; name: string }> = [];
    if (s.ownerTeacherId) ts.push({ id: s.ownerTeacherId, name: s.ownerTeacherName ?? 'Teacher' });
    const a = engine.resolveAuthority(s, now);
    if (a.delegationState === 'live' && a.operatorTeacherId && a.operatorTeacherId !== s.ownerTeacherId) {
      ts.push({ id: a.operatorTeacherId, name: a.operatorTeacherName ?? 'Teacher' });
    }
    teachersBySlot.set(s.id, ts);
  }
  const clashes = checkClashes(clean, { live: [], teachersBySlot, replaceSlotIds: new Set(), periods }).filter(
    c => c.kind !== 'not-lesson',
  );

  return {
    term, year, checkedRows: rows.length, legacyDoubles, duplicates, notLessons, orphans, clashes, periods, rowKeys,
    bell, needsRenumber,
  };
}

async function commitInChunks(ops: Array<(b: ReturnType<typeof writeBatch>) => void>) {
  for (let i = 0; i < ops.length; i += 200) { // ≤ 2 writes per op, batch limit 500
    const b = writeBatch(db);
    ops.slice(i, i + 200).forEach(op => op(b));
    await b.commit();
  }
}

/** Turn each old double row into one row per period. */
export async function fixLegacyDoubles(check: TimetableDataCheck): Promise<number> {
  const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
  for (const r of check.legacyDoubles) {
    const next = legacyDoubleOrders(r.periodIndex, check.periods)[1];
    ops.push(b => b.set(doc(db, ENTRIES, r.id), { isDouble: false, updatedAt: serverTimestamp() }, { merge: true }));
    if (next !== undefined && !check.rowKeys.has(`${r.slotId}|${r.dayOfWeek}|${next}|${r.status}`)) {
      ops.push(b =>
        b.set(doc(collection(db, ENTRIES)), {
          ...r.data,
          periodIndex: next,
          isDouble: false,
          splitFrom: r.id,
          updatedAt: serverTimestamp(),
        }),
      );
    }
  }
  await commitInChunks(ops);
  return check.legacyDoubles.length;
}

/** Retire duplicates, rows on non-lesson periods and rows of deleted subjects. */
export async function archiveBadRows(check: TimetableDataCheck): Promise<number> {
  const bad = [...check.duplicates, ...check.notLessons, ...check.orphans];
  await commitInChunks(
    bad.map(r => (b: ReturnType<typeof writeBatch>) =>
      b.set(doc(db, ENTRIES, r.id), { status: 'archived', updatedAt: serverTimestamp() }, { merge: true }),
    ),
  );
  return bad.length;
}

/**
 * Make a year's bell schedule exactly the school's, and move every timetable
 * row (all terms of that year) and every lesson register (dated that year)
 * to the new lesson numbers. A register is re-saved under its new id and the
 * old one removed; one that would overwrite another is left and counted.
 * Timetable rows of a dropped 9th+ lesson are retired. Returns counts.
 */
export async function applySchoolBell(year: number, plan: BellPlan) {
  const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
  for (const u of plan.updates) {
    ops.push(b => b.set(doc(db, 'periods', u.id), { ...u.set, updatedAt: serverTimestamp() }, { merge: true }));
  }
  for (const c of plan.creates) {
    ops.push(b =>
      b.set(doc(collection(db, 'periods')), {
        ...c, academicYear: year, isActive: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      }),
    );
  }
  const moved = (from: number) => {
    const to = plan.remap.get(from);
    return to !== undefined && to !== from ? to : null;
  };

  let rows = 0;
  let retired = 0;
  const entries = await getDocs(query(collection(db, ENTRIES), where('year', '==', year)));
  for (const d of entries.docs) {
    const x = d.data();
    if (plan.dropped.includes(x.periodIndex) && x.status !== 'archived') {
      retired++;
      ops.push(b => b.set(d.ref, { status: 'archived', updatedAt: serverTimestamp() }, { merge: true }));
      continue;
    }
    const to = moved(x.periodIndex);
    if (to === null) continue;
    rows++;
    ops.push(b => b.set(d.ref, { periodIndex: to, updatedAt: serverTimestamp() }, { merge: true }));
  }

  // Registers: lessons keep their time order, so new numbers are never
  // higher than old ones; moving in ascending order never overwrites one.
  let registers = 0;
  let conflicts = 0;
  const sessions = await getDocs(
    query(collection(db, 'attendance_sessions'), where('date', '>=', `${year}-01-01`), where('date', '<=', `${year}-12-31`)),
  );
  const periodic = sessions.docs
    .filter(d => d.data().kind === 'periodic' && moved(d.data().period) !== null)
    .sort((a, b) => a.data().period - b.data().period);
  const existingIds = new Set(sessions.docs.map(d => d.id));
  for (const d of periodic) {
    const x = d.data();
    const to = moved(x.period)!;
    const id = makeSessionId(x.classId, x.date, 'periodic', to, normalizeSubjectName(x.subject));
    if (existingIds.has(id) && id !== d.id) {
      conflicts++;
      continue;
    }
    existingIds.delete(d.id);
    existingIds.add(id);
    registers++;
    ops.push(b => {
      b.set(doc(db, 'attendance_sessions', id), { ...x, id, period: to });
      b.delete(d.ref);
    });
  }
  await commitInChunks(ops);
  return { periods: plan.updates.length + plan.creates.length, rows, retired, registers, conflicts };
}

/** Load the year's bell schedule and apply the school's to it (Periods tab). */
export async function resetToSchoolBell(year: number) {
  const plan = planSchoolBell(await listPeriods(year, { includeInactive: true }));
  if (plan.upToDate) return { periods: 0, rows: 0, retired: 0, registers: 0, conflicts: 0 };
  return applySchoolBell(year, plan);
}
