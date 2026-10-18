// Teacher Management → "Departments" (admins): who belongs to each
// department (Head of Department included), and the department's subjects.
// Membership is changed on a teacher's page (or by the HoD in My Department);
// subjects are normally chosen by the HoD, and an admin can change them here.
import { useMemo, useState } from 'react';
import { Award, Building2, ChevronDown, Loader2, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSchoolTeachers } from '@/hooks/useSchoolTeachers';
import { useDepartmentConfig, useHods, useInvalidateDepartments } from '@/hooks/useDepartments';
import {
  SCHOOL_DEPARTMENTS, hasDepartment, membersOf, setDepartmentSubjects, subjectsOfDepartment,
  type Actor, type DepartmentConfig,
} from '@/services/departmentService';
import { SubjectPicker, useSchoolSubjects } from './SubjectPicker';

interface Person { id: string; name: string; departments?: string[]; status?: string }

const working = (t: Person) => !t.status || t.status === 'active' || t.status === 'on_leave';

export interface DepartmentSummary {
  department: string;
  hod: { teacherId: string; teacherName: string } | null;
  /** HoD first, then by name. */
  members: Person[];
  subjects: string[];
}

/** Pure: one row per school department, plus teachers who are in none. */
export function summarizeDepartments(teachers: Person[], hods: Array<{ teacherId: string; teacherName: string; department: string; status: string }>, cfg: DepartmentConfig) {
  const staff = teachers.filter(working);
  const rows: DepartmentSummary[] = SCHOOL_DEPARTMENTS.map(department => {
    const hod = hods.find(h => h.status === 'active' && h.department.toLowerCase() === department.toLowerCase()) ?? null;
    const members = membersOf(staff, department).sort((a, b) =>
      (a.id === hod?.teacherId ? -1 : b.id === hod?.teacherId ? 1 : 0) || a.name.localeCompare(b.name));
    return { department, hod: hod && { teacherId: hod.teacherId, teacherName: hod.teacherName }, members, subjects: subjectsOfDepartment(cfg, department) };
  });
  const unplaced = staff
    .filter(t => !SCHOOL_DEPARTMENTS.some(d => hasDepartment(t.departments, d)))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { rows, unplaced };
}

export function DepartmentsOverviewDialog({ open, onOpenChange, actor }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  actor: Actor;
}) {
  const { allTeachers = [], isLoading } = useSchoolTeachers();
  const cfgQ = useDepartmentConfig();
  const hodsQ = useHods(open);
  const [openDept, setOpenDept] = useState<string | null>(null);

  const summary = useMemo(
    () => (cfgQ.data ? summarizeDepartments(allTeachers as unknown as Person[], hodsQ.data ?? [], cfgQ.data) : null),
    [allTeachers, hodsQ.data, cfgQ.data],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[95dvh] w-full max-w-3xl flex-col gap-3 overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pr-8 text-left">
          <DialogTitle className="flex items-center gap-2"><Building2 size={20} /> Departments</DialogTitle>
          <DialogDescription>
            Who belongs to each department, its Head of Department and its subjects. Heads of Department add their teachers and choose their subjects in My Department; a teacher can belong to more than one department.
          </DialogDescription>
        </DialogHeader>

        {!summary || isLoading ? (
          <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" /> Loading…</p>
        ) : (
          <div className="space-y-2">
            {summary.rows.map(r => (
              <DepartmentCard
                key={r.department}
                row={r}
                cfg={cfgQ.data!}
                actor={actor}
                expanded={openDept === r.department}
                onToggle={() => setOpenDept(d => (d === r.department ? null : r.department))}
              />
            ))}
            <div className="rounded-xl border border-dashed border-gray-300 p-3">
              <p className="text-sm font-medium text-gray-800">Not in a department ({summary.unplaced.length})</p>
              {summary.unplaced.length ? (
                <p className="mt-1 text-sm text-gray-600">{summary.unplaced.map(t => t.name).join(', ')}</p>
              ) : (
                <p className="mt-1 text-xs text-gray-500">Every teacher belongs to a department.</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DepartmentCard({ row, cfg, actor, expanded, onToggle }: {
  row: DepartmentSummary; cfg: DepartmentConfig; actor: Actor; expanded: boolean; onToggle: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<string[]>(row.subjects);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const schoolQ = useSchoolSubjects(editing);
  const invalidate = useInvalidateDepartments();

  const save = async () => {
    setBusy(true); setError('');
    try {
      await setDepartmentSubjects(row.department, picked, actor);
      await invalidate();
      setEditing(false);
    } catch (e: any) {
      setError(e?.message || 'Not saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full items-center gap-3 px-3 py-3 text-left sm:px-4">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900">{row.department}</p>
          <p className="flex flex-wrap gap-x-1.5 text-xs text-gray-600">
            <span>{row.hod ? <>HoD: <b>{row.hod.teacherName}</b></> : <span className="text-amber-700">No Head of Department</span>}</span>
            <span>· {row.members.length} teacher{row.members.length === 1 ? '' : 's'} · {row.subjects.length} subject{row.subjects.length === 1 ? '' : 's'}</span>
          </p>
        </div>
        <ChevronDown size={18} className={`shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-gray-100 px-3 pb-3 pt-3 sm:px-4">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Teachers</p>
            {row.members.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {row.members.map(m => (
                  <li key={m.id} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm ${m.id === row.hod?.teacherId ? 'bg-amber-100 text-amber-900' : 'bg-gray-100 text-gray-800'}`}>
                    {m.id === row.hod?.teacherId && <Award size={13} aria-label="Head of Department" />}
                    {m.name}{m.status === 'on_leave' ? ' (on leave)' : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm italic text-gray-500">No teachers yet.</p>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Subjects</p>
              {!editing && (
                <button type="button" onClick={() => { setPicked(row.subjects); setEditing(true); }} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-50">
                  <Pencil size={11} /> Change
                </button>
              )}
            </div>
            {editing ? (
              <div className="space-y-2">
                {schoolQ.isLoading ? (
                  <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={14} className="animate-spin" /> Loading subjects…</p>
                ) : (
                  <SubjectPicker subjects={schoolQ.data ?? []} picked={picked} onChange={setPicked} cfg={cfg} department={row.department} disabled={busy} />
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                    {busy && <Loader2 size={14} className="animate-spin" />} Save
                  </button>
                  <button type="button" onClick={() => setEditing(false)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">Cancel</button>
                  {error && <span className="text-xs text-red-600" role="alert">{error}</span>}
                </div>
              </div>
            ) : row.subjects.length ? (
              <div className="flex flex-wrap gap-1.5">
                {row.subjects.map(s => <span key={s} className="rounded-full bg-blue-50 px-2.5 py-1 text-sm text-blue-800">{s}</span>)}
              </div>
            ) : (
              <p className="text-sm italic text-gray-500">Not chosen yet{row.hod ? ` — ${row.hod.teacherName} chooses them in My Department` : ''}.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
