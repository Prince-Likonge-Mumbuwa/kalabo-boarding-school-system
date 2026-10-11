// @/components/admissions/TeacherRolesSection.tsx
//
// School-wide roles on the teacher's page in Teacher Management (beside
// their class assignments). For now: Admissions officer.

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, UserPlus } from 'lucide-react';
import { assignAdmissionsOfficer, endAdmissionsOfficer, listAdmissionsOfficers } from '@/services/admissionsService';

export function TeacherRolesSection(props: {
  teacher: { id: string; name: string; email?: string };
  isAdmin: boolean;
  actor: { uid: string; name: string };
}) {
  const { teacher, isAdmin, actor } = props;
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ['admissions', 'officers'], queryFn: listAdmissionsOfficers });
  const role = (q.data ?? []).find(r => r.teacherId === teacher.id && r.status === 'active');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = async () => {
    setBusy(true);
    setError('');
    try {
      if (role) await endAdmissionsOfficer(teacher.id, actor);
      else await assignAdmissionsOfficer(teacher, actor);
      await queryClient.invalidateQueries({ queryKey: ['admissions', 'officers'] });
      await queryClient.invalidateQueries({ queryKey: ['staffRoles'] });
    } catch (e: any) {
      setError(e?.message || 'Could not update the role.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
        <UserPlus size={16} className="text-gray-400" />
        School Roles
      </h3>
      <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl bg-white gap-3">
        <div>
          <p className="font-semibold text-gray-900 text-sm">Admissions officer</p>
          <p className="text-xs text-gray-600 mt-0.5">
            {q.isLoading ? 'Checking…' : role
              ? `Enrols new learners${role.startDate ? ` · since ${role.startDate.toLocaleDateString('en-GB')}` : ''}`
              : 'Not assigned'}
          </p>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
        {isAdmin && (
          <button
            onClick={toggle}
            disabled={busy || q.isLoading}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 disabled:opacity-50 ${
              role ? 'text-red-600 bg-red-50 hover:bg-red-100' : 'text-blue-600 bg-blue-50 hover:bg-blue-100'
            }`}
          >
            {busy && <Loader2 size={12} className="animate-spin" />}
            {role ? 'Remove role' : 'Make admissions officer'}
          </button>
        )}
      </div>
    </div>
  );
}
