// components/attendance/PeriodicOverview.tsx
import React, { useState } from 'react';
import { PeriodicAttendanceRecord } from '@/types/attendance';
import { 
  Clock, 
  User, 
  BookOpen, 
  ChevronDown, 
  ChevronUp,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Filter
} from 'lucide-react';

interface PeriodicOverviewProps {
  byPeriod: Record<number, PeriodicAttendanceRecord[]>;
  bySubject: Record<string, PeriodicAttendanceRecord[]>;
  teachers: Set<string>;
  date: string;
  className?: string;
  onViewSubjectDetails?: (subject: string, period: number) => void;
}

export const PeriodicOverview: React.FC<PeriodicOverviewProps> = ({
  byPeriod,
  bySubject,
  teachers,
  date,
  className = '',
  onViewSubjectDetails
}) => {
  const [expandedPeriod, setExpandedPeriod] = useState<number | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const periods = [1, 2, 3, 4, 5, 6, 7, 8];

  // Calculate subject summary
  const subjectSummary = Object.entries(bySubject).map(([subject, records]) => {
    const total = records.length;
    const present = records.filter(r => r.status === 'present' || r.status === 'late').length;
    const rate = total > 0 ? (present / total) * 100 : 0;
    const teacher = records[0]?.markedByName || 'Unknown';
    
    return { subject, total, present, rate, teacher };
  }).sort((a, b) => b.rate - a.rate);

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'present': return 'text-green-600 bg-green-100';
      case 'absent': return 'text-red-600 bg-red-100';
      case 'late': return 'text-yellow-600 bg-yellow-100';
      case 'excused': return 'text-purple-600 bg-purple-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  // Get period status
  const getPeriodStatus = (period: number) => {
    const records = byPeriod[period] || [];
    if (records.length === 0) return 'empty';
    
    const total = records.length;
    const present = records.filter(r => r.status === 'present' || r.status === 'late').length;
    const rate = (present / total) * 100;
    
    if (rate >= 90) return 'excellent';
    if (rate >= 75) return 'good';
    if (rate >= 60) return 'fair';
    return 'poor';
  };

  const periodStatusColors = {
    empty: 'bg-gray-50 border-gray-200 text-gray-400',
    excellent: 'bg-green-50 border-green-200 text-green-700',
    good: 'bg-blue-50 border-blue-200 text-blue-700',
    fair: 'bg-yellow-50 border-yellow-200 text-yellow-700',
    poor: 'bg-red-50 border-red-200 text-red-700'
  };

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
          
          {/* Teacher Summary */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Teachers:</span>
            <div className="flex -space-x-2">
              {Array.from(teachers).slice(0, 3).map((teacher, i) => (
                <div
                  key={i}
                  className="w-6 h-6 rounded-full bg-purple-100 border-2 border-white flex items-center justify-center"
                  title={teacher}
                >
                  <span className="text-[10px] font-medium text-purple-700">
                    {teacher.split(' ').map(n => n[0]).join('')}
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
        </div>
      </div>

      {/* Subject Summary Bar */}
      {subjectSummary.length > 0 && (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <Filter size={14} className="text-gray-400 flex-shrink-0" />
            {subjectSummary.map(subj => (
              <button
                key={subj.subject}
                onClick={() => setSelectedSubject(
                  selectedSubject === subj.subject ? null : subj.subject
                )}
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

      {/* Period Grid */}
      <div className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {periods.map(period => {
            const records = byPeriod[period] || [];
            const status = getPeriodStatus(period);
            const isExpanded = expandedPeriod === period;
            
            // Filter by selected subject if any
            const displayRecords = selectedSubject
              ? records.filter(r => r.subject === selectedSubject)
              : records;

            if (selectedSubject && displayRecords.length === 0) return null;

            return (
              <div
                key={period}
                className={`rounded-lg border transition-all ${
                  periodStatusColors[status]
                } ${isExpanded ? 'row-span-2' : ''}`}
              >
                {/* Period Header */}
                <div
                  className="p-3 cursor-pointer hover:bg-black/5"
                  onClick={() => setExpandedPeriod(isExpanded ? null : period)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold">Period {period}</span>
                    {records.length > 0 ? (
                      <Clock size={14} className="text-current" />
                    ) : (
                      <span className="text-xs text-gray-400">No data</span>
                    )}
                  </div>

                  {records.length > 0 ? (
                    <>
                      <p className="text-xs mb-2">
                        {records.length} students · {
                          records.filter(r => r.status === 'present' || r.status === 'late').length
                        } present
                      </p>

                      {/* Subjects in this period */}
                      <div className="space-y-1">
                        {[...new Set(records.map(r => r.subject))].map(subject => {
                          const subjectRecords = records.filter(r => r.subject === subject);
                          const present = subjectRecords.filter(
                            r => r.status === 'present' || r.status === 'late'
                          ).length;
                          const rate = (present / subjectRecords.length) * 100;

                          return (
                            <div key={subject} className="text-xs">
                              <div className="flex items-center justify-between">
                                <span className="font-medium truncate max-w-[80px]">
                                  {subject}
                                </span>
                                <span className={
                                  rate < 60 ? 'text-red-600' :
                                  rate < 75 ? 'text-yellow-600' :
                                  'text-green-600'
                                }>
                                  {rate.toFixed(0)}%
                                </span>
                              </div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      rate < 60 ? 'bg-red-500' :
                                      rate < 75 ? 'bg-yellow-500' :
                                      'bg-green-500'
                                    }`}
                                    style={{ width: `${rate}%` }}
                                  />
                                </div>
                                <span className="text-[8px] text-gray-500">
                                  {present}/{subjectRecords.length}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-gray-400 italic">No attendance recorded</p>
                  )}

                  {/* Expand indicator */}
                  <div className="mt-2 flex justify-end">
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && displayRecords.length > 0 && (
                  <div className="px-3 pb-3 border-t border-gray-200">
                    <p className="text-xs font-medium mt-2 mb-1">Student Details:</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {displayRecords.map((record, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-xs p-1 bg-white/50 rounded"
                        >
                          <div className="flex items-center gap-1">
                            <span className="font-medium">{record.studentName}</span>
                            <span className={`text-[8px] px-1 rounded-full ${
                              record.studentGender === 'male' 
                                ? 'bg-blue-100 text-blue-700' 
                                : 'bg-pink-100 text-pink-700'
                            }`}>
                              {record.studentGender === 'male' ? 'B' : 'G'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className={`px-1.5 py-0.5 rounded-full text-[8px] ${
                              getStatusColor(record.status)
                            }`}>
                              {record.status}
                            </span>
                            {onViewSubjectDetails && (
                              <button
                                onClick={() => onViewSubjectDetails(record.subject, record.period)}
                                className="text-gray-400 hover:text-gray-600"
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

      {/* Summary Footer */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-gray-600">Total Sessions:</span>
            <span className="font-bold text-gray-900">
              {Object.values(byPeriod).reduce((sum, rec) => sum + rec.length, 0)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gray-600">Subjects:</span>
            <span className="font-bold text-gray-900">
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
          </div>
        </div>
      </div>
    </div>
  );
};

// Compact version for smaller spaces
export const PeriodicOverviewCompact: React.FC<PeriodicOverviewProps> = ({
  byPeriod,
  bySubject,
  teachers,
  date
}) => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-gray-900">Periodic Attendance</h4>
        <span className="text-xs text-gray-500">{date}</span>
      </div>
      
      <div className="flex flex-wrap gap-2">
        {[1,2,3,4,5,6,7,8].map(period => {
          const records = byPeriod[period] || [];
          const hasData = records.length > 0;
          
          return (
            <div
              key={period}
              className={`flex-1 min-w-[40px] text-center p-1 rounded ${
                hasData 
                  ? 'bg-blue-50 text-blue-700' 
                  : 'bg-gray-50 text-gray-400'
              }`}
            >
              <div className="text-[10px] font-medium">P{period}</div>
              <div className="text-xs font-bold">
                {hasData ? records.length : '-'}
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="mt-2 text-[10px] text-gray-500 flex items-center justify-between">
        <span>{teachers.size} teachers</span>
        <span>{Object.keys(bySubject || {}).length} subjects</span>
      </div>
    </div>
  );
};