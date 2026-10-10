// @vitest-environment jsdom
// Render tests for the Results Entry page (jsdom). Hooks are mocked with
// stable values, the way react-query returns them.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const saveResults = vi.fn(async (d: any) => ({ success: true, count: d.results.length, results: [], overwritten: true, skipped: [] }));
const existing = vi.hoisted(() => ({
  rows: [] as Array<{ studentId: string; marks: number }>,
}));
const checkExisting = vi.fn(async (q: any) => {
  if (q.subjectId === 'Mathematics' && q.examType === 'week4' && q.term === 'Term 3' && q.year === 2026) {
    return { exists: existing.rows.length > 0, count: existing.rows.length, results: existing.rows };
  }
  return { exists: false, count: 0, results: [] };
});

vi.mock('firebase/firestore', async () => await import('../../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: 'T1' } }) }));
vi.mock('@/components/DashboardLayout', () => ({ DashboardLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: stable.user }) }));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: () => false }));
const stable = vi.hoisted(() => ({
  classes: [{ id: 'C1', name: 'Form 1A', students: 3 }],
  configs: [{ term: 'Term 3', year: 2026, isActive: true, examTypes: { week4: true, week8: true, endOfTerm: true },
    week4TotalMarks: 50, week8TotalMarks: 0, endOfTermTotalMarks: 100 }],
  teacherClasses: [{
    classId: 'C1', className: 'Form 1A', isFormTeacher: true,
    subjects: [
      { subject: 'Form Teacher', normalizedSubjectId: 'form-teacher', canOperate: true, relation: 'owner' },
      { subject: 'Mathematics', normalizedSubjectId: 'Mathematics', canOperate: true, relation: 'owner' },
      { subject: 'English', normalizedSubjectId: 'English', canOperate: false, relation: 'owner',
        coveredByTeacherName: 'Mrs Three', coveredUntil: new Date('2026-12-01'), delegationState: 'live' },
      // Slot keyed under an older spelling ('Computer Studies' now normalizes to 'ICT')
      { subject: 'Computer Studies', normalizedSubjectId: 'Computer Studies', canOperate: true, relation: 'owner' },
      { subject: 'Physics', normalizedSubjectId: 'Physics', canOperate: false, relation: 'delegate',
        delegationState: 'pending', startDate: new Date('2026-11-01') },
    ],
  }],
  completion: [] as any[],
  refetch: async () => {},
  user: { uid: 'T1', fullName: 'Mr One', email: 'one@x' },
}));
vi.mock('@/hooks/useSchoolClasses', () => ({ useSchoolClasses: () => ({ classes: stable.classes, isLoading: false }) }));
vi.mock('@/hooks/useTeacherClasses', () => ({ useTeacherClasses: () => ({ isLoading: false, data: stable.teacherClasses }) }));
vi.mock('@/hooks/useExamConfig', () => ({ useExamConfig: () => ({ isLoading: false, configs: stable.configs }) }));
const del = vi.fn();
const nc = vi.fn();
vi.mock('@/hooks/useResults', () => ({
  useResults: () => ({
    saveResults, checkExisting, isSaving: false, isCheckingExisting: false,
    deleteResults: del, isDeleting: false, markExamNotConducted: nc, isMarkingNotConducted: false,
  }),
  useSubjectCompletion: () => ({ isLoading: false, refetch: stable.refetch, completionStatus: stable.completion }),
}));
vi.mock('@/services/resultsGridLoader', () => ({
  loadClassRoster: vi.fn(async () => [
    { id: 'docA', studentId: 'F1A_001', name: 'Alice' },
    { id: 'docB', studentId: 'F1A_002', name: 'Ben' },
    { id: 'docC', studentId: 'F1A_003', name: 'Chipo' },
  ]),
}));
vi.mock('@/components/results/BulkResultsEntryModal', () => ({ BulkResultsEntryModal: () => null }));

import ResultsEntry from '@/pages/teacher/ResultsEntry';

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[{ pathname: '/r', state: { classId: 'C1', subjectId: 'Mathematics', examType: 'week4', term: 'Term 3', year: 2026 } }]}>
      <ResultsEntry />
    </MemoryRouter>
  );

const inputFor = (name: string) => {
  const row = screen.getByText(name).closest('tr')!;
  return within(row).getByRole('textbox') as HTMLInputElement;
};

const savedCompletion = (nc = false) => [{ subjectId: 'Mathematics', subjectName: 'Mathematics', totalStudents: 3, percentComplete: 33,
  enteredStudents: { week4: nc ? 3 : 2, week8: 0, endOfTerm: 0 }, notConducted: { week4: nc, week8: false, endOfTerm: false } }];

beforeEach(() => {
  cleanup();
  saveResults.mockClear();
  checkExisting.mockClear();
  localStorage.clear();
  existing.rows = [{ studentId: 'docA', marks: 40 }, { studentId: 'docB', marks: -1 }];
  stable.completion.splice(0, stable.completion.length, ...savedCompletion());
});

const pickSubject = (name: string) => {
  const select = screen.getAllByRole('combobox').find(sel => within(sel).queryByText(new RegExp(name)))!;
  fireEvent.change(select, { target: { value: name } });
};

describe('Results Entry page', () => {
  it('opens from a dashboard link on the right class/subject/term and loads saved marks into the boxes', async () => {
    renderPage();
    await waitFor(() => expect(inputFor('Alice').value).toBe('40'));
    expect(inputFor('Ben').value).toBe('X');
    expect(inputFor('Chipo').value).toBe('');
    // Week 8 has 0 total marks → not active; only W4 and EOT are offered
    expect(screen.queryByText('W8')).toBeNull();
    // Form Teacher is not offered as a subject
    expect(screen.queryByRole('option', { name: /form-teacher/i })).toBeNull();
    // Nothing changed yet → Save disabled, no "unsaved" banner
    expect(screen.queryByText(/You have unsaved marks/)).toBeNull();
  });

  it('saves only the changed mark, by document id, for the term shown', async () => {
    renderPage();
    await waitFor(() => expect(inputFor('Alice').value).toBe('40'));
    fireEvent.change(inputFor('Chipo'), { target: { value: '45' } });
    const save = await screen.findByRole('button', { name: /Save changes \(1\)/ });
    fireEvent.click(save);
    await waitFor(() => expect(saveResults).toHaveBeenCalledTimes(1));
    const arg = saveResults.mock.calls[0][0];
    expect(arg.results).toEqual([{ studentId: 'docC', studentName: 'Chipo', marks: 45 }]);
    expect(arg.term).toBe('Term 3');
    expect(arg.year).toBe(2026);
    expect(arg.examType).toBe('week4');
    expect(arg.totalMarks).toBe(50);
  });

  it('changing a saved mark asks before replacing it', async () => {
    renderPage();
    await waitFor(() => expect(inputFor('Alice').value).toBe('40'));
    fireEvent.change(inputFor('Alice'), { target: { value: '30' } });
    fireEvent.click(await screen.findByRole('button', { name: /Save changes \(1\)/ }));
    expect(await screen.findByText(/Replace saved marks\?/)).toBeTruthy();
    expect(saveResults).not.toHaveBeenCalled();
  });

  it('the owner of a covered subject can still edit (and is told about the cover)', async () => {
    renderPage();
    await waitFor(() => expect(inputFor('Alice').value).toBe('40'));
    pickSubject('English');
    expect(await screen.findByText(/Mrs Three is covering this subject.*You can both enter and edit marks/)).toBeTruthy();
    await waitFor(() => expect(inputFor('Alice').disabled).toBe(false));
  });

  it('a cover that has not started yet is view-only', async () => {
    renderPage();
    await waitFor(() => expect(inputFor('Alice').value).toBe('40'));
    pickSubject('Physics');
    expect(await screen.findByText(/Your cover for this subject starts on/)).toBeTruthy();
    await waitFor(() => expect(inputFor('Alice').disabled).toBe(true));
  });

  it('drafts can be loaded even when marks are already saved', async () => {
    localStorage.setItem('results_drafts', JSON.stringify([{
      id: 'draft_1', classId: 'C1', className: 'Form 1A', subject: 'Mathematics', examType: 'week4',
      term: 'Term 3', year: 2026, totalMarks: 50, lastModified: new Date().toISOString(), completedCount: 1, totalStudents: 3,
      results: [{ id: 'docC', studentId: 'F1A_003', name: 'Chipo', marks: '33' }],
    }]));
    renderPage();
    await waitFor(() => expect(inputFor('Alice').value).toBe('40'));
    // Saved marks win on open; the draft is offered, not forced
    expect(inputFor('Chipo').value).toBe('');
    fireEvent.click(screen.getByTitle('Load draft'));
    await waitFor(() => expect(inputFor('Chipo').value).toBe('33'));
    expect(inputFor('Alice').value).toBe('40');
    fireEvent.click(await screen.findByRole('button', { name: /Save changes \(1\)/ }));
    await waitFor(() => expect(saveResults).toHaveBeenCalledTimes(1));
    expect(saveResults.mock.calls[0][0].results).toEqual([{ studentId: 'docC', studentName: 'Chipo', marks: 33 }]);
  });

  it('a draft for another exam switches to that exam and loads', async () => {
    localStorage.setItem('results_drafts', JSON.stringify([{
      id: 'draft_2', classId: 'C1', className: 'Form 1A', subject: 'Mathematics', examType: 'endOfTerm',
      term: 'Term 3', year: 2026, totalMarks: 100, lastModified: new Date().toISOString(), completedCount: 1, totalStudents: 3,
      results: [{ id: 'docB', studentId: 'F1A_002', name: 'Ben', marks: '77' }],
    }]));
    renderPage();
    await waitFor(() => expect(inputFor('Alice').value).toBe('40'));
    fireEvent.click(screen.getByTitle('Load draft'));
    await waitFor(() => expect(inputFor('Ben').value).toBe('77'));
    expect(inputFor('Alice').value).toBe(''); // End of Term has nothing saved
    fireEvent.click(await screen.findByRole('button', { name: /Save \(1\)/ }));
    await waitFor(() => expect(saveResults).toHaveBeenCalledTimes(1));
    expect(saveResults.mock.calls[0][0].examType).toBe('endOfTerm');
    expect(saveResults.mock.calls[0][0].totalMarks).toBe(100);
  });

  it('edits to saved marks are auto-saved as a draft', async () => {
    renderPage();
    await waitFor(() => expect(inputFor('Alice').value).toBe('40'));
    fireEvent.change(inputFor('Alice'), { target: { value: '35' } });
    await waitFor(() => {
      const drafts = JSON.parse(localStorage.getItem('results_drafts') || '[]');
      expect(drafts[0]?.results.find((r: any) => r.id === 'docA')?.marks).toBe('35');
    }, { timeout: 4000 });
  });

  it('marks can be entered over an exam recorded as not conducted', async () => {
    existing.rows = [{ studentId: 'docA', marks: -2 }, { studentId: 'docB', marks: -2 }, { studentId: 'docC', marks: -2 }];
    stable.completion.splice(0, stable.completion.length, ...savedCompletion(true));
    renderPage();
    expect(await screen.findByText(/recorded as/)).toBeTruthy();
    await waitFor(() => expect(inputFor('Alice').disabled).toBe(false));
    fireEvent.change(inputFor('Alice'), { target: { value: '40' } });
    fireEvent.click(await screen.findByRole('button', { name: /Save changes \(1\)/ }));
    await waitFor(() => expect(saveResults).toHaveBeenCalledTimes(1));
    expect(saveResults.mock.calls[0][0].results).toEqual([{ studentId: 'docA', studentName: 'Alice', marks: 40 }]);
  });

  it('a subject keyed under an older spelling is editable and Save is always clickable', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/r', state: { classId: 'C1', subjectId: 'ICT', examType: 'week4', term: 'Term 3', year: 2026 } }]}>
        <ResultsEntry />
      </MemoryRouter>,
    );
    await screen.findByText('Alice');
    await waitFor(() => expect(inputFor('Alice').disabled).toBe(false));
    expect(screen.queryByText(/not one of your subjects/)).toBeNull();
    const save = screen.getAllByRole('button', { name: /Save/ }).find(b => !/draft/i.test(b.textContent || ''))!;
    expect((save as HTMLButtonElement).disabled).toBe(false);
  });
});
