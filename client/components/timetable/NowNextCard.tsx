// @/components/timetable/NowNextCard.tsx
//
// Teacher "Now & Next": the lesson I should be in now, where I go next,
// and today's lessons with their register status. Only lessons I teach
// TODAY (a cover counts on the days it runs). Re-checks the clock every
// 30 s without re-reading the database.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { ArrowRight, CalendarOff, CheckCircle2, Clock, Coffee, MapPin, AlertCircle } from 'lucide-react';
import { usePeriods, useTodayTimetable, useHolidayCovering } from '@/hooks/useTimetable';
import { attendanceService } from '@/services/attendanceService';
import { sessionMatchesRow, formatLocalYMD } from '@/services/timetableService';
import { groupIntoBlocks, nowAndNext, hhmmToMinutes, blockSizeName, type Block } from '@/services/timetableModel';
import { getCurrentAcademicTerm } from '@/utils/academicTerm';
import type { ResolvedTimetableEntry } from '@/types/timetable';

type Row = ResolvedTimetableEntry['entry'] & { resolved: ResolvedTimetableEntry };

export function registerLink(b: Block<Row>, date: string) {
  const p = new URLSearchParams({
    mode: 'periodic',
    class: b.classId,
    date,
    period: String(b.periodIndexes[0]),
  });
  return `/dashboard/teacher/attendance?${p.toString()}`;
}

export function NowNextCard() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const date = formatLocalYMD(now);
  const todayQ = useTodayTimetable(date);
  const periodsQ = usePeriods(getCurrentAcademicTerm(now).year);
  const holidayQ = useHolidayCovering(date);

  const rows: Row[] = useMemo(
    () => (todayQ.data ?? []).map(r => ({ ...r.entry, resolved: r })),
    [todayQ.data],
  );
  const blocks = useMemo(() => groupIntoBlocks(rows, periodsQ.data ?? []), [rows, periodsQ.data]);
  const classIds = useMemo(() => Array.from(new Set(rows.map(r => r.classId))), [rows]);

  const sessionQs = useQueries({
    queries: classIds.map(c => ({
      queryKey: ['attendance_sessions_for_date', c, date],
      queryFn: () => attendanceService.getSessionsForClassDate(c, date),
      staleTime: 30_000,
    })),
  });
  const sessions = sessionQs.flatMap(q => q.data ?? []);
  const taken = (b: Block<Row>) => b.rows.every(r => sessions.some(s => sessionMatchesRow(s as any, r)));

  const nn = nowAndNext(blocks, now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const weekend = now.getDay() === 0 || now.getDay() === 6;

  if (todayQ.isLoading || periodsQ.isLoading) {
    return <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500">Loading today’s lessons…</div>;
  }
  if (todayQ.error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Could not load today’s timetable.</div>;
  }
  if (holidayQ.data || weekend || blocks.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-3 text-sm text-gray-700">
        <CalendarOff size={18} className="text-gray-400" />
        {holidayQ.data ? `No lessons today — ${holidayQ.data.name}.` : weekend ? 'No lessons today.' : 'You have no lessons on your timetable today.'}
      </div>
    );
  }

  const cover = (b: Block<Row>) => {
    const r = b.rows[0].resolved;
    return r.isCoveredNow && r.ownerTeacherName
      ? `Cover for ${r.ownerTeacherName}${r.delegateUntil ? ` until ${r.delegateUntil.toLocaleDateString()}` : ''}`
      : null;
  };
  const venue = (b: Block<Row>) => b.rows.find(r => r.venue)?.venue ?? null;

  return (
    <div className="rounded-xl border border-blue-200 bg-white overflow-hidden">
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
        <div className="p-4">
          <div className="text-[11px] uppercase tracking-wide font-semibold text-blue-700 mb-1">Now</div>
          {nn.current ? (
            <>
              <div className="text-lg font-bold text-gray-900">{nn.current.className} · {nn.current.subject}</div>
              <div className="text-sm text-gray-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{nn.current.label}{nn.current.size > 1 ? ` (${blockSizeName(nn.current.size)})` : ''}</span>
                <span>ends {nn.current.endTime} · {nn.minutesLeft} min left</span>
                {venue(nn.current) && <span className="inline-flex items-center gap-1"><MapPin size={12} />{venue(nn.current)}</span>}
              </div>
              {cover(nn.current) && <div className="text-xs text-purple-700 mt-1">{cover(nn.current)}</div>}
              <div className="mt-2">
                {taken(nn.current) ? (
                  <span className="inline-flex items-center gap-1 text-sm text-green-700"><CheckCircle2 size={16} /> Register taken</span>
                ) : (
                  <Link to={registerLink(nn.current, date)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium">
                    Take register <ArrowRight size={14} />
                  </Link>
                )}
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-700 flex items-center gap-2">
              <Coffee size={16} className="text-gray-400" />
              {nn.dayOver ? 'Your lessons are over for today.' : 'Free period.'}
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="text-[11px] uppercase tracking-wide font-semibold text-gray-500 mb-1">Next</div>
          {nn.next ? (
            <>
              <div className="text-lg font-bold text-gray-900">{nn.next.className} · {nn.next.subject}</div>
              <div className="text-sm text-gray-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1"><Clock size={12} /> {nn.next.startTime} (in {nn.minutesToNext} min)</span>
                <span>{nn.next.label}</span>
                {venue(nn.next) && <span className="inline-flex items-center gap-1"><MapPin size={12} />{venue(nn.next)}</span>}
              </div>
              {cover(nn.next) && <div className="text-xs text-purple-700 mt-1">{cover(nn.next)}</div>}
            </>
          ) : (
            <div className="text-sm text-gray-500">No more lessons today.</div>
          )}
        </div>
      </div>

      <ul className="border-t border-gray-100 divide-y divide-gray-50">
        {blocks.map(b => {
          const done = taken(b);
          const ended = b.endTime ? nowMin >= hhmmToMinutes(b.endTime) : false;
          const isNow = nn.current === b;
          return (
            <li key={b.key} className={`px-4 py-2 flex items-center justify-between gap-2 text-sm ${isNow ? 'bg-blue-50/60' : ''}`}>
              <span className="min-w-0">
                <span className="font-medium text-gray-900">{b.startTime}</span>{' '}
                <span className="text-gray-700">{b.className} · {b.subject}</span>{' '}
                <span className="text-xs text-gray-500">{b.label}</span>
              </span>
              {done ? (
                <span className="text-green-700 inline-flex items-center gap-1 text-xs whitespace-nowrap"><CheckCircle2 size={14} /> Taken</span>
              ) : ended ? (
                <Link to={registerLink(b, date)} className="text-red-700 inline-flex items-center gap-1 text-xs whitespace-nowrap">
                  <AlertCircle size={14} /> Missed — take now
                </Link>
              ) : (
                <span className="text-xs text-gray-400 whitespace-nowrap">{isNow ? 'Now' : 'Later'}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
