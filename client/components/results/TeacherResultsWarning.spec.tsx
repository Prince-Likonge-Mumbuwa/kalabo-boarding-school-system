// @vitest-environment jsdom
// Teacher dashboard: results still to enter, with a live countdown to the
// nearest results deadline.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react';

const state = vi.hoisted(() => ({ progress: {} as Record<string, any> }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'T1' } }) }));
vi.mock('@/hooks/useResultsEntryMonitor', () => ({
  useResultsEntryMonitor: ({ term, enabled }: any) => ({ isLoading: false, myProgress: enabled ? state.progress[term] ?? null : null }),
}));
vi.mock('@/hooks/useAcademicTerm', () => ({
  useAcademicTerm: () => ({
    year: 2026,
    getByName: (term: string, year: number) => ({ term, year, label: `${term} ${year}` }),
  }),
}));
const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

import { TeacherResultsWarning } from './TeacherResultsWarning';
import { DeadlineCountdown, CountdownText } from './DeadlineCountdown';

const entry = (classId: string, subject: string, examType: string, missing: number, total: number, deadline: string | null) => ({
  classId, className: `Form ${classId}`, subjectId: subject, subjectName: subject, examType,
  examName: examType, missingStudentCount: missing, totalStudentCount: total, deadline,
});

// Thu 12 Nov 2026, 10:30:00
const NOW = new Date(2026, 10, 12, 10, 30, 0);

beforeEach(() => {
  cleanup();
  navigate.mockClear();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  state.progress = {
    'Term 3': {
      missingCount: 47, completedCount: 113, totalRequired: 160, completionPercentage: 71, teachingAssignments: [{}],
      missingEntries: [
        entry('1A', 'Mathematics', 'endOfTerm', 40, 40, '2026-12-04'),
        entry('1A', 'Mathematics', 'week8', 2, 40, '2026-11-14'),
        entry('2B', 'Mathematics', 'week8', 5, 38, '2026-11-14'),
      ],
    },
  };
});
afterEach(() => vi.useRealTimers());

describe('DeadlineCountdown', () => {
  it('shows days, hours, minutes and seconds and ticks every second', () => {
    render(<DeadlineCountdown deadline="2026-11-14" title="Week 8 results" />);
    const tile = (u: string) => screen.getByTestId(`countdown-${u}`).textContent;
    expect([tile('day'), tile('hr'), tile('min'), tile('sec')]).toEqual(['2', '13', '30', '00']);
    act(() => { vi.advanceTimersByTime(1000); });
    expect([tile('min'), tile('sec')]).toEqual(['29', '59']);
    act(() => { vi.advanceTimersByTime(61_000); });
    expect([tile('min'), tile('sec')]).toEqual(['28', '58']);
    expect(screen.getByText(/Week 8 results due in/i)).toBeTruthy();
    expect(screen.getByRole('timer').getAttribute('aria-label')).toBe('2 days 13 hours 28 minutes left');
  });

  it('turns to OVERDUE BY and counts up once the deadline day has ended', () => {
    render(<DeadlineCountdown deadline="2026-11-11" title="Week 4 results" />);
    expect(screen.getByText(/Week 4 results overdue by/i)).toBeTruthy();
    expect(screen.getByTestId('countdown-hr').textContent).toBe('10');
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.getByTestId('countdown-sec').textContent).toBe('05');
  });

  it('inline text version', () => {
    render(<CountdownText deadline="2026-12-04" label="End of Term results" />);
    expect(screen.getByRole('timer').textContent).toBe('End of Term results due in 22d 13h 30m 00s');
  });
});

describe('TeacherResultsWarning', () => {
  it('nearest deadline as a big live countdown, the next as a line, then one row per class and subject', () => {
    render(<TeacherResultsWarning term="Term 3" year={2026} />);
    expect(screen.getByText('Results to enter')).toBeTruthy();
    expect(screen.getByText('113 of 160 entered')).toBeTruthy();

    // Big countdown for Week 8 (nearest), with how much is left.
    const big = screen.getByRole('region', { name: /Week 8 results: deadline countdown/ });
    expect(within(big).getByText('7 marks still to enter in 2 class subjects.')).toBeTruthy();
    expect(within(big).getByTestId('countdown-day').textContent).toBe('2');
    // End of Term: one line.
    expect(screen.getAllByRole('timer').map(t => t.textContent)).toContain('End of Term results due in 22d 13h 30m 00s');

    // Sections in deadline order; each class + subject once per test.
    const sections = screen.getAllByRole('region').filter(r => /test|exam$/.test(r.getAttribute('aria-label') || ''));
    expect(sections.map(s => s.getAttribute('aria-label'))).toEqual(['Week 8 test', 'End of Term exam']);
    const w8 = within(sections[0]);
    expect(w8.getByText('results due Sat 14 Nov')).toBeTruthy();
    expect(w8.getByText('7 marks missing')).toBeTruthy();
    expect(w8.getAllByRole('listitem').map(li => li.textContent!.replace(/\s+/g, ' '))).toEqual([
      'Form 2B · Mathematics5 of 38 still to enter Enter',
      'Form 1A · Mathematics2 of 40 still to enter Enter',
    ]);
  });

  it('Enter opens Results Entry on that class, subject, test and term', () => {
    const onNav = vi.fn();
    render(<TeacherResultsWarning term="Term 3" year={2026} onNavigateToResults={onNav} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enter Week 8 marks for Form 1A Mathematics' }));
    expect(onNav).toHaveBeenCalledWith(expect.objectContaining({ classId: '1A', subjectId: 'Mathematics', examType: 'week8', term: 'Term 3', year: 2026 }));
    fireEvent.click(screen.getByRole('button', { name: /Enter now/ }));
    expect(onNav).toHaveBeenLastCalledWith(expect.objectContaining({ classId: '2B', examType: 'week8' }));
  });

  it('long lists show 4 rows and a Show more button', () => {
    state.progress['Term 3'].missingEntries = Array.from({ length: 7 }, (_, i) => entry(`${i + 1}A`, 'English', 'week4', 1, 30, null));
    render(<TeacherResultsWarning term="Term 3" year={2026} />);
    // No deadline: no countdown; the section says so.
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.getByText('no deadline set')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: 'Show 3 more' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(7);
  });

  it('earlier terms with gaps are one collapsed line each', () => {
    state.progress['Term 2'] = {
      missingCount: 3, completedCount: 77, totalRequired: 80, completionPercentage: 96, teachingAssignments: [{}],
      missingEntries: [entry('1A', 'Mathematics', 'endOfTerm', 3, 40, '2026-08-20')],
    };
    render(<TeacherResultsWarning year={2026} />);
    // Term 3 is not "current" in this test, so the latest term with gaps leads.
    expect(screen.getByText('· Term 3 2026')).toBeTruthy();
    const earlier = screen.getByRole('button', { name: /Term 2 2026/ });
    expect(earlier.getAttribute('aria-expanded')).toBe('false');
    expect(within(earlier).getByText('3 marks missing')).toBeTruthy();
    fireEvent.click(earlier);
    const panel = earlier.parentElement!;
    expect(within(panel).getByRole('listitem').textContent).toMatch(/Form 1A · Mathematics3 of 40 still to enter/);
    expect(within(panel).getByRole('button', { name: 'Enter End of Term marks for Form 1A Mathematics' })).toBeTruthy();
  });

  it('compact: one line with the live countdown, opening into the list', () => {
    render(<TeacherResultsWarning term="Term 3" year={2026} compact />);
    const bar = screen.getByRole('button', { name: /47 marks to enter/ });
    expect(within(bar).getByRole('timer').textContent).toBe('Week 8 due in 2d 13h 30m 00s');
    expect(screen.queryByText('Results to enter')).toBeNull();
    fireEvent.click(bar);
    expect(screen.getByText('Results to enter')).toBeTruthy();
  });

  it('all entered', () => {
    state.progress['Term 3'] = { missingCount: 0, completedCount: 10, totalRequired: 10, completionPercentage: 100, teachingAssignments: [{}], missingEntries: [] };
    render(<TeacherResultsWarning term="Term 3" year={2026} />);
    expect(screen.getByText('All results entered')).toBeTruthy();
  });
});
