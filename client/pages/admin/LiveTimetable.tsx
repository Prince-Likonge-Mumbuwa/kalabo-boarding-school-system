// @/pages/admin/LiveTimetable.tsx
//
// Admin "Who's teaching": every class, every lesson of a day, who teaches it
// (cover worked out for that date) and whether its register was taken.
// The register is the evidence a lesson happened. Refreshes every minute.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useSchoolDayBoard, useTeacherCoverage } from '@/hooks/useTimetable';
import { UncoveredPeriodsTable, PeriodChip } from '@/components/timetable/TimetableShared';
import { formatLocalYMD, type BoardLesson, type BoardStatus } from '@/services/timetableService';
import { lessonPeriods, lessonPeriodAt, dayName } from '@/services/timetableModel';
import { summarizeBoard, classesInPeriod, teacherDay, STATUS_LABEL } from '@/services/timetableBoard';
import { ArrowLeft, CalendarOff, Loader2, MapPin, RefreshCw, Search } from 'lucide-react';

const STATUS_CLASS: Record<BoardStatus, string> = {
  taken: 'bg-green-50 text-green-800 border-green-200',
  'in-progress': 'bg-amber-50 text-amber-800 border-amber-200',
  missed: 'bg-red-50 text-red-800 border-red-200',
  uncovered: 'bg-purple-50 text-purple-800 border-purple-200',
  upcoming: 'bg-gray-50 text-gray-600 border-gray-200',
};

function Teacher({ l }: { l: BoardLesson }) {
  const r = l.row;
  return (
    <span>
      {r.operatorTeacherName ?? <em className="text-gray-500">nobody</em>}
      {r.isCoveredNow && r.ownerTeacherName && (
        <span className="text-purple-700"> (cover for {r.ownerTeacherName})</span>
      )}
      {l.status === 'uncovered' && r.ownerTeacherName && !r.isCoveredNow && (
        <span className="text-purple-700"> (on leave, no cover)</span>
      )}
    </span>
  );
}

export default function LiveTimetable() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const today = formatLocalYMD(now);
  const [date, setDate] = useState(today);
  const [view, setView] = useState<'period' | 'day'>('period');
  const [period, setPeriod] = useState<number | null>(null);
  const [q, setQ] = useState('');

  const boardQ = useSchoolDayBoard(date);
  const teacherQ = useTeacherCoverage(date);
  const board = boardQ.data;
  const lessons = useMemo(() => lessonPeriods(board?.periods ?? []), [board?.periods]);

  // Follow the clock on today's board until the admin picks a period.
  const auto = date === today ? lessonPeriodAt(board?.periods ?? [], now) : null;
  const shown = period ?? auto?.period.order ?? lessons[0]?.order ?? null;
  const summary = summarizeBoard(board?.classes ?? []);
  const found = teacherDay(board?.classes ?? [], q);

  return (
    <DashboardLayout activeTab="live-timetable">
      <div className="p-3 sm:p-6 lg:p-8 space-y-4 max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link to="/dashboard/admin/attendance-overview" className="text-xs text-blue-600 inline-flex items-center gap-1 mb-1">
              <ArrowLeft size={12} /> Attendance &amp; Timetable
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Who’s teaching</h1>
            <p className="text-sm text-gray-600">
              Lessons from approved timetables, with cover. A lesson counts as taught when its register is taken.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={date}
              onChange={e => { setDate(e.target.value || today); setPeriod(null); }}
              className="border border-gray-300 rounded-lg px-2 py-2 text-sm"
            />
            <button onClick={() => boardQ.refetch()} className="p-2 rounded-lg border border-gray-300 text-gray-600" aria-label="Refresh">
              <RefreshCw size={16} className={boardQ.isFetching ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {boardQ.isLoading ? (
          <div className="flex items-center gap-2 text-gray-500 text-sm py-10 justify-center"><Loader2 className="animate-spin" size={18} /> Loading…</div>
        ) : boardQ.error ? (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg p-3">Could not load: {(boardQ.error as Error).message}</div>
        ) : !board || board.dayOfWeek === null || board.holiday ? (
          <div className="rounded-xl border border-gray-200 bg-white p-6 flex items-center gap-3 text-gray-700">
            <CalendarOff className="text-gray-400" />
            {board?.holiday ? `No lessons — ${board.holiday.name}.` : 'No lessons on weekends.'}
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
              {[
                ['Registers taken', `${summary.taken}/${summary.lessons - summary.upcoming}`, 'text-green-700'],
                ['Running, not marked', summary.inProgress, 'text-amber-700'],
                ['Missed', summary.missed, 'text-red-700'],
                ['Uncovered', summary.uncovered, 'text-purple-700'],
                ['Later today', summary.upcoming, 'text-gray-700'],
                ['Daily registers', `${summary.dailyTaken}/${summary.classes}`, 'text-blue-700'],
              ].map(([label, value, cls]) => (
                <div key={label as string} className="bg-white border border-gray-200 rounded-xl px-3 py-2">
                  <div className={`text-xl font-bold ${cls}`}>{value}</div>
                  <div className="text-[11px] text-gray-500">{label}</div>
                </div>
              ))}
            </div>

            {/* Teacher lookup */}
            <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <Search size={14} className="text-gray-400" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Where is… (teacher name)" className="flex-1 outline-none" />
              </label>
              {found.map(t => {
                const nowL = date === today ? t.lessons.find(l => auto?.running && l.row.entry.periodIndex === auto.period.order) : null;
                return (
                  <div key={t.teacher} className="text-sm border-t border-gray-100 pt-2">
                    <div className="font-semibold text-gray-900">
                      {t.teacher}
                      {date === today && (
                        <span className="font-normal text-gray-600">
                          {' — '}{nowL ? `now in ${nowL.row.entry.className} (${nowL.row.entry.subject})` : 'not in a lesson right now'}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {t.lessons.map(l => (
                        <span key={l.row.entry.id + l.row.entry.periodIndex} className={`text-[11px] border rounded px-1.5 py-0.5 ${STATUS_CLASS[l.status]}`}>
                          {l.row.period?.name} {l.row.entry.className} {l.row.entry.subject}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
              {q.trim().length >= 2 && found.length === 0 && <p className="text-xs text-gray-500">No lessons for that name on {dayName(board.dayOfWeek)}.</p>}
            </div>

            {/* View switch + period picker */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="bg-white rounded-lg border border-gray-200 p-0.5 inline-flex">
                {(['period', 'day'] as const).map(v => (
                  <button key={v} onClick={() => setView(v)} className={`px-3 py-1.5 rounded-md text-sm ${view === v ? 'bg-blue-600 text-white' : 'text-gray-600'}`}>
                    {v === 'period' ? 'One period' : 'Whole day'}
                  </button>
                ))}
              </div>
              {view === 'period' && (
                <div className="flex flex-wrap gap-1" role="group" aria-label="Period">
                  {lessons.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setPeriod(p.order)}
                      className={`px-2 py-1 rounded-md text-xs border ${shown === p.order ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 text-gray-700'}`}
                    >
                      {p.name}{auto?.running && auto.period.order === p.order ? ' • now' : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {view === 'period' && shown !== null && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2 border-b border-gray-100 text-sm text-gray-700 flex items-center gap-2">
                  <PeriodChip period={lessons.find(p => p.order === shown) ?? null} />
                  {lessons.find(p => p.order === shown)?.startTime}–{lessons.find(p => p.order === shown)?.endTime}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
                      <tr>
                        <th className="text-left px-3 py-2">Class</th>
                        <th className="text-left px-3 py-2">Subject</th>
                        <th className="text-left px-3 py-2">Teacher</th>
                        <th className="text-left px-3 py-2">Room</th>
                        <th className="text-left px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {classesInPeriod(board.classes, shown).map(({ cls, lesson }) => (
                        <tr key={cls.classId}>
                          <td className="px-3 py-2 font-medium text-gray-900">{cls.className}</td>
                          {lesson ? (
                            <>
                              <td className="px-3 py-2">{lesson.row.entry.subject}</td>
                              <td className="px-3 py-2"><Teacher l={lesson} /></td>
                              <td className="px-3 py-2 text-gray-600">
                                {lesson.row.entry.venue ? <span className="inline-flex items-center gap-1"><MapPin size={12} />{lesson.row.entry.venue}</span> : '—'}
                              </td>
                              <td className="px-3 py-2">
                                <span className={`text-xs border rounded-full px-2 py-0.5 ${STATUS_CLASS[lesson.status]}`}>
                                  {STATUS_LABEL[lesson.status]}{lesson.markedByName && lesson.status === 'taken' ? ` · ${lesson.markedByName}` : ''}
                                </span>
                              </td>
                            </>
                          ) : (
                            <td colSpan={4} className="px-3 py-2 text-gray-400">Free / not on the timetable</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {view === 'day' && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
                <table className="text-xs min-w-full">
                  <thead className="bg-gray-50 text-[11px] uppercase text-gray-500">
                    <tr>
                      <th className="text-left px-2 py-2 sticky left-0 bg-gray-50">Class</th>
                      <th className="text-left px-2 py-2">Daily</th>
                      {lessons.map(p => <th key={p.id} className="text-left px-2 py-2">{p.name}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {board.classes.map(c => (
                      <tr key={c.classId}>
                        <td className="px-2 py-1.5 font-medium text-gray-900 sticky left-0 bg-white">{c.className}</td>
                        <td className="px-2 py-1.5">
                          <span className={`border rounded px-1.5 py-0.5 ${c.dailyTaken ? STATUS_CLASS.taken : STATUS_CLASS.missed}`}>
                            {c.dailyTaken ? '✓' : '✗'}
                          </span>
                        </td>
                        {lessons.map(p => {
                          const l = c.lessons.find(x => x.row.entry.periodIndex === p.order);
                          return (
                            <td key={p.id} className="px-1 py-1">
                              {l ? (
                                <div
                                  title={`${l.row.entry.subject} — ${l.row.operatorTeacherName ?? 'nobody'} — ${STATUS_LABEL[l.status]}`}
                                  className={`border rounded px-1.5 py-0.5 whitespace-nowrap ${STATUS_CLASS[l.status]}`}
                                >
                                  {l.row.entry.subject.slice(0, 10)}
                                  <div className="text-[10px] opacity-75">{(l.row.operatorTeacherName ?? '—').split(' ').slice(-1)[0]}</div>
                                </div>
                              ) : <span className="text-gray-300">·</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-800">By teacher (lessons that have started)</h2>
              <UncoveredPeriodsTable rows={teacherQ.data ?? []} loading={teacherQ.isLoading} />
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
