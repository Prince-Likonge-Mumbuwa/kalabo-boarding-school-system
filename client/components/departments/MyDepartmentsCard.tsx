// Settings → "My departments" (teachers): read only. A teacher is added to a
// department by its Head of Department (My Department) or by an admin
// (Teacher Management); the Firestore rules stop teachers changing it.
import React from 'react';
import { Award, Building2, Loader2 } from 'lucide-react';
import { useHods, useMyDepartments, useMyHodRole } from '@/hooks/useDepartments';

export function MyDepartmentsCard() {
  const mineQ = useMyDepartments();
  const { role } = useMyHodRole();
  const hodsQ = useHods();
  const mine = mineQ.data ?? [];
  const headOf = (d: string) =>
    (hodsQ.data ?? []).find(h => h.status === 'active' && h.department.toLowerCase() === d.toLowerCase())?.teacherName ?? null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Building2 size={18} className="text-indigo-600" />
          <h2 className="text-lg font-semibold text-gray-900">My Departments</h2>
        </div>
        <p className="text-sm text-gray-600 mt-1">Your Head of Department adds you to the department</p>
      </div>
      <div className="p-4 sm:p-6 space-y-3">
        {role && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <Award size={16} className="mt-0.5 flex-shrink-0 text-amber-600" />
            <span>You are <b>Head of {role.department}</b>. Add teachers to it in My Department.</span>
          </p>
        )}
        {mineQ.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={14} className="animate-spin" /> Loading…</p>
        ) : mine.length ? (
          <ul className="flex flex-wrap gap-2">
            {mine.map(d => (
              <li key={d} className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-sm text-indigo-900">
                <span className="font-medium">{d}</span>
                {headOf(d) && <span className="block text-xs text-indigo-700">HoD: {headOf(d)}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-600">You are not in a department yet. Ask your Head of Department to add you.</p>
        )}
        {mineQ.isError && <p className="text-sm text-red-600">Could not load your departments. Refresh the page.</p>}
      </div>
    </div>
  );
}
