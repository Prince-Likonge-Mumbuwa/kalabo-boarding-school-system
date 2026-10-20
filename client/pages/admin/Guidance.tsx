// @/pages/admin/Guidance.tsx — the admin's view of the guidance module
// (sponsored learners, sponsor codes).
import { DashboardLayout } from '@/components/DashboardLayout';
import { GuidanceWorkspace } from '@/components/guidance/GuidanceWorkspace';
import { useAuth } from '@/hooks/useAuth';

export default function AdminGuidance() {
  const { user } = useAuth();
  return (
    <DashboardLayout activeTab="guidance">
      <div className="p-3 sm:p-6 lg:p-8 max-w-7xl">
        {user && <GuidanceWorkspace user={{ uid: user.uid, name: user.fullName || 'Admin', isAdmin: true }} />}
      </div>
    </DashboardLayout>
  );
}
