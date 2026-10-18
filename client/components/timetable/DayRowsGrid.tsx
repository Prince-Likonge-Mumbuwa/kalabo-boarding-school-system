// @/components/timetable/DayRowsGrid.tsx
//
// A week as the school prints it: days as rows, periods as columns
// (P1–P4 | Break | P5–P8). A double or triple is one box spanning its
// periods. Optionally interactive (the timetable editor): click a lesson to
// pick it, click a highlighted place to move it there.

import { Fragment } from 'react';
import { Lock } from 'lucide-react';
import { SCHOOL_BELL } from '@/services/timetableModel';
import { cn } from '@/lib/utils';

export interface GridLesson {
  key: string;
  day: number;
  start: number;
  size: number;
  title: string;
  lines?: Array<string | null | undefined>;
  tone?: 'normal' | 'muted' | 'warn' | 'selected';
  locked?: boolean;
}

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
/** Grid column of a period (column 1 = day name, column 6 = break). */
const col = (p: number) => (p <= 4 ? p + 1 : p + 2);

const toneClass = {
  normal: 'bg-blue-50 border-blue-200 text-blue-950',
  muted: 'bg-gray-50 border-gray-200 text-gray-600',
  warn: 'bg-amber-50 border-amber-300 text-amber-950',
  selected: 'bg-blue-600 border-blue-700 text-white',
} as const;

export function DayRowsGrid({
  lessons,
  onLessonClick,
  onCellClick,
  targets,
  blocked,
  emptyLabel,
  className,
  ariaLabel = 'Weekly timetable',
}: {
  lessons: GridLesson[];
  onLessonClick?: (key: string) => void;
  onCellClick?: (day: number, period: number) => void;
  /** 'day:start' → place is allowed (green) or not (title explains). */
  targets?: Map<string, { ok: boolean; reason?: string }>;
  /** 'day:period' kept free by a school event → its name. */
  blocked?: Map<string, string>;
  emptyLabel?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const covered = new Set<string>();
  for (const l of lessons) for (let p = l.start; p < l.start + l.size; p++) covered.add(`${l.day}:${p}`);

  return (
    <div className={cn('overflow-x-auto rounded-xl border border-gray-200 bg-white', className)}>
      <div
        role="table"
        aria-label={ariaLabel}
        className="grid min-w-[790px] text-xs"
        style={{ gridTemplateColumns: '4rem repeat(4, minmax(6rem, 1fr)) 1.5rem repeat(4, minmax(6rem, 1fr))' }}
      >
        {/* Header */}
        <div role="columnheader" className="sticky left-0 z-10 bg-gray-50 border-b border-gray-200 px-2 py-2 font-semibold text-gray-600 uppercase text-[11px]" style={{ gridColumn: 1, gridRow: 1 }}>Day</div>
        {SCHOOL_BELL.map(b =>
          b.kind === 'lesson' ? (
            <div key={b.order} role="columnheader" className="bg-gray-50 border-b border-l border-gray-200 px-2 py-1.5 text-center" style={{ gridColumn: col(b.order), gridRow: 1 }}>
              <div className="font-semibold text-gray-800">{b.name}</div>
              <div className="text-[10px] text-gray-500">{b.startTime}–{b.endTime}</div>
            </div>
          ) : (
            <div key="break" role="columnheader" aria-label="Break" className="bg-amber-50 border-b border-l border-gray-200" style={{ gridColumn: 6, gridRow: 1 }} />
          ),
        )}

        {[1, 2, 3, 4, 5].map(day => (
          <Fragment key={day}>
            <div role="rowheader" className="sticky left-0 z-10 bg-white border-b border-gray-100 px-2 py-2 font-semibold text-gray-700 flex items-center" style={{ gridRow: day + 1, gridColumn: 1 }}>
              {DAY_SHORT[day - 1]}
            </div>
            <div aria-hidden className="bg-amber-50/70 border-b border-l border-gray-100 flex items-center justify-center" style={{ gridRow: day + 1, gridColumn: 6 }}>
              {day === 3 && <span className="text-[9px] font-semibold tracking-widest text-amber-700 [writing-mode:vertical-rl]">BREAK</span>}
            </div>
            {[1, 2, 3, 4, 5, 6, 7, 8].map(p => {
              if (covered.has(`${day}:${p}`)) return null;
              const t = targets?.get(`${day}:${p}`);
              const ev = blocked?.get(`${day}:${p}`);
              const clickable = !!onCellClick && !!t;
              return (
                <button
                  key={p}
                  type="button"
                  disabled={!clickable}
                  title={ev ?? (t && !t.ok ? t.reason : t?.ok ? 'Move here' : undefined)}
                  onClick={() => onCellClick?.(day, p)}
                  className={cn(
                    'min-h-[3.25rem] border-b border-l border-gray-100 text-[10px] text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500',
                    ev && 'bg-purple-50 text-purple-700',
                    t?.ok && 'bg-green-50 hover:bg-green-100 ring-1 ring-inset ring-green-300 cursor-pointer',
                  )}
                  style={{ gridRow: day + 1, gridColumn: col(p) }}
                >
                  {ev ?? (t?.ok ? 'Move here' : emptyLabel ?? '')}
                </button>
              );
            })}
            {lessons.filter(l => l.day === day).map(l => {
              const t = targets?.get(`${l.day}:${l.start}`);
              const swap = t?.ok;
              return (
                <div key={l.key} className="border-b border-l border-gray-100 p-1" style={{ gridRow: day + 1, gridColumn: `${col(l.start)} / span ${l.size}` }}>
                  <button
                    type="button"
                    onClick={() => (swap ? onCellClick?.(l.day, l.start) : onLessonClick?.(l.key))}
                    disabled={!onLessonClick && !swap}
                    title={swap ? 'Swap with this lesson' : t && !t.ok ? t.reason : undefined}
                    className={cn(
                      'h-full w-full rounded-md border px-1.5 py-1 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                      toneClass[l.tone ?? 'normal'],
                      swap && 'ring-2 ring-green-400',
                      (onLessonClick || swap) && 'cursor-pointer',
                    )}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="font-semibold leading-tight line-clamp-2 text-[11px] sm:text-xs">{l.title}</span>
                      {l.locked && <Lock size={11} className="mt-0.5 flex-shrink-0" aria-label="Locked" />}
                    </div>
                    {(l.lines ?? []).filter(Boolean).map((x, i) => (
                      <div key={i} className="text-[10px] leading-tight opacity-80 truncate">{x}</div>
                    ))}
                    {l.size > 1 && <div className="text-[10px] opacity-70">{l.size === 2 ? 'Double' : 'Triple'}</div>}
                    {swap && <div className="text-[10px] font-semibold text-green-700">Swap</div>}
                  </button>
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
