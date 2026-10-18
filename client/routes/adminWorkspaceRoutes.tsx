// @/routes/adminWorkspaceRoutes.tsx
//
// Routes of the tabbed admin workspaces. Each workspace is a layout route:
// its tabs are child routes with their own (unchanged) addresses, so
//   - old links and bookmarks open the right tab,
//   - Back / Forward move between tabs,
//   - the workspace stays mounted while switching tabs (tab state is kept).
// Every workspace is admin-only. Admissions officers use
// /dashboard/teacher/admissions (a teacher route), not these.

import { lazy } from 'react';
import { Route } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';

const AdmissionsClassesWorkspace = lazy(() => import('@/pages/admin/workspaces/AdmissionsClasses'));
const ResultsSbaWorkspace = lazy(() => import('@/pages/admin/workspaces/ResultsSba'));
const AttendanceTimetableWorkspace = lazy(() => import('@/pages/admin/workspaces/AttendanceTimetable'));

export const WORKSPACE_ROUTES = {
  admissionsClasses: ['/dashboard/admin/admissions', '/dashboard/admin/classes'],
  resultsSba: ['/dashboard/admin/results-monitor', '/dashboard/admin/results-analysis', '/dashboard/admin/sba-overview'],
  attendanceTimetable: [
    '/dashboard/admin/attendance-overview',
    '/dashboard/admin/timetable-live',
    '/dashboard/admin/timetable/periods',
    '/dashboard/admin/timetable/holidays',
    '/dashboard/admin/timetable/approvals',
    '/dashboard/admin/face-recognition',
  ],
} as const;

/** Call inside <Routes>: `{adminWorkspaceRoutes()}` */
export function adminWorkspaceRoutes() {
  const group = (key: string, Workspace: React.ComponentType, paths: readonly string[]) => (
    <Route
      key={key}
      element={
        <ProtectedRoute allowedRoles={['admin']}>
          <Workspace />
        </ProtectedRoute>
      }
    >
      {paths.map(p => <Route key={p} path={p} element={null} />)}
    </Route>
  );
  return [
    // Admissions & Classes
    group('admissions-classes', AdmissionsClassesWorkspace, WORKSPACE_ROUTES.admissionsClasses),
    // Results & SBA — the monitor reads class_slots + results directly
    group('results-sba', ResultsSbaWorkspace, WORKSPACE_ROUTES.resultsSba),
    // Attendance (Periods, Holidays, Approvals are tabs)
    group('attendance-timetable', AttendanceTimetableWorkspace, WORKSPACE_ROUTES.attendanceTimetable),
  ];
}
