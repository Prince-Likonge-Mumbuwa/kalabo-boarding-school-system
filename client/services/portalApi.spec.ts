import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  remote: null as null | ((data: any) => Promise<any>),
  remoteCalls: 0,
  direct: [] as string[],
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

import { portalApi, resetPortalMode } from './portalApi';

const fail = (code: string, message: string) => async () => { throw Object.assign(new Error(message), { code }); };

beforeEach(() => { resetPortalMode(); h.remoteCalls = 0; h.direct = []; });

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
});
