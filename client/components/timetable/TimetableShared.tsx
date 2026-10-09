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
//    • CurrentPeriodBanner   — "you are in P3 now" ribbon
//    • HolidayBanner         — holiday notice
//    • PendingApprovalBanner — "N pending" for the teacher
//    • ConflictWarning       — inline conflict list
//    • TimetableGrid         — Mon–Fri × periods grid (view or edit)
//    • PeriodCellEditor      — dialog for editing one cell
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
  ChevronRight, Edit3, Trash2, User, Users, Award, X, Loader2,
} from 'lucide-react';

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

// ==================== CURRENT PERIOD BANNER ====================

export function CurrentPeriodBanner({
  current,
  next,
}: {
  current: ResolvedTimetableEntry | null;
  next?: ResolvedTimetableEntry | null;
}) {
  if (!current) {
    if (next && next.period) {
      return (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 flex items-center gap-2 text-sm">
          <Clock size={16} className="text-gray-400" />
          <span className="text-gray-600">Next:</span>
          <span className="font-medium text-gray-900">
            {next.entry.subject}
          </span>
          <span className="text-gray-500">
            · {next.entry.className} · {next.period.name} ({next.period.startTime})
          </span>
        </div>
      );
    }
    return null;
  }

  const onCover = current.isCoveredNow;
  const isDelegate = current.operatorRole !== 'owner';

  return (
    <div
      className={`rounded-xl border px-4 py-3 flex flex-wrap items-center gap-3 ${
        onCover
          ? 'border-amber-300 bg-amber-50'
          : isDelegate
          ? 'border-purple-300 bg-purple-50'
          : 'border-blue-300 bg-blue-50'
      }`}
    >
      <div className="flex items-center gap-2">
        {onCover ? (
          <AlertTriangle size={18} className="text-amber-600" />
        ) : isDelegate ? (
          <Award size={18} className="text-purple-600" />
        ) : (
          <Clock size={18} className="text-blue-600" />
        )}
        <span className="text-sm font-semibold text-gray-900">
          {onCover ? 'Covering' : isDelegate ? 'Teaching Practice' : 'Now teaching'}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-gray-900 truncate">
            {current.entry.subject}
          </span>
          <span className="text-gray-500">·</span>
          <span className="text-gray-700">{current.entry.className}</span>
          <PeriodChip period={current.period} />
          {current.period && (
            <span className="text-xs text-gray-500">
              {current.period.startTime}–{current.period.endTime}
            </span>
          )}
          {current.entry.isDouble && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
              DOUBLE
            </span>
          )}
        </div>
        {onCover && current.ownerTeacherName && (
          <p className="text-xs text-amber-800 mt-0.5">
            Covering {current.ownerTeacherName}
            {current.delegateUntil && (
              <> · until {current.delegateUntil.toLocaleDateString()}</>
            )}
          </p>
        )}
      </div>
    </div>
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
      case 'double-overlap':
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
            {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'} detected
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

// ==================== TIMETABLE GRID ====================

export type GridMode = 'view' | 'edit';

export interface TimetableGridProps {
  /** Periods to render as rows (kind === 'lesson' + breaks are shown). */
  periods: Period[];
  /** Days 1..5 to render as columns. */
  days?: Array<1 | 2 | 3 | 4 | 5>;
  /** All rows for this view, indexed by (slotId, day, period) inside. */
  entries: ResolvedTimetableEntry[];

  /**
   * In edit mode, the caller passes an `editorSlots` list describing which
   * slots the teacher can place in each cell. If undefined, cells show the
   * current entry only.
   */
  editorSlots?: Array<{
    slotId: string;
    subject: string;
    classId: string;
    className: string;
    isFormTeacherSlot?: boolean;
  }>;

  /**
   * Live edit state — a map keyed by `day:period` (e.g. "1:3") to
   * { slotId, isDouble } | null. Only used in edit mode.
   */
  edits?: Record<string, { slotId: string; isDouble: boolean } | null>;
  onEditCell?: (day: 1 | 2 | 3 | 4 | 5, periodIndex: number) => void;

  /** Optional highlight: the current period cell gets a ring. */
  highlightPeriodIndex?: number | null;
  highlightDay?: 1 | 2 | 3 | 4 | 5 | null;

  /** Optional click handler for view mode. */
  onCellClick?: (row: ResolvedTimetableEntry) => void;

  className?: string;
}

export function TimetableGrid({
  periods,
  days = [1, 2, 3, 4, 5],
  entries,
  editorSlots,
  edits,
  onEditCell,
  highlightPeriodIndex = null,
  highlightDay = null,
  onCellClick,
  className = '',
}: TimetableGridProps) {
  const mode: GridMode = editorSlots && edits && onEditCell ? 'edit' : 'view';

  // Index entries by "day:period" for O(1) lookup.
  const entryIndex = useMemo(() => {
    const m = new Map<string, ResolvedTimetableEntry>();
    for (const e of entries) {
      m.set(`${e.entry.dayOfWeek}:${e.entry.periodIndex}`, e);
    }
    return m;
  }, [entries]);

  // Track which (day, period) cells are "consumed by a double tail" so we
  // can render them as merged with the primary cell above.
  const doubleTails = useMemo(() => {
    const set = new Set<string>();
    for (const e of entries) {
      if (e.entry.isDouble) {
        set.add(`${e.entry.dayOfWeek}:${e.entry.periodIndex + 1}`);
      }
    }
    return set;
  }, [entries]);

  const cellFor = (
    day: 1 | 2 | 3 | 4 | 5,
    period: Period,
  ): React.ReactNode => {
    const key = `${day}:${period.order}`;

    // Hidden by a double — the primary cell above spans this one.
    if (doubleTails.has(key) && mode === 'view') return null;

    const entry = entryIndex.get(key);

    // Edit-mode cell with a pending change.
    const edit = edits?.[key];

    return (
      <TimetableCell
        key={key}
        day={day}
        period={period}
        entry={entry}
        mode={mode}
        edit={edit ?? undefined}
        onEdit={onEditCell}
        onCellClick={onCellClick}
        highlighted={
          highlightPeriodIndex === period.order && highlightDay === day
        }
      />
    );
  };

  // Determine whether the current period is a non-lesson break — those
  // are rendered as a thin full-width row.
  const isBreak = (p: Period) => p.kind !== 'lesson';

  return (
    <div className={`overflow-x-auto rounded-xl border border-gray-200 bg-white ${className}`}>
      <table className="w-full border-collapse min-w-[640px]">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left text-xs font-semibold text-gray-600 uppercase px-3 py-2 w-32">
              Period
            </th>
            {days.map(d => (
              <th
                key={d}
                className="text-left text-xs font-semibold text-gray-600 uppercase px-3 py-2"
              >
                {dayLabel(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map(p => {
            if (isBreak(p)) {
              return (
                <tr
                  key={p.id}
                  className="border-b border-gray-100 bg-gray-50/50"
                >
                  <td
                    colSpan={days.length + 1}
                    className="px-3 py-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <PeriodChip period={p} compact />
                      <span className="text-xs text-gray-500">
                        {p.startTime}–{p.endTime}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            }

            return (
              <tr key={p.id} className="border-b border-gray-100">
                <td className="px-3 py-2 align-top w-32 bg-gray-50/30">
                  <div className="flex flex-col gap-0.5">
                    <PeriodChip period={p} />
                    <span className="text-[10px] text-gray-500">
                      {p.startTime}–{p.endTime}
                    </span>
                  </div>
                </td>
                {days.map(d => (
                  <td
                    key={d}
                    className="px-2 py-1.5 align-top border-l border-gray-100"
                  >
                    {cellFor(d, p)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function dayLabel(d: 1 | 2 | 3 | 4 | 5) {
  return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][d - 1];
}

function TimetableCell({
  day,
  period,
  entry,
  mode,
  edit,
  onEdit,
  onCellClick,
  highlighted,
}: {
  day: 1 | 2 | 3 | 4 | 5;
  period: Period;
  entry: ResolvedTimetableEntry | undefined;
  mode: GridMode;
  edit: { slotId: string; isDouble: boolean } | null | undefined;
  onEdit?: (day: 1 | 2 | 3 | 4 | 5, periodIndex: number) => void;
  onCellClick?: (row: ResolvedTimetableEntry) => void;
  highlighted?: boolean;
}) {
  // Edit mode: what does this cell currently want to be?
  const editContent = edit !== undefined ? edit : null;
  const source = entry;

  const ring = highlighted
    ? 'ring-2 ring-blue-400 ring-offset-1'
    : '';

  const base = `w-full text-left rounded-lg border px-2 py-1.5 text-xs transition-colors ${ring}`;

  // Edit mode with no explicit edit and no existing entry → "+" prompt.
  if (mode === 'edit') {
    if (editContent === null && !source) {
      return (
        <button
          onClick={() => onEdit?.(day, period.order)}
          className={`${base} border-dashed border-gray-200 text-gray-400 hover:border-blue-300 hover:text-blue-500 flex items-center justify-center min-h-[44px]`}
        >
          <Edit3 size={14} />
        </button>
      );
    }

    // Edit-mode cell with content (either an edit or the current entry).
    const isDouble = editContent ? editContent.isDouble : source?.entry.isDouble === true;
    const subjectLabel =
      editContent ? 'Change selected…' : source?.entry.subject ?? 'Empty';

    return (
      <button
        onClick={() => onEdit?.(day, period.order)}
        className={`${base} border-blue-300 bg-blue-50/40 hover:bg-blue-50 min-h-[44px]`}
      >
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-gray-900 truncate">
            {subjectLabel}
          </span>
          {source && !editContent && (
            <span className="text-[10px] text-gray-600 truncate">
              {source.entry.className}
            </span>
          )}
          {isDouble && (
            <span className="text-[9px] font-semibold text-purple-700">
              DOUBLE
            </span>
          )}
        </div>
      </button>
    );
  }

  // View mode.
  if (!source) {
    return <div className="min-h-[40px]" />;
  }

  const covered = source.isCoveredNow;
  const isDelegate = source.operatorRole !== 'owner';

  const tone = covered
    ? 'border-amber-200 bg-amber-50'
    : isDelegate
    ? 'border-purple-200 bg-purple-50'
    : 'border-gray-200 bg-white hover:bg-gray-50';

  return (
    <button
      onClick={() => onCellClick?.(source)}
      className={`${base} ${tone} min-h-[44px]`}
    >
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold text-gray-900 truncate">
          {source.entry.subject}
        </span>
        <span className="text-[10px] text-gray-600 truncate">
          {source.entry.className}
        </span>
        {covered && source.ownerTeacherName && (
          <span className="text-[9px] font-medium text-amber-700 truncate">
            Covering {source.ownerTeacherName}
          </span>
        )}
        {isDelegate && !covered && source.operatorRole === 'tp' && (
          <span className="text-[9px] font-medium text-purple-700 truncate">
            TP placement
          </span>
        )}
        {source.entry.isDouble && (
          <span className="text-[9px] font-semibold text-purple-700">
            DOUBLE
          </span>
        )}
      </div>
    </button>
  );
}

// ==================== PERIOD CELL EDITOR ====================

export interface PeriodCellEditorProps {
  open: boolean;
  day: 1 | 2 | 3 | 4 | 5 | null;
  period: Period | null;

  /** Currently selected slotId in this cell (or null). */
  selectedSlotId: string | null;
  /** Currently selected double flag. */
  isDouble: boolean;

  /** Slots this teacher can place in the cell. */
  slots: Array<{
    slotId: string;
    subject: string;
    classId: string;
    className: string;
    isFormTeacherSlot?: boolean;
  }>;

  /** True if periodIndex + 1 exists and is a lesson period (double allowed). */
  canBeDouble: boolean;

  onSelect: (slotId: string | null) => void;
  onToggleDouble: (isDouble: boolean) => void;
  onSave: () => void;
  onClear: () => void;
  onClose: () => void;
  isSaving?: boolean;
}

export function PeriodCellEditor({
  open,
  day,
  period,
  selectedSlotId,
  isDouble,
  slots,
  canBeDouble,
  onSelect,
  onToggleDouble,
  onSave,
  onClear,
  onClose,
  isSaving = false,
}: PeriodCellEditorProps) {
  if (!open || !day || !period) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">
              {dayLabel(day)}, {period.name}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {period.startTime}–{period.endTime}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {slots.length === 0 ? (
            <div className="text-sm text-gray-500 italic py-4 text-center">
              No slots available to schedule. You may not currently be
              assigned to any subject you can place here.
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
                  Subject
                </label>
                <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
                  {slots.map(s => {
                    const active = selectedSlotId === s.slotId;
                    return (
                      <button
                        key={s.slotId}
                        onClick={() => onSelect(active ? null : s.slotId)}
                        className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                          active
                            ? 'border-blue-500 bg-blue-50 text-blue-900'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">
                              {s.subject}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {s.className}
                              {s.isFormTeacherSlot && ' · Form Teacher'}
                            </p>
                          </div>
                          {active && (
                            <CheckCircle
                              size={16}
                              className="text-blue-600 flex-shrink-0"
                            />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    Double period
                  </p>
                  <p className="text-xs text-gray-500">
                    Runs into {period.name} and the next lesson period.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={isDouble}
                    disabled={!canBeDouble}
                    onChange={e => onToggleDouble(e.target.checked)}
                  />
                  <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-400 rounded-full peer peer-checked:bg-purple-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4" />
                </label>
              </div>
              {!canBeDouble && isDouble && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  Double periods can't end on a break, lunch or the last lesson
                  of the day.
                </p>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex gap-2 justify-end">
          <button
            onClick={onClear}
            className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1"
          >
            <Trash2 size={14} />
            Clear
          </button>
          <button
            onClick={onClose}
            className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={isSaving || slots.length === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {isSaving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <CheckCircle size={14} />
            )}
            Save
          </button>
        </div>
      </div>
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
 * Side-by-side comparison of a pending submission vs the currently active
 * entries for the same slots. Used in the admin approval queue.
 *
 * "Currently active" is derived from the passed `activeForSlots` (the
 * caller already has this from `getTimetableForClass`). The "proposed"
 * side is the pending submission's own rows.
 */
export function SubmissionDiffView({
  pending,
  activeForSlots,
}: {
  pending: PendingSubmission;
  activeForSlots: ResolvedTimetableEntry[];
}) {
  // Build the currently-active index by (slotId, day, periodIndex).
  const activeKeyed = new Map<string, ResolvedTimetableEntry>();
  for (const a of activeForSlots) {
    activeKeyed.set(
      `${a.entry.slotId}:${a.entry.dayOfWeek}:${a.entry.periodIndex}`,
      a,
    );
  }

  // Group pending rows by (slotId → subject + class) for a compact display.
  const grouped = useMemo(() => {
    const bySlot = new Map<
      string,
      {
        slotId: string;
        subject: string;
        className: string;
        pending: PendingSubmission['entries'];
        active: ResolvedTimetableEntry[];
      }
    >();

    for (const e of pending.entries) {
      const key = e.slotId;
      if (!bySlot.has(key)) {
        bySlot.set(key, {
          slotId: key,
          subject: e.subject,
          className: e.className,
          pending: [],
          active: [],
        });
      }
      bySlot.get(key)!.pending.push(e);
    }

    // Attach active rows for each slot.
    for (const a of activeForSlots) {
      const entry = bySlot.get(a.entry.slotId);
      if (entry) entry.active.push(a);
    }

    return Array.from(bySlot.values()).sort(
      (a, b) =>
        a.className.localeCompare(b.className) ||
        a.subject.localeCompare(b.subject),
    );
  }, [pending.entries, activeForSlots]);

  const compactSlot = (rows: Array<{ dayOfWeek: number; periodIndex: number; isDouble: boolean }>) =>
    rows
      .slice()
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.periodIndex - b.periodIndex)
      .map(r => `${dayShort(r.dayOfWeek)} P${r.periodIndex}${r.isDouble ? '²' : ''}`)
      .join(', ') || '—';

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="font-semibold text-gray-900 text-sm">
              {pending.submittedByName}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {pending.term} {pending.year} ·{' '}
              {pending.submittedAt.toLocaleString()} ·{' '}
              {pending.entries.length} entries across {pending.classNames.length}{' '}
              class{pending.classNames.length === 1 ? '' : 'es'}
            </p>
          </div>
          {pending.conflicts.length > 0 && (
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-800">
              {pending.conflicts.length} conflict
              {pending.conflicts.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>

      <div className="divide-y divide-gray-100">
        {grouped.map(g => (
          <div key={g.slotId} className="px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Users size={14} className="text-gray-400" />
              <span className="font-medium text-sm text-gray-900">
                {g.subject}
              </span>
              <span className="text-xs text-gray-500">·</span>
              <span className="text-xs text-gray-700">{g.className}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-gray-200 px-3 py-2">
                <p className="font-semibold text-gray-500 uppercase tracking-wider text-[10px] mb-1">
                  Currently active
                </p>
                <p className="text-gray-800 font-mono">
                  {compactSlot(
                    g.active.map(a => ({
                      dayOfWeek: a.entry.dayOfWeek,
                      periodIndex: a.entry.periodIndex,
                      isDouble: a.entry.isDouble,
                    })),
                  )}
                </p>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2">
                <p className="font-semibold text-blue-700 uppercase tracking-wider text-[10px] mb-1">
                  Proposed
                </p>
                <p className="text-blue-900 font-mono">
                  {compactSlot(
                    g.pending.map(p => ({
                      dayOfWeek: p.dayOfWeek,
                      periodIndex: p.periodIndex,
                      isDouble: p.isDouble,
                    })),
                  )}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {pending.conflicts.length > 0 && (
        <div className="border-t border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={14} className="text-amber-600" />
            <span className="text-xs font-semibold text-amber-900 uppercase tracking-wider">
              Conflicts
            </span>
          </div>
          <ul className="space-y-1">
            {pending.conflicts.map((c, i) => (
              <li key={i} className="text-xs text-amber-900 flex items-start gap-2">
                <span className="flex-shrink-0 mt-0.5">•</span>
                <span>{c.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function dayShort(d: number) {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][d - 1] ?? '?';
}