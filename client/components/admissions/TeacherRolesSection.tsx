// @/components/admissions/TeacherRolesSection.tsx
//
// School-wide roles on the teacher's page in Teacher Management (beside
// their class assignments): Admissions officer, Guidance & counselling officer.

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, UserPlus } from 'lucide-react';
import { assignAdmissionsOfficer, endAdmissionsOfficer, listAdmissionsOfficers } from '@/services/admissionsService';
import { assignGuidanceOfficer, endGuidanceOfficer, listGuidanceOfficers } from '@/services/guidanceService';

type Teacher = { id: string; name: string; email?: string };
type Actor = { uid: string; name: string };
type RoleLite = { teacherId: string; status: 'active' | 'ended'; startDate?: Date };

function RoleRow(props: {
  title: string;
  activeText: string;
  assignLabel: string;
  queryKey: string[];
  list: () => Promise<RoleLite[]>;
  assign: (t: Teacher, by: Actor) => Promise<void>;
  end: (teacherId: string, by: Actor) => Promise<void>;
  teacher: Teacher;
  isAdmin: boolean;
  actor: Actor;
}) {
  const { teacher, isAdmin, actor } = props;
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: props.queryKey, queryFn: props.list });
  const role = (q.data ?? []).find(r => r.teacherId === teacher.id && r.status === 'active');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = async () => {
    setBusy(true);
    setError('');
    try {
      if (role) await props.end(teacher.id, actor);
      else await props.assign(teacher, actor);
      await queryClient.invalidateQueries({ queryKey: props.queryKey });
      await queryClient.invalidateQueries({ queryKey: ['staffRoles'] });
    } catch (e: any) {
      setError(e?.message || 'Could not update the role.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl bg-white gap-3">
      <div>
        <p className="font-semibold text-gray-900 text-sm">{props.title}</p>
        <p className="text-xs text-gray-600 mt-0.5">
          {q.isLoading ? 'Checking…' : role
            ? `${props.activeText}${role.startDate ? ` · since ${role.startDate.toLocaleDateString('en-GB')}` : ''}`
            : 'Not assigned'}
        </p>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
      {isAdmin && (
        <button
          onClick={toggle}
          disabled={busy || q.isLoading}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 disabled:opacity-50 shrink-0 ${
            role ? 'text-red-600 bg-red-50 hover:bg-red-100' : 'text-blue-600 bg-blue-50 hover:bg-blue-100'
          }`}
        >
          {busy && <Loader2 size={12} className="animate-spin" />}
          {role ? 'Remove role' : props.assignLabel}
        </button>
      )}
    </div>
  );
}

export function TeacherRolesSection(props: { teacher: Teacher; isAdmin: boolean; actor: Actor }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
        <UserPlus size={16} className="text-gray-400" />
        School Roles
      </h3>
      <div className="space-y-2">
        <RoleRow
          {...props}
          title="Admissions officer"
          activeText="Enrols new learners"
          assignLabel="Make admissions officer"
          queryKey={['admissions', 'officers']}
          list={listAdmissionsOfficers}
          assign={assignAdmissionsOfficer}
          end={endAdmissionsOfficer}
        />
        <RoleRow
          {...props}
          title="Guidance & counselling officer"
          activeText="Sponsored learners' results and sponsor codes"
          assignLabel="Make guidance officer"
          queryKey={['guidance', 'officers']}
          list={listGuidanceOfficers}
          assign={assignGuidanceOfficer}
          end={endGuidanceOfficer}
        />
      </div>
    </div>
  );
}
