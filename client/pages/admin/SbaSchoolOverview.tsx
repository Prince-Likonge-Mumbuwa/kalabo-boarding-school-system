// @/pages/admin/SbaSchoolOverview.tsx
// Admin school-wide SBA overview — ECSEOL 2026

import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useMemo, useCallback } from 'react';
import {
  Loader2,
  Download,
  AlertCircle,
  CheckCircle,
  Users,
  GraduationCap,
  TrendingUp,
  FileText,
  RefreshCw,
  Layers,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useSbaSchoolOverview } from '@/hooks/useSba';
import { useMediaQuery } from '@/hooks/useMediaQuery';

// ==================== HELPERS ====================

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR + i);

interface ToastState {
  id: number;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

// ==================== STAT CARD ====================

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  accent: 'blue' | 'green' | 'amber' | 'red' | 'indigo';
  hint?: string;
}) {
  const styles: Record<typeof accent, { bg: string; text: string; ring: string }> = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-200' },
    green: { bg: 'bg-green-50', text: 'text-green-700', ring: 'ring-green-200' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200' },
    red: { bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-200' },
    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-700', ring: 'ring-indigo-200' },
  };
  const s = styles[accent];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <div className="flex items-start justify-between mb-2">
        <div className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${s.bg} ring-1 ${s.ring}`}>
          <Icon size={18} className={s.text} />
        </div>
      </div>
      <div className={`text-2xl font-bold ${s.text} mb-0.5`}>{value}</div>
      <div className="text-xs font-medium text-gray-600">{label}</div>
      {hint && <div className="text-[10px] text-gray-400 mt-1">{hint}</div>}
    </div>
  );
}

// ==================== LEVEL BAR ====================

function LevelBar({ distribution }: { distribution: Record<number, number> }) {
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  if (total === 0) {
    return (
      <div className="text-xs text-gray-400 italic">No entries yet</div>
    );
  }

  const colors: Record<number, string> = {
    1: 'bg-green-500',
    2: 'bg-blue-500',
    3: 'bg-teal-500',
    4: 'bg-yellow-500',
    5: 'bg-red-500',
  };
  const labels: Record<number, string> = {
    1: 'Outstanding',
    2: 'Advanced',
    3: 'Basic',
    4: 'Satisfactory',
    5: 'Unsatisfactory',
  };

  return (
    <div>
      <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
        {[1, 2, 3, 4, 5].map(level => {
          const count = distribution[level] || 0;
          if (count === 0) return null;
          const pct = (count / total) * 100;
          return (
            <div
              key={level}
              className={colors[level]}
              style={{ width: `${pct}%` }}
              title={`${labels[level]}: ${count}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 mt-1.5 text-[10px] text-gray-500">
        {[1, 2, 3, 4, 5].map(level => {
          const count = distribution[level] || 0;
          if (count === 0) return null;
          return (
            <span key={level} className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-sm ${colors[level]}`} />
              {labels[level]}: <strong className="text-gray-700">{count}</strong>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ==================== PROGRESS BAR ====================

function ProgressBar({ pct }: { pct: number }) {
  const color =
    pct >= 90 ? 'bg-green-500' :
    pct >= 60 ? 'bg-blue-500' :
    pct >= 30 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium text-gray-700 tabular-nums w-10 text-right">
        {pct}%
      </span>
    </div>
  );
}

// ==================== TOAST ====================

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastState[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => {
        const bg = {
          success: 'bg-green-600',
          warning: 'bg-yellow-600',
          info: 'bg-blue-600',
          error: 'bg-red-600',
        }[t.type];
        setTimeout(() => onDismiss(t.id), 3500);

        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium max-w-xs ${bg}`}
          >
            <span className="flex-1">{t.message}</span>
            <button onClick={() => onDismiss(t.id)} className="text-white/70 hover:text-white">
              &times;
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ==================== MAIN PAGE ====================

export default function SbaSchoolOverview() {
  const isMobile = useMediaQuery('(max-width: 640px)');
  const [examYear, setExamYear] = useState(CURRENT_YEAR + 1); // Most SBA tracked for next year's cohort
  const [activeTab, setActiveTab] = useState<'classes' | 'subjects'>('classes');
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const { data: overview, isLoading, isFetching, isError, error, refetch } =
    useSbaSchoolOverview(examYear);

  const showToast = useCallback((type: ToastState['type'], message: string) => {
    setToasts(prev => [...prev, { id: Date.now(), type, message }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Flatten subjects across classes for the "Subjects" tab
  const allSubjects = useMemo(() => {
    // We only have per-class data from the school overview hook.
    // For the subjects tab, we'll use the zero-entries list + per-class summaries.
    if (!overview) return [];
    return overview.subjectsWithZeroEntries.map(s => ({
      className: s.className,
      subjectName: s.subjectName,
      teacherName: s.teacherName,
      status: 'zero' as const,
    }));
  }, [overview]);

  const handleDownloadPdf = useCallback(async () => {
    if (!overview) return;
    setGeneratingPdf(true);
    try {
      const { generateSbaSchoolOverviewPDF } = await import('@/services/pdf/sbaOverviewPDF');
      await generateSbaSchoolOverviewPDF({ overview });
      showToast('success', 'School overview PDF generated');
    } catch (err) {
      console.error(err);
      showToast('error', 'Failed to generate PDF');
    } finally {
      setGeneratingPdf(false);
    }
  }, [overview, showToast]);

  // ==================== RENDER ====================

  return (
    <DashboardLayout activeTab="sba-overview">
      <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 tracking-tight">
              SBA School Overview
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 mt-0.5">
              Monitor School Based Assessment progress across all classes and subjects
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div>
              <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-0.5">
                Exam Year
              </label>
              <select
                value={examYear}
                onChange={e => setExamYear(parseInt(e.target.value, 10))}
                className="px-3 py-2 border border-gray-300 rounded-xl text-sm bg-white"
              >
                {YEAR_OPTIONS.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div className="self-end">
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 px-3 py-2 text-sm font-medium disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="self-end">
              <button
                onClick={handleDownloadPdf}
                disabled={!overview || generatingPdf}
                className="inline-flex items-center gap-1.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 px-3 py-2 text-sm font-medium disabled:opacity-50"
              >
                {generatingPdf ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                Export PDF
              </button>
            </div>
          </div>
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 flex flex-col items-center gap-3">
            <Loader2 className="animate-spin text-blue-600" size={32} />
            <p className="text-sm text-gray-600">Loading school-wide SBA data...</p>
          </div>
        )}

        {/* Error */}
        {isError && !isLoading && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle size={20} className="text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-900">Failed to load SBA overview</p>
              <p className="text-xs text-red-700 mt-0.5">
                {(error as any)?.message || 'Please try again.'}
              </p>
            </div>
          </div>
        )}

        {/* Empty */}
        {overview && !isLoading && overview.totalClasses === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-4">
              <GraduationCap className="text-gray-400" size={32} />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No form classes found
            </h3>
            <p className="text-sm text-gray-600 max-w-md mx-auto">
              SBA is only available for Form classes (Form 1–3). Create form classes and assign subject teachers to start tracking.
            </p>
          </div>
        )}

        {/* Data */}
        {overview && !isLoading && overview.totalClasses > 0 && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                icon={TrendingUp}
                label="Overall Completion"
                value={`${overview.overallPercentComplete}%`}
                accent={overview.overallPercentComplete >= 80 ? 'green' : overview.overallPercentComplete >= 50 ? 'blue' : 'amber'}
                hint={`${overview.totalSbaRecords} records entered`}
              />
              <StatCard
                icon={CheckCircle}
                label="Avg SBA %"
                value={overview.avgSbaRawPercentage >= 0 ? `${overview.avgSbaRawPercentage}%` : '—'}
                accent="green"
                hint="Across all entered subjects"
              />
              <StatCard
                icon={Users}
                label="Students Tracked"
                value={overview.totalStudents}
                accent="blue"
                hint={`Across ${overview.totalClasses} class${overview.totalClasses === 1 ? '' : 'es'}`}
              />
              <StatCard
                icon={AlertCircle}
                label="Zero-Entry Subjects"
                value={overview.subjectsWithZeroEntries.length}
                accent={overview.subjectsWithZeroEntries.length > 0 ? 'red' : 'green'}
                hint={overview.subjectsWithZeroEntries.length > 0 ? 'Requires attention' : 'All subjects have entries'}
              />
            </div>

            {/* Level distribution */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Layers size={16} className="text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-800">
                  Projected Competency Distribution (SBA Only)
                </h3>
                <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  Provisional
                </span>
              </div>
              <LevelBar distribution={overview.levelDistribution} />
              <p className="text-[10px] text-gray-400 mt-2 italic">
                Competency levels based on SBA-only percentages. Final grading combines SBA with the Final Examination.
              </p>
            </div>

            {/* Zero-entry alert */}
            {overview.subjectsWithZeroEntries.length > 0 && (
              <div className="bg-red-50 border-l-4 border-red-500 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle size={20} className="text-red-600 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-red-900 mb-1">
                      {overview.subjectsWithZeroEntries.length} subject{overview.subjectsWithZeroEntries.length === 1 ? '' : 's'} with no SBA entries
                    </h4>
                    <p className="text-xs text-red-700 mb-2">
                      Contact the respective subject teachers to ensure SBA marks are captured before the ECZ submission deadline.
                    </p>
                    {!isMobile && (
                      <div className="flex flex-wrap gap-1.5">
                        {overview.subjectsWithZeroEntries.slice(0, 8).map((s, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 text-[10px] bg-white text-red-700 border border-red-200 rounded-full px-2 py-0.5"
                          >
                            <span className="font-mono">{s.className}</span>
                            <span className="text-red-400">·</span>
                            <span>{s.subjectName}</span>
                          </span>
                        ))}
                        {overview.subjectsWithZeroEntries.length > 8 && (
                          <span className="text-[10px] text-red-600 self-center">
                            +{overview.subjectsWithZeroEntries.length - 8} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="border-b border-gray-200 flex">
                <button
                  onClick={() => setActiveTab('classes')}
                  className={`flex-1 sm:flex-none px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'classes'
                      ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  Per-Class ({overview.perClass.length})
                </button>
                <button
                  onClick={() => setActiveTab('subjects')}
                  className={`flex-1 sm:flex-none px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'subjects'
                      ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  Subjects Needing Attention ({allSubjects.length})
                </button>
              </div>

              {activeTab === 'classes' && (
                <>
                  {/* Desktop table */}
                  {!isMobile ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 text-xs">
                          <tr>
                            <th className="px-3 py-3 text-left font-medium text-gray-600 w-10">#</th>
                            <th className="px-3 py-3 text-left font-medium text-gray-600">Class</th>
                            <th className="px-3 py-3 text-center font-medium text-gray-600">Students</th>
                            <th className="px-3 py-3 text-center font-medium text-gray-600">Subjects</th>
                            <th className="px-3 py-3 text-center font-medium text-gray-600">Complete</th>
                            <th className="px-3 py-3 text-left font-medium text-gray-600 min-w-[160px]">Completion</th>
                            <th className="px-3 py-3 text-center font-medium text-gray-600">Avg SBA</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {overview.perClass.map((c, i) => (
                            <tr key={c.classId} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-3 py-2.5 text-xs text-gray-500 font-mono">{i + 1}</td>
                              <td className="px-3 py-2.5">
                                <div className="font-medium text-gray-900 text-sm">{c.className}</div>
                              </td>
                              <td className="px-3 py-2.5 text-center text-sm text-gray-700">{c.totalStudents}</td>
                              <td className="px-3 py-2.5 text-center text-sm text-gray-700">{c.subjectsTracked}</td>
                              <td className="px-3 py-2.5 text-center text-sm">
                                <span className={`font-medium ${
                                  c.subjectsComplete === c.subjectsTracked && c.subjectsTracked > 0
                                    ? 'text-green-700'
                                    : 'text-gray-700'
                                }`}>
                                  {c.subjectsComplete}/{c.subjectsTracked}
                                </span>
                              </td>
                              <td className="px-3 py-2.5">
                                <ProgressBar pct={c.overallPercentComplete} />
                              </td>
                              <td className="px-3 py-2.5 text-center text-sm">
                                {c.avgSbaRawPercentage >= 0 ? (
                                  <span className="font-semibold text-gray-900">{c.avgSbaRawPercentage}%</span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    /* Mobile card list */
                    <div className="divide-y divide-gray-100">
                      {overview.perClass.map((c, i) => (
                        <div key={c.classId} className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-gray-400 w-5">{i + 1}</span>
                              <span className="font-medium text-gray-900 text-sm">{c.className}</span>
                            </div>
                            <span className="text-sm text-gray-700">{c.totalStudents} students</span>
                          </div>
                          <ProgressBar pct={c.overallPercentComplete} />
                          <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
                            <span>{c.subjectsComplete}/{c.subjectsTracked} subjects complete</span>
                            <span>Avg: {c.avgSbaRawPercentage >= 0 ? `${c.avgSbaRawPercentage}%` : '—'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {activeTab === 'subjects' && (
                <>
                  {allSubjects.length === 0 ? (
                    <div className="p-12 text-center">
                      <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-3">
                        <CheckCircle className="text-green-600" size={28} />
                      </div>
                      <p className="text-sm font-medium text-gray-900">All subjects have entries</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Every tracked subject has at least one SBA mark recorded.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 text-xs">
                          <tr>
                            <th className="px-3 py-3 text-left font-medium text-gray-600 w-10">#</th>
                            <th className="px-3 py-3 text-left font-medium text-gray-600">Class</th>
                            <th className="px-3 py-3 text-left font-medium text-gray-600">Subject</th>
                            <th className="px-3 py-3 text-left font-medium text-gray-600">Teacher</th>
                            <th className="px-3 py-3 text-center font-medium text-gray-600 w-24">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {allSubjects.map((s, i) => (
                            <tr key={`${s.className}-${s.subjectName}`} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-3 py-2.5 text-xs text-gray-500 font-mono">{i + 1}</td>
                              <td className="px-3 py-2.5 text-sm text-gray-700">{s.className}</td>
                              <td className="px-3 py-2.5 text-sm font-medium text-gray-900">{s.subjectName}</td>
                              <td className="px-3 py-2.5 text-sm text-gray-600">{s.teacherName || '—'}</td>
                              <td className="px-3 py-2.5 text-center">
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                                  <AlertCircle size={10} />
                                  No entries
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Info footer */}
            <div className="bg-blue-50 border-l-4 border-blue-500 rounded-xl p-3 flex items-start gap-2">
              <FileText size={16} className="text-blue-600 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800">
                SBA is tracked per candidate per subject, keyed by <strong>Exam Year</strong> (the year they sit the Final Examination).
                Use the <strong>Export PDF</strong> button to generate a printable school-wide progress report for HOD meetings or the Head Teacher's review.
              </p>
            </div>
          </>
        )}
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </DashboardLayout>
  );
}