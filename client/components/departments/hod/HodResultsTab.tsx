// HoD → Results: how far each department teacher has got with results
// entry in the chosen term (the term picker is in the page header). Same numbers as the admin's Results Entry Monitor (same
// grid as Results Entry), filtered to the department.
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, Search, Users } from 'lucide-react';
import type { TeacherProgress } from '@/hooks/useResultsEntryMonitor';
import type { useResultsEntryMonitor } from '@/hooks/useResultsEntryMonitor';
import type { HodMember } from './types';
import { DEADLINE_BADGE, deadlineStatus, formatDay } from '@/services/resultsDeadlines';

const STATUS: Record<TeacherProgress['status'], [string, string]> = {
  complete: ['Complete', 'bg-green-100 text-green-800'],
  'on-track': ['On track', 'bg-blue-100 text-blue-800'],
  behind: ['Behind', 'bg-amber-100 text-amber-800'],
  critical: ['Far behind', 'bg-red-100 text-red-800'],
};
const BAR: Record<TeacherProgress['status'], string> = {
  complete: 'bg-green-500', 'on-track': 'bg-blue-500', behind: 'bg-amber-500', critical: 'bg-red-500',
};

export function HodResultsTab({ members, monitor, teachersLoading }: {
  members: HodMember[];
  monitor: ReturnType<typeof useResultsEntryMonitor>;
  teachersLoading: boolean;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const progressById = useMemo(() => new Map(monitor.teacherProgress.map(p => [p.teacherId, p])), [monitor.teacherProgress]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members
      .filter(m => !q || m.name.toLowerCase().includes(q) || (m.subjects ?? []).some(s => s.toLowerCase().includes(q)))
      .map(m => ({ teacher: m, progress: progressById.get(m.id) ?? null }));
  }, [members, progressById, search]);

  const summary = useMemo(() => {
    let required = 0, missing = 0, complete = 0, behind = 0;
    for (const m of members) {
      const p = progressById.get(m.id);
      if (!p || p.totalRequired === 0) continue;
      required += p.totalRequired;
      missing += p.missingCount;
      if (p.status === 'complete') complete++;
      if (p.status === 'behind' || p.status === 'critical') behind++;
    }
    return { required, missing, complete, behind, pct: required ? Math.round(((required - missing) / required) * 100) : 100 };
  }, [members, progressById]);

  return (
    <div className="space-y-4">
      <p className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
        Showing <span className="font-semibold text-gray-900">{monitor.termLabel}</span>
        {monitor.isCurrentTerm
          ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Current term</span>
          : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">Past / upcoming term</span>}
      </p>
      {(monitor.deadlines ?? []).some(d => d.deadline) && (
        <ul className="flex flex-wrap gap-2 text-xs" aria-label="Results deadlines">
          {(monitor.deadlines ?? []).filter(d => d.deadline).map(d => {
            const st = deadlineStatus(d.deadline);
            return (
              <li key={d.examType} className={`rounded-full border px-2.5 py-1 ${DEADLINE_BADGE[st.tone]}`}>
                {monitor.getExamName(d.examType)}: results due {formatDay(d.deadline, { weekday: 'short', day: 'numeric', month: 'short' })} · {st.label}
              </li>
            );
          })}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Teachers', String(members.length)],
          ['Entered', summary.required ? `${summary.pct}%` : '—'],
          ['Complete', String(summary.complete)],
          ['Behind', String(summary.behind)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-xl font-bold text-gray-900 sm:text-2xl">{monitor.isLoading && label !== 'Teachers' ? '…' : value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Users size={16} /> Teachers in the department</h2>
          <div className="relative sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or subject" aria-label="Search teachers" className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm" />
          </div>
        </div>

        {teachersLoading ? (
          <p className="flex items-center gap-2 p-4 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" /> Loading…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">
            {members.length === 0 ? 'No teachers in the department yet. Add them on the Teachers tab.' : 'No teacher matches.'}
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map(({ teacher, progress }) => {
              const expanded = open === teacher.id;
              const [label, cls] = progress ? STATUS[progress.status] : ['—', 'bg-gray-100 text-gray-600'];
              const hasWork = !!progress && progress.totalRequired > 0;
              return (
                <li key={teacher.id} className="p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-gray-900">{teacher.name}{teacher.status === 'on_leave' && <span className="ml-2 text-xs text-amber-700">(on leave)</span>}</p>
                      <p className="truncate text-xs text-gray-500">{(teacher.subjects ?? []).join(', ') || 'No subjects listed'}</p>
                    </div>
                    <div className="flex items-center gap-3 sm:w-72">
                      {monitor.isLoading ? (
                        <span className="text-xs text-gray-400">Loading…</span>
                      ) : hasWork ? (
                        <>
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                            <span className={`block h-full rounded-full ${BAR[progress!.status]}`} style={{ width: `${progress!.completionPercentage}%` }} />
                          </span>
                          <span className="w-10 text-right text-xs font-semibold text-gray-700">{progress!.completionPercentage}%</span>
                          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${cls}`}>{label}</span>
                          {(progress!.overdueCount ?? 0) > 0 && (
                            <span className="whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">{progress!.overdueCount} overdue</span>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-gray-500">No marks due in {monitor.termLabel}</span>
                      )}
                    </div>
                    {hasWork && progress!.missingEntries.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setOpen(expanded ? null : teacher.id)}
                        aria-expanded={expanded}
                        className="inline-flex items-center gap-1 self-start text-xs font-medium text-blue-700 hover:text-blue-900 sm:self-auto"
                      >
                        {progress!.missingEntries.length} missing {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    )}
                  </div>
                  {expanded && progress && (
                    <ul className="mt-3 space-y-1 rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
                      {progress.missingEntries.map(e => (
                        <li key={`${e.classId}|${e.subjectId}|${e.examType}`} className="flex flex-wrap justify-between gap-x-3">
                          <span>{e.className} · {e.subjectName} · {monitor.getExamName(e.examType)}</span>
                          <span className="text-gray-500">{e.missingStudentCount} of {e.totalStudentCount} learners without marks</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {monitor.isError && <p className="border-t border-gray-100 p-4 text-sm text-red-600">Results could not be loaded. Try Refresh.</p>}
      </div>
    </div>
  );
}
