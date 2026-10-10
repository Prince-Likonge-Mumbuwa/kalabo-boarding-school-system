// @vitest-environment jsdom
// Attendance Tracking: lessons come from the timetable of the SELECTED date,
// doubles are one choice saved for each period, deep links preselect.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PERIODS } from '../../test/timetableFixtures';

const h = vi.hoisted(() => ({
  todayCalls: [] as Array<string | undefined>,
  markSessions: vi.fn(async (x: any[]) => x),
  markSession: vi.fn(async (x: any) => x),
}));
const row = (p: number, subject = 'Mathematics') => ({
  entry: { slotId: '8a__MATH', classId: '8a', className: '8A', subject, normalizedSubject: 'MATH', dayOfWeek: 1, periodIndex: p },
  period: PERIODS.find(x => x.order === p), isCoveredNow: false, ownerTeacherId: 'T1',
});
vi.mock('firebase/firestore', async () => await import('../../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}) }));
vi.mock('@/components/DashboardLayout', () => ({ DashboardLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'T1', fullName: 'Mr One' } }) }));
vi.mock('@/hooks/useTeacherClasses', () => ({
  useTeacherClasses: () => ({ isLoading: false, data: [{ classId: '8a', className: '8A', isFormTeacher: false, subjects: [{ subject: 'Mathematics' }] }], refetch: vi.fn() }),
}));
vi.mock('@/hooks/useTeacherAssignments', () => ({ useTeacherAssignments: () => ({ assignments: [], isLoading: false }) }));
vi.mock('@/services/assignmentEngine', async (orig) => ({ ...(await orig() as any), getOperationalViewForTeacher: async () => [] }));
vi.mock('@/services/resultsGridLoader', () => ({
  loadClassRoster: async () => [{ id: 's1', studentId: '001', name: 'Alice' }, { id: 's2', studentId: '002', name: 'Ben' }],
}));
vi.mock('@/services/attendanceService', () => ({
  attendanceService: {
    markSessions: h.markSessions, markSession: h.markSession,
    getSession: async () => null, getRecentSessions: async () => [], getSessionsForClassDate: async () => [],
  },
}));
vi.mock('@/hooks/useTimetable', () => ({
  useTodayTimetable: (d?: string) => {
    h.todayCalls.push(d);
    return { isSuccess: true, isLoading: false, data: d === '2026-10-12' ? [row(5), row(6), row(8)] : [], refetch: vi.fn() };
  },
  useCurrentPeriod: () => ({ data: null, refetch: vi.fn() }),
  useHolidayCovering: () => ({ data: null }),
  usePeriods: () => ({ isSuccess: true, data: PERIODS }),
}));
vi.mock('@/components/attendance/RiskAnalyticsTab', () => ({ RiskAnalyticsTab: () => null }));
vi.mock('@/components/attendance/PeriodicOverview', () => ({ PeriodicOverview: () => null }));

import AttendanceTracking from './AttendanceTracking';

const renderAt = (url: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[url]}><AttendanceTracking /></MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  cleanup();
  h.todayCalls.length = 0;
  h.markSessions.mockClear();
});

describe('Attendance Tracking + timetable', () => {
  it('loads the timetable of the date in the link and lists a double as one lesson', async () => {
    renderAt('/a?mode=periodic&class=8a&date=2026-10-12&period=6');
    expect(h.todayCalls).toContain('2026-10-12');
    const opts = await screen.findAllByRole('option', { name: /P5–P6 · Mathematics .* double/ });
    expect(opts).toHaveLength(1);
    // The deep link named P6 (second half) → the double is selected.
    await waitFor(() => expect((opts[0] as HTMLOptionElement).selected).toBe(true));
    expect(screen.getByRole('option', { name: /P8 · Mathematics/ })).toBeTruthy();
  });

  it('saves the same register for both periods of a double, with the subject’s slot', async () => {
    renderAt('/a?mode=periodic&class=8a&date=2026-10-12&period=5');
    await screen.findByText('Alice');
    fireEvent.click(screen.getByRole('button', { name: /Mark all present/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(h.markSessions).toHaveBeenCalled());
    const rows = h.markSessions.mock.calls[0][0];
    expect(rows.map((r: any) => r.period)).toEqual([5, 6]);
    expect(rows.every((r: any) => r.slotId === '8a__MATH' && r.date === '2026-10-12' && r.roster.s1 === 'present')).toBe(true);
  });

  it('another date with no lessons says so', async () => {
    renderAt('/a?mode=periodic&class=8a&date=2026-10-13');
    expect(await screen.findByText(/No lessons for you on this date|No lessons for you in this class/)).toBeTruthy();
  });
});
