// @/pages/admin/ResultsEntryMonitor.tsx
import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useResultsEntryMonitor } from '@/hooks/useResultsEntryMonitor';
import type { ExamType, TeacherProgress } from '@/hooks/useResultsEntryMonitor';
import {
  getCurrentAcademicTerm,
  formatTermLabel,
  isCurrentTerm,
} from '@/utils/academicTerm';
import type { TermName } from '@/types/exam';

const EXAM_LABELS: Record<ExamType, string> = {
  week4: 'Week 4',
  week8: 'Week 8',
  endOfTerm: 'End of Term',
};

const TERM_OPTIONS: TermName[] = ['Term 1', 'Term 2', 'Term 3'];

export default function ResultsEntryMonitor() {
  // Year is auto-detected from the current academic calendar.
  const autoTerm = getCurrentAcademicTerm();

  // The admin can override the term. Default is the current academic term,
  // but they can look at any term in the current academic year.
  const [selectedTerm, setSelectedTerm] = useState<TermName>(autoTerm.term);

  const [expandedTeacherId, setExpandedTeacherId] = useState<string | null>(null);
  const [examFilter, setExamFilter] = useState<ExamType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'complete' | 'on-track' | 'behind' | 'critical'
  >('all');

  // The hook receives the selected term. The year stays at the auto-detected
  // value; changing term re-runs the query against Firestore for that term.
  const {
    teacherProgress,
    summary,
    activeExamTypes,
    isLoading,
    isFetching,
    isError,
    error,
    term,
    year,
    termLabel,
    isCurrentTerm: isTermCurrent,
    refetch,
    failedClasses,
    vacantSubjects,
  } = useResultsEntryMonitor({
    term: selectedTerm,
    year: autoTerm.year,
  });

  const filtered = useMemo(() => {
    let rows = teacherProgress;

    if (statusFilter !== 'all') {
      rows = rows.filter(t => t.status === statusFilter);
    }

    if (examFilter !== 'all') {
      rows = rows.filter(t =>
        t.missingEntries.some(e => e.examType === examFilter)
      );
    }

    return rows;
  }, [teacherProgress, statusFilter, examFilter]);

  // ── Header (shared across loading/error/empty/loaded states) ────────────
  const header = (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
          <Activity className="text-blue-600" size={28} />
          Results Entry Monitor
          {isTermCurrent && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              Live
            </span>
          )}
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Who has entered what, for {termLabel}
        </p>
      </div>

      <div className="flex items-center gap-2">
        {/* Term selector */}
        <div className="relative">
          <Calendar
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            size={16}
          />
          <select
            value={selectedTerm}
            onChange={e => {
              setSelectedTerm(e.target.value as TermName);
              // Collapse the currently-expanded teacher when the term changes,
              // so we don't show stale entries under a fresh header.
              setExpandedTeacherId(null);
            }}
            className="
              pl-9 pr-8 py-2 border border-gray-300 rounded-lg
              focus:ring-2 focus:ring-blue-500 focus:border-transparent
              appearance-none bg-white cursor-pointer text-sm
              hover:border-gray-400 transition-colors
            "
          >
            {TERM_OPTIONS.map(t => (
              <option key={t} value={t}>
                {formatTermLabel(t, autoTerm.year)}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
        </div>

        <Link
          to="/dashboard/admin/results-data-check"
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
        >
          Data check
        </Link>

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="
            inline-flex items-center gap-2 px-4 py-2
            border border-gray-300 rounded-lg hover:bg-gray-50
            text-sm font-medium disabled:opacity-50
          "
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>
    </div>
  );

  // ── Loading state ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <DashboardLayout activeTab="results-monitor">
        <div className="p-3 sm:p-6 lg:p-8 space-y-6">
          {header}
          <div className="flex items-center justify-center min-h-[40vh]">
            <div className="text-center">
              <Loader2
                className="animate-spin text-blue-600 mx-auto mb-3"
                size={32}
              />
              <p className="text-sm text-gray-600">
                Loading results monitor…
              </p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────────
  if (isError) {
    return (
      <DashboardLayout activeTab="results-monitor">
        <div className="p-3 sm:p-6 lg:p-8 space-y-6">
          {header}
          <div className="max-w-xl mx-auto bg-white rounded-2xl border border-red-200 p-8 text-center shadow">
            <AlertCircle className="text-red-600 mx-auto mb-3" size={40} />
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Failed to load monitor
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {error?.message || 'Unexpected error'}
            </p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Try again
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── No exams configured for this term ───────────────────────────────────
  if (activeExamTypes.length === 0) {
    return (
      <DashboardLayout activeTab="results-monitor">
        <div className="p-3 sm:p-6 lg:p-8 space-y-6">
          {header}
          <div className="max-w-xl mx-auto bg-white rounded-2xl border border-amber-200 p-8 text-center shadow">
            <AlertCircle className="text-amber-600 mx-auto mb-3" size={40} />
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              No exams configured for {termLabel}
            </h3>
            <p className="text-sm text-gray-600">
              Set up an exam configuration for this term before using the
              monitor.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── Loaded state ────────────────────────────────────────────────────────
  return (
    <DashboardLayout activeTab="results-monitor">
      <div className="p-3 sm:p-6 lg:p-8 space-y-6">
        {header}

        {/* Summary strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <SummaryCard label="Teachers" value={summary.totalTeachers} tone="neutral" />
          <SummaryCard
            label="Overall"
            value={`${summary.overallCompletion}%`}
            tone="blue"
          />
          <SummaryCard label="Complete" value={summary.teachersComplete} tone="green" />
          <SummaryCard label="On track" value={summary.teachersOnTrack} tone="cyan" />
          <SummaryCard label="Behind" value={summary.teachersBehind} tone="amber" />
          <SummaryCard
            label="Critical"
            value={summary.teachersCritical}
            tone="red"
          />
        </div>

        {/* Classes that failed to load — never shown as 0% or 100% */}
        {failedClasses.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800">
            <div className="font-medium flex items-center gap-2">
              <AlertCircle size={16} /> Some classes could not be loaded, so their teachers' numbers are incomplete:
            </div>
            <ul className="mt-1 ml-6 list-disc text-xs">
              {failedClasses.map(f => (
                <li key={f.classId}>{f.className}: {f.error}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Subjects with marks but no teacher assigned */}
        {vacantSubjects.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-900">
            <div className="font-medium">Subjects with marks but no teacher assigned</div>
            <p className="text-xs mt-0.5">
              These still appear on report cards. Assign a teacher in Teacher Management so the missing marks can be entered.
            </p>
            <ul className="mt-1 ml-5 list-disc text-xs">
              {vacantSubjects.map(v => (
                <li key={`${v.classId}-${v.subjectId}`}>
                  {v.className} • {v.subjectName} — {v.progress.completionPercentage}% entered
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-600">Exam:</span>
            <FilterButton
              active={examFilter === 'all'}
              onClick={() => setExamFilter('all')}
            >
              All
            </FilterButton>
            {activeExamTypes.map(t => (
              <FilterButton
                key={t}
                active={examFilter === t}
                onClick={() => setExamFilter(t)}
              >
                {EXAM_LABELS[t]}
              </FilterButton>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs font-medium text-gray-600">Status:</span>
            {(['all', 'complete', 'on-track', 'behind', 'critical'] as const).map(
              s => (
                <FilterButton
                  key={s}
                  active={statusFilter === s}
                  onClick={() => setStatusFilter(s)}
                >
                  {s === 'all' ? 'All' : s}
                </FilterButton>
              )
            )}
          </div>
        </div>

        {/* Teacher list */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <CheckCircle className="text-green-500 mx-auto mb-3" size={40} />
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              No teachers match the current filters
            </h3>
            <p className="text-sm text-gray-600">
              Try clearing the exam or status filter.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(t => (
              <TeacherRow
                key={t.teacherId}
                teacher={t}
                expanded={expandedTeacherId === t.teacherId}
                onToggle={() =>
                  setExpandedTeacherId(prev =>
                    prev === t.teacherId ? null : t.teacherId
                  )
                }
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: 'neutral' | 'blue' | 'green' | 'cyan' | 'amber' | 'red';
}) {
  const toneClasses = {
    neutral: 'bg-gray-50 border-gray-200 text-gray-900',
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    green: 'bg-green-50 border-green-200 text-green-900',
    cyan: 'bg-cyan-50 border-cyan-200 text-cyan-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    red: 'bg-red-50 border-red-200 text-red-900',
  }[tone];
  return (
    <div className={`rounded-xl border p-3 ${toneClasses}`}>
      <div className="text-[11px] font-medium opacity-70">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  );
}

function TeacherRow({
  teacher,
  expanded,
  onToggle,
}: {
  teacher: TeacherProgress;
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusClasses: Record<TeacherProgress['status'], string> = {
    complete: 'bg-green-100 text-green-700',
    'on-track': 'bg-cyan-100 text-cyan-700',
    behind: 'bg-amber-100 text-amber-700',
    critical: 'bg-red-100 text-red-700',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900 truncate">
              {teacher.teacherName}
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                statusClasses[teacher.status]
              }`}
            >
              {teacher.status}
            </span>
            {teacher.teachingAssignments.some(a => a.isDelegate) && (
              <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                covering
              </span>
            )}
            {teacher.teachingAssignments.length === 0 &&
              teacher.formTeacherClasses.length > 0 && (
                <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  form teacher only
                </span>
              )}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {teacher.completedCount}/{teacher.totalRequired} entries
            {teacher.missingCount > 0 &&
              ` • ${teacher.missingCount} missing`}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                teacher.status === 'complete'
                  ? 'bg-green-500'
                  : teacher.completionPercentage >= 75
                  ? 'bg-cyan-500'
                  : teacher.completionPercentage >= 50
                  ? 'bg-amber-500'
                  : 'bg-red-500'
              }`}
              style={{ width: `${teacher.completionPercentage}%` }}
            />
          </div>
          <span className="text-sm font-medium text-gray-700 w-12 text-right">
            {teacher.completionPercentage}%
          </span>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-200 bg-gray-50/40 p-4 space-y-4">
          {teacher.missingEntries.length > 0 ? (
            <div>
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Missing entries
              </h4>
              <div className="space-y-1.5">
                {teacher.missingEntries.map((m, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 bg-white rounded-lg border border-gray-200 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {m.className} • {m.subjectName}
                      </div>
                      <div className="text-xs text-gray-500">
                        {m.examName}
                        {m.totalMarks != null && ` • ${m.totalMarks} marks`}
                        {m.configuredDate &&
                          ` • due ${new Date(
                            m.configuredDate
                          ).toLocaleDateString()}`}
                      </div>
                      {m.missingStudentNames?.length > 0 && (
                        <div className="text-[11px] text-gray-500 mt-0.5">
                          Missing: {m.missingStudentNames.slice(0, 8).join(', ')}
                          {m.missingStudentNames.length > 8 && ` and ${m.missingStudentNames.length - 8} more`}
                        </div>
                      )}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-semibold text-amber-600">
                        {m.missingStudentCount}/{m.totalStudentCount}
                      </div>
                      <div className="text-[10px] text-gray-500">missing</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sm text-green-700 flex items-center gap-2">
              <CheckCircle size={16} />
              All entries complete for this teacher.
            </div>
          )}

          {teacher.formTeacherClasses.length > 0 && (
            <div className="text-xs text-gray-600">
              <span className="font-medium">Form teacher of:</span>{' '}
              {teacher.formTeacherClasses.length} class(es)
            </div>
          )}
        </div>
      )}
    </div>
  );
}