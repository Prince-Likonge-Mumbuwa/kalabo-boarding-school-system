// Results publication rules (run with `pnpm test:rules`).
//  - anyone, signed in or not, can READ whether a term is published
//    (the Parent Portal and Sponsor Portal are signed out)
//  - only an admin can publish or withdraw, in their own name
//  - a term can be published only when at least 98% of results are entered
//  - nothing is ever deleted
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-kalabo-publication',
    firestore: { rules: readFileSync(resolve(__dirname, '../firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8085 },
  });
});
afterAll(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/ADMIN'), { userType: 'admin', fullName: 'Head' });
    await setDoc(doc(db, 'users/T1'), { userType: 'teacher', fullName: 'Teacher One' });
    await setDoc(doc(db, 'results_publication/2026_Term2'), { term: 'Term 2', year: 2026, published: true });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const signedOut = () => env.unauthenticatedContext().firestore();
const ref = (db: any, id: string) => doc(db, 'results_publication', id);

/** What the app writes when it publishes (client/services/resultsPublication.ts). */
const published = (uid: string, extra: Record<string, unknown> = {}) => ({
  term: 'Term 3', year: 2026, published: true,
  requiredEntries: 1000, doneEntries: 985, completionPercent: 98.5,
  publishedAt: serverTimestamp(), publishedBy: uid, publishedByName: 'Head',
  updatedAt: serverTimestamp(), updatedBy: uid,
  ...extra,
});
const withdrawn = (uid: string, extra: Record<string, unknown> = {}) => ({
  term: 'Term 3', year: 2026, published: false,
  unpublishedAt: serverTimestamp(), unpublishedBy: uid, unpublishedByName: 'Head',
  updatedAt: serverTimestamp(), updatedBy: uid,
  ...extra,
});

describe('reading', () => {
  it('signed-out visitors (the portals) can read a term\'s record', async () => {
    await assertSucceeds(getDoc(ref(signedOut(), '2026_Term2')));
    await assertSucceeds(getDoc(ref(signedOut(), '2026_Term3'))); // not there yet: still allowed
  });
});

describe('publishing', () => {
  it('an admin publishes a term that is at least 98% entered', async () => {
    await assertSucceeds(setDoc(ref(as('ADMIN'), '2026_Term3'), published('ADMIN')));
    await assertSucceeds(setDoc(ref(as('ADMIN'), '2026_Term3'), published('ADMIN', { doneEntries: 980 }))); // exactly 98%
  });

  it('refuses a term below 98%, or with nothing expected', async () => {
    const db = as('ADMIN');
    await assertFails(setDoc(ref(db, '2026_Term3'), published('ADMIN', { doneEntries: 979 })));
    await assertFails(setDoc(ref(db, '2026_Term3'), published('ADMIN', { doneEntries: 976, completionPercent: 98 })));
    await assertFails(setDoc(ref(db, '2026_Term3'), published('ADMIN', { requiredEntries: 0, doneEntries: 0 })));
    await assertFails(setDoc(ref(db, '2026_Term3'), published('ADMIN', { doneEntries: 1200 }))); // more than expected
    await assertFails(setDoc(ref(db, '2026_Term3'), published('ADMIN', { requiredEntries: '1000' })));
  });

  it('teachers, other staff and signed-out visitors cannot publish', async () => {
    await assertFails(setDoc(ref(as('T1'), '2026_Term3'), published('T1')));
    await assertFails(setDoc(ref(signedOut(), '2026_Term3'), published('ADMIN')));
    await assertFails(setDoc(ref(as('T1'), '2026_Term2'), withdrawn('T1'))); // not even to withdraw
  });

  it('is written in the admin\'s own name, with the server\'s time', async () => {
    const db = as('ADMIN');
    await assertFails(setDoc(ref(db, '2026_Term3'), published('T1')));
    await assertFails(setDoc(ref(db, '2026_Term3'), published('ADMIN', { publishedAt: new Date(2020, 0, 1) })));
    await assertFails(setDoc(ref(db, '2026_Term3'), published('ADMIN', { updatedAt: new Date(2020, 0, 1) })));
  });

  it('the record id must match its term and year', async () => {
    const db = as('ADMIN');
    await assertFails(setDoc(ref(db, '2026_Term2'), published('ADMIN'))); // says Term 3
    await assertFails(setDoc(ref(db, 'anything'), published('ADMIN')));
    await assertFails(setDoc(ref(db, '2026_Term4'), published('ADMIN', { term: 'Term 4' })));
    await assertFails(setDoc(ref(db, '1999_Term3'), published('ADMIN', { year: 1999 })));
  });

  it('refuses unknown fields', async () => {
    await assertFails(setDoc(ref(as('ADMIN'), '2026_Term3'), published('ADMIN', { secret: 1 })));
  });
});

describe('withdrawing', () => {
  it('an admin withdraws any term, even one with no figures', async () => {
    await assertSucceeds(setDoc(ref(as('ADMIN'), '2026_Term2'), withdrawn('ADMIN', { term: 'Term 2' })));
    await assertSucceeds(setDoc(ref(as('ADMIN'), '2026_Term3'), withdrawn('ADMIN')));
  });

  it('and publishes it again later', async () => {
    const db = as('ADMIN');
    await assertSucceeds(setDoc(ref(db, '2026_Term3'), withdrawn('ADMIN')));
    await assertSucceeds(setDoc(ref(db, '2026_Term3'), published('ADMIN')));
  });
});

describe('deleting', () => {
  it('nobody deletes a record, not even an admin', async () => {
    await assertFails(deleteDoc(ref(as('ADMIN'), '2026_Term2')));
    await assertFails(deleteDoc(ref(as('T1'), '2026_Term2')));
    await assertFails(deleteDoc(ref(signedOut(), '2026_Term2')));
  });
});
