// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('firebase/firestore', async () => await import('../../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: 'ADMIN' } }) }));
vi.mock('@/components/DashboardLayout', () => ({ DashboardLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'ADMIN', fullName: 'Head Teacher', userType: 'admin' } }) }));

import { resetStore, getDocData } from '../../test/fakeFirestore';
import YearTransition from './YearTransition';

const learner = (classId: string, studentId: string, fullName: string) => ({
  classId, studentId, fullName, status: 'active', studentIndex: Number(studentId.split('_')[1]), dateOfFirstEntry: '2025-01-10',
});

beforeEach(() => {
  cleanup();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2027-01-08T09:00:00'));
  resetStore({
    classes: {
      F1A: { name: 'Form 1A', type: 'form', level: 1, section: 'A', year: 2026, isActive: true },
      F2A: { name: 'Form 2A', type: 'form', level: 2, section: 'A', year: 2026, isActive: true },
      G12A: { name: 'Grade 12A', type: 'grade', level: 12, section: 'A', year: 2026, isActive: true },
    },
    learners: {
      a: learner('F1A', 'F1A_001', 'Alice Banda'),
      b: learner('F1A', 'F1A_002', 'Ben Chola'),
      d: learner('F2A', 'F2A_001', 'Dora Mwila'),
      i: learner('G12A', 'G12A_001', 'Isaac Zulu'),
    },
  });
});
afterEach(() => vi.useRealTimers());

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><YearTransition /></MemoryRouter>
    </QueryClientProvider>
  );

describe('Year transition page', () => {
  it('walks through the wizard, lets a learner repeat, and runs the transition', async () => {
    renderPage();
    await screen.findByText('Which year is closing?');
    expect((screen.getByLabelText('Closing year') as HTMLInputElement).value).toBe('2026');

    // Classes: Form 2A goes to a Form 3A that will be created; Grade 12 graduates.
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    await screen.findByText('Where does each class go?');
    expect(screen.getByText('will be created')).toBeTruthy();

    // Learners: Ben repeats Form 1.
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Form 1A/ }));
    const benRow = screen.getByText('Ben Chola').closest('tr')!;
    fireEvent.change(within(benRow).getAllByRole('combobox')[0], { target: { value: 'repeat' } });

    // Review.
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    await screen.findByText('Classes in 2027');
    const run = screen.getByRole('button', { name: /Move 4 learners to 2027/ }) as HTMLButtonElement;
    expect(run.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Type 2027 to confirm'), { target: { value: '2027' } });
    expect(run.disabled).toBe(false);
    fireEvent.click(run);

    await screen.findByText(/2027 is ready/);
    expect(getDocData('learners', 'a')).toMatchObject({ classId: 'F2A', studentId: 'F2A_001' });
    expect(getDocData('learners', 'b')).toMatchObject({ classId: 'F1A', studentId: 'F1A_002', academicYear: 2027 });
    expect(getDocData('learners', 'i')).toMatchObject({ status: 'graduated', studentId: 'G12A_001-2026' });
    expect(getDocData('system', 'academicYear')!.currentYear).toBe(2027);
  });

  it('shows history with undo, and graduates under former learners', async () => {
    renderPage();
    await screen.findByText('Which year is closing?');
    fireEvent.click(screen.getByRole('button', { name: /Review & run/ }));
    fireEvent.change(await screen.findByLabelText('Type 2027 to confirm'), { target: { value: '2027' } });
    fireEvent.click(screen.getByRole('button', { name: /Move 4 learners to 2027/ }));
    await screen.findByText(/2027 is ready/);

    fireEvent.click(screen.getByRole('button', { name: /History/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Undo this transition/ }));
    const confirm = await screen.findByRole('button', { name: /^Undo$/ });
    await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(confirm);
    await screen.findByText(/Undone: 4 learner\(s\) restored to 2026/);
    expect(getDocData('learners', 'i')).toMatchObject({ status: 'active', studentId: 'G12A_001' });

    fireEvent.click(screen.getByRole('button', { name: /Graduates & leavers/ }));
    await screen.findByText(/No former learners/);
  });
});
