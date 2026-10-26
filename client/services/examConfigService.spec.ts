import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/firestore', async () => await import('../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}), onAuthStateChanged: () => () => {} }));

import { resetStore, store } from '../test/fakeFirestore';
import { examConfigService } from './examConfigService';

const cfg = {
  term: 'Term 3', year: 2026, isActive: true, createdAt: '2026-09-01',
  examTypes: { week4: true, week8: true, endOfTerm: true },
  week4Date: '2026-10-01', week8Date: '2026-10-29', endOfTermDate: '2026-12-01',
  week4TotalMarks: 50, week8TotalMarks: 50, endOfTermTotalMarks: 100,
  week4Deadline: '2026-10-08', week8Deadline: '2026-11-05', endOfTermDeadline: '2026-12-10',
};

beforeEach(() => resetStore({ examConfigs: { c1: { ...cfg } } }));

describe('examConfigService — results deadlines', () => {
  it('reads the deadlines with the config', async () => {
    const c = await examConfigService.getConfigById('c1');
    expect(c).toMatchObject({ week4Deadline: '2026-10-08', week8Deadline: '2026-11-05', endOfTermDeadline: '2026-12-10' });
  });

  it('a config without deadlines reads them as null', async () => {
    const { week4Deadline: _a, week8Deadline: _b, endOfTermDeadline: _c, ...old } = cfg;
    resetStore({ examConfigs: { old } });
    const c = await examConfigService.getConfigById('old');
    expect(c).toMatchObject({ week4Deadline: null, week8Deadline: null, endOfTermDeadline: null });
  });

  it('creating saves the deadlines', async () => {
    const id = await examConfigService.createConfig({
      term: 'Term 1', year: 2027, isActive: true,
      examTypes: { week4: true, week8: false, endOfTerm: true },
      week4Deadline: '2027-02-12', endOfTermDeadline: null,
    } as any);
    expect(store.get('examConfigs')!.get(id)).toMatchObject({ week4Deadline: '2027-02-12', week8Deadline: null, endOfTermDeadline: null });
  });

  it('updating clears a field given as undefined (Firestore refuses undefined) and keeps the rest', async () => {
    await examConfigService.updateConfig('c1', { week8Deadline: null, week4Date: undefined, week4Deadline: '2026-10-09' });
    const saved = store.get('examConfigs')!.get('c1') as any;
    expect(saved).toMatchObject({ week8Deadline: null, week4Date: null, week4Deadline: '2026-10-09', endOfTermDeadline: '2026-12-10' });
    expect(Object.values(saved).includes(undefined)).toBe(false);
  });

  it('copying a term to another never carries the old deadlines over', async () => {
    await examConfigService.copyConfigs(2026, 'Term 3', 2027, 'Term 1');
    const copy = [...store.get('examConfigs')!.values()].find((c: any) => c.year === 2027) as any;
    expect(copy).toMatchObject({ term: 'Term 1', week4TotalMarks: 50, week4Deadline: null, week8Deadline: null, endOfTermDeadline: null });
  });

  it('classes that do not write a test: read cleaned, saved, and never copied to another term', async () => {
    resetStore({ examConfigs: { c1: { ...cfg, notWrittenBy: { endOfTerm: ['12A', '12B', 7], week4: [] }, notWrittenReason: { endOfTerm: 'ECZ final examinations' } } } });
    const c = await examConfigService.getConfigById('c1');
    expect(c!.notWrittenBy).toEqual({ endOfTerm: ['12A', '12B'] }); // bad ids and empty lists dropped
    expect(c!.notWrittenReason).toEqual({ endOfTerm: 'ECZ final examinations' });

    await examConfigService.updateConfig('c1', { notWrittenBy: null, notWrittenReason: null });
    expect(store.get('examConfigs')!.get('c1')).toMatchObject({ notWrittenBy: null, notWrittenReason: null });

    await examConfigService.updateConfig('c1', { notWrittenBy: { endOfTerm: ['12A'] } });
    await examConfigService.copyConfigs(2026, 'Term 3', 2027, 'Term 1');
    const copy = [...store.get('examConfigs')!.values()].find((x: any) => x.year === 2027) as any;
    expect(copy).toMatchObject({ notWrittenBy: null, notWrittenReason: null });
  });
});
