import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  remote: null as null | ((data: any) => Promise<any>),
  remoteCalls: 0,
  direct: [] as string[],
  /** Which terms are published; anything else is closed. */
  released: new Set<string>(['Term 3|2026']),
  releaseError: null as any,
}));

vi.mock('@/lib/firebase', () => ({ app: {}, db: {}, auth: {} }));
vi.mock('firebase/functions', () => ({
  getFunctions: () => ({}),
  httpsCallable: () => async (data: any) => {
    h.remoteCalls++;
    return { data: await h.remote!(data) };
  },
}));
vi.mock('@/services/portalDirect', () => ({
  portalDirect: {
    parentChildren: vi.fn(async () => { h.direct.push('children'); return [{ id: 'L1', studentId: 'F1A_001', fullName: 'Ann', className: 'Form 1A' }]; }),
    parentReport: vi.fn(async () => { h.direct.push('report'); return { studentName: 'Ann' }; }),
    sponsorCheck: vi.fn(),
    sponsorReports: vi.fn(),
    sponsorRedeem: vi.fn(),
  },
}));

// Which terms the school has published (resultsPublication.spec.ts tests the real thing).
vi.mock('@/services/resultsPublication', () => ({
  isTermReleased: async (term: string, year: number) => {
    if (h.releaseError) throw h.releaseError;
    return h.released.has(`${term}|${year}`);
  },
  ResultsNotReleasedError: class extends Error {
    readonly code = 'results-not-published';
    constructor(term: string, year: number) {
      super(`${term} ${year} results have not been released yet.`);
    }
  },
}));

import { portalApi, resetPortalMode } from './portalApi';

const fail = (code: string, message: string) => async () => { throw Object.assign(new Error(message), { code }); };

beforeEach(() => {
  resetPortalMode();
  h.remoteCalls = 0;
  h.direct = [];
  h.released = new Set(['Term 3|2026']);
  h.releaseError = null;
});

describe('portalApi', () => {
  it('uses the portal function when it answers', async () => {
    h.remote = async () => ({ children: [{ id: 'X', studentId: '', fullName: 'Remote', className: '' }] });
    const kids = await portalApi.parentChildren('+260977123456');
    expect(kids[0].fullName).toBe('Remote');
    expect(h.direct).toEqual([]);
  });

  it('reads the records directly when the function is not deployed (bare "internal")', async () => {
    h.remote = fail('functions/internal', 'internal');
    const kids = await portalApi.parentChildren('+260977123456');
    expect(kids.map(k => k.fullName)).toEqual(['Ann']);
    // Later calls skip the missing function.
    const card = await portalApi.parentReport('+260977123456', 'L1', 'Term 3', 2026);
    expect(card).toEqual({ studentName: 'Ann' });
    expect(h.remoteCalls).toBe(1);
    expect(h.direct).toEqual(['children', 'report']);
  });

  it('also falls back on "not-found" and on a lost connection', async () => {
    h.remote = fail('functions/not-found', 'Not Found');
    await portalApi.parentChildren('+260977123456');
    resetPortalMode();
    h.remote = fail('functions/unavailable', 'unavailable');
    await portalApi.parentChildren('+260977123456');
    expect(h.direct).toEqual(['children', 'children']);
  });

  it("shows the function's own error messages instead of falling back", async () => {
    h.remote = fail('functions/invalid-argument', 'Please enter a guardian phone number.');
    await expect(portalApi.parentChildren('+260977123456')).rejects.toThrow('Please enter a guardian phone number.');
    expect(h.direct).toEqual([]);
  });

  describe('only published terms reach guardians and sponsors', () => {
    const card = (term: string, year: number) => ({ studentName: 'Ann', term, year });

    it('a published term is returned', async () => {
      h.remote = async () => ({ reportCard: card('Term 3', 2026) });
      expect(await portalApi.parentReport('+260977123456', 'L1', 'Term 3', 2026)).toEqual(card('Term 3', 2026));
    });

    it('an unpublished term is refused before anything is fetched', async () => {
      h.remote = async () => ({ reportCard: card('Term 2', 2027) });
      const err: any = await portalApi.parentReport('+260977123456', 'L1', 'Term 2', 2027).catch(e => e);
      expect(err.name).toBe('PortalError');
      expect(err.code).toBe('results-not-published');
      expect(err.message).toBe('Term 2 2027 results have not been released yet.');
      expect(h.remoteCalls).toBe(0);
      expect(h.direct).toEqual([]);
    });

    it('is the same answer in the browser fallback', async () => {
      h.remote = fail('functions/internal', 'internal');
      await portalApi.parentChildren('+260977123456'); // switches to the fallback
      await expect(portalApi.parentReport('+260977123456', 'L1', 'Term 1', 2027)).rejects.toThrow(/not been released/);
      expect(h.direct).toEqual(['children']);
    });

    it('a failed check is an error to try again, never an open door', async () => {
      h.releaseError = Object.assign(new Error('offline'), { code: 'unavailable' });
      h.remote = async () => ({ reportCard: card('Term 3', 2026) });
      await expect(portalApi.parentReport('+260977123456', 'L1', 'Term 3', 2026)).rejects.toThrow(
        'We could not check whether these results have been released. Please try again.'
      );
      expect(h.remoteCalls).toBe(0);
    });

    it('a sponsor code for an unpublished term is refused when it is checked', async () => {
      h.remote = async () => ({ code: { code: 'ABC', sponsorName: 'KGS', term: 'Term 2', year: 2027, learnerCount: 3 } });
      await expect(portalApi.sponsorCheck('ABC')).rejects.toThrow('Term 2 2027 results have not been released yet.');
    });

    it('a sponsor code for a published term passes', async () => {
      h.remote = async () => ({ code: { code: 'ABC', sponsorName: 'KGS', term: 'Term 3', year: 2026, learnerCount: 3 } });
      expect((await portalApi.sponsorCheck('ABC')).sponsorName).toBe('KGS');
    });

    it('sponsor reports of an unpublished term are held back', async () => {
      h.remote = async () => ({ reports: { cards: [card('Term 2', 2027)], noResults: [] } });
      await expect(portalApi.sponsorReports('ABC')).rejects.toThrow(/not been released/);
      h.remote = async () => ({ reports: { cards: [card('Term 3', 2026), card('Term 3', 2026)], noResults: [] } });
      expect((await portalApi.sponsorReports('ABC')).cards).toHaveLength(2);
    });
  });
});
