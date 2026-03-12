// components/attendance/RiskAnalysisCard.tsx
import React, { useState } from 'react';
import { RiskAnalysis } from '@/types/attendance';
import { 
  AlertCircle, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  BookOpen,
  ChevronDown,
  ChevronUp,
  User,
  Calendar,
  AlertTriangle
} from 'lucide-react';

interface RiskAnalysisCardProps {
  analysis: RiskAnalysis;
  onViewDetails?: (studentId: string) => void;
  expanded?: boolean;
}

export const RiskAnalysisCard: React.FC<RiskAnalysisCardProps> = ({ 
  analysis, 
  onViewDetails,
  expanded: initialExpanded = false
}) => {
  const [expanded, setExpanded] = useState(initialExpanded);

  const riskColors = {
    high: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-700',
      badge: 'bg-red-100 text-red-800',
      icon: 'text-red-500'
    },
    medium: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      text: 'text-yellow-700',
      badge: 'bg-yellow-100 text-yellow-800',
      icon: 'text-yellow-500'
    },
    low: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      text: 'text-green-700',
      badge: 'bg-green-100 text-green-800',
      icon: 'text-green-500'
    }
  };

  const colors = riskColors[analysis.riskLevel];

  const getStatusColor = (rate: number) => {
    if (rate < 60) return 'text-red-600';
    if (rate < 75) return 'text-yellow-600';
    return 'text-green-600';
  };

  return (
    <div className={`rounded-xl border ${colors.border} ${colors.bg} overflow-hidden transition-all duration-200 hover:shadow-md`}>
      {/* Header - Always visible */}
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-gray-900 truncate">{analysis.studentName}</h4>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors.badge}`}>
                {analysis.riskLevel.toUpperCase()}
              </span>
            </div>
            
            <div className="flex items-center gap-3 text-sm">
              <span className="text-gray-600">{analysis.className}</span>
              <span className={`font-medium ${getStatusColor(analysis.dailyStats.rate)}`}>
                {analysis.dailyStats.rate.toFixed(1)}% Overall
              </span>
            </div>
          </div>
          
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 hover:bg-white/50 rounded-lg transition-colors"
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>

        {/* Quick Stats - Always visible */}
        <div className="grid grid-cols-3 gap-2 mt-3">
          <div className="bg-white/50 rounded-lg p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-gray-600">
              <Calendar size={12} />
              <span>Consecutive</span>
            </div>
            <p className="text-lg font-bold text-gray-900">{analysis.consecutiveAbsences}</p>
          </div>
          
          <div className="bg-white/50 rounded-lg p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-gray-600">
              <AlertTriangle size={12} />
              <span>Ditching</span>
            </div>
            <p className="text-lg font-bold text-orange-600">{analysis.ditchingIncidents.length}</p>
          </div>
          
          <div className="bg-white/50 rounded-lg p-2 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-gray-600">
              <Clock size={12} />
              <span>Late</span>
            </div>
            <p className="text-lg font-bold text-yellow-600">{analysis.lateArrivals.length}</p>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Risk Factors */}
          {analysis.riskFactors.length > 0 && (
            <div className="bg-white/70 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-1">
                <AlertCircle size={12} className={colors.icon} />
                Risk Factors
              </p>
              <ul className="space-y-1">
                {analysis.riskFactors.map((factor, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1">
                    <span className="text-red-400">•</span>
                    <span>{factor}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Subject Stats */}
          {analysis.subjectStats.length > 0 && (
            <div className="bg-white/70 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-1">
                <BookOpen size={12} className="text-blue-500" />
                Subject Performance
              </p>
              <div className="space-y-2">
                {analysis.subjectStats.slice(0, 5).map(subject => (
                  <div key={subject.subject} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-700">{subject.subject}</span>
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${getStatusColor(subject.rate)}`}>
                          {subject.rate.toFixed(0)}%
                        </span>
                        {subject.trend === 'improving' && (
                          <TrendingUp size={10} className="text-green-600" />
                        )}
                        {subject.trend === 'declining' && (
                          <TrendingDown size={10} className="text-red-600" />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${
                            subject.rate < 60 ? 'bg-red-500' :
                            subject.rate < 75 ? 'bg-yellow-500' :
                            'bg-green-500'
                          }`}
                          style={{ width: `${subject.rate}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500">
                        {subject.present}/{subject.totalSessions}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500">
                      Teacher: {subject.teacherName}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ditching Incidents */}
          {analysis.ditchingIncidents.length > 0 && (
            <div className="bg-white/70 rounded-lg p-3">
              <p className="text-xs font-medium text-orange-700 mb-2">
                Ditching Incidents ({analysis.ditchingIncidents.length})
              </p>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {analysis.ditchingIncidents.map((incident, i) => (
                  <div key={i} className="text-xs flex items-center justify-between">
                    <span className="text-gray-600">{incident.date}</span>
                    <span className="font-medium text-gray-700">{incident.subject}</span>
                    <span className="text-gray-500">Period {incident.period}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Late Arrivals */}
          {analysis.lateArrivals.length > 0 && (
            <div className="bg-white/70 rounded-lg p-3">
              <p className="text-xs font-medium text-yellow-700 mb-2">
                Late Arrivals ({analysis.lateArrivals.length})
              </p>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {analysis.lateArrivals.map((late, i) => (
                  <div key={i} className="text-xs flex items-center justify-between">
                    <span className="text-gray-600">{late.date}</span>
                    <span className="font-medium text-gray-700">{late.firstPeriodSubject}</span>
                    <span className="text-gray-500">{late.arrivalTime || ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* View Details Button */}
          {onViewDetails && (
            <button
              onClick={() => onViewDetails(analysis.studentId)}
              className="w-full mt-2 px-3 py-2 bg-white/80 hover:bg-white rounded-lg text-xs font-medium text-gray-700 transition-colors flex items-center justify-center gap-1"
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