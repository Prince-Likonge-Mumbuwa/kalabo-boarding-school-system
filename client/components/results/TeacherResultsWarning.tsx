// @/components/results/TeacherResultsWarning.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  AlertCircle, CheckCircle, AlertTriangle, 
  ChevronDown, ChevronRight, FileText, Clock,
  XCircle, Info, TrendingUp, TrendingDown
} from 'lucide-react';
import { useResultsEntryMonitor } from '@/hooks/useResultsEntryMonitor';

interface TeacherResultsWarningProps {
  term: string;
  year: number;
  compact?: boolean;
  onNavigateToResults?: (entry: any) => void;
}

export const TeacherResultsWarning = ({ term, year, compact = false, onNavigateToResults }: TeacherResultsWarningProps) => {
  const navigate = useNavigate();
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  const [expandedMissing, setExpandedMissing] = useState(false);
  
  const { myProgress, isLoading } = useResultsEntryMonitor({
    term,
    year,
    teacherId: undefined // Will use auth user from hook
  });
  
  const handleNavigateToEntry = (entry: any) => {
    if (onNavigateToResults) {
      onNavigateToResults(entry);
    } else {
      // Default navigation
      navigate('/dashboard/teacher/results-entry', {
        state: {
          classId: entry.classId,
          className: entry.className,
          subjectId: entry.subjectId,
          subjectName: entry.subjectName,
          examType: entry.examType,
          examName: entry.examName,
          term,
          year,
        }
      });
    }
  };
  
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-3"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
      </div>
    );
  }
  
  // No data or no missing entries - show success state
  if (!myProgress || myProgress.missingCount === 0) {
    if (compact) return null;
    
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
        <CheckCircle className="text-green-600" size={20} />
        <div>
          <p className="text-green-800 font-medium">All results entered!</p>
          <p className="text-green-600 text-sm">
            You've completed all {myProgress?.totalRequired || 0} required exam entries for {term} {year}.
          </p>
        </div>
      </div>
    );
  }
  
  // Has missing entries - show warning
  const completionPercentage = myProgress.completionPercentage;
  const isCritical = completionPercentage < 50;
  const isBehind = completionPercentage >= 50 && completionPercentage < 75;
  const isOnTrack = completionPercentage >= 75 && completionPercentage < 100;
  
  const getStatusColor = () => {
    if (isCritical) return 'red';
    if (isBehind) return 'orange';
    return 'amber';
  };
  
  const statusColor = getStatusColor();
  const StatusIcon = isCritical ? AlertCircle : AlertTriangle;
  
  const toggleClass = (className: string) => {
    setExpandedClasses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(className)) {
        newSet.delete(className);
      } else {
        newSet.add(className);
      }
      return newSet;
    });
  };
  
  if (compact) {
    return (
      <button
        onClick={() => setExpandedMissing(!expandedMissing)}
        className="w-full bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between hover:bg-amber-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="text-amber-600" size={18} />
          <span className="text-amber-800 text-sm font-medium">
            {myProgress.missingCount} pending result entries
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-amber-600 text-xs">
            {completionPercentage}% complete
          </span>
          {expandedMissing ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>
      </button>
    );
  }
  
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className={`p-4 ${
        statusColor === 'red' ? 'bg-red-50 border-red-200' :
        statusColor === 'orange' ? 'bg-orange-50 border-orange-200' :
        'bg-amber-50 border-amber-200'
      } border-b`}>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <StatusIcon size={24} className={
              statusColor === 'red' ? 'text-red-600' :
              statusColor === 'orange' ? 'text-orange-600' :
              'text-amber-600'
            } />
            <div>
              <h3 className="font-semibold text-gray-900">Pending Results Entry</h3>
              <p className="text-sm text-gray-600">
                You have <span className="font-bold">{myProgress.missingCount}</span> exam entries pending
                out of {myProgress.totalRequired} total
              </p>
            </div>
          </div>
          
          {/* Progress Ring */}
          <div className="flex items-center gap-2">
            <div className="relative w-12 h-12">
              <svg className="w-12 h-12 transform -rotate-90">
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  stroke="#e5e7eb"
                  strokeWidth="4"
                  fill="none"
                />
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  stroke={
                    statusColor === 'red' ? '#dc2626' :
                    statusColor === 'orange' ? '#ea580c' :
                    '#d97706'
                  }
                  strokeWidth="4"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 20}`}
                  strokeDashoffset={`${2 * Math.PI * 20 * (1 - completionPercentage / 100)}`}
                  className="transition-all duration-500"
                />
              </svg>
              <span className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${
                statusColor === 'red' ? 'text-red-700' :
                statusColor === 'orange' ? 'text-orange-700' :
                'text-amber-700'
              }`}>
                {completionPercentage}%
              </span>
            </div>
            <span className="text-xs text-gray-500">complete</span>
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="mt-3">
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-500 ${
                statusColor === 'red' ? 'bg-red-500' :
                statusColor === 'orange' ? 'bg-orange-500' :
                'bg-amber-500'
              }`}
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {isCritical ? '⚠️ Critical - Please prioritize entering results' :
             isBehind ? '⚠️ Behind schedule - Please catch up' :
             '📝 On track - Keep going!'}
          </p>
        </div>
      </div>
      
      {/* Summary by Class */}
      <div className="divide-y divide-gray-100">
        {myProgress.classProgress && myProgress.classProgress.length > 0 ? (
          myProgress.classProgress.map((classProgress: any) => (
            <div key={classProgress.classId}>
              <button
                onClick={() => toggleClass(classProgress.className)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  {expandedClasses.has(classProgress.className) ? (
                    <ChevronDown size={16} className="text-gray-400" />
                  ) : (
                    <ChevronRight size={16} className="text-gray-400" />
                  )}
                  <span className="font-medium text-gray-900">{classProgress.className}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    classProgress.completionPercentage === 100 ? 'bg-green-100 text-green-700' :
                    classProgress.completionPercentage >= 75 ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {classProgress.completionPercentage}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">
                    {classProgress.completedCount}/{classProgress.totalRequired} done
                  </span>
                </div>
              </button>
              
              {expandedClasses.has(classProgress.className) && (
                <div className="px-4 pb-3 space-y-2">
                  {classProgress.subjects.map((subject: any) => {
                    // Find missing entries for this subject
                    const subjectMissingEntries = myProgress.missingEntries.filter(
                      (entry: any) => entry.classId === classProgress.classId && 
                                     entry.subjectId === subject.subjectId
                    );
                    
                    if (subjectMissingEntries.length === 0) {
                      return (
                        <div key={subject.subjectId} className="bg-green-50 rounded-lg p-3 border border-green-100">
                          <div className="flex items-center gap-2">
                            <CheckCircle size={14} className="text-green-600" />
                            <span className="text-sm font-medium text-green-700">{subject.subjectName}</span>
                            <span className="text-xs text-green-600 ml-auto">Complete</span>
                          </div>
                        </div>
                      );
                    }
                    
                    return (
                      <div key={subject.subjectId} className="bg-amber-50/30 rounded-lg p-3 border border-amber-100">
                        <div className="mb-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">{subject.subjectName}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              subject.completionPercentage === 100 ? 'bg-green-100 text-green-700' :
                              subject.completionPercentage >= 75 ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {subject.completionPercentage}%
                            </span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {subjectMissingEntries.map((entry: any) => (
                            <MissingEntryCard 
                              key={`${entry.subjectId}-${entry.examType}`} 
                              entry={entry}
                              onNavigate={() => handleNavigateToEntry(entry)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="px-4 py-8 text-center">
            <p className="text-gray-500">No missing entries found</p>
          </div>
        )}
      </div>
      
      {/* Quick action footer */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
        <button
          onClick={() => {
            const firstMissing = myProgress.missingEntries[0];
            if (firstMissing) {
              handleNavigateToEntry(firstMissing);
            }
          }}
          className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2 transition-colors"
        >
          <FileText size={14} />
          Start entering results now
        </button>
        
        <div className="text-xs text-gray-400">
          {myProgress.missingCount} pending across {myProgress.classProgress?.length || 0} classes
        </div>
      </div>
    </div>
  );
};

// Missing Entry Card Component
const MissingEntryCard = ({ entry, onNavigate }: { entry: any; onNavigate: () => void }) => {
  return (
    <div className="bg-white rounded-lg p-3 border border-gray-200">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <XCircle size={14} className="text-red-500" />
            <span className="text-sm font-medium text-gray-900">
              {entry.examName}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              entry.examType === 'week4' ? 'bg-blue-100 text-blue-700' :
              entry.examType === 'week8' ? 'bg-purple-100 text-purple-700' :
              'bg-green-100 text-green-700'
            }`}>
              {entry.examType === 'week4' ? 'Week 4' :
               entry.examType === 'week8' ? 'Week 8' : 'End of Term'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {entry.totalMarks && (
              <span>{entry.totalMarks} marks</span>
            )}
            {entry.configuredDate && (
              <span className="flex items-center gap-1">
                <Clock size={10} />
                Due: {new Date(entry.configuredDate).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        
        <button
          onClick={onNavigate}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors ml-3"
        >
          Enter Now
        </button>
      </div>
    </div>
  );
};