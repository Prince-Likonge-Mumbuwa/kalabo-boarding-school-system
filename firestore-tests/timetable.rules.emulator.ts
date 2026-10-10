// Real Firestore rules tests for the timetable and attendance registers
// (run against the emulator with `pnpm test:rules`).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, setDoc, Timestamp } from 'firebase/firestore';

let env: RulesTestEnvironment;
const now = Date.now();
const day = 24 * 3600 * 1000;

const register = (over: Record<string, any> = {}) => ({
  classId: '8a', className: '8A', date: '2026-10-12', kind: 'periodic', period: 8,
  subject: 'Mathematics', normalizedSubject: 'MATH', slotId: '8a__MATH',
  markedBy: 'T1', markedByName: 'T1', markedAt: Timestamp.now(),
  roster: { s1: 'present' }, summary: { total: 1, present: 1, absent: 0, late: 0, excused: 0 },
  schemaVersion: 1, ...over,
});
const entry = (over: Record<string, any> = {}) => ({
  slotId: '8a__MATH', classId: '8a', className: '8A', subject: 'Mathematics', normalizedSubject: 'MATH',
  term: 'Term 3', year: 2026, dayOfWeek: 1, periodIndex: 1, isDouble: false, status: 'pending',
  submittedByUid: 'T1', batchId: 'sub1', ...over,
});
const submission = (over: Record<string, any> = {}) => ({
  teacherId: 'T1', teacherName: 'T1', term: 'Term 3', year: 2026, scopeSlotIds: ['8a__MATH'],
  classIds: ['8a'], entryCount: 1, status: 'pending', ...over,
});

async function seed(enforce: boolean) {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/ADMIN'), { userType: 'admin' });
    for (const t of ['T1', 'T2', 'T3', 'FT']) await setDoc(doc(db, `users/${t}`), { userType: 'teacher' });
    await setDoc(doc(db, 'system/assignmentEngine'), { migratedAt: 'x', enforceAuthority: enforce });
    // Maths: owner T1, covered by T3 now
    await setDoc(doc(db, 'class_slots/8a__MATH'), {
      classId: '8a', ownerTeacherId: 'T1', delegateTeacherId: 'T3', delegateRole: 'leave-cover',
      delegateStart: Timestamp.fromMillis(now - day), delegateEnd: Timestamp.fromMillis(now + 7 * day),
    });
    await setDoc(doc(db, 'class_slots/8a__form-teacher'), { classId: '8a', ownerTeacherId: 'FT' });
    await setDoc(doc(db, 'attendance_sessions/byOwner'), register());
    await setDoc(doc(db, 'attendance_sessions/old'), (({ slotId, normalizedSubject, ...r }) => r)(register({ period: 2 })));
    await setDoc(doc(db, 'timetable_submissions/sub1'), submission());
    await setDoc(doc(db, 'timetable_entries/e1'), entry());
  });
}
const as = (uid: string) => env.authenticatedContext(uid).firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-kalabo',
    firestore: { rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8085 },
  });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe('attendance registers', () => {
  describe('authority not enforced', () => {
    beforeEach(() => seed(false));
    it('periods P1–P8 are accepted; 9 is not (breaks are not periods)', async () => {
      await assertSucceeds(setDoc(doc(as('T2'), 'attendance_sessions/n1'), register({ markedBy: 'T2', markedByName: 'T2', period: 7 })));
      await assertFails(setDoc(doc(as('T2'), 'attendance_sessions/n2'), register({ markedBy: 'T2', markedByName: 'T2', period: 9 })));
    });
    it('cover teacher can edit the owner’s register; others cannot', async () => {
      await assertSucceeds(setDoc(doc(as('T3'), 'attendance_sessions/byOwner'), register({ markedBy: 'T3', markedByName: 'T3' })));
      await assertFails(setDoc(doc(as('T2'), 'attendance_sessions/byOwner'), register({ markedBy: 'T2', markedByName: 'T2' })));
    });
    it('a register’s identity cannot change', async () => {
      await assertFails(setDoc(doc(as('T1'), 'attendance_sessions/byOwner'), register({ period: 6 })));
    });
    it('old registers (no slot) stay editable by their marker only', async () => {
      const { slotId, normalizedSubject, ...edited } = register({ period: 2, markedBy: 'T3', markedByName: 'T3' });
      await assertFails(setDoc(doc(as('T3'), 'attendance_sessions/old'), edited));
    });
  });
  describe('authority enforced', () => {
    beforeEach(() => seed(true));
    it('only the owner or live cover may create; form teacher for the daily register', async () => {
      await assertSucceeds(setDoc(doc(as('T3'), 'attendance_sessions/c1'), register({ markedBy: 'T3', markedByName: 'T3', period: 5 })));
      await assertFails(setDoc(doc(as('T2'), 'attendance_sessions/c2'), register({ markedBy: 'T2', markedByName: 'T2', period: 4 })));
      const daily = (by: string) => ({ ...register({ markedBy: by, markedByName: by, kind: 'daily', slotId: '8a__form-teacher' }), period: undefined, subject: undefined });
      const { period, subject, normalizedSubject, ...d } = daily('FT');
      await assertSucceeds(setDoc(doc(as('FT'), 'attendance_sessions/d1'), d));
      const { period: p2, subject: s2, normalizedSubject: n2, ...d2 } = daily('T2');
      await assertFails(setDoc(doc(as('T2'), 'attendance_sessions/d2'), d2));
    });
  });
});

describe('timetable submissions and rows', () => {
  beforeEach(() => seed(true));
  it('teacher creates own pending submission and rows for a subject they teach', async () => {
    await assertSucceeds(setDoc(doc(as('T1'), 'timetable_submissions/s2'), submission()));
    await assertSucceeds(setDoc(doc(as('T1'), 'timetable_entries/e2'), entry({ batchId: 's2', periodIndex: 7 })));
    await assertFails(setDoc(doc(as('T2'), 'timetable_entries/e3'), entry({ submittedByUid: 'T2' })));
    await assertFails(setDoc(doc(as('T1'), 'timetable_entries/e4'), entry({ status: 'active' })));
  });
  it('teacher may supersede / shrink own pending submission, not approve it or touch others', async () => {
    await assertSucceeds(setDoc(doc(as('T1'), 'timetable_submissions/sub1'), submission({ status: 'superseded' })));
    await assertFails(setDoc(doc(as('T1'), 'timetable_submissions/sub1'), submission({ status: 'approved' })));
    await assertFails(setDoc(doc(as('T2'), 'timetable_submissions/sub1'), submission({ status: 'superseded' })));
    await assertSucceeds(deleteDoc(doc(as('T1'), 'timetable_entries/e1')));
  });
  it('admin approves: archive + activate', async () => {
    await assertSucceeds(setDoc(doc(as('ADMIN'), 'timetable_entries/e1'), entry({ status: 'active' })));
    await assertSucceeds(setDoc(doc(as('ADMIN'), 'timetable_submissions/sub1'), submission({ status: 'approved' })));
  });
});
