// Guidance & counselling rules (run with `pnpm test:rules`):
//  - officers / admin make sponsor codes; other teachers cannot
//  - a signed-out sponsor can read a code they know, but never list codes
//  - a code can be spent once, only while active and unexpired
//  - officers / admin may cancel an active code
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-kalabo-guidance',
    firestore: { rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8085 },
  });
});
afterAll(async () => { await env?.cleanup(); });

const inDays = (d: number) => Timestamp.fromDate(new Date(Date.now() + d * 86_400_000));

const code = (createdBy: string, extra: Record<string, unknown> = {}) => ({
  sponsorName: 'CAMFED', sponsorKeys: ['camfed'], learnerIds: ['L1', 'L2'], learnerCount: 2,
  term: 'Term 3', year: 2026, status: 'active', createdAt: serverTimestamp(), createdBy, createdByName: 'X',
  expiresAt: inDays(30), usedAt: null, ...extra,
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/ADMIN'), { userType: 'admin' });
    await setDoc(doc(db, 'users/G1'), { userType: 'teacher' });
    await setDoc(doc(db, 'users/T1'), { userType: 'teacher' });
    await setDoc(doc(db, 'staff_roles/G1__guidance-officer'), { role: 'guidance-officer', teacherId: 'G1', status: 'active' });
    await setDoc(doc(db, 'sponsor_codes/SP-AAAA-BBBB'), { ...code('G1'), createdAt: Timestamp.now() });
    await setDoc(doc(db, 'sponsor_codes/SP-USED-CODE'), { ...code('G1'), status: 'used', usedAt: Timestamp.now(), createdAt: Timestamp.now() });
    await setDoc(doc(db, 'sponsor_codes/SP-OLDD-CODE'), { ...code('G1'), expiresAt: Timestamp.fromDate(new Date(2020, 0, 1)), createdAt: Timestamp.now() });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe('sponsor_codes rules', () => {
  it('guidance officers and the admin make codes as themselves; other teachers cannot', async () => {
    await assertSucceeds(setDoc(doc(as('G1'), 'sponsor_codes/SP-NEWW-0NE2'), code('G1')));
    await assertSucceeds(setDoc(doc(as('ADMIN'), 'sponsor_codes/SP-NEWW-TW03'), code('ADMIN')));
    await assertFails(setDoc(doc(as('T1'), 'sponsor_codes/SP-NEWW-THR3'), code('T1')));
    await assertFails(setDoc(doc(as('G1'), 'sponsor_codes/SP-NEWW-F0R4'), code('ADMIN')));
    await assertFails(setDoc(doc(as('G1'), 'sponsor_codes/SP-NEWW-F1V5'), code('G1', { status: 'used' })));
    await assertFails(setDoc(doc(as('G1'), 'sponsor_codes/SP-NEWW-S1X6'), code('G1', { learnerIds: [] })));
    await assertFails(setDoc(doc(anon(), 'sponsor_codes/SP-NEWW-SEV7'), code('G1')));
  });

  it('a signed-out sponsor reads a known code but cannot list codes', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'sponsor_codes/SP-AAAA-BBBB')));
    await assertFails(getDocs(collection(anon(), 'sponsor_codes')));
    await assertFails(getDocs(collection(as('T1'), 'sponsor_codes')));
    await assertSucceeds(getDocs(collection(as('G1'), 'sponsor_codes')));
  });

  it('a code is spent once, and only that change is allowed', async () => {
    const ref = doc(anon(), 'sponsor_codes/SP-AAAA-BBBB');
    await assertFails(updateDoc(ref, { status: 'used', usedAt: serverTimestamp(), learnerIds: ['X'] }));
    await assertFails(updateDoc(ref, { status: 'active', usedAt: serverTimestamp() }));
    await assertSucceeds(runTransaction(anon(), async tx => {
      await tx.get(ref);
      tx.update(ref, { status: 'used', usedAt: serverTimestamp() });
    }));
    await assertFails(updateDoc(ref, { status: 'used', usedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(anon(), 'sponsor_codes/SP-USED-CODE'), { status: 'used', usedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(anon(), 'sponsor_codes/SP-OLDD-CODE'), { status: 'used', usedAt: serverTimestamp() }));
  });

  it('officers and the admin cancel active codes; sponsors and other teachers cannot', async () => {
    const cancel = { status: 'revoked', revokedAt: serverTimestamp(), revokedByName: 'X' };
    await assertFails(updateDoc(doc(anon(), 'sponsor_codes/SP-AAAA-BBBB'), cancel));
    await assertFails(updateDoc(doc(as('T1'), 'sponsor_codes/SP-AAAA-BBBB'), cancel));
    await assertSucceeds(updateDoc(doc(as('G1'), 'sponsor_codes/SP-AAAA-BBBB'), cancel));
    await assertFails(updateDoc(doc(as('ADMIN'), 'sponsor_codes/SP-USED-CODE'), cancel));
  });

  it('an ended guidance role can no longer make codes', async () => {
    await env.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), 'staff_roles/G1__guidance-officer'), { role: 'guidance-officer', teacherId: 'G1', status: 'ended' });
    });
    await assertFails(setDoc(doc(as('G1'), 'sponsor_codes/SP-NEWW-E1GH'), code('G1')));
  });
});
