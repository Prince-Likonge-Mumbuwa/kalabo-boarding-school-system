// @/services/nerveCentre.ts
//
// The admin dashboard — the school's nerve centre. Pure calculations (no
// Firebase), so every number can be tested:
//
//   attention        what needs the admin NOW (registers not taken, lessons
//                    with no teacher, results overdue, set-up gaps…), worst first
//   today            attendance today vs a week ago, registers, by form
//   term             timeline (week N, test dates, deadlines, holidays),
//                    pass rate test by test vs last term, forms, subjects
//   at risk          learners failing several subjects or often absent
//   school           enrolment by form, admissions, sponsors, data quality
//   brief            a short text summary to copy or send on WhatsApp
//
// Loading is in nerveCentreLoader.ts; the screen in pages/AdminDashboard.tsx.

import { gradeForPercentage } from '@/services/resultsGrid';
import { resolveSponsor, SELF_SPONSORED, type SponsorList } from '@/services/guidancePlan';
import type { ExamConfig, ExamType } from '@/types/exam';
import type { BoardClass } from '@/services/timetableService';

// ==================== SHARED ====================

export type Severity = 'critical' | 'warning' | 'info';

export interface AttentionItem {
  id: string;
  severity: Severity;
  /** e.g. "Registers" */
  area: string;
  /** One line, e.g. "3 classes haven't taken today's register". */
  title: string;
  /** Names / details, e.g. "Form 2B, 3A, 4C". */
  detail?: string;
  /** Where the admin fixes it. */
  to: string;
}

export interface ClassLite {
  id: string;
  name: string;
  type?: string | null;
  level?: number | null;
  formTeacherId?: string | null;
  isActive?: boolean;
}

export interface LearnerLite {
  id: string;
  fullName: string;
  studentId?: string;
  classId?: string;
  className?: string;
  classLevel?: number | null;
  gender?: string | null;
  status?: string | null;
  dateOfBirth?: string | null;
  guardianPhone?: string | null;
  parentPhone?: string | null;
  sponsor?: string | null;
  dateOfFirstEntry?: string | null;
  createdAt?: Date | null;
}

export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const parseYMD = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "Form 2B, Form 3A, Form 4C" → at most `max` names, then "and N more". */
export const nameList = (names: string[], max = 4) =>
  names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} and ${names.length - max} more`;

/** "Form 1", "Grade 10"… for a class or learner. */
export function formLabel(x: { name?: string; className?: string; type?: string | null; level?: number | null; classLevel?: number | null }): string {
  const name = x.name ?? x.className ?? '';
  const m = /^\s*(form|grade)\s*(\d+)/i.exec(name);
  if (m) return `${m[1][0].toUpperCase()}${m[1].slice(1).toLowerCase()} ${Number(m[2])}`;
  const level = x.level ?? x.classLevel;
  const t = String(x.type ?? '').toLowerCase();
  if (typeof level === 'number' && level > 0) return `${t === 'form' ? 'Form' : 'Grade'} ${level}`;
  return 'Other';
}
const formOrder = (label: string) => {
  const m = /^(Form|Grade) (\d+)$/.exec(label);
  return m ? (m[1] === 'Form' ? 0 : 100) + Number(m[2]) : 999;
};
export const compareForms = (a: string, b: string) => formOrder(a) - formOrder(b) || a.localeCompare(b);

// ==================== ATTENDANCE ====================

export interface DailyRegister {
  classId: string;
  className: string;
  date: string;
  summary: { total: number; present: number; absent: number; late: number; excused: number };
  roster?: Record<string, string>;
}

/** Present = present + late (late learners are in school). */
const inSchool = (s: DailyRegister['summary']) => (s.present || 0) + (s.late || 0);

export interface AttendanceToday {
  /** Daily registers taken today / active classes. */
  registersTaken: number;
  registersDue: number;
  notTaken: ClassLite[];
  present: number;
  total: number;
  pct: number | null;
  /** The same weekday last week, for comparison. */
  lastWeekPct: number | null;
  change: number | null;
  lowest: { className: string; pct: number } | null;
  byForm: Array<{ form: string; present: number; total: number; pct: number | null }>;
}

export function attendanceToday(regs: DailyRegister[], classes: ClassLite[], today: string): AttendanceToday {
  const active = classes.filter(c => c.isActive !== false);
  const todays = regs.filter(r => r.date === today);
  const taken = new Set(todays.map(r => r.classId));
  const present = todays.reduce((n, r) => n + inSchool(r.summary), 0);
  const total = todays.reduce((n, r) => n + (r.summary.total || 0), 0);
  const lastWeek = ymd(addDays(parseYMD(today), -7));
  const lw = regs.filter(r => r.date === lastWeek);
  const lwPct = pct(lw.reduce((n, r) => n + inSchool(r.summary), 0), lw.reduce((n, r) => n + (r.summary.total || 0), 0));
  const todayPct = pct(present, total);
  const lowest = todays
    .filter(r => r.summary.total > 0)
    .map(r => ({ className: r.className, pct: Math.round((inSchool(r.summary) / r.summary.total) * 100) }))
    .sort((a, b) => a.pct - b.pct || a.className.localeCompare(b.className))[0] ?? null;
  const classById = new Map(classes.map(c => [c.id, c]));
  const forms = new Map<string, { present: number; total: number }>();
  for (const r of todays) {
    const f = formLabel(classById.get(r.classId) ?? { name: r.className });
    const e = forms.get(f) ?? { present: 0, total: 0 };
    e.present += inSchool(r.summary);
    e.total += r.summary.total || 0;
    forms.set(f, e);
  }
  return {
    registersTaken: active.filter(c => taken.has(c.id)).length,
    registersDue: active.length,
    notTaken: active.filter(c => !taken.has(c.id)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    present,
    total,
    pct: todayPct,
    lastWeekPct: lwPct,
    change: todayPct !== null && lwPct !== null ? todayPct - lwPct : null,
    lowest,
    byForm: [...forms.entries()]
      .map(([form, v]) => ({ form, ...v, pct: pct(v.present, v.total) }))
      .sort((a, b) => compareForms(a.form, b.form)),
  };
}

/** School attendance % per school day (days with registers), oldest first. */
export function attendanceByDay(regs: DailyRegister[], lastDays = 10): Array<{ date: string; pct: number }> {
  const by = new Map<string, { p: number; t: number }>();
  for (const r of regs) {
    const e = by.get(r.date) ?? { p: 0, t: 0 };
    e.p += inSchool(r.summary);
    e.t += r.summary.total || 0;
    by.set(r.date, e);
  }
  return [...by.entries()]
    .filter(([, v]) => v.t > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-lastDays)
    .map(([date, v]) => ({ date, pct: Math.round((v.p / v.t) * 100) }));
}

/** Per learner: days in school / days a daily register was taken for them. */
export function learnerAttendance(regs: DailyRegister[]): Map<string, { present: number; total: number }> {
  const m = new Map<string, { present: number; total: number }>();
  for (const r of regs) {
    for (const [id, st] of Object.entries(r.roster ?? {})) {
      const e = m.get(id) ?? { present: 0, total: 0 };
      e.total++;
      if (st === 'present' || st === 'late') e.present++;
      m.set(id, e);
    }
  }
  return m;
}

// ==================== RESULTS ====================

export interface ResultRow {
  studentId: string;
  classId: string;
  subjectId: string;
  examType: string;
  marks: number;
  totalMarks?: number;
  percentage?: number;
}

const percentOf = (r: ResultRow): number | null => {
  if (typeof r.marks !== 'number' || r.marks < 0) return null; // absent / not conducted
  if (typeof r.percentage === 'number' && r.percentage >= 0) return r.percentage;
  if (typeof r.totalMarks === 'number' && r.totalMarks > 0) return (r.marks / r.totalMarks) * 100;
  return null;
};

export interface TestStats {
  n: number;
  /** % of marks at 40% or more (grades 1–8). */
  passRate: number | null;
  /** % of marks at 70% or more (grades 1–2). */
  qualityRate: number | null;
  mean: number | null;
}

export function testStats(rows: ResultRow[]): TestStats {
  const ps = rows.map(percentOf).filter((p): p is number => p !== null);
  const n = ps.length;
  return {
    n,
    passRate: pct(ps.filter(p => Math.round(p) >= 40).length, n),
    qualityRate: pct(ps.filter(p => Math.round(p) >= 70).length, n),
    mean: n ? Math.round(ps.reduce((a, b) => a + b, 0) / n) : null,
  };
}

export const EXAM_SHORT: Record<ExamType, string> = { week4: 'Week 4', week8: 'Week 8', endOfTerm: 'End of Term' };
const EXAMS: ExamType[] = ['week4', 'week8', 'endOfTerm'];

export interface TrendPoint {
  exam: ExamType;
  label: string;
  thisTerm: TestStats;
  lastTerm: TestStats;
}

/** Pass rate, quality and mean for each test, this term beside last term. */
export function resultsTrend(thisRows: ResultRow[], lastRows: ResultRow[]): TrendPoint[] {
  return EXAMS.map(exam => ({
    exam,
    label: EXAM_SHORT[exam],
    thisTerm: testStats(thisRows.filter(r => r.examType === exam)),
    lastTerm: testStats(lastRows.filter(r => r.examType === exam)),
  }));
}

/** The latest test of the term that has marks. */
export const latestTest = (trend: TrendPoint[]) => [...trend].reverse().find(p => p.thisTerm.n > 0) ?? null;

/** Pass rate by form for one test. */
export function formPerformance(rows: ResultRow[], exam: ExamType, classes: ClassLite[]): Array<{ form: string } & TestStats> {
  const classById = new Map(classes.map(c => [c.id, c]));
  const by = new Map<string, ResultRow[]>();
  for (const r of rows) {
    if (r.examType !== exam) continue;
    const c = classById.get(r.classId);
    if (!c) continue;
    const f = formLabel(c);
    by.set(f, [...(by.get(f) ?? []), r]);
  }
  return [...by.entries()].map(([form, rs]) => ({ form, ...testStats(rs) })).sort((a, b) => compareForms(a.form, b.form));
}

/** Mean % and pass rate per subject across the term so far; at least `minMarks` marks. */
export function subjectPerformance(rows: ResultRow[], minMarks = 10): Array<{ subject: string } & TestStats> {
  const by = new Map<string, ResultRow[]>();
  for (const r of rows) by.set(r.subjectId, [...(by.get(r.subjectId) ?? []), r]);
  return [...by.entries()]
    .map(([subject, rs]) => ({ subject, ...testStats(rs) }))
    .filter(s => s.n >= minMarks && s.mean !== null)
    .sort((a, b) => b.mean! - a.mean! || a.subject.localeCompare(b.subject));
}

// ==================== LEARNERS AT RISK ====================

export interface AtRiskLearner {
  id: string;
  name: string;
  className: string;
  /** Subjects whose term average is below 40% (grade 9). */
  failing: string[];
  attendancePct: number | null;
  daysMarked: number;
  reasons: string[];
  /** Higher = more worrying (for ordering). */
  score: number;
}

export const AT_RISK = { failingSubjects: 3, attendanceBelow: 80, minDays: 5 } as const;

/**
 * Active learners who fail several subjects this term (term average below
 * 40% in at least AT_RISK.failingSubjects subjects), or whose attendance is
 * below AT_RISK.attendanceBelow % over at least AT_RISK.minDays registers.
 */
export function learnersAtRisk(rows: ResultRow[], attendance: Map<string, { present: number; total: number }>, learners: LearnerLite[]): AtRiskLearner[] {
  const bySubject = new Map<string, Map<string, number[]>>(); // learner → subject → %s
  for (const r of rows) {
    const p = percentOf(r);
    if (p === null) continue;
    const m = bySubject.get(r.studentId) ?? new Map<string, number[]>();
    m.set(r.subjectId, [...(m.get(r.subjectId) ?? []), p]);
    bySubject.set(r.studentId, m);
  }
  const out: AtRiskLearner[] = [];
  for (const l of learners) {
    if (l.status && l.status !== 'active') continue;
    const subj = bySubject.get(l.id) ?? (l.studentId ? bySubject.get(l.studentId) : undefined);
    const failing = subj
      ? [...subj.entries()].filter(([, ps]) => gradeForPercentage(ps.reduce((a, b) => a + b, 0) / ps.length) === 9).map(([s]) => s).sort()
      : [];
    const a = attendance.get(l.id);
    const attendancePct = a && a.total > 0 ? Math.round((a.present / a.total) * 100) : null;
    const lowAttendance = a !== undefined && a.total >= AT_RISK.minDays && attendancePct !== null && attendancePct < AT_RISK.attendanceBelow;
    const failingMany = failing.length >= AT_RISK.failingSubjects;
    if (!failingMany && !lowAttendance) continue;
    const reasons: string[] = [];
    if (failingMany) reasons.push(`failing ${plural(failing.length, 'subject')}`);
    if (lowAttendance) reasons.push(`attendance ${attendancePct}%`);
    out.push({
      id: l.id,
      name: l.fullName,
      className: l.className ?? '',
      failing,
      attendancePct,
      daysMarked: a?.total ?? 0,
      reasons,
      score: failing.length * 10 + (lowAttendance ? 100 - (attendancePct ?? 100) : 0),
    });
  }
  return out.sort((x, y) => y.score - x.score || x.name.localeCompare(y.name));
}

// ==================== TERM TIMELINE ====================

export interface TimelineMarker {
  date: string;
  label: string;
  kind: 'test' | 'deadline' | 'holiday';
  /** Position along the term, 0–100. */
  pos: number;
  past: boolean;
}

export interface TermTimeline {
  week: number;
  totalWeeks: number;
  /** 0–100 */
  elapsed: number;
  daysLeft: number;
  markers: TimelineMarker[];
  /** The next marker still ahead, if any. */
  next: TimelineMarker | null;
}

export function termTimeline(input: {
  start: Date;
  end: Date;
  today: Date;
  config?: Partial<ExamConfig> | null;
  holidays?: Array<{ name: string; startDate: string; endDate?: string }>;
}): TermTimeline {
  const start = new Date(input.start.getFullYear(), input.start.getMonth(), input.start.getDate());
  const end = new Date(input.end.getFullYear(), input.end.getMonth(), input.end.getDate());
  const today = new Date(input.today.getFullYear(), input.today.getMonth(), input.today.getDate());
  const span = Math.max(1, (end.getTime() - start.getTime()) / 86_400_000);
  const posOf = (d: Date) => Math.max(0, Math.min(100, ((d.getTime() - start.getTime()) / 86_400_000 / span) * 100));
  const dayIndex = Math.floor((today.getTime() - start.getTime()) / 86_400_000);
  const markers: TimelineMarker[] = [];
  const add = (dateStr: string | null | undefined, label: string, kind: TimelineMarker['kind']) => {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return;
    const d = parseYMD(dateStr);
    if (d < start || d > end) return;
    markers.push({ date: dateStr.slice(0, 10), label, kind, pos: posOf(d), past: d < today });
  };
  const c = input.config;
  if (c) {
    for (const e of EXAMS) {
      if (c.examTypes && c.examTypes[e] === false) continue;
      add(c[`${e}Date` as 'week4Date'] as string | undefined, `${EXAM_SHORT[e]} test`, 'test');
      add(c[`${e}Deadline` as 'week4Deadline'] as string | undefined, `${EXAM_SHORT[e]} results due`, 'deadline');
    }
  }
  for (const h of input.holidays ?? []) add(h.startDate, h.name, 'holiday');
  markers.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
  return {
    week: Math.max(1, Math.floor(Math.max(0, dayIndex) / 7) + 1),
    totalWeeks: Math.max(1, Math.ceil((span + 1) / 7)),
    elapsed: Math.round(posOf(today)),
    daysLeft: Math.max(0, Math.round((end.getTime() - today.getTime()) / 86_400_000)),
    markers,
    next: markers.find(m => !m.past) ?? null,
  };
}

// ==================== STAFF ====================

export interface TeacherLite {
  id: string;
  name: string;
  status?: string | null;
}

export interface SlotLite {
  classId: string;
  className?: string;
  subject: string;
  ownerTeacherId: string | null;
  isFormTeacherSlot?: boolean;
  /** 'live' when a cover / TP teacher is teaching it now. */
  delegationState?: string | null;
  operatorTeacherName?: string | null;
}

export interface StaffToday {
  teachers: number;
  onLeave: string[];
  /** Class subjects taught by a cover / TP teacher now. */
  coversLive: number;
  /** Class subjects in active classes with no teacher. */
  vacant: SlotLite[];
  classesWithoutFormTeacher: ClassLite[];
}

export function staffToday(teachers: TeacherLite[], slots: SlotLite[], classes: ClassLite[]): StaffToday {
  const active = new Set(classes.filter(c => c.isActive !== false).map(c => c.id));
  const subjectSlots = slots.filter(s => !s.isFormTeacherSlot && active.has(s.classId));
  return {
    teachers: teachers.filter(t => t.status !== 'inactive' && t.status !== 'transferred').length,
    onLeave: teachers.filter(t => t.status === 'on_leave').map(t => t.name).sort(),
    coversLive: subjectSlots.filter(s => s.delegationState === 'live').length,
    vacant: subjectSlots.filter(s => !s.ownerTeacherId).sort((a, b) => (a.className ?? '').localeCompare(b.className ?? '', undefined, { numeric: true }) || a.subject.localeCompare(b.subject)),
    classesWithoutFormTeacher: classes.filter(c => c.isActive !== false && !c.formTeacherId).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
  };
}

// ==================== EXAM SET-UP ====================

/** Problems with the term's exam configuration, in words (empty = fine). */
export function examSetupProblems(configs: Array<Partial<ExamConfig>>, termLabel: string): string[] {
  const active = configs.filter(c => c.isActive !== false);
  if (!active.length) return [`No exam configuration for ${termLabel}: teachers have no tests to enter.`];
  const out: string[] = [];
  if (active.length > 1) out.push(`${termLabel} has ${active.length} exam configurations; only the newest is used. Delete or merge the others.`);
  const c = active[0];
  const on = EXAMS.filter(e => c.examTypes?.[e] && ((c[`${e}TotalMarks` as 'week4TotalMarks'] as number | undefined) ?? 0) > 0);
  const noDeadline = on.filter(e => !c[`${e}Deadline` as 'week4Deadline']);
  if (noDeadline.length) out.push(`No results deadline for ${noDeadline.map(e => EXAM_SHORT[e]).join(', ')}: teachers see no countdown.`);
  return out;
}

// ==================== SCHOOL ====================

export interface FormEnrolment {
  form: string;
  boys: number;
  girls: number;
  other: number;
  total: number;
}

export function enrolmentByForm(learners: LearnerLite[]): FormEnrolment[] {
  const by = new Map<string, FormEnrolment>();
  for (const l of learners) {
    if (l.status && l.status !== 'active') continue;
    const f = formLabel(l);
    const e = by.get(f) ?? { form: f, boys: 0, girls: 0, other: 0, total: 0 };
    const g = String(l.gender ?? '').toLowerCase();
    if (g === 'male' || g === 'm') e.boys++;
    else if (g === 'female' || g === 'f') e.girls++;
    else e.other++;
    e.total++;
    by.set(f, e);
  }
  return [...by.values()].sort((a, b) => compareForms(a.form, b.form));
}

/** Learners who joined on or after the term started. */
export function admittedSince(learners: LearnerLite[], since: Date): number {
  const s = ymd(since);
  return learners.filter(l => (!l.status || l.status === 'active') && ((l.dateOfFirstEntry && l.dateOfFirstEntry.slice(0, 10) >= s) || (!l.dateOfFirstEntry && l.createdAt && l.createdAt >= since))).length;
}

export function sponsorSplit(learners: LearnerLite[], list: SponsorList): Array<{ name: string; count: number }> {
  const by = new Map<string, number>();
  for (const l of learners) {
    if (l.status && l.status !== 'active') continue;
    const n = resolveSponsor(l.sponsor, list) ?? SELF_SPONSORED;
    by.set(n, (by.get(n) ?? 0) + 1);
  }
  return [...by.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => (a.name === SELF_SPONSORED ? 1 : b.name === SELF_SPONSORED ? -1 : b.count - a.count || a.name.localeCompare(b.name)));
}

export interface DataQualityItem {
  id: string;
  label: string;
  count: number;
  why: string;
  to: string;
}

export function dataQuality(learners: LearnerLite[], classes: ClassLite[], list: SponsorList): DataQualityItem[] {
  const act = learners.filter(l => !l.status || l.status === 'active');
  const noPhone = act.filter(l => !String(l.guardianPhone ?? '').trim() && !String(l.parentPhone ?? '').trim()).length;
  const noDob = act.filter(l => !/^\d{4}-\d{2}-\d{2}/.test(String(l.dateOfBirth ?? ''))).length;
  const sponsorNotListed = act.filter(l => {
    const s = String(l.sponsor ?? '').trim();
    return s !== '' && s !== SELF_SPONSORED && !list.names.includes(s);
  }).length;
  const noFormTeacher = classes.filter(c => c.isActive !== false && !c.formTeacherId).length;
  return [
    { id: 'phone', label: 'No guardian phone', count: noPhone, why: 'their results SMS cannot be sent', to: '/dashboard/admin/classes' },
    { id: 'dob', label: 'No date of birth', count: noDob, why: 'needed for exam registration', to: '/dashboard/admin/classes' },
    { id: 'sponsor', label: 'Sponsor field not tidied', count: sponsorNotListed, why: 'counted as self-sponsored', to: '/dashboard/admin/guidance' },
    { id: 'formteacher', label: 'Classes without a form teacher', count: noFormTeacher, why: 'nobody takes the daily register', to: '/dashboard/admin/classes' },
  ];
}

// ==================== LESSONS (from the day board) ====================

export interface LessonsToday {
  total: number;
  taken: number;
  /** Lessons that have started (registers that could be taken). */
  started: number;
  inProgress: number;
  missed: number;
  uncoveredNow: Array<{ className: string; subject: string; period: string }>;
  uncoveredLater: Array<{ className: string; subject: string; period: string }>;
  /** Lessons per period, for the day strip: [periodName, taken, due, uncovered]. */
  byPeriod: Array<{ period: string; start: string; end: string; lessons: number; taken: number; missed: number; uncovered: number; isNow: boolean; isPast: boolean }>;
}

const hm = (t: string | undefined) => {
  const [h, m] = String(t ?? '').split(':').map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};

/** Lesson status for the day, split by whether each period is now, past or later. */
export function lessonsFromBoard(classes: BoardClass[], now: Date): LessonsToday {
  const mins = now.getHours() * 60 + now.getMinutes();
  const all = classes.flatMap(c => c.lessons.map(l => ({ c, l })));
  const when = (l: (typeof all)[number]['l']) => {
    const s = hm(l.row.period?.startTime);
    const e = hm(l.row.period?.endTime);
    if (s === null || e === null) return 'later' as const;
    return mins >= e ? ('past' as const) : mins >= s ? ('now' as const) : ('later' as const);
  };
  const desc = (x: (typeof all)[number]) => ({ className: x.c.className, subject: x.l.row.entry.subject, period: x.l.row.period?.name ?? `P${x.l.row.entry.periodIndex}` });
  const periods = new Map<string, LessonsToday['byPeriod'][number]>();
  for (const x of all) {
    const p = x.l.row.period;
    const key = p?.name ?? `P${x.l.row.entry.periodIndex}`;
    const w = when(x.l);
    const e = periods.get(key) ?? { period: key, start: p?.startTime ?? '', end: p?.endTime ?? '', lessons: 0, taken: 0, missed: 0, uncovered: 0, isNow: w === 'now', isPast: w === 'past' };
    e.lessons++;
    if (x.l.status === 'taken') e.taken++;
    if (x.l.status === 'missed') e.missed++;
    if (x.l.status === 'uncovered') e.uncovered++;
    periods.set(key, e);
  }
  return {
    total: all.length,
    taken: all.filter(x => x.l.status === 'taken').length,
    started: all.filter(x => x.l.status !== 'upcoming' && !(x.l.status === 'uncovered' && when(x.l) === 'later')).length,
    inProgress: all.filter(x => x.l.status === 'in-progress').length,
    missed: all.filter(x => x.l.status === 'missed').length,
    uncoveredNow: all.filter(x => x.l.status === 'uncovered' && when(x.l) === 'now').map(desc),
    uncoveredLater: all.filter(x => x.l.status === 'uncovered' && when(x.l) === 'later').map(desc),
    byPeriod: [...periods.values()].sort((a, b) => a.start.localeCompare(b.start)),
  };
}

// ==================== ATTENTION ====================

export interface AttentionInput {
  now: Date;
  schoolDay: boolean;
  holidayName?: string | null;
  attendance?: AttendanceToday | null;
  lessons?: {
    total: number;
    uncoveredNow: Array<{ className: string; subject: string; period: string }>;
    uncoveredLater: Array<{ className: string; subject: string; period: string }>;
    missed: number;
  } | null;
  results?: {
    deadlines: Array<{ exam: ExamType; deadline: string | null; overdue: boolean; dueSoon: boolean; done: number; total: number; teachersBehind: number; teachersOverdue: number; countdown?: string }>;
  } | null;
  examProblems?: string[];
  staff?: StaffToday | null;
  smsFailedWeek?: number;
  sponsorNamesNotListed?: number;
  sponsorCodesExpiring?: number;
  atRisk?: number;
  noGuardianPhone?: number;
}

const SEV_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

/**
 * Everything that needs the admin, worst first. Only problems are listed;
 * an empty list means all is well.
 */
export function buildAttention(i: AttentionInput): AttentionItem[] {
  const out: AttentionItem[] = [];
  const minutes = i.now.getHours() * 60 + i.now.getMinutes();

  // Registers — from 08:00 on a school day; red after 10:00.
  if (i.schoolDay && i.attendance && minutes >= 8 * 60 && i.attendance.notTaken.length > 0) {
    const n = i.attendance.notTaken.length;
    out.push({
      id: 'registers',
      severity: minutes >= 10 * 60 ? 'critical' : 'warning',
      area: 'Registers',
      title: `${plural(n, 'class', 'classes')} ${n === 1 ? "hasn't" : "haven't"} taken today's register`,
      detail: nameList(i.attendance.notTaken.map(c => c.name)),
      to: '/dashboard/admin/attendance-overview',
    });
  }

  if (i.schoolDay && i.lessons) {
    if (i.lessons.total === 0) {
      out.push({ id: 'no-timetable', severity: 'warning', area: 'Timetable', title: 'No published timetable for today', detail: 'Generate and publish the timetable so lessons and registers can be tracked.', to: '/dashboard/admin/timetable' });
    }
    if (i.lessons.uncoveredNow.length) {
      const l = i.lessons.uncoveredNow;
      out.push({ id: 'uncovered-now', severity: 'critical', area: 'Lessons', title: `${plural(l.length, 'lesson')} running now with no teacher`, detail: nameList(l.map(x => `${x.period} ${x.className} ${x.subject}`), 3), to: '/dashboard/admin/timetable-live' });
    }
    if (i.lessons.uncoveredLater.length) {
      const l = i.lessons.uncoveredLater;
      out.push({ id: 'uncovered-later', severity: 'warning', area: 'Lessons', title: `${plural(l.length, 'lesson')} later today with no teacher`, detail: nameList(l.map(x => `${x.period} ${x.className} ${x.subject}`), 3), to: '/dashboard/admin/timetable-live' });
    }
    if (i.lessons.missed > 0) {
      out.push({ id: 'missed', severity: 'warning', area: 'Lessons', title: `${plural(i.lessons.missed, 'lesson register')} missed today`, detail: 'The lesson ended and no register was taken.', to: '/dashboard/admin/timetable-live' });
    }
  }

  for (const d of i.results?.deadlines ?? []) {
    if (d.total === 0 || d.done >= d.total) continue;
    if (d.overdue) {
      out.push({ id: `results-${d.exam}`, severity: 'critical', area: 'Results', title: `${EXAM_SHORT[d.exam]} results overdue${d.countdown ? ` by ${d.countdown}` : ''} — ${plural(d.teachersOverdue, 'teacher')} still entering`, detail: `${d.done} of ${d.total} marks entered (${pct(d.done, d.total)}%).`, to: '/dashboard/admin/results-monitor?status=overdue' });
    } else if (d.dueSoon) {
      out.push({ id: `results-${d.exam}`, severity: 'warning', area: 'Results', title: `${EXAM_SHORT[d.exam]} results due in ${d.countdown ?? 'a few days'} — ${plural(d.teachersBehind, 'teacher')} not finished`, detail: `${d.done} of ${d.total} marks entered (${pct(d.done, d.total)}%).`, to: '/dashboard/admin/results-monitor' });
    }
  }

  for (const [k, p] of (i.examProblems ?? []).entries()) {
    out.push({ id: `exam-${k}`, severity: p.startsWith('No exam configuration') ? 'critical' : 'warning', area: 'Exams', title: p, to: '/dashboard/admin/exams' });
  }

  if (i.staff?.vacant.length) {
    const v = i.staff.vacant;
    out.push({ id: 'vacant', severity: 'warning', area: 'Staffing', title: `${plural(v.length, 'class subject')} with no teacher`, detail: nameList(v.map(s => `${s.className ?? ''} ${s.subject}`.trim())), to: '/dashboard/admin/teachers' });
  }
  if (i.staff?.classesWithoutFormTeacher.length) {
    const c = i.staff.classesWithoutFormTeacher;
    out.push({ id: 'formteacher', severity: 'warning', area: 'Staffing', title: `${plural(c.length, 'class', 'classes')} without a form teacher`, detail: nameList(c.map(x => x.name)), to: '/dashboard/admin/classes' });
  }

  if ((i.smsFailedWeek ?? 0) > 0) {
    out.push({ id: 'sms', severity: 'warning', area: 'SMS', title: `${plural(i.smsFailedWeek!, 'SMS', 'SMS')} failed to send this week`, detail: 'Guardians did not receive them. Check the numbers and send again.', to: '/dashboard/admin/report-cards' });
  }
  if ((i.atRisk ?? 0) > 0) {
    out.push({ id: 'at-risk', severity: 'info', area: 'Learners', title: `${plural(i.atRisk!, 'learner')} at risk — failing several subjects or often absent`, to: '#at-risk' });
  }
  if ((i.sponsorNamesNotListed ?? 0) > 0) {
    out.push({ id: 'sponsors', severity: 'info', area: 'Guidance', title: `${plural(i.sponsorNamesNotListed!, 'learner')} with a sponsor name not on the sponsor list`, to: '/dashboard/admin/guidance' });
  }
  if ((i.sponsorCodesExpiring ?? 0) > 0) {
    out.push({ id: 'codes', severity: 'info', area: 'Guidance', title: `${plural(i.sponsorCodesExpiring!, 'sponsor code')} expire within 3 days unused`, to: '/dashboard/admin/guidance' });
  }
  if ((i.noGuardianPhone ?? 0) > 0) {
    out.push({ id: 'phones', severity: 'info', area: 'Data', title: `${plural(i.noGuardianPhone!, 'learner')} with no guardian phone — no results SMS`, to: '/dashboard/admin/classes' });
  }

  return out.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity]);
}

// ==================== BRIEF ====================

/** A short summary for WhatsApp / a staff briefing. */
export function dailyBrief(i: {
  schoolName: string;
  date: Date;
  termLabel: string;
  week?: number | null;
  attendance?: AttendanceToday | null;
  attention: AttentionItem[];
  latest?: TrendPoint | null;
}): string {
  const lines: string[] = [];
  lines.push(`*${i.schoolName} — daily brief*`);
  lines.push(`${i.date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${i.termLabel}${i.week ? `, week ${i.week}` : ''}`);
  if (i.attendance && i.attendance.total > 0) {
    lines.push(`Attendance: ${i.attendance.pct}% present (${i.attendance.present} of ${i.attendance.total})${i.attendance.change !== null ? `, ${i.attendance.change >= 0 ? '+' : ''}${i.attendance.change} vs last week` : ''}. Registers ${i.attendance.registersTaken}/${i.attendance.registersDue}.`);
  }
  if (i.latest && i.latest.thisTerm.passRate !== null) {
    lines.push(`Results (${i.latest.label}): pass rate ${i.latest.thisTerm.passRate}%, quality ${i.latest.thisTerm.qualityRate}%.`);
  }
  const urgent = i.attention.filter(a => a.severity !== 'info');
  if (urgent.length) {
    lines.push('', 'Needs attention:');
    for (const a of urgent.slice(0, 8)) lines.push(`• ${a.title}${a.detail ? ` (${a.detail})` : ''}`);
  } else {
    lines.push('', 'Nothing urgent. ✔');
  }
  return lines.join('\n');
}
