// HoD → Roll call: did each department teacher take the register for every
// lesson they taught on a day? Built on the same lesson-by-lesson day board
// as the admin's "Who's Teaching" (timetable + registers saved), so both
// always agree. A lesson counts as taught only when its register is saved.
import { useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { useSchoolDayBoard } from '@/hooks/useTimetable';
import { departmentRollCall } from '@/services/departmentService';
import { formatLocalYMD } from '@/services/schoolService';
import type { HodMember } from './types';

const shift = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + days);
  // skip weekends
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + (days < 0 ? -1 : 1));
  return formatLocalYMD(d);
};

const lessonLabel = (l: { row: { entry: { className: string; subject: string; periodIndex: number }; period: { name?: string } | null } }) =>
  `${l.row.period?.name ?? `P${l.row.entry.periodIndex}`} · ${l.row.entry.className} · ${l.row.entry.subject}`;

export function HodRollCallTab({ members }: { members: HodMember[] }) {
  const today = formatLocalYMD(new Date());
  const [date, setDate] = useState(today);
  const boardQ = useSchoolDayBoard(date);
  const rows = useMemo(() => departmentRollCall(boardQ.data, members), [boardQ.data, members]);
  const totals = rows.reduce((t, r) => ({ due: t.due + r.due, taken: t.taken + r.taken, missed: t.missed + r.missed.length }), { due: 0, taken: 0, missed: 0 });
  const board = boardQ.data;
  const closed = !!board && (board.dayOfWeek === null || !!board.holiday);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setDate(d => shift(d, -1))} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 hover:bg-gray-50" aria-label="Previous school day">
            <ChevronLeft size={16} />
          </button>
          <label className="relative">
            <span className="sr-only">Date</span>
            <CalendarDays size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="date" value={date} max={today} onChange={e => e.target.value && setDate(e.target.value)} className="h-9 rounded-lg border border-gray-300 pl-8 pr-2 text-sm" />
          </label>
          <button type="button" onClick={() => setDate(d => shift(d, 1))} disabled={date >= today} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40" aria-label="Next school day">
            <ChevronRight size={16} />
          </button>
          {date !== today && <button type="button" onClick={() => setDate(today)} className="text-xs font-medium text-blue-700 hover:underline">Today</button>}
        </div>
        <div className="flex items-center gap-3 text-sm">
          {!closed && !boardQ.isLoading && (
            <span className="font-semibold text-gray-900">{totals.taken} of {totals.due} registers taken{totals.missed ? <span className="ml-2 text-red-700">· {totals.missed} missed</span> : null}</span>
          )}
          <button type="button" onClick={() => boardQ.refetch()} disabled={boardQ.isFetching} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50" aria-label="Refresh">
            <RefreshCw size={14} className={boardQ.isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {boardQ.isLoading ? (
        <p className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" /> Loading the day's lessons…</p>
      ) : boardQ.isError ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Could not load the day's lessons. Try Refresh.</p>
      ) : closed ? (
        <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
          {board?.holiday ? `Holiday: ${board.holiday.name}. No lessons.` : 'No lessons on weekends.'}
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {rows.map(r => {
            const pct = r.due ? Math.round((r.taken / r.due) * 100) : 100;
            return (
              <li key={r.teacherId} className="p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-gray-900">
                      {r.teacherName}{r.onLeave && <span className="ml-2 text-xs text-amber-700">(on leave)</span>}
                    </p>
                    <p className="text-xs text-gray-500">
                      {r.due + r.later === 0 ? 'No timetabled lessons this day' : `${r.due} lesson${r.due === 1 ? '' : 's'} so far${r.later ? ` · ${r.later} later` : ''}`}
                    </p>
                  </div>
                  {r.due > 0 && (
                    <div className="flex items-center gap-3 sm:w-64">
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <span className={`block h-full rounded-full ${r.missed.length ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
                      </span>
                      <span className="whitespace-nowrap text-xs font-semibold text-gray-700">{r.taken}/{r.due}</span>
                    </div>
                  )}
                  {r.daily && (
                    <span className={`inline-flex items-center gap-1 self-start whitespace-nowrap rounded-full px-2 py-0.5 text-xs sm:self-auto ${r.daily.taken ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                      {r.daily.taken ? <Check size={12} /> : <Clock size={12} />} Daily register {r.daily.className}{r.daily.taken ? '' : ': not yet'}
                    </span>
                  )}
                </div>
                {(r.missed.length > 0 || r.running.length > 0) && (
                  <ul className="mt-2 space-y-1 text-xs">
                    {r.missed.map(l => (
                      <li key={`m${l.row.entry.slotId}${l.row.entry.periodIndex}`} className="flex items-center gap-1.5 text-red-700">
                        <XCircle size={12} /> {lessonLabel(l)} — {l.status === 'uncovered' ? 'no cover (teacher away)' : 'no register'}
                      </li>
                    ))}
                    {r.running.map(l => (
                      <li key={`r${l.row.entry.slotId}${l.row.entry.periodIndex}`} className="flex items-center gap-1.5 text-amber-700">
                        <Clock size={12} /> {lessonLabel(l)} — running, not marked yet
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
          {rows.length === 0 && <li className="p-4 text-sm text-gray-500">No teachers in the department yet.</li>}
        </ul>
      )}
      <p className="text-xs text-gray-500">From the approved timetables and the registers saved, as on the admin's "Who's Teaching". Covers are counted for the teacher covering.</p>
    </div>
  );
}
