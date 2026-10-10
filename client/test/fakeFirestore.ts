// In-memory stand-in for the parts of `firebase/firestore` the results code
// uses, so the real services can run inside unit tests. It mimics the
// behaviours that matter for correctness:
//   - equality `where` filters and `in`
//   - `orderBy` drops documents that lack the ordered field (as Firestore does)
//   - batches apply atomically on commit; `{ merge: true }` merges fields
// Every write is logged so tests can check it against the Firestore rules.

type Data = Record<string, any>;

export const store = new Map<string, Map<string, Data>>();
export const writeLog: Array<{ op: 'set' | 'update' | 'delete'; path: string; before: Data | null; after: Data | null }> = [];

let autoId = 0;
const colOf = (name: string) => {
  if (!store.has(name)) store.set(name, new Map());
  return store.get(name)!;
};

export function resetStore(seed: Record<string, Record<string, Data>> = {}) {
  store.clear();
  writeLog.length = 0;
  for (const [col, docs] of Object.entries(seed)) {
    const m = colOf(col);
    for (const [id, d] of Object.entries(docs)) m.set(id, structuredClone(d));
  }
}

export const getDocData = (col: string, id: string) => store.get(col)?.get(id);

// ---------- refs ----------
export const getFirestore = () => ({ __db: true });
export const collection = (_db: any, name: string) => ({ type: 'collection', path: name });
export function doc(parent: any, ...segs: string[]) {
  if (parent?.type === 'collection') {
    const id = segs[0] ?? `auto_${++autoId}`;
    if (id === '') throw new Error('Invalid document reference');
    return { type: 'doc', col: parent.path, id, path: `${parent.path}/${id}` };
  }
  const [col, id] = segs;
  if (!id) throw new Error('Invalid document reference');
  return { type: 'doc', col, id, path: `${col}/${id}` };
}

// ---------- queries ----------
export const where = (field: string, op: string, value: any) => ({ kind: 'where', field, op, value });
export const orderBy = (field: string, dir: 'asc' | 'desc' = 'asc') => ({ kind: 'orderBy', field, dir });
export const limit = (n: number) => ({ kind: 'limit', n });
export const query = (col: any, ...constraints: any[]) => ({ type: 'query', path: col.path, constraints });

const snapDoc = (col: string, id: string, data: Data | undefined) => ({
  id,
  ref: { type: 'doc', col, id, path: `${col}/${id}` },
  exists: () => data !== undefined,
  data: () => (data === undefined ? undefined : structuredClone(data)),
});

export async function getDocs(q: any) {
  const col = q.path;
  const constraints: any[] = q.constraints ?? [];
  let rows = [...colOf(col).entries()];
  for (const c of constraints) {
    if (c.kind === 'where') {
      rows = rows.filter(([id, d]) => {
        const v = c.field === '__name__' ? id : d[c.field];
        if (c.op === '==') return v === c.value;
        if (c.op === '<') return v !== undefined && v < c.value;
        if (c.op === '>=') return v !== undefined && v >= c.value;
        if (c.op === 'in') return (c.value as any[]).includes(v);
        if (c.op === '<=') return v !== undefined && v <= c.value;
        if (c.op === '>') return v !== undefined && v > c.value;
        if (c.op === 'array-contains') return Array.isArray(v) && v.includes(c.value);
        throw new Error(`fake where op ${c.op} not supported`);
      });
    }
  }
  for (const c of constraints) {
    if (c.kind === 'orderBy') {
      rows = rows.filter(([, d]) => d[c.field] !== undefined);
      rows.sort(([, a], [, b]) => (a[c.field] < b[c.field] ? -1 : a[c.field] > b[c.field] ? 1 : 0) * (c.dir === 'desc' ? -1 : 1));
    }
  }
  const lim = constraints.find(c => c.kind === 'limit');
  if (lim) rows = rows.slice(0, lim.n);
  const docs = rows.map(([id, d]) => snapDoc(col, id, d));
  return { docs, empty: docs.length === 0, size: docs.length };
}

export async function getDoc(ref: any) {
  return snapDoc(ref.col, ref.id, colOf(ref.col).get(ref.id));
}

// ---------- writes ----------
const applySet = (ref: any, data: Data, opts?: { merge?: boolean }) => {
  const m = colOf(ref.col);
  const before = m.get(ref.id) ? structuredClone(m.get(ref.id)!) : null;
  const after = opts?.merge && before ? { ...before, ...structuredClone(data) } : structuredClone(data);
  m.set(ref.id, after);
  writeLog.push({ op: 'set', path: ref.path, before, after: structuredClone(after) });
};
const applyUpdate = (ref: any, data: Data) => {
  const m = colOf(ref.col);
  const before = m.get(ref.id);
  if (!before) throw new Error(`No document to update: ${ref.path}`);
  const after = { ...before, ...structuredClone(data) };
  m.set(ref.id, after);
  writeLog.push({ op: 'update', path: ref.path, before: structuredClone(before), after: structuredClone(after) });
};
const applyDelete = (ref: any) => {
  const m = colOf(ref.col);
  const before = m.get(ref.id) ?? null;
  m.delete(ref.id);
  writeLog.push({ op: 'delete', path: ref.path, before, after: null });
};

export function writeBatch(_db: any) {
  const ops: Array<() => void> = [];
  return {
    set: (ref: any, data: Data, opts?: any) => { ops.push(() => applySet(ref, data, opts)); },
    update: (ref: any, data: Data) => { ops.push(() => applyUpdate(ref, data)); },
    delete: (ref: any) => { ops.push(() => applyDelete(ref)); },
    commit: async () => { ops.forEach(o => o()); },
  };
}
export const setDoc = async (ref: any, data: Data, opts?: any) => applySet(ref, data, opts);
export const updateDoc = async (ref: any, data: Data) => applyUpdate(ref, data);
export const deleteDoc = async (ref: any) => applyDelete(ref);
export const addDoc = async (col: any, data: Data) => {
  const ref = doc(col);
  applySet(ref, data);
  return ref;
};

// ---------- values used at import time by the services ----------
export const serverTimestamp = () => new Date().toISOString();
export const arrayUnion = (...v: any[]) => v;
export const arrayRemove = (...v: any[]) => v;
export const increment = (n: number) => n;
export class Timestamp {
  constructor(public seconds: number, public nanoseconds = 0) {}
  static fromDate(d: Date) { return new Timestamp(Math.floor(d.getTime() / 1000)); }
  static now() { return Timestamp.fromDate(new Date()); }
  toDate() { return new Date(this.seconds * 1000); }
}
// Transactions run their writes in order, immediately (no contention in tests).
export const runTransaction = async (_db: any, fn: (tx: any) => Promise<any>) => {
  const ops: Array<() => void> = [];
  const tx = {
    get: (ref: any) => getDoc(ref),
    set: (ref: any, data: Data, opts?: any) => { ops.push(() => applySet(ref, data, opts)); return tx; },
    update: (ref: any, data: Data) => { ops.push(() => applyUpdate(ref, data)); return tx; },
    delete: (ref: any) => { ops.push(() => applyDelete(ref)); return tx; },
  };
  const out = await fn(tx);
  ops.forEach(o => o());
  return out;
};
