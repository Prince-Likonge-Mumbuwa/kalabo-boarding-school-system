// Teacher Management → a teacher's page: the departments they belong to and
// the Head of Department role. Admins edit; others only see.
import React, { useEffect, useMemo, useState } from 'react';
import { Award, Building2, Loader2 } from 'lucide-react';
import { DepartmentPicker } from './DepartmentPicker';
import { useDepartmentList, useHods, useInvalidateDepartments } from '@/hooks/useDepartments';
import {
  addDepartment,
  assignHod,
  endHod,
  hasDepartment,
  mergeDepartmentOptions,
  planHodAssignment,
  setTeacherDepartments,
  type Actor,
} from '@/services/departmentService';

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every(x => hasDepartment(b, x));

export function TeacherDepartmentsSection({ teacher, isAdmin, actor }: {
  teacher: { id: string; name: string; departments?: string[] };
  isAdmin: boolean;
  actor: Actor;
}) {
  const saved = useMemo(() => teacher.departments ?? [], [teacher.departments]);
  const listQ = useDepartmentList();
  const hodsQ = useHods();
  const invalidate = useInvalidateDepartments();

  const [draft, setDraft] = useState<string[]>(saved);
  const [busy, setBusy] = useState<'' | 'save' | 'hod' | 'end'>('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [hodDept, setHodDept] = useState('');

  // A different teacher selected, or their record refreshed.
  useEffect(() => { setDraft(saved); setError(''); setNote(''); }, [teacher.id, saved]);

  const roles = hodsQ.data ?? [];
  const myRole = roles.find(r => r.teacherId === teacher.id && r.status === 'active') ?? null;
  const options = mergeDepartmentOptions(listQ.data ?? [], saved, draft);
  const dirty = !sameList(draft, saved);

  // HoD choices: the departments the teacher is (already) a member of.
  const hodChoices = saved.filter(d => !myRole || d.toLowerCase() !== myRole.department.toLowerCase());
  useEffect(() => {
    if (!hodChoices.some(d => d === hodDept)) setHodDept(hodChoices[0] ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hodChoices.join('|')]);
  const plan = hodDept ? planHodAssignment(roles, teacher.id, hodDept) : null;

  const run = async (kind: 'save' | 'hod' | 'end', fn: () => Promise<string | void>) => {
    setBusy(kind);
    setError('');
    setNote('');
    try {
      const msg = await fn();
      await invalidate();
      if (msg) setNote(msg);
    } catch (e: any) {
      setError(e?.message || 'Could not save. Check your connection and try again.');
    } finally {
      setBusy('');
    }
  };

  const save = () => run('save', async () => {
    await setTeacherDepartments(teacher.id, draft);
    return 'Departments saved.';
  });
  const makeHod = () => run('hod', async () => {
    const r = await assignHod({ id: teacher.id, name: teacher.name, departments: saved }, hodDept, actor);
    return `${teacher.name} is now Head of ${hodDept}.${r.replaced ? ` ${r.replaced.teacherName} stepped down.` : ''}`;
  });
  const stepDown = () => run('end', async () => {
    await endHod(teacher.id, actor);
    return `${teacher.name} is no longer Head of ${myRole?.department}.`;
  });

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4 flex items-center gap-2">
        <Building2 size={16} className="text-gray-400" />
        Departments
      </h3>

      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
        {isAdmin ? (
          listQ.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={14} className="animate-spin" /> Loading departments…</p>
          ) : (
            <DepartmentPicker
              options={options}
              value={draft}
              onChange={setDraft}
              locked={myRole ? [myRole.department] : []}
              lockedReason={myRole ? `Head of ${myRole.department} — end the HoD role first` : undefined}
              hodOf={myRole?.department}
              disabled={!!busy}
              onAdd={async name => { const n = await addDepartment(name, actor); await invalidate(); return n; }}
            />
          )
        ) : saved.length ? (
          <div className="flex flex-wrap gap-2">
            {saved.map(d => <span key={d} className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-800">{d}</span>)}
          </div>
        ) : (
          <p className="text-sm italic text-gray-500">Not in a department yet.</p>
        )}

        {isAdmin && dirty && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={save}
              disabled={!!busy}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy === 'save' && <Loader2 size={14} className="animate-spin" />} Save departments
            </button>
            <button type="button" onClick={() => setDraft(saved)} disabled={!!busy} className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50">
              Undo
            </button>
          </div>
        )}

        {/* Head of Department */}
        <div className="border-t border-gray-100 pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                <Award size={15} className="text-amber-500" /> Head of Department
              </p>
              <p className="mt-0.5 text-xs text-gray-600">
                {hodsQ.isLoading
                  ? 'Checking…'
                  : myRole
                    ? `Head of ${myRole.department}${myRole.startDate ? ` · since ${myRole.startDate.toLocaleDateString('en-GB')}` : ''}`
                    : 'Not a head of department'}
              </p>
            </div>
            {isAdmin && myRole && (
              <button
                type="button"
                onClick={stepDown}
                disabled={!!busy}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
              >
                {busy === 'end' && <Loader2 size={12} className="animate-spin" />} End HoD role
              </button>
            )}
          </div>

          {isAdmin && !hodsQ.isLoading && (
            hodChoices.length === 0 ? (
              !myRole && <p className="mt-2 text-xs text-gray-500">Add {teacher.name.split(' ')[0]} to a department (and save) to make them its head.</p>
            ) : (
              <div className="mt-3 space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <select
                    value={hodDept}
                    onChange={e => setHodDept(e.target.value)}
                    disabled={!!busy}
                    aria-label="Department to head"
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                  >
                    {hodChoices.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={makeHod}
                    disabled={!!busy || !hodDept}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    {busy === 'hod' && <Loader2 size={14} className="animate-spin" />}
                    {myRole ? `Move to Head of ${hodDept}` : plan?.replaces ? 'Replace as HoD' : 'Make Head of Department'}
                  </button>
                </div>
                {plan?.replaces && (
                  <p className="text-xs text-amber-700">
                    {plan.replaces.teacherName} is Head of {plan.replaces.department} now and will step down.
                  </p>
                )}
                {myRole && (
                  <p className="text-xs text-gray-500">A teacher heads one department; moving ends the {myRole.department} role.</p>
                )}
              </div>
            )
          )}
        </div>

        {note && <p className="text-xs text-green-700" role="status">{note}</p>}
        {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
      </div>
    </div>
  );
}
