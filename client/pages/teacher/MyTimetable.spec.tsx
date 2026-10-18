// @vitest-environment jsdom
// My Timetable: the published school timetable, read-only, with PDFs.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PERIODS } from '../../test/timetableFixtures';

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
  classRows: {} as Record<string, any[]>,
  periods: [] as any[],
  pdf: vi.fn(async (_: any) => new Uint8Array([1])),
  download: vi.fn(),
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
  useClassTimetable: (id: string) => ({ isLoading: false, data: stable.classRows[id] ?? [] }),
  invalidateTimetableCaches: vi.fn(),
}));
vi.mock('@/services/pdf/timetablePDF', async orig => ({
  ...(await orig() as any),
  generateTimetablePDF: stable.pdf,
  downloadPdf: stable.download,
}));
vi.mock('@/utils/academicTerm', async (orig) => ({
  ...(await orig() as any),
  getCurrentAcademicTerm: () => ({ term: 'Term 3', year: 2026 }),
}));

import MyTimetable from './MyTimetable';

const row = (slotId: string, d: number, p: number, extra: any = {}) => {
  const [classId, s] = slotId.split('__');
  return {
    entry: { slotId, classId, className: classId.toUpperCase(), subject: s === 'ENG' ? 'English' : 'Mathematics', dayOfWeek: d, periodIndex: p, venue: null, effectiveFrom: '2020-01-06', ...extra },
    ownerTeacherId: 'T1', ownerTeacherName: 'Mr One', operatorTeacherId: 'T1', operatorTeacherName: 'Mr One', isCoveredNow: false,
  };
};
const renderPage = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><MyTimetable /></MemoryRouter></QueryClientProvider>);

beforeEach(() => {
  cleanup();
  stable.pdf.mockClear();
  stable.download.mockClear();
  stable.periods = PERIODS;
  stable.live = [row('8a__MATH', 1, 2), row('8a__MATH', 1, 3), row('8b__MATH', 3, 5)];
  stable.classRows = { '8a': [row('8a__MATH', 1, 2), row('8a__MATH', 1, 3), { ...row('8a__ENG', 2, 1), ownerTeacherName: 'Ms Two', operatorTeacherName: 'Ms Two' }] };
});

describe('My Timetable (published, read-only)', () => {
  it('shows my week with days as rows: a double is one box; nothing to tick or submit', () => {
    renderPage();
    const week = screen.getByRole('table', { name: 'My week' });
    const heads = within(week).getAllByRole('columnheader').map(h => h.textContent);
    expect(heads[0]).toBe('Day');
    expect(heads.slice(1, 5)).toEqual(['P107:20–08:00', 'P208:00–08:40', 'P308:40–09:20', 'P409:20–10:00']);
    expect(within(week).getByRole('columnheader', { name: 'Break' })).toBeTruthy();
    expect(heads[heads.length - 1]).toBe('P812:20–13:00');
    expect(within(week).getAllByRole('rowheader').map(r => r.textContent)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    expect(within(week).getByText('8A · Mathematics')).toBeTruthy();
    expect(within(week).getByText('Double')).toBeTruthy();
    expect(screen.getByText(/My week · 3 periods/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Submit/ })).toBeNull();
  });

  it('class timetable: my form class first, with each subject’s teacher', () => {
    renderPage();
    expect((screen.getByRole('combobox', { name: 'Class' }) as HTMLSelectElement).value).toBe('8a');
    const grid = screen.getByRole('table', { name: 'Timetable of 8A' });
    expect(within(grid).getByText('English')).toBeTruthy();
    expect(within(grid).getByText('Ms Two')).toBeTruthy();
  });

  it('downloads a branded PDF of my timetable (days × periods, doubles merged)', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Download my timetable/ }));
    await waitFor(() => expect(stable.download).toHaveBeenCalled());
    const input = stable.pdf.mock.calls[0][0];
    expect(input).toMatchObject({ title: 'Teacher timetable', term: 'Term 3', year: 2026 });
    expect(input.pages[0].heading).toBe('Mr One');
    expect(input.pages[0].cells).toEqual(expect.arrayContaining([
      { day: 1, start: 2, size: 2, lines: ['8A', 'Mathematics', ''] },
      { day: 3, start: 5, size: 1, lines: ['8B', 'Mathematics', ''] },
    ]));
    expect(stable.download.mock.calls[0][1]).toBe('Mr-One-Term-3-2026.pdf');
  });

  it('nothing published yet → says so', () => {
    stable.live = [];
    renderPage();
    expect(screen.getByText(/No timetable has been published for Term 3 2026 yet/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Download my timetable/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('announces a newly published timetable', () => {
    const today = new Date();
    const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    stable.live = [row('8a__MATH', 1, 2, { effectiveFrom: ymd })];
    renderPage();
    expect(screen.getByText(/A new school timetable is in force from/)).toBeTruthy();
  });
});
