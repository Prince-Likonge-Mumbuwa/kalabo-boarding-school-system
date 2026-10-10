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
  writeBatch,
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
import { isCountedLearner } from './resultsGrid';
import * as engine from './assignmentEngine';

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

// ==================== PAYLOAD ====================

export interface MarkSessionInput {
  classId: string;
  className: string;
  date: string;
  kind: SessionKind;
  subject?: string;
  period?: number;
  /** class_slots id of the subject (periodic) — derived when missing. */
  slotId?: string;
  /** The slot's subject key, e.g. 'MATH' — derived when missing. */
  normalizedSubject?: string;
  roster: Record<string, AttendanceStatus>;
  excuseReasons?: Record<string, string>;
  markedBy: string;
  markedByName: string;
}

export function buildSessionPayload(input: MarkSessionInput): AttendanceSession {
  const idSubject =
    input.kind === 'periodic' && input.subject ? toNormalizedSubject(input.subject) : undefined;
  const id = makeSessionId(input.classId, input.date, input.kind, input.period, idSubject);

  // Firestore rejects `undefined`, so optional fields are omitted.
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
    summary: computeSessionSummary(input.roster),
    schemaVersion: 1,
  };
  if (input.kind === 'periodic') {
    if (input.subject !== undefined) payload.subject = input.subject;
    if (input.period !== undefined) payload.period = input.period;
    payload.normalizedSubject = input.normalizedSubject || idSubject;
    payload.slotId = input.slotId || (input.subject ? engine.slotIdFor(input.classId, input.subject) : undefined);
  } else {
    payload.slotId = input.slotId || engine.slotIdForNormalized(input.classId, engine.FORM_TEACHER_SLOT);
  }
  if (!payload.slotId) delete payload.slotId;
  if (!payload.normalizedSubject) delete payload.normalizedSubject;
  if (input.excuseReasons && Object.keys(input.excuseReasons).length > 0) {
    payload.excuseReasons = input.excuseReasons;
  }
  return payload;
}

// ==================== SERVICE ====================

class AttendanceService {

  // ── WRITE ──────────────────────────────────────────────────────────

  /**
   * Save one register. `slotId` is the class subject (periodic) or the form
   * class (daily); the rules use it to let the subject's owner or live cover
   * edit a register someone else saved. Derived when not given.
   */
  async markSession(input: MarkSessionInput): Promise<AttendanceSession> {
    const [saved] = await this.markSessions([input]);
    return saved;
  }

  /**
   * Save several registers in one write — used for a double / triple lesson,
   * where the same register is recorded for every period of the block.
   */
  async markSessions(inputs: MarkSessionInput[]): Promise<AttendanceSession[]> {
    const payloads = inputs.map(buildSessionPayload);
    const batch = writeBatch(db);
    // Full replace: cleared fields must actually clear.
    for (const p of payloads) batch.set(doc(db, SESSIONS_COLLECTION, p.id), p);
    await batch.commit();
    return payloads;
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

  /** Delete the registers of every period of a block. Returns how many existed. */
  async deleteSessions(
    inputs: Array<Parameters<AttendanceService['deleteSession']>[0]>,
  ): Promise<number> {
    let n = 0;
    for (const i of inputs) if (await this.deleteSession(i)) n++;
    return n;
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
    // Same rule as the results screens: status 'active' OR no status.
    const snap = await getDocs(collection(db, 'learners'));
    return snap.docs.filter(d => isCountedLearner(d.data() as any)).map(d => {
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