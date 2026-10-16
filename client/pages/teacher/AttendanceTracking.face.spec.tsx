// @vitest-environment jsdom
// Scan faces → learners ticked present in the draft → the usual Save writes
// the register with the face marks. Nothing is saved by the camera itself.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PERIODS } from '../../test/timetableFixtures';

const h = vi.hoisted(() => ({
  markSessions: vi.fn(async (x: any[]) => x),
  markSession: vi.fn(async (x: any) => x),
  canUse: true,
}));
const row = (p: number) => ({
  entry: { slotId: '8a__MATH', classId: '8a', className: '8A', subject: 'Mathematics', normalizedSubject: 'MATH', dayOfWeek: 1, periodIndex: p },
  period: PERIODS.find(x => x.order === p), isCoveredNow: false, ownerTeacherId: 'T1',
});
vi.mock('firebase/firestore', async () => await import('../../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}) }));
vi.mock('@/components/DashboardLayout', () => ({ DashboardLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'T1', fullName: 'Mr One', userType: 'teacher' } }) }));
vi.mock('@/hooks/useTeacherClasses', () => ({
  useTeacherClasses: () => ({ isLoading: false, data: [{ classId: '8a', className: '8A', isFormTeacher: false, subjects: [{ subject: 'Mathematics' }] }], refetch: vi.fn() }),
}));
vi.mock('@/hooks/useTeacherAssignments', () => ({ useTeacherAssignments: () => ({ assignments: [], isLoading: false }) }));
vi.mock('@/services/assignmentEngine', async (orig) => ({ ...(await orig() as any), getOperationalViewForTeacher: async () => [] }));
vi.mock('@/services/resultsGridLoader', () => ({
  loadClassRoster: async () => [{ id: 's1', studentId: 'G8A_001', name: 'Alice' }, { id: 's2', studentId: 'G8A_002', name: 'Ben' }],
}));
vi.mock('@/services/attendanceService', () => ({
  attendanceService: {
    markSessions: h.markSessions, markSession: h.markSession,
    getSession: async () => null, getRecentSessions: async () => [], getSessionsForClassDate: async () => [],
  },
}));
vi.mock('@/hooks/useTimetable', () => ({
  useTodayTimetable: () => ({ isSuccess: true, isLoading: false, data: [row(5)], refetch: vi.fn() }),
  useCurrentPeriod: () => ({ data: null, refetch: vi.fn() }),
  useHolidayCovering: () => ({ data: null }),
  usePeriods: () => ({ isSuccess: true, data: PERIODS }),
}));
vi.mock('@/components/attendance/RiskAnalyticsTab', () => ({ RiskAnalyticsTab: () => null }));
vi.mock('@/components/attendance/PeriodicOverview', () => ({ PeriodicOverview: () => null }));
vi.mock('@/hooks/useFaceRecognition', () => ({
  useFaceAccess: () => ({ canUse: h.canUse, isAdmin: false, loading: false, settings: { enabled: true } }),
}));
// Stand-in for the camera: "recognises" Alice by her learner document id.
vi.mock('@/components/face/FaceScanDialog', () => ({
  default: ({ open, learners, onTick }: any) => open ? (
    <div>
      <span>scanner for {learners.map((l: any) => `${l.name}:${l.studentId}`).join(',')}</span>
      <button onClick={() => onTick([{ learnerId: 's1', similarity: 0.61 }])}>recognise Alice</button>
    </div>
  ) : null,
}));

import AttendanceTracking from './AttendanceTracking';

const renderAt = (url: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[url]}><AttendanceTracking /></MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => { cleanup(); h.markSessions.mockClear(); h.canUse = true; });

describe('Attendance Tracking + face recognition', () => {
  it('scan ticks the recognised learner present; Save writes the register with the face mark', async () => {
    renderAt('/a?mode=periodic&class=8a&date=2026-10-12&period=5');
    await screen.findByText('Alice');
    fireEvent.click(screen.getByRole('button', { name: /Scan faces/ }));
    // The scanner gets the register's learners with their real student numbers.
    expect(await screen.findByText('scanner for Alice:G8A_001,Ben:G8A_002')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'recognise Alice' }));
    expect(await screen.findByTitle('Ticked present by face recognition')).toBeTruthy();
    expect(h.markSessions).not.toHaveBeenCalled(); // nothing saved by the camera

    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() => expect(h.markSessions).toHaveBeenCalled());
    const [reg] = h.markSessions.mock.calls[0][0];
    expect(reg.roster).toEqual({ s1: 'present' });
    expect(reg.faceMatches).toEqual({ s1: 0.61 });
  });

  it('no Scan faces button when face recognition is not available to the teacher', async () => {
    h.canUse = false;
    renderAt('/a?mode=periodic&class=8a&date=2026-10-12&period=5');
    await screen.findByText('Alice');
    expect(screen.queryByRole('button', { name: /Scan faces/ })).toBeNull();
  });
});
