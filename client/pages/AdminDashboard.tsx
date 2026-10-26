// @/pages/AdminDashboard.tsx — the school's nerve centre.
//
//   ┌ dark band: school · live clock · term & week · 5 vital signs ─────────┐
//   │ NEEDS ATTENTION — only what's wrong, worst first, each opens the fix  │
//   ├ TODAY ──────────────┬ THIS TERM ───────────────┬ LEARNERS & SCHOOL ──┤
//   │ attendance, trend,  │ timeline, results entry, │ at risk, enrolment,  │
//   │ registers, lessons  │ pass-rate trend, forms,  │ sponsors, data       │
//   │ by period, staff    │ subjects                 │ quality, activity    │
//   └─────────────────────┴──────────────────────────┴──────────────────────┘
//
// Calculations: services/nerveCentre.ts (tested). Data: hooks/useNerveCentre.ts.
// "Head teacher" focus puts the term (performance) first; "Operations" puts
// today (registers, lessons, staff) first — remembered per browser.

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  CalendarClock,
  Check,
  ClipboardCheck,
  Copy,
  GraduationCap,
  HeartPulse,
  Megaphone,
  MessageCircle,
  Plus,
  RefreshCw,
  School,
  ShieldAlert,
  UserX,
  Users,
} from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { AnnouncementModal } from '@/components/AnnouncementModal';
import { useAuth } from '@/hooks/useAuth';
import { useNerveCentre } from '@/hooks/useNerveCentre';
import { pickTermConfig } from '@/services/resultsGrid';
import { countdownTo } from '@/services/resultsDeadlines';
import { unlistedSponsorNames } from '@/services/guidancePlan';
import {
  admittedSince,
  attendanceByDay,
  attendanceToday,
  buildAttention,
  dailyBrief,
  dataQuality,
  enrolmentByForm,
  examSetupProblems,
  formPerformance,
  latestTest,
  learnerAttendance,
  learnersAtRisk,
  lessonsFromBoard,
  resultsTrend,
  sponsorSplit,
  staffToday,
  subjectPerformance,
  termTimeline,
  EXAM_SHORT,
} from '@/services/nerveCentre';
import { AttentionStrip, Change, EnrolmentBars, LiveClock, MeterRow, Panel, Sparkline, Timeline, TrendChart, Vital, VIZ } from '@/components/nerve/NervePanels';
import { CountdownText } from '@/components/results/DeadlineCountdown';
import { cn } from '@/lib/utils';

const SCHOOL = 'Kalabo Boarding Secondary School';
type Focus = 'head' | 'ops';
const FOCUS_KEY = 'nerve-centre-focus';

function useMinuteTick() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const greeting = (d: Date) => (d.getHours() < 12 ? 'Good morning' : d.getHours() < 17 ? 'Good afternoon' : 'Good evening');
const ago = (d: Date | null, now: Date) => {
  if (!d) return '';
  const s = Math.max(0, Math.round((now.getTime() - d.getTime()) / 1000));
  return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const now = useMinuteTick();
  const nc = useNerveCentre(now);
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [copied, setCopied] = useState(false);
  const [focus, setFocus] = useState<Focus>(() => {
    try {
      return (localStorage.getItem(FOCUS_KEY) as Focus) || 'head';
    } catch {
      return 'head';
    }
  });
  const chooseFocus = (f: Focus) => {
    setFocus(f);
    try {
      localStorage.setItem(FOCUS_KEY, f);
    } catch {
      /* private window: not remembered */
    }
  };

  // ---------- derived ----------
  const classes = nc.classes.data ?? [];
  const learners = nc.learners.data ?? [];
  const regs = nc.registers.data ?? [];
  const board = nc.board.data;
  const schoolDay = !!board && board.dayOfWeek !== null && !board.holiday;

  const d = useMemo(() => {
    const att = nc.registers.data ? attendanceToday(regs, classes, nc.today) : null;
    const lessons = board ? lessonsFromBoard(board.classes, now) : null;
    const config = pickTermConfig((nc.configs.data ?? []) as any[], nc.term.term, nc.term.year) ?? null;
    const timeline = termTimeline({ start: nc.term.startDate, end: nc.term.endDate, today: now, config, holidays: nc.holidays.data ?? [] });
    const trend = resultsTrend(nc.rowsThis.data ?? [], nc.rowsLast.data ?? []);
    const latest = latestTest(trend);
    const forms = latest ? formPerformance(nc.rowsThis.data ?? [], latest.exam, classes) : [];
    const subjects = subjectPerformance(nc.rowsThis.data ?? []);
    const atRisk = nc.learners.data && nc.rowsThis.data ? learnersAtRisk(nc.rowsThis.data, learnerAttendance(regs), learners) : [];
    const staff = nc.teachers.data && nc.slots.data ? staffToday(nc.teachers.data, nc.slots.data, classes) : null;
    const examProblems = nc.configs.data ? examSetupProblems(nc.configs.data as any[], nc.term.label) : [];
    const enrol = enrolmentByForm(learners);
    const sponsors = sponsorSplit(learners, nc.sponsorList);
    const dq = dataQuality(learners, classes, nc.sponsorList);
    const unlisted = unlistedSponsorNames(learners as any, nc.sponsorList).reduce((n, u) => n + u.count, 0);
    const deadlines = (nc.monitor.deadlines ?? []).map(x => ({
      exam: x.examType,
      deadline: x.deadline,
      overdue: x.status.state === 'overdue',
      dueSoon: x.status.state === 'due-soon' || x.status.state === 'due-today',
      done: x.done,
      total: x.total,
      teachersBehind: nc.monitor.teacherProgress.filter(t => t.missingEntries.some(e => e.examType === x.examType)).length,
      teachersOverdue: x.teachersOverdue,
      countdown: x.deadline ? countdownTo(x.deadline, now)?.short.replace(/ \d+s$/, '') : undefined,
    }));
    const attention = buildAttention({
      now,
      schoolDay,
      holidayName: board?.holiday?.name ?? null,
      attendance: att,
      lessons,
      results: nc.monitor.isLoading ? null : { deadlines },
      examProblems,
      staff,
      smsFailedWeek: nc.sms.data ?? 0,
      sponsorNamesNotListed: unlisted,
      sponsorCodesExpiring: nc.codes.data ?? 0,
      atRisk: atRisk.length,
      noGuardianPhone: dq.find(q => q.id === 'phone')?.count ?? 0,
    });
    return { att, lessons, config, timeline, trend, latest, forms, subjects, atRisk, staff, enrol, sponsors, dq, deadlines, attention };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nc.registers.data, nc.classes.data, nc.learners.data, board, nc.configs.data, nc.holidays.data, nc.rowsThis.data, nc.rowsLast.data, nc.teachers.data, nc.slots.data, nc.sponsorList, nc.monitor.deadlines, nc.monitor.teacherProgress, nc.monitor.isLoading, nc.sms.data, nc.codes.data, now, schoolDay]);

  const openDeadline = d.deadlines.find(x => x.total > 0 && x.done < x.total) ?? null;
  const brief = dailyBrief({ schoolName: SCHOOL, date: now, termLabel: nc.term.label, week: d.timeline.week, attendance: d.att, attention: d.attention, latest: d.latest });
  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(brief);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  // ---------- columns ----------
  const today = (
    <div className="space-y-4">
      <Panel title="Attendance today" icon={<HeartPulse size={16} className="text-rose-500" />} to="/dashboard/admin/attendance-overview" loading={nc.registers.isLoading || nc.classes.isLoading} error={nc.registers.error}>
        {!schoolDay && board ? (
          <p className="text-sm text-slate-600">{board.holiday ? `No school today — ${board.holiday.name}.` : 'No school today.'}</p>
        ) : d.att && d.att.total > 0 ? (
          <div className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-4xl font-bold tabular-nums text-slate-900">{d.att.pct}%</p>
                <p className="text-xs text-slate-600">{d.att.present} of {d.att.total} learners in school</p>
                <Change value={d.att.change} label="last week" />
              </div>
              <div className="w-44 shrink-0">
                <Sparkline points={attendanceByDay(regs, 10)} />
                <p className="text-right text-[10px] text-slate-400">last 10 school days</p>
              </div>
            </div>
            {d.att.lowest && <p className="text-xs text-slate-600">Lowest today: <strong>{d.att.lowest.className}</strong> at {d.att.lowest.pct}%</p>}
            <div>{d.att.byForm.map(f => <MeterRow key={f.form} label={f.form} value={f.pct} />)}</div>
          </div>
        ) : (
          <p className="text-sm text-slate-600">No daily registers taken yet today.</p>
        )}
        {d.att && schoolDay && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <MeterRow label="Registers" value={d.att.registersDue ? Math.round((d.att.registersTaken / d.att.registersDue) * 100) : null} right={`${d.att.registersTaken}/${d.att.registersDue}`} color="#334155" />
            {d.att.notTaken.length > 0 && <p className="mt-1 text-xs text-slate-500">Not yet: {d.att.notTaken.slice(0, 8).map(c => c.name).join(', ')}{d.att.notTaken.length > 8 ? '…' : ''}</p>}
          </div>
        )}
      </Panel>

      <Panel title="Lessons today" icon={<CalendarClock size={16} className="text-blue-600" />} to="/dashboard/admin/timetable-live" toLabel="Who's teaching" loading={nc.board.isLoading} error={nc.board.error}>
        {!schoolDay ? (
          <p className="text-sm text-slate-600">No lessons today.</p>
        ) : !d.lessons || d.lessons.total === 0 ? (
          <p className="text-sm text-slate-600">No published timetable for today.</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2 text-center">
              <Stat value={`${d.lessons.taken}/${d.lessons.started}`} label="registers" />
              <Stat value={d.lessons.inProgress} label="running, unmarked" tone={d.lessons.inProgress ? 'warn' : undefined} />
              <Stat value={d.lessons.missed} label="missed" tone={d.lessons.missed ? 'bad' : undefined} />
              <Stat value={d.lessons.uncoveredNow.length + d.lessons.uncoveredLater.length} label="no teacher" tone={d.lessons.uncoveredNow.length + d.lessons.uncoveredLater.length ? 'bad' : undefined} />
            </div>
            <div className="flex gap-1" role="list" aria-label="Lessons by period">
              {d.lessons.byPeriod.map(p => {
                const bad = p.missed + p.uncovered;
                const cls = p.isPast ? (bad ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800') : p.isNow ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500';
                return (
                  <div key={p.period} role="listitem" title={`${p.period} ${p.start}–${p.end}: ${p.taken}/${p.lessons} registers${p.missed ? `, ${p.missed} missed` : ''}${p.uncovered ? `, ${p.uncovered} with no teacher` : ''}`} className={cn('flex-1 rounded-md px-1 py-1.5 text-center', cls)}>
                    <div className="text-[11px] font-bold">{p.period}</div>
                    <div className="text-[10px] tabular-nums">{p.isPast || p.isNow ? `${p.taken}/${p.lessons}` : p.lessons}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Staff" icon={<Users size={16} className="text-slate-600" />} to="/dashboard/admin/teachers" loading={nc.teachers.isLoading || nc.slots.isLoading} error={nc.teachers.error || nc.slots.error}>
        {d.staff && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Fact label="Teachers" value={d.staff.teachers} />
            <Fact label="On leave" value={d.staff.onLeave.length} sub={d.staff.onLeave.slice(0, 3).join(', ')} tone={d.staff.onLeave.length ? 'warn' : undefined} />
            <Fact label="Covers running" value={d.staff.coversLive} sub="subjects taught by a cover / TP" />
            <Fact label="No teacher" value={d.staff.vacant.length} sub={d.staff.vacant.slice(0, 2).map(v => `${v.className} ${v.subject}`).join(', ')} tone={d.staff.vacant.length ? 'bad' : undefined} />
          </div>
        )}
      </Panel>
    </div>
  );

  const term = (
    <div className="space-y-4">
      <Panel title="Term" icon={<CalendarClock size={16} className="text-indigo-600" />} to="/dashboard/admin/exams" toLabel="Exam set-up" loading={nc.configs.isLoading}>
        <Timeline t={d.timeline} termLabel={nc.term.label} />
      </Panel>

      <Panel title="Results entry" icon={<ClipboardCheck size={16} className="text-blue-600" />} to="/dashboard/admin/results-monitor" toLabel="Monitor" loading={nc.monitor.isLoading} error={nc.monitor.error}>
        {d.deadlines.length === 0 ? (
          <p className="text-sm text-slate-600">No tests are set up for {nc.term.label}. <Link to="/dashboard/admin/exams" className="text-blue-700 underline">Set them up</Link>.</p>
        ) : (
          <ul className="space-y-3">
            {d.deadlines.map(x => {
              const p = x.total ? Math.round((x.done / x.total) * 100) : 0;
              return (
                <li key={x.exam}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium text-slate-900">{EXAM_SHORT[x.exam]}</span>
                    <span className="text-xs tabular-nums text-slate-600">{x.done}/{x.total} · <strong className="text-slate-900">{p}%</strong></span>
                  </div>
                  <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${p}%`, background: p === 100 ? '#059669' : VIZ.s1 }} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs">
                    {p === 100 ? (
                      <span className="text-emerald-700">Complete</span>
                    ) : x.deadline ? (
                      <CountdownText deadline={x.deadline} label="Results" />
                    ) : (
                      <span className="text-slate-500">No deadline set</span>
                    )}
                    {x.teachersOverdue > 0 && <Link to="/dashboard/admin/results-monitor?status=overdue" className="text-rose-700 underline">{x.teachersOverdue} teachers overdue</Link>}
                    {!x.teachersOverdue && x.teachersBehind > 0 && p < 100 && x.deadline && <span className="text-slate-500">{x.teachersBehind} teachers not finished</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Performance" icon={<BarChart3 size={16} className="text-emerald-600" />} to="/dashboard/admin/results-analysis" toLabel="Analysis" loading={nc.rowsThis.isLoading} error={nc.rowsThis.error}>
        <p className="mb-1 text-xs text-slate-600">Pass rate (marks of 40% and above) test by test — {nc.term.label} beside {nc.prev.label}</p>
        <TrendChart trend={d.trend} />
        {d.latest && (
          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
            <Stat value={d.latest.thisTerm.passRate !== null ? `${d.latest.thisTerm.passRate}%` : '—'} label={`pass, ${d.latest.label}`} />
            <Stat value={d.latest.thisTerm.qualityRate !== null ? `${d.latest.thisTerm.qualityRate}%` : '—'} label="quality (70%+)" />
            <Stat value={d.latest.thisTerm.mean !== null ? `${d.latest.thisTerm.mean}%` : '—'} label="average mark" />
          </div>
        )}
        {d.forms.length > 0 && (
          <div className="mt-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">By form · {d.latest?.label}</p>
            {d.forms.map(f => <MeterRow key={f.form} label={f.form} value={f.passRate} right={f.passRate !== null ? `${f.passRate}% pass` : '—'} />)}
          </div>
        )}
        {d.subjects.length >= 2 && (
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="mb-1 font-semibold uppercase tracking-wide text-slate-500">Strongest</p>
              {d.subjects.slice(0, 3).map(s => <p key={s.subject} className="flex justify-between gap-2"><span className="truncate">{s.subject}</span><span className="font-semibold tabular-nums">{s.mean}%</span></p>)}
            </div>
            <div>
              <p className="mb-1 font-semibold uppercase tracking-wide text-slate-500">Weakest</p>
              {d.subjects.slice(-3).reverse().map(s => <p key={s.subject} className="flex justify-between gap-2"><span className="truncate">{s.subject}</span><span className="font-semibold tabular-nums">{s.mean}%</span></p>)}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );

  // Two-up while this column spans the full width (laptops); one column on very wide screens.
  const school = (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2 2xl:grid-cols-1">
      <Panel id="at-risk" title="Learners at risk" icon={<ShieldAlert size={16} className="text-rose-500" />} to="/dashboard/admin/results-analysis" toLabel="Analysis" loading={nc.rowsThis.isLoading || nc.learners.isLoading}>
        <p className="mb-2 text-xs text-slate-600">Failing 3 or more subjects this term, or attendance below 80%.</p>
        {d.atRisk.length === 0 ? (
          <p className="text-sm text-emerald-700">No learner is at risk on these measures.</p>
        ) : (
          <>
            <p className="mb-2 text-3xl font-bold tabular-nums text-slate-900">{d.atRisk.length}</p>
            <ul className="divide-y divide-slate-100">
              {d.atRisk.slice(0, 6).map(l => (
                <li key={l.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                  <span className="min-w-0"><span className="block truncate font-medium text-slate-900">{l.name}</span><span className="text-xs text-slate-500">{l.className}</span></span>
                  <span className="shrink-0 text-right text-xs text-rose-700">{l.reasons.join(' · ')}</span>
                </li>
              ))}
            </ul>
            {d.atRisk.length > 6 && <p className="mt-1 text-xs text-slate-500">and {d.atRisk.length - 6} more</p>}
          </>
        )}
      </Panel>

      <Panel title="Enrolment" icon={<School size={16} className="text-slate-600" />} to="/dashboard/admin/classes" loading={nc.learners.isLoading} error={nc.learners.error}>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="text-3xl font-bold tabular-nums text-slate-900">{learners.length}</p>
            <p className="text-xs text-slate-600">learners in {classes.filter(c => c.isActive !== false).length} classes</p>
          </div>
          <p className="text-right text-xs text-slate-600"><strong className="text-slate-900">{admittedSince(learners, nc.term.startDate)}</strong> admitted this term</p>
        </div>
        <EnrolmentBars rows={d.enrol} />
        {d.sponsors.length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Sponsors</p>
            <div className="flex flex-wrap gap-1.5">
              {d.sponsors.map(s => (
                <Link key={s.name} to="/dashboard/admin/guidance" className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-100">
                  {s.name} <strong className="tabular-nums">{s.count}</strong>
                </Link>
              ))}
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Data quality" icon={<UserX size={16} className="text-amber-600" />} loading={nc.learners.isLoading}>
        <ul className="space-y-1.5">
          {d.dq.map(q => (
            <li key={q.id}>
              <Link to={q.to} className="flex items-center justify-between gap-2 rounded px-1 py-0.5 text-sm hover:bg-slate-50">
                <span className="min-w-0"><span className="block truncate text-slate-800">{q.label}</span><span className="block text-[11px] text-slate-500">{q.why}</span></span>
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', q.count ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700')}>{q.count ? q.count : <Check size={12} />}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Recent activity" icon={<Activity size={16} className="text-slate-600" />} to="/dashboard/admin/audit-trail" toLabel="Audit trail" loading={nc.activity.isLoading} error={nc.activity.error}>
        {(nc.activity.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">No recent changes.</p>
        ) : (
          <ol className="relative space-y-2 border-l border-slate-200 pl-3">
            {(nc.activity.data ?? []).slice(0, 8).map(a => (
              <li key={a.id} className="text-xs">
                <span className="absolute -left-[5px] mt-1 h-2 w-2 rounded-full bg-slate-300" aria-hidden="true" />
                <p className="text-slate-800">{a.summary}</p>
                <p className="text-slate-400">{ago(a.at, now)}</p>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );

  const lessonsVital = d.lessons && schoolDay && d.lessons.total > 0;
  const uncovered = d.lessons ? d.lessons.uncoveredNow.length + d.lessons.uncoveredLater.length : 0;

  return (
    <DashboardLayout activeTab="dashboard">
      <div className="min-h-screen bg-slate-100/70 p-3 sm:p-4 lg:p-6">
        {/* ===== Command band ===== */}
        <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-4 text-white shadow-lg sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-200">
                <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" /></span>
                Live · {SCHOOL}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{greeting(now)}, {user?.fullName?.split(' ')[0] || 'Admin'}</h1>
              <p className="mt-0.5 text-sm text-slate-300">
                {nc.term.label} · week {d.timeline.week} · {d.timeline.daysLeft} days to the end of term
                {board?.holiday ? ` · ${board.holiday.name}` : board && board.dayOfWeek === null ? ' · weekend' : ''}
              </p>
            </div>
            <LiveClock />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Vital
              label="Present today"
              to="/dashboard/admin/attendance-overview"
              loading={nc.registers.isLoading}
              value={d.att?.pct !== null && d.att?.pct !== undefined ? `${d.att.pct}%` : '—'}
              sub={d.att?.change !== null && d.att?.change !== undefined ? `${d.att.change >= 0 ? '▲ +' : '▼ '}${d.att.change} vs last week` : schoolDay ? 'waiting for registers' : 'no school today'}
              tone={d.att?.pct !== null && d.att?.pct !== undefined ? (d.att.pct >= 90 ? 'good' : d.att.pct >= 80 ? 'warn' : 'bad') : 'default'}
            />
            <Vital
              label="Daily registers"
              to="/dashboard/admin/attendance-overview"
              loading={nc.registers.isLoading}
              value={d.att ? `${d.att.registersTaken}/${d.att.registersDue}` : '—'}
              sub={d.att && d.att.notTaken.length ? `${d.att.notTaken.length} not taken yet` : schoolDay ? 'all taken' : '—'}
              tone={schoolDay && d.att && d.att.notTaken.length ? (now.getHours() >= 10 ? 'bad' : 'warn') : 'default'}
            />
            <Vital
              label="Lessons"
              to="/dashboard/admin/timetable-live"
              loading={nc.board.isLoading}
              value={lessonsVital ? `${d.lessons!.taken}/${d.lessons!.started}` : '—'}
              sub={lessonsVital ? (uncovered ? `${uncovered} with no teacher` : d.lessons!.missed ? `${d.lessons!.missed} registers missed` : 'registers taken / started') : schoolDay ? 'no timetable' : 'no lessons today'}
              tone={uncovered ? 'bad' : d.lessons?.missed ? 'warn' : 'default'}
            />
            <Vital
              label={openDeadline ? `${EXAM_SHORT[openDeadline.exam]} results` : 'Results entry'}
              to={openDeadline?.overdue ? '/dashboard/admin/results-monitor?status=overdue' : '/dashboard/admin/results-monitor'}
              loading={nc.monitor.isLoading}
              value={openDeadline ? `${Math.round((openDeadline.done / openDeadline.total) * 100)}%` : `${nc.monitor.summary.overallCompletion}%`}
              sub={openDeadline?.deadline ? <CountdownText deadline={openDeadline.deadline} className="!text-slate-200" /> : openDeadline ? 'no deadline set' : 'all entered'}
              tone={openDeadline?.overdue ? 'bad' : openDeadline?.dueSoon ? 'warn' : 'default'}
            />
            <Vital
              label={d.latest ? `Pass rate · ${d.latest.label}` : 'Pass rate'}
              to="/dashboard/admin/results-analysis"
              loading={nc.rowsThis.isLoading}
              value={d.latest?.thisTerm.passRate !== null && d.latest?.thisTerm.passRate !== undefined ? `${d.latest.thisTerm.passRate}%` : '—'}
              sub={d.latest && d.latest.lastTerm.passRate !== null && d.latest.thisTerm.passRate !== null
                ? `${d.latest.thisTerm.passRate - d.latest.lastTerm.passRate >= 0 ? '▲ +' : '▼ '}${d.latest.thisTerm.passRate - d.latest.lastTerm.passRate} vs ${nc.prev.label}`
                : 'no marks yet'}
              tone={d.latest?.thisTerm.passRate !== null && d.latest?.thisTerm.passRate !== undefined ? (d.latest.thisTerm.passRate >= 70 ? 'good' : d.latest.thisTerm.passRate >= 50 ? 'warn' : 'bad') : 'default'}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => navigate('/dashboard/admin/classes?action=create')} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 font-medium hover:bg-white/20"><Plus size={14} /> Class</button>
              <button type="button" onClick={() => setShowAnnouncement(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 font-medium hover:bg-white/20"><Megaphone size={14} /> Announce</button>
              <button type="button" onClick={copyBrief} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 font-medium hover:bg-white/20">{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Brief copied' : 'Copy daily brief'}</button>
              <a href={`https://wa.me/?text=${encodeURIComponent(brief)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 font-medium hover:bg-emerald-500"><MessageCircle size={14} /> Brief on WhatsApp</a>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <div className="inline-flex rounded-lg bg-white/10 p-0.5" role="group" aria-label="Dashboard focus">
                {(['head', 'ops'] as Focus[]).map(f => (
                  <button key={f} type="button" aria-pressed={focus === f} onClick={() => chooseFocus(f)} className={cn('rounded-md px-2.5 py-1 font-medium', focus === f ? 'bg-white text-slate-900' : 'text-slate-200 hover:text-white')}>
                    {f === 'head' ? 'Head teacher' : 'Operations'}
                  </button>
                ))}
              </div>
              <span>Updated {ago(nc.updatedAt, now)}</span>
              <button type="button" onClick={() => nc.refresh()} aria-label="Refresh" className="rounded-lg bg-white/10 p-1.5 hover:bg-white/20">
                <RefreshCw size={14} className={nc.isFetching ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </section>

        {/* ===== Needs attention ===== */}
        <div className="mt-4">
          <AttentionStrip items={d.attention} loading={nc.registers.isLoading || nc.board.isLoading || nc.monitor.isLoading} />
        </div>

        {/* ===== Columns ===== */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          <div className={focus === 'ops' ? 'order-1' : 'order-2'}>{today}</div>
          <div className={focus === 'ops' ? 'order-2' : 'order-1'}>{term}</div>
          <div className="order-3 lg:col-span-2 2xl:col-span-1">{school}</div>
        </div>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-400">
          <GraduationCap size={12} /> Lessons refresh every minute, registers every 2 minutes, results every 3 minutes.
        </p>
      </div>

      <AnnouncementModal
        isOpen={showAnnouncement}
        onClose={() => setShowAnnouncement(false)}
        senderName={user?.fullName || 'Admin'}
        senderUid={user?.uid || ''}
        onSuccess={summary => {
          console.log('Announcement sent:', summary);
        }}
      />
    </DashboardLayout>
  );
}

function Stat({ value, label, tone }: { value: React.ReactNode; label: string; tone?: 'warn' | 'bad' }) {
  return (
    <div className="rounded-lg bg-slate-50 px-1 py-1.5">
      <div className={cn('text-lg font-bold tabular-nums', tone === 'bad' ? 'text-rose-700' : tone === 'warn' ? 'text-amber-700' : 'text-slate-900')}>{value}</div>
      <div className="text-[10px] leading-tight text-slate-500">{label}</div>
    </div>
  );
}

function Fact({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: 'warn' | 'bad' }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn('text-2xl font-bold tabular-nums', tone === 'bad' ? 'text-rose-700' : tone === 'warn' ? 'text-amber-700' : 'text-slate-900')}>{value}</p>
      {sub && <p className="truncate text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}
