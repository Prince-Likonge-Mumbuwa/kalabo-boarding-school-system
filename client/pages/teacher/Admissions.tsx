// @/pages/teacher/Admissions.tsx — the admissions officer's page.
// Only teachers the admin made admissions officers can use it.
import { Loader2, Lock } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { AdmissionsWorkspace } from '@/components/admissions/AdmissionsWorkspace';
import { useAuth } from '@/hooks/useAuth';
import { useAdmissionsOfficer } from '@/hooks/useAdmissionsOfficer';

export default function OfficerAdmissions() {
  const { user } = useAuth();
  const { isOfficer, isLoading } = useAdmissionsOfficer();
  return (
    <DashboardLayout activeTab="admissions">
      <div className="p-3 sm:p-6 lg:p-8 max-w-7xl">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-600"><Loader2 size={16} className="animate-spin" /> Checking your role…</div>
        ) : !isOfficer || !user ? (
          <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-xl">
            <h1 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><Lock size={18} /> Admissions</h1>
            <p className="text-sm text-gray-700 mt-2">
              Only admissions officers can enrol new learners. The admin gives this role in Teachers or in Admissions → Settings.
            </p>
          </div>
        ) : (
          <AdmissionsWorkspace user={{ uid: user.uid, name: user.fullName || 'Admissions officer', isAdmin: false }} />
        )}
      </div>
    </DashboardLayout>
  );
}
