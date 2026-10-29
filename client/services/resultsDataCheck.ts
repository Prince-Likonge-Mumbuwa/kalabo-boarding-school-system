// @/services/resultsDataCheck.ts
//
// Admin data check for results consistency. `runDataCheck` only READS.
// Each fix is a separate, explicit admin action that first reports exactly
// what it will change.
//
// What it finds:
//   1. Learners without `status`        → other screens (attendance, analysis)
//                                           skip them; the results grid
//                                           already counts them as active.
//   2. Learners without `studentIndex`  → dropped by queries ordered by index.
//   3. Learners without a custom id, and custom ids used by more than one
//      learner (report only — fixing ids needs a person to decide).
//   4. Results rows without `normalizedSubject` → once authority is
//      enforced, the rules refuse teacher edits of these rows.
//   5. Results saved under a term that had already ENDED when they were
//      saved (e.g. Term 3 marks saved as Term 1 because the page opened on
//      Term 1).
//   6. Results for learners who are no longer active in that class
//      (moved / archived) — report only; the grid ignores them.
//   7. Whether system/assignmentEngine.enforceAuthority is on.
//   8. The same subject saved under different spellings ("PRINCIPLES OF
//      ACCOUNTS" / "Priciples of Accounts"), in ALL terms, and classes with
//      two assignments for one subject (findSubjectSpellings).

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  setDoc,
  Timestamp,
  serverTimestamp,
} from '@/lib/auditedFirestore';
import { loadClosedMembership } from '@/services/enrollmentService';
import { db } from '@/lib/firebase';
import { slotKeyFor } from '@/services/resultsGridLoader';
import { isKnownSubject, normalizeSubjectName } from '@/services/resultsService';
import { isCountedLearner } from '@/services/resultsGrid';
import { getCurrentAcademicTerm, getTermByName, type TermName } from '@/utils/academicTerm';

const TERM_ORDER: Record<string, number> = { 'Term 1': 1, 'Term 2': 2, 'Term 3': 3 };
const termIndex = (term: string, year: number) => year * 10 + (TERM_ORDER[term] ?? 0);

export interface WrongTermGroup {
  key: string;
  classId: string;
  className: string;
  subjectId: string;
  examType: string;
  savedAs: { term: string; year: number };
  savedDuring: { term: TermName; year: number };
  resultIds: string[];
  /** Rows that already exist under the target term (would be overwritten) */
  conflicts: number;
}

export interface DataCheckReport {
  term: string;
  year: number;
  learners: {
    total: number;
    missingStatus: Array<{ id: string; name: string; classId: string }>;
    missingStudentIndex: Array<{ id: string; name: string; classId: string }>;
    missingStudentId: Array<{ id: string; name: string; classId: string }>;
    duplicateStudentIds: Array<{ studentId: string; learnerIds: string[] }>;
  };
  results: {
    totalForTerm: number;
    missingNormalizedSubject: string[];
    offRoster: Array<{ id: string; studentId: string; classId: string; subjectId: string }>;
    wrongTerm: WrongTermGroup[];
  };
  engine: { migrated: boolean; enforceAuthority: boolean };
}

const BATCH = 450;
async function commitInBatches(ops: Array<(b: ReturnType<typeof writeBatch>) => void>) {
  for (let i = 0; i < ops.length; i += BATCH) {
    const b = writeBatch(db);
    ops.slice(i, i + BATCH).forEach(op => op(b));
    await b.commit();
  }
}

const resultId = (studentDocId: string, subjectId: string, examType: string, term: string, year: number) =>
  `${studentDocId}_${subjectId}_${examType}_${term.replace(/\s+/g, '')}_${year}`;

/** READ ONLY. */
export async function runDataCheck(term: string, year: number): Promise<DataCheckReport> {
  const [learnerSnap, resultSnap, classSnap, engineSnap] = await Promise.all([
    getDocs(collection(db, 'learners')),
    getDocs(query(collection(db, 'results'), where('term', '==', term), where('year', '==', year))),
    getDocs(collection(db, 'classes')),
    getDoc(doc(db, 'system', 'assignmentEngine')),
  ]);
  // A closed year's cohort has moved on: its marks belong to the class the
  // learner was in that year, not their current class.
  const closedMembership = await loadClosedMembership(year);

  const classNames = new Map(classSnap.docs.map(d => [d.id, (d.data().name as string) || d.id]));
  const learners = learnerSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const nameOf = (l: any) => l.fullName || l.name || l.studentName || l.id;

  const byCustom = new Map<string, string[]>();
  for (const l of learners) {
    if (l.studentId) byCustom.set(l.studentId, [...(byCustom.get(l.studentId) ?? []), l.id]);
  }
  const learnerById = new Map(learners.map(l => [l.id, l]));

  const report: DataCheckReport = {
    term,
    year,
    learners: {
      total: learners.length,
      missingStatus: learners.filter(l => l.status === undefined || l.status === null || l.status === '')
        .map(l => ({ id: l.id, name: nameOf(l), classId: l.classId })),
      missingStudentIndex: learners.filter(l => typeof l.studentIndex !== 'number')
        .map(l => ({ id: l.id, name: nameOf(l), classId: l.classId })),
      missingStudentId: learners.filter(l => !l.studentId)
        .map(l => ({ id: l.id, name: nameOf(l), classId: l.classId })),
      duplicateStudentIds: [...byCustom.entries()].filter(([, ids]) => ids.length > 1)
        .map(([studentId, learnerIds]) => ({ studentId, learnerIds })),
    },
    results: { totalForTerm: resultSnap.size, missingNormalizedSubject: [], offRoster: [], wrongTerm: [] },
    engine: {
      migrated: engineSnap.exists(),
      enforceAuthority: engineSnap.exists() && engineSnap.data()?.enforceAuthority === true,
    },
  };

  const groups = new Map<string, WrongTermGroup>();
  for (const d of resultSnap.docs) {
    const r = d.data() as any;
    if (!r.normalizedSubject) report.results.missingNormalizedSubject.push(d.id);

    const learner = learnerById.get(r.studentId) ?? learnerById.get(byCustom.get(r.studentId)?.[0] ?? '');
    const closedClass = learner ? closedMembership.get(learner.id) : undefined;
    const onRoster = closedClass !== undefined
      ? closedClass === r.classId
      : !!learner && learner.classId === r.classId && isCountedLearner(learner);
    if (!onRoster) {
      report.results.offRoster.push({ id: d.id, studentId: r.studentId, classId: r.classId, subjectId: r.subjectId });
    }

    // Saved AFTER the term it is filed under had ended → probably saved
    // under the wrong term. (Term 3 runs into January, so January saves for
    // Term 3 are not flagged.) Admin reviews before moving anything.
    const created = r.createdAt ? new Date(r.createdAt) : null;
    const filedTerm = getTermByName(r.term, Number(r.year));
    if (created && !Number.isNaN(created.getTime()) && filedTerm && created > filedTerm.endDate) {
      const during = getCurrentAcademicTerm(created);
      if (termIndex(during.term, during.year) > termIndex(r.term, Number(r.year))) {
        const key = `${r.classId}|${r.subjectId}|${r.examType}|${during.term}|${during.year}`;
        const g = groups.get(key) ?? {
          key,
          classId: r.classId,
          className: classNames.get(r.classId) ?? r.classId,
          subjectId: r.subjectId,
          examType: r.examType,
          savedAs: { term: r.term, year: Number(r.year) },
          savedDuring: { term: during.term, year: during.year },
          resultIds: [],
          conflicts: 0,
        };
        g.resultIds.push(d.id);
        groups.set(key, g);
      }
    }
  }

  // Count rows that already exist under the target term (moving would overwrite them).
  for (const g of groups.values()) {
    const target = await getDocs(query(
      collection(db, 'results'),
      where('classId', '==', g.classId),
      where('subjectId', '==', g.subjectId),
      where('examType', '==', g.examType),
      where('term', '==', g.savedDuring.term),
      where('year', '==', g.savedDuring.year),
    ));
    g.conflicts = target.size;
  }
  report.results.wrongTerm = [...groups.values()];
  return report;
}

// ==================== FIXES (admin only, each one explicit) ====================

/** Set status "active" on learners that have no status. Returns how many. */
export async function fixMissingLearnerStatus(ids: string[]): Promise<number> {
  await commitInBatches(ids.map(id => b => b.update(doc(db, 'learners', id), { status: 'active' })));
  return ids.length;
}

/** Give learners without a studentIndex the next free index in their class. */
export async function fixMissingStudentIndex(items: Array<{ id: string; classId: string }>): Promise<number> {
  const byClass = new Map<string, string[]>();
  for (const it of items) byClass.set(it.classId, [...(byClass.get(it.classId) ?? []), it.id]);
  const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
  for (const [classId, ids] of byClass) {
    const snap = await getDocs(query(collection(db, 'learners'), where('classId', '==', classId)));
    let next = Math.max(0, ...snap.docs.map(d => (typeof d.data().studentIndex === 'number' ? d.data().studentIndex : 0))) + 1;
    for (const id of ids) {
      const idx = next++;
      ops.push(b => b.update(doc(db, 'learners', id), { studentIndex: idx }));
    }
  }
  await commitInBatches(ops);
  return items.length;
}

/**
 * Add `normalizedSubject` (the slot key) to results rows missing it — the key
 * of the class's REAL subject assignment, whatever spelling it was created
 * under (an assignment made as "PRINCIPLES OF ACCOUNTS" keeps that key), so
 * the teacher can still edit the marks once the rules check it. Reads the
 * rows and the assignments once.
 */
export async function fixMissingNormalizedSubject(resultIds: string[]): Promise<number> {
  const wanted = new Set(resultIds);
  const [resultSnap, slotSnap] = await Promise.all([getDocs(collection(db, 'results')), getDocs(collection(db, 'class_slots'))]);

  // classId → subject (one spelling) → slot key; an assignment with a teacher wins.
  const slotKeys = new Map<string, Map<string, { key: string; staffed: boolean }>>();
  for (const d of slotSnap.docs) {
    const x = d.data() as any;
    if (!x.classId || x.isFormTeacherSlot || !d.id.startsWith(`${x.classId}__`)) continue;
    const subject = normalizeSubjectName(x.normalizedSubject || x.subject || '');
    const staffed = !!(x.ownerTeacherId || x.delegateTeacherId);
    const m = slotKeys.get(x.classId) ?? new Map();
    const prev = m.get(subject);
    if (!prev || (!prev.staffed && staffed)) m.set(subject, { key: d.id.slice(x.classId.length + 2), staffed });
    slotKeys.set(x.classId, m);
  }

  const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
  for (const d of resultSnap.docs) {
    if (!wanted.has(d.id)) continue;
    const r = d.data() as any;
    if (r.normalizedSubject || !r.classId || !r.subjectId) continue;
    const subject = normalizeSubjectName(r.subjectId);
    const key = slotKeys.get(r.classId)?.get(subject)?.key ?? slotKeyFor(r.classId, subject);
    ops.push(b => b.update(doc(db, 'results', d.id), { normalizedSubject: key }));
  }
  await commitInBatches(ops);
  return ops.length;
}

/**
 * Count results rows in ALL terms that lack `normalizedSubject`.
 * (Reads the whole results collection — run occasionally.)
 */
export async function countAllMissingNormalizedSubject(): Promise<string[]> {
  const snap = await getDocs(collection(db, 'results'));
  return snap.docs.filter(d => !(d.data() as any).normalizedSubject).map(d => d.id);
}

/**
 * Move a wrong-term group to the term it was saved during. Refuses when
 * rows already exist under the target term, so nothing is overwritten.
 */
export async function moveWrongTermGroup(g: WrongTermGroup): Promise<number> {
  if (g.conflicts > 0) {
    throw new Error(
      `${g.conflicts} mark(s) already exist for ${g.subjectId} ${g.examType} in ${g.savedDuring.term} ${g.savedDuring.year}. ` +
      `Resolve those first; nothing was moved.`
    );
  }
  const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
  for (const id of g.resultIds) {
    const snap = await getDoc(doc(db, 'results', id));
    if (!snap.exists()) continue;
    const r = snap.data() as any;
    const newId = resultId(r.studentId, r.subjectId, r.examType, g.savedDuring.term, g.savedDuring.year);
    const moved = { ...r, id: newId, term: g.savedDuring.term, year: g.savedDuring.year, movedFrom: `${r.term} ${r.year}` };
    ops.push(b => b.set(doc(db, 'results', newId), moved));
    ops.push(b => b.delete(doc(db, 'results', id)));
  }
  await commitInBatches(ops);
  return g.resultIds.length;
}

/**
 * Turn on server-side authority checks for results (see firestore.rules).
 * Refuses while any results row lacks normalizedSubject, because teachers
 * could then no longer edit those rows.
 */
export async function enableAuthorityEnforcement(): Promise<void> {
  const missing = await countAllMissingNormalizedSubject();
  if (missing.length > 0) {
    throw new Error(
      `${missing.length} results row(s) in some term still lack normalizedSubject. Fix them first.`
    );
  }
  await setDoc(doc(db, 'system', 'assignmentEngine'), { enforceAuthority: true }, { merge: true });
}

// ==================== SAME SUBJECT, DIFFERENT SPELLINGS ====================

export interface SpellingGroup {
  /** As saved, e.g. "PRINCIPLES OF ACCOUNTS". */
  from: string;
  /** The one spelling, e.g. "Principles of Accounts". */
  to: string;
  resultIds: string[];
  classIds: string[];
  terms: string[];
}

export interface DuplicateSlotGroup {
  classId: string;
  className: string;
  subject: string;
  slots: Array<{ id: string; subject: string; teacher: string | null; ownerTeacherId?: string | null; delegateTeacherId?: string | null }>;
}

export interface SpellingReport {
  groups: SpellingGroup[];
  /** Marks rows in all terms. */
  totalRows: number;
  duplicateSlots: DuplicateSlotGroup[];
}

/**
 * READ ONLY. Every results row (all terms) whose subject is not saved under
 * its one spelling, grouped by spelling; and classes that have two subject
 * assignments for the same subject under different spellings.
 */
export async function findSubjectSpellings(): Promise<SpellingReport> {
  const [resultSnap, slotSnap, classSnap] = await Promise.all([
    getDocs(collection(db, 'results')),
    getDocs(collection(db, 'class_slots')),
    getDocs(collection(db, 'classes')),
  ]);
  const by = new Map<string, SpellingGroup & { _c: Set<string>; _t: Set<string> }>();
  for (const d of resultSnap.docs) {
    const r = d.data() as any;
    const from = String(r.subjectId ?? '');
    if (!from) continue;
    const to = normalizeSubjectName(from);
    if (to === from) continue;
    const key = `${from}\u0000${to}`;
    const g = by.get(key) ?? { from, to, resultIds: [], classIds: [], terms: [], _c: new Set(), _t: new Set() };
    g.resultIds.push(d.id);
    if (r.classId) g._c.add(r.classId);
    if (r.term) g._t.add(`${r.term} ${r.year}`);
    by.set(key, g);
  }
  const groups = [...by.values()]
    .map(({ _c, _t, ...g }) => ({ ...g, classIds: [..._c].sort(), terms: [..._t].sort() }))
    .sort((a, b) => a.to.localeCompare(b.to) || b.resultIds.length - a.resultIds.length);

  const classNames = new Map(classSnap.docs.map(d => [d.id, (d.data().name as string) || d.id]));
  const slotsBy = new Map<string, DuplicateSlotGroup>();
  for (const d of slotSnap.docs) {
    const x = d.data() as any;
    if (x.isFormTeacherSlot || !x.classId) continue;
    const subject = normalizeSubjectName(x.normalizedSubject || x.subject || '');
    const key = `${x.classId}|${subject}`;
    const g = slotsBy.get(key) ?? { classId: x.classId, className: classNames.get(x.classId) ?? x.classId, subject, slots: [] };
    g.slots.push({
      id: d.id,
      subject: x.subject || x.normalizedSubject || '',
      teacher: x.ownerTeacherName || x.delegateTeacherName || null,
      ownerTeacherId: x.ownerTeacherId ?? null,
      delegateTeacherId: x.delegateTeacherId ?? null,
    });
    slotsBy.set(key, g);
  }
  const duplicateSlots = [...slotsBy.values()]
    .filter(g => g.slots.length > 1)
    .sort((a, b) => a.className.localeCompare(b.className, undefined, { numeric: true }) || a.subject.localeCompare(b.subject));

  return { groups, totalRows: resultSnap.size, duplicateSlots };
}

const updatedMs = (v: any): number =>
  v?.toMillis ? v.toMillis() : v?.toDate ? v.toDate().getTime() : v ? new Date(v).getTime() || 0 : 0;

export interface JoinSpellingsResult {
  /** Marks now saved under the one spelling. */
  moved: number;
  /** Older marks for the same learner and test that were removed. */
  droppedOlder: number;
  /** Marks that could not be moved, with why. */
  skipped: Array<{ id: string; reason: string }>;
}

/**
 * Save the marks of these groups under the one spelling (new document id,
 * subjectId, subjectName). When a learner has a mark for the same subject and
 * test under more than one spelling, the NEWEST is kept. The row keeps its
 * normalizedSubject (the assignment the rules check).
 *
 * Reads the results ONCE (not mark by mark — that took minutes with every
 * term's marks) and reports progress as batches are saved.
 */
export async function fixSubjectSpellings(
  groups: SpellingGroup[],
  onProgress?: (saved: number, total: number) => void,
): Promise<JoinSpellingsResult> {
  const wanted = new Set(groups.flatMap(g => g.resultIds));
  const snap = await getDocs(collection(db, 'results'));
  const all = new Map(snap.docs.map(d => [d.id, d.data() as any]));
  const skipped: JoinSpellingsResult['skipped'] = [];

  // Every mark that should end up under one document id, with the one
  // already saved there (if any). The newest of them wins.
  const targets = new Map<string, Array<{ id: string; data: any; ms: number; atTarget: boolean }>>();
  for (const id of wanted) {
    const r = all.get(id);
    if (!r) continue; // already gone
    const to = normalizeSubjectName(r.subjectId || '');
    if (!to || to === r.subjectId) continue; // already fixed
    if (!r.studentId || !r.examType || !r.term || !r.year) {
      skipped.push({ id, reason: 'missing learner, test, term or year' });
      continue;
    }
    const newId = resultId(r.studentId, to, r.examType, String(r.term), Number(r.year));
    if (newId.includes('/') || newId.length > 1400) {
      skipped.push({ id, reason: `the subject name "${to}" cannot be used in a record name` });
      continue;
    }
    if (!targets.has(newId)) {
      const there = all.get(newId);
      targets.set(newId, there ? [{ id: newId, data: there, ms: updatedMs(there.updatedAt ?? there.createdAt), atTarget: true }] : []);
    }
    const fixed = { ...r, id: newId, subjectId: to, subjectName: isKnownSubject(to) ? to : r.subjectName || to, spellingFixedFrom: r.subjectId };
    targets.get(newId)!.push({ id, data: fixed, ms: updatedMs(r.updatedAt ?? r.createdAt), atTarget: false });
  }

  const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
  let moved = 0;
  let droppedOlder = 0;
  for (const [newId, rows] of targets) {
    // Newest first; on a tie the mark already under the right spelling stays.
    const winner = [...rows].sort((a, b) => b.ms - a.ms || Number(b.atTarget) - Number(a.atTarget))[0];
    if (!winner.atTarget) {
      ops.push(b => b.set(doc(db, 'results', newId), winner.data));
      moved++;
    }
    for (const r of rows) {
      if (r.atTarget || r.id === newId) continue;
      ops.push(b => b.delete(doc(db, 'results', r.id)));
    }
    droppedOlder += rows.length - 1;
  }
  onProgress?.(0, ops.length);
  for (let i = 0; i < ops.length; i += BATCH) {
    const b = writeBatch(db);
    ops.slice(i, i + BATCH).forEach(op => op(b));
    await b.commit();
    onProgress?.(Math.min(i + BATCH, ops.length), ops.length);
  }
  return { moved, droppedOlder, skipped };
}

// ==================== ONE ASSIGNMENT PER SUBJECT ====================

export type SlotMergePlan =
  | { kind: 'merge'; group: DuplicateSlotGroup; keep: string; remove: string[] }
  | { kind: 'decide'; group: DuplicateSlotGroup; reason: string };

const slotTeachers = (s: DuplicateSlotGroup['slots'][number]) =>
  [s.ownerTeacherId, s.delegateTeacherId].filter((x): x is string => !!x).sort().join('+');

/**
 * Which assignment of a class's subject to keep. Keeps the one with a teacher
 * (if two have the SAME teacher, the correctly spelt one); a subject assigned
 * to two DIFFERENT teachers is left for the admin to decide.
 */
export function planSlotMerge(g: DuplicateSlotGroup): SlotMergePlan {
  const staffed = g.slots.filter(s => slotTeachers(s));
  const people = new Set(staffed.map(slotTeachers));
  if (people.size > 1) {
    const names = [...new Set(staffed.map(s => s.teacher || 'a teacher'))];
    return { kind: 'decide', group: g, reason: `assigned to ${names.join(' and ')} — choose who teaches it` };
  }
  const candidates = staffed.length ? staffed : g.slots;
  const canonical = `${g.classId}__${slotKeyFor(g.classId, g.subject)}`;
  const keep = (candidates.find(s => s.id === canonical) ?? candidates[0]).id;
  return { kind: 'merge', group: g, keep, remove: g.slots.map(s => s.id).filter(id => id !== keep) };
}

export interface SlotMergeResult {
  classesFixed: number;
  assignmentsRemoved: number;
  marksMoved: number;
  registersMoved: number;
  timetableMoved: number;
  teacherRowsClosed: number;
  /** Left for the admin. */
  toDecide: Array<{ className: string; subject: string; reason: string }>;
}

/**
 * For each class with two assignments for one subject: move the marks
 * (their rules key), attendance registers and live timetable periods of the
 * extra assignment(s) to the one kept, close the extra assignment's teacher
 * rows ("removed"), then delete the extra assignment.
 */
export async function mergeDuplicateSlots(
  groups: DuplicateSlotGroup[],
  onProgress?: (done: number, total: number) => void,
): Promise<SlotMergeResult> {
  const out: SlotMergeResult = { classesFixed: 0, assignmentsRemoved: 0, marksMoved: 0, registersMoved: 0, timetableMoved: 0, teacherRowsClosed: 0, toDecide: [] };
  const plans = groups.map(planSlotMerge);
  const merges = plans.filter((p): p is Extract<SlotMergePlan, { kind: 'merge' }> => p.kind === 'merge');
  for (const p of plans) if (p.kind === 'decide') out.toDecide.push({ className: p.group.className, subject: p.group.subject, reason: p.reason });

  let done = 0;
  onProgress?.(0, merges.length);
  for (const { group, keep, remove } of merges) {
    const keyOf = (slotId: string) => slotId.slice(group.classId.length + 2);
    const keepKey = keyOf(keep);
    const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];

    const classResults = await getDocs(query(collection(db, 'results'), where('classId', '==', group.classId)));
    for (const slotId of remove) {
      const removedKey = keyOf(slotId);
      for (const d of classResults.docs) {
        if ((d.data() as any).normalizedSubject !== removedKey) continue;
        ops.push(b => b.update(doc(db, 'results', d.id), { normalizedSubject: keepKey }));
        out.marksMoved++;
      }
      const [sessions, entries, rows] = await Promise.all([
        getDocs(query(collection(db, 'attendance_sessions'), where('slotId', '==', slotId))),
        getDocs(query(collection(db, 'timetable_entries'), where('slotId', '==', slotId))),
        getDocs(query(collection(db, 'teacher_assignments'), where('slotId', '==', slotId))),
      ]);
      for (const d of sessions.docs) {
        ops.push(b => b.update(doc(db, 'attendance_sessions', d.id), { slotId: keep, normalizedSubject: keepKey }));
        out.registersMoved++;
      }
      for (const d of entries.docs) {
        ops.push(b => b.update(doc(db, 'timetable_entries', d.id), { slotId: keep }));
        out.timetableMoved++;
      }
      for (const d of rows.docs) {
        if ((d.data() as any).status === 'ended') continue; // history stays as it is
        ops.push(b => b.update(doc(db, 'teacher_assignments', d.id), { status: 'ended', endReason: 'removed', endDate: Timestamp.now(), updatedAt: serverTimestamp() }));
        out.teacherRowsClosed++;
      }
      ops.push(b => b.delete(doc(db, 'class_slots', slotId)));
      out.assignmentsRemoved++;
    }
    // Links first, the extra assignment last (deletes are in the last batch).
    await commitInBatches(ops);
    out.classesFixed++;
    onProgress?.(++done, merges.length);
  }
  return out;
}
