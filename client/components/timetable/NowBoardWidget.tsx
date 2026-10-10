// @/components/timetable/NowBoardWidget.tsx
// Admin dashboard panel: today's lessons at a glance; links to the board.
import { Link } from 'react-router-dom';
import { ArrowRight, Clock, Loader2 } from 'lucide-react';
import { useSchoolDayBoard } from '@/hooks/useTimetable';
import { formatLocalYMD } from '@/services/timetableService';
import { summarizeBoard } from '@/services/timetableBoard';

export function NowBoardWidget() {
  const q = useSchoolDayBoard(formatLocalYMD(new Date()));
  const b = q.data;
  const s = summarizeBoard(b?.classes ?? []);
  const closed = !!b && (b.dayOfWeek === null || !!b.holiday);
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Clock size={16} /> Lessons today</h3>
        <Link to="/dashboard/admin/timetable-live" className="text-sm text-blue-600 inline-flex items-center gap-1">
          Who’s teaching <ArrowRight size={14} />
        </Link>
      </div>
      {q.isLoading ? (
        <Loader2 size={16} className="animate-spin text-gray-400" />
      ) : q.error ? (
        <p className="text-sm text-red-700">Could not load today’s lessons.</p>
      ) : closed ? (
        <p className="text-sm text-gray-600">{b?.holiday ? `No lessons — ${b.holiday.name}.` : 'No lessons today.'}</p>
      ) : s.lessons === 0 ? (
        <p className="text-sm text-gray-600">No approved timetables yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <Stat value={`${s.taken}/${s.lessons - s.upcoming}`} label="registers taken" cls="text-green-700" />
          <Stat value={s.inProgress} label="running, not marked" cls="text-amber-700" />
          <Stat value={s.missed} label="missed" cls="text-red-700" />
          <Stat value={s.uncovered} label="uncovered" cls="text-purple-700" />
        </div>
      )}
    </div>
  );
}

function Stat({ value, label, cls }: { value: string | number; label: string; cls: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-2 py-1.5">
      <div className={`text-lg font-bold ${cls}`}>{value}</div>
      <div className="text-[11px] text-gray-500">{label}</div>
    </div>
  );
}
