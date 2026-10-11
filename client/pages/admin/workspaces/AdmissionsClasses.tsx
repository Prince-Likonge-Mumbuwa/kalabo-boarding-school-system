// @/pages/admin/workspaces/AdmissionsClasses.tsx
//
// Admin: "Admissions & Classes" — admitting new learners and managing the
// classes they join, as two tabs of one workspace.
//
//   Admissions        /dashboard/admin/admissions   (intake, officers, slips)
//   Class Management  /dashboard/admin/classes      (classes and learners)
//
// Admin only (the routes are wrapped in ProtectedRoute admin). Admissions
// officers keep their own page, /dashboard/teacher/admissions, which shows
// the same admissions view without the admin-only parts.

import { lazy } from 'react';
import { BookOpen, UserPlus } from 'lucide-react';
import { TabbedWorkspace, type WorkspaceTab } from '@/components/workspace/TabbedWorkspace';
import { AdmissionsWorkspace } from '@/components/admissions/AdmissionsWorkspace';
import { useAuth } from '@/hooks/useAuth';

const ClassManagement = lazy(() => import('../ClassManagement'));

export const ADMISSIONS_CLASSES_PATHS = {
  admissions: '/dashboard/admin/admissions',
  classes: '/dashboard/admin/classes',
} as const;

export default function AdmissionsClassesWorkspace() {
  const { user } = useAuth();
  const tabs: WorkspaceTab[] = [
    {
      id: 'admissions',
      label: 'Admissions',
      icon: UserPlus,
      paths: [ADMISSIONS_CLASSES_PATHS.admissions],
      render: () => (
        <div className="p-3 sm:p-6 lg:p-8 max-w-7xl">
          {user && <AdmissionsWorkspace user={{ uid: user.uid, name: user.fullName || 'Admin', isAdmin: true }} />}
        </div>
      ),
    },
    {
      id: 'classes',
      label: 'Class Management',
      icon: BookOpen,
      paths: [ADMISSIONS_CLASSES_PATHS.classes],
      render: () => <ClassManagement />,
    },
  ];
  return (
    <TabbedWorkspace
      navId="admissions-classes"
      title="Admissions & Classes"
      description="Admit new learners — each is placed in an intake class that has places — and manage classes and their learners."
      tabs={tabs}
    />
  );
}
