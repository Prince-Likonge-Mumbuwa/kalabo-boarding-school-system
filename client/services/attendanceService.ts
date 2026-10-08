// @/services/attendanceService.ts
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  deleteDoc,
  Timestamp,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  AttendanceStatus,
  AttendanceSession,
  SessionKind,
  makeSessionId,
  computeSessionSummary,
} from '@/types/attendance';
import { Learner } from '@/types/school';
import { normalizeSubjectName } from './resultsService';

// ==================== RE-EXPORTS ====================

export type {
  AttendanceStatus,
  AttendanceSession,
  SessionKind,
};

// ==================== CONSTANTS ====================

const SESSIONS_COLLECTION = 'attendance_sessions';

// ==================== HELPERS ====================

const toNormalizedSubject = (subject: string): string =>
  normalizeSubjectName(subject);

const toDateOrUndefined = (v: any): Date | undefined => {
  if (!v) return undefined;
  if (v instanceof Date) return v;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
  return undefined;
};

const mapSessionDoc = (data: any): AttendanceSession => ({
  ...data,
  markedAt: toDateOrUndefined(data.markedAt) ?? data.markedAt,
}) as AttendanceSession;

// ==================== SERVICE ====================

class AttendanceService {

  // ── WRITE ──────────────────────────────────────────────────────────

  async markSession(input: {
    classId: string;
    className: string;
    date: string;
    kind: SessionKind;
    subject?: string;
    period?: number;
    roster: Record<string, AttendanceStatus>;
    excuseReasons?: Record<string, string>;
    markedBy: string;
    markedByName: string;
  }): Promise<AttendanceSession> {
    const normalizedSubject =
      input.kind === 'periodic' && input.subject
        ? toNormalizedSubject(input.subject)
        : undefined;

    const id = makeSessionId(
      input.classId,
      input.date,
      input.kind,
      input.period,
      normalizedSubject,
    );

    const summary = computeSessionSummary(input.roster);

    // Build the payload with only the keys we actually want to persist.
    // Firestore rejects `undefined` values, so optional fields must be
    // omitted entirely rather than set to undefined.
    const payload: AttendanceSession = {
      id,
      classId: input.classId,
      className: input.className,
      date: input.date,
      kind: input.kind,
      markedBy: input.markedBy,
      markedByName: input.markedByName,
      markedAt: Timestamp.now(),
      roster: input.roster,
      summary,
      schemaVersion: 1,
    };

    if (input.kind === 'periodic' && input.subject !== undefined) {
      payload.subject = input.subject;
    }
    if (input.kind === 'periodic' && input.period !== undefined) {
      payload.period = input.period;
    }
    if (input.excuseReasons && Object.keys(input.excuseReasons).length > 0) {
      payload.excuseReasons = input.excuseReasons;
    }

    // Full replace: cleared fields must actually clear.
    await setDoc(doc(db, SESSIONS_COLLECTION, id), payload);
    return payload;
  }

  /**
   * Permanently delete one session doc ("unmark" a roll call).
   *
   * Returns true if a doc existed and was deleted, false if it was
   * already gone. Idempotent.
   */
  async deleteSession(input: {
    classId: string;
    date: string;
    kind: SessionKind;
    subject?: string;
    period?: number;
  }): Promise<boolean> {
    const normalizedSubject =
      input.kind === 'periodic' && input.subject
        ? toNormalizedSubject(input.subject)
        : undefined;

    const id = makeSessionId(
      input.classId,
      input.date,
      input.kind,
      input.period,
      normalizedSubject,
    );

    const ref = doc(db, SESSIONS_COLLECTION, id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return false;

    await deleteDoc(ref);
    return true;
  }

  // ── READS ──────────────────────────────────────────────────────────

  async getSession(
    classId: string,
    date: string,
    kind: SessionKind,
    period?: number,
    subject?: string,
  ): Promise<AttendanceSession | null> {
    const normalizedSubject =
      kind === 'periodic' && subject ? toNormalizedSubject(subject) : undefined;

    const id = makeSessionId(classId, date, kind, period, normalizedSubject);
    const snap = await getDoc(doc(db, SESSIONS_COLLECTION, id));
    if (!snap.exists()) return null;
    return mapSessionDoc(snap.data());
  }

  async getRecentSessions(
    classId: string,
    kind: SessionKind,
    beforeDate: string,
    limitN = 5,
  ): Promise<AttendanceSession[]> {
    const q = query(
      collection(db, SESSIONS_COLLECTION),
      where('classId', '==', classId),
      where('kind', '==', kind),
      where('date', '<', beforeDate),
      orderBy('date', 'desc'),
      limit(limitN),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => mapSessionDoc(d.data()));
  }

  async getSessionsForClassDate(
    classId: string,
    date: string,
  ): Promise<AttendanceSession[]> {
    const q = query(
      collection(db, SESSIONS_COLLECTION),
      where('classId', '==', classId),
      where('date', '==', date),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => mapSessionDoc(d.data()));
  }

  async getSessionsByDate(date: string): Promise<AttendanceSession[]> {
    const q = query(
      collection(db, SESSIONS_COLLECTION),
      where('date', '==', date),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => mapSessionDoc(d.data()));
  }

  async getSessionsForClassRange(
    classId: string,
    startDate: string,
    endDate: string,
  ): Promise<AttendanceSession[]> {
    const q = query(
      collection(db, SESSIONS_COLLECTION),
      where('classId', '==', classId),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      orderBy('date', 'asc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => mapSessionDoc(d.data()));
  }

  async getSessionsByDateRange(
    startDate: string,
    endDate: string,
  ): Promise<AttendanceSession[]> {
    const q = query(
      collection(db, SESSIONS_COLLECTION),
      where('date', '>=', startDate),
      where('date', '<=', endDate),
      orderBy('date', 'asc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => mapSessionDoc(d.data()));
  }

  // ── LEARNER INDEX FOR DERIVATION ───────────────────────────────────

  async getActiveLearnersIndexed(): Promise<Learner[]> {
    const snap = await getDocs(
      query(collection(db, 'learners'), where('status', '==', 'active')),
    );
    return snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        studentId: data.studentId || '',
        studentIndex: data.studentIndex || 0,
        classPrefix: data.classPrefix || '',
        fullName: data.fullName || data.name || '',
        preferredName: data.preferredName ?? undefined,
        dateOfBirth: data.dateOfBirth || '',
        birthYear: data.birthYear || 0,
        age: data.age || 0,
        gender: data.gender,
        address: data.address || '',
        guardian: data.guardian || '',
        guardianPhone: data.guardianPhone || data.parentPhone || '',
        alternativeGuardian: data.alternativeGuardian,
        alternativeGuardianPhone: data.alternativeGuardianPhone,
        sponsor: data.sponsor || '',
        classId: data.classId || '',
        className: data.className || '',
        classType: data.classType || 'grade',
        classLevel: data.classLevel || 0,
        classSection: data.classSection || '',
        dateOfFirstEntry: data.dateOfFirstEntry || '',
        enrollmentDate: toDateOrUndefined(data.enrollmentDate) ?? new Date(),
        previousSchool: data.previousSchool,
        previousGrade: data.previousGrade,
        medicalNotes: data.medicalNotes,
        allergies: data.allergies || [],
        status: data.status || 'active',
        createdBy: data.createdBy,
        createdAt: toDateOrUndefined(data.createdAt),
        updatedAt: toDateOrUndefined(data.updatedAt),
        graduationYear: data.graduationYear,
        transferredAt: toDateOrUndefined(data.transferredAt),
        transferredToClass: data.transferredToClass,
        archivedAt: toDateOrUndefined(data.archivedAt),
        name: data.fullName || data.name || '',
        parentPhone: data.guardianPhone || data.parentPhone || '',
      } as Learner;
    });
  }
}

export const attendanceService = new AttendanceService();
export { AttendanceService };