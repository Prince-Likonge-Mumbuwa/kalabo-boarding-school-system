// sms-functions/portal/adminFirestore.ts
//
// The browser's Firestore API ("firebase/firestore": collection, doc, getDocs,
// query, where, ...) rebuilt on top of the Admin SDK, so the app's OWN code
// (resultsService, schoolService, guidanceService — through portalDirect.ts)
// can run inside the `portal` Cloud Function unchanged.
//
// Why: parents and sponsors never sign in, and the database is closed to
// signed-out visitors. The function reads with admin rights instead, and the
// report cards it returns are built by exactly the same code as in the app.
//
// Only what that code uses is implemented. If a new import is missing, the
// portal build (npm run build:portal) fails with the name, never silently.
//
// The differences this file hides:
//   • browser:  snap.exists() is a function     admin: snap.exists is a boolean
//   • browser:  query(ref, where(...), ...)      admin: ref.where(...).orderBy(...)
//   • browser:  writeBatch(db) / runTransaction(db, fn)   admin: db.batch() / db.runTransaction(fn)
//   • browser:  serverTimestamp(), increment()   admin: FieldValue.serverTimestamp(), ...

import {
  getFirestore as adminGetFirestore,
  FieldValue,
  FieldPath,
  Timestamp as AdminTimestamp,
  type Firestore as AdminFirestore,
  type DocumentReference as AdminDocRef,
  type CollectionReference as AdminColRef,
  type Query as AdminQuery,
  type DocumentSnapshot as AdminDocSnap,
  type QuerySnapshot as AdminQuerySnap,
  type Transaction as AdminTransaction,
  type WriteBatch as AdminWriteBatch,
} from 'firebase-admin/firestore';

// ───────────── types the app imports (type-only, erased at build) ─────────────
export type DocumentData = Record<string, any>;
export type Firestore = AdminFirestore;
export type DocumentReference<T = DocumentData> = AdminDocRef<T>;
export type CollectionReference<T = DocumentData> = AdminColRef<T>;
export type Transaction = TransactionAdapter;
export type WriteBatch = WriteBatchAdapter;

export const Timestamp = AdminTimestamp;
export type Timestamp = AdminTimestamp;

// ───────────── database ─────────────
export function getFirestore(): AdminFirestore {
  return adminGetFirestore();
}

const isDb = (x: any): x is AdminFirestore => !!x && typeof x.collection === 'function' && typeof x.batch === 'function';
const isDocRef = (x: any): x is AdminDocRef => !!x && typeof x.collection === 'function' && typeof x.set === 'function' && !isDb(x);
const isColRef = (x: any): x is AdminColRef => !!x && typeof x.doc === 'function' && typeof x.add === 'function';

/** collection(db, 'a') · collection(db, 'a', id, 'b') · collection(docRef, 'b') */
export function collection(parent: any, path: string, ...rest: string[]): AdminColRef {
  const full = [path, ...rest].join('/');
  if (isDb(parent)) return parent.collection(full);
  if (isDocRef(parent)) return parent.collection(full);
  throw new Error('collection(): first argument must be the database or a document reference');
}

/** doc(db, 'a', id) · doc(db, 'a/id') · doc(colRef, id) · doc(colRef) (new id) */
export function doc(parent: any, path?: string, ...rest: string[]): AdminDocRef {
  if (isColRef(parent)) return path === undefined ? parent.doc() : parent.doc([path, ...rest].join('/'));
  if (isDb(parent)) {
    if (path === undefined) throw new Error('doc(): a path is required');
    return parent.doc([path, ...rest].join('/'));
  }
  if (isDocRef(parent) && path !== undefined) return parent.firestore.doc(`${parent.path}/${[path, ...rest].join('/')}`);
  throw new Error('doc(): first argument must be the database or a collection reference');
}

// ───────────── snapshots (browser shape) ─────────────
export class DocumentSnapshot<T = DocumentData> {
  constructor(private readonly snap: AdminDocSnap<T>) {}
  get id() { return this.snap.id; }
  get ref() { return this.snap.ref; }
  exists(): boolean { return this.snap.exists; }
  data(): T | undefined { return this.snap.exists ? this.snap.data() : undefined; }
  get(field: string): any { return this.snap.get(field); }
}
export type QueryDocumentSnapshot<T = DocumentData> = DocumentSnapshot<T> & { data(): T };

export class QuerySnapshot<T = DocumentData> {
  readonly docs: QueryDocumentSnapshot<T>[];
  constructor(snap: AdminQuerySnap<T>) {
    this.docs = snap.docs.map((d) => new DocumentSnapshot<T>(d) as QueryDocumentSnapshot<T>);
  }
  get size() { return this.docs.length; }
  get empty() { return this.docs.length === 0; }
  forEach(cb: (d: QueryDocumentSnapshot<T>) => void) { this.docs.forEach(cb); }
}

const wrapDoc = <T>(s: AdminDocSnap<T>) => new DocumentSnapshot<T>(s);

// ───────────── queries ─────────────
type Constraint =
  | { kind: 'where'; field: string | FieldPath; op: FirebaseFirestore.WhereFilterOp; value: unknown }
  | { kind: 'orderBy'; field: string | FieldPath; dir: 'asc' | 'desc' }
  | { kind: 'limit'; n: number }
  | { kind: 'startAfter'; values: unknown[] };

export const where = (field: string | FieldPath, op: FirebaseFirestore.WhereFilterOp, value: unknown): Constraint => ({ kind: 'where', field, op, value });
export const orderBy = (field: string | FieldPath, dir: 'asc' | 'desc' = 'asc'): Constraint => ({ kind: 'orderBy', field, dir });
export const limit = (n: number): Constraint => ({ kind: 'limit', n });
export const startAfter = (...values: unknown[]): Constraint => ({ kind: 'startAfter', values });
export const documentId = () => FieldPath.documentId();

export function query(base: AdminQuery | AdminColRef, ...constraints: Constraint[]): AdminQuery {
  let q: AdminQuery = base;
  for (const c of constraints) {
    if (c.kind === 'where') q = q.where(c.field as any, c.op, c.value);
    else if (c.kind === 'orderBy') q = q.orderBy(c.field as any, c.dir);
    else if (c.kind === 'limit') q = q.limit(c.n);
    else if (c.kind === 'startAfter') {
      const v = c.values.map((x: any) => (x instanceof DocumentSnapshot ? (x as any).snap : x));
      q = q.startAfter(...v);
    }
  }
  return q;
}

// ───────────── reads ─────────────
export async function getDoc<T = DocumentData>(ref: AdminDocRef<T>): Promise<DocumentSnapshot<T>> {
  return wrapDoc(await ref.get());
}
export async function getDocs<T = DocumentData>(q: AdminQuery<T>): Promise<QuerySnapshot<T>> {
  return new QuerySnapshot<T>(await q.get());
}

// ───────────── writes ─────────────
export async function setDoc(ref: AdminDocRef, data: DocumentData, options?: { merge?: boolean }): Promise<void> {
  await (options?.merge ? ref.set(data, { merge: true }) : ref.set(data));
}
/** updateDoc(ref, {a: 1}) · updateDoc(ref, 'a', 1, 'b', 2) */
export async function updateDoc(ref: AdminDocRef, dataOrField: any, ...more: any[]): Promise<void> {
  if (typeof dataOrField === 'string' || dataOrField instanceof FieldPath) await (ref.update as any)(dataOrField, ...more);
  else await ref.update(dataOrField);
}
export async function addDoc(col: AdminColRef, data: DocumentData): Promise<AdminDocRef> {
  return col.add(data);
}
export async function deleteDoc(ref: AdminDocRef): Promise<void> {
  await ref.delete();
}

class WriteBatchAdapter {
  constructor(private readonly b: AdminWriteBatch) {}
  set(ref: AdminDocRef, data: DocumentData, options?: { merge?: boolean }) { options?.merge ? this.b.set(ref, data, { merge: true }) : this.b.set(ref, data); return this; }
  update(ref: AdminDocRef, dataOrField: any, ...more: any[]) { (this.b.update as any)(ref, dataOrField, ...more); return this; }
  delete(ref: AdminDocRef) { this.b.delete(ref); return this; }
  async commit() { await this.b.commit(); }
}
export const writeBatch = (db: AdminFirestore) => new WriteBatchAdapter(db.batch());

class TransactionAdapter {
  constructor(private readonly t: AdminTransaction) {}
  async get(ref: AdminDocRef) { return wrapDoc(await this.t.get(ref)); }
  set(ref: AdminDocRef, data: DocumentData, options?: { merge?: boolean }) { options?.merge ? this.t.set(ref, data, { merge: true }) : this.t.set(ref, data); return this; }
  update(ref: AdminDocRef, dataOrField: any, ...more: any[]) { (this.t.update as any)(ref, dataOrField, ...more); return this; }
  delete(ref: AdminDocRef) { this.t.delete(ref); return this; }
}
export function runTransaction<R>(db: AdminFirestore, fn: (tx: TransactionAdapter) => Promise<R>): Promise<R> {
  return db.runTransaction((t) => fn(new TransactionAdapter(t)));
}

// ───────────── field values ─────────────
export const serverTimestamp = () => FieldValue.serverTimestamp();
export const increment = (n: number) => FieldValue.increment(n);
export const arrayUnion = (...v: unknown[]) => FieldValue.arrayUnion(...v);
export const arrayRemove = (...v: unknown[]) => FieldValue.arrayRemove(...v);
export const deleteField = () => FieldValue.delete();

// ───────────── auditedFirestore extras (the app's audit trail) ─────────────
// The portal is signed out, so there is no staff member to record; portal
// writes (spending a sponsor code) are stamped by the code itself.
export const AUDIT_COLLECTION = 'audit_log';
export const setAuditActor = (_a: unknown) => {};
export const flushAudit = async () => {};
export const auditEvent = (_action: string, _details?: unknown) => {};
export const describeWrite = (op: string, ref: { path?: string; id?: string }) => ({ op, path: ref?.path || '', id: ref?.id || '' });
