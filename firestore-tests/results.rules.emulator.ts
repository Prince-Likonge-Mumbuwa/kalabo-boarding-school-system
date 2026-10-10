// Real Firestore rules tests (run against the emulator with `pnpm test:rules`).
// They load firestore.rules from this folder's parent, so they test exactly
// the file you deploy.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, Timestamp, updateDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;

const now = Date.now();
const day = 24 * 3600 * 1000;

const validRow = (over: Record<string, any> = {}) => ({
  studentId: 'docA',
  classId: 'C1',
  subjectId: 'Mathematics',
  normalizedSubject: 'Mathematics',
  examType: 'week4',
  term: 'Term 3',
  year: 2026,
  marks: 40,
  totalMarks: 50,
  teacherId: 'T1',
  enteredBy: 'T1',
  lastEditedBy: 'T1',
  ...over,
});

async function seed(enforce: boolean) {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/ADMIN'), { userType: 'admin' });
    for (const t of ['T1', 'T2', 'T3', 'T4']) await setDoc(doc(db, `users/${t}`), { userType: 'teacher' });
    await setDoc(doc(db, 'system/assignmentEngine'), { migratedAt: 'x', enforceAuthority: enforce });
    await setDoc(doc(db, 'class_slots/C1__Mathematics'), { classId: 'C1', ownerTeacherId: 'T1' });
    // English: owner T2 covered by T3 (live)
    await setDoc(doc(db, 'class_slots/C1__English'), {
      classId: 'C1', ownerTeacherId: 'T2', delegateTeacherId: 'T3', delegateRole: 'leave-cover',
      delegateStart: Timestamp.fromMillis(now - 7 * day), delegateEnd: Timestamp.fromMillis(now + 7 * day),
    });
    await setDoc(doc(db, 'examConfigs/cfg'), { term: 'Term 3', year: 2026, isActive: true });
    await setDoc(doc(db, 'results/existing'), validRow());
    await setDoc(doc(db, 'results/legacy'), {
      studentId: 'docB', classId: 'C1', subjectId: 'Mathematics', examType: 'week4',
      term: 'Term 3', year: 2026, marks: 10, totalMarks: 50, teacherId: 'T1',
    });
  });
}

const as = (uid: string | null) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-kalabo',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8085,
    },
  });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

describe('results — authority NOT enforced (current production setting)', () => {
  beforeEach(() => seed(false));

  it('any teacher may save a well-formed mark', async () => {
    await assertSucceeds(setDoc(doc(as('T4'), 'results/r1'), validRow({ enteredBy: 'T4', lastEditedBy: 'T4', teacherId: 'T4' })));
  });
  it('an older app version (no normalizedSubject / enteredBy) can still save', async () => {
    const { normalizedSubject, enteredBy, lastEditedBy, ...old } = validRow();
    await assertSucceeds(setDoc(doc(as('T1'), 'results/r2'), old));
  });
  it('rejects marks above the total, bad terms and non-integer years', async () => {
    await assertFails(setDoc(doc(as('T1'), 'results/r3'), validRow({ marks: 51 })));
    await assertFails(setDoc(doc(as('T1'), 'results/r4'), validRow({ term: 'term 3' })));
    await assertFails(setDoc(doc(as('T1'), 'results/r5'), validRow({ year: 2026.5 })));
  });
  it('accepts absent (-1) and not conducted (-2)', async () => {
    await assertSucceeds(setDoc(doc(as('T1'), 'results/r6'), validRow({ marks: -1 })));
    await assertSucceeds(setDoc(doc(as('T1'), 'results/r7'), validRow({ marks: -2 })));
  });
  it('a teacher may delete rows they saved, not another teacher\'s', async () => {
    await assertSucceeds(deleteDoc(doc(as('T1'), 'results/existing')));
    await env.withSecurityRulesDisabled(ctx => setDoc(doc(ctx.firestore(), 'results/existing'), validRow()));
    await assertFails(deleteDoc(doc(as('T3'), 'results/existing')));
  });
  it('signed-out visitors can read results, slots and exam settings (Parent Portal)', async () => {
    await assertSucceeds(getDoc(doc(as(null), 'results/existing')));
    await assertSucceeds(getDoc(doc(as(null), 'class_slots/C1__Mathematics')));
    await assertSucceeds(getDoc(doc(as(null), 'examConfigs/cfg')));
  });
  it('teachers can no longer change exam settings; admins can', async () => {
    await assertFails(setDoc(doc(as('T1'), 'examConfigs/cfg'), { term: 'Term 3', year: 2026, isActive: false }));
    await assertSucceeds(setDoc(doc(as('ADMIN'), 'examConfigs/cfg'), { term: 'Term 3', year: 2026, isActive: true }));
  });
  it('teachers cannot write class slots', async () => {
    await assertFails(setDoc(doc(as('T1'), 'class_slots/C1__Mathematics'), { classId: 'C1', ownerTeacherId: 'T1' }));
  });
});

describe('results — authority enforced', () => {
  beforeEach(() => seed(true));

  it('the owner saves their subject', async () => {
    await assertSucceeds(setDoc(doc(as('T1'), 'results/r1'), validRow()));
  });
  it('another teacher cannot save that subject', async () => {
    await assertFails(setDoc(doc(as('T4'), 'results/r1'), validRow({ enteredBy: 'T4', lastEditedBy: 'T4' })));
  });
  it('a covered owner and the live cover can both save', async () => {
    const eng = validRow({ subjectId: 'English', normalizedSubject: 'English' });
    await assertSucceeds(setDoc(doc(as('T2'), 'results/e1'), { ...eng, enteredBy: 'T2', lastEditedBy: 'T2' }));
    await assertSucceeds(setDoc(doc(as('T3'), 'results/e2'), { ...eng, enteredBy: 'T3', lastEditedBy: 'T3' }));
    await assertFails(setDoc(doc(as('T4'), 'results/e3'), { ...eng, enteredBy: 'T4', lastEditedBy: 'T4' }));
  });
  it('an update must keep enteredBy and set lastEditedBy', async () => {
    await assertSucceeds(updateDoc(doc(as('T1'), 'results/existing'), { marks: 45, lastEditedBy: 'T1' }));
    await assertFails(updateDoc(doc(as('T1'), 'results/existing'), { marks: 45, lastEditedBy: 'T1', enteredBy: 'X' }));
  });
  it('legacy rows without normalizedSubject cannot be edited by teachers (run the data check first)', async () => {
    await assertFails(updateDoc(doc(as('T1'), 'results/legacy'), { marks: 20, lastEditedBy: 'T1', normalizedSubject: 'Mathematics' }));
    await assertSucceeds(updateDoc(doc(as('ADMIN'), 'results/legacy'), { normalizedSubject: 'Mathematics' }));
  });
  it('only the owner or live cover may delete', async () => {
    await assertFails(deleteDoc(doc(as('T4'), 'results/existing')));
    await assertSucceeds(deleteDoc(doc(as('T1'), 'results/existing')));
  });
});
