// Audit trail rules, and the audited write layer against the real Firestore
// SDK + emulator (run with `pnpm test:rules`).
//  - entries are written in the writer's own name, with server time
//  - nobody can change or delete an entry; only admins read them
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it, vi, expect } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

const h = vi.hoisted(() => ({ db: null as any, auth: { currentUser: null as any } }));
vi.mock('@/lib/firebase', () => ({ get db() { return h.db; }, get auth() { return h.auth; } }));

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-kalabo-audit',
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
    await setDoc(doc(db, 'audit_log/E1'), { actorId: 'T1', ops: [{ op: 'update' }] });
  });
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const entry = (uid: string, extra: Record<string, unknown> = {}) => ({
  actorId: uid, actorName: 'X', actorRole: 'teacher', at: serverTimestamp(), clientAt: new Date(), page: '/', ops: [{ op: 'update', path: 'learners/L1' }], areas: ['learners'], count: 1, ...extra,
});

describe('audit_log rules', () => {
  it('staff add entries in their own name with server time', async () => {
    await assertSucceeds(addDoc(collection(as('T1'), 'audit_log'), entry('T1')));
    await assertFails(addDoc(collection(as('T1'), 'audit_log'), entry('ADMIN')));
    await assertFails(addDoc(collection(as('T1'), 'audit_log'), entry('T1', { at: new Date(2020, 0, 1) })));
    await assertFails(addDoc(collection(as('T1'), 'audit_log'), entry('T1', { ops: [] })));
    await assertFails(addDoc(collection(as('T1'), 'audit_log'), entry('T1', { secret: 1 })));
    await assertFails(addDoc(collection(env.unauthenticatedContext().firestore(), 'audit_log'), entry('T1')));
  });

  it('entries can never be changed or deleted, even by an admin', async () => {
    await assertFails(updateDoc(doc(as('ADMIN'), 'audit_log/E1'), { ops: [] }));
    await assertFails(deleteDoc(doc(as('ADMIN'), 'audit_log/E1')));
    await assertFails(deleteDoc(doc(as('T1'), 'audit_log/E1')));
  });

  it('only admins read the trail', async () => {
    await assertSucceeds(getDocs(collection(as('ADMIN'), 'audit_log')));
    await assertFails(getDocs(collection(as('T1'), 'audit_log')));
  });
});

describe('audited writes with the real Firestore SDK', () => {
  it('records a set, a batch and a transaction as one entry in the teacher\'s name', async () => {
    h.db = as('T1');
    h.auth.currentUser = { uid: 'T1' };
    const fs = await import('@/lib/auditedFirestore');
    fs.setAuditActor({ uid: 'T1', name: 'Teacher One', role: 'teacher' });
    await fs.setDoc(fs.doc(h.db, 'scratch/A'), { name: 'one' });
    const b = fs.writeBatch(h.db);
    b.set(fs.doc(h.db, 'scratch/B'), { name: 'two' });
    b.update(fs.doc(h.db, 'scratch/A'), { name: 'one!' });
    await b.commit();
    await fs.runTransaction(h.db, async tx => {
      const s = await tx.get(fs.doc(h.db, 'scratch/B'));
      tx.update(fs.doc(h.db, 'scratch/B'), { name: `${s.data()!.name}!` });
    });
    await fs.flushAudit();

    let ops: any[] = [];
    await env.withSecurityRulesDisabled(async ctx => {
      const snap = await getDocs(collection(ctx.firestore(), 'audit_log'));
      const mine = snap.docs.map(d => d.data()).filter(d => d.actorName === 'Teacher One');
      expect(mine).toHaveLength(1);
      ops = mine[0].ops;
    });
    expect(ops.map(o => `${o.op} ${o.path}`)).toEqual(['set scratch/A', 'set scratch/B', 'update scratch/A', 'update scratch/B']);
  });
});
