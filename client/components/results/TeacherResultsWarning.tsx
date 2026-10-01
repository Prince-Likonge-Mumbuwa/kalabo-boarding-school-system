// @/components/results/TeacherResultsWarning.tsx
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  AlertCircle, CheckCircle, AlertTriangle,
  ChevronDown, ChevronRight, FileText, Clock,
  XCircle, Info, TrendingUp, TrendingDown, Minus,
  Calendar,
} from 'lucide-react';
import { useResultsEntryMonitor } from '@/hooks/useResultsEntryMonitor';
import { useAcademicTerm } from '@/hooks/useAcademicTerm';
import {
  getAllTermsForYear,
  isCurrentTerm,
  formatTermLabel,
  type TermName,
  type AcademicTermInfo,
} from '@/utils/academicTerm';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface TeacherResultsWarningProps {
  /**
   * If provided, ONLY this term is scanned. Otherwise, the component scans
   * every term in the current academic year and reports each separately.
   */
  term?: string;
  /**
   * Academic year to scan. If omitted, the current academic year is used
   * (auto-detected from the real-time calendar).
   */
  year?: number;
  /** Render as a compact banner instead of the full panel. */
  compact?: boolean;
  /** Custom navigation handler. Falls back to internal `navigate()`. */
  onNavigateToResults?: (entry: any) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Term Badge
// ─────────────────────────────────────────────────────────────────────────────

const TermBadge = ({
  label,
  isCurrent = false,
  variant = 'default',
  tone = 'neutral',
}: {
  label: string;
  isCurrent?: boolean;
  variant?: 'default' | 'compact';
  tone?: 'neutral' | 'danger' | 'warning' | 'success';
}) => {
  const size =
    variant === 'compact'
      ? 'text-[10px] px-1.5 py-0.5 rounded-full'
      : 'text-xs px-2 py-0.5 rounded-full';

  const toneClasses: Record<typeof tone, string> = {
    neutral: 'bg-white/70 text-gray-700 border-white/60',
    danger: 'bg-red-100 text-red-800 border-red-200',
    warning: 'bg-amber-100 text-amber-800 border-amber-200',
    success: 'bg-green-100 text-green-800 border-green-200',
  } as any;

  return (
    <span
      className={`${size} inline-flex items-center gap-1 font-semibold border ${toneClasses[tone]}`}
    >
      <Calendar size={variant === 'compact' ? 9 : 11} />
      {label}
      {isCurrent && (
        <span className="ml-1 text-[9px] uppercase tracking-wide text-green-700 bg-green-100 px-1 rounded-sm">
          Current
        </span>
      )}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MISSING ENTRY CARD
// ─────────────────────────────────────────────────────────────────────────────

const MissingEntryCard = ({
  entry,
  onNavigate,
}: {
  entry: any;
  onNavigate: () => void;
}) => {
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
    const daysDiff = Math.ceil(
      (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysDiff < 0)
      return { text: 'Overdue', color: 'text-red-600', icon: <AlertCircle size={10} /> };
    if (daysDiff <= 3)
      return { text: `Due in ${daysDiff} days`, color: 'text-orange-600', icon: <Clock size={10} /> };
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

// ─────────────────────────────────────────────────────────────────────────────
// COMPACT MISSING ENTRY
// ─────────────────────────────────────────────────────────────────────────────

const CompactMissingEntry = ({
  entry,
  onNavigate,
}: {
  entry: any;
  onNavigate: () => void;
}) => {
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
        <p className="text-sm font-medium text-gray-900 truncate">
          {entry.subjectName}
        </p>
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

// ─────────────────────────────────────────────────────────────────────────────
// SUBJECT PROGRESS ROW
// ─────────────────────────────────────────────────────────────────────────────

const SubjectProgressRow = ({ subject, missingEntries, onNavigate }: any) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  const subjectMissingEntries = missingEntries.filter(
    (e: any) => e.subjectId === subject.subjectId
  );

  const examTypes = [
    { key: 'week4', label: 'W4', color: 'blue' },
    { key: 'week8', label: 'W8', color: 'purple' },
    { key: 'endOfTerm', label: 'EOT', color: 'green' },
  ];

  const getExamIcon = (isComplete: boolean, examColor: string) => {
    if (isComplete) {
      return (
        <CheckCircle
          size={isMobile ? 12 : 14}
          className={`text-${examColor}-600`}
        />
      );
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
          <span className="text-sm font-semibold text-green-700">
            {subject.subjectName}
          </span>
          <span className="text-xs text-green-600 ml-auto bg-green-100 px-2 py-0.5 rounded-full">
            Complete
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg p-3 border border-amber-200">
      <div className="mb-2">
        <div className="flex items-center justify-between flex-wrap gap-1">
          <span className="text-sm font-semibold text-gray-900">
            {subject.subjectName}
          </span>
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${getBarColor(subject.completionPercentage)} transition-all duration-300`}
                style={{ width: `${subject.completionPercentage}%` }}
              />
            </div>
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                subject.completionPercentage === 100
                  ? 'bg-green-100 text-green-700'
                  : subject.completionPercentage >= 75
                  ? 'bg-blue-100 text-blue-700'
                  : subject.completionPercentage >= 50
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-red-100 text-red-700'
              }`}
            >
              {subject.completionPercentage}%
            </span>
          </div>
        </div>
        {!isMobile && subject.totalStudents > 0 && (
          <p className="text-xs text-gray-500 mt-1">
            {subject.totalStudents} students
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-3 pb-2 border-b border-amber-200">
        {examTypes.map(exam => (
          <div key={exam.key} className="flex items-center gap-1">
            {getExamIcon(subject[`${exam.key}Complete`], exam.color)}
            <span className="text-xs font-medium text-gray-700">
              {exam.label}
            </span>
            {subject[`${exam.key}StudentCount`] > 0 && (
              <span className="text-xs text-gray-500">
                ({subject[`${exam.key}StudentCount`]}/{subject.totalStudents})
              </span>
            )}
          </div>
        ))}
      </div>

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

// ─────────────────────────────────────────────────────────────────────────────
// CLASS PROGRESS SECTION
// ─────────────────────────────────────────────────────────────────────────────

const ClassProgressSection = ({
  classProgress,
  missingEntries,
  onNavigate,
  isExpanded,
  onToggle,
}: any) => {
  const classMissingEntries = missingEntries.filter(
    (e: any) => e.classId === classProgress.classId
  );

  if (
    classMissingEntries.length === 0 &&
    classProgress.completionPercentage === 100
  ) {
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
    <div
      className={`rounded-xl border-2 ${getClassStatusColor(classProgress.completionPercentage)} overflow-hidden shadow-sm`}
    >
      <button
        onClick={() => onToggle(classProgress.classId)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-white/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {isExpanded ? (
            <ChevronDown size={18} className="text-gray-500 flex-shrink-0" />
          ) : (
            <ChevronRight size={18} className="text-gray-500 flex-shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-bold text-gray-900 text-sm sm:text-base truncate">
              {classProgress.className}
            </p>
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
          <span
            className={`text-sm font-bold min-w-[45px] text-right ${
              classProgress.completionPercentage === 100
                ? 'text-green-700'
                : classProgress.completionPercentage >= 75
                ? 'text-blue-700'
                : classProgress.completionPercentage >= 50
                ? 'text-amber-700'
                : classProgress.completionPercentage >= 25
                ? 'text-orange-700'
                : 'text-red-700'
            }`}
          >
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
              missingEntries={classMissingEntries}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SINGLE-TERM PANEL
// ─────────────────────────────────────────────────────────────────────────────
// Renders the summary + class breakdown for ONE term's progress object.
// Reused for both the "current" term and any "past" term with gaps.

interface TermPanelProps {
  progress: any;                       // TeacherProgress for a specific term
  termInfo: AcademicTermInfo;
  isCurrent: boolean;
  expandedClasses: Set<string>;
  toggleClass: (id: string) => void;
  onNavigate: (entry: any) => void;
}

const TermPanel = ({
  progress,
  termInfo,
  isCurrent,
  expandedClasses,
  toggleClass,
  onNavigate,
}: TermPanelProps) => {
  const completionPercentage = progress.completionPercentage;
  const isCritical = completionPercentage < 50;
  const isBehind = completionPercentage >= 50 && completionPercentage < 75;
  const isOnTrack = completionPercentage >= 75 && completionPercentage < 100;
  const isComplete = completionPercentage >= 96;

  const StatusIcon = isComplete
    ? CheckCircle
    : isCritical
    ? AlertCircle
    : isBehind
    ? AlertTriangle
    : TrendingUp;

  const getStatusGradient = () => {
    if (isComplete) return 'from-green-50 to-emerald-100 border-green-200';
    if (isCritical) return 'from-red-50 to-red-100 border-red-200';
    if (isBehind) return 'from-orange-50 to-amber-100 border-orange-200';
    return 'from-blue-50 to-sky-100 border-blue-200';
  };

  const tone: 'neutral' | 'danger' | 'warning' | 'success' = isComplete
    ? 'success'
    : isCritical
    ? 'danger'
    : isBehind
    ? 'warning'
    : 'neutral';

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className={`bg-gradient-to-r ${getStatusGradient()} p-4 border-b`}>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`p-2 rounded-xl ${
                isComplete
                  ? 'bg-green-200'
                  : isCritical
                  ? 'bg-red-200'
                  : isBehind
                  ? 'bg-orange-200'
                  : 'bg-blue-200'
              }`}
            >
              <StatusIcon
                size={22}
                className={
                  isComplete
                    ? 'text-green-700'
                    : isCritical
                    ? 'text-red-700'
                    : isBehind
                    ? 'text-orange-700'
                    : 'text-blue-700'
                }
              />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <TermBadge
                  label={termInfo.label}
                  isCurrent={isCurrent}
                  tone={tone}
                />
              </div>

              <h4 className="font-bold text-gray-900 text-base">
                {isComplete
                  ? 'Results complete'
                  : `${progress.missingCount} pending ${
                      progress.missingCount === 1 ? 'entry' : 'entries'
                    }`}
              </h4>
              <p className="text-sm text-gray-700">
                {progress.completedCount} of {progress.totalRequired} entries entered
              </p>
            </div>
          </div>

          {/* Compact progress bar */}
          <div className="flex items-center gap-3 bg-white/50 rounded-xl px-3 py-2">
            <div className="w-24 sm:w-32">
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isComplete
                      ? 'bg-green-500'
                      : isCritical
                      ? 'bg-red-500'
                      : isBehind
                      ? 'bg-orange-500'
                      : 'bg-blue-500'
                  }`}
                  style={{ width: `${completionPercentage}%` }}
                />
              </div>
            </div>
            <span
              className={`text-sm font-bold ${
                isComplete
                  ? 'text-green-700'
                  : isCritical
                  ? 'text-red-700'
                  : isBehind
                  ? 'text-orange-700'
                  : 'text-blue-700'
              }`}
            >
              {completionPercentage}%
            </span>
          </div>
        </div>
      </div>

      {/* Class breakdown */}
      <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto p-3 space-y-3 bg-gray-50/30">
        {progress.classProgress && progress.classProgress.length > 0 ? (
          progress.classProgress.map((classProgress: any) => {
            const hasMissing = progress.missingEntries.some(
              (entry: any) => entry.classId === classProgress.classId
            );
            if (!hasMissing && classProgress.completionPercentage === 100) {
              return null;
            }
            return (
              <ClassProgressSection
                key={`${termInfo.term}_${classProgress.classId}`}
                classProgress={classProgress}
                missingEntries={progress.missingEntries}
                onNavigate={onNavigate}
                isExpanded={expandedClasses.has(
                  `${termInfo.term}_${classProgress.classId}`
                )}
                onToggle={toggleClass}
              />
            );
          })
        ) : (
          <div className="text-center py-6">
            <p className="text-gray-500 text-sm">No classes need attention.</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const TeacherResultsWarning = ({
  term: termProp,
  year: yearProp,
  compact = false,
  onNavigateToResults,
}: TeacherResultsWarningProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(
    new Set()
  );
  const [compactExpanded, setCompactExpanded] = useState(false);

  // ── Resolve academic year to scan ──────────────────────────────────────
  const academicTerm = useAcademicTerm();
  const year = yearProp ?? academicTerm.year;

  // If the caller pinned a term, scan only that one.
  // Otherwise scan all 3 terms of the academic year.
  const termsToScan: AcademicTermInfo[] = useMemo(() => {
    if (termProp) {
      const info = academicTerm.getByName(termProp as TermName, year);
      return info ? [info] : [];
    }
    return getAllTermsForYear(year);
  }, [termProp, year, academicTerm]);

  // ── Run the monitor for each term ──────────────────────────────────────
  // NOTE: useResultsEntryMonitor is a hook, so we cannot call it inside a
  // loop conditionally. We build a fixed-size array of hooks (max 3 terms)
  // and pass `undefined` term/year to the unused slots by using the
  // current term as a harmless placeholder.
  const term1 = termsToScan[0];
  const term2 = termsToScan[1];
  const term3 = termsToScan[2];

  const monitor1 = useResultsEntryMonitor({
    term: term1?.term,
    year: term1?.year,
    teacherId: user?.uid,
  });
  const monitor2 = useResultsEntryMonitor({
    term: term2?.term,
    year: term2?.year,
    teacherId: user?.uid,
  });
  const monitor3 = useResultsEntryMonitor({
    term: term3?.term,
    year: term3?.year,
    teacherId: user?.uid,
  });

  const monitors = [monitor1, monitor2, monitor3];

  const isLoading =
    monitors.some(m => m.isLoading) && termsToScan.length > 0;

  // ── Combine results into per-term panels ───────────────────────────────
  const termReports = useMemo(() => {
    return termsToScan
      .map((info, idx) => {
        const monitor = monitors[idx];
        const progress = monitor?.myProgress;
        if (!progress) return null;
        return {
          info,
          progress,
          isCurrent: isCurrentTerm(info.term, info.year),
          activeExamTypes: monitor.activeExamTypes,
        };
      })
      .filter(Boolean) as Array<{
      info: AcademicTermInfo;
      progress: any;
      isCurrent: boolean;
      activeExamTypes: string[];
    }>;
  }, [termsToScan, monitors]);

  // Only keep terms that actually have missing entries
  const termsWithMissing = useMemo(
    () => termReports.filter(r => r.progress.missingCount > 0),
    [termReports]
  );

  // Sort: current term first, then most recent → oldest
  const sortedTerms = useMemo(() => {
    const order: Record<TermName, number> = {
      'Term 3': 3,
      'Term 2': 2,
      'Term 1': 1,
    };
    return [...termsWithMissing].sort((a, b) => {
      if (a.isCurrent && !b.isCurrent) return -1;
      if (!a.isCurrent && b.isCurrent) return 1;
      return order[b.info.term] - order[a.info.term];
    });
  }, [termsWithMissing]);

  // ── Navigation ─────────────────────────────────────────────────────────
  const handleNavigateToEntry = (
    entry: any,
    termInfo: AcademicTermInfo
  ) => {
    if (onNavigateToResults) {
      onNavigateToResults({ ...entry, term: termInfo.term, year: termInfo.year });
    } else {
      navigate('/dashboard/teacher/results-entry', {
        state: {
          classId: entry.classId,
          className: entry.className,
          subjectId: entry.subjectId,
          subjectName: entry.subjectName,
          examType: entry.examType,
          examName: entry.examName,
          term: termInfo.term,
          year: termInfo.year,
        },
      });
    }
  };

  const toggleClass = (key: string) => {
    setExpandedClasses(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Loading ────────────────────────────────────────────────────────────
  if (isLoading) {
    if (compact) return null;
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-3"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
      </div>
    );
  }

  // ── Nothing to warn about ──────────────────────────────────────────────
  if (sortedTerms.length === 0) {
    if (compact) return null;

    // Determine if the teacher has NO assignments at all
    const anyAssignments = termReports.some(
      r => (r.progress.teachingAssignments?.length ?? 0) > 0
    );

    if (!anyAssignments) {
      return (
        <div className="bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 rounded-xl p-4 flex items-center gap-3">
          <Info className="text-gray-500" size={20} />
          <div>
            <p className="text-gray-700 font-medium">
              No class assignments found
            </p>
            <p className="text-gray-500 text-sm">
              You don't have any class assignments for {year}. Please contact
              the administrator.
            </p>
          </div>
        </div>
      );
    }

    // All terms complete
    return (
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
        <CheckCircle className="text-green-600" size={20} />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-green-800 font-semibold">
              All results entered!
            </p>
            <TermBadge
              label={`Academic year ${year}`}
              isCurrent
              tone="success"
            />
          </div>
          <p className="text-green-600 text-sm mt-0.5">
            Every term in {year} has all required exam entries completed.
          </p>
        </div>
      </div>
    );
  }

  // ── Compute totals across all flagged terms ────────────────────────────
  const totalMissing = sortedTerms.reduce(
    (sum, r) => sum + r.progress.missingCount,
    0
  );
  const totalRequired = sortedTerms.reduce(
    (sum, r) => sum + r.progress.totalRequired,
    0
  );
  const totalCompleted = totalRequired - totalMissing;
  const overallCompletion =
    totalRequired > 0
      ? Math.round((totalCompleted / totalRequired) * 100)
      : 100;

  const currentTermReport = sortedTerms.find(r => r.isCurrent);
  const pastTermsWithMissing = sortedTerms.filter(r => !r.isCurrent);

  // ═══════════════════════════════════════════════════════════════════════
  // COMPACT MODE
  // ═══════════════════════════════════════════════════════════════════════
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
                {Math.min(9, totalMissing)}
              </span>
            </div>
            <span className="text-amber-800 text-sm font-semibold truncate">
              {totalMissing} pending across {sortedTerms.length}{' '}
              {sortedTerms.length === 1 ? 'term' : 'terms'}
            </span>
            {pastTermsWithMissing.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">
                {pastTermsWithMissing.length} past
              </span>
            )}
            <TermBadge
              label={`AY ${year}`}
              isCurrent={false}
              variant="compact"
            />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  overallCompletion < 50
                    ? 'bg-red-500'
                    : overallCompletion < 75
                    ? 'bg-orange-500'
                    : 'bg-blue-500'
                }`}
                style={{ width: `${overallCompletion}%` }}
              />
            </div>
            <span className="text-amber-700 text-xs font-medium">
              {overallCompletion}%
            </span>
            <ChevronRight size={14} className="text-amber-600" />
          </div>
        </button>
      );
    }

    // Expanded compact — show one row per term
    return (
      <div className="bg-white rounded-xl border-2 border-amber-200 shadow-md overflow-hidden">
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 p-3 border-b">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <AlertCircle
                size={18}
                className="text-amber-600 flex-shrink-0"
              />
              <span className="font-bold text-gray-900 text-sm truncate">
                {totalMissing} pending across {sortedTerms.length}{' '}
                {sortedTerms.length === 1 ? 'term' : 'terms'}
              </span>
              <TermBadge
                label={`AY ${year}`}
                isCurrent={false}
                variant="compact"
              />
            </div>
            <button
              onClick={() => setCompactExpanded(false)}
              className="text-xs text-gray-500 hover:text-gray-700 flex-shrink-0 ml-2"
            >
              Show less
            </button>
          </div>
        </div>
        <div className="p-3 max-h-80 overflow-y-auto space-y-3">
          {sortedTerms.map(r => (
            <div key={r.info.term}>
              <div className="flex items-center gap-2 mb-1">
                <TermBadge
                  label={r.info.label}
                  isCurrent={r.isCurrent}
                  variant="compact"
                  tone={r.isCurrent ? 'warning' : 'neutral'}
                />
                <span className="text-xs text-gray-500">
                  {r.progress.missingCount} missing
                </span>
              </div>
              {r.progress.missingEntries
                .slice(0, 3)
                .map((entry: any, idx: number) => (
                  <CompactMissingEntry
                    key={`${r.info.term}_${idx}`}
                    entry={entry}
                    onNavigate={() => handleNavigateToEntry(entry, r.info)}
                  />
                ))}
              {r.progress.missingEntries.length > 3 && (
                <p className="text-[11px] text-gray-400 mt-1 pl-2">
                  + {r.progress.missingEntries.length - 3} more in{' '}
                  {r.info.label}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FULL MODE
  // ═══════════════════════════════════════════════════════════════════════
  const isOverallCritical = overallCompletion < 50;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-md overflow-hidden">
      {/* Top-level summary */}
      <div
        className={`bg-gradient-to-r ${
          isOverallCritical
            ? 'from-red-50 to-red-100 border-red-200'
            : 'from-amber-50 to-orange-100 border-amber-200'
        } p-5 border-b`}
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`p-2 rounded-xl ${
                isOverallCritical ? 'bg-red-200' : 'bg-amber-200'
              }`}
            >
              <AlertTriangle
                size={24}
                className={
                  isOverallCritical ? 'text-red-700' : 'text-amber-700'
                }
              />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <TermBadge
                  label={`Academic Year ${year}`}
                  isCurrent={false}
                  tone={isOverallCritical ? 'danger' : 'warning'}
                />
                {pastTermsWithMissing.length > 0 && (
                  <span className="text-[10px] uppercase tracking-wide font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                    {pastTermsWithMissing.length} past{' '}
                    {pastTermsWithMissing.length === 1 ? 'term' : 'terms'} need
                    attention
                  </span>
                )}
              </div>

              <h3 className="font-bold text-gray-900 text-lg">
                Pending Results Entry
              </h3>
              <p className="text-sm text-gray-700">
                You have{' '}
                <span className="font-bold text-red-600">{totalMissing}</span>{' '}
                exam {totalMissing === 1 ? 'entry' : 'entries'} pending across{' '}
                <span className="font-semibold">
                  {sortedTerms.length}{' '}
                  {sortedTerms.length === 1 ? 'term' : 'terms'}
                </span>{' '}
                in {year}
              </p>
              {currentTermReport && (
                <p className="text-xs text-gray-600 mt-1">
                  Current term:{' '}
                  <span className="font-semibold">
                    {currentTermReport.info.label}
                  </span>{' '}
                  — {currentTermReport.progress.missingCount} pending
                </p>
              )}
            </div>
          </div>

          {/* Overall ring */}
          <div className="flex items-center gap-3 bg-white/60 rounded-xl px-4 py-2">
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
                  stroke={isOverallCritical ? '#dc2626' : '#f59e0b'}
                  strokeWidth="5"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 24}`}
                  strokeDashoffset={`${
                    2 * Math.PI * 24 * (1 - overallCompletion / 100)
                  }`}
                  className="transition-all duration-700"
                  strokeLinecap="round"
                />
              </svg>
              <span
                className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${
                  isOverallCritical ? 'text-red-700' : 'text-amber-700'
                }`}
              >
                {overallCompletion}%
              </span>
            </div>
            <span className="text-xs text-gray-500">overall</span>
          </div>
        </div>

        {/* Term chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          {termReports.map(r => {
            const hasGap = r.progress.missingCount > 0;
            return (
              <div
                key={r.info.term}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                  hasGap
                    ? r.isCurrent
                      ? 'bg-amber-100 text-amber-800 border-amber-200'
                      : 'bg-red-100 text-red-800 border-red-200'
                    : 'bg-green-100 text-green-800 border-green-200'
                }`}
              >
                {hasGap ? (
                  <AlertCircle size={11} />
                ) : (
                  <CheckCircle size={11} />
                )}
                <span>{r.info.label}</span>
                {hasGap && (
                  <span className="font-bold">
                    {r.progress.missingCount}
                  </span>
                )}
                {r.isCurrent && (
                  <span className="text-[9px] uppercase tracking-wide opacity-70">
                    · current
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-term panels */}
      <div className="p-4 space-y-4 bg-gray-50/40 max-h-[700px] overflow-y-auto">
        {sortedTerms.map(r => (
          <TermPanel
            key={r.info.term}
            progress={r.progress}
            termInfo={r.info}
            isCurrent={r.isCurrent}
            expandedClasses={expandedClasses}
            toggleClass={toggleClass}
            onNavigate={entry => handleNavigateToEntry(entry, r.info)}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 bg-gray-50 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3">
        <button
          onClick={() => {
            // Prefer the current term if it has gaps; otherwise oldest past term.
            const target =
              sortedTerms.find(r => r.isCurrent) ?? sortedTerms[0];
            const firstEntry = target.progress.missingEntries[0];
            if (firstEntry) handleNavigateToEntry(firstEntry, target.info);
          }}
          className="w-full sm:w-auto text-sm bg-gradient-to-r from-blue-600 to-blue-700 text-white px-5 py-2.5 rounded-xl hover:from-blue-700 hover:to-blue-800 font-semibold flex items-center justify-center gap-2 transition-all shadow-sm hover:shadow"
        >
          <FileText size={16} />
          Start entering results now
        </button>

        <div className="text-xs text-gray-500 text-center sm:text-right">
          {totalMissing} pending across {sortedTerms.length}{' '}
          {sortedTerms.length === 1 ? 'term' : 'terms'} in {year}
        </div>
      </div>
    </div>
  );
};