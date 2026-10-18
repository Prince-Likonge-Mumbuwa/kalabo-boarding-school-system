// @vitest-environment jsdom
// Head of Department page on the in-memory Firestore: adding teachers,
// allocating them to classes through the REAL assignment engine (the same
// calls as Teacher Management), and the roll-call monitor.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({ board: null as any }));
vi.mock('firebase/firestore', async () => await import('../../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: { uid: 'T1' } }) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'T1', fullName: 'Muhau N', userType: 'teacher' } }) }));
vi.mock('@/components/DashboardLayout', () => ({ DashboardLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/hooks/useResultsEntryMonitor', () => ({
  useResultsEntryMonitor: () => ({ teacherProgress: [], isLoading: false, isFetching: false, isError: false, termLabel: 'Term 3 2026', refetch: vi.fn(), getExamName: () => '' }),
}));
vi.mock('@/hooks/useTimetable', () => ({
  useSchoolDayBoard: () => ({ data: h.board, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() }),
}));

import { resetStore, getDocData, store } from '../../test/fakeFirestore';
import { hodRoleId } from '@/services/departmentService';
import MyDepartment from './MyDepartment';

const page = (tab: string) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[`/dashboard/teacher/department?tab=${tab}`]}><MyDepartment /></MemoryRouter>
    </QueryClientProvider>,
  );

const lesson = (teacherId: string, name: string, cls: string, p: number, status: string) => ({
  status, markedByName: null,
  row: { entry: { slotId: `${cls}__Mathematics`, classId: cls, className: cls, subject: 'Mathematics', periodIndex: p }, period: { name: `P${p}` },
    operatorTeacherId: teacherId, operatorTeacherName: name, ownerTeacherId: teacherId },
});

beforeEach(() => {
  cleanup();
  h.board = null;
  resetStore({
    system: {
      assignmentEngine: { migratedAt: '2026-01-01' },
      departments: { names: ['Mathematics', 'Natural Sciences'], subjects: { Mathematics: ['Mathematics', 'Computer Science'] } },
    },
    users: {
      T1: { userType: 'teacher', fullName: 'Muhau N', departments: ['Mathematics'], status: 'active' },
      T2: { userType: 'teacher', fullName: 'Chanda M', departments: ['Mathematics'], status: 'active', formClassId: 'F2A', formClassName: 'Form 2A' },
      T3: { userType: 'teacher', fullName: 'Precious B', departments: ['Social Sciences'], status: 'active' },
    },
    staff_roles: { [hodRoleId('T1')]: { teacherId: 'T1', teacherName: 'Muhau N', role: 'hod', department: 'Mathematics', status: 'active' } },
    classes: { F2A: { name: 'Form 2A', isActive: true, year: 2026 }, F2B: { name: 'Form 2B', isActive: true, year: 2026 } },
    class_slots: {
      F2A__Mathematics: { classId: 'F2A', className: 'Form 2A', subject: 'Mathematics', normalizedSubject: 'Mathematics', isFormTeacherSlot: false, ownerTeacherId: 'T2', ownerTeacherName: 'Chanda M', ownerAssignmentId: 'A1' },
    },
    teacher_assignments: {
      A1: { teacherId: 'T2', teacherName: 'Chanda M', classId: 'F2A', className: 'Form 2A', subject: 'Mathematics', normalizedSubject: 'Mathematics', isFormTeacher: false, roleType: 'substantive', status: 'active' },
    },
  });
});

describe('My Department → Teachers', () => {
  it('the HoD adds a teacher to the department and removes one', async () => {
    page('teachers');
    const select = await screen.findByRole('combobox', { name: 'Teacher to add' });
    await waitFor(() => expect(within(select).getByText(/Precious B/)).toBeTruthy());
    fireEvent.change(select, { target: { value: 'T3' } });
    fireEvent.click(screen.getByRole('button', { name: /^Add$/ }));
    await waitFor(() => expect(getDocData('users', 'T3')?.departments).toEqual(['Social Sciences', 'Mathematics']));
    expect(getDocData('users', 'T3')?.department).toBe('Social Sciences, Mathematics');

    // remove Chanda (not the HoD) — warns that she keeps her class until reallocated
    const chanda = (await screen.findByText('Chanda M')).closest('li')!;
    fireEvent.click(within(chanda).getByRole('button', { name: /Remove/ }));
    expect(within(chanda).getByText(/Keeps their 1 class until you reallocate/)).toBeTruthy();
    fireEvent.click(within(chanda).getByRole('button', { name: /^Remove$/ }));
    await waitFor(() => expect(getDocData('users', 'T2')?.departments).toEqual([]));
    // the HoD cannot remove themselves
    const me = screen.getByText('Muhau N').closest('li')!;
    expect(within(me).queryByRole('button', { name: /Remove/ })).toBeNull();
  });
});

describe('My Department → Allocations (same engine as Teacher Management)', () => {
  it('shows who teaches each class, and the HoD reallocates and vacates through the engine', async () => {
    page('allocations');
    const f2a = await screen.findByRole('combobox', { name: 'Mathematics teacher for Form 2A' }) as HTMLSelectElement;
    await waitFor(() => expect(f2a.value).toBe('T2'));
    const f2b = screen.getByRole('combobox', { name: 'Mathematics teacher for Form 2B' }) as HTMLSelectElement;
    expect(f2b.value).toBe('');
    expect(screen.getByText(/1 of 2 classes allocated · 1 vacant/)).toBeTruthy();
    // members only (Precious is in another department)
    expect(within(f2b).queryByText('Precious B')).toBeNull();

    // Allocate Form 2B to the HoD himself
    fireEvent.change(f2b, { target: { value: 'T1' } });
    await waitFor(() => expect(getDocData('class_slots', 'F2B__Mathematics')?.ownerTeacherId).toBe('T1'));
    const row = [...store.get('teacher_assignments')!.values()].find(r => r.classId === 'F2B');
    expect(row).toMatchObject({ teacherId: 'T1', roleType: 'substantive', status: 'active', normalizedSubject: 'Mathematics', isFormTeacher: false, assignedBy: 'T1' });
    expect(getDocData('users', 'T1')?.assignedClasses).toBeTruthy();

    // Replace Chanda in Form 2A with the HoD: her tenure ends ('replaced'), history kept
    fireEvent.change(screen.getByRole('combobox', { name: 'Mathematics teacher for Form 2A' }), { target: { value: 'T1' } });
    await waitFor(() => expect(getDocData('class_slots', 'F2A__Mathematics')?.ownerTeacherId).toBe('T1'));
    expect(getDocData('teacher_assignments', 'A1')).toMatchObject({ status: 'ended', endReason: 'replaced' });

    // Vacate Form 2B
    fireEvent.change(screen.getByRole('combobox', { name: 'Mathematics teacher for Form 2B' }), { target: { value: '' } });
    await waitFor(() => expect(getDocData('class_slots', 'F2B__Mathematics')?.ownerTeacherId).toBeNull());
  });

  it('switches subject; only the department subjects are offered', async () => {
    page('allocations');
    await screen.findByRole('tab', { name: /Computer Science/ });
    expect(screen.queryByRole('tab', { name: /Biology/ })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /Computer Science/ }));
    expect(await screen.findByText(/Computer Science: 0 of 2 classes allocated/)).toBeTruthy();
  });

  it('the HoD chooses the department subjects when there are none; another department\'s are locked', async () => {
    resetStore({
      system: { departments: { subjects: { 'Natural Sciences': ['Biology'] } } },
      users: { T1: { userType: 'teacher', fullName: 'Muhau N', departments: ['Mathematics'] } },
      staff_roles: { [hodRoleId('T1')]: { teacherId: 'T1', teacherName: 'Muhau N', role: 'hod', department: 'Mathematics', status: 'active' } },
      class_slots: { F1A__Mathematics: { classId: 'F1A', normalizedSubject: 'Mathematics', subject: 'Mathematics' } },
    });
    page('allocations');
    expect(await screen.findByText(/Subjects taught in Mathematics/)).toBeTruthy();
    const maths = await screen.findByRole('button', { name: /^Mathematics$/ });
    expect((screen.getByRole('button', { name: /Biology/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(maths);
    fireEvent.click(screen.getByRole('button', { name: /Save subjects \(1\)/ }));
    await waitFor(() => expect(getDocData('system', 'departments')?.subjects).toEqual({ 'Natural Sciences': ['Biology'], Mathematics: ['Mathematics'] }));
    // now the allocation view for the new subject
    expect(await screen.findByRole('tab', { name: /Mathematics/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Change subjects/ })).toBeTruthy();
  });
});

describe('My Department → Roll call', () => {
  it('shows registers taken and missed per department teacher, with the daily register', async () => {
    h.board = {
      dayOfWeek: 1, holiday: null,
      classes: [
        { classId: 'F2A', className: 'Form 2A', dailyTaken: false, lessons: [
          lesson('T2', 'Chanda M', 'F2A', 1, 'taken'),
          lesson('T2', 'Chanda M', 'F2A', 2, 'missed'),
          lesson('T1', 'Muhau N', 'F2A', 5, 'upcoming'),
          lesson('T3', 'Precious B', 'F2A', 3, 'missed'), // not in the department
        ] },
      ],
    };
    page('rollcall');
    expect(await screen.findByText('1 of 2 registers taken')).toBeTruthy();
    const chanda = screen.getByText('Chanda M').closest('li')!;
    expect(within(chanda).getByText('1/2')).toBeTruthy();
    expect(within(chanda).getByText(/P2 · F2A · Mathematics — no register/)).toBeTruthy();
    expect(within(chanda).getByText(/Daily register Form 2A: not yet/)).toBeTruthy();
    expect(screen.getByText(/0 lessons so far · 1 later/)).toBeTruthy();
    expect(screen.queryByText('Precious B')).toBeNull();
  });

  it('weekends and holidays have no lessons', async () => {
    h.board = { dayOfWeek: null, holiday: null, classes: [] };
    page('rollcall');
    expect(await screen.findByText('No lessons on weekends.')).toBeTruthy();
  });
});
