// components/attendance/RiskAnalysisCard.tsx
import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  BookOpen,
  ChevronDown,
  ChevronUp,
  User,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import type {
  RiskAnalysis,
  StudentAttendanceIndex,
} from '@/types/attendance';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Union of what a "risk card" can display. Two sources are supported:
 *
 *   1. `RiskAnalysis`            — legacy, computed per-student via
 *                                  getStudentRiskAnalysis (fan-out).
 *   2. `StudentAttendanceIndex`  — pre-computed nightly, read in one query.
 *
 * Both are normalized to a single internal shape before render.
 */
export type RiskCardSource =
  | { kind: 'analysis'; data: RiskAnalysis }
  | { kind: 'index'; data: StudentAttendanceIndex };

export interface RiskAnalysisCardProps {
  /**
   * The risk data to render. Prefer `{ kind: 'index', data }` where possible.
   * The card's visual result is identical either way.
   */
  source: RiskCardSource;

  /** Optional click handler for the "View Details" button. */
  onViewDetails?: (studentId: string) => void;

  /**
   * Whether the card starts expanded. Only applied on mount; internal state
   * takes over after that. To force-collapse, remount with a new key.
   */
  defaultExpanded?: boolean;

  /**
   * Show the mini subject / incident lists inside the expanded section.
   * Turn off in dense dashboards. Default: true.
   */
  showDetailSections?: boolean;

  className?: string;
}

// ============================================================================
// NORMALIZED VIEW MODEL
// ============================================================================
//
// The card never touches the source shape after this step. Everything the
// render needs is here, including sensible defaults for fields that exist
// in one source but not the other.

interface RiskCardView {
  studentId: string;
  studentName: string;
  className: string;
  gender?: 'male' | 'female';
  riskLevel: 'high' | 'medium' | 'low';
  riskFactors: string[];
  consecutiveAbsences: number;
  overallRate: number; // 0–100

  /** Subject rows to show in the expanded section. Empty when unavailable. */
  subjectStats: Array<{
    subject: string;
    teacherName: string;
    totalSessions: number;
    present: number;
    rate: number;
    trend: 'improving' | 'declining' | 'stable';
  }>;

  /** Ditching incidents. Empty when unavailable. */
  ditchingIncidents: Array<{
    date: string;
    subject: string;
    period: number;
  }>;

  /** Late arrivals. Empty when unavailable. */
  lateArrivals: Array<{
    date: string;
    firstPeriodSubject: string;
    arrivalTime?: string;
  }>;

  /** Rolling windows (available only from the index source). */
  windowStats?: {
    last7Days: { rate: number; total: number };
    last30Days: { rate: number; total: number };
  };
}

function normalizeSource(source: RiskCardSource): RiskCardView {
  if (source.kind === 'analysis') {
    const a = source.data;
    return {
      studentId: a.studentId,
      studentName: a.studentName,
      className: a.className,
      gender: a.gender,
      riskLevel: a.riskLevel,
      riskFactors: a.riskFactors,
      consecutiveAbsences: a.consecutiveAbsences,
      overallRate: a.dailyStats.rate,
      subjectStats: a.subjectStats,
      ditchingIncidents: a.ditchingIncidents.map(d => ({
        date: d.date,
        subject: d.subject,
        period: d.period,
      })),
      lateArrivals: a.lateArrivals.map(l => ({
        date: l.date,
        firstPeriodSubject: l.firstPeriodSubject,
        arrivalTime: l.arrivalTime,
      })),
    };
  }

  const idx = source.data;
  return {
    studentId: idx.studentId,
    studentName: idx.studentName,
    className: idx.className,
    riskLevel: idx.riskLevel,
    riskFactors: idx.riskFactors,
    consecutiveAbsences: idx.consecutiveAbsences,
    overallRate: idx.last30Days.rate,
    subjectStats: [], // not stored on the index; loaded separately if needed
    ditchingIncidents: idx.recentDitching.map(d => ({
      date: d.date,
      subject: d.subject,
      period: d.period,
    })),
    lateArrivals: idx.recentLate.map(l => ({
      date: l.date,
      firstPeriodSubject: l.firstPeriodSubject,
    })),
    windowStats: {
      last7Days: { rate: idx.last7Days.rate, total: idx.last7Days.total },
      last30Days: { rate: idx.last30Days.rate, total: idx.last30Days.total },
    },
  };
}

// ============================================================================
// STYLE HELPERS
// ============================================================================

const RISK_STYLES = {
  high: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    badge: 'bg-red-100 text-red-800',
    icon: 'text-red-500',
  },
  medium: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    text: 'text-yellow-700',
    badge: 'bg-yellow-100 text-yellow-800',
    icon: 'text-yellow-500',
  },
  low: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
    badge: 'bg-green-100 text-green-800',
    icon: 'text-green-500',
  },
} as const;

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

function TrendIcon({ trend }: { trend: 'improving' | 'declining' | 'stable' }) {
  if (trend === 'improving') return <TrendingUp size={10} className="text-green-600" />;
  if (trend === 'declining') return <TrendingDown size={10} className="text-red-600" />;
  return <Minus size={10} className="text-gray-400" />;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const RiskAnalysisCard: React.FC<RiskAnalysisCardProps> = ({
  source,
  onViewDetails,
  defaultExpanded = false,
  showDetailSections = true,
  className = '',
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const view = useMemo(() => normalizeSource(source), [source]);
  const colors = RISK_STYLES[view.riskLevel];

  const hasSubjects = view.subjectStats.length > 0;
  const hasDitching = view.ditchingIncidents.length > 0;
  const hasLate = view.lateArrivals.length > 0;
  const hasFactors = view.riskFactors.length > 0;

  return (
    <div
      className={`rounded-xl border ${colors.border} ${colors.bg} overflow-hidden transition-all duration-200 hover:shadow-md ${className}`}
    >
      {/* ── Header (always visible) ────────────────────────────────── */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-gray-900 truncate">
                {view.studentName}
              </h4>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${colors.badge}`}
              >
                {view.riskLevel.toUpperCase()}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="text-gray-600 truncate">{view.className}</span>
              <span className={`font-medium tabular-nums ${rateClass(view.overallRate)}`}>
                {view.overallRate.toFixed(1)}% Overall
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="p-1 hover:bg-white/50 rounded-lg transition-colors flex-shrink-0"
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse details' : 'Expand details'}
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-white/50 rounded-lg p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-gray-600">
              <Calendar size={12} />
              <span>Consecutive</span>
            </div>
            <p className="text-lg font-bold text-gray-900 tabular-nums">
              {view.consecutiveAbsences}
            </p>
          </div>

          <div className="bg-white/50 rounded-lg p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-gray-600">
              <AlertTriangle size={12} />
              <span>Ditching</span>
            </div>
            <p
              className={`text-lg font-bold tabular-nums ${
                view.ditchingIncidents.length > 0 ? 'text-orange-600' : 'text-gray-400'
              }`}
            >
              {view.ditchingIncidents.length}
            </p>
          </div>

          <div className="bg-white/50 rounded-lg p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-gray-600">
              <Clock size={12} />
              <span>Late</span>
            </div>
            <p
              className={`text-lg font-bold tabular-nums ${
                view.lateArrivals.length > 0 ? 'text-yellow-600' : 'text-gray-400'
              }`}
            >
              {view.lateArrivals.length}
            </p>
          </div>
        </div>

        {/* Rolling windows (only present for index source) */}
        {view.windowStats && (
          <div className="flex items-center gap-3 mt-3 text-[10px] text-gray-500">
            <span>
              7d:{' '}
              <span className={`font-medium tabular-nums ${rateClass(view.windowStats.last7Days.rate)}`}>
                {view.windowStats.last7Days.rate.toFixed(0)}%
              </span>
            </span>
            <span>
              30d:{' '}
              <span className={`font-medium tabular-nums ${rateClass(view.windowStats.last30Days.rate)}`}>
                {view.windowStats.last30Days.rate.toFixed(0)}%
              </span>
            </span>
          </div>
        )}
      </div>

      {/* ── Expanded ─────────────────────────────────────────────────── */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Risk factors */}
          {hasFactors && (
            <div className="bg-white/70 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-1">
                <AlertCircle size={12} className={colors.icon} />
                Risk Factors
              </p>
              <ul className="space-y-1">
                {view.riskFactors.map((factor, i) => (
                  <li
                    key={`${factor}-${i}`}
                    className="text-xs text-gray-600 flex items-start gap-1"
                  >
                    <span className="text-red-400 flex-shrink-0">•</span>
                    <span>{factor}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Subject performance */}
          {showDetailSections && hasSubjects && (
            <div className="bg-white/70 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-1">
                <BookOpen size={12} className="text-blue-500" />
                Subject Performance
              </p>
              <div className="space-y-2">
                {view.subjectStats.slice(0, 5).map(subject => (
                  <div key={subject.subject} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-700 truncate">
                        {subject.subject}
                      </span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span
                          className={`font-medium tabular-nums ${rateClass(subject.rate)}`}
                        >
                          {subject.rate.toFixed(0)}%
                        </span>
                        <TrendIcon trend={subject.trend} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${rateBarClass(subject.rate)}`}
                          style={{ width: `${Math.min(subject.rate, 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500 tabular-nums">
                        {subject.present}/{subject.totalSessions}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500 truncate">
                      Teacher: {subject.teacherName}
                    </p>
                  </div>
                ))}
                {view.subjectStats.length > 5 && (
                  <p className="text-[10px] text-gray-500 text-center pt-1">
                    +{view.subjectStats.length - 5} more subjects
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Ditching incidents */}
          {showDetailSections && hasDitching && (
            <div className="bg-white/70 rounded-lg p-3">
              <p className="text-xs font-medium text-orange-700 mb-2">
                Ditching Incidents ({view.ditchingIncidents.length})
              </p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {view.ditchingIncidents.slice(0, 10).map((incident, i) => (
                  <div
                    key={`${incident.date}-${incident.subject}-${i}`}
                    className="text-xs flex items-center justify-between gap-2"
                  >
                    <span className="text-gray-600 tabular-nums">{incident.date}</span>
                    <span className="font-medium text-gray-700 truncate">
                      {incident.subject}
                    </span>
                    <span className="text-gray-500 flex-shrink-0">
                      Period {incident.period}
                    </span>
                  </div>
                ))}
                {view.ditchingIncidents.length > 10 && (
                  <p className="text-[10px] text-gray-500 text-center pt-1">
                    +{view.ditchingIncidents.length - 10} more
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Late arrivals */}
          {showDetailSections && hasLate && (
            <div className="bg-white/70 rounded-lg p-3">
              <p className="text-xs font-medium text-yellow-700 mb-2">
                Late Arrivals ({view.lateArrivals.length})
              </p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {view.lateArrivals.slice(0, 10).map((late, i) => (
                  <div
                    key={`${late.date}-${i}`}
                    className="text-xs flex items-center justify-between gap-2"
                  >
                    <span className="text-gray-600 tabular-nums">{late.date}</span>
                    <span className="font-medium text-gray-700 truncate">
                      {late.firstPeriodSubject}
                    </span>
                    <span className="text-gray-500 flex-shrink-0">
                      {late.arrivalTime ?? ''}
                    </span>
                  </div>
                ))}
                {view.lateArrivals.length > 10 && (
                  <p className="text-[10px] text-gray-500 text-center pt-1">
                    +{view.lateArrivals.length - 10} more
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Empty expanded state */}
          {!hasFactors && !hasSubjects && !hasDitching && !hasLate && (
            <div className="bg-white/70 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 italic">
                No additional details available.
              </p>
            </div>
          )}

          {/* View details CTA */}
          {onViewDetails && (
            <button
              type="button"
              onClick={() => onViewDetails(view.studentId)}
              className="w-full px-3 py-2 bg-white/80 hover:bg-white rounded-lg text-xs font-medium text-gray-700 transition-colors flex items-center justify-center gap-1"
            >
              <User size={12} />
              View Full Details
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default RiskAnalysisCard;