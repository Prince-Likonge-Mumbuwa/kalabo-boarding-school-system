// @/services/enrollmentService.ts
//
// Which learners belonged to a class in a CLOSED academic year.
//
// Classes are streams that keep their document from year to year, so after a
// year transition "Form 1A" holds a new cohort. When a year is closed, the
// year-transition run writes `enrollments/{learnerId}_{year}` for every
// learner (closed: true). Anything that looks at a past year reads those
// records; for the current year (no closed records yet) callers fall back to
// the class's current learners.
//
// Kept free of other service imports so the results loader can use it
// without import cycles.

import { collection, doc, getDoc, getDocs, query, where, type DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Enrollment } from '@/types/promotion';

export const ENROLLMENTS = 'enrollments';

export const enrollmentId = (learnerId: string, year: number): string => `${learnerId}_${year}`;

const isPermissionDenied = (e: any) =>
  e?.code === 'permission-denied' || /missing or insufficient permissions/i.test(e?.message ?? '');

export const mapEnrollment = (d: DocumentData): Enrollment => ({
  learnerId: d.learnerId,
  year: Number(d.year),
  classId: d.classId,
  className: d.className || '',
  classType: d.classType,
  classLevel: d.classLevel,
  classSection: d.classSection,
  studentId: d.studentId || '',
  studentIndex: typeof d.studentIndex === 'number' ? d.studentIndex : undefined,
  fullName: d.fullName || '',
  gender: d.gender,
  outcome: d.outcome,
  nextClassId: d.nextClassId ?? null,
  nextClassName: d.nextClassName ?? null,
  nextStudentId: d.nextStudentId ?? null,
  closed: d.closed === true,
  runId: d.runId || '',
  sbaMoves: d.sbaMoves || [],
  createdAt: d.createdAt,
});

/**
 * Closed enrollments of a class for a year, or null when that year has not
 * been closed for the class (→ use the class's current learners).
 * Never throws for a signed-out visitor whose rules do not allow the read.
 */
export async function loadClosedClassEnrollments(classId: string, year: number): Promise<Enrollment[] | null> {
  if (!classId || !Number.isFinite(year)) return null;
  try {
    const snap = await getDocs(query(
      collection(db, ENROLLMENTS),
      where('classId', '==', classId),
      where('year', '==', year)
    ));
    const rows = snap.docs.map(d => mapEnrollment(d.data())).filter(e => e.closed);
    return rows.length > 0 ? rows : null;
  } catch (e) {
    if (isPermissionDenied(e)) return null;
    throw e;
  }
}

/** The learner's class in `year` if that year is closed, else `fallbackClassId`. */
export async function classIdForYear(learnerId: string, fallbackClassId: string, year: number): Promise<string> {
  if (!learnerId || !Number.isFinite(year)) return fallbackClassId;
  try {
    const snap = await getDoc(doc(db, ENROLLMENTS, enrollmentId(learnerId, year)));
    if (snap.exists()) {
      const e = mapEnrollment(snap.data());
      if (e.closed && e.classId) return e.classId;
    }
  } catch (e) {
    if (!isPermissionDenied(e)) throw e;
  }
  return fallbackClassId;
}

/** learnerId → classId for every closed enrollment of `year` (data check). */
export async function loadClosedMembership(year: number): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const snap = await getDocs(query(collection(db, ENROLLMENTS), where('year', '==', year)));
    for (const d of snap.docs) {
      const e = mapEnrollment(d.data());
      if (e.closed) out.set(e.learnerId, e.classId);
    }
  } catch (e) {
    if (!isPermissionDenied(e)) throw e;
  }
  return out;
}

/** A learner's closed years, oldest first (learner history). */
export async function loadLearnerEnrollments(learnerId: string): Promise<Enrollment[]> {
  const snap = await getDocs(query(collection(db, ENROLLMENTS), where('learnerId', '==', learnerId)));
  return snap.docs.map(d => mapEnrollment(d.data())).sort((a, b) => a.year - b.year);
}
