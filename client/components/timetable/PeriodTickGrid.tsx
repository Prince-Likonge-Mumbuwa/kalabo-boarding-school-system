// @/components/timetable/PeriodTickGrid.tsx
//
// Tick-box grid for ONE subject: days across, lesson periods down. Ticked
// periods next to each other become a double / triple automatically.
// Locked boxes show why (another subject of the class, or the teacher is
// in another class then).

import { Check, Lock } from 'lucide-react';
import type { Period } from '@/types/timetable';
import { bellOrder, DAY_SHORT, WEEKDAYS, type Weekday } from '@/services/timetableModel';

export function PeriodTickGrid({
  periods,
  ticked,
  blockers,
  onToggle,
  disabled = false,
}: {
  periods: Period[];
  /** Keys `${day}:${periodOrder}`. */
  ticked: Set<string>;
  blockers: Map<string, string>;
  onToggle: (key: string) => void;
  disabled?: boolean;
}) {
  const bell = bellOrder(periods);
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full border-collapse table-fixed min-w-[320px]" role="grid">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="w-16 sm:w-24 px-2 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase">Period</th>
            {WEEKDAYS.map(d => (
              <th key={d} className="px-1 py-2 text-center text-[11px] font-semibold text-gray-600 uppercase">
                {DAY_SHORT[d - 1]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bell.map(p =>
            p.kind !== 'lesson' ? (
              <tr key={p.id} className="bg-gray-50/70">
                <td colSpan={6} className="px-2 py-0.5 text-[10px] text-gray-500 uppercase tracking-wide">
                  {p.name} · {p.startTime}–{p.endTime}
                </td>
              </tr>
            ) : (
              <tr key={p.id} className="border-t border-gray-100">
                <td className="px-2 py-1">
                  <div className="text-xs font-semibold text-gray-800">{p.name}</div>
                  <div className="text-[10px] text-gray-500 hidden sm:block">{p.startTime}–{p.endTime}</div>
                </td>
                {WEEKDAYS.map((d: Weekday) => {
                  const key = `${d}:${p.order}`;
                  const on = ticked.has(key);
                  const why = blockers.get(key);
                  const locked = !!why && !on;
                  return (
                    <td key={key} className="p-0.5 text-center">
                      <button
                        type="button"
                        aria-label={`${DAY_SHORT[d - 1]} ${p.name}${on ? ' ticked' : ''}${locked ? ` locked: ${why}` : ''}`}
                        aria-pressed={on}
                        title={why}
                        disabled={disabled || locked}
                        onClick={() => onToggle(key)}
                        className={`w-full min-h-[40px] rounded-md border text-[10px] leading-tight px-0.5 flex flex-col items-center justify-center transition-colors ${
                          on
                            ? why
                              ? 'bg-red-600 border-red-700 text-white'
                              : 'bg-blue-600 border-blue-700 text-white'
                            : locked
                              ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                              : 'bg-white border-gray-300 hover:border-blue-400 hover:bg-blue-50'
                        }`}
                      >
                        {on ? <Check size={16} strokeWidth={3} /> : locked ? <Lock size={11} /> : null}
                        {why && <span className="truncate max-w-full">{why}</span>}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}
