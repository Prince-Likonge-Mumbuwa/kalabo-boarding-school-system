// components/attendance/CompactStats.tsx
import React from 'react';
import {
  UserCheck,
  UserX,
  Clock,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface CompactStatsProps {
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;

  /**
   * Optional comparison point. When present, each stat can show a trend chip.
   * Ignored unless `showTrends` is true.
   */
  previousPeriod?: {
    present: number;
    absent: number;
    late: number;
    excused: number;
    total: number;
  };

  /** Turn on the trend chips. Default: false. */
  showTrends?: boolean;

  /**
   * Which metric the "rate" reads.
   *   'present'  → present / total         (raw present share)
   *   'rate'     → (present + late) / total (attendance rate)
   *
   * Default: 'rate'. The name "rate" matches the rest of the codebase
   * (getDailyStats, getSchoolAttendanceSummary, rollup.daily.rate).
   */
  rateMode?: 'present' | 'rate';

  /** Visual density. Default: 'default'. */
  variant?: 'default' | 'compact';

  className?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Direction of "good" for each stat.
 * Present going up is good. Absent/Late/Excused going up is bad.
 * Used to pick the right color for the trend arrow.
 */
type GoodDirection = 'up' | 'down';

const STAT_CONFIG: Record<
  'Present' | 'Absent' | 'Late' | 'Excused',
  { goodDirection: GoodDirection }
> = {
  Present: { goodDirection: 'up' },
  Absent: { goodDirection: 'down' },
  Late: { goodDirection: 'down' },
  Excused: { goodDirection: 'down' },
};

interface TrendInfo {
  Icon: typeof TrendingUp;
  className: string;
  label: string;
}

/**
 * Compute a trend chip for a stat. Returns null when there's no baseline to
 * compare against, or when the change is within a neutral band.
 *
 * The neutral band is ±5 percentage points of *relative* change. This means
 * "present went from 20 → 21" is neutral, but "absent went from 2 → 8" is a
 * clear signal.
 */
function computeTrend(
  current: number,
  previous: number,
  goodDirection: GoodDirection,
): TrendInfo | null {
  if (previous === 0) return null;

  const diff = ((current - previous) / previous) * 100;
  if (Math.abs(diff) < 5) {
    return { Icon: Minus, className: 'text-gray-400', label: 'stable' };
  }

  const isUp = diff > 0;
  const isGood = (isUp && goodDirection === 'up') || (!isUp && goodDirection === 'down');

  return {
    Icon: isUp ? TrendingUp : TrendingDown,
    className: isGood ? 'text-green-600' : 'text-red-600',
    label: `${isUp ? '+' : ''}${diff.toFixed(0)}%`,
  };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const CompactStats: React.FC<CompactStatsProps> = ({
  present,
  absent,
  late,
  excused,
  total,
  previousPeriod,
  showTrends = false,
  rateMode = 'rate',
  variant = 'default',
  className = '',
}) => {
  // ── Percentages ────────────────────────────────────────────────────
  // The "Present" card shows the *attendance rate* when rateMode='rate'
  // (matches the rest of the codebase), otherwise the raw present share.
  const presentDisplay =
    rateMode === 'rate' && total > 0 ? ((present + late) / total) * 100 : total > 0 ? (present / total) * 100 : 0;

  const presentPercent = total > 0 ? (present / total) * 100 : 0;
  const absentPercent = total > 0 ? (absent / total) * 100 : 0;
  const latePercent = total > 0 ? (late / total) * 100 : 0;
  const excusedPercent = total > 0 ? (excused / total) * 100 : 0;

  // ── Trend chips ────────────────────────────────────────────────────
  const canShowTrends = showTrends && !!previousPeriod;

  const presentTrend = canShowTrends
    ? computeTrend(present, previousPeriod.present, STAT_CONFIG.Present.goodDirection)
    : null;
  const absentTrend = canShowTrends
    ? computeTrend(absent, previousPeriod.absent, STAT_CONFIG.Absent.goodDirection)
    : null;
  const lateTrend = canShowTrends
    ? computeTrend(late, previousPeriod.late, STAT_CONFIG.Late.goodDirection)
    : null;
  const excusedTrend = canShowTrends
    ? computeTrend(excused, previousPeriod.excused, STAT_CONFIG.Excused.goodDirection)
    : null;

  // ── Card data ──────────────────────────────────────────────────────
  const stats = [
    {
      key: 'present' as const,
      label: 'Present',
      value: present,
      percent: presentDisplay,
      barPercent: presentPercent,
      Icon: UserCheck,
      color: 'text-green-600',
      bg: 'bg-green-100',
      barColor: 'bg-green-500',
      trend: presentTrend,
    },
    {
      key: 'absent' as const,
      label: 'Absent',
      value: absent,
      percent: absentPercent,
      barPercent: absentPercent,
      Icon: UserX,
      color: 'text-red-600',
      bg: 'bg-red-100',
      barColor: 'bg-red-500',
      trend: absentTrend,
    },
    {
      key: 'late' as const,
      label: 'Late',
      value: late,
      percent: latePercent,
      barPercent: latePercent,
      Icon: Clock,
      color: 'text-yellow-600',
      bg: 'bg-yellow-100',
      barColor: 'bg-yellow-500',
      trend: lateTrend,
    },
    {
      key: 'excused' as const,
      label: 'Excused',
      value: excused,
      percent: excusedPercent,
      barPercent: excusedPercent,
      Icon: AlertCircle,
      color: 'text-purple-600',
      bg: 'bg-purple-100',
      barColor: 'bg-purple-500',
      trend: excusedTrend,
    },
  ];

  const dense = variant === 'compact';

  return (
    <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 ${className}`}>
      {stats.map(stat => (
        <div
          key={stat.key}
          className={`bg-white rounded-lg border border-gray-200 hover:shadow-sm transition-shadow ${
            dense ? 'p-1.5' : 'p-2'
          }`}
        >
          {/* Header: label + icon */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] sm:text-xs font-medium text-gray-500 truncate">
              {stat.label}
            </span>
            <div className={`p-1 rounded-full ${stat.bg} flex-shrink-0`}>
              <stat.Icon size={10} className={`sm:w-3 sm:h-3 ${stat.color}`} />
            </div>
          </div>

          {/* Value + percent */}
          <div className="flex items-baseline justify-between gap-1">
            <span
              className={`font-bold text-gray-900 ${
                dense ? 'text-xs sm:text-sm' : 'text-sm sm:text-base lg:text-lg'
              }`}
            >
              {stat.value}
            </span>
            <span className="text-[10px] sm:text-xs text-gray-500 tabular-nums">
              {stat.percent.toFixed(0)}%
            </span>
          </div>

          {/* Trend chip */}
          {canShowTrends && stat.trend && (
            <div className="mt-1 flex items-center gap-0.5">
              <stat.trend.Icon size={10} className={stat.trend.className} />
              <span className={`text-[8px] sm:text-[10px] ${stat.trend.className}`}>
                {stat.trend.label}
              </span>
            </div>
          )}

          {/* Mini progress bar (larger screens only) */}
          {!dense && (
            <div className="hidden sm:block mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${stat.barColor}`}
                style={{ width: `${Math.min(stat.barPercent, 100)}%` }}
              />
            </div>
          )}
        </div>
      ))}

      {/* Total badge (mobile only) */}
      <div className="col-span-2 sm:hidden mt-1">
        <div className="bg-blue-50 rounded-lg px-3 py-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-blue-700">Total Students</span>
          <span className="text-sm font-bold text-blue-800 tabular-nums">{total}</span>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// HORIZONTAL VARIANT
// ============================================================================

export interface CompactStatsHorizontalProps {
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  className?: string;
}

export const CompactStatsHorizontal: React.FC<CompactStatsHorizontalProps> = ({
  present,
  absent,
  late,
  excused,
  total,
  className = '',
}) => {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <div className="flex items-center gap-1">
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-xs text-gray-600">
          P: <span className="tabular-nums">{present}</span>
        </span>
      </div>
      <div className="flex items-center gap-1">
        <div className="w-2 h-2 rounded-full bg-red-500" />
        <span className="text-xs text-gray-600">
          A: <span className="tabular-nums">{absent}</span>
        </span>
      </div>
      <div className="flex items-center gap-1">
        <div className="w-2 h-2 rounded-full bg-yellow-500" />
        <span className="text-xs text-gray-600">
          L: <span className="tabular-nums">{late}</span>
        </span>
      </div>
      <div className="flex items-center gap-1">
        <div className="w-2 h-2 rounded-full bg-purple-500" />
        <span className="text-xs text-gray-600">
          E: <span className="tabular-nums">{excused}</span>
        </span>
      </div>
      <div className="flex items-center gap-1 ml-auto">
        <span className="text-xs font-medium text-gray-700">Total:</span>
        <span className="text-sm font-bold text-blue-600 tabular-nums">{total}</span>
      </div>
    </div>
  );
};

export default CompactStats;