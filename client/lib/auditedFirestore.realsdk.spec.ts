// The audited batch works with the REAL Firestore SDK (no network needed).
import { it, expect, vi } from 'vitest';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, serverTimestamp } from 'firebase/firestore';
const app = initializeApp({ projectId: 'demo-x', apiKey: 'x' }, 'real-sdk-check');
const realDb = getFirestore(app);
vi.mock('@/lib/firebase', () => ({ db: realDb, auth: { currentUser: { uid: 'U1' } } }));
it('the real SDK accepts the audited batch and transaction proxies', async () => {
  const fs = await import('@/lib/auditedFirestore');
  const b = fs.writeBatch(realDb);
  expect(b.set(doc(realDb, 'learners/L1'), { fullName: 'Amy', at: serverTimestamp() })).toBe(b);
  expect(b.update(doc(realDb, 'learners/L1'), { classId: 'F2A' })).toBe(b);
  expect(b.delete(doc(realDb, 'learners/L2'))).toBe(b);
  // invalid data is still refused by the real SDK, through the proxy
  expect(() => b.set(doc(realDb, 'learners/L3'), { bad: undefined } as any)).toThrow();
  expect(fs.describeWrite('merge', doc(realDb, 'classes/F2A/sub/S1'), { name: 'x', at: serverTimestamp() }))
    .toMatchObject({ collection: 'sub', docId: 'S1', path: 'classes/F2A/sub/S1', values: { name: 'x', at: '(time)' } });
});
