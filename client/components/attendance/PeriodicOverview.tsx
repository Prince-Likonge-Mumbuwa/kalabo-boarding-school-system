// components/attendance/PeriodicOverview.tsx
import React, { useMemo, useState } from 'react';
import {
  Clock,
  User,
  ChevronDown,
  ChevronUp,
  Filter,
} from 'lucide-react';
import type {
  AttendanceSession,
  AttendanceStatus,
  PeriodicAttendanceRecord,
} from '@/types/attendance';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Minimal shape needed to render a student row.
 * Both PeriodicAttendanceRecord and a session-derived row fit this.
 */
interface OverviewRow {
  id: string;
  studentId: string;
  studentName: string;
  studentGender?: 'male' | 'female';
  status: AttendanceStatus;
  subject: string;
  period: number;
  markedByName: string;
  markedBy: string;
}

/**
 * The overview accepts EITHER:
 *
 *   1. `sessions` — native session docs (preferred). One doc per roll call.
 *      The component derives byPeriod / bySubject itself.
 *
 *   2. `byPeriod` + `bySubject` — legacy record arrays. Kept for backward
 *      compatibility with callers that still have per-student records.
 *
 * If both are provided, `sessions` wins.
 */
export interface PeriodicOverviewProps {
  /** Preferred: raw session docs. */
  sessions?: AttendanceSession[];

  /** Legacy: record arrays. Ignored when `sessions` is present. */
  byPeriod?: Record<number, PeriodicAttendanceRecord[]>;
  bySubject?: Record<string, PeriodicAttendanceRecord[]>;

  /**
   * Optional teacher names when using `sessions`. If omitted, they're derived
   * from the session's `markedByName` field.
   */
  teachers?: Set<string>;

  /** "YYYY-MM-DD" or a display string. */
  date: string;
  className?: string;

  /**
   * Called when the user taps the details icon on a student row.
   * The teacher page uses this to jump to the mark tab with the right
   * subject + period preselected.
   */
  onViewSubjectDetails?: (subject: string, period: number) => void;

  /** Optional: whether to show the subject filter chips. Default: true. */
  showSubjectFilter?: boolean;

  /** Optional: the currently highlighted subject filter, controlled by parent. */
  externalSubjectFilter?: string | null;
  onSubjectFilterChange?: (subject: string | null) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

type PeriodQuality = 'empty' | 'excellent' | 'good' | 'fair' | 'poor';

const PERIOD_STYLES: Record<PeriodQuality, string> = {
  empty: 'bg-gray-50 border-gray-200 text-gray-400',
  excellent: 'bg-green-50 border-green-200 text-green-700',
  good: 'bg-blue-50 border-blue-200 text-blue-700',
  fair: 'bg-yellow-50 border-yellow-200 text-yellow-700',
  poor: 'bg-red-50 border-red-200 text-red-700',
};

function statusClass(status: AttendanceStatus): string {
  switch (status) {
    case 'present':
      return 'text-green-600 bg-green-100';
    case 'absent':
      return 'text-red-600 bg-red-100';
    case 'late':
      return 'text-yellow-600 bg-yellow-100';
    case 'excused':
      return 'text-purple-600 bg-purple-100';
    default:
      return 'text-gray-600 bg-gray-100';
  }
}

function rateClass(rate: number): string {
  if (rate < 60) return 'text-red-600';
  if (rate < 75) return 'text-yellow-600';
  return 'text-green-600';
}

function rateBarClass(rate: number): string {
  if (rate < 60) return 'bg-red-500';
  if (rate < 75) return 'bg-yellow-500';
  return 'bg-green-500';
}

function periodQuality(rate: number, total: number): PeriodQuality {
  if (total === 0) return 'empty';
  if (rate >= 90) return 'excellent';
  if (rate >= 75) return 'good';
  if (rate >= 60) return 'fair';
  return 'poor';
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Attendance rate: present + late over total. 0 when empty. */
function attendanceRate(present: number, late: number, total: number): number {
  return total > 0 ? ((present + late) / total) * 100 : 0;
}

// ============================================================================
// SESSION → ROW MAPPING
// ============================================================================

interface DerivedView {
  byPeriod: Record<number, OverviewRow[]>;
  bySubject: Record<string, OverviewRow[]>;
  teachers: Set<string>;
  totalRows: number;
}

/**
 * Convert sessions into the row shape the renderer needs.
 *
 * The studentName / studentGender fields aren't stored in the session doc
 * (only the studentId is), so they'll be empty unless the caller joins them.
 * We accept an optional lookup map to fill them in.
 */
function deriveFromSessions(
  sessions: AttendanceSession[],
  learnerLookup?: Map<string, { name: string; gender?: 'male' | 'female' }>,
): DerivedView {
  const byPeriod: Record<number, OverviewRow[]> = {};
  const bySubject: Record<string, OverviewRow[]> = {};
  const teachers = new Set<string>();
  let totalRows = 0;

  for (let i = 1; i <= 8; i++) byPeriod[i] = [];

  for (const session of sessions) {
    if (session.kind !== 'periodic') continue;
    if (!session.period || !session.subject) continue;

    teachers.add(session.markedByName);

    for (const [studentId, status] of Object.entries(session.roster)) {
      const learner = learnerLookup?.get(studentId);
      const row: OverviewRow = {
        id: `${session.id}_${studentId}`,
        studentId,
        studentName: learner?.name ?? '',
        studentGender: learner?.gender,
        status,
        subject: session.subject,
        period: session.period,
        markedBy: session.markedBy,
        markedByName: session.markedByName,
      };

      byPeriod[session.period].push(row);
      if (!bySubject[session.subject]) bySubject[session.subject] = [];
      bySubject[session.subject].push(row);
      totalRows++;
    }
  }

  return { byPeriod, bySubject, teachers, totalRows };
}

/**
 * Adapt legacy record arrays into the row shape.
 * Fills teachers from the records themselves if not provided.
 */
function deriveFromRecords(
  byPeriod: Record<number, PeriodicAttendanceRecord[]>,
  bySubject: Record<string, PeriodicAttendanceRecord[]>,
  providedTeachers?: Set<string>,
): DerivedView {
  const teachers = providedTeachers ? new Set(providedTeachers) : new Set<string>();
  let totalRows = 0;

  const normalized: Record<number, OverviewRow[]> = {};
  for (let i = 1; i <= 8; i++) normalized[i] = [];

  for (const [periodStr, records] of Object.entries(byPeriod)) {
    const period = Number(periodStr);
    for (const r of records) {
      const row: OverviewRow = {
        id: r.id,
        studentId: r.studentId,
        studentName: r.studentName,
        studentGender: r.studentGender,
        status: r.status,
        subject: r.subject,
        period: r.period,
        markedBy: r.markedBy,
        markedByName: r.markedByName,
      };
      if (!normalized[period]) normalized[period] = [];
      normalized[period].push(row);
      if (!providedTeachers) teachers.add(r.markedByName);
      totalRows++;
    }
  }

  return {
    byPeriod: normalized,
    bySubject: bySubject as any,
    teachers,
    totalRows,
  };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const PeriodicOverview: React.FC<PeriodicOverviewProps> = ({
  sessions,
  byPeriod: byPeriodProp,
  bySubject: bySubjectProp,
  teachers: teachersProp,
  date,
  className = '',
  onViewSubjectDetails,
  showSubjectFilter = true,
  externalSubjectFilter,
  onSubjectFilterChange,
}) => {
  const [expandedPeriod, setExpandedPeriod] = useState<number | null>(null);
  const [internalSubject, setInternalSubject] = useState<string | null>(null);

  // Support both controlled and uncontrolled subject filter.
  const selectedSubject =
    externalSubjectFilter !== undefined ? externalSubjectFilter : internalSubject;

  const setSelectedSubject = (subject: string | null) => {
    if (onSubjectFilterChange) onSubjectFilterChange(subject);
    else setInternalSubject(subject);
  };

  // ── Derive rows ────────────────────────────────────────────────────
  // Prefer sessions when provided. Otherwise adapt legacy record arrays.
  const view: DerivedView = useMemo(() => {
    if (sessions && sessions.length > 0) {
      // No learner lookup here by default — callers that want names joined
      // should either pass `sessions` from a place that already has learners,
      // or use the legacy record path where names are attached.
      return deriveFromSessions(sessions);
    }
    if (byPeriodProp) {
      return deriveFromRecords(
        byPeriodProp,
        bySubjectProp ?? {},
        teachersProp,
      );
    }
    return {
      byPeriod: Object.fromEntries(PERIODS.map(p => [p, []])) as Record<number, OverviewRow[]>,
      bySubject: {},
      teachers: new Set<string>(),
      totalRows: 0,
    };
  }, [sessions, byPeriodProp, bySubjectProp, teachersProp]);

  const { byPeriod, bySubject, teachers } = view;

  // ── Subject summary (top chips) ───────────────────────────────────
  const subjectSummary = useMemo(() => {
    return Object.entries(bySubject)
      .map(([subject, rows]) => {
        const total = rows.length;
        const present = rows.filter(
          r => r.status === 'present' || r.status === 'late',
        ).length;
        const rate = attendanceRate(present, 0, total);
        const teacher = rows[0]?.markedByName || 'Unknown';
        return { subject, total, present, rate, teacher };
      })
      .sort((a, b) => b.rate - a.rate);
  }, [bySubject]);

  // ── Early return: nothing at all ──────────────────────────────────
  if (view.totalRows === 0 && subjectSummary.length === 0) {
    return (
      <div className={`bg-white rounded-xl border border-gray-200 p-8 text-center ${className}`}>
        <Clock size={32} className="text-gray-300 mx-auto mb-2" />
        <p className="text-sm font-medium text-gray-600">
          No periodic attendance recorded
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Teachers haven't marked any periods for {date} yet.
        </p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-purple-50 to-white border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Clock size={18} className="text-purple-600" />
              Periodic Attendance Overview
            </h3>
            <p className="text-sm text-gray-600 mt-0.5">{date}</p>
          </div>

          {teachers.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Teachers:</span>
              <div className="flex -space-x-2">
                {Array.from(teachers).slice(0, 3).map((teacher, i) => (
                  <div
                    key={`${teacher}-${i}`}
                    className="w-6 h-6 rounded-full bg-purple-100 border-2 border-white flex items-center justify-center"
                    title={teacher}
                  >
                    <span className="text-[10px] font-medium text-purple-700">
                      {initials(teacher)}
                    </span>
                  </div>
                ))}
                {teachers.size > 3 && (
                  <div className="w-6 h-6 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center">
                    <span className="text-[10px] font-medium text-gray-600">
                      +{teachers.size - 3}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Subject filter chips */}
      {showSubjectFilter && subjectSummary.length > 0 && (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <Filter size={14} className="text-gray-400 flex-shrink-0" />
            <button
              onClick={() => setSelectedSubject(null)}
              className={`flex-shrink-0 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedSubject === null
                  ? 'bg-purple-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
              }`}
            >
              All
            </button>
            {subjectSummary.map(subj => (
              <button
                key={subj.subject}
                onClick={() =>
                  setSelectedSubject(
                    selectedSubject === subj.subject ? null : subj.subject,
                  )
                }
                className={`flex-shrink-0 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                  selectedSubject === subj.subject
                    ? 'bg-purple-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {subj.subject} ({subj.rate.toFixed(0)}%)
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Period grid */}
      <div className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PERIODS.map(period => {
            const rows = byPeriod[period] ?? [];
            const displayRows = selectedSubject
              ? rows.filter(r => r.subject === selectedSubject)
              : rows;

            // When filtering by subject and this period has none, hide the card.
            if (selectedSubject && displayRows.length === 0) return null;

            const total = displayRows.length;
            const present = displayRows.filter(
              r => r.status === 'present' || r.status === 'late',
            ).length;
            const rate = attendanceRate(present, 0, total);
            const quality = periodQuality(rate, total);
            const isExpanded = expandedPeriod === period;

            // Unique subjects within this period (post-filter).
            const periodSubjects = Array.from(
              new Set(displayRows.map(r => r.subject)),
            );

            return (
              <div
                key={period}
                className={`rounded-lg border transition-all ${PERIOD_STYLES[quality]}`}
              >
                {/* Header */}
                <button
                  type="button"
                  onClick={() => setExpandedPeriod(isExpanded ? null : period)}
                  className="w-full text-left p-3 hover:bg-black/5 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold">Period {period}</span>
                    {total > 0 ? (
                      <span className="text-[10px] font-medium tabular-nums">
                        {rate.toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">No data</span>
                    )}
                  </div>

                  {total > 0 ? (
                    <>
                      <p className="text-xs mb-2">
                        {total} students · {present} present
                      </p>

                      {/* Subject mini-bars */}
                      <div className="space-y-1">
                        {periodSubjects.map(subject => {
                          const subjectRows = displayRows.filter(
                            r => r.subject === subject,
                          );
                          const subjectPresent = subjectRows.filter(
                            r => r.status === 'present' || r.status === 'late',
                          ).length;
                          const subjectRate = attendanceRate(
                            subjectPresent,
                            0,
                            subjectRows.length,
                          );

                          return (
                            <div key={subject} className="text-xs">
                              <div className="flex items-center justify-between">
                                <span className="font-medium truncate max-w-[80px]">
                                  {subject}
                                </span>
                                <span className={rateClass(subjectRate)}>
                                  {subjectRate.toFixed(0)}%
                                </span>
                              </div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${rateBarClass(subjectRate)}`}
                                    style={{ width: `${subjectRate}%` }}
                                  />
                                </div>
                                <span className="text-[8px] text-gray-500 tabular-nums">
                                  {subjectPresent}/{subjectRows.length}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-gray-400 italic">
                      No attendance recorded
                    </p>
                  )}

                  {/* Expand indicator */}
                  <div className="mt-2 flex justify-end">
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && displayRows.length > 0 && (
                  <div className="px-3 pb-3 border-t border-gray-200">
                    <p className="text-xs font-medium mt-2 mb-1">
                      Student Details:
                    </p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {displayRows.map(row => (
                        <div
                          key={row.id}
                          className="flex items-center justify-between text-xs p-1 bg-white/50 rounded"
                        >
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="font-medium truncate max-w-[120px]">
                              {row.studentName || row.studentId}
                            </span>
                            {row.studentGender && (
                              <span
                                className={`text-[8px] px-1 rounded-full flex-shrink-0 ${
                                  row.studentGender === 'male'
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-pink-100 text-pink-700'
                                }`}
                              >
                                {row.studentGender === 'male' ? 'B' : 'G'}
                              </span>
                            )}
                            {selectedSubject === null && periodSubjects.length > 1 && (
                              <span className="text-[8px] text-gray-500 truncate">
                                {row.subject}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span
                              className={`px-1.5 py-0.5 rounded-full text-[8px] ${statusClass(
                                row.status,
                              )}`}
                            >
                              {row.status}
                            </span>
                            {onViewSubjectDetails && (
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  onViewSubjectDetails(row.subject, row.period);
                                }}
                                className="text-gray-400 hover:text-gray-600"
                                title="Mark this period"
                              >
                                <User size={10} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-gray-600">Total Sessions:</span>
            <span className="font-bold text-gray-900 tabular-nums">
              {view.totalRows}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gray-600">Subjects:</span>
            <span className="font-bold text-gray-900 tabular-nums">
              {Object.keys(bySubject).length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-gray-600">Present</span>
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span className="text-gray-600">Absent</span>
            <span className="w-2 h-2 rounded-full bg-yellow-500" />
            <span className="text-gray-600">Late</span>
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            <span className="text-gray-600">Excused</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// COMPACT VARIANT
// ============================================================================

export interface PeriodicOverviewCompactProps {
  sessions?: AttendanceSession[];
  byPeriod?: Record<number, PeriodicAttendanceRecord[]>;
  teachers?: Set<string>;
  date: string;
  className?: string;
}

export const PeriodicOverviewCompact: React.FC<PeriodicOverviewCompactProps> = ({
  sessions,
  byPeriod,
  teachers,
  date,
  className = '',
}) => {
  const view = useMemo(() => {
    if (sessions && sessions.length > 0) {
      return deriveFromSessions(sessions);
    }
    if (byPeriod) {
      return deriveFromRecords(byPeriod, {}, teachers);
    }
    return {
      byPeriod: Object.fromEntries(PERIODS.map(p => [p, []])) as Record<number, OverviewRow[]>,
      bySubject: {},
      teachers: new Set<string>(),
      totalRows: 0,
    };
  }, [sessions, byPeriod, teachers]);

  const { byPeriod: periodMap, bySubject, teachers: derivedTeachers } = view;

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-3 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-gray-900">
          Periodic Attendance
        </h4>
        <span className="text-xs text-gray-500">{date}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {PERIODS.map(period => {
          const rows = periodMap[period] ?? [];
          const hasData = rows.length > 0;
          const present = rows.filter(
            r => r.status === 'present' || r.status === 'late',
          ).length;

          return (
            <div
              key={period}
              className={`flex-1 min-w-[44px] text-center p-1 rounded ${
                hasData ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-400'
              }`}
              title={hasData ? `${present}/${rows.length} present` : 'No data'}
            >
              <div className="text-[10px] font-medium">P{period}</div>
              <div className="text-xs font-bold tabular-nums">
                {hasData ? rows.length : '–'}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 text-[10px] text-gray-500 flex items-center justify-between">
        <span>{derivedTeachers.size} teachers</span>
        <span>{Object.keys(bySubject).length} subjects</span>
      </div>
    </div>
  );
};

export default PeriodicOverview;