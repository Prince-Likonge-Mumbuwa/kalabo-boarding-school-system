// HoD → Allocations: which department teacher teaches each of the
// department's subjects in each class.
//
// These are the assignment engine's class slots — the SAME records the admin
// edits in Teacher Management and that Results Entry, the Results Entry
// Monitor, registers, report cards and the timetable read. Changes go through
// the same calls the admin screen uses, so the two can never disagree. A new
// allocation starts now and stays until changed; the history keeps who
// taught what in earlier terms. Covers / Teaching Practice and Form Teachers
// stay with the admin.
import { useMemo, useState } from 'react';
import { BookOpen, Check, Loader2, ShieldAlert } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useSchoolTeachers } from '@/hooks/useSchoolTeachers';
import { useSlotsForSubjects } from '@/hooks/useDepartments';
import { isEngineReady } from '@/services/assignmentEngine';
import { allocationRows, type AllocationRow, type DepartmentConfig } from '@/services/departmentService';
import { HodSubjectsEditor } from './HodSubjectsEditor';
import { HodSignoffCard } from './HodSignoffCard';
import { formatTermLabel, getCurrentAcademicTerm } from '@/utils/academicTerm';
import type { HodMember } from './types';

const VACANT = '';

export function HodAllocationsTab({ department, cfg, subjects, classes, members }: {
  department: string;
  cfg: DepartmentConfig;
  /** Normalised subject names of the department. */
  subjects: string[];
  classes: Array<{ id: string; name: string }>;
  members: HodMember[];
}) {
  const [subject, setSubject] = useState(subjects[0] ?? '');
  const current = subjects.includes(subject) ? subject : subjects[0] ?? '';
  const slotsQ = useSlotsForSubjects(subjects);
  const engineQ = useQuery({ queryKey: ['assignment_engine_ready'], queryFn: isEngineReady, staleTime: 5 * 60_000 });
  const { assignTeacherToClass, removeTeacherSubject } = useSchoolTeachers();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ classId: string; ok: boolean; text: string } | null>(null);
  const term = getCurrentAcademicTerm();

  const rows = useMemo(() => allocationRows(classes, slotsQ.data ?? [], current), [classes, slotsQ.data, current]);
  const vacant = rows.filter(r => !r.ownerTeacherId).length;
  const memberIds = new Set(members.map(m => m.id));

  if (!subjects.length) return <HodSubjectsEditor department={department} cfg={cfg} subjects={subjects} />;

  const change = async (row: AllocationRow, teacherId: string) => {
    setBusy(row.classId); setMsg(null);
    try {
      if (teacherId === VACANT) {
        if (row.ownerTeacherId) await removeTeacherSubject({ teacherId: row.ownerTeacherId, classId: row.classId, subject: row.slot?.subject || current });
        setMsg({ classId: row.classId, ok: true, text: 'Now vacant' });
      } else {
        await assignTeacherToClass({ teacherId, classId: row.classId, subject: row.slot?.subject || current });
        setMsg({ classId: row.classId, ok: true, text: 'Saved' });
      }
    } catch (e: any) {
      setMsg({
        classId: row.classId,
        ok: false,
        text: e?.code === 'permission-denied'
          ? 'Not allowed: only teachers of the department, on the department\'s subjects.'
          : (e?.message || 'Not saved.'),
      });
    } finally {
      setBusy(null);
    }
  };

  const vacantAll = (slotsQ.data ?? []).filter(s => !s.ownerTeacherId).length;

  return (
    <div className="space-y-4">
      <HodSignoffCard department={department} vacant={vacantAll} />
      <div className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900">Allocations · {formatTermLabel(term.term, term.year)}</p>
          <p className="text-xs text-gray-500">A change applies from now and stays until changed. Same records as Teacher Management.</p>
        </div>
        <div className="mb-3"><HodSubjectsEditor department={department} cfg={cfg} subjects={subjects} /></div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Subject">
          {subjects.map(s => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={s === current}
              onClick={() => { setSubject(s); setMsg(null); }}
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${s === current ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-blue-50'}`}
            >
              <BookOpen size={14} /> {s}
            </button>
          ))}
        </div>
      </div>

      {engineQ.data === false && (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><ShieldAlert size={16} /> Class assignments are not set up yet. The administrator must finish the one-time setup in Teacher Management.</p>
      )}

      {slotsQ.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" /> Loading…</p>
      ) : slotsQ.isError ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Could not load the allocations. Refresh the page.</p>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-2 text-xs text-gray-600">
            {current}: {rows.length - vacant} of {rows.length} classes allocated{vacant ? ` · ${vacant} vacant` : ''}
          </div>
          <ul className="divide-y divide-gray-100">
            {rows.map(r => {
              const outsider = r.ownerTeacherId && !memberIds.has(r.ownerTeacherId);
              return (
                <li key={r.classId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <span className="w-28 flex-shrink-0 font-medium text-gray-900">{r.className}</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <select
                      value={r.ownerTeacherId ?? VACANT}
                      disabled={busy === r.classId || engineQ.data === false}
                      onChange={e => change(r, e.target.value)}
                      aria-label={`${current} teacher for ${r.className}`}
                      className={`w-full rounded-lg border px-3 py-2 text-sm sm:max-w-xs ${r.ownerTeacherId ? 'border-gray-300 bg-white' : 'border-dashed border-amber-400 bg-amber-50'}`}
                    >
                      <option value={VACANT}>— Vacant —</option>
                      {outsider && <option value={r.ownerTeacherId!}>{r.ownerTeacherName} (not in {department})</option>}
                      {members.map(m => <option key={m.id} value={m.id}>{m.name}{m.status === 'on_leave' ? ' (on leave)' : ''}</option>)}
                    </select>
                    {r.coverTeacherName && (
                      <span className="text-xs text-rose-700">{r.coverRole === 'tp' ? 'Teaching Practice' : 'Covered'} by {r.coverTeacherName} now (set by the admin)</span>
                    )}
                  </div>
                  <span className="min-w-[5rem] text-xs" aria-live="polite">
                    {busy === r.classId && <span className="flex items-center gap-1 text-gray-500"><Loader2 size={12} className="animate-spin" /> Saving…</span>}
                    {busy !== r.classId && msg?.classId === r.classId && (
                      <span className={msg.ok ? 'flex items-center gap-1 text-green-700' : 'text-red-600'}>{msg.ok && <Check size={12} />}{msg.text}</span>
                    )}
                  </span>
                </li>
              );
            })}
            {rows.length === 0 && <li className="p-4 text-sm text-gray-500">No classes.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
