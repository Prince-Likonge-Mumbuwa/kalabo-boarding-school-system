// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
vi.mock('firebase/firestore', async () => await import('../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}) }));
import { useSessionDraft } from './useAttendanceSession';

describe('draft register + face recognition', () => {
  it('face ticks set present and remember the match; marking by hand afterwards wins', () => {
    const { result } = renderHook(() => useSessionDraft(null));
    act(() => result.current.markPresentByFace([{ learnerId: 's1', similarity: 0.62 }, { learnerId: 's2', similarity: 0.5 }]));
    expect(result.current.draft).toEqual({ s1: 'present', s2: 'present' });
    expect(result.current.faceMatches).toEqual({ s1: 0.62, s2: 0.5 });
    expect(result.current.dirty).toBe(true);

    act(() => result.current.setStatus('s2', 'late'));
    expect(result.current.faceMatches).toEqual({ s1: 0.62 });
    act(() => result.current.bulkSet(['s1'], 'absent'));
    expect(result.current.faceMatches).toEqual({});
  });

  it('a saved register brings its face marks back when reopened', () => {
    const loaded: any = { id: 'x', roster: { s1: 'present' }, faceMatches: { s1: 0.7 } };
    const { result } = renderHook(() => useSessionDraft(loaded));
    expect(result.current.faceMatches).toEqual({ s1: 0.7 });
  });
});
