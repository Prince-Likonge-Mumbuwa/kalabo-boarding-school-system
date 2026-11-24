// Test-only: the parts of `firebase-admin/firestore` the portal uses, working on
// the SAME in-memory store as client/test/fakeFirestore.ts (the browser fake).
// So a test can build a report card the app's way and the portal function's
// way from identical data, and compare.
import * as web from '../../client/test/fakeFirestore';

type Data = Record<string, any>;

// Same classes / sentinels as the browser fake, so stored values compare equal.
export const Timestamp = web.Timestamp;
export const FieldValue = {
  serverTimestamp: () => web.serverTimestamp(),
  increment: (n: number) => web.increment(n),
  arrayUnion: (...v: unknown[]) => web.arrayUnion(...v),
  arrayRemove: (...v: unknown[]) => web.arrayRemove(...v),
  delete: () => undefined,
};
export class FieldPath {
  constructor(public readonly name: string) {}
  static documentId() { return '__name__' as unknown as FieldPath; }
}

const webRef = (col: string, id: string) => ({ type: 'doc', col, id, path: `${col}/${id}` });

class DocSnap {
  constructor(public readonly ref: DocRef, private readonly d: Data | undefined) {}
  get id() { return this.ref.id; }
  get exists() { return this.d !== undefined; }
  data() { return this.d === undefined ? undefined : structuredClone(this.d); }
  get(field: string) { return this.d?.[field]; }
}

class DocRef {
  constructor(public readonly col: string, public readonly id: string) {}
  get path() { return `${this.col}/${this.id}`; }
  get firestore() { return db; }
  get parent() { return new ColRef(this.col); }
  collection(sub: string) { return new ColRef(`${this.path}/${sub}`); }
  async get() { const s = await web.getDoc(webRef(this.col, this.id)); return new DocSnap(this, s.data()); }
  async set(data: Data, opts?: { merge?: boolean }) { await web.setDoc(webRef(this.col, this.id), data, opts); }
  async update(data: Data) { await web.updateDoc(webRef(this.col, this.id), data); }
  async delete() { await web.deleteDoc(webRef(this.col, this.id)); }
}

class Query {
  constructor(public readonly path: string, protected readonly cs: any[] = []) {}
  where(field: any, op: string, value: unknown) { return new Query(this.path, [...this.cs, web.where(String(field), op, value)]); }
  orderBy(field: any, dir: 'asc' | 'desc' = 'asc') { return new Query(this.path, [...this.cs, web.orderBy(String(field), dir)]); }
  limit(n: number) { return new Query(this.path, [...this.cs, web.limit(n)]); }
  startAfter(snap: any) { return new Query(this.path, [...this.cs, web.startAfter(snap)]); }
  async get() {
    const r = await web.getDocs({ path: this.path, constraints: this.cs });
    const docs = r.docs.map((d: any) => new DocSnap(new DocRef(this.path, d.id), d.data()));
    return { docs, empty: docs.length === 0, size: docs.length, forEach: (f: any) => docs.forEach(f) };
  }
}

class ColRef extends Query {
  get id() { return this.path.split('/').pop()!; }
  doc(id?: string) { return new DocRef(this.path, id ?? (web.doc({ type: 'collection', path: this.path }) as any).id); }
  async add(data: Data) { const r = this.doc(); await r.set(data); return r; }
}

export const db = {
  collection: (path: string) => new ColRef(path),
  doc: (path: string) => { const i = path.lastIndexOf('/'); return new DocRef(path.slice(0, i), path.slice(i + 1)); },
  batch: () => {
    const b = web.writeBatch({});
    const self = {
      set: (r: DocRef, d: Data, o?: any) => { b.set(webRef(r.col, r.id), d, o); return self; },
      update: (r: DocRef, d: Data) => { b.update(webRef(r.col, r.id), d); return self; },
      delete: (r: DocRef) => { b.delete(webRef(r.col, r.id)); return self; },
      commit: () => b.commit(),
    };
    return self;
  },
  runTransaction: (fn: (t: any) => Promise<any>) =>
    web.runTransaction({}, async (wt: any) => {
      const t = {
        get: async (r: DocRef) => new DocSnap(r, (await wt.get(webRef(r.col, r.id))).data()),
        set: (r: DocRef, d: Data, o?: any) => { wt.set(webRef(r.col, r.id), d, o); return t; },
        update: (r: DocRef, d: Data) => { wt.update(webRef(r.col, r.id), d); return t; },
        delete: (r: DocRef) => { wt.delete(webRef(r.col, r.id)); return t; },
      };
      return fn(t);
    }),
};

export const getFirestore = () => db;
