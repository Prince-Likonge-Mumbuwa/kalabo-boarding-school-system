// components/attendance/RiskAnalyticsTab.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { attendanceService } from '@/services/attendanceService';
import { RiskAnalysis } from '@/types/attendance';
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
  Calendar
} from 'lucide-react';

interface RiskAnalyticsTabProps {
  classId: string;
  className: string;
  isFormTeacher: boolean;
  teacherName?: string;
}

type RiskFilter = 'all' | 'high' | 'medium' | 'low';
type SortBy = 'risk' | 'name' | 'attendance' | 'consecutive';

export const RiskAnalyticsTab: React.FC<RiskAnalyticsTabProps> = ({
  classId,
  className,
  isFormTeacher,
  teacherName
}) => {
  const [riskAnalyses, setRiskAnalyses] = useState<RiskAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RiskFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('risk');
  const [days, setDays] = useState(30);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (classId && isFormTeacher) {
      loadRiskAnalyses();
    }
  }, [classId, days]);

  const loadRiskAnalyses = async () => {
    setLoading(true);
    try {
      const analyses = await attendanceService.getClassRiskAnalysis(classId, className, days);
      setRiskAnalyses(analyses);
    } catch (error) {
      console.error('Error loading risk analyses:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort analyses
  const filteredAndSortedAnalyses = useMemo(() => {
    let filtered = riskAnalyses;
    
    // Apply filter
    if (filter !== 'all') {
      filtered = filtered.filter(a => a.riskLevel === filter);
    }
    
    // Apply sorting
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'risk':
          // Sort by risk level first, then by attendance rate
          const riskOrder = { high: 0, medium: 1, low: 2 };
          if (riskOrder[a.riskLevel] !== riskOrder[b.riskLevel]) {
            return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
          }
          return a.dailyStats.rate - b.dailyStats.rate;
        
        case 'name':
          return a.studentName.localeCompare(b.studentName);
        
        case 'attendance':
          return a.dailyStats.rate - b.dailyStats.rate;
        
        case 'consecutive':
          return b.consecutiveAbsences - a.consecutiveAbsences;
        
        default:
          return 0;
      }
    });
  }, [riskAnalyses, filter, sortBy]);

  // Calculate stats
  const stats = useMemo(() => {
    const high = riskAnalyses.filter(a => a.riskLevel === 'high').length;
    const medium = riskAnalyses.filter(a => a.riskLevel === 'medium').length;
    const low = riskAnalyses.filter(a => a.riskLevel === 'low').length;
    const total = riskAnalyses.length;
    
    const avgAttendance = total > 0 
      ? riskAnalyses.reduce((sum, a) => sum + a.dailyStats.rate, 0) / total 
      : 0;
    
    const totalDitching = riskAnalyses.reduce((sum, a) => sum + a.ditchingIncidents.length, 0);
    const totalLate = riskAnalyses.reduce((sum, a) => sum + a.lateArrivals.length, 0);
    
    return {
      high,
      medium,
      low,
      total,
      avgAttendance,
      totalDitching,
      totalLate
    };
  }, [riskAnalyses]);

  const handleExport = () => {
    exportRiskAnalysis(filteredAndSortedAnalyses, `risk_analysis_${className}_${days}days`);
  };

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

  return (
    <div className="space-y-4">
      {/* Header Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-4 border border-red-200">
          <p className="text-xs text-red-600 font-medium">High Risk</p>
          <p className="text-2xl font-bold text-red-700">{stats.high}</p>
          <p className="text-xs text-red-500 mt-1">
            {stats.total > 0 ? ((stats.high / stats.total) * 100).toFixed(0) : 0}% of class
          </p>
        </div>
        
        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl p-4 border border-yellow-200">
          <p className="text-xs text-yellow-600 font-medium">Medium Risk</p>
          <p className="text-2xl font-bold text-yellow-700">{stats.medium}</p>
          <p className="text-xs text-yellow-500 mt-1">
            {stats.total > 0 ? ((stats.medium / stats.total) * 100).toFixed(0) : 0}% of class
          </p>
        </div>
        
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200">
          <p className="text-xs text-green-600 font-medium">Low Risk</p>
          <p className="text-2xl font-bold text-green-700">{stats.low}</p>
          <p className="text-xs text-green-500 mt-1">
            {stats.total > 0 ? ((stats.low / stats.total) * 100).toFixed(0) : 0}% of class
          </p>
        </div>
        
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
          <p className="text-xs text-blue-600 font-medium">Class Average</p>
          <p className="text-2xl font-bold text-blue-700">{stats.avgAttendance.toFixed(1)}%</p>
          <p className="text-xs text-blue-500 mt-1">
            {stats.totalDitching} ditching · {stats.totalLate} late
          </p>
        </div>
      </div>

      {/* Alert Summary */}
      {(stats.totalDitching > 0 || stats.totalLate > 0) && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
          <div className="flex items-center gap-3 text-sm">
            <AlertTriangle size={16} className="text-orange-600" />
            <span className="text-orange-700">
              <strong>{stats.totalDitching}</strong> ditching incidents and{' '}
              <strong>{stats.totalLate}</strong> late arrivals detected in the last {days} days
            </span>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full flex items-center justify-between p-4 sm:hidden"
        >
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Filters & Sort</span>
          </div>
          <ChevronDown size={16} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>

        <div className={`p-4 ${showFilters ? 'block' : 'hidden sm:block'}`}>
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Filter by Risk Level */}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as RiskFilter)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="all">All Risk Levels</option>
              <option value="high">High Risk Only</option>
              <option value="medium">Medium Risk Only</option>
              <option value="low">Low Risk Only</option>
            </select>

            {/* Sort By */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value="risk">Sort by Risk Level</option>
              <option value="name">Sort by Name</option>
              <option value="attendance">Sort by Attendance %</option>
              <option value="consecutive">Sort by Consecutive Absences</option>
            </select>

            {/* Time Range */}
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={60}>Last 60 days</option>
              <option value={90}>Last 90 days</option>
            </select>

            {/* Export Button */}
            <button
              onClick={handleExport}
              disabled={filteredAndSortedAnalyses.length === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ml-auto"
            >
              <Download size={16} />
              <span>Export</span>
            </button>
          </div>
        </div>
      </div>

      {/* Results Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-gray-400" />
          <span className="text-sm text-gray-600">
            Showing <strong>{filteredAndSortedAnalyses.length}</strong> of{' '}
            <strong>{riskAnalyses.length}</strong> students
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-gray-400" />
          <span className="text-sm text-gray-600">Last {days} days</span>
        </div>
      </div>

      {/* Risk Cards Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 bg-white rounded-xl border border-gray-200">
          <Loader2 size={32} className="animate-spin text-blue-600 mb-3" />
          <p className="text-sm text-gray-600">Analyzing attendance patterns...</p>
          <p className="text-xs text-gray-400 mt-1">This may take a few seconds</p>
        </div>
      ) : filteredAndSortedAnalyses.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAndSortedAnalyses.map(analysis => (
            <RiskAnalysisCard 
              key={analysis.studentId} 
              analysis={analysis}
              onViewDetails={(studentId) => {
                console.log('View details for:', studentId);
                // You can implement a modal or navigate to student details
              }}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-200">
          <BarChart3 size={32} className="text-gray-400 mx-auto mb-2" />
          <p className="text-gray-600 font-medium">No students match the selected filter</p>
          <p className="text-sm text-gray-500 mt-1">
            Try adjusting your filters or time range
          </p>
        </div>
      )}

      {/* Teacher Note */}
      {teacherName && (
        <div className="text-xs text-gray-400 text-right pt-2">
          Analyzed by {teacherName} · {new Date().toLocaleDateString()}
        </div>
      )}
    </div>
  );
};