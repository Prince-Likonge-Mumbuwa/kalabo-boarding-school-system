// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('firebase/firestore', async () => await import('../test/fakeFirestore'));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {} }));
vi.mock('firebase/auth', () => ({ getAuth: () => ({}) }));
const h = vi.hoisted(() => ({ classes: [] as any[], userType: 'teacher', officer: false }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'T1', fullName: 'Mr T', userType: h.userType }, logout: vi.fn() }) }));
vi.mock('@/hooks/useAdmissionsOfficer', () => ({ useAdmissionsOfficer: () => ({ isOfficer: h.officer, isLoading: false }) }));
vi.mock('@/hooks/useTeacherClasses', async () => {
  const actual = await vi.importActual<any>('@/hooks/useTeacherClasses');
  return { ...actual, useTeacherClasses: () => ({ data: h.classes }) };
});

import { DashboardLayout } from './DashboardLayout';

const subject = (normalizedSubjectId: string, relation = 'owner') => ({ normalizedSubjectId, relation });
const renderIt = () => render(<MemoryRouter><DashboardLayout><div /></DashboardLayout></MemoryRouter>);

beforeEach(() => { cleanup(); h.classes = []; h.userType = 'teacher'; h.officer = false; });

describe('teacher menu', () => {
  it('hides My Class from a teacher who only teaches subjects', () => {
    h.classes = [{ classId: 'A', subjects: [subject('MATH')] }];
    renderIt();
    expect(screen.queryByText('My Class')).toBeNull();
    expect(screen.getByText('Results Entry')).toBeTruthy();
  });

  it('shows My Class to the form teacher', () => {
    h.classes = [{ classId: 'A', subjects: [subject('MATH'), subject('form-teacher')] }];
    renderIt();
    expect(screen.getByText('My Class')).toBeTruthy();
  });

  it('shows My Class to a teacher covering the form teacher', () => {
    h.classes = [{ classId: 'A', subjects: [subject('form-teacher', 'delegate')] }];
    renderIt();
    expect(screen.getByText('My Class')).toBeTruthy();
  });

  it('shows Admissions only to admissions officers', () => {
    renderIt();
    expect(screen.queryByText('Admissions')).toBeNull();
    cleanup();
    h.officer = true;
    renderIt();
    expect(screen.getByText('Admissions')).toBeTruthy();
  });
});

describe('admin menu (grouped workspaces)', () => {
  const GROUPED = ['Admissions & Classes', 'Attendance', 'Results & SBA'];
  const OLD = ['Class Management', 'Admissions', 'Attendance Overview', "Who's Teaching", 'Results Monitor', 'Results Analysis', 'SBA Overview'];
  const KEPT = ['Dashboard', 'Teachers', 'Exam Management', 'Report Cards', 'Year Transition', 'Settings'];

  it('shows the three workspaces instead of the seven separate pages', () => {
    h.userType = 'admin';
    renderIt();
    for (const label of [...GROUPED, ...KEPT]) expect(screen.getByRole('button', { name: label })).toBeTruthy();
    for (const label of OLD) expect(screen.queryByRole('button', { name: label })).toBeNull();
    // Teacher-only items are not shown to the admin.
    expect(screen.queryByRole('button', { name: 'My Class' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Results Entry' })).toBeNull();
  });

  it('marks the open workspace as the current page', () => {
    h.userType = 'admin';
    render(<MemoryRouter><DashboardLayout activeTab="results-sba"><div /></DashboardLayout></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Results & SBA' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Teachers' }).getAttribute('aria-current')).toBeNull();
  });

  it('teachers never see the admin workspaces', () => {
    h.officer = true;
    h.classes = [{ classId: 'A', subjects: [subject('form-teacher')] }];
    renderIt();
    for (const label of GROUPED) expect(screen.queryByRole('button', { name: label })).toBeNull();
    for (const label of ['Dashboard', 'My Class', 'My Timetable', 'Attendance Tracking', 'Results Entry', 'Results Analysis', 'SBA Entry', 'Admissions']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('inside a workspace tab it draws no second frame', async () => {
    const { EmbeddedContext } = await import('@/components/workspace/embedded');
    h.userType = 'admin';
    render(
      <MemoryRouter>
        <EmbeddedContext.Provider value={true}>
          <DashboardLayout activeTab="classes"><p>page body</p></DashboardLayout>
        </EmbeddedContext.Provider>
      </MemoryRouter>
    );
    expect(screen.getByText('page body')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Logout' })).toBeNull();
  });
});
