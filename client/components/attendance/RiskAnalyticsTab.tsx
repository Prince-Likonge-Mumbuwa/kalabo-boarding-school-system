// components/attendance/RiskAnalyticsTab.tsx
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { attendanceService } from '@/services/attendanceService';
import type { StudentAttendanceIndex } from '@/types/attendance';
import { RiskAnalysisCard } from './RiskAnalysisCard';
import { exportRiskAnalysis } from '@/utils/exportUtils';
import {
  Loader2,
  AlertTriangle,
  Filter,
  Download,
  ChevronDown,
  BarChart3,
  Users,
  Calendar,
  RefreshCw,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface RiskAnalyticsTabProps {
  classId: string;
  className: string;
  isFormTeacher: boolean;
  teacherName?: string;
}

type RiskFilter = 'all' | 'high' | 'medium' | 'low';
type SortBy = 'risk' | 'name' | 'attendance' | 'consecutive';

// ============================================================================
// CONSTANTS
// ============================================================================

const RISK_ORDER: Record<StudentAttendanceIndex['riskLevel'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const RiskAnalyticsTab: React.FC<RiskAnalyticsTabProps> = ({
  classId,
  className,
  isFormTeacher,
  teacherName,
}) => {
  const [filter, setFilter] = useState<RiskFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('risk');
  const [showFilters, setShowFilters] = useState(false);

  // ── One query, no fan-out ──────────────────────────────────────────
  const indexQuery = useQuery({
    queryKey: ['attendance_student_index', 'class', classId],
    queryFn: () => attendanceService.getClassStudentIndex(classId),
    enabled: !!classId && isFormTeacher,
    staleTime: 5 * 60_000,       // 5 min — index only changes on the nightly rebuild
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false, // nightly rebuild, so no need to refetch on focus
  });

  const indexes: StudentAttendanceIndex[] = indexQuery.data ?? [];

  // ── Filter + sort ──────────────────────────────────────────────────
  const filteredAndSorted = useMemo(() => {
    let result = indexes;

    if (filter !== 'all') {
      result = result.filter(i => i.riskLevel === filter);
    }

    return [...result].sort((a, b) => {
      switch (sortBy) {
        case 'risk': {
          const ra = RISK_ORDER[a.riskLevel];
          const rb = RISK_ORDER[b.riskLevel];
          if (ra !== rb) return ra - rb;
          return a.last30Days.rate - b.last30Days.rate;
        }
        case 'name':
          return a.studentName.localeCompare(b.studentName);
        case 'attendance':
          return a.last30Days.rate - b.last30Days.rate;
        case 'consecutive':
          return b.consecutiveAbsences - a.consecutiveAbsences;
        default:
          return 0;
      }
    });
  }, [indexes, filter, sortBy]);

  // ── Aggregate stats ────────────────────────────────────────────────
  const stats = useMemo(() => {
    let high = 0;
    let medium = 0;
    let low = 0;
    let rateSum = 0;
    let ditchingSum = 0;
    let lateSum = 0;

    for (const idx of indexes) {
      if (idx.riskLevel === 'high') high++;
      else if (idx.riskLevel === 'medium') medium++;
      else low++;

      rateSum += idx.last30Days.rate;
      ditchingSum += idx.recentDitching.length;
      lateSum += idx.recentLate.length;
    }

    const total = indexes.length;
    return {
      high,
      medium,
      low,
      total,
      avgAttendance: total > 0 ? rateSum / total : 0,
      totalDitching: ditchingSum,
      totalLate: lateSum,
    };
  }, [indexes]);

  // ── Export ─────────────────────────────────────────────────────────
  const handleExport = () => {
    // exportRiskAnalysis expects the legacy shape; adapt on the way out
    // so the CSV schema stays unchanged.
    const rows = filteredAndSorted.map(idx => ({
      studentId: idx.studentId,
      studentName: idx.studentName,
      className: idx.className,
      gender: undefined,
      dailyStats: {
        total: idx.last30Days.total,
        present: idx.last30Days.present,
        absent: idx.last30Days.absent,
        late: idx.last30Days.late,
        excused: idx.last30Days.excused,
        rate: idx.last30Days.rate,
      },
      subjectStats: [],
      ditchingIncidents: idx.recentDitching,
      lateArrivals: idx.recentLate.map(l => ({
        date: l.date,
        firstPeriodSubject: l.firstPeriodSubject,
        firstPeriodTeacher: '',
      })),
      riskLevel: idx.riskLevel,
      riskFactors: idx.riskFactors,
      consecutiveAbsences: idx.consecutiveAbsences,
    }));
    exportRiskAnalysis(rows as any, `risk_analysis_${className}_30days`);
  };

  // ── Access guard ───────────────────────────────────────────────────
  if (!isFormTeacher) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
        <AlertTriangle size={32} className="text-yellow-500 mx-auto mb-2" />
        <h3 className="font-semibold text-yellow-700">Form Teacher Access Only</h3>
        <p className="text-sm text-yellow-600 mt-1">
          Only form teachers can view risk analytics for their class.
        </p>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile
          label="High Risk"
          value={stats.high}
          percent={stats.total > 0 ? (stats.high / stats.total) * 100 : 0}
          tone="red"
        />
        <StatTile
          label="Medium Risk"
          value={stats.medium}
          percent={stats.total > 0 ? (stats.medium / stats.total) * 100 : 0}
          tone="yellow"
        />
        <StatTile
          label="Low Risk"
          value={stats.low}
          percent={stats.total > 0 ? (stats.low / stats.total) * 100 : 0}
          tone="green"
        />
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
          <p className="text-xs text-blue-600 font-medium">Class Average</p>
          <p className="text-2xl font-bold text-blue-700 tabular-nums">
            {stats.avgAttendance.toFixed(1)}%
          </p>
          <p className="text-xs text-blue-500 mt-1">
            {stats.totalDitching} ditching · {stats.totalLate} late
          </p>
        </div>
      </div>

      {/* Alert strip */}
      {(stats.totalDitching > 0 || stats.totalLate > 0) && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
          <div className="flex items-center gap-3 text-sm">
            <AlertTriangle size={16} className="text-orange-600 flex-shrink-0" />
            <span className="text-orange-700">
              <strong>{stats.totalDitching}</strong> ditching incidents and{' '}
              <strong>{stats.totalLate}</strong> late arrivals detected in the last 30 days
            </span>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowFilters(v => !v)}
          className="w-full flex items-center justify-between p-4 sm:hidden"
          aria-expanded={showFilters}
        >
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Filters & Sort</span>
          </div>
          <ChevronDown
            size={16}
            className={`transition-transform ${showFilters ? 'rotate-180' : ''}`}
          />
        </button>

        <div className={`p-4 ${showFilters ? 'block' : 'hidden sm:block'}`}>
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={filter}
              onChange={e => setFilter(e.target.value as RiskFilter)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="all">All Risk Levels</option>
              <option value="high">High Risk Only</option>
              <option value="medium">Medium Risk Only</option>
              <option value="low">Low Risk Only</option>
            </select>

            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortBy)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="risk">Sort by Risk Level</option>
              <option value="name">Sort by Name</option>
              <option value="attendance">Sort by Attendance %</option>
              <option value="consecutive">Sort by Consecutive Absences</option>
            </select>

            <button
              type="button"
              onClick={() => indexQuery.refetch()}
              disabled={indexQuery.isFetching}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw
                size={14}
                className={indexQuery.isFetching ? 'animate-spin' : ''}
              />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              type="button"
              onClick={handleExport}
              disabled={filteredAndSorted.length === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 sm:ml-auto"
            >
              <Download size={16} />
              <span>Export</span>
            </button>
          </div>
        </div>
      </div>

      {/* Results summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-gray-400" />
          <span className="text-sm text-gray-600">
            Showing <strong>{filteredAndSorted.length}</strong> of{' '}
            <strong>{indexes.length}</strong> students
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-gray-400" />
          <span className="text-sm text-gray-600">Last 30 days</span>
        </div>
      </div>

      {/* Grid */}
      {indexQuery.isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 bg-white rounded-xl border border-gray-200">
          <Loader2 size={32} className="animate-spin text-blue-600 mb-3" />
          <p className="text-sm text-gray-600">Loading risk analytics…</p>
        </div>
      ) : indexQuery.isError ? (
        <div className="text-center py-12 bg-red-50 rounded-xl border border-red-200">
          <AlertTriangle size={32} className="text-red-500 mx-auto mb-2" />
          <p className="text-red-700 font-medium">Failed to load risk analytics</p>
          <button
            type="button"
            onClick={() => indexQuery.refetch()}
            className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm"
          >
            Try Again
          </button>
        </div>
      ) : filteredAndSorted.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAndSorted.map(idx => (
            <RiskAnalysisCard
              key={idx.studentId}
              source={{ kind: 'index', data: idx }}
              onViewDetails={studentId => {
                console.log('View details for:', studentId);
              }}
            />
          ))}
        </div>
      ) : indexes.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
          <BarChart3 size={32} className="text-gray-400 mx-auto mb-2" />
          <p className="text-gray-600 font-medium">No attendance index for this class yet</p>
          <p className="text-sm text-gray-500 mt-1">
            The index is rebuilt nightly. Check back tomorrow, or refresh if you expect data.
          </p>
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
          <BarChart3 size={32} className="text-gray-400 mx-auto mb-2" />
          <p className="text-gray-600 font-medium">No students match the selected filter</p>
          <p className="text-sm text-gray-500 mt-1">
            Try adjusting your filters
          </p>
        </div>
      )}

      {teacherName && (
        <div className="text-xs text-gray-400 text-right pt-2">
          Analyzed by {teacherName} · {new Date().toLocaleDateString()}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// STAT TILE
// ============================================================================

function StatTile({
  label,
  value,
  percent,
  tone,
}: {
  label: string;
  value: number;
  percent: number;
  tone: 'red' | 'yellow' | 'green';
}) {
  const tones = {
    red: {
      bg: 'bg-gradient-to-br from-red-50 to-red-100',
      border: 'border-red-200',
      label: 'text-red-600',
      value: 'text-red-700',
      sub: 'text-red-500',
    },
    yellow: {
      bg: 'bg-gradient-to-br from-yellow-50 to-yellow-100',
      border: 'border-yellow-200',
      label: 'text-yellow-600',
      value: 'text-yellow-700',
      sub: 'text-yellow-500',
    },
    green: {
      bg: 'bg-gradient-to-br from-green-50 to-green-100',
      border: 'border-green-200',
      label: 'text-green-600',
      value: 'text-green-700',
      sub: 'text-green-500',
    },
  }[tone];

  return (
    <div className={`${tones.bg} rounded-xl p-4 border ${tones.border}`}>
      <p className={`text-xs ${tones.label} font-medium`}>{label}</p>
      <p className={`text-2xl font-bold ${tones.value} tabular-nums`}>{value}</p>
      <p className={`text-xs ${tones.sub} mt-1 tabular-nums`}>
        {percent.toFixed(0)}% of class
      </p>
    </div>
  );
}

export default RiskAnalyticsTab;