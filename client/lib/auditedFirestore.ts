// @/lib/auditedFirestore.ts — Firestore with an audit trail.
//
// The app's services import Firestore from here instead of 'firebase/firestore'.
// Everything is the same Firestore API; the write calls (setDoc, updateDoc,
// addDoc, deleteDoc, batches and transactions) additionally record WHO did
// WHAT to WHICH record and WHEN, in `audit_log` (append-only, admins read it:
// Admin → Audit trail).
//
//  • Only writes that succeeded are recorded.
//  • Writes made within ~1 second by the same person are kept together in one
//    audit_log document (one user action = one entry, and one extra write).
//  • A write is never slowed down or failed by the audit: recording happens
//    afterwards and errors are ignored.
//  • Sign-in, sign-out and session expiry are recorded with auditEvent().
//
// Each entry: { actorId, actorName, actorRole, at (server time), clientAt,
//   page, ops: [{ op, collection, docId, path, label, fields, values }],
//   areas, count }.
import {
  addDoc as fsAddDoc,
  collection as fsCollection,
  deleteDoc as fsDeleteDoc,
  runTransaction as fsRunTransaction,
  serverTimestamp,
  setDoc as fsSetDoc,
  updateDoc as fsUpdateDoc,
  writeBatch as fsWriteBatch,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

export * from 'firebase/firestore';

export const AUDIT_COLLECTION = 'audit_log';

export type AuditOpKind = 'create' | 'set' | 'merge' | 'update' | 'delete' | 'event';
export interface AuditOp {
  op: AuditOpKind;
  collection: string;
  docId: string;
  path: string;
  /** A readable name for the record when the write carried one (learner, class…). */
  label?: string;
  /** Top-level fields written. */
  fields?: string[];
  /** Short values of simple fields (text, numbers, yes/no). */
  values?: Record<string, string | number | boolean | null>;
  /** For op 'event': what happened (e.g. "Signed in"). */
  action?: string;
}

export interface AuditActor { uid: string; name: string; role: string }

let actor: AuditActor | null = null;
/** Called by the auth provider when the signed-in user is known (or signs out). */
export function setAuditActor(a: AuditActor | null) { actor = a; }

// ---------- describing a write ----------

const SKIP_FIELDS = new Set(['updatedAt', 'createdAt', 'lastUpdated', 'updatedBy', 'updatedByName', 'updatedByUid', 'modifiedAt']);
const LABEL_FIELDS = ['fullName', 'name', 'teacherName', 'studentName', 'className', 'title', 'subject', 'examName'];
const MAX_FIELDS = 15;
const MAX_VALUES = 10;

const isSentinel = (v: any) => !!v && typeof v === 'object' && typeof v._methodName === 'string';

function shortValue(v: any): string | number | boolean | null | undefined {
  if (v === null) return null;
  if (typeof v === 'boolean' || typeof v === 'number') return v;
  if (typeof v === 'string') return v.length > 80 ? `${v.slice(0, 77)}…` : v;
  if (v instanceof Date) return v.toISOString();
  if (isSentinel(v)) {
    const m: string = v._methodName.replace(/^FieldValue\./, '');
    return m === 'serverTimestamp' ? '(time)' : m === 'deleteField' ? '(removed)' : `(${m})`;
  }
  if (Array.isArray(v)) return `[${v.length} item${v.length === 1 ? '' : 's'}]`;
  return undefined; // maps: field name only
}

/** Pure: a write as an audit op. `data` may be null (delete). */
export function describeWrite(op: AuditOpKind, ref: { path?: string; id?: string }, data?: Record<string, any> | null): AuditOp {
  const path = String(ref?.path ?? '');
  const parts = path.split('/');
  const out: AuditOp = { op, collection: parts.length >= 2 ? parts[parts.length - 2] : parts[0] ?? '', docId: String(ref?.id ?? parts[parts.length - 1] ?? ''), path };
  if (data && typeof data === 'object') {
    const keys = Object.keys(data).filter(k => !SKIP_FIELDS.has(k));
    if (keys.length) out.fields = keys.slice(0, MAX_FIELDS);
    const values: Record<string, string | number | boolean | null> = {};
    for (const k of keys) {
      if (Object.keys(values).length >= MAX_VALUES) break;
      const s = shortValue(data[k]);
      if (s !== undefined) values[k] = s;
    }
    if (Object.keys(values).length) out.values = values;
    const lk = LABEL_FIELDS.find(k => typeof data[k] === 'string' && data[k].trim());
    if (lk) out.label = String(data[lk]).slice(0, 80);
  }
  return out;
}

/** updateDoc(ref, data) or updateDoc(ref, 'field', value, 'field2', value2…). */
function updateData(args: any[]): Record<string, any> {
  if (args.length === 1 && args[0] && typeof args[0] === 'object') return args[0];
  const d: Record<string, any> = {};
  for (let i = 0; i + 1 < args.length; i += 2) d[String(args[i])] = args[i + 1];
  return d;
}

// ---------- buffering and saving ----------

const FLUSH_IDLE_MS = 1200;
const MAX_OPS_PER_ENTRY = 60;
let pending: AuditOp[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function currentActor(): AuditActor | null {
  const uid = (auth as any)?.currentUser?.uid as string | undefined;
  if (!uid) return null;
  return actor && actor.uid === uid ? actor : { uid, name: (auth as any)?.currentUser?.displayName || '', role: '' };
}

function record(ops: AuditOp[]) {
  const ours = ops.filter(o => o.collection !== AUDIT_COLLECTION);
  if (!ours.length || !currentActor()) return;
  pending.push(...ours);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { void flushAudit(); }, pending.length >= MAX_OPS_PER_ENTRY ? 0 : FLUSH_IDLE_MS);
}

/** Save what is waiting now (e.g. before signing out). */
export async function flushAudit(): Promise<void> {
  if (timer) { clearTimeout(timer); timer = null; }
  const who = currentActor();
  const ops = pending;
  pending = [];
  if (!who || !ops.length) return;
  const page = typeof location !== 'undefined' ? location.pathname : '';
  const saves: Promise<unknown>[] = [];
  for (let i = 0; i < ops.length; i += MAX_OPS_PER_ENTRY) {
    const chunk = ops.slice(i, i + MAX_OPS_PER_ENTRY);
    saves.push(fsAddDoc(fsCollection(db, AUDIT_COLLECTION), {
      actorId: who.uid,
      actorName: who.name,
      actorRole: who.role,
      at: serverTimestamp(),
      clientAt: new Date(),
      page,
      ops: JSON.parse(JSON.stringify(chunk)), // drop undefined
      areas: Array.from(new Set(chunk.map(o => o.collection))),
      count: chunk.length,
    }).catch(() => { /* the audit never breaks the app */ }));
  }
  await Promise.all(saves);
}

/** Record something that is not a database write (sign-in, sign-out…). */
export function auditEvent(action: string, details?: Record<string, string | number | boolean | null>) {
  record([{ op: 'event', collection: 'session', docId: '', path: '', action, ...(details ? { values: details } : {}) }]);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void flushAudit(); });
}

// ---------- the audited write calls ----------

export const setDoc = (async (ref: any, data: any, options?: any) => {
  const r = await (options === undefined ? fsSetDoc(ref, data) : fsSetDoc(ref, data, options));
  record([describeWrite(options?.merge || options?.mergeFields ? 'merge' : 'set', ref, data)]);
  return r;
}) as typeof fsSetDoc;

export const updateDoc = (async (ref: any, ...args: any[]) => {
  const r = await (fsUpdateDoc as any)(ref, ...args);
  record([describeWrite('update', ref, updateData(args))]);
  return r;
}) as typeof fsUpdateDoc;

export const addDoc = (async (colRef: any, data: any) => {
  const r = await fsAddDoc(colRef, data);
  record([describeWrite('create', r, data)]);
  return r;
}) as typeof fsAddDoc;

export const deleteDoc = (async (ref: any) => {
  const r = await fsDeleteDoc(ref);
  record([describeWrite('delete', ref, null)]);
  return r;
}) as typeof fsDeleteDoc;

/**
 * set / update / delete on a batch or transaction, recorded into `ops`.
 * Chained calls return the same audited object; `extra` overrides members
 * (a batch's commit).
 */
function recorder<T extends object>(target: T, ops: AuditOp[], extra: Record<string, unknown> = {}): T {
  const proxy: any = new Proxy(target, {
    get(t: any, prop) {
      if (typeof prop === 'string' && prop in extra) return extra[prop];
      const v = t[prop];
      if (prop === 'set') return (ref: any, data: any, options?: any) => { (options === undefined ? v.call(t, ref, data) : v.call(t, ref, data, options)); ops.push(describeWrite(options?.merge || options?.mergeFields ? 'merge' : 'set', ref, data)); return proxy; };
      if (prop === 'update') return (ref: any, ...args: any[]) => { v.call(t, ref, ...args); ops.push(describeWrite('update', ref, updateData(args))); return proxy; };
      if (prop === 'delete') return (ref: any) => { v.call(t, ref); ops.push(describeWrite('delete', ref, null)); return proxy; };
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
  return proxy;
}

export const writeBatch = ((database: any) => {
  const real = fsWriteBatch(database);
  const ops: AuditOp[] = [];
  return recorder(real, ops, {
    commit: async () => { const r = await real.commit(); record(ops.splice(0)); return r; },
  });
}) as typeof fsWriteBatch;

export const runTransaction = (async (database: any, updateFunction: any, options?: any) => {
  let ops: AuditOp[] = [];
  const run = (tx: any) => {
    ops = []; // a retried attempt starts again
    return updateFunction(recorder(tx, ops));
  };
  const r = await (options === undefined ? fsRunTransaction(database, run) : fsRunTransaction(database, run, options));
  record(ops);
  return r;
}) as typeof fsRunTransaction;
