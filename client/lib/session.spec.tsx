// @vitest-environment jsdom
// 2-hour sessions, update detection and drafts kept per user.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act, render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SESSION_MAX_MS, SESSION_WARN_MS, minutesLeft, sessionState, signInTime } from './session';
import { fetchPublishedVersion, isOutdated } from './appVersion';
import { clearDraft, draftKey, readDraft, writeDraft } from './draftStore';
import { shouldRestore, useSessionDraft } from '@/hooks/useAttendanceSession';

const h = vi.hoisted(() => ({ user: { uid: 'T1' } as any, lastSignIn: '', logout: vi.fn(async () => {}) }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { get currentUser() { return { metadata: { lastSignInTime: h.lastSignIn } }; } } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: h.user, logout: h.logout }) }));
vi.mock('@/services/attendanceService', () => ({ attendanceService: {} }));
import { SessionGuard } from '@/components/app/SessionGuard';

beforeEach(() => { cleanup(); localStorage.clear(); h.logout.mockClear(); h.user = { uid: 'T1' }; });

describe('session length', () => {
  const start = Date.parse('2026-10-18T08:00:00Z');
  it('lasts 2 hours, warns in the last 10 minutes', () => {
    expect(sessionState(start, start + 60 * 60_000)).toEqual({ remainingMs: 60 * 60_000, expired: false, warn: false });
    const w = sessionState(start, start + SESSION_MAX_MS - 5 * 60_000);
    expect([w.warn, w.expired, minutesLeft(w.remainingMs)]).toEqual([true, false, 5]);
    expect(sessionState(start, start + SESSION_MAX_MS).expired).toBe(true);
    expect(sessionState(null).expired).toBe(false);
    expect(SESSION_WARN_MS).toBe(10 * 60_000);
  });
  it('reads the last sign-in time from the Firebase user', () => {
    expect(signInTime({ metadata: { lastSignInTime: 'Sun, 18 Oct 2026 08:00:00 GMT' } })).toBe(start);
    expect(signInTime(null)).toBeNull();
    expect(signInTime({ metadata: { lastSignInTime: 'garbage' } })).toBeNull();
  });

  const guard = (qc: QueryClient) => render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/dashboard/teacher']}>
        <SessionGuard />
        <Routes>
          <Route path="/dashboard/teacher" element={<p>dashboard</p>} />
          <Route path="/signin" element={<p>sign in page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  it('shows a warning near the end', async () => {
    h.lastSignIn = new Date(Date.now() - SESSION_MAX_MS + 4 * 60_000).toUTCString();
    guard(new QueryClient());
    expect(await screen.findByText(/Your session ends in/)).toBeTruthy();
    expect(screen.getByText(/minutes/).textContent).toMatch(/[34] minutes/);
    expect(h.logout).not.toHaveBeenCalled();
  });

  it('after 2 hours: unsaved work is told to save, cached data is cleared, the user is signed out', async () => {
    h.lastSignIn = new Date(Date.now() - SESSION_MAX_MS - 60_000).toUTCString();
    const qc = new QueryClient();
    qc.setQueryData(['teachers'], ['secret']);
    const ending = vi.fn();
    window.addEventListener('kbs:session-ending', ending);
    guard(qc);
    expect(await screen.findByText('sign in page')).toBeTruthy();
    expect(h.logout).toHaveBeenCalledTimes(1);
    expect(ending).toHaveBeenCalledTimes(1);
    expect(qc.getQueryData(['teachers'])).toBeUndefined();
    window.removeEventListener('kbs:session-ending', ending);
  });
});

describe('new version detection', () => {
  const answer = (body: any, type = 'application/json', ok = true) =>
    vi.fn(async () => ({ ok, headers: { get: () => type }, json: async () => body }) as any);
  it('reads /version.json without any cache', async () => {
    const f = answer({ version: 'b2' });
    expect(await fetchPublishedVersion(f)).toBe('b2');
    const [url, init] = (f.mock.calls[0] as any[]);
    expect(String(url)).toMatch(/^\/version\.json\?t=\d+/);
    expect(init.cache).toBe('no-store');
  });
  it('ignores the app page, errors and missing files', async () => {
    expect(await fetchPublishedVersion(answer('<html>', 'text/html'))).toBeNull();
    expect(await fetchPublishedVersion(answer({}, 'application/json', false))).toBeNull();
    expect(await fetchPublishedVersion(vi.fn(async () => { throw new Error('offline'); }) as any)).toBeNull();
  });
  it('outdated only when a different version is published (never in development)', () => {
    expect(isOutdated('b2', 'b1')).toBe(true);
    expect(isOutdated('b1', 'b1')).toBe(false);
    expect(isOutdated(null, 'b1')).toBe(false);
    expect(isOutdated('b2', 'dev')).toBe(false);
  });
});

describe('drafts kept per user', () => {
  it('stores per user and expires after a week', () => {
    const k = draftKey('T1', 'attendance', 'F2A', '2026-10-18', 'daily');
    expect(k).not.toBe(draftKey('T2', 'attendance', 'F2A', '2026-10-18', 'daily'));
    writeDraft(k, { a: 1 }, 1000);
    expect(readDraft(k, 2000)?.value).toEqual({ a: 1 });
    expect(readDraft(k, 1000 + 8 * 24 * 3600_000)).toBeNull();
    writeDraft(k, { a: 2 });
    clearDraft(k);
    expect(readDraft(k)).toBeNull();
  });

  const saved = (markedAt: string) => ({ id: 'S1', roster: { L1: 'present' }, excuseReasons: {}, markedAt: new Date(markedAt) } as any);

  it('restores unsaved marks only if nobody saved the register since', () => {
    const base = { draft: {}, reasons: {}, faceMatches: {}, baseId: 'S1', baseMarkedAt: Date.parse('2026-10-18T08:00:00Z') };
    expect(shouldRestore(base, saved('2026-10-18T08:00:00Z'))).toBe(true);
    expect(shouldRestore(base, saved('2026-10-18T09:00:00Z'))).toBe(false); // saved later by someone
    expect(shouldRestore({ ...base, baseId: null, baseMarkedAt: null }, null)).toBe(true); // still unsaved
    expect(shouldRestore({ ...base, baseId: null, baseMarkedAt: null }, saved('2026-10-18T09:00:00Z'))).toBe(false);
    expect(shouldRestore(base, null)).toBe(false); // register deleted since
  });

  it('a register edited before signing out comes back, until it is saved', () => {
    const key = draftKey('T1', 'attendance', 'F2A', '2026-10-18', 'daily');
    const first = renderHook(({ s }) => useSessionDraft(s, key), { initialProps: { s: null as any } });
    act(() => first.result.current.setStatus('L1', 'absent'));
    act(() => first.result.current.setStatus('L2', 'present'));
    first.unmount(); // signed out / reloaded

    const again = renderHook(({ s }) => useSessionDraft(s, key), { initialProps: { s: null as any } });
    expect(again.result.current.draft).toEqual({ L1: 'absent', L2: 'present' });
    expect(again.result.current.dirty).toBe(true);
    expect(again.result.current.recovered).toBe('restored');
    act(() => again.result.current.markClean()); // saved
    again.unmount();
    expect(readDraft(key)).toBeNull();
  });

  it('another user on the device never gets them; a later save by someone else wins', () => {
    const mine = draftKey('T1', 'attendance', 'F2A', '2026-10-18', 'daily');
    const r = renderHook(() => useSessionDraft(null, mine));
    act(() => r.result.current.setStatus('L1', 'absent'));
    r.unmount();
    const other = renderHook(() => useSessionDraft(null, draftKey('T2', 'attendance', 'F2A', '2026-10-18', 'daily')));
    expect(other.result.current.draft).toEqual({});
    other.unmount();
    const later = renderHook(() => useSessionDraft({ id: 'S9', roster: { L1: 'present' }, markedAt: new Date() } as any, mine));
    expect(later.result.current.draft).toEqual({ L1: 'present' });
    expect(later.result.current.recovered).toBe('superseded');
    expect(readDraft(mine)).toBeNull();
  });
});
