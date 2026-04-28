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
        return { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Week 4', border: 'border-blue-200' };
      case 'week8':
        return { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Week 8', border: 'border-purple-200' };
      case 'endOfTerm':
        return { bg: 'bg-green-100', text: 'text-green-700', label: 'End of Term', border: 'border-green-200' };
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-700', label: examType, border: 'border-gray-200' };
    }
  };
  
  const examStyles = getExamTypeStyles(entry.examType);
  
  const getDueStatus = (dueDate?: string) => {
    if (!dueDate) return null;
    const due = new Date(dueDate);
    const today = new Date();
    const daysDiff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff < 0) return { text: 'Overdue', color: 'text-red-600', icon: <AlertCircle size={10} /> };
    if (daysDiff <= 3) return { text: `Due in ${daysDiff} days`, color: 'text-orange-600', icon: <Clock size={10} /> };
    return null;
  };
  
  const dueStatus = getDueStatus(entry.configuredDate);
  
  return (
    <div className={`bg-white rounded-lg p-3 border-l-4 hover:shadow-md transition-all ${examStyles.border} border-gray-200`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <XCircle size={14} className="text-red-500 flex-shrink-0" />
              <span className="text-sm font-semibold text-gray-900 truncate">
                {entry.examName}
              </span>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${examStyles.bg} ${examStyles.text}`}>
              {examStyles.label}
            </span>
            {entry.totalMarks && (
              <span className="text-xs font-medium text-gray-500">
                {entry.totalMarks} marks
              </span>
            )}
            {dueStatus && (
              <span className={`text-xs flex items-center gap-1 ${dueStatus.color}`}>
                {dueStatus.icon}
                {dueStatus.text}
              </span>
            )}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs text-gray-500 mt-1">
            <span className="font-medium truncate">{entry.className}</span>
            <span className="hidden sm:inline text-gray-300">→</span>
            <span className="truncate">{entry.subjectName}</span>
            {entry.configuredDate && !dueStatus && (
              <span className="flex items-center gap-1 text-gray-400">
                <Clock size={10} />
                Due: {new Date(entry.configuredDate).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        
        <button
          onClick={onNavigate}
          className="px-4 py-1.5 text-sm bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-sm hover:shadow flex-shrink-0"
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
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50 px-2 rounded-lg transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{entry.subjectName}</p>
        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${getExamTypeStyles(entry.examType)} font-medium`}>
            {entry.examType === 'week4' ? 'W4' : entry.examType === 'week8' ? 'W8' : 'EOT'}
          </span>
          <span className="text-xs text-gray-500 truncate">{entry.className}</span>
        </div>
      </div>
      <button
        onClick={onNavigate}
        className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 ml-2 flex-shrink-0 transition-colors"
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
    { key: 'week4', label: 'W4', name: 'Week 4', color: 'blue' },
    { key: 'week8', label: 'W8', name: 'Week 8', color: 'purple' },
    { key: 'endOfTerm', label: 'EOT', name: 'End of Term', color: 'green' }
  ];
  
  const getExamIcon = (isComplete: boolean, examColor: string) => {
    if (isComplete) {
      return <CheckCircle size={isMobile ? 12 : 14} className={`text-${examColor}-600`} />;
    }
    return <XCircle size={isMobile ? 12 : 14} className="text-red-500" />;
  };
  
  const getBarColor = (percentage: number) => {
    if (percentage === 100) return 'bg-green-500';
    if (percentage >= 75) return 'bg-blue-500';
    if (percentage >= 50) return 'bg-amber-500';
    if (percentage >= 25) return 'bg-orange-500';
    return 'bg-red-500';
  };
  
  if (subjectMissingEntries.length === 0) {
    return (
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-3 border border-green-200">
        <div className="flex items-center gap-2">
          <CheckCircle size={16} className="text-green-600" />
          <span className="text-sm font-semibold text-green-700">{subject.subjectName}</span>
          <span className="text-xs text-green-600 ml-auto bg-green-100 px-2 py-0.5 rounded-full">Complete</span>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg p-3 border border-amber-200">
      <div className="mb-2">
        <div className="flex items-center justify-between flex-wrap gap-1">
          <span className="text-sm font-semibold text-gray-900">{subject.subjectName}</span>
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${getBarColor(subject.completionPercentage)} transition-all duration-300`}
                style={{ width: `${subject.completionPercentage}%` }}
              />
            </div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              subject.completionPercentage === 100 ? 'bg-green-100 text-green-700' :
              subject.completionPercentage >= 75 ? 'bg-blue-100 text-blue-700' :
              subject.completionPercentage >= 50 ? 'bg-amber-100 text-amber-700' :
              'bg-red-100 text-red-700'
            }`}>
              {subject.completionPercentage}%
            </span>
          </div>
        </div>
        {!isMobile && subject.totalStudents > 0 && (
          <p className="text-xs text-gray-500 mt-1">{subject.totalStudents} students</p>
        )}
      </div>
      
      {/* Exam status row - shows which exams are missing */}
      <div className="flex flex-wrap items-center gap-4 mb-3 pb-2 border-b border-amber-200">
        {examTypes.map(exam => (
          <div key={exam.key} className="flex items-center gap-1">
            {getExamIcon(subject[`${exam.key}Complete`], exam.color)}
            <span className="text-xs font-medium text-gray-700">{exam.label}</span>
            {subject[`${exam.key}StudentCount`] > 0 && (
              <span className="text-xs text-gray-500">
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
    if (percentage === 100) return 'border-green-300 bg-green-50';
    if (percentage >= 75) return 'border-blue-300 bg-blue-50';
    if (percentage >= 50) return 'border-amber-300 bg-amber-50';
    if (percentage >= 25) return 'border-orange-300 bg-orange-50';
    return 'border-red-300 bg-red-50';
  };
  
  const getBarColor = (percentage: number) => {
    if (percentage === 100) return 'bg-green-500';
    if (percentage >= 75) return 'bg-blue-500';
    if (percentage >= 50) return 'bg-amber-500';
    if (percentage >= 25) return 'bg-orange-500';
    return 'bg-red-500';
  };
  
  return (
    <div className={`rounded-xl border-2 ${getClassStatusColor(classProgress.completionPercentage)} overflow-hidden shadow-sm`}>
      <button
        onClick={() => onToggle(classProgress.className)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {isExpanded ? 
            <ChevronDown size={18} className="text-gray-500 flex-shrink-0" /> : 
            <ChevronRight size={18} className="text-gray-500 flex-shrink-0" />
          }
          <div className="min-w-0 flex-1">
            <p className="font-bold text-gray-900 text-sm sm:text-base truncate">{classProgress.className}</p>
            <p className="text-xs text-gray-500">
              {classProgress.completedCount} of {classProgress.totalRequired} entries completed
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-20 sm:w-28">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${getBarColor(classProgress.completionPercentage)} transition-all duration-300`}
                style={{ width: `${classProgress.completionPercentage}%` }}
              />
            </div>
          </div>
          <span className={`text-sm font-bold min-w-[45px] text-right ${
            classProgress.completionPercentage === 100 ? 'text-green-700' :
            classProgress.completionPercentage >= 75 ? 'text-blue-700' :
            classProgress.completionPercentage >= 50 ? 'text-amber-700' :
            classProgress.completionPercentage >= 25 ? 'text-orange-700' : 'text-red-700'
          }`}>
            {classProgress.completionPercentage}%
          </span>
        </div>
      </button>
      
      {isExpanded && (
        <div className="px-4 pb-3 space-y-2 border-t border-inherit pt-3">
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
  const [compactExpanded, setCompactExpanded] = useState(false);
  
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
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 rounded-xl p-4 flex items-center gap-3">
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
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
        <CheckCircle className="text-green-600" size={20} />
        <div>
          <p className="text-green-800 font-semibold">All results entered!</p>
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
    return 'blue';
  };
  
  const statusColor = getStatusColor();
  const StatusIcon = isCritical ? AlertCircle : isBehind ? AlertTriangle : TrendingUp;
  
  const getStatusGradient = () => {
    if (isCritical) return 'from-red-50 to-red-100 border-red-200';
    if (isBehind) return 'from-orange-50 to-amber-100 border-orange-200';
    return 'from-blue-50 to-sky-100 border-blue-200';
  };
  
  // COMPACT MODE
  if (compact) {
    if (!compactExpanded) {
      return (
        <button
          onClick={() => setCompactExpanded(true)}
          className="w-full bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between hover:shadow-md transition-all"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative">
              <AlertCircle className="text-amber-600 flex-shrink-0" size={18} />
              <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full text-[8px] text-white flex items-center justify-center font-bold">
                {Math.min(9, myProgress.missingCount)}
              </span>
            </div>
            <span className="text-amber-800 text-sm font-semibold truncate">
              {myProgress.missingCount} pending result {myProgress.missingCount === 1 ? 'entry' : 'entries'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${isCritical ? 'bg-red-500' : isBehind ? 'bg-orange-500' : 'bg-blue-500'}`}
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
            <span className="text-amber-700 text-xs font-medium">
              {completionPercentage}%
            </span>
            <ChevronRight size={14} className="text-amber-600" />
          </div>
        </button>
      );
    }
    
    return (
      <div className="bg-white rounded-xl border-2 border-amber-200 shadow-md overflow-hidden">
        <div className={`bg-gradient-to-r ${getStatusGradient()} p-3 border-b`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <StatusIcon size={18} className={
                isCritical ? 'text-red-600 flex-shrink-0' :
                isBehind ? 'text-orange-600 flex-shrink-0' : 'text-blue-600 flex-shrink-0'
              } />
              <span className="font-bold text-gray-900 text-sm truncate">
                {myProgress.missingCount} pending entries
              </span>
            </div>
            <button
              onClick={() => setCompactExpanded(false)}
              className="text-xs text-gray-500 hover:text-gray-700 flex-shrink-0 ml-2"
            >
              Show less
            </button>
          </div>
          <div className="mt-2">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  isCritical ? 'bg-red-500' :
                  isBehind ? 'bg-orange-500' : 'bg-blue-500'
                }`}
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {myProgress.missingCount} missing across {myProgress.classProgress?.length || 0} classes
            </p>
          </div>
        </div>
        <div className="p-3 max-h-72 overflow-y-auto">
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
              className="w-full mt-2 text-center text-xs text-blue-600 hover:text-blue-700 font-medium"
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
    <div className="bg-white rounded-xl border border-gray-200 shadow-md overflow-hidden">
      {/* Header with summary */}
      <div className={`bg-gradient-to-r ${getStatusGradient()} p-5 border-b`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-xl ${
              isCritical ? 'bg-red-200' : isBehind ? 'bg-orange-200' : 'bg-blue-200'
            }`}>
              <StatusIcon size={24} className={
                isCritical ? 'text-red-700' : isBehind ? 'text-orange-700' : 'text-blue-700'
              } />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-lg">Pending Results Entry</h3>
              <p className="text-sm text-gray-700">
                You have <span className="font-bold text-red-600">{myProgress.missingCount}</span> exam {myProgress.missingCount === 1 ? 'entry' : 'entries'} pending
                out of {myProgress.totalRequired} total
              </p>
              {activeExamTypes && activeExamTypes.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {activeExamTypes.map((t: string) => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-white/60 text-gray-700">
                      {t === 'week4' ? 'Week 4' : t === 'week8' ? 'Week 8' : 'End of Term'}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Progress Ring */}
          <div className="flex items-center gap-3 bg-white/50 rounded-xl px-4 py-2">
            <div className="relative w-14 h-14">
              <svg className="w-14 h-14 transform -rotate-90">
                <circle
                  cx="28"
                  cy="28"
                  r="24"
                  stroke="#e5e7eb"
                  strokeWidth="5"
                  fill="none"
                />
                <circle
                  cx="28"
                  cy="28"
                  r="24"
                  stroke={
                    isCritical ? '#dc2626' : isBehind ? '#ea580c' : '#3b82f6'
                  }
                  strokeWidth="5"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 24}`}
                  strokeDashoffset={`${2 * Math.PI * 24 * (1 - completionPercentage / 100)}`}
                  className="transition-all duration-700"
                  strokeLinecap="round"
                />
              </svg>
              <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${
                isCritical ? 'text-red-700' : isBehind ? 'text-orange-700' : 'text-blue-700'
              }`}>
                {completionPercentage}%
              </span>
            </div>
            <span className="text-xs text-gray-500">complete</span>
          </div>
        </div>
        
        {/* Progress bar with status message */}
        <div className="mt-4">
          <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-700 ${
                isCritical ? 'bg-red-500' : isBehind ? 'bg-orange-500' : 'bg-blue-500'
              }`}
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
          <p className={`text-xs mt-2 font-medium ${
            isCritical ? 'text-red-600' : isBehind ? 'text-orange-600' : 'text-blue-600'
          }`}>
            {isCritical ? '⚠️ CRITICAL - Please prioritize entering results immediately' :
             isBehind ? '⚠️ Behind schedule - Please catch up soon' :
             isOnTrack ? '📝 On track - Keep up the good work!' :
             '✅ Complete!'}
          </p>
        </div>
      </div>
      
      {/* Class Progress Sections - ONLY shows classes with missing entries */}
      <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto p-4 space-y-3 bg-gray-50/30">
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
        <div className="px-5 py-4 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            onClick={() => {
              const firstMissing = myProgress.missingEntries[0];
              if (firstMissing) {
                handleNavigateToEntry(firstMissing);
              }
            }}
            className="w-full sm:w-auto text-sm bg-gradient-to-r from-blue-600 to-blue-700 text-white px-5 py-2.5 rounded-xl hover:from-blue-700 hover:to-blue-800 font-semibold flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow"
          >
            <FileText size={16} />
            Start entering results now
          </button>
          
          <div className="text-xs text-gray-500 text-center sm:text-right">
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