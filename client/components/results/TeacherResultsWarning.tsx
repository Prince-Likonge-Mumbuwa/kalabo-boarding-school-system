// @/components/results/TeacherResultsWarning.tsx
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { 
  AlertCircle, CheckCircle, AlertTriangle, 
  ChevronDown, ChevronRight, FileText, Clock,
  XCircle, Info, TrendingUp, TrendingDown, Minus
} from 'lucide-react';
import { useResultsEntryMonitor } from '@/hooks/useResultsEntryMonitor';

interface TeacherResultsWarningProps {
  term: string;
  year: number;
  compact?: boolean;
  onNavigateToResults?: (entry: any) => void;
}

// ==================== MISSING ENTRY CARD ====================
const MissingEntryCard = ({ entry, onNavigate }: { entry: any; onNavigate: () => void }) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  const getExamTypeStyles = (examType: string) => {
    switch (examType) {
      case 'week4':
        return { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Week 4' };
      case 'week8':
        return { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Week 8' };
      case 'endOfTerm':
        return { bg: 'bg-green-100', text: 'text-green-700', label: 'End of Term' };
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-700', label: examType };
    }
  };
  
  const examStyles = getExamTypeStyles(entry.examType);
  
  return (
    <div className="bg-white rounded-lg p-3 border border-gray-200 hover:shadow-sm transition-shadow">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <XCircle size={14} className="text-red-500 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-900 truncate">
              {entry.examName}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${examStyles.bg} ${examStyles.text}`}>
              {examStyles.label}
            </span>
            {entry.totalMarks && (
              <span className="text-xs text-gray-500">
                {entry.totalMarks} marks
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
            <span className="truncate">{entry.className} → {entry.subjectName}</span>
            {entry.configuredDate && (
              <span className="flex items-center gap-1 flex-shrink-0">
                <Clock size={10} />
                Due: {new Date(entry.configuredDate).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        
        <button
          onClick={onNavigate}
          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap flex-shrink-0"
        >
          Enter Now
        </button>
      </div>
    </div>
  );
};

// ==================== COMPACT MISSING ENTRY ====================
const CompactMissingEntry = ({ entry, onNavigate }: { entry: any; onNavigate: () => void }) => {
  const getExamTypeStyles = (examType: string) => {
    switch (examType) {
      case 'week4': return 'bg-blue-100 text-blue-700';
      case 'week8': return 'bg-purple-100 text-purple-700';
      case 'endOfTerm': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };
  
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{entry.subjectName}</p>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${getExamTypeStyles(entry.examType)}`}>
            {entry.examType === 'week4' ? 'W4' : entry.examType === 'week8' ? 'W8' : 'EOT'}
          </span>
          <span className="text-xs text-gray-500 truncate">{entry.className}</span>
        </div>
      </div>
      <button
        onClick={onNavigate}
        className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 ml-2 flex-shrink-0"
      >
        Enter
      </button>
    </div>
  );
};

// ==================== SUBJECT PROGRESS ROW ====================
const SubjectProgressRow = ({ subject, classId, missingEntries, onNavigate }: any) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  const subjectMissingEntries = missingEntries.filter(
    (e: any) => e.subjectId === subject.subjectId
  );
  
  const examTypes = [
    { key: 'week4', label: 'W4', name: 'Week 4' },
    { key: 'week8', label: 'W8', name: 'Week 8' },
    { key: 'endOfTerm', label: 'EOT', name: 'End of Term' }
  ];
  
  const getExamIcon = (isComplete: boolean) => {
    if (isComplete) {
      return <CheckCircle size={isMobile ? 12 : 14} className="text-green-600" />;
    }
    return <XCircle size={isMobile ? 12 : 14} className="text-red-500" />;
  };
  
  if (subjectMissingEntries.length === 0) {
    return (
      <div className="bg-green-50 rounded-lg p-3 border border-green-100">
        <div className="flex items-center gap-2">
          <CheckCircle size={14} className="text-green-600" />
          <span className="text-sm font-medium text-green-700">{subject.subjectName}</span>
          <span className="text-xs text-green-600 ml-auto">Complete</span>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-amber-50/30 rounded-lg p-3 border border-amber-100">
      <div className="mb-2">
        <div className="flex items-center justify-between flex-wrap gap-1">
          <span className="text-sm font-medium text-gray-900">{subject.subjectName}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            subject.completionPercentage === 100 ? 'bg-green-100 text-green-700' :
            subject.completionPercentage >= 75 ? 'bg-amber-100 text-amber-700' :
            'bg-red-100 text-red-700'
          }`}>
            {subject.completionPercentage}% complete
          </span>
        </div>
        {!isMobile && subject.totalStudents > 0 && (
          <p className="text-xs text-gray-400 mt-1">{subject.totalStudents} students</p>
        )}
      </div>
      
      {/* Exam status row - shows which exams are missing */}
      <div className="flex items-center gap-4 mb-3 pb-2 border-b border-amber-200">
        {examTypes.map(exam => (
          <div key={exam.key} className="flex items-center gap-1">
            {getExamIcon(subject[`${exam.key}Complete`])}
            <span className="text-xs text-gray-600">{exam.label}</span>
            {subject[`${exam.key}StudentCount`] > 0 && (
              <span className="text-xs text-gray-400">
                ({subject[`${exam.key}StudentCount`]}/{subject.totalStudents})
              </span>
            )}
          </div>
        ))}
      </div>
      
      {/* Missing entries for this subject */}
      <div className="space-y-2">
        {subjectMissingEntries.map((entry: any) => (
          <MissingEntryCard 
            key={`${entry.subjectId}-${entry.examType}`} 
            entry={entry}
            onNavigate={() => onNavigate(entry)}
          />
        ))}
      </div>
    </div>
  );
};

// ==================== CLASS PROGRESS SECTION ====================
const ClassProgressSection = ({ classProgress, missingEntries, onNavigate, isExpanded, onToggle }: any) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  const classMissingEntries = missingEntries.filter(
    (e: any) => e.classId === classProgress.classId
  );
  
  // Don't show if class has no missing entries and is 100% complete
  if (classMissingEntries.length === 0 && classProgress.completionPercentage === 100) {
    return null;
  }
  
  const getClassStatusColor = (percentage: number) => {
    if (percentage === 100) return 'border-green-200 bg-green-50';
    if (percentage >= 75) return 'border-amber-200 bg-amber-50';
    if (percentage >= 50) return 'border-red-200 bg-red-50';
    return 'border-red-300 bg-red-100';
  };
  
  const getClassStatusText = (percentage: number) => {
    if (percentage === 100) return 'text-green-700';
    if (percentage >= 75) return 'text-amber-700';
    if (percentage >= 50) return 'text-red-700';
    return 'text-red-800';
  };
  
  const getBarColor = (percentage: number) => {
    if (percentage === 100) return 'bg-green-500';
    if (percentage >= 75) return 'bg-amber-500';
    if (percentage >= 50) return 'bg-red-500';
    return 'bg-red-700';
  };
  
  return (
    <div className={`rounded-lg border ${getClassStatusColor(classProgress.completionPercentage)} overflow-hidden`}>
      <button
        onClick={() => onToggle(classProgress.className)}
        className="w-full px-3 sm:px-4 py-3 flex items-center justify-between hover:bg-black/5 transition-colors text-left"
      >
        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
          {isExpanded ? <ChevronDown size={16} className="flex-shrink-0" /> : <ChevronRight size={16} className="flex-shrink-0" />}
          <div className="min-w-0 flex-1">
            <p className="font-medium text-gray-900 text-sm sm:text-base truncate">{classProgress.className}</p>
            <p className="text-xs text-gray-500">
              {classProgress.completedCount} of {classProgress.totalRequired} entries completed
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-16 sm:w-24">
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${getBarColor(classProgress.completionPercentage)}`}
                style={{ width: `${classProgress.completionPercentage}%` }}
              />
            </div>
          </div>
          <span className={`text-sm font-medium ${getClassStatusText(classProgress.completionPercentage)} flex-shrink-0`}>
            {classProgress.completionPercentage}%
          </span>
        </div>
      </button>
      
      {isExpanded && (
        <div className="px-3 sm:px-4 pb-3 space-y-2 border-t border-inherit pt-3">
          {classProgress.subjects.map((subject: any) => (
            <SubjectProgressRow 
              key={subject.subjectId}
              subject={subject}
              classId={classProgress.classId}
              missingEntries={classMissingEntries}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ==================== MAIN COMPONENT ====================
export const TeacherResultsWarning = ({ term, year, compact = false, onNavigateToResults }: TeacherResultsWarningProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 640px)');
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  
  // Get the teacher's progress data - SAME hook used by admin monitor
  const { myProgress, isLoading, activeExamTypes } = useResultsEntryMonitor({
    term,
    year,
    teacherId: user?.uid,
  });
  
  const handleNavigateToEntry = (entry: any) => {
    if (onNavigateToResults) {
      onNavigateToResults(entry);
    } else {
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
  
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-3"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
      </div>
    );
  }
  
  // No progress data - no assignments
  if (!myProgress) {
    if (compact) return null;
    
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center gap-3">
        <Info className="text-gray-500" size={20} />
        <div>
          <p className="text-gray-700 font-medium">No class assignments found</p>
          <p className="text-gray-500 text-sm">
            You don't have any class assignments for {term} {year}. Please contact the administrator.
          </p>
        </div>
      </div>
    );
  }
  
  // All results entered - show success
  if (myProgress.missingCount === 0) {
    if (compact) return null;
    
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
        <CheckCircle className="text-green-600" size={20} />
        <div>
          <p className="text-green-800 font-medium">All results entered!</p>
          <p className="text-green-600 text-sm">
            You've completed all {myProgress.totalRequired} required exam entries for {term} {year}.
          </p>
        </div>
      </div>
    );
  }
  
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
  
  // COMPACT MODE
  if (compact) {
    const [expandedMissing, setExpandedMissing] = useState(false);
    
    if (!expandedMissing) {
      return (
        <button
          onClick={() => setExpandedMissing(true)}
          className="w-full bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between hover:bg-amber-100 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="text-amber-600 flex-shrink-0" size={18} />
            <span className="text-amber-800 text-sm font-medium truncate">
              {myProgress.missingCount} pending result {myProgress.missingCount === 1 ? 'entry' : 'entries'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-amber-600 text-xs">
              {completionPercentage}% complete
            </span>
            <ChevronRight size={14} className="text-amber-600" />
          </div>
        </button>
      );
    }
    
    return (
      <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
        <div className={`p-3 ${
          statusColor === 'red' ? 'bg-red-50' :
          statusColor === 'orange' ? 'bg-orange-50' : 'bg-amber-50'
        } border-b border-amber-200`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <StatusIcon size={18} className={
                statusColor === 'red' ? 'text-red-600 flex-shrink-0' :
                statusColor === 'orange' ? 'text-orange-600 flex-shrink-0' : 'text-amber-600 flex-shrink-0'
              } />
              <span className="font-medium text-gray-900 text-sm truncate">
                {myProgress.missingCount} pending entries
              </span>
            </div>
            <button
              onClick={() => setExpandedMissing(false)}
              className="text-xs text-gray-500 hover:text-gray-700 flex-shrink-0 ml-2"
            >
              Show less
            </button>
          </div>
          <div className="mt-2">
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${
                  statusColor === 'red' ? 'bg-red-500' :
                  statusColor === 'orange' ? 'bg-orange-500' : 'bg-amber-500'
                }`}
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {myProgress.missingCount} missing across {myProgress.classProgress?.length || 0} classes
            </p>
          </div>
        </div>
        <div className="p-3 max-h-64 overflow-y-auto">
          {myProgress.missingEntries.slice(0, 5).map((entry: any, idx: number) => (
            <CompactMissingEntry 
              key={idx} 
              entry={entry} 
              onNavigate={() => handleNavigateToEntry(entry)}
            />
          ))}
          {myProgress.missingEntries.length > 5 && (
            <button
              onClick={() => {
                const firstEntry = myProgress.missingEntries[0];
                if (firstEntry) handleNavigateToEntry(firstEntry);
              }}
              className="w-full mt-2 text-center text-xs text-blue-600 hover:text-blue-700"
            >
              + {myProgress.missingEntries.length - 5} more entries
            </button>
          )}
        </div>
      </div>
    );
  }
  
  // FULL MODE - Detailed view
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header with summary */}
      <div className={`p-4 ${
        statusColor === 'red' ? 'bg-red-50 border-red-200' :
        statusColor === 'orange' ? 'bg-orange-50 border-orange-200' :
        'bg-amber-50 border-amber-200'
      } border-b`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <StatusIcon size={24} className={
              statusColor === 'red' ? 'text-red-600 flex-shrink-0' :
              statusColor === 'orange' ? 'text-orange-600 flex-shrink-0' :
              'text-amber-600 flex-shrink-0'
            } />
            <div>
              <h3 className="font-semibold text-gray-900">Pending Results Entry</h3>
              <p className="text-sm text-gray-600">
                You have <span className="font-bold">{myProgress.missingCount}</span> exam {myProgress.missingCount === 1 ? 'entry' : 'entries'} pending
                out of {myProgress.totalRequired} total
              </p>
              {activeExamTypes && activeExamTypes.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Configured exams: {activeExamTypes.map((t: string) => 
                    t === 'week4' ? 'Week 4' : t === 'week8' ? 'Week 8' : 'End of Term'
                  ).join(', ')}
                </p>
              )}
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
        
        {/* Progress bar with status message */}
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
            {isCritical ? '⚠️ Critical - Please prioritize entering results immediately' :
             isBehind ? '⚠️ Behind schedule - Please catch up soon' :
             isOnTrack ? '📝 On track - Keep up the good work!' :
             '✅ Complete!'}
          </p>
        </div>
      </div>
      
      {/* Class Progress Sections - ONLY shows classes with missing entries */}
      <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto p-4 space-y-3">
        {myProgress.classProgress && myProgress.classProgress.length > 0 ? (
          myProgress.classProgress.map((classProgress: any) => {
            // Only show classes that have missing entries
            const hasMissing = myProgress.missingEntries.some(
              (entry: any) => entry.classId === classProgress.classId
            );
            
            if (!hasMissing && classProgress.completionPercentage === 100) {
              return null;
            }
            
            return (
              <ClassProgressSection
                key={classProgress.classId}
                classProgress={classProgress}
                missingEntries={myProgress.missingEntries}
                onNavigate={handleNavigateToEntry}
                isExpanded={expandedClasses.has(classProgress.className)}
                onToggle={toggleClass}
              />
            );
          })
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500">No class assignments found</p>
          </div>
        )}
      </div>
      
      {/* Quick action footer */}
      {myProgress.missingEntries.length > 0 && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-2">
          <button
            onClick={() => {
              const firstMissing = myProgress.missingEntries[0];
              if (firstMissing) {
                handleNavigateToEntry(firstMissing);
              }
            }}
            className="w-full sm:w-auto text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <FileText size={14} />
            Start entering results now
          </button>
          
          <div className="text-xs text-gray-400 text-center sm:text-right">
            {myProgress.missingCount} pending across {myProgress.classProgress?.filter((c: any) => {
              const hasMissing = myProgress.missingEntries.some((e: any) => e.classId === c.classId);
              return hasMissing;
            }).length || 0} classes
          </div>
        </div>
      )}
    </div>
  );
};