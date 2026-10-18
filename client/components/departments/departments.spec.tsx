// @vitest-environment jsdom
// Departments in Teacher Management (admin) and Settings (teacher), and the
// HoD's My Department page, on the in-memory Firestore.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({ user: { uid: 'ADMIN', fullName: 'Head Teacher', userType: 'admin' } as any }));
vi.mock('firebase/firestore', async () => await import('../../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}) }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('@/components/DashboardLayout', () => ({ DashboardLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/hooks/useResultsEntryMonitor', () => ({
  useResultsEntryMonitor: () => ({
    teacherProgress: [
      { teacherId: 'T1', status: 'complete', completionPercentage: 100, totalRequired: 10, missingCount: 0, missingEntries: [] },
      {
        teacherId: 'T3', status: 'critical', completionPercentage: 40, totalRequired: 10, missingCount: 6,
        missingEntries: [{ classId: 'A', className: 'Form 2A', subjectId: 'MATH', subjectName: 'Mathematics', examType: 'week4', missingStudentCount: 6, totalStudentCount: 40 }],
      },
    ],
    isLoading: false, isFetching: false, isError: false, termLabel: 'Term 3 2026', refetch: vi.fn(),
    getExamName: () => 'Week 4 Test',
  }),
}));

import { resetStore, getDocData } from '../../test/fakeFirestore';
import { TeacherDepartmentsSection } from './TeacherDepartmentsSection';
import { MyDepartmentsCard } from './MyDepartmentsCard';
import MyDepartment from '@/pages/teacher/MyDepartment';
import { hodRoleId } from '@/services/departmentService';

const wrap = (ui: React.ReactNode) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
const chip = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

beforeEach(() => {
  cleanup();
  h.user = { uid: 'ADMIN', fullName: 'Head Teacher', userType: 'admin' };
  resetStore({
    users: {
      T1: { userType: 'teacher', fullName: 'Muhau N', departments: ['Mathematics'], subjects: ['Computer Studies'] },
      T2: { userType: 'teacher', fullName: 'Precious B', departments: ['Social Sciences'], subjects: ['Civic Education'] },
      T3: { userType: 'teacher', fullName: 'Chanda M', departments: ['Mathematics'], subjects: ['Mathematics'] },
    },
  });
});

describe('Teacher Management → Departments', () => {
  it('admin adds a teacher to departments, saves, then makes them Head of Department', async () => {
    wrap(<TeacherDepartmentsSection teacher={{ id: 'T2', name: 'Precious B', departments: ['Social Sciences'] }} isAdmin actor={{ uid: 'ADMIN', name: 'Head Teacher' }} />);
    await screen.findByRole('button', { name: /^Languages/ });
    expect(chip('Social Sciences').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chip('Languages'));
    fireEvent.click(screen.getByRole('button', { name: /Save departments/ }));
    await waitFor(() => expect(getDocData('users', 'T2')?.departments).toEqual(['Social Sciences', 'Languages']));
    expect(getDocData('users', 'T2')?.department).toBe('Social Sciences, Languages');

    // HoD choices are the saved departments
    const select = await screen.findByRole('combobox', { name: 'Department to head' });
    fireEvent.change(select, { target: { value: 'Social Sciences' } });
    fireEvent.click(screen.getByRole('button', { name: 'Make Head of Department' }));
    await waitFor(() => expect(getDocData('staff_roles', hodRoleId('T2'))).toMatchObject({ department: 'Social Sciences', status: 'active' }));
    expect(await screen.findByText(/Precious B is now Head of Social Sciences/)).toBeTruthy();
  });

  it('warns that the current HoD steps down when replaced', async () => {
    resetStore({
      users: { T1: { userType: 'teacher', fullName: 'Muhau N', departments: ['Mathematics'] }, T3: { userType: 'teacher', fullName: 'Chanda M', departments: ['Mathematics'] } },
      staff_roles: { [hodRoleId('T1')]: { teacherId: 'T1', teacherName: 'Muhau N', role: 'hod', department: 'Mathematics', status: 'active' } },
    });
    wrap(<TeacherDepartmentsSection teacher={{ id: 'T3', name: 'Chanda M', departments: ['Mathematics'] }} isAdmin actor={{ uid: 'ADMIN', name: 'Head Teacher' }} />);
    expect(await screen.findByText('Muhau N is Head of Mathematics now and will step down.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Replace as HoD' }));
    await waitFor(() => expect(getDocData('staff_roles', hodRoleId('T1'))?.status).toBe('ended'));
    expect(getDocData('staff_roles', hodRoleId('T3'))?.status).toBe('active');
  });

  it("the HoD's own department is locked until the role ends", async () => {
    resetStore({
      users: { T1: { userType: 'teacher', fullName: 'Muhau N', departments: ['Mathematics', 'Natural Sciences'] } },
      staff_roles: { [hodRoleId('T1')]: { teacherId: 'T1', teacherName: 'Muhau N', role: 'hod', department: 'Mathematics', status: 'active' } },
    });
    wrap(<TeacherDepartmentsSection teacher={{ id: 'T1', name: 'Muhau N', departments: ['Mathematics', 'Natural Sciences'] }} isAdmin actor={{ uid: 'ADMIN', name: 'Head Teacher' }} />);
    await screen.findByText(/Head of Mathematics/);
    fireEvent.click(chip('Mathematics'));
    expect(chip('Mathematics').getAttribute('aria-pressed')).toBe('true'); // still on
    expect(screen.queryByRole('button', { name: /Save departments/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'End HoD role' }));
    await waitFor(() => expect(getDocData('staff_roles', hodRoleId('T1'))?.status).toBe('ended'));
  });

  it('non-admins only see the departments', async () => {
    wrap(<TeacherDepartmentsSection teacher={{ id: 'T1', name: 'Muhau N', departments: ['Mathematics'] }} isAdmin={false} actor={{ uid: 'T2', name: 'x' }} />);
    expect(await screen.findByText('Mathematics')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Languages/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Make Head/ })).toBeNull();
  });

  it("offers the school's seven departments (no adding new ones)", async () => {
    wrap(<TeacherDepartmentsSection teacher={{ id: 'T3', name: 'Chanda M', departments: [] }} isAdmin actor={{ uid: 'ADMIN', name: 'Head Teacher' }} />);
    for (const d of ['Languages', 'Mathematics', 'Natural Sciences', 'Practical Subjects', 'Expressive Arts', 'Business Studies', 'Social Sciences']) {
      expect(await screen.findByRole('button', { name: new RegExp(d) })).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: /New department/ })).toBeNull();
  });
});

describe('Settings → My Departments (teacher)', () => {
  it('shows the departments read only — a teacher cannot add themselves', async () => {
    h.user = { uid: 'T3', fullName: 'Chanda M', userType: 'teacher' };
    wrap(<MyDepartmentsCard />);
    expect(await screen.findByText('Mathematics')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Natural Sciences/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Save departments/ })).toBeNull();
    expect(screen.getByText(/Your Head of Department adds you/)).toBeTruthy();
  });

  it('names the HoD of each department, and tells a HoD where to add teachers', async () => {
    h.user = { uid: 'T1', fullName: 'Muhau N', userType: 'teacher' };
    resetStore({
      users: { T1: { userType: 'teacher', fullName: 'Muhau N', departments: ['Mathematics'] } },
      staff_roles: { [hodRoleId('T1')]: { teacherId: 'T1', teacherName: 'Muhau N', role: 'hod', department: 'Mathematics', status: 'active' } },
    });
    wrap(<MyDepartmentsCard />);
    expect(await screen.findByText(/Add teachers to it in My Department/)).toBeTruthy();
    expect(await screen.findByText('HoD: Muhau N')).toBeTruthy();
  });
});

describe('My Department (HoD page)', () => {
  it("lists the department's teachers with their results entry progress", async () => {
    h.user = { uid: 'T1', fullName: 'Muhau N', userType: 'teacher' };
    resetStore({
      users: {
        T1: { userType: 'teacher', fullName: 'Muhau N', departments: ['Mathematics'], subjects: ['Computer Studies'] },
        T2: { userType: 'teacher', fullName: 'Precious B', departments: ['Social Sciences'] },
        T3: { userType: 'teacher', fullName: 'Chanda M', departments: ['Mathematics'], subjects: ['Mathematics'] },
      },
      staff_roles: { [hodRoleId('T1')]: { teacherId: 'T1', teacherName: 'Muhau N', role: 'hod', department: 'Mathematics', status: 'active' } },
    });
    wrap(<MyDepartment />);
    expect(await screen.findByRole('heading', { name: 'Mathematics' })).toBeTruthy();
    const list = await screen.findByRole('list');
    await waitFor(() => expect(within(list).getAllByRole('listitem').length).toBe(2));
    expect(within(list).queryByText('Precious B')).toBeNull();
    expect(within(list).getByText('Far behind')).toBeTruthy();
    fireEvent.click(within(list).getByRole('button', { name: /1 missing/ }));
    expect(screen.getByText('Form 2A · Mathematics · Week 4 Test')).toBeTruthy();
  });

  it('tells a teacher who is not a HoD', async () => {
    h.user = { uid: 'T2', fullName: 'Precious B', userType: 'teacher' };
    wrap(<MyDepartment />);
    expect(await screen.findByText('You are not a Head of Department')).toBeTruthy();
  });
});

describe('Teacher Management → Departments overview', () => {
  it('lists every department with its HoD first, its teachers and subjects, and who is in none', async () => {
    const { summarizeDepartments } = await import('./DepartmentsOverviewDialog');
    const teachers = [
      { id: 'T1', name: 'Muhau N', departments: ['Mathematics', 'Practical Subjects'] },
      { id: 'T2', name: 'Abel K', departments: ['Mathematics'] },
      { id: 'T3', name: 'Chanda M', departments: ['home economics'] },
      { id: 'T4', name: 'Zed P', departments: [] },
      { id: 'T5', name: 'Gone L', departments: ['Mathematics'], status: 'transferred' },
    ];
    const hods = [
      { teacherId: 'T1', teacherName: 'Muhau N', department: 'Mathematics', status: 'active' },
      { teacherId: 'T2', teacherName: 'Abel K', department: 'Languages', status: 'ended' },
    ];
    const { rows, unplaced } = summarizeDepartments(teachers, hods, { names: [], subjects: { Mathematics: ['Mathematics'] } });
    expect(rows.map(r => r.department)).toEqual(['Languages', 'Mathematics', 'Natural Sciences', 'Practical Subjects', 'Expressive Arts', 'Business Studies', 'Social Sciences']);
    const maths = rows[1];
    expect(maths.hod?.teacherName).toBe('Muhau N');
    expect(maths.members.map(m => m.name)).toEqual(['Muhau N', 'Abel K']); // HoD first, leavers left out
    expect(maths.subjects).toEqual(['Mathematics']);
    expect(rows[0].hod).toBeNull(); // ended role
    expect(rows[3].members.map(m => m.name)).toEqual(['Chanda M', 'Muhau N']); // older name counts
    expect(unplaced.map(t => t.name)).toEqual(['Zed P']);
  });
});
