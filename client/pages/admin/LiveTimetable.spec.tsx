// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PERIODS } from '../../test/timetableFixtures';

const lesson = (classId: string, subject: string, p: number, status: string, teacher: string | null, extra: any = {}) => ({
  status, markedByName: status === 'taken' ? teacher : null,
  row: { entry: { id: `${classId}${p}`, classId, className: classId.toUpperCase(), subject, periodIndex: p, venue: extra.venue ?? null },
    operatorTeacherName: teacher, ownerTeacherName: extra.owner ?? teacher, isCoveredNow: !!extra.cover,
    period: PERIODS.find(x => x.order === p) },
});
const h = vi.hoisted(() => ({ board: null as any }));
vi.mock('firebase/firestore', async () => await import('../../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}) }));
vi.mock('@/components/DashboardLayout', () => ({ DashboardLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/hooks/useTimetable', () => ({
  useSchoolDayBoard: () => ({ isLoading: false, data: h.board, refetch: vi.fn() }),
  useTeacherCoverage: () => ({ isLoading: false, data: [] }),
}));

import LiveTimetable from './LiveTimetable';

beforeEach(() => {
  cleanup();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-12T08:30:00')); // Monday, during P2
  h.board = {
    date: '2026-10-12', dayOfWeek: 1, holiday: null, term: 'Term 3', year: 2026, periods: PERIODS,
    classes: [
      { classId: '8a', className: '8A', dailyTaken: true, dailyMarkedByName: 'FT', lessons: [
        lesson('8a', 'Mathematics', 1, 'taken', 'Mr Phiri'),
        lesson('8a', 'Mathematics', 2, 'in-progress', 'Mr Phiri', { venue: 'Lab 2' }),
      ] },
      { classId: '8b', className: '8B', dailyTaken: false, dailyMarkedByName: null, lessons: [
        lesson('8b', 'English', 2, 'uncovered', null, { owner: 'Ms Banda' }),
      ] },
      { classId: '9a', className: '9A', dailyTaken: false, dailyMarkedByName: null, lessons: [
        lesson('9a', 'Biology', 2, 'in-progress', 'Mr Lungu', { cover: true, owner: 'Mrs Mwale' }),
      ] },
    ],
  };
});
afterEach(() => vi.useRealTimers());

const renderPage = () => render(<MemoryRouter><LiveTimetable /></MemoryRouter>);

describe("Who's teaching", () => {
  it('follows the clock: shows the current period for every class with teacher, cover, room and status', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'P2 • now' })).toBeTruthy();
    expect(screen.getByText('Lab 2')).toBeTruthy();
    expect(screen.getByText(/cover for Mrs Mwale/)).toBeTruthy();
    expect(screen.getAllByText('Uncovered').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not yet marked').length).toBe(2);
    expect(screen.getByText('1/3', { selector: 'div' })).toBeTruthy(); // daily registers
    expect(screen.getByText('1/4', { selector: 'div' })).toBeTruthy(); // lesson registers
  });

  it('picking another period shows free classes', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'P1' }));
    expect(screen.getAllByText('Free / not on the timetable')).toHaveLength(2);
    expect(screen.getByText(/Register taken · Mr Phiri/)).toBeTruthy();
  });

  it('teacher lookup says where they are now', () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText(/Where is/), { target: { value: 'phiri' } });
    expect(screen.getByText(/now in 8A \(Mathematics\)/)).toBeTruthy();
  });

  it('whole-day view and weekends', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Whole day' }));
    expect(screen.getAllByText('✗')).toHaveLength(2);
    cleanup();
    h.board = { ...h.board, dayOfWeek: null, classes: [] };
    renderPage();
    expect(screen.getByText('No lessons on weekends.')).toBeTruthy();
  });
});
