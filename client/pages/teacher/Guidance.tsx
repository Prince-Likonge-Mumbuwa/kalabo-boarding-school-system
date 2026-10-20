// @/pages/teacher/Guidance.tsx — the guidance & counselling officer's page.
// Only teachers the admin made guidance officers can use it.
import { Loader2, Lock } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { GuidanceWorkspace } from '@/components/guidance/GuidanceWorkspace';
import { useAuth } from '@/hooks/useAuth';
import { useGuidanceOfficer } from '@/hooks/useGuidanceOfficer';

export default function OfficerGuidance() {
  const { user } = useAuth();
  const { isOfficer, isLoading } = useGuidanceOfficer();
  return (
    <DashboardLayout activeTab="guidance">
      <div className="p-3 sm:p-6 lg:p-8 max-w-7xl">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-600"><Loader2 size={16} className="animate-spin" /> Checking your role…</div>
        ) : !isOfficer || !user ? (
          <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-xl">
            <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><Lock size={18} /> Guidance &amp; Counselling</h1>
            <p className="text-sm text-gray-700 mt-2">
              Only guidance &amp; counselling officers can use this page. The admin gives this role in Teachers → open the teacher → School Roles.
            </p>
          </div>
        ) : (
          <GuidanceWorkspace user={{ uid: user.uid, name: user.fullName || 'Guidance officer', isAdmin: false }} />
        )}
      </div>
    </DashboardLayout>
  );
}
