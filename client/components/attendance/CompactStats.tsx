// components/attendance/CompactStats.tsx
import React from 'react';
import { 
  UserCheck, 
  UserX, 
  Clock, 
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react';

interface CompactStatsProps {
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
  previousPeriod?: {
    present: number;
    absent: number;
    late: number;
    excused: number;
    total: number;
  };
  showTrends?: boolean;
  className?: string;
}

export const CompactStats: React.FC<CompactStatsProps> = ({
  present,
  absent,
  late,
  excused,
  total,
  previousPeriod,
  showTrends = false,
  className = ''
}) => {
  // Calculate percentages
  const presentPercent = total > 0 ? (present / total) * 100 : 0;
  const absentPercent = total > 0 ? (absent / total) * 100 : 0;
  const latePercent = total > 0 ? (late / total) * 100 : 0;
  const excusedPercent = total > 0 ? (excused / total) * 100 : 0;

  // Calculate trends if previous period data is available
  const getTrend = (current: number, previous: number) => {
    if (!previousPeriod || previous === 0) return null;
    const diff = ((current - previous) / previous) * 100;
    if (Math.abs(diff) < 5) return { icon: Minus, color: 'text-gray-400', value: 'stable' };
    return {
      icon: diff > 0 ? TrendingUp : TrendingDown,
      color: diff > 0 ? 'text-green-500' : 'text-red-500',
      value: `${diff > 0 ? '+' : ''}${diff.toFixed(0)}%`
    };
  };

  const stats = [
    {
      label: 'Present',
      value: present,
      percent: presentPercent,
      icon: UserCheck,
      color: 'text-green-600',
      bg: 'bg-green-100',
      trend: showTrends && previousPeriod 
        ? getTrend(present, previousPeriod.present)
        : null
    },
    {
      label: 'Absent',
      value: absent,
      percent: absentPercent,
      icon: UserX,
      color: 'text-red-600',
      bg: 'bg-red-100',
      trend: showTrends && previousPeriod 
        ? getTrend(absent, previousPeriod.absent)
        : null
    },
    {
      label: 'Late',
      value: late,
      percent: latePercent,
      icon: Clock,
      color: 'text-yellow-600',
      bg: 'bg-yellow-100',
      trend: showTrends && previousPeriod 
        ? getTrend(late, previousPeriod.late)
        : null
    },
    {
      label: 'Excused',
      value: excused,
      percent: excusedPercent,
      icon: AlertCircle,
      color: 'text-purple-600',
      bg: 'bg-purple-100',
      trend: showTrends && previousPeriod 
        ? getTrend(excused, previousPeriod.excused)
        : null
    }
  ];

  return (
    <div className={`grid grid-cols-2 sm:grid-cols-4 gap-2 ${className}`}>
      {stats.map(stat => (
        <div
          key={stat.label}
          className="bg-white rounded-lg border border-gray-200 p-2 hover:shadow-sm transition-shadow"
        >
          {/* Header with icon and label */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] sm:text-xs font-medium text-gray-500 truncate">
              {stat.label}
            </span>
            <div className={`p-1 rounded-full ${stat.bg} flex-shrink-0`}>
              <stat.icon size={10} className={`sm:w-3 sm:h-3 ${stat.color}`} />
            </div>
          </div>

          {/* Main value */}
          <div className="flex items-baseline justify-between">
            <span className="text-sm sm:text-base lg:text-lg font-bold text-gray-900">
              {stat.value}
            </span>
            <span className="text-[10px] sm:text-xs text-gray-500">
              {stat.percent.toFixed(0)}%
            </span>
          </div>

          {/* Trend indicator (if enabled) */}
          {showTrends && stat.trend && (
            <div className="mt-1 flex items-center gap-0.5">
              <stat.trend.icon size={10} className={stat.trend.color} />
              <span className={`text-[8px] sm:text-[10px] ${stat.trend.color}`}>
                {stat.trend.value}
              </span>
            </div>
          )}

          {/* Mini progress bar (visible on larger screens) */}
          <div className="hidden sm:block mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                stat.label === 'Present' ? 'bg-green-500' :
                stat.label === 'Absent' ? 'bg-red-500' :
                stat.label === 'Late' ? 'bg-yellow-500' :
                'bg-purple-500'
              }`}
              style={{ width: `${stat.percent}%` }}
            />
          </div>
        </div>
      ))}

      {/* Total badge (mobile only) */}
      <div className="col-span-2 sm:hidden mt-1">
        <div className="bg-blue-50 rounded-lg px-3 py-1.5 flex items-center justify-between">
          <span className="text-xs font-medium text-blue-700">Total Students</span>
          <span className="text-sm font-bold text-blue-800">{total}</span>
        </div>
      </div>
    </div>
  );
};

// Alternative horizontal layout for smaller spaces
export const CompactStatsHorizontal: React.FC<CompactStatsProps> = ({
  present,
  absent,
  late,
  excused,
  total,
  className = ''
}) => {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <div className="flex items-center gap-1">
        <div className="w-2 h-2 rounded-full bg-green-500" />
        <span className="text-xs text-gray-600">P: {present}</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="w-2 h-2 rounded-full bg-red-500" />
        <span className="text-xs text-gray-600">A: {absent}</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="w-2 h-2 rounded-full bg-yellow-500" />
        <span className="text-xs text-gray-600">L: {late}</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="w-2 h-2 rounded-full bg-purple-500" />
        <span className="text-xs text-gray-600">E: {excused}</span>
      </div>
      <div className="flex items-center gap-1 ml-auto">
        <span className="text-xs font-medium text-gray-700">Total:</span>
        <span className="text-sm font-bold text-blue-600">{total}</span>
      </div>
    </div>
  );
};