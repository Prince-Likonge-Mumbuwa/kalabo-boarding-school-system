// Firestore rules for face recognition (run with `pnpm test:rules`).
// Face templates are biometric data: no app user may read or write them,
// not even through the catch-all rule. Only the Cloud Functions can.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-kalabo',
    firestore: { rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8085 },
  });
});
afterAll(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/ADMIN'), { userType: 'admin' });
    await setDoc(doc(db, 'users/T1'), { userType: 'teacher' });
    await setDoc(doc(db, 'users/PARENT'), { userType: 'parent' });
    await setDoc(doc(db, 'learners/L1'), { classId: '8a', studentId: 'G8A_001', fullName: 'Alice Phiri', status: 'active' });
    await setDoc(doc(db, 'face_templates/L1'), { learnerId: 'L1', classId: '8a', templates: [{ id: 't', data: 'x.y.z' }] });
    await setDoc(doc(db, 'face_status/L1'), { learnerId: 'L1', classId: '8a', consent: true, templateCount: 1 });
    await setDoc(doc(db, 'face_audit/a1'), { action: 'face.enrolled', learnerId: 'L1' });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe('face_templates — nobody through the app', () => {
  for (const who of ['ADMIN', 'T1', 'PARENT']) {
    it(`${who} cannot read or list templates`, async () => {
      await assertFails(getDoc(doc(as(who), 'face_templates/L1')));
      await assertFails(getDocs(query(collection(as(who), 'face_templates'), where('classId', '==', '8a'))));
    });
    it(`${who} cannot write templates`, async () => {
      await assertFails(setDoc(doc(as(who), 'face_templates/L2'), { templates: [] }));
      await assertFails(updateDoc(doc(as(who), 'face_templates/L1'), { templates: [] }));
    });
  }
  it('signed-out visitors cannot read templates', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'face_templates/L1')));
  });
});

describe('face_status — staff read, server writes', () => {
  it('teachers and admins can read a class\'s face status', async () => {
    await assertSucceeds(getDocs(query(collection(as('T1'), 'face_status'), where('classId', '==', '8a'))));
    await assertSucceeds(getDoc(doc(as('ADMIN'), 'face_status/L1')));
  });
  it('other signed-in accounts cannot', async () => {
    await assertFails(getDoc(doc(as('PARENT'), 'face_status/L1')));
  });
  it('nobody can fake consent from the app', async () => {
    await assertFails(setDoc(doc(as('T1'), 'face_status/L2'), { consent: true }));
    await assertFails(updateDoc(doc(as('ADMIN'), 'face_status/L1'), { consent: true }));
  });
});

describe('face_audit — admins read only', () => {
  it('admin reads, teacher does not, nobody writes', async () => {
    await assertSucceeds(getDoc(doc(as('ADMIN'), 'face_audit/a1')));
    await assertFails(getDoc(doc(as('T1'), 'face_audit/a1')));
    await assertFails(setDoc(doc(as('ADMIN'), 'face_audit/a2'), { action: 'x' }));
  });
});

describe('existing behaviour is unchanged', () => {
  it('learners stay readable (Parent Portal) and writable by staff', async () => {
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'learners/L1')));
    await assertSucceeds(updateDoc(doc(as('T1'), 'learners/L1'), { fullName: 'Alice M. Phiri' }));
  });
  it('the catch-all still lets staff read other collections', async () => {
    await env.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(), 'misc/x'), { a: 1 }); });
    await assertSucceeds(getDoc(doc(as('T1'), 'misc/x')));
  });
  it('admins can save the face settings in system/faceRecognition, teachers cannot', async () => {
    await assertSucceeds(setDoc(doc(as('ADMIN'), 'system/faceRecognition'), { enabled: true }));
    await assertFails(setDoc(doc(as('T1'), 'system/faceRecognition'), { enabled: true }));
    await assertSucceeds(getDoc(doc(as('T1'), 'system/faceRecognition')));
  });
});
