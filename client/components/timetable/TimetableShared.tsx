// @/components/timetable/TimetableShared.tsx
//
// ============================================================================
//  SHARED TIMETABLE UI
// ============================================================================
//
//  Every reusable piece of the timetable feature lives here so pages can
//  just compose them:
//
//    • PeriodChip            — small period label ('P1', 'Break')
//    • HolidayBanner         — holiday notice
//    • PendingApprovalBanner — "N pending" for the teacher
//    • ConflictWarning       — inline conflict list
//    • WeekGrid              — Mon–Fri × periods, doubles/triples as one box
//    • CoverageCard          — per-class coverage summary
//    • UncoveredPeriodsTable — per-teacher coverage table
//    • SubmissionDiffView    — pending vs active side-by-side
//
//  None of these components fetch data — they receive it via props from
//  the pages that use them. Keeps them testable and composable.
// ============================================================================

import React, { useMemo, useState } from 'react';
import {
  Calendar, Clock, AlertTriangle, Info, CheckCircle, XCircle,
  ChevronRight, User, Users, Award, X, Loader2,
} from 'lucide-react';
import {
  bellOrder,
  blockSizeName,
  groupIntoBlocks,
  DAY_SHORT,
  WEEKDAYS,
  type Block,
} from '@/services/timetableModel';

import type {
  Period,
  ResolvedTimetableEntry,
  TimetableConflict,
  CoverageRow,
  TeacherCoverageRow,
  PendingSubmission,
  SchoolHoliday,
} from '@/types/timetable';

// ==================== PERIOD CHIP ====================

export function PeriodChip({
  period,
  compact = false,
}: {
  period: Period | null;
  compact?: boolean;
}) {
  if (!period) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500">
        ??
      </span>
    );
  }
  const colors: Record<Period['kind'], string> = {
    lesson:   'bg-blue-50 text-blue-700 border-blue-200',
    break:    'bg-amber-50 text-amber-700 border-amber-200',
    assembly: 'bg-purple-50 text-purple-700 border-purple-200',
    lunch:    'bg-rose-50 text-rose-700 border-rose-200',
  };
  return (
    <span
      className={`inline-flex items-center rounded border text-[10px] font-semibold uppercase tracking-wider ${colors[period.kind]} ${
        compact ? 'px-1 py-0' : 'px-1.5 py-0.5'
      }`}
      title={period.startTime && period.endTime ? `${period.startTime}–${period.endTime}` : undefined}
    >
      {period.name}
    </span>
  );
}

// ==================== HOLIDAY BANNER ====================

export function HolidayBanner({ holiday }: { holiday: SchoolHoliday }) {
  const multiDay = holiday.startDate !== holiday.endDate;
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 flex items-start gap-3">
      <Calendar size={18} className="text-rose-600 flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-rose-900">
          No lessons today — {holiday.name}
        </p>
        <p className="text-xs text-rose-800 mt-0.5">
          {multiDay ? `${holiday.startDate} → ${holiday.endDate}` : holiday.startDate}
          {holiday.kind === 'public' && ' · public holiday'}
          {holiday.kind === 'school' && ' · school holiday'}
          {holiday.kind === 'exam-week' && ' · exam week'}
        </p>
      </div>
    </div>
  );
}

// ==================== PENDING APPROVAL BANNER ====================

export function PendingApprovalBanner({
  count,
  onReview,
}: {
  count: number;
  onReview?: () => void;
}) {
  if (count <= 0) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 flex items-center gap-3">
      <Info size={16} className="text-amber-600 flex-shrink-0" />
      <p className="text-sm text-amber-900 flex-1">
        <span className="font-semibold">{count}</span> timetable change
        {count === 1 ? '' : 's'} awaiting admin approval.
        Your previous active timetable stays live in the meantime.
      </p>
      {onReview && (
        <button
          onClick={onReview}
          className="text-xs font-medium text-amber-700 hover:text-amber-900 flex items-center gap-1"
        >
          Review <ChevronRight size={12} />
        </button>
      )}
    </div>
  );
}

// ==================== CONFLICT WARNING ====================

export function ConflictWarning({
  conflicts,
  onDismiss,
}: {
  conflicts: TimetableConflict[];
  onDismiss?: () => void;
}) {
  if (conflicts.length === 0) return null;

  const iconFor = (kind: TimetableConflict['kind']) => {
    switch (kind) {
      case 'holiday': return <Calendar size={14} className="text-rose-600" />;
      case 'teacher-clash':
      case 'class-clash':
      case 'not-lesson':
        return <AlertTriangle size={14} className="text-amber-600" />;
    }
  };

  const bgFor = (kind: TimetableConflict['kind']) =>
    kind === 'holiday'
      ? 'bg-rose-50 border-rose-200 text-rose-900'
      : 'bg-amber-50 border-amber-200 text-amber-900';

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/30 overflow-hidden">
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-amber-200">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-600" />
          <span className="text-sm font-semibold text-amber-900">
            {conflicts.length} clash{conflicts.length === 1 ? '' : 'es'} to fix
          </span>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-amber-600 hover:text-amber-800"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        )}
      </div>
      <ul className="divide-y divide-amber-200/60 max-h-[240px] overflow-y-auto">
        {conflicts.map((c, i) => (
          <li
            key={`${c.kind}-${i}-${c.entryIds.join(',')}`}
            className={`px-4 py-2 flex items-start gap-2 text-xs ${bgFor(c.kind)}`}
          >
            <span className="flex-shrink-0 mt-0.5">{iconFor(c.kind)}</span>
            <span className="flex-1">{c.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ==================== WEEK GRID (VIEW) ====================

export interface WeekGridCell {
  slotId: string;
  dayOfWeek: 1 | 2 | 3 | 4 | 5;
  periodIndex: number;
  classId: string;
  className: string;
  subject: string;
}

/**
 * Mon–Fri × bell-schedule grid. Consecutive periods of one subject are
 * drawn as one tall box (double / triple). Breaks are thin full-width rows.
 * `title` / `subtitle` decide what each box says (e.g. subject + class).
 */
export function WeekGrid<C extends WeekGridCell>({
  periods,
  cells,
  title,
  subtitle,
  tone,
  highlight,
  className = '',
}: {
  periods: Period[];
  cells: C[];
  title: (c: C) => string;
  subtitle?: (c: C) => string | null;
  tone?: (c: C) => 'normal' | 'muted' | 'added' | 'removed';
  highlight?: { dayOfWeek: number; periodIndex: number } | null;
  className?: string;
}) {
  const bell = useMemo(() => bellOrder(periods), [periods]);
  const blocks = useMemo(() => groupIntoBlocks(cells, periods), [cells, periods]);
  const startAt = useMemo(() => {
    const m = new Map<string, Block<C>>();
    for (const b of blocks) m.set(`${b.dayOfWeek}:${b.periodIndexes[0]}`, b);
    return m;
  }, [blocks]);
  const covered = useMemo(() => {
    const s = new Set<string>();
    for (const b of blocks) b.periodIndexes.slice(1).forEach(p => s.add(`${b.dayOfWeek}:${p}`));
    return s;
  }, [blocks]);
  // Two different subjects in one cell (a clash) — show both stacked.
  const extra = useMemo(() => {
    const m = new Map<string, Block<C>[]>();
    const seen = new Set<string>();
    for (const b of blocks) {
      const k = `${b.dayOfWeek}:${b.periodIndexes[0]}`;
      if (seen.has(k) && startAt.get(k) !== b) m.set(k, [...(m.get(k) ?? []), b]);
      seen.add(k);
    }
    return m;
  }, [blocks, startAt]);

  const toneClass = {
    normal: 'bg-blue-50 border-blue-200 text-blue-900',
    muted: 'bg-gray-50 border-gray-200 text-gray-600',
    added: 'bg-green-50 border-green-300 text-green-900',
    removed: 'bg-red-50 border-red-200 text-red-800 line-through',
  } as const;

  const box = (b: Block<C>) => {
    const c = b.rows[0];
    const t = tone?.(c) ?? 'normal';
    return (
      <div key={b.key} className={`rounded-md border px-2 py-1 h-full ${toneClass[t]}`}>
        <div className="text-xs font-semibold leading-tight">{title(c)}</div>
        {subtitle?.(c) && <div className="text-[10px] opacity-80 leading-tight">{subtitle(c)}</div>}
        {b.size > 1 && <div className="text-[10px] opacity-70">{b.label} · {blockSizeName(b.size)}</div>}
      </div>
    );
  };

  return (
    <div className={`overflow-x-auto rounded-xl border border-gray-200 bg-white ${className}`}>
      <table className="w-full border-collapse min-w-[560px] table-fixed">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left text-[11px] font-semibold text-gray-600 uppercase px-2 py-2 w-20">Period</th>
            {WEEKDAYS.map(d => (
              <th key={d} className="text-left text-[11px] font-semibold text-gray-600 uppercase px-2 py-2">{DAY_SHORT[d - 1]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bell.map(p =>
            p.kind !== 'lesson' ? (
              <tr key={p.id} className="bg-gray-50/60 border-b border-gray-100">
                <td colSpan={6} className="px-2 py-1 text-[11px] text-gray-500">
                  <PeriodChip period={p} compact /> {p.startTime}–{p.endTime}
                </td>
              </tr>
            ) : (
              <tr key={p.id} className="border-b border-gray-100">
                <td className="px-2 py-1.5 align-top">
                  <PeriodChip period={p} />
                  <div className="text-[10px] text-gray-500">{p.startTime}</div>
                </td>
                {WEEKDAYS.map(d => {
                  const k = `${d}:${p.order}`;
                  if (covered.has(k) && !startAt.has(k)) return null;
                  const b = startAt.get(k);
                  const hl = highlight && highlight.dayOfWeek === d && b?.periodIndexes.includes(highlight.periodIndex);
                  return (
                    <td
                      key={k}
                      rowSpan={b ? b.size : 1}
                      className={`px-1 py-1 align-top border-l border-gray-100 ${hl ? 'ring-2 ring-inset ring-blue-500' : ''}`}
                    >
                      {b && (
                        <div className="flex flex-col gap-1 h-full">
                          {box(b)}
                          {(extra.get(k) ?? []).map(box)}
                        </div>
                      )}
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

// ==================== COVERAGE CARD ====================

export function CoverageCard({
  rows,
  dateLabel,
  loading,
}: {
  rows: CoverageRow[];
  dateLabel: string;
  loading?: boolean;
}) {
  const totals = useMemo(() => {
    let expected = 0;
    let marked = 0;
    let missing = 0;
    for (const r of rows) {
      expected += r.expectedCount;
      marked += r.markedCount;
      missing += r.missingCount;
    }
    return { expected, marked, missing };
  }, [rows]);

  const overallRate =
    totals.expected === 0
      ? 100
      : Math.round((totals.marked / totals.expected) * 100);

  const rateClass = (rate: number) => {
    if (rate >= 90) return 'text-green-700 bg-green-50 border-green-200';
    if (rate >= 70) return 'text-amber-700 bg-amber-50 border-amber-200';
    return 'text-red-700 bg-red-50 border-red-200';
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">
            Timetable Coverage
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">{dateLabel}</p>
        </div>
        <div className="text-right">
          <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs font-semibold ${rateClass(overallRate)}`}>
            {overallRate}% coverage
          </div>
          <p className="text-[10px] text-gray-500 mt-1">
            {totals.marked}/{totals.expected} sessions marked
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-blue-600" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-500">
          No scheduled periods for this day.
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {rows.map(r => (
            <div key={r.classId} className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 text-sm truncate">
                  {r.className}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {r.markedCount}/{r.expectedCount} periods marked
                  {r.missingCount > 0 && ` · ${r.missingCount} missing`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {r.coverageRate === 100 ? (
                  <CheckCircle size={18} className="text-green-600" />
                ) : r.coverageRate >= 50 ? (
                  <AlertTriangle size={18} className="text-amber-600" />
                ) : (
                  <XCircle size={18} className="text-red-600" />
                )}
                <span className={`text-sm font-semibold tabular-nums ${r.coverageRate >= 90 ? 'text-green-700' : r.coverageRate >= 70 ? 'text-amber-700' : 'text-red-700'}`}>
                  {r.coverageRate}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==================== UNCOVERED PERIODS TABLE ====================

export function UncoveredPeriodsTable({
  rows,
  loading,
}: {
  rows: TeacherCoverageRow[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 flex justify-center">
        <Loader2 size={20} className="animate-spin text-blue-600" />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-500">
        Everyone is on track today.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">
          Teacher Coverage Today
        </h3>
        <span className="text-xs text-gray-500">
          {rows.length} teacher{rows.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600 uppercase">
                Teacher
              </th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-600 uppercase">
                Status
              </th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-gray-600 uppercase">
                Expected
              </th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-gray-600 uppercase">
                Marked
              </th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-gray-600 uppercase">
                Missing
              </th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-gray-600 uppercase">
                Coverage
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(r => (
              <tr key={r.teacherId} className="hover:bg-gray-50/50">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {r.teacherName.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-gray-900 truncate">
                      {r.teacherName}
                    </span>
                    {r.hasUncoveredSlots && (
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700"
                        title="Some owned slots have no live cover"
                      >
                        UNCOVERED
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-600 capitalize">
                  {r.status.replace('_', ' ')}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                  {r.expectedCount}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-green-700 font-medium">
                  {r.markedCount}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-red-700 font-medium">
                  {r.missingCount}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${
                      r.coverageRate >= 90
                        ? 'text-green-700 bg-green-50 border-green-200'
                        : r.coverageRate >= 70
                        ? 'text-amber-700 bg-amber-50 border-amber-200'
                        : 'text-red-700 bg-red-50 border-red-200'
                    }`}
                  >
                    {r.coverageRate}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ==================== SUBMISSION DIFF VIEW ====================

/**
 * Before / after for one pending submission, per subject: what is live now
 * and what will be live after approval (approval replaces the whole subject).
 */
export function SubmissionDiffView({ pending, periods }: { pending: PendingSubmission; periods: Period[] }) {
  const subjects = useMemo(() => {
    const m = new Map<string, { name: string; before: string[]; after: string[]; count: number }>();
    const label = (rows: Array<WeekGridCell>) =>
      groupIntoBlocks(rows, periods).map(b => `${DAY_SHORT[b.dayOfWeek - 1]} ${b.label}`);
    for (const id of pending.scopeSlotIds) {
      const after = pending.entries.filter(e => e.slotId === id);
      const before = pending.replacedEntries.filter(e => e.slotId === id);
      const any = after[0] ?? before[0];
      m.set(id, {
        name: any ? `${any.className} ${any.subject}` : id.replace('__', ' '),
        before: label(before),
        after: label(after),
        count: after.length,
      });
    }
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [pending, periods]);

  return (
    <div className="rounded-lg border border-gray-200 divide-y divide-gray-100 text-xs">
      {subjects.map(s => {
        const same = s.before.join() === s.after.join();
        return (
          <div key={s.name} className="px-3 py-2 grid grid-cols-1 sm:grid-cols-[10rem_1fr_1fr] gap-1 sm:gap-3">
            <div className="font-semibold text-gray-900">{s.name}</div>
            <div className="text-gray-500">
              <span className="font-medium text-gray-600">Now: </span>
              {s.before.length ? s.before.join(', ') : 'nothing'}
            </div>
            <div className={same ? 'text-gray-500' : 'text-green-800'}>
              <span className="font-medium">After: </span>
              {same ? 'no change' : s.after.length ? `${s.after.join(', ')} (${s.count} period${s.count === 1 ? '' : 's'}/week)` : 'cleared'}
            </div>
          </div>
        );
      })}
    </div>
  );
}