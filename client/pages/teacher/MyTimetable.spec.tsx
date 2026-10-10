// @vitest-environment jsdom
// Render tests for the tick-box My Timetable page. Hooks return stable data.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PERIODS } from '../../test/timetableFixtures';

const submitFn = vi.fn(async (req: any) => ({ submissionId: 's1', submittedCount: req.entries.length, replacedPendingCount: 0, conflicts: [] }));
const stable = vi.hoisted(() => ({
  user: { uid: 'T1', fullName: 'Mr One' },
  teacherClasses: [
    { classId: '8a', className: '8A', subjects: [
      { subject: 'Form Teacher', normalizedSubjectId: 'form-teacher', slotId: '8a__form-teacher', relation: 'owner', canOperate: true },
      { subject: 'Mathematics', normalizedSubjectId: 'MATH', slotId: '8a__MATH', relation: 'owner', canOperate: true },
    ] },
    { classId: '8b', className: '8B', subjects: [
      { subject: 'Mathematics', normalizedSubjectId: 'MATH', slotId: '8b__MATH', relation: 'owner', canOperate: true },
    ] },
  ],
  live: [] as any[],
  subs: [] as any[],
  ctx: null as any,
  periods: [] as any[],
}));
vi.mock('firebase/firestore', async () => await import('../../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}) }));
vi.mock('@/components/DashboardLayout', () => ({ DashboardLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/components/timetable/NowNextCard', () => ({ NowNextCard: () => null }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: stable.user }) }));
vi.mock('@/hooks/useTeacherClasses', () => ({ useTeacherClasses: () => ({ isLoading: false, data: stable.teacherClasses, refetch: vi.fn() }) }));
vi.mock('@/hooks/useTimetable', () => ({
  usePeriods: () => ({ isLoading: false, data: stable.periods }),
  useMyTimetable: () => ({ isLoading: false, data: stable.live }),
  useMySubmissions: () => ({ isLoading: false, data: stable.subs }),
  useClashContext: () => ({ isLoading: false, data: stable.ctx }),
  useSubmitTimetable: () => ({ mutateAsync: submitFn, isPending: false }),
  invalidateTimetableCaches: vi.fn(),
}));
vi.mock('@/utils/academicTerm', async (orig) => ({
  ...(await orig() as any),
  getCurrentAcademicTerm: () => ({ term: 'Term 3', year: 2026 }),
}));

import MyTimetable from './MyTimetable';

const liveRow = (slotId: string, d: number, p: number) => {
  const [classId, s] = slotId.split('__');
  return { entry: { slotId, classId, className: classId.toUpperCase(), subject: s === 'ENG' ? 'English' : 'Mathematics',
    dayOfWeek: d, periodIndex: p, venue: null }, ownerTeacherId: 'T1' };
};
const renderPage = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><MyTimetable /></MemoryRouter></QueryClientProvider>);
const cell = (day: string, p: string) => screen.getByRole('button', { name: new RegExp(`^${day} ${p}( |$)`) });

beforeEach(() => {
  cleanup();
  submitFn.mockClear();
  stable.periods = PERIODS;
  stable.live = [liveRow('8a__MATH', 1, 1)];
  stable.subs = [];
  stable.ctx = {
    live: [
      { slotId: '8a__MATH', classId: '8a', className: '8A', subject: 'Mathematics', dayOfWeek: 1, periodIndex: 1 },
      { slotId: '8a__ENG', classId: '8a', className: '8A', subject: 'English', dayOfWeek: 2, periodIndex: 1 },
    ],
    teachersBySlot: new Map([
      ['8a__MATH', [{ id: 'T1', name: 'Mr One' }]], ['8b__MATH', [{ id: 'T1', name: 'Mr One' }]],
      ['8a__ENG', [{ id: 'T2', name: 'Ms Two' }]],
    ]),
    replaceSlotIds: new Set(['8a__MATH', '8b__MATH']),
    periods: PERIODS,
    slots: new Map(),
  };
});

describe('My Timetable (tick boxes)', () => {
  it('lists my subjects (never Form Teacher) with live state and the ticked live periods', () => {
    renderPage();
    expect(screen.getByText('8A · Mathematics', { selector: 'span' })).toBeTruthy();
    expect(screen.getByText('8B · Mathematics', { selector: 'span' })).toBeTruthy();
    expect(screen.queryByText(/Form Teacher/)).toBeNull();
    expect(cell('Mon', 'P1').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/Live/)).toBeTruthy();
  });

  it('locks a period another subject of the class has; ticking builds a triple', () => {
    renderPage();
    expect((cell('Tue', 'P1') as HTMLButtonElement).disabled).toBe(true);
    expect(cell('Tue', 'P1').getAttribute('aria-label')).toContain('English is on');
    fireEvent.click(cell('Wed', 'P5'));
    fireEvent.click(cell('Wed', 'P6'));
    fireEvent.click(cell('Wed', 'P7'));
    expect(screen.getByText(/Wed P5–P7 \(triple\)/)).toBeTruthy();
    expect(screen.getByText(/Changed — not sent/)).toBeTruthy();
  });

  it('a period ticked for one of my classes is locked for my other class', () => {
    renderPage();
    fireEvent.click(cell('Thu', 'P3'));
    fireEvent.click(screen.getByText('8B · Mathematics', { selector: 'span' }));
    expect((cell('Thu', 'P3') as HTMLButtonElement).disabled).toBe(true);
    expect(cell('Thu', 'P3').getAttribute('aria-label')).toContain('8A Mathematics');
  });

  it('submits only the changed subjects, every ticked period, and the room', async () => {
    renderPage();
    fireEvent.click(cell('Mon', 'P2'));
    fireEvent.change(screen.getByPlaceholderText(/optional/), { target: { value: 'Lab 2' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit changes/ }));
    await waitFor(() => expect(submitFn).toHaveBeenCalled());
    const req = submitFn.mock.calls[0][0];
    expect(req.scopeSlotIds).toEqual(['8a__MATH']);
    expect(req.entries.map((e: any) => `${e.dayOfWeek}:${e.periodIndex}:${e.venue}`).sort()).toEqual(['1:1:Lab 2', '1:2:Lab 2']);
    expect(await screen.findByText(/Sent for approval/)).toBeTruthy();
  });

  it('unticking everything submits the subject as cleared', async () => {
    renderPage();
    fireEvent.click(cell('Mon', 'P1'));
    fireEvent.click(screen.getByRole('button', { name: /Submit changes/ }));
    await waitFor(() => expect(submitFn).toHaveBeenCalled());
    expect(submitFn.mock.calls[0][0]).toMatchObject({ scopeSlotIds: ['8a__MATH'], entries: [] });
  });

  it('shows a pending submission as the starting point and a rejection note', () => {
    stable.subs = [
      { id: 'p', status: 'pending', scopeSlotIds: ['8b__MATH'], entries: [{ slotId: '8b__MATH', dayOfWeek: 5, periodIndex: 7 }] },
      { id: 'r', status: 'rejected', rejectedReason: 'Wrong day', scopeSlotIds: ['8a__MATH'], entries: [] },
    ];
    renderPage();
    expect(screen.getByText(/Rejected — fix and resend/)).toBeTruthy();
    expect(screen.getByText(/Admin's note: Wrong day/)).toBeTruthy();
    fireEvent.click(screen.getByText('8B · Mathematics', { selector: 'span' }));
    expect(cell('Fri', 'P7').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/Waiting for approval/)).toBeTruthy();
  });

  it('no bell schedule → explains instead of an empty grid', () => {
    stable.periods = [];
    renderPage();
    expect(screen.getByText(/bell schedule for 2026 has not been set up/)).toBeTruthy();
  });
});
