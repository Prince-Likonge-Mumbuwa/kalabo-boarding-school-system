// The audit trail: every successful write is recorded — who, what, which
// record, when — grouped per action, and never in the way of the write.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ auth: { currentUser: null as null | { uid: string; displayName?: string } } }));
vi.mock('firebase/firestore', async () => await import('../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, get auth() { return h.auth; } }));

import { resetStore, store } from '../test/fakeFirestore';
import {
  addDoc, auditEvent, collection, deleteDoc, describeWrite, doc, flushAudit, runTransaction,
  serverTimestamp, setAuditActor, setDoc, updateDoc, writeBatch, type AuditOp,
} from './auditedFirestore';

const db = {} as any;
const entries = () => [...(store.get('audit_log')?.values() ?? [])] as Array<{ actorId: string; actorName: string; actorRole: string; ops: AuditOp[]; areas: string[]; count: number; page: string }>;

beforeEach(async () => {
  resetStore({ learners: { L1: { fullName: 'Amy Banda', classId: 'F2A' } } });
  h.auth.currentUser = { uid: 'ADMIN' };
  setAuditActor({ uid: 'ADMIN', name: 'Head Teacher', role: 'admin' });
  await flushAudit();
  resetStore({ learners: { L1: { fullName: 'Amy Banda', classId: 'F2A' } } });
});

describe('audit trail', () => {
  it('records each kind of write with who did it, grouped into one entry per action', async () => {
    await setDoc(doc(db, 'learners', 'L2'), { fullName: 'Ben Tembo', classId: 'F2A', gender: 'male', createdAt: serverTimestamp() });
    await updateDoc(doc(db, 'learners', 'L1'), { guardianPhone: '0977000111', updatedAt: serverTimestamp() });
    await updateDoc(doc(db, 'learners', 'L1'), 'status', 'archived');
    const ref = await addDoc(collection(db, 'classes'), { name: 'Form 4C', year: 2026 });
    await setDoc(doc(db, 'system', 'faceRecognition'), { enabled: true }, { merge: true });
    await deleteDoc(doc(db, 'learners', 'L2'));
    await flushAudit();

    const [e] = entries();
    expect(entries()).toHaveLength(1);
    expect(e).toMatchObject({ actorId: 'ADMIN', actorName: 'Head Teacher', actorRole: 'admin', count: 6 });
    expect(e.areas.sort()).toEqual(['classes', 'learners', 'system']);
    expect(e.ops.map(o => `${o.op} ${o.path}`)).toEqual([
      'set learners/L2', 'update learners/L1', 'update learners/L1', `create classes/${ref.id}`, 'merge system/faceRecognition', 'delete learners/L2',
    ]);
    expect(e.ops[0]).toMatchObject({ label: 'Ben Tembo', fields: ['fullName', 'classId', 'gender'], values: { fullName: 'Ben Tembo', gender: 'male' } });
    expect(e.ops[1]).toMatchObject({ fields: ['guardianPhone'], values: { guardianPhone: '0977000111' } });
    expect(e.ops[2]).toMatchObject({ values: { status: 'archived' } });
    expect(e.ops[3]).toMatchObject({ label: 'Form 4C', collection: 'classes' });
    // the writes themselves happened
    expect(store.get('learners')?.get('L1')?.guardianPhone).toBe('0977000111');
    expect(store.get('learners')?.has('L2')).toBe(false);
  });

  it('batches and transactions: every write inside is recorded, once, after it succeeds', async () => {
    const b = writeBatch(db);
    b.set(doc(db, 'results', 'R1'), { studentName: 'Amy Banda', subject: 'Biology', score: 71 });
    b.update(doc(db, 'learners', 'L1'), { className: 'Form 3A' });
    b.delete(doc(db, 'results', 'R0'));
    await b.commit();
    await runTransaction(db, async tx => {
      const s = await tx.get(doc(db, 'learners', 'L1'));
      tx.update(doc(db, 'learners', 'L1'), { fullName: `${s.data()!.fullName} M` });
      tx.set(doc(db, 'admissions', 'A1'), { fullName: 'Amy Banda M' });
    });
    await flushAudit();
    const ops = entries()[0].ops;
    expect(ops.map(o => `${o.op} ${o.path}`)).toEqual([
      'set results/R1', 'update learners/L1', 'delete results/R0', 'update learners/L1', 'set admissions/A1',
    ]);
    expect(ops[0]).toMatchObject({ label: 'Amy Banda', values: { score: 71 } });
    expect(store.get('learners')?.get('L1')?.fullName).toBe('Amy Banda M');
  });

  it('chained batch calls (batch.set(…).commit()) are recorded too', async () => {
    await writeBatch(db).set(doc(db, 'classes', 'C1'), { name: 'Form 1C' }).update(doc(db, 'learners', 'L1'), { classId: 'C1' }).commit();
    await flushAudit();
    expect(entries()[0].ops.map(o => `${o.op} ${o.path}`)).toEqual(['set classes/C1', 'update learners/L1']);
  });

  it('a failed write is not recorded, and the error reaches the caller unchanged', async () => {
    await expect(updateDoc(doc(db, 'learners', 'NOPE'), { x: 1 })).rejects.toThrow();
    await expect(runTransaction(db, async () => { throw new Error('refused'); })).rejects.toThrow('refused');
    await flushAudit();
    expect(entries()).toHaveLength(0);
  });

  it('nothing is recorded when nobody is signed in; the audit never audits itself', async () => {
    h.auth.currentUser = null;
    await setDoc(doc(db, 'learners', 'L3'), { fullName: 'Signed out' });
    await flushAudit();
    expect(entries()).toHaveLength(0);
    h.auth.currentUser = { uid: 'ADMIN' };
    await setDoc(doc(db, 'audit_log', 'x'), { ops: [] });
    await flushAudit();
    expect(entries().filter(e => e.ops?.length)).toHaveLength(0);
  });

  it('records sign-in / sign-out events, and uses the signed-in uid even if the name is not known yet', async () => {
    setAuditActor(null);
    h.auth.currentUser = { uid: 'T7', displayName: '' };
    auditEvent('Signed in');
    await flushAudit();
    expect(entries()[0]).toMatchObject({ actorId: 'T7', ops: [{ op: 'event', action: 'Signed in', collection: 'session' }] });
  });

  it('a large action is split into entries of at most 60 changes', async () => {
    const b = writeBatch(db);
    for (let i = 0; i < 130; i++) b.set(doc(db, 'results', `R${i}`), { score: i });
    await b.commit();
    await flushAudit();
    expect(entries().map(e => e.count).sort((a, b) => a - b)).toEqual([10, 60, 60]);
  });

  it('describes values briefly: long text cut, lists counted, maps by name only, server values named', () => {
    const op = describeWrite('set', { path: 'classes/F2A/sub/S1', id: 'S1' }, {
      note: 'x'.repeat(100), list: [1, 2, 3], map: { a: 1 }, at: serverTimestamp(), flag: false, nothing: null,
    });
    expect(op.collection).toBe('sub');
    expect(op.values).toEqual({ note: `${'x'.repeat(77)}…`, list: '[3 items]', flag: false, nothing: null, ...(op.values?.at !== undefined ? { at: op.values.at } : {}) });
    expect(op.fields).toEqual(['note', 'list', 'map', 'at', 'flag', 'nothing']);
  });
});
