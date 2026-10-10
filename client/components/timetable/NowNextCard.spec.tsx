// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PERIODS } from '../../test/timetableFixtures';

const h = vi.hoisted(() => ({ rows: [] as any[], holiday: null as any, sessions: [] as any[] }));
const row = (classId: string, subj: string, p: number, extra: any = {}) => ({
  entry: { slotId: `${classId}__${subj}`, classId, className: classId.toUpperCase(), subject: subj === 'MATH' ? 'Mathematics' : subj,
    normalizedSubject: subj, dayOfWeek: 1, periodIndex: p, venue: extra.venue ?? null },
  isCoveredNow: !!extra.cover, ownerTeacherName: extra.cover ?? null, delegateUntil: extra.cover ? new Date('2026-10-30') : null,
});
vi.mock('firebase/firestore', async () => await import('../../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}) }));
vi.mock('@/hooks/useTimetable', () => ({
  useTodayTimetable: () => ({ isLoading: false, data: h.rows }),
  usePeriods: () => ({ isLoading: false, data: PERIODS }),
  useHolidayCovering: () => ({ data: h.holiday }),
}));
vi.mock('@/services/attendanceService', () => ({
  attendanceService: { getSessionsForClassDate: async (c: string) => h.sessions.filter(s => s.classId === c) },
}));

import { NowNextCard } from './NowNextCard';

const renderAt = (iso: string) => {
  vi.setSystemTime(new Date(iso));
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter><NowNextCard /></MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  cleanup();
  vi.useFakeTimers({ toFake: ['Date'] });
  h.rows = [row('8a', 'MATH', 5, { venue: 'Lab 2' }), row('8a', 'MATH', 6, { venue: 'Lab 2' }), row('9b', 'MATH', 8, { cover: 'Mrs Mwale' })];
  h.holiday = null;
  h.sessions = [];
});
afterEach(() => vi.useRealTimers());

describe('Now & Next', () => {
  it('second half of a double: shows the double now, room, minutes left, and where next', () => {
    renderAt('2026-10-12T11:10:00');
    expect(screen.getByText('8A · Mathematics', { selector: 'div' })).toBeTruthy();
    expect(screen.getByText(/ends 11:40 · 30 min left/)).toBeTruthy();
    expect(screen.getAllByText('Lab 2').length).toBeGreaterThan(0);
    expect(screen.getByText('9B · Mathematics', { selector: 'div' })).toBeTruthy();
    expect(screen.getByText(/12:20 \(in 70 min\)/)).toBeTruthy();
    expect(screen.getByText(/Cover for Mrs Mwale/)).toBeTruthy();
    const link = screen.getByRole('link', { name: /Take register/ }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/dashboard/teacher/attendance?mode=periodic&class=8a&date=2026-10-12&period=5');
  });

  it('free period between lessons', () => {
    renderAt('2026-10-12T11:50:00');
    expect(screen.getByText('Free period.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Missed — take now/ })).toBeTruthy();
  });

  it('register already taken shows as taken', async () => {
    h.sessions = [5, 6].map(period => ({ classId: '8a', kind: 'periodic', period, subject: 'Mathematics', normalizedSubject: 'MATH' }));
    renderAt('2026-10-12T10:30:00');
    expect(await screen.findByText(/Register taken/)).toBeTruthy();
  });

  it('holidays and weekends', () => {
    h.holiday = { name: 'Independence Day' };
    renderAt('2026-10-12T09:00:00');
    expect(screen.getByText(/No lessons today — Independence Day/)).toBeTruthy();
    cleanup();
    h.holiday = null;
    renderAt('2026-10-10T09:00:00');
    expect(screen.getByText('No lessons today.')).toBeTruthy();
  });
});
