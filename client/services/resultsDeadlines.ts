// @/services/resultsDeadlines.ts
//
// Results-entry deadlines. For each term the admin may set, per test
// (Week 4, Week 8, End of Term), the last day by which teachers must have
// entered the marks (Exam Management). Teachers see how long they have left
// on Results Entry and on their dashboard; the admin's monitor and the HoDs
// see who is overdue.
//
// A deadline is a calendar day ('YYYY-MM-DD'): marks are on time until the
// END of that day. Deadlines don't lock Results Entry — marks can still be
// entered late; they are then shown as overdue until complete.

import type { ExamConfig, ExamType } from '@/types/exam';

export const DEADLINE_FIELD: Record<ExamType, 'week4Deadline' | 'week8Deadline' | 'endOfTermDeadline'> = {
  week4: 'week4Deadline',
  week8: 'week8Deadline',
  endOfTerm: 'endOfTermDeadline',
};

export const DATE_FIELD: Record<ExamType, 'week4Date' | 'week8Date' | 'endOfTermDate'> = {
  week4: 'week4Date',
  week8: 'week8Date',
  endOfTerm: 'endOfTermDate',
};

/** How many days before a deadline it counts as "due soon". */
export const DUE_SOON_DAYS = 3;

const YMD = /^(\d{4})-(\d{2})-(\d{2})/;

/** 'YYYY-MM-DD' (or an ISO string) → local midnight of that day; null if invalid. */
export function parseDay(v: string | null | undefined): Date | null {
  if (!v) return null;
  const m = YMD.exec(String(v));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) || d.getMonth() !== Number(m[2]) - 1 ? null : d;
}

/** The deadline of an exam for a config ('YYYY-MM-DD'), or null when none is set. */
export function deadlineFor(config: Partial<ExamConfig> | null | undefined, exam: ExamType): string | null {
  const v = config?.[DEADLINE_FIELD[exam]];
  return parseDay(v ?? null) ? String(v).slice(0, 10) : null;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDiff = (a: Date, b: Date) => Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000);

export type DeadlineState = 'none' | 'done' | 'upcoming' | 'due-soon' | 'due-today' | 'overdue';

export interface DeadlineStatus {
  state: DeadlineState;
  /** 'YYYY-MM-DD' or null. */
  deadline: string | null;
  /** Days until the deadline (0 = today, negative = days overdue). */
  daysLeft: number | null;
  /** Short text for a badge: "Due in 5 days", "Due today", "3 days overdue". */
  label: string;
  tone: 'neutral' | 'ok' | 'info' | 'warn' | 'danger';
}

export const formatDay = (ymd: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => {
  const d = parseDay(ymd);
  return d ? d.toLocaleDateString('en-GB', opts) : '';
};

/**
 * Where a teacher stands against a deadline.
 * `complete` = every learner has a mark (or the test was not conducted).
 */
export function deadlineStatus(deadline: string | null | undefined, opts: { complete?: boolean; now?: Date } = {}): DeadlineStatus {
  const day = parseDay(deadline ?? null);
  const ymd = day ? String(deadline).slice(0, 10) : null;
  if (opts.complete) return { state: 'done', deadline: ymd, daysLeft: day ? dayDiff(day, opts.now ?? new Date()) : null, label: 'Complete', tone: 'ok' };
  if (!day) return { state: 'none', deadline: null, daysLeft: null, label: 'No deadline', tone: 'neutral' };
  const left = dayDiff(day, opts.now ?? new Date());
  if (left < 0) {
    const n = -left;
    return { state: 'overdue', deadline: ymd, daysLeft: left, label: `${n} day${n === 1 ? '' : 's'} overdue`, tone: 'danger' };
  }
  if (left === 0) return { state: 'due-today', deadline: ymd, daysLeft: 0, label: 'Due today', tone: 'danger' };
  if (left <= DUE_SOON_DAYS) return { state: 'due-soon', deadline: ymd, daysLeft: left, label: left === 1 ? 'Due tomorrow' : `Due in ${left} days`, tone: 'warn' };
  return { state: 'upcoming', deadline: ymd, daysLeft: left, label: `Due ${formatDay(ymd)}`, tone: 'info' };
}

/** Tailwind classes for a deadline badge. */
export const DEADLINE_BADGE: Record<DeadlineStatus['tone'], string> = {
  neutral: 'bg-gray-100 text-gray-600 border-gray-200',
  ok: 'bg-green-50 text-green-700 border-green-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  warn: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
};

/** Sort key: overdue first, then the nearest deadline; none last. */
export const deadlineRank = (s: DeadlineStatus) =>
  s.state === 'done' ? 1e9 : s.daysLeft === null ? 1e8 : s.daysLeft;

/**
 * Check the deadlines an admin is about to save. Returns problems that must
 * be fixed, per exam. A deadline must not be before the test's date, and the
 * tests' deadlines must be in order (Week 4 ≤ Week 8 ≤ End of Term).
 */
export function deadlineProblems(form: {
  examTypes: Record<ExamType, boolean>;
  dates: Partial<Record<ExamType, string | null | undefined>>;
  deadlines: Partial<Record<ExamType, string | null | undefined>>;
  termStart?: Date | null;
}): Partial<Record<ExamType, string>> {
  const out: Partial<Record<ExamType, string>> = {};
  const order: ExamType[] = ['week4', 'week8', 'endOfTerm'];
  const label: Record<ExamType, string> = { week4: 'Week 4', week8: 'Week 8', endOfTerm: 'End of Term' };
  let prev: { exam: ExamType; day: Date } | null = null;
  for (const exam of order) {
    if (!form.examTypes[exam]) continue;
    const raw = form.deadlines[exam];
    if (!raw) continue;
    const day = parseDay(raw);
    if (!day) { out[exam] = 'Not a valid date.'; continue; }
    const test = parseDay(form.dates[exam] ?? null);
    if (test && day < test) out[exam] = `The deadline is before the ${label[exam]} test date.`;
    else if (form.termStart && day < startOfDay(form.termStart)) out[exam] = 'The deadline is before the term starts.';
    else if (prev && day < prev.day) out[exam] = `The deadline is before the ${label[prev.exam]} deadline.`;
    // Later deadlines are compared with the last valid one.
    if (!out[exam]) prev = { exam, day };
  }
  return out;
}

// ==================== LIVE COUNTDOWN ====================

/** Two digits: 7 → "07". */
export const two = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, '0');

/** The moment a deadline passes: midnight at the END of the deadline day (local time). */
export function deadlineEnd(ymd: string | null | undefined): Date | null {
  const d = parseDay(ymd ?? null);
  return d ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) : null;
}

export type CountdownUrgency = 'calm' | 'soon' | 'urgent' | 'overdue';

export interface Countdown {
  overdue: boolean;
  /** Time left (or, when overdue, time since the deadline), split up. */
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** Milliseconds left; negative when overdue. */
  ms: number;
  /** calm: more than 3 days · soon: 3 days or less · urgent: under 24 hours · overdue */
  urgency: CountdownUrgency;
  /** For screen readers: "2 days 14 hours 37 minutes left". */
  spoken: string;
  /** Short text: "2d 14h 37m 09s". */
  short: string;
}

/** Countdown to the end of a deadline day; counts up once it has passed. */
export function countdownTo(ymd: string | null | undefined, now: Date = new Date()): Countdown | null {
  const end = deadlineEnd(ymd);
  if (!end) return null;
  const ms = end.getTime() - now.getTime();
  const abs = Math.abs(ms);
  const totalSec = ms >= 0 ? Math.ceil(abs / 1000) : Math.floor(abs / 1000);
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const overdue = ms <= 0;
  const urgency: CountdownUrgency = overdue ? 'overdue' : ms < 86_400_000 ? 'urgent' : ms <= 3 * 86_400_000 ? 'soon' : 'calm';
  const part = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const spokenParts = days > 0 ? [part(days, 'day'), part(hours, 'hour'), part(minutes, 'minute')] : [part(hours, 'hour'), part(minutes, 'minute')];
  return {
    overdue,
    days,
    hours,
    minutes,
    seconds,
    ms,
    urgency,
    spoken: `${spokenParts.join(' ')} ${overdue ? 'overdue' : 'left'}`,
    short: `${days > 0 ? `${days}d ` : ''}${two(hours)}h ${two(minutes)}m ${two(seconds)}s`,
  };
}
