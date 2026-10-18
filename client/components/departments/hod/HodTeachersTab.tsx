// HoD → Teachers: who is in the department. Only the HoD (or an admin in
// Teacher Management) adds or removes teachers; teachers cannot add
// themselves. The rules let a HoD change membership of THEIR department only.
import { useMemo, useState } from 'react';
import { Award, Loader2, UserMinus, UserPlus } from 'lucide-react';
import { useInvalidateDepartments } from '@/hooks/useDepartments';
import { hasDepartment, setMembership } from '@/services/departmentService';
import type { HodMember } from './types';

export function HodTeachersTab({ department, hodId, members, allTeachers, load }: {
  department: string;
  hodId: string;
  members: HodMember[];
  allTeachers: HodMember[];
  /** classes each teacher owns in the department's subjects */
  load: Map<string, number>;
}) {
  const invalidate = useInvalidateDepartments();
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const candidates = useMemo(
    () => allTeachers
      .filter(t => !hasDepartment(t.departments, department) && (!t.status || t.status === 'active' || t.status === 'on_leave'))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [allTeachers, department],
  );

  const change = async (t: HodMember, member: boolean) => {
    setBusy(t.id); setMsg(null);
    try {
      await setMembership(t.id, department, member);
      await invalidate();
      setMsg({ ok: true, text: member ? `${t.name} added to ${department}.` : `${t.name} removed from ${department}.` });
      if (member) setPick('');
      setConfirm(null);
    } catch (e: any) {
      setMsg({ ok: false, text: e?.code === 'permission-denied' ? 'Not allowed. Only the Head of Department or an administrator can change this department.' : (e?.message || 'Not saved.') });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="mb-2 text-sm font-semibold text-gray-900">Add a teacher to {department}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={pick}
            onChange={e => setPick(e.target.value)}
            aria-label="Teacher to add"
            className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">{candidates.length ? 'Choose a teacher…' : 'Every teacher is already in the department'}</option>
            {candidates.map(t => (
              <option key={t.id} value={t.id}>{t.name}{t.departments?.length ? ` (${t.departments.join(', ')})` : ''}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!pick || !!busy}
            onClick={() => { const t = candidates.find(c => c.id === pick); if (t) change(t, true); }}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy && busy === pick ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Add
          </button>
        </div>
        {msg && <p className={`mt-2 text-xs ${msg.ok ? 'text-green-700' : 'text-red-600'}`} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      </div>

      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {members.map(t => {
          const classes = load.get(t.id) ?? 0;
          const isHod = t.id === hodId;
          return (
            <li key={t.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate font-medium text-gray-900">
                  {t.name}
                  {isHod && <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800"><Award size={10} /> HoD</span>}
                  {t.status === 'on_leave' && <span className="text-xs font-normal text-amber-700">(on leave)</span>}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {classes} class{classes === 1 ? '' : 'es'} allocated in {department}
                  {t.subjects?.length ? ` · teaches ${t.subjects.join(', ')}` : ''}
                </p>
              </div>
              {!isHod && (confirm === t.id ? (
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  {classes > 0 ? `Keeps their ${classes} class${classes === 1 ? '' : 'es'} until you reallocate. Remove?` : 'Remove from the department?'}
                  <button type="button" disabled={!!busy} onClick={() => change(t, false)} className="flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-white hover:bg-red-700 disabled:opacity-50">
                    {busy === t.id && <Loader2 size={12} className="animate-spin" />} Remove
                  </button>
                  <button type="button" onClick={() => setConfirm(null)} className="rounded border px-2 py-1">Cancel</button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirm(t.id)}
                  className="flex items-center gap-1 self-start rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 sm:self-auto"
                >
                  <UserMinus size={14} /> Remove
                </button>
              ))}
            </li>
          );
        })}
        {members.length === 0 && <li className="p-4 text-sm text-gray-500">No teachers in {department} yet. Add them above.</li>}
      </ul>
    </div>
  );
}
