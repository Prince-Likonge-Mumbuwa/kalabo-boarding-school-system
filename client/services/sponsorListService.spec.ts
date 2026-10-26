import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/firestore', async () => await import('../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}), onAuthStateChanged: () => () => {} }));

import { resetStore, store } from '../test/fakeFirestore';
import { applySponsorFixes, getSponsorList, saveSponsorList, toSponsorList } from './sponsorListService';

beforeEach(() => resetStore({ learners: { a: { fullName: 'Ann', sponsor: 'Camfed' }, b: { fullName: 'Bob', sponsor: 'Mr Phiri' } } }));

describe('sponsor list on Firestore', () => {
  it('uses the default list until one is saved, then the saved one', async () => {
    expect(await getSponsorList()).toEqual({ names: ['KGS', 'CAMFED', 'CDF', 'AP', 'WISE'], aliases: {} });
    await saveSponsorList({ names: ['KGS', 'CAMFED', 'Plan International'], aliases: { camfedzambia: 'CAMFED' } }, { uid: 'T1', name: 'Mrs Guide' });
    expect(store.get('system')!.get('sponsors')).toMatchObject({ names: ['KGS', 'CAMFED', 'Plan International'], updatedBy: 'T1', updatedByName: 'Mrs Guide' });
    expect(await getSponsorList()).toEqual({ names: ['KGS', 'CAMFED', 'Plan International'], aliases: { camfedzambia: 'CAMFED' } });
  });

  it('reads a damaged document safely', () => {
    expect(toSponsorList({ names: ['KGS', ' KGS ', '', 5, 'CDF'], aliases: { x: 'Nobody', cdfz: 'CDF', y: 3 } })).toEqual({ names: ['KGS', 'CDF'], aliases: { cdfz: 'CDF' } });
    expect(toSponsorList({})).toEqual({ names: ['KGS', 'CAMFED', 'CDF', 'AP', 'WISE'], aliases: {} });
  });

  it('writes the tidied Sponsor field to the learners', async () => {
    const n = await applySponsorFixes([{ id: 'a', from: 'Camfed', to: 'CAMFED' }, { id: 'b', from: 'Mr Phiri', to: 'Self-sponsored' }]);
    expect(n).toBe(2);
    expect(store.get('learners')!.get('a')).toMatchObject({ fullName: 'Ann', sponsor: 'CAMFED' });
    expect(store.get('learners')!.get('b')).toMatchObject({ fullName: 'Bob', sponsor: 'Self-sponsored' });
  });
});
