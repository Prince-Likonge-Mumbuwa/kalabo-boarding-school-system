// @/pages/teacher/MyDepartment.tsx
//
// Head of Department:
//   Results      results entry progress of the department's teachers
//   Roll call    registers taken for the lessons they taught on a day
//   Allocations  which department teacher teaches each department subject
//                in each class (the same class slots as Teacher Management)
//   Teachers     add / remove teachers of the department
//
// Everything reads and writes the same records as the admin screens, so the
// two views always agree.
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Award, BarChart3, CalendarCheck, Loader2, RefreshCw, Shuffle, Users } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useDepartmentConfig, useMyHodRole, useSlotsForSubjects } from '@/hooks/useDepartments';
import { useSchoolTeachers } from '@/hooks/useSchoolTeachers';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useResultsEntryMonitor } from '@/hooks/useResultsEntryMonitor';
import { membersOf, subjectsOfDepartment, teachingLoad } from '@/services/departmentService';
import { HodResultsTab } from '@/components/departments/hod/HodResultsTab';
import { HodRollCallTab } from '@/components/departments/hod/HodRollCallTab';
import { HodAllocationsTab } from '@/components/departments/hod/HodAllocationsTab';
import { HodTeachersTab } from '@/components/departments/hod/HodTeachersTab';
import type { HodMember } from '@/components/departments/hod/types';

const TABS = [
  { id: 'results', label: 'Results', icon: BarChart3 },
  { id: 'rollcall', label: 'Roll call', icon: CalendarCheck },
  { id: 'allocations', label: 'Allocations', icon: Shuffle },
  { id: 'teachers', label: 'Teachers', icon: Users },
] as const;
type TabId = typeof TABS[number]['id'];

export default function MyDepartment() {
  const { role, isLoading: roleLoading } = useMyHodRole();
  const { allTeachers = [], isLoading: teachersLoading } = useSchoolTeachers();
  const { classes = [] } = useSchoolClasses({ isActive: true });
  const cfgQ = useDepartmentConfig();
  const [params, setParams] = useSearchParams();
  const tab: TabId = (TABS.find(t => t.id === params.get('tab'))?.id ?? 'results') as TabId;
  const monitor = useResultsEntryMonitor({ enabled: !!role && tab === 'results' });

  const teachers = allTeachers as unknown as HodMember[];
  const members = useMemo(() => {
    if (!role) return [];
    return membersOf(teachers, role.department)
      .filter(t => !t.status || t.status === 'active' || t.status === 'on_leave')
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [teachers, role]);

  const subjects = useMemo(() => (role && cfgQ.data ? subjectsOfDepartment(cfgQ.data, role.department) : []), [role, cfgQ.data]);
  const slotsQ = useSlotsForSubjects(subjects);
  const load = useMemo(() => teachingLoad(slotsQ.data ?? []), [slotsQ.data]);
  const classList = useMemo(() => (classes as Array<{ id: string; name: string }>).map(c => ({ id: c.id, name: c.name })), [classes]);

  if (roleLoading) {
    return <DashboardLayout activeTab="my-department"><p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" /> Loading…</p></DashboardLayout>;
  }
  if (!role) {
    return (
      <DashboardLayout activeTab="my-department">
        <div className="mx-auto max-w-md rounded-xl border border-gray-200 bg-white p-6 text-center">
          <Award className="mx-auto mb-2 text-gray-400" size={32} />
          <h1 className="font-semibold text-gray-900">You are not a Head of Department</h1>
          <p className="mt-1 text-sm text-gray-600">An administrator appoints HoDs in Teacher Management.</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="my-department">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-700"><Award size={14} /> Head of Department</p>
            <h1 className="truncate text-xl font-bold text-gray-900 sm:text-2xl">{role.department}</h1>
            <p className="text-sm text-gray-500">{members.length} teacher{members.length === 1 ? '' : 's'} · {subjects.length} subject{subjects.length === 1 ? '' : 's'}</p>
          </div>
          {tab === 'results' && (
            <button
              type="button"
              onClick={() => monitor.refetch()}
              disabled={monitor.isFetching}
              className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50 sm:self-auto"
            >
              <RefreshCw size={14} className={monitor.isFetching ? 'animate-spin' : ''} /> Refresh
            </button>
          )}
        </div>

        <div>
          <div className="grid grid-cols-4 gap-1 rounded-xl border border-gray-200 bg-white p-1 sm:inline-flex" role="tablist" aria-label="Department">
            {TABS.map(t => {
              const Icon = t.icon;
              const on = t.id === tab;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setParams(p => { const n = new URLSearchParams(p); n.set('tab', t.id); return n; }, { replace: true })}
                  className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-medium sm:flex-row sm:gap-1.5 sm:px-3 sm:py-2 sm:text-sm ${on ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <Icon size={15} /> {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {tab === 'results' && <HodResultsTab members={members} monitor={monitor} teachersLoading={teachersLoading} />}
        {tab === 'rollcall' && <HodRollCallTab members={members} />}
        {tab === 'allocations' && (
          cfgQ.isLoading ? <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" /> Loading…</p>
            : <HodAllocationsTab department={role.department} subjects={subjects} classes={classList} members={members} />
        )}
        {tab === 'teachers' && (
          <HodTeachersTab department={role.department} hodId={role.teacherId} members={members} allTeachers={teachers} load={load} />
        )}
      </div>
    </DashboardLayout>
  );
}
