// @vitest-environment jsdom
// Exam Management: results deadlines per test (Week 4, Week 8, End of Term).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';

vi.mock('@/components/DashboardLayout', () => ({ DashboardLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'ADMIN', userType: 'admin' } }) }));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));
const hook = vi.hoisted(() => ({
  configs: [] as any[],
  createConfig: vi.fn(async (_: any) => 'new'),
  updateConfig: vi.fn(async (_: any) => {}),
}));
vi.mock('@/hooks/useExamConfig', () => ({
  useExamConfig: () => ({
    configs: hook.configs, isLoading: false, isError: false, error: null,
    createConfig: hook.createConfig, updateConfig: hook.updateConfig,
    deleteConfig: vi.fn(), copyConfigs: vi.fn(), refetch: vi.fn(),
  }),
}));

vi.mock('@/hooks/useSchoolClasses', () => ({
  useSchoolClasses: () => ({
    classes: [
      { id: '12A', name: 'Grade 12A', type: 'grade', level: 12, isActive: true },
      { id: '12B', name: 'Grade 12B', type: 'grade', level: 12, isActive: true },
      { id: '11A', name: 'Grade 11A', type: 'grade', level: 11, isActive: true },
    ],
  }),
}));

import ExamManagement from './ExamManagement';

const YEAR = new Date().getFullYear();

beforeEach(() => {
  cleanup();
  hook.configs = [];
  hook.createConfig.mockClear();
  hook.updateConfig.mockClear();
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

const dateInputs = (examLabel: string) => {
  const box = screen.getByLabelText(examLabel).closest('div.p-4')!;
  return box.querySelectorAll('input[type="date"]') as NodeListOf<HTMLInputElement>;
};

describe('Exam Management — results deadlines', () => {
  it('sets a deadline per test, refuses one before the test date, and saves them', async () => {
    render(<ExamManagement />);
    fireEvent.click(screen.getByRole('button', { name: /New Configuration/ }));

    // Week 4 test on 2 Feb; deadline 30 Jan is before the test.
    const [w4Date, w4Deadline] = dateInputs('Week 4 Test');
    fireEvent.change(w4Date, { target: { value: `${YEAR}-02-02` } });
    fireEvent.change(screen.getByLabelText('Week 4 Test results deadline'), { target: { value: `${YEAR}-01-30` } });
    expect(w4Deadline.value).toBe(`${YEAR}-01-30`);
    expect(screen.getByText('The deadline is before the Week 4 test date.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Save Configuration/ }));
    expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/fix the results deadlines/));
    expect(hook.createConfig).not.toHaveBeenCalled();

    // Fix it; set Week 8 and End of Term deadlines; switch Week 8 off again.
    fireEvent.change(screen.getByLabelText('Week 4 Test results deadline'), { target: { value: `${YEAR}-02-06` } });
    fireEvent.change(screen.getByLabelText('Week 8 Test results deadline'), { target: { value: `${YEAR}-03-06` } });
    fireEvent.change(screen.getByLabelText('End of Term Exam results deadline'), { target: { value: `${YEAR}-04-17` } });
    expect(screen.queryByText(/The deadline is before/)).toBeNull();
    fireEvent.click(screen.getByLabelText('Week 8 Test'));

    fireEvent.click(screen.getByRole('button', { name: /Save Configuration/ }));
    await waitFor(() => expect(hook.createConfig).toHaveBeenCalledTimes(1));
    expect(hook.createConfig.mock.calls[0][0]).toMatchObject({
      term: 'Term 1',
      week4Date: `${YEAR}-02-02`,
      week4Deadline: `${YEAR}-02-06`,
      week8Deadline: null, // test switched off → no deadline
      endOfTermDeadline: `${YEAR}-04-17`,
    });
  });

  it('editing loads the saved deadlines and a cleared one is saved as null', async () => {
    hook.configs = [{
      id: 'c1', term: 'Term 1', year: YEAR, isActive: true, createdAt: new Date(),
      examTypes: { week4: true, week8: true, endOfTerm: true },
      week4TotalMarks: 50, week8TotalMarks: 50, endOfTermTotalMarks: 100,
      week4Deadline: `${YEAR}-02-06`, week8Deadline: `${YEAR}-03-06`, endOfTermDeadline: null,
    }];
    render(<ExamManagement />);
    // The card lists the deadlines.
    const due = screen.getByText('Results due:').parentElement!;
    expect(within(due).getByText(/^W4 /)).toBeTruthy();
    expect(within(due).getByText(/^W8 /)).toBeTruthy();
    expect(within(due).queryByText(/^EOT /)).toBeNull();

    fireEvent.click(screen.getByTitle('Edit configuration'));
    expect((screen.getByLabelText('Week 4 Test results deadline') as HTMLInputElement).value).toBe(`${YEAR}-02-06`);
    fireEvent.change(screen.getByLabelText('Week 8 Test results deadline'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Update Configuration/ }));
    await waitFor(() => expect(hook.updateConfig).toHaveBeenCalledTimes(1));
    expect(hook.updateConfig.mock.calls[0][0]).toMatchObject({
      configId: 'c1',
      updates: { week4Deadline: `${YEAR}-02-06`, week8Deadline: null, endOfTermDeadline: null },
    });
  });

  it('marks a test as not written by chosen classes (one tap for a whole level), with a reason', async () => {
    render(<ExamManagement />);
    fireEvent.click(screen.getByRole('button', { name: /New Configuration/ }));
    const eotBox = screen.getByLabelText('End of Term Exam').closest('div.p-4') as HTMLElement;
    fireEvent.click(within(eotBox).getByRole('button', { name: /Classes that do not write this test/ }));
    fireEvent.click(within(eotBox).getByRole('button', { name: 'All Grade 12' }));
    expect(within(eotBox).getByRole('button', { name: 'Grade 12A' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(eotBox).getByRole('button', { name: 'Grade 11A' }).getAttribute('aria-pressed')).toBe('false');
    expect(within(eotBox).getByText('2 classes')).toBeTruthy();
    fireEvent.change(within(eotBox).getByPlaceholderText('e.g. ECZ final examinations'), { target: { value: 'ECZ final examinations' } });

    fireEvent.click(screen.getByRole('button', { name: /Save Configuration/ }));
    await waitFor(() => expect(hook.createConfig).toHaveBeenCalledTimes(1));
    expect(hook.createConfig.mock.calls[0][0]).toMatchObject({
      notWrittenBy: { endOfTerm: ['12A', '12B'] },
      notWrittenReason: { endOfTerm: 'ECZ final examinations' },
    });
  });

  it('the config card says which classes do not write a test', () => {
    hook.configs = [{
      id: 'c1', term: 'Term 3', year: YEAR, isActive: true, createdAt: new Date(),
      examTypes: { week4: true, week8: true, endOfTerm: true }, week4TotalMarks: 50, week8TotalMarks: 50, endOfTermTotalMarks: 100,
      notWrittenBy: { endOfTerm: ['12A', '12B'] }, notWrittenReason: { endOfTerm: 'ECZ final examinations' },
    }];
    render(<ExamManagement />);
    expect(screen.getByText('EOT not written by:').parentElement!.textContent).toBe('EOT not written by: Grade 12A, Grade 12B (ECZ final examinations)');
  });
});
