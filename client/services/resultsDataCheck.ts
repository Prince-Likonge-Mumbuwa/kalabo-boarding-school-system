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

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
  setDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { slotKeyFor } from '@/services/resultsGridLoader';
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
    if (!learner || learner.classId !== r.classId || !isCountedLearner(learner)) {
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

/** Add `normalizedSubject` (the slot key) to results rows missing it. */
export async function fixMissingNormalizedSubject(resultIds: string[]): Promise<number> {
  const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
  for (const id of resultIds) {
    const snap = await getDoc(doc(db, 'results', id));
    if (!snap.exists()) continue;
    const r = snap.data() as any;
    if (r.normalizedSubject || !r.classId || !r.subjectId) continue;
    const key = slotKeyFor(r.classId, r.subjectId);
    ops.push(b => b.update(doc(db, 'results', id), { normalizedSubject: key }));
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
