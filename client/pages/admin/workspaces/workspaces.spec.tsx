// @vitest-environment jsdom
// The three admin workspaces as the app routes them: every old address opens
// the right tab with the right existing page, and only admins get in.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

const h = vi.hoisted(() => ({ user: { uid: 'A1', fullName: 'Head', userType: 'admin' } as any }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: h.user, loading: false, isAuthenticated: !!h.user }) }));
vi.mock('@/components/DashboardLayout', () => ({
  DashboardLayout: ({ children, activeTab }: any) => <div data-nav={activeTab}>{children}</div>,
}));

// The existing pages, stubbed: each says which page it is and whether it is embedded.
const mkStub = vi.hoisted(() => async (label: string) => {
  const React = await import('react');
  const { useEmbedded } = await import('@/components/workspace/embedded');
  return function Stub() {
    const embedded = useEmbedded();
    return React.createElement('p', null, `${label} page${embedded ? ' (embedded)' : ''}`);
  };
});
vi.mock('@/pages/admin/ClassManagement', async () => ({ default: await mkStub('Class Management') }));
vi.mock('@/pages/admin/ResultsEntryMonitor', async () => ({ default: await mkStub('Results Monitor') }));
vi.mock('@/pages/admin/AdminResultsAnalysis', async () => ({ default: await mkStub('Results Analysis') }));
vi.mock('@/pages/admin/SbaSchoolOverview', async () => ({ default: await mkStub('SBA Overview') }));
vi.mock('@/pages/admin/LiveTimetable', async () => ({ default: await mkStub("Who's Teaching") }));
vi.mock('@/pages/admin/AttendanceOverview', async () => ({
  default: await mkStub('Attendance'),
  PeriodsTab: await mkStub('Periods'),
  HolidaysTab: await mkStub('Holidays'),
  ApprovalsTab: await mkStub('Approvals'),
}));
vi.mock('@/components/admissions/AdmissionsWorkspace', () => ({
  AdmissionsWorkspace: ({ user }: any) => <p>Admissions page (admin: {String(user.isAdmin)})</p>,
}));

import { adminWorkspaceRoutes } from '@/routes/adminWorkspaceRoutes';

function Where() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <React.Suspense fallback={<p>loading</p>}>
        <Routes>
          {adminWorkspaceRoutes()}
          <Route path="/dashboard/teacher" element={<p>Teacher dashboard</p>} />
          <Route path="/dashboard/admin" element={<p>Admin dashboard</p>} />
          <Route path="/signin" element={<p>Sign in</p>} />
        </Routes>
        <Where />
      </React.Suspense>
    </MemoryRouter>
  );

const CASES: Array<[string, string, string, string]> = [
  // address, workspace nav id, selected tab, page shown
  ['/dashboard/admin/admissions', 'admissions-classes', 'Admissions', 'Admissions page (admin: true)'],
  ['/dashboard/admin/classes', 'admissions-classes', 'Class Management', 'Class Management page (embedded)'],
  ['/dashboard/admin/results-monitor', 'results-sba', 'Results Monitor', 'Results Monitor page (embedded)'],
  ['/dashboard/admin/results-analysis', 'results-sba', 'Results Analysis', 'Results Analysis page (embedded)'],
  ['/dashboard/admin/sba-overview', 'results-sba', 'SBA Overview', 'SBA Overview page (embedded)'],
  ['/dashboard/admin/attendance-overview', 'attendance-timetable', 'Overview', 'Attendance page (embedded)'],
  ['/dashboard/admin/timetable-live', 'attendance-timetable', "Who's Teaching", "Who's Teaching page (embedded)"],
  ['/dashboard/admin/timetable/periods', 'attendance-timetable', 'Periods', 'Periods page (embedded)'],
  ['/dashboard/admin/timetable/holidays', 'attendance-timetable', 'Holidays', 'Holidays page (embedded)'],
  ['/dashboard/admin/timetable/approvals', 'attendance-timetable', 'Approvals', 'Approvals page (embedded)'],
];

beforeEach(() => {
  cleanup();
  h.user = { uid: 'A1', fullName: 'Head', userType: 'admin' };
});

describe('admin workspaces', () => {
  it.each(CASES)('%s opens its tab', async (path, navId, tab, page) => {
    const { container } = renderAt(path);
    expect(await screen.findByText(page)).toBeTruthy();
    expect(screen.getByRole('tab', { name: tab }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getAllByRole('tab', { selected: true })).toHaveLength(1);
    expect(container.querySelector(`[data-nav="${navId}"]`)).toBeTruthy();
  });

  it('each workspace has exactly its own tabs', async () => {
    renderAt('/dashboard/admin/classes');
    await screen.findByText(/Class Management page/);
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Admissions', 'Class Management']);
    cleanup();
    renderAt('/dashboard/admin/results-monitor');
    await screen.findByText(/Results Monitor page/);
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Results Monitor', 'Results Analysis', 'SBA Overview']);
    cleanup();
    renderAt('/dashboard/admin/attendance-overview');
    await screen.findByText(/Attendance page/);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Attendance');
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Overview', "Who's Teaching", 'Periods', 'Holidays', 'Approvals']);
    expect(screen.getByRole('link', { name: /Data check/ }).getAttribute('href')).toBe('/dashboard/admin/timetable-data-check');
  });

  it('switching tabs inside a workspace goes to the tab’s own address', async () => {
    renderAt('/dashboard/admin/results-monitor');
    await screen.findByText(/Results Monitor page/);
    fireEvent.click(screen.getByRole('tab', { name: 'SBA Overview' }));
    expect(screen.getByTestId('path').textContent).toBe('/dashboard/admin/sba-overview');
    expect(await screen.findByText('SBA Overview page (embedded)')).toBeTruthy();
  });

  it.each(CASES.map(c => c[0]))('a teacher (even an admissions officer) cannot open %s', path => {
    h.user = { uid: 'T1', fullName: 'Teacher', userType: 'teacher' };
    renderAt(path);
    expect(screen.getByText('Teacher dashboard')).toBeTruthy();
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('signed-out visitors go to sign in', () => {
    h.user = null;
    renderAt('/dashboard/admin/classes');
    expect(screen.getByText('Sign in')).toBeTruthy();
  });
});
