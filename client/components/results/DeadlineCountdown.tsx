// @/components/results/DeadlineCountdown.tsx
//
// A live countdown to a results-entry deadline, to the second:
//
//     WEEK 8 RESULTS DUE IN   [ 02 ] [ 14 ] [ 37 ] [ 09 ]
//                              days   hrs    min    sec
//
// Blue with more than 3 days left, amber within 3 days, red (pulsing) in the
// last 24 hours. After the deadline it turns red and counts UP: "OVERDUE BY".
// The deadline is the end of the day the admin set (Exam Management).

import { useEffect, useState, type ReactNode } from 'react';
import { AlarmClock, AlertTriangle } from 'lucide-react';
import { countdownTo, formatDay, two } from '@/services/resultsDeadlines';
import { cn } from '@/lib/utils';

/** The current time, updated every `ms` (default each second). */
export function useNow(ms = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const STYLE = {
  calm: { box: 'border-blue-200 bg-gradient-to-r from-blue-50 to-sky-50', tile: 'bg-blue-700 text-white', text: 'text-blue-900', sub: 'text-blue-700' },
  soon: { box: 'border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50', tile: 'bg-amber-600 text-white', text: 'text-amber-900', sub: 'text-amber-800' },
  urgent: { box: 'border-red-300 bg-gradient-to-r from-red-50 to-rose-50', tile: 'bg-red-600 text-white', text: 'text-red-900', sub: 'text-red-700' },
  overdue: { box: 'border-red-400 bg-gradient-to-r from-red-100 to-rose-100', tile: 'bg-red-700 text-white', text: 'text-red-900', sub: 'text-red-800' },
} as const;

export function DeadlineCountdown({
  deadline,
  title,
  detail,
  action,
  size = 'large',
  now: nowProp,
  className,
}: {
  /** 'YYYY-MM-DD' — on time until the end of that day. */
  deadline: string;
  /** e.g. "Week 8 results" */
  title: string;
  /** e.g. "12 marks still to enter in 3 classes" */
  detail?: ReactNode;
  /** e.g. an "Enter now" button */
  action?: ReactNode;
  size?: 'large' | 'compact';
  /** For tests; otherwise the clock ticks every second. */
  now?: Date;
  className?: string;
}) {
  const ticking = useNow(1000);
  const now = nowProp ?? ticking;
  const c = countdownTo(deadline, now);
  if (!c) return null;
  const s = STYLE[c.urgency];
  const big = size === 'large';
  const due = formatDay(deadline, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const tiles: Array<[number, string]> = [
    [c.days, c.days === 1 ? 'day' : 'days'],
    [c.hours, 'hrs'],
    [c.minutes, 'min'],
    [c.seconds, 'sec'],
  ];

  return (
    <section
      aria-label={`${title}: ${c.overdue ? 'overdue' : 'deadline'} countdown`}
      className={cn('rounded-xl border shadow-sm', s.box, big ? 'p-4 sm:p-5' : 'p-3', className)}
    >
      <div className={cn('flex flex-col gap-3', big ? 'lg:flex-row lg:items-center lg:justify-between' : 'sm:flex-row sm:items-center sm:justify-between')}>
        <div className="min-w-0">
          <p className={cn('flex items-center gap-1.5 font-bold uppercase tracking-wide', s.text, big ? 'text-sm sm:text-base' : 'text-xs')}>
            {c.overdue ? <AlertTriangle size={big ? 18 : 14} /> : <AlarmClock size={big ? 18 : 14} className={c.urgency === 'urgent' ? 'animate-pulse' : ''} />}
            {title} {c.overdue ? 'overdue by' : 'due in'}
          </p>
          <p className={cn('mt-0.5', s.sub, big ? 'text-sm' : 'text-xs')}>
            {c.overdue ? 'The deadline was' : 'Deadline:'} end of {due}
          </p>
          {detail && <div className={cn('mt-1', s.text, big ? 'text-sm' : 'text-xs')}>{detail}</div>}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* The clock. The live digits are hidden from screen readers (they
              would be read out every second); the label gives the gist. */}
          <div role="timer" aria-label={c.spoken} className="flex items-start gap-1.5 sm:gap-2">
            {tiles.map(([n, label], i) => (
              <div key={label} className="flex items-start gap-1.5 sm:gap-2" aria-hidden="true">
                <div className="flex flex-col items-center">
                  <span
                    data-testid={`countdown-${label.replace(/s$/, '')}`}
                    className={cn(
                      'rounded-lg text-center font-mono font-bold tabular-nums shadow-inner',
                      s.tile,
                      big ? 'min-w-[3.25rem] px-2 py-1.5 text-2xl sm:min-w-[3.75rem] sm:text-3xl' : 'min-w-[2.5rem] px-1.5 py-1 text-lg',
                      c.urgency === 'urgent' && label === 'sec' && 'animate-pulse',
                    )}
                  >
                    {i === 0 ? String(n) : two(n)}
                  </span>
                  <span className={cn('mt-0.5 font-medium uppercase', s.sub, big ? 'text-[11px]' : 'text-[10px]')}>{label}</span>
                </div>
                {i < tiles.length - 1 && <span className={cn('font-bold', s.text, big ? 'pt-1.5 text-2xl sm:text-3xl' : 'pt-1 text-lg')}>:</span>}
              </div>
            ))}
          </div>
          {action}
        </div>
      </div>
    </section>
  );
}

/** Inline live countdown text: "Week 8 due in 2d 14h 37m 09s" / "overdue by …". */
export function CountdownText({ deadline, label, now: nowProp, className }: { deadline: string; label?: string; now?: Date; className?: string }) {
  const ticking = useNow(1000);
  const c = countdownTo(deadline, nowProp ?? ticking);
  if (!c) return null;
  const tone = c.urgency === 'overdue' || c.urgency === 'urgent' ? 'text-red-700' : c.urgency === 'soon' ? 'text-amber-800' : 'text-blue-800';
  return (
    <span role="timer" aria-label={`${label ? `${label} ` : ''}${c.spoken}`} className={cn('font-semibold', tone, className)}>
      <span aria-hidden="true">
        {label ? `${label} ` : ''}
        {c.overdue ? 'overdue by ' : 'due in '}
        <span className="font-mono tabular-nums">{c.short}</span>
      </span>
    </span>
  );
}
