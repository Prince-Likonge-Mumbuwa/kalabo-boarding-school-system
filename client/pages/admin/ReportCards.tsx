// @/pages/admin/ReportCards.tsx
// Consistency rewrite: the list, progress bars, report cards, PDFs and SMS
// all come from the shared results grid (services/resultsGrid.ts) through
// resultsService — the same numbers as the Results Entry page, the monitor
// and the Parent Portal. This page no longer recalculates anything itself.
//   - Opens on the current academic term.
//   - Progress bar = completed subjects / subjects (Form Teacher and dropped
//     subjects are not subjects).
//   - Cards for the whole class are built in one pass (positions included).
// Version 3.2.0 - SMS History tab + Bulk All Classes dialog
//   - Cost corrected to ZMW 0.24 per segment (via smsService constant)
//   - Two tabs: Report Cards | SMS History
//   - New "Bulk All Classes" button → BulkSendDialog
//   - SMS History panel with filters + per-row and bulk retry

import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { useStudentProgress, useResults } from '@/hooks/useResults';
import { useExamConfig } from '@/hooks/useExamConfig';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import { useTeacherAssignments } from '@/hooks/useTeacherAssignments';
import { useAuth } from '@/hooks/useAuth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  Search,
  CheckCircle,
  XCircle,
  FileText,
  BookOpen,
  AlertTriangle,
  RefreshCw,
  GraduationCap,
  Clock,
  Filter,
  ChevronDown,
  Printer,
  Download,
  X,
  ChevronLeft,
  Loader2,
  Calendar,
  Trash2,
  FileSpreadsheet,
  MessageCircle,
  Send,
  History,
} from 'lucide-react';

import { ConfirmationModal } from '@/components/ConfirmationModal';
import { activeExamsFor, pickTermConfig } from '@/services/resultsGrid';
import type { ReportCardData as SharedReportCardData } from '@/services/resultsService';
import { getCurrentAcademicTerm, type TermName } from '@/utils/academicTerm';
import { smsService } from '@/services/smsService';
import SmsHistoryPanel from '@/components/SmsHistoryPanel';
import BulkSendDialog from '@/components/BulkSendDialog';

// ==================== TYPES ====================
interface SubjectProgress {
  subjectId: string;
  subjectName: string;
  teacherName: string;
  week4: { status: 'complete' | 'missing' | 'absent' | 'not_conducted'; marks?: number };
  week8: { status: 'complete' | 'missing' | 'absent' | 'not_conducted'; marks?: number };
  endOfTerm: { status: 'complete' | 'missing' | 'absent' | 'not_conducted'; marks?: number };
  subjectProgress: number;
  grade?: number;
  averagePercentage?: number;
}

interface StudentProgress {
  studentId: string;
  studentName: string;
  className: string;
  classId: string;
  form: string;
  overallPercentage: number;
  overallGrade: number;
  status: 'pass' | 'fail' | 'pending';
  isComplete: boolean;
  completionPercentage: number;
  subjects: SubjectProgress[];
  missingSubjects: number;
  totalSubjects: number;
  gender?: string;
  documentId?: string;
}

/** The shared report card (built by resultsGrid.buildReportCard). */
export type ReportCardData = SharedReportCardData;
type ReportCardSubject = ReportCardData['subjects'][number];

interface ClassResultsMatrix {
  className: string;
  term: string;
  year: number;
  students: Array<{
    studentId: string;
    studentName: string;
    gender: string;
    subjects: Array<{
      subjectName: string;
      week4: { marks: number; status: string };
      week8: { marks: number; status: string };
      endOfTerm: { marks: number; status: string; grade: number };
      average: number;
    }>;
    overallAverage: number;
    overallGrade: number;
  }>;
  subjects: string[];
  generatedDate: string;
  configuredExamTypes: string[];
}

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
}

// ==================== CONSTANTS ====================
const GRADE_SYSTEM: Record<number | 'X', { min: number; max: number; description: string; color: string; shortDesc: string }> = {
  1: { min: 75, max: 100, description: 'Distinction', shortDesc: 'D1', color: 'bg-green-600' },
  2: { min: 70, max: 74, description: 'Distinction', shortDesc: 'D2', color: 'bg-green-500' },
  3: { min: 65, max: 69, description: 'Merit', shortDesc: 'M1', color: 'bg-blue-600' },
  4: { min: 60, max: 64, description: 'Merit', shortDesc: 'M2', color: 'bg-blue-500' },
  5: { min: 55, max: 59, description: 'Credit', shortDesc: 'C1', color: 'bg-cyan-600' },
  6: { min: 50, max: 54, description: 'Credit', shortDesc: 'C2', color: 'bg-cyan-500' },
  7: { min: 45, max: 49, description: 'Satisfactory', shortDesc: 'S1', color: 'bg-yellow-500' },
  8: { min: 40, max: 44, description: 'Satisfactory', shortDesc: 'S2', color: 'bg-orange-500' },
  9: { min: 0, max: 39, description: 'Unsatisfactory', shortDesc: 'U', color: 'bg-red-500' },
  X: { min: -1, max: -1, description: 'Absent', shortDesc: 'ABS', color: 'bg-gray-500' },
};

const getGradeDisplay = (grade: number): string => grade === -1 ? 'X' : grade.toString();
const getGradeDescription = (grade: number): string => GRADE_SYSTEM[grade === -1 ? 'X' : grade]?.shortDesc || '—';
const getGradeColor = (grade: number): string => GRADE_SYSTEM[grade === -1 ? 'X' : grade]?.color || 'bg-gray-500';

const getExamDisplayName = (examType: string): string => {
  switch (examType) {
    case 'week4': return 'Week 4';
    case 'week8': return 'Week 8';
    case 'endOfTerm': return 'End of Term';
    default: return examType;
  }
};

// ==================== TOAST COMPONENT ====================
const Toast = ({ toast, onClose }: { toast: ToastMessage; onClose: () => void }) => {
  const config = {
    success: { bg: 'bg-green-600', icon: CheckCircle },
    error: { bg: 'bg-red-600', icon: XCircle },
    info: { bg: 'bg-blue-600', icon: MessageCircle },
    warning: { bg: 'bg-yellow-500', icon: AlertTriangle },
  };
  const { bg, icon: Icon } = config[toast.type];

  useEffect(() => {
    const timer = setTimeout(onClose, 8000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`${bg} text-white px-4 py-3 rounded-lg shadow-lg flex items-start gap-3 min-w-[300px] max-w-md`}
      style={{ animation: 'slideUp 0.3s ease-out' }}>
      <Icon size={20} className="flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{toast.title}</p>
        <p className="text-xs opacity-90 mt-0.5 whitespace-pre-line">{toast.message}</p>
      </div>
      <button onClick={onClose} className="flex-shrink-0 opacity-70 hover:opacity-100">
        <X size={16} />
      </button>
    </div>
  );
};

// ==================== STATUS BADGE ====================
const StatusBadge = ({ status }: { status: 'pass' | 'fail' | 'pending' }) => {
  const config = {
    pass: { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle, label: 'Pass' },
    fail: { bg: 'bg-red-100', text: 'text-red-800', icon: XCircle, label: 'Fail' },
    pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: Clock, label: 'Pending' },
  };
  const { bg, text, icon: Icon, label } = config[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${bg} ${text}`}>
      <Icon size={12} />{label}
    </span>
  );
};

// ==================== PROGRESS BAR ====================
const ProgressBar = ({ progress, size = 'md', showLabel = true }: { progress: number; size?: 'sm' | 'md' | 'lg'; showLabel?: boolean }) => {
  const validProgress = Math.min(100, Math.max(0, progress || 0));
  const getProgressColor = (p: number) => {
    if (p >= 75) return 'bg-green-500';
    if (p >= 50) return 'bg-blue-500';
    if (p >= 25) return 'bg-yellow-500';
    return 'bg-red-500';
  };
  const heights = { sm: 'h-1.5', md: 'h-2', lg: 'h-3' };
  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-gray-600">Progress</span>
          <span className="font-medium text-gray-900">{validProgress}%</span>
        </div>
      )}
      <div className={`w-full ${heights[size]} bg-gray-200 rounded-full overflow-hidden`}>
        <div className={`h-full ${getProgressColor(validProgress)} transition-all duration-300`} style={{ width: `${validProgress}%` }} />
      </div>
    </div>
  );
};

// ==================== CARD SKELETON ====================
const CardSkeleton = () => (
  <div className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
    <div className="flex items-start justify-between mb-3">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
        <div className="space-y-1.5">
          <div className="h-3 bg-gray-200 rounded w-24"></div>
          <div className="h-2 bg-gray-100 rounded w-16"></div>
        </div>
      </div>
      <div className="w-8 h-8 bg-gray-200 rounded-lg"></div>
    </div>
    <div className="space-y-3">
      <div className="h-3 bg-gray-200 rounded w-full"></div>
      <div className="h-1.5 bg-gray-200 rounded w-full"></div>
    </div>
  </div>
);

// ==================== STUDENT CARD ====================
interface StudentCardProps {
  student: StudentProgress;
  onClick: () => void;
  onSendSMS: (studentId: string, studentName: string) => void;
  isSendingSMS: boolean;
  smsState?: { status: 'success' | 'error'; message?: string };
}

const StudentCard = ({ student, onClick, onSendSMS, isSendingSMS, smsState }: StudentCardProps) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  const hasResults = student.overallPercentage > 0;

  const handleSMSClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSendSMS(student.studentId, student.studentName);
  };

  return (
    <div
      onClick={onClick}
      className="w-full bg-white rounded-xl border border-gray-200 p-4 hover:shadow-lg transition-all duration-300 hover:border-blue-300 hover:-translate-y-0.5 text-left cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
            <GraduationCap size={isMobile ? 16 : 18} className="text-blue-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-gray-900 text-sm sm:text-base truncate">{student.studentName}</h3>
            <p className="text-xs text-gray-500 truncate">{student.studentId}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleSMSClick}
            disabled={isSendingSMS}
            className={`p-1.5 rounded-lg transition-all ${
              smsState?.status === 'success'
                ? 'bg-green-100 text-green-600'
                : smsState?.status === 'error'
                ? 'bg-red-100 text-red-600'
                : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
            }`}
            title={
              smsState?.status === 'success'
                ? 'SMS sent!'
                : smsState?.status === 'error'
                ? `Failed: ${smsState.message}`
                : hasResults
                ? 'Send results via SMS'
                : 'No results to send'
            }
          >
            {isSendingSMS ? (
              <Loader2 size={isMobile ? 14 : 16} className="animate-spin" />
            ) : smsState?.status === 'success' ? (
              <CheckCircle size={isMobile ? 14 : 16} />
            ) : smsState?.status === 'error' ? (
              <XCircle size={isMobile ? 14 : 16} />
            ) : (
              <MessageCircle size={isMobile ? 14 : 16} className={!hasResults ? 'opacity-30' : ''} />
            )}
          </button>

          <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm ${getGradeColor(student.overallGrade)} flex-shrink-0`}>
            {student.overallGrade > 0 ? getGradeDisplay(student.overallGrade) : '—'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <p className="text-[10px] text-gray-500">Class</p>
          <p className="font-medium text-gray-900 text-xs truncate">{student.className}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-500">Average</p>
          <p className="font-bold text-blue-600 text-xs sm:text-sm">
            {hasResults ? `${student.overallPercentage}%` : '—'}
          </p>
        </div>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between text-[10px] mb-1">
          <span className="text-gray-600">Completion</span>
          <span className="font-medium text-gray-900">{student.completionPercentage || 0}%</span>
        </div>
        <ProgressBar progress={student.completionPercentage || 0} size="sm" showLabel={false} />
      </div>

      <div className="flex items-center justify-between">
        <StatusBadge status={student.status} />
        {student.missingSubjects > 0 && (
          <div className="flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
            <AlertTriangle size={10} />
            <span className="text-[10px] font-medium">{student.missingSubjects} missing</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== MOBILE SUBJECT CARD ====================
const MobileSubjectCard = ({ subject, configuredExamTypes }: { subject: ReportCardSubject; configuredExamTypes: string[] }) => {
  const examColumns = [];
  if (configuredExamTypes.includes('week4')) {
    examColumns.push(
      <div key="week4" className="text-center p-2 bg-gray-50 rounded-lg">
        <p className="text-[10px] text-gray-500">W4</p>
        <p className="font-medium text-xs">
          {subject.week4 >= 0 ? `${subject.week4}%` : subject.week4 === -1 ? 'ABS' : subject.week4 === -2 ? 'NC' : '—'}
        </p>
      </div>
    );
  }
  if (configuredExamTypes.includes('week8')) {
    examColumns.push(
      <div key="week8" className="text-center p-2 bg-gray-50 rounded-lg">
        <p className="text-[10px] text-gray-500">W8</p>
        <p className="font-medium text-xs">
          {subject.week8 >= 0 ? `${subject.week8}%` : subject.week8 === -1 ? 'ABS' : subject.week8 === -2 ? 'NC' : '—'}
        </p>
      </div>
    );
  }
  if (configuredExamTypes.includes('endOfTerm')) {
    examColumns.push(
      <div key="eot" className="text-center p-2 bg-blue-50 rounded-lg">
        <p className="text-[10px] text-blue-600">EOT</p>
        <p className="font-medium text-xs text-blue-600">
          {subject.endOfTerm >= 0 ? `${subject.endOfTerm}%` : subject.endOfTerm === -1 ? 'ABS' : subject.endOfTerm === -2 ? 'NC' : '—'}
        </p>
      </div>
    );
  }
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 mb-2">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-gray-900 text-sm">{subject.subjectName}</h4>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs ${getGradeColor(subject.grade)}`}>
          {subject.grade > 0 ? getGradeDisplay(subject.grade) : '—'}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">{examColumns}</div>
      <div className="mt-2 flex items-center justify-between px-1 pt-2 border-t border-gray-100">
        <span className="text-[10px] text-gray-500 uppercase tracking-wide">Average</span>
        <span className="text-sm font-bold text-gray-900">
          {subject.average >= 0 ? `${subject.average}%` : '—'}
        </span>
        <span className="text-xs font-medium text-gray-700">{getGradeDescription(subject.grade)}</span>
      </div>
    </div>
  );
};

// ==================== REPORT MODAL ====================
interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: ReportCardData | null;
  studentName: string;
  loading?: boolean;
  configuredExamTypes?: string[];
  onDelete?: (studentId: string) => Promise<void>;
  isDeleting?: boolean;
}

const ReportModal = ({ isOpen, onClose, report, studentName, loading, configuredExamTypes = ['week4', 'week8', 'endOfTerm'], onDelete, isDeleting }: ReportModalProps) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDownloadPDF = async () => {
    if (!report) return;
    try {
      const { generateReportCardPDF } = await import('@/services/pdf/reportCardPDFLib');
      const pdfBytes = await generateReportCardPDF(report, configuredExamTypes);
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `report-card-${report.studentId}-${report.term}-${report.year}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) { console.error('PDF download failed:', error); }
  };

  const handlePrint = () => window.print();

  const handleDelete = async () => {
    if (onDelete && report) {
      await onDelete(report.studentId);
      setShowDeleteConfirm(false);
      onClose();
    }
  };

  if (!isOpen) return null;

  if (isMobile) {
    return (
      <>
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/50" onClick={onClose} />
          <div className="relative bg-white min-h-screen w-full">
            <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
              <button onClick={onClose} className="p-2"><ChevronLeft size={20} className="text-gray-600" /></button>
              <h2 className="text-sm font-semibold text-gray-900">Report Card</h2>
              <div className="flex items-center gap-2">
                {onDelete && report && (
                  <button onClick={() => setShowDeleteConfirm(true)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" disabled={isDeleting}>
                    {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                  </button>
                )}
                <button onClick={handleDownloadPDF} className="p-2"><Download size={18} className="text-gray-600" /></button>
                <button onClick={handlePrint} className="p-2"><Printer size={18} className="text-gray-600" /></button>
              </div>
            </div>
            <div className="p-4">
              {loading ? (
                <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent"></div></div>
              ) : !report ? (
                <div className="text-center py-12"><FileText size={48} className="mx-auto text-gray-300 mb-3" /><p className="text-gray-500">No report data available</p></div>
              ) : (
                <>
                  <div className="text-center mb-4">
                    <h1 className="text-lg font-bold text-gray-900">MINISTRY OF EDUCATION</h1>
                    <h2 className="text-base font-semibold text-gray-800">KALABO BOARDING SECONDARY SCHOOL</h2>
                    <p className="text-xs text-blue-600 mt-1 uppercase">Learner Report Card</p>
                    {report.examConfigSummary && <p className="text-[10px] text-blue-500 mt-1">{report.examConfigSummary}</p>}
                    {report.isProvisional && (
                      <p className="text-[10px] font-semibold text-amber-600 mt-1">
                        PROVISIONAL — {report.totalSubjects - report.completedSubjects} subject(s) still awaiting marks
                      </p>
                    )}
                  </div>
                  <div className="space-y-2 mb-4">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-gray-50 p-2 rounded-lg"><p className="text-[10px] text-gray-500">Name</p><p className="font-medium text-xs truncate">{report.studentName}</p></div>
                      <div className="bg-gray-50 p-2 rounded-lg"><p className="text-[10px] text-gray-500">ID</p><p className="font-medium text-xs truncate">{report.studentId}</p></div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="bg-gray-50 p-2 rounded-lg"><p className="text-[10px] text-gray-500">Class</p><p className="font-medium text-xs">{report.className}</p></div>
                      <div className="bg-gray-50 p-2 rounded-lg"><p className="text-[10px] text-gray-500">Term</p><p className="font-medium text-xs">{report.term}</p></div>
                      <div className="bg-gray-50 p-2 rounded-lg"><p className="text-[10px] text-gray-500">Avg</p><p className="font-medium text-xs text-blue-600">{report.percentage}%</p></div>
                      <div className="bg-gray-50 p-2 rounded-lg"><p className="text-[10px] text-gray-500">Pos</p><p className="font-medium text-xs text-blue-600">{report.position.split(' ')[0]}</p></div>
                    </div>
                  </div>
                  <div className="space-y-2 mb-4">
                    <h3 className="text-xs font-semibold text-gray-700 mb-2">Subjects</h3>
                    {report.subjects.map((subject, index) => (
                      <MobileSubjectCard key={index} subject={subject} configuredExamTypes={configuredExamTypes} />
                    ))}
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg mb-4">
                    <p className="text-[10px] text-gray-500 uppercase mb-1">Teacher's Comment</p>
                    <p className="text-xs text-gray-800">"{report.teachersComment}"</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-gray-500 mb-4">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-gray-200 border border-gray-400 rounded-full"></span>— = Not Entered</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-gray-500 rounded-full"></span>ABS = Absent</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 bg-gray-400 rounded-full"></span>NC = Not Conducted</span>
                  </div>
                  <div className="text-[10px] text-gray-400 text-right">Generated: {report.generatedDate}</div>
                </>
              )}
            </div>
          </div>
        </div>
        <ConfirmationModal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} onConfirm={handleDelete}
          title="Delete Report Card" message={`Delete report card for ${report?.studentName}?`} type="delete" confirmText="Delete" cancelText="Cancel" isLoading={isDeleting} />
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="relative bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="sticky top-0 z-10 bg-white border-b border-gray-200 rounded-t-2xl px-6 py-3 flex items-center justify-end gap-2">
              {onDelete && report && (
                <button onClick={() => setShowDeleteConfirm(true)} className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg" disabled={isDeleting}>
                  {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                </button>
              )}
              <button onClick={handleDownloadPDF} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"><Download size={18} /></button>
              <button onClick={handlePrint} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"><Printer size={18} /></button>
              <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              {loading ? (
                <div className="flex items-center justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent"></div></div>
              ) : !report ? (
                <div className="text-center py-12"><FileText size={48} className="mx-auto text-gray-300 mb-3" /><p className="text-gray-500">No report data available</p></div>
              ) : (
                <div className="min-w-[900px]">
                  <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-900">MINISTRY OF EDUCATION</h1>
                    <h2 className="text-xl font-semibold text-gray-800 mt-1">KALABO BOARDING SECONDARY SCHOOL</h2>
                    <h3 className="text-lg font-medium text-blue-600 mt-2 uppercase tracking-wider">LEARNER REPORT CARD</h3>
                    {report.examConfigSummary && <p className="text-sm text-blue-500 mt-1">{report.examConfigSummary}</p>}
                    {report.isProvisional && (
                      <p className="text-sm font-semibold text-amber-600 mt-1">
                        PROVISIONAL — {report.totalSubjects - report.completedSubjects} subject(s) still awaiting marks
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-8 gap-3 mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="col-span-2"><p className="text-xs text-gray-500">Student Name</p><p className="font-semibold text-gray-900 truncate">{report.studentName}</p></div>
                    <div><p className="text-xs text-gray-500">ID</p><p className="font-semibold text-gray-900">{report.studentId}</p></div>
                    <div><p className="text-xs text-gray-500">Class</p><p className="font-semibold text-gray-900">{report.className}</p></div>
                    <div><p className="text-xs text-gray-500">Gender</p><p className="font-semibold text-gray-900">{report.gender}</p></div>
                    <div><p className="text-xs text-gray-500">Term</p><p className="font-semibold text-gray-900">{report.term}</p></div>
                    <div><p className="text-xs text-gray-500">Position</p><p className="font-semibold text-blue-600">{report.position}</p></div>
                    <div><p className="text-xs text-gray-500">Average</p><p className="font-semibold text-gray-900">{report.percentage}%</p></div>
                  </div>
                  <table className="w-full border-collapse mb-6 text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border border-gray-300">Subject</th>
                        {configuredExamTypes.includes('week4') && <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border border-gray-300">W4</th>}
                        {configuredExamTypes.includes('week8') && <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border border-gray-300">W8</th>}
                        {configuredExamTypes.includes('endOfTerm') && <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border border-gray-300 bg-blue-50">EOT</th>}
                        <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border border-gray-300 bg-gray-200">Avg</th>
                        <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border border-gray-300">Grade</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border border-gray-300">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.subjects.map((subject, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-xs font-medium text-gray-900 border border-gray-300">{subject.subjectName}</td>
                          {configuredExamTypes.includes('week4') && (
                            <td className="px-3 py-2 text-center text-xs border border-gray-300">
                              {subject.week4 >= 0 ? <span className="font-medium text-gray-900">{subject.week4}%</span> : subject.week4 === -1 ? <span className="text-gray-500 italic">ABS</span> : subject.week4 === -2 ? <span className="text-gray-400 italic">NC</span> : <span className="text-gray-400">—</span>}
                            </td>
                          )}
                          {configuredExamTypes.includes('week8') && (
                            <td className="px-3 py-2 text-center text-xs border border-gray-300">
                              {subject.week8 >= 0 ? <span className="font-medium text-gray-900">{subject.week8}%</span> : subject.week8 === -1 ? <span className="text-gray-500 italic">ABS</span> : subject.week8 === -2 ? <span className="text-gray-400 italic">NC</span> : <span className="text-gray-400">—</span>}
                            </td>
                          )}
                          {configuredExamTypes.includes('endOfTerm') && (
                            <td className="px-3 py-2 text-center text-xs border border-gray-300 bg-blue-50">
                              {subject.endOfTerm >= 0 ? <span className="font-bold text-blue-700">{subject.endOfTerm}%</span> : subject.endOfTerm === -1 ? <span className="text-gray-500 italic">ABS</span> : subject.endOfTerm === -2 ? <span className="text-gray-400 italic">NC</span> : <span className="text-gray-400">—</span>}
                            </td>
                          )}
                          <td className="px-3 py-2 text-center text-xs border border-gray-300 bg-gray-50">
                            {subject.average >= 0
                              ? <span className="font-bold text-gray-900">{subject.average}%</span>
                              : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-3 py-2 text-center border border-gray-300">
                            {subject.grade > 0 ? <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-white font-bold text-xs ${getGradeColor(subject.grade)}`}>{getGradeDisplay(subject.grade)}</span> : subject.grade === -1 ? <span className="text-gray-500 font-medium">X</span> : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-700 border border-gray-300">{getGradeDescription(subject.grade)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50">
                        <td colSpan={configuredExamTypes.length + 2} className="px-3 py-2 text-right text-xs font-semibold text-gray-700 border border-gray-300">Overall Average:</td>
                        <td colSpan={2} className="px-3 py-2 text-left text-xs font-bold text-blue-600 border border-gray-300">{report.percentage}%</td>
                      </tr>
                      <tr className="bg-gray-50">
                        <td colSpan={configuredExamTypes.length + 2} className="px-3 py-2 text-right text-xs font-semibold text-gray-700 border border-gray-300">Overall Grade:</td>
                        <td colSpan={2} className="px-3 py-2 text-left text-xs font-bold border border-gray-300">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-white font-bold text-xs ${getGradeColor(report.grade)}`}>{getGradeDisplay(report.grade)}</span>
                          <span className="ml-2 text-gray-700">{getGradeDescription(report.grade)}</span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Teacher's Comment</p>
                    <p className="text-sm text-gray-800">"{report.teachersComment}"</p>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-gray-200 border border-gray-400 rounded-full"></span>— = Not Entered</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-gray-500 rounded-full"></span>ABS = Absent</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 bg-gray-400 rounded-full"></span>NC = Not Conducted</span>
                  </div>
                  <div className="mt-4 text-right text-xs text-gray-400">Generated: {report.generatedDate}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <ConfirmationModal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} onConfirm={handleDelete}
        title="Delete Report Card" message={`Delete report card for ${report?.studentName}?`} type="delete" confirmText="Delete" cancelText="Cancel" isLoading={isDeleting} />
    </>
  );
};

// ==================== FILTER BAR ====================
const FilterBar = ({
  selectedClass, setSelectedClass, classOptions, searchTerm, setSearchTerm,
  selectedTerm, setSelectedTerm, selectedYear, setSelectedYear, terms, years,
  summary, isTeacher, isMobile, configuredExamTypes, onBulkSend, isBulkSending
}: {
  selectedClass: string;
  setSelectedClass: (v: string) => void;
  classOptions: { id: string; name: string }[];
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  selectedTerm: string;
  setSelectedTerm: (v: string) => void;
  selectedYear: number;
  setSelectedYear: (v: number) => void;
  terms: string[];
  years: number[];
  summary: { total: number; complete: number; incomplete: number; averageCompletion: number } | null;
  isTeacher: boolean;
  isMobile: boolean;
  configuredExamTypes?: string[];
  onBulkSend?: () => void;
  isBulkSending?: boolean;
}) => {
  const [showFilters, setShowFilters] = useState(false);
  return (
    <div className="mb-4 sm:mb-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
      {isMobile && (
        <button onClick={() => setShowFilters(!showFilters)} className="w-full flex items-center justify-between p-3 bg-white">
          <div className="flex items-center gap-2"><Filter size={16} className="text-gray-400" /><span className="font-medium text-sm text-gray-700">{selectedClass ? 'Filters active' : 'Filter students'}</span></div>
          <ChevronDown size={16} className={`text-gray-500 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>
      )}
      <div className={`p-3 sm:p-4 ${isMobile && !showFilters ? 'hidden' : 'block'}`}>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white" disabled={isTeacher}>
            {classOptions.map(cls => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
          </select>
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search students..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <select value={selectedTerm} onChange={e => setSelectedTerm(e.target.value)} className="w-full sm:w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
            {terms.map(term => <option key={term} value={term}>{term}</option>)}
          </select>
          <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="w-full sm:w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
            {years.map(year => <option key={year} value={year}>{year}</option>)}
          </select>
          {onBulkSend && configuredExamTypes && configuredExamTypes.length > 0 && (
            <button onClick={onBulkSend} disabled={isBulkSending} className="flex items-center gap-1 sm:gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-xs sm:text-sm">
              {isBulkSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              <span className="hidden sm:inline">{isBulkSending ? 'Sending...' : 'Bulk SMS'}</span>
            </button>
          )}
        </div>
        {configuredExamTypes && configuredExamTypes.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-blue-700 bg-blue-50 px-3 py-2 rounded-lg">
            <Calendar size={14} className="text-blue-600" />
            <span>Exams: {configuredExamTypes.map(getExamDisplayName).join(' • ')}</span>
          </div>
        )}
        {summary && summary.total > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex gap-3 sm:gap-4 text-xs overflow-x-auto pb-1">
            <span className="flex-shrink-0"><span className="text-gray-600">Total: </span><span className="font-medium">{summary.total}</span></span>
            <span className="flex-shrink-0"><span className="text-green-600">Complete: </span><span className="font-medium">{summary.complete}</span></span>
            <span className="flex-shrink-0"><span className="text-yellow-600">Progress: </span><span className="font-medium">{summary.incomplete}</span></span>
            <span className="flex-shrink-0"><span className="text-blue-600">Avg: </span><span className="font-medium">{summary.averageCompletion}%</span></span>
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== MAIN COMPONENT ====================
export default function ReportCards() {
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 640px)');
  const { classes, isLoading: loadingClasses } = useSchoolClasses();
  const { assignments, isLoading: loadingAssignments } = useTeacherAssignments(user?.uid || '');
  const { learners } = useSchoolLearners();

  const [selectedClass, setSelectedClass] = useState<string>('');
  // Opens on the current academic term (was always "Term 1").
  const [selectedTerm, setSelectedTerm] = useState<TermName>(() => getCurrentAcademicTerm().term);
  const [selectedYear, setSelectedYear] = useState<number>(() => getCurrentAcademicTerm().year);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [isDownloadingMatrix, setIsDownloadingMatrix] = useState(false);
  const [isDeletingReport, setIsDeletingReport] = useState(false);

  // Tab + bulk-all state
  const [activeTab, setActiveTab] = useState<'cards' | 'history'>('cards');
  const [showBulkAllDialog, setShowBulkAllDialog] = useState(false);

  // SMS States
  const [sendingSMS, setSendingSMS] = useState<string | null>(null);
  const [smsResults, setSmsResults] = useState<{ [key: string]: { status: 'success' | 'error'; message?: string } }>({});
  const [isBulkSending, setIsBulkSending] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (type: ToastMessage['type'], title: string, message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, type, title, message }]);
  };
  const removeToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  // ---------- Exam Config ----------
  const { configs: examConfigs, isLoading: loadingExamConfig } = useExamConfig({
    year: selectedYear,
    term: selectedTerm,
  });

  // Same config choice and active-exam rule as every other results screen.
  const currentExamConfig = useMemo(
    () => pickTermConfig(examConfigs as any[], selectedTerm, selectedYear) ?? null,
    [examConfigs, selectedTerm, selectedYear]
  );

  const configuredExamTypes = useMemo(
    () => activeExamsFor(currentExamConfig as any) as string[],
    [currentExamConfig]
  );

  // ---------- Data Fetch ----------
  const {
    students = [],
    summary,
    isLoading: loadingProgress,
    isFetching,
    refetch,
  } = useStudentProgress({
    classId: selectedClass,
    term: selectedTerm,
    year: selectedYear,
  });

  const { generateClassReportCards } = useResults();
  const debouncedSearch = useDebounce(searchTerm, 300);

  // ---------- Report Cache ----------
  const [reportCache, setReportCache] = useState<Map<string, ReportCardData>>(new Map());
  const [loadingReports, setLoadingReports] = useState<Set<string>>(new Set());

  const cacheKeyFor = useCallback(
    (studentId: string) => `${selectedClass}|${selectedTerm}|${selectedYear}|${studentId}`,
    [selectedClass, selectedTerm, selectedYear]
  );

  useEffect(() => {
    setReportCache(new Map());
    setLoadingReports(new Set());
    setSelectedStudentId(null);
    setShowReportModal(false);
  }, [selectedClass, selectedTerm, selectedYear]);

  // ---------- Teacher default class ----------
  useEffect(() => {
    if (user?.userType === 'teacher' && classes.length > 0 && !selectedClass) {
      if (assignments && assignments.length > 0) {
        const teacherClassIds = [...new Set(assignments.map(a => a.classId))];
        const teacherClass = classes.find(cls => teacherClassIds.includes(cls.id));
        if (teacherClass) setSelectedClass(teacherClass.id);
      }
    }
  }, [classes, user, assignments, selectedClass]);

  // ---------- Gender lookup ----------
  const studentGenderMap = useMemo(() => {
    const map = new Map<string, string>();
    learners.forEach(learner => {
      if (learner.id) map.set(learner.id, learner.gender || 'Not specified');
      if (learner.studentId) map.set(learner.studentId, learner.gender || 'Not specified');
    });
    return map;
  }, [learners]);

  // ---------- Students: service values as-is (shared grid) ----------
  const transformedStudents = useMemo((): StudentProgress[] => {
    if (!students?.length) return [];
    return students.map((student: any) => ({
      studentId: student.studentId || '',
      documentId: student.documentId,
      studentName: student.studentName || '',
      className: student.className || '',
      classId: student.classId || '',
      form: student.form || '',
      overallPercentage: student.overallPercentage,
      overallGrade: student.overallGrade,
      status: student.status,
      isComplete: student.isComplete,
      completionPercentage: student.completionPercentage,
      subjects: (student.subjects || []).map((s: any) => ({
        subjectId: s.subjectId || '',
        subjectName: s.subjectName || '',
        teacherName: s.teacherName || '',
        week4: { status: s.week4?.status || 'missing', marks: s.week4?.marks },
        week8: { status: s.week8?.status || 'missing', marks: s.week8?.marks },
        endOfTerm: { status: s.endOfTerm?.status || 'missing', marks: s.endOfTerm?.marks },
        subjectProgress: s.subjectProgress,
        grade: s.grade,
        averagePercentage: s.averagePercentage,
      })),
      missingSubjects: student.missingSubjects,
      totalSubjects: student.totalSubjects,
      gender: student.gender || studentGenderMap.get(student.documentId) || studentGenderMap.get(student.studentId) || 'Not specified',
    }));
  }, [students, studentGenderMap]);

  const configSummary = useMemo(() => {
    if (!transformedStudents.length) return null;
    const total = transformedStudents.length;
    const complete = transformedStudents.filter(s => s.isComplete).length;
    const incomplete = total - complete;
    const avg = Math.round(
      transformedStudents.reduce((sum, s) => sum + s.completionPercentage, 0) / total
    );
    return { total, complete, incomplete, averageCompletion: avg };
  }, [transformedStudents]);

  // ---------- Report Generation ----------
  // All cards for the class in one pass from the shared grid (positions are
  // computed once). Re-runs when the class list data changes.
  useEffect(() => {
    let cancelled = false;
    const generate = async () => {
      if (!selectedClass || !students.length || !selectedTerm || !selectedYear) return;
      setLoadingReports(new Set(transformedStudents.map(s => cacheKeyFor(s.studentId))));
      try {
        const bulk = await generateClassReportCards({
          classId: selectedClass,
          term: selectedTerm,
          year: selectedYear,
          options: { includeIncomplete: true, markMissing: true },
        });
        if (cancelled) return;
        const next = new Map<string, ReportCardData>();
        for (const card of bulk.reportCards) next.set(cacheKeyFor(card.studentId), card);
        setReportCache(next);
      } catch (err: any) {
        console.error('Report card generation failed:', err);
        if (!cancelled) addToast('error', 'Report cards failed', err?.message || 'Could not build report cards');
      } finally {
        if (!cancelled) setLoadingReports(new Set());
      }
    };
    generate();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, selectedClass, selectedTerm, selectedYear, cacheKeyFor, generateClassReportCards]);

  // ---------- Delete report ----------
  const handleDeleteReport = useCallback(async (studentId: string) => {
    setIsDeletingReport(true);
    try {
      setReportCache(prev => {
        const next = new Map(prev);
        next.delete(cacheKeyFor(studentId));
        return next;
      });
      await refetch();
      addToast('success', 'Deleted', 'Report card removed from view');
    } catch {
      addToast('error', 'Error', 'Failed to delete');
    } finally {
      setIsDeletingReport(false);
    }
  }, [refetch, cacheKeyFor]);

  // ---------- SMS handlers ----------
  const handleSendSMS = async (studentId: string, studentName: string) => {
    if (!selectedTerm || !selectedYear) {
      addToast('warning', 'Missing Info', 'Please select a term and year first');
      return;
    }
    const student = transformedStudents.find(s => s.studentId === studentId);
    if (!student || student.status === 'pending') {
      addToast('warning', 'No Results', `${studentName} has no results for this term`);
      setSmsResults(prev => ({ ...prev, [studentId]: { status: 'error', message: 'No results' } }));
      setTimeout(() => setSmsResults(prev => { const n = { ...prev }; delete n[studentId]; return n; }), 3000);
      return;
    }
    setSendingSMS(studentId);
    try {
      const preview = await smsService.previewStudentSMS(studentId, selectedTerm, selectedYear);
      if (preview.success) {
        console.log(
          `📏 Preview for ${studentName}: ${preview.segments.length} chars, ` +
          `${preview.segments.encoding}, ${preview.segments.segments} SMS — ` +
          `ZMW ${(preview.estimatedCostZmw ?? 0).toFixed(2)}`
        );
      }

      const result = await smsService.sendStudentResults(studentId, selectedTerm, selectedYear);
      if (result.success) {
        setSmsResults(prev => ({ ...prev, [studentId]: { status: 'success', message: 'SMS sent!' } }));

        const costLine = result.segments
          ? `\n${result.segments.length} chars · ${result.segments.encoding} · ` +
            `${result.segments.segments} SMS · ZMW ${(result.segments.segments * smsService.COST_PER_SEGMENT_ZMW).toFixed(2)}`
          : '';

        addToast(
          'success',
          'SMS Sent!',
          `Results sent to ${studentName}'s guardian${result.carrier ? ` (${result.carrier})` : ''}${costLine}`
        );
      }
    } catch (error: any) {
      const msg = smsService.formatError(error.message);
      setSmsResults(prev => ({ ...prev, [studentId]: { status: 'error', message: msg } }));
      addToast('error', 'SMS Failed', `${studentName}: ${msg}`);
    } finally {
      setSendingSMS(null);
      setTimeout(() => setSmsResults(prev => { const n = { ...prev }; delete n[studentId]; return n; }), 5000);
    }
  };

  // Bulk send (single class): preflight preview → confirm → send → report.
  const handleBulkSend = async () => {
    if (!selectedClass || !selectedTerm || !selectedYear) {
      addToast('warning', 'Missing Info', 'Select class, term, and year');
      return;
    }
    if (configuredExamTypes.length === 0) {
      addToast('warning', 'No Exams', 'No exams configured');
      return;
    }

    let preview;
    try {
      preview = await smsService.previewClassSMS(selectedClass, selectedTerm, selectedYear);
    } catch (error: any) {
      addToast('error', 'Preview Failed', smsService.formatError(error.message));
      return;
    }

    if (!preview.success || preview.readyCount === 0) {
      addToast('warning', 'No Results', 'No students have results to send');
      return;
    }

    const confirmMsg =
      `Send results via SMS to ${preview.readyCount} guardian(s)?\n\n` +
      `Skipped (no results): ${preview.skippedNoResults}\n` +
      (preview.provisionalCount
        ? `PROVISIONAL (marks still pending): ${preview.provisionalCount} — their SMS says PROVISIONAL\n`
        : '') +
      `Avg length: ${preview.averageCharsPerMessage} chars (${preview.encoding})\n` +
      `Total segments: ${preview.totalSegments}\n` +
      `Estimated cost: ZMW ${preview.totalCostZmw.toFixed(2)}\n\n` +
      `Continue?`;

    if (!confirm(confirmMsg)) return;

    setIsBulkSending(true);
    addToast('info', 'Sending...', `Sending to ${preview.readyCount} guardians...`);

    try {
      const result = await smsService.bulkSendClass(selectedClass, selectedTerm, selectedYear);

      let title = '✅ Bulk SMS Complete';
      let type: ToastMessage['type'] = 'success';
      if (result.failed > 0 && result.sent === 0) {
        title = '❌ Bulk Failed';
        type = 'error';
      } else if (result.failed > 0) {
        title = '⚠️ Partial Success';
        type = 'warning';
      }

      let msg = `Sent: ${result.sent} | Failed: ${result.failed} | Total: ${result.total}`;

      if (result.costEstimate) {
        msg +=
          `\nCost: ZMW ${result.costEstimate.totalCostZmw.toFixed(2)} ` +
          `(${result.costEstimate.totalSegments} SMS, ` +
          `avg ${result.costEstimate.averagePerMessage} chars, ${result.costEstimate.encoding})`;
      }

      if (result.failedList?.length) {
        msg += '\n\nFailed:';
        result.failedList.slice(0, 3).forEach(f => {
          msg += `\n• ${f.studentId}: ${f.reason}`;
        });
      }

      addToast(type, title, msg);
      refetch();
    } catch (error: any) {
      addToast('error', 'Bulk Failed', smsService.formatError(error.message));
    } finally {
      setIsBulkSending(false);
    }
  };

  // ---------- Download all report cards ----------
  const handleDownloadAllReportCards = useCallback(async () => {
    if (!selectedClass || !students.length) { addToast('warning', 'No Data', 'No students'); return; }
    if (!configuredExamTypes.length) { addToast('warning', 'No Exams', 'Configure exams first'); return; }
    setIsDownloadingAll(true);
    try {
      const result = await generateClassReportCards({
        classId: selectedClass,
        term: selectedTerm,
        year: selectedYear,
        options: { includeIncomplete: true, markMissing: true },
      });
      if (!result.reportCards.length) { addToast('warning', 'Empty', 'No reports generated'); return; }

      const reports = result.reportCards.map(r => ({
        ...r,
        gender: r.gender || studentGenderMap.get(r.documentId) || 'Not specified',
      }));
      const { generateReportCardPDF } = await import('@/services/pdf/reportCardPDFLib');
      const pdfBytes = await generateReportCardPDF(reports, configuredExamTypes);
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-cards-${(reports[0]?.className || 'class').replace(/\s+/g, '_')}-${selectedTerm.replace(/\s+/g, '_')}-${selectedYear}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      addToast('success', 'Downloaded', `${reports.length} report cards`);
    } catch (e) {
      console.error(e);
      addToast('error', 'Error', 'Download failed');
    } finally {
      setIsDownloadingAll(false);
    }
  }, [selectedClass, students, selectedTerm, selectedYear, generateClassReportCards, configuredExamTypes, transformedStudents, studentGenderMap]);

  // ---------- Class matrix ----------
  const handleDownloadClassMatrix = useCallback(async () => {
    if (!selectedClass || !students.length) { addToast('warning', 'No Data', 'No data'); return; }
    if (!configuredExamTypes.length) { addToast('warning', 'No Exams', 'Configure exams first'); return; }
    setIsDownloadingMatrix(true);
    try {
      const allSubj = new Set<string>();
      transformedStudents.forEach(s => s.subjects.forEach(x => allSubj.add(x.subjectName)));
      const subjList = Array.from(allSubj).sort();

      const matrix: ClassResultsMatrix = {
        className: transformedStudents[0]?.className || 'Unknown',
        term: selectedTerm,
        year: selectedYear,
        students: transformedStudents.map(s => ({
          studentId: s.studentId,
          studentName: s.studentName,
          gender: s.gender || 'Not specified',
          subjects: subjList.map(n => {
            const sub = s.subjects.find(x => x.subjectName === n);
            return {
              subjectName: n,
              week4: { marks: sub?.week4?.marks ?? -3, status: sub?.week4?.status || 'missing' },
              week8: { marks: sub?.week8?.marks ?? -3, status: sub?.week8?.status || 'missing' },
              // Grd = the subject grade from its average (same as the report card);
              // Avg = the subject average % (it used to receive the grade by mistake).
              endOfTerm: { marks: sub?.endOfTerm?.marks ?? -3, status: sub?.endOfTerm?.status || 'missing', grade: sub?.grade ?? -1 },
              average: typeof sub?.averagePercentage === 'number' ? sub.averagePercentage : -1,
            };
          }),
          overallAverage: s.overallPercentage,
          overallGrade: s.overallGrade,
        })),
        subjects: subjList,
        generatedDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        configuredExamTypes,
      };

      const { generateClassResultsMatrixPDF } = await import('@/services/pdf/classResultsMatrixPDFLib');
      const pdfBytes = await generateClassResultsMatrixPDF(matrix);
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `class-matrix-${matrix.className.replace(/\s+/g, '_')}-${selectedTerm.replace(/\s+/g, '_')}-${selectedYear}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      addToast('success', 'Downloaded', 'Class matrix ready!');
    } catch (e) {
      addToast('error', 'Error', `Failed: ${e instanceof Error ? e.message : 'Unknown'}`);
    } finally {
      setIsDownloadingMatrix(false);
    }
  }, [selectedClass, transformedStudents, selectedTerm, selectedYear, configuredExamTypes, students.length]);

  // ---------- Filtered list ----------
  const filteredStudents = useMemo(() => {
    if (!transformedStudents.length) return [];
    if (!debouncedSearch) return transformedStudents;
    const q = debouncedSearch.toLowerCase();
    return transformedStudents.filter(
      s => s.studentName?.toLowerCase().includes(q) || s.studentId?.toLowerCase().includes(q)
    );
  }, [transformedStudents, debouncedSearch]);

  // ---------- Class options ----------
  const classOptions = useMemo(() => {
    if (user?.userType === 'teacher' && assignments) {
      const ids = [...new Set(assignments.map(a => a.classId))];
      return classes.filter(c => ids.includes(c.id)).map(c => ({ id: c.id, name: c.name }));
    }
    return classes.map(c => ({ id: c.id, name: c.name }));
  }, [classes, user, assignments]);

  // ---------- Modal state ----------
  const handleViewReport = (id: string) => { setSelectedStudentId(id); setShowReportModal(true); };
  const selectedStudent = transformedStudents.find(s => s.studentId === selectedStudentId);
  const selectedReport = selectedStudentId ? reportCache.get(cacheKeyFor(selectedStudentId)) : null;
  const isLoadingReport = selectedStudentId ? loadingReports.has(cacheKeyFor(selectedStudentId)) : false;

  const terms = ['Term 1', 'Term 2', 'Term 3'];
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);
  const isLoadingAll = loadingProgress || loadingClasses || loadingAssignments || loadingExamConfig;

  if (isLoadingAll) {
    return (
      <DashboardLayout activeTab="reports">
        <div className="min-h-screen bg-gray-50 p-3 sm:p-4 lg:p-6">
          <div className="animate-pulse mb-4"><div className="h-7 bg-gray-200 rounded w-40 mb-1"></div><div className="h-4 bg-gray-100 rounded w-48"></div></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">{[1, 2, 3, 4].map(i => <CardSkeleton key={i} />)}</div>
        </div>
      </DashboardLayout>
    );
  }

  const noExams = !!selectedClass && !configuredExamTypes.length;

  return (
    <>
      <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <DashboardLayout activeTab="reports">
        <div className="min-h-screen bg-gray-50 p-3 sm:p-4 lg:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">Report Cards</h1>
              <p className="text-xs sm:text-sm text-gray-600">
                {selectedTerm}, {selectedYear}
                {configuredExamTypes.length > 0 && (
                  <> • {configuredExamTypes.map(getExamDisplayName).join(' + ')}</>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Tab switcher */}
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setActiveTab('cards')}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                    activeTab === 'cards'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Report Cards
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`px-3 py-1.5 text-xs rounded-md transition-colors flex items-center gap-1 ${
                    activeTab === 'history'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <History size={12} />
                  SMS History
                </button>
              </div>

              {selectedClass && students.length > 0 && configuredExamTypes.length > 0 && (
                <>
                  <button onClick={handleDownloadAllReportCards} disabled={isDownloadingAll} className="flex items-center gap-1 sm:gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-xs sm:text-sm">
                    {isDownloadingAll ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}<span className="hidden sm:inline">{isDownloadingAll ? 'Generating...' : 'All Reports'}</span>
                  </button>
                  <button onClick={handleDownloadClassMatrix} disabled={isDownloadingMatrix} className="flex items-center gap-1 sm:gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 text-xs sm:text-sm">
                    {isDownloadingMatrix ? <Loader2 size={16} className="animate-spin" /> : <FileSpreadsheet size={16} />}<span className="hidden sm:inline">{isDownloadingMatrix ? 'Generating...' : 'Class Matrix'}</span>
                  </button>
                </>
              )}

              {/* Bulk All Classes */}
              <button
                onClick={() => setShowBulkAllDialog(true)}
                disabled={isBulkSending}
                className="flex items-center gap-1 sm:gap-2 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-xs sm:text-sm"
                title="Send results to ALL classes"
              >
                <MessageCircle size={16} />
                <span className="hidden sm:inline">Bulk All Classes</span>
              </button>

              <button onClick={() => refetch()} className="p-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"><RefreshCw size={isMobile ? 16 : 18} className={isFetching ? 'animate-spin' : ''} /></button>
            </div>
          </div>

          {activeTab === 'history' ? (
            <SmsHistoryPanel
              classId={selectedClass}
              term={selectedTerm}
              year={selectedYear}
              addToast={addToast}
              onRetryComplete={refetch}
            />
          ) : !selectedClass ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-blue-100 rounded-full mb-3"><BookOpen className="text-blue-600" size={isMobile ? 24 : 32} /></div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1">Select a Class</h3>
              <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto mb-4">Choose a class to view student progress and report cards</p>
              <select value="" onChange={e => setSelectedClass(e.target.value)} className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="" disabled>Select a class</option>
                {classOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          ) : noExams ? (
            <div className="bg-white rounded-xl border border-yellow-200 p-6 sm:p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-yellow-100 rounded-full mb-3"><Calendar className="text-yellow-600" size={isMobile ? 24 : 32} /></div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1">No Exams Configured</h3>
              <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto mb-4">
                No exams configured for {selectedTerm} {selectedYear}. Configure the exam types before generating report cards.
              </p>
              <button onClick={() => window.location.href = '/dashboard/admin/exams'} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">Go to Exam Management</button>
            </div>
          ) : (
            <>
              <FilterBar
                selectedClass={selectedClass} setSelectedClass={setSelectedClass} classOptions={classOptions}
                searchTerm={searchTerm} setSearchTerm={setSearchTerm}
                selectedTerm={selectedTerm} setSelectedTerm={(v: string) => setSelectedTerm(v as TermName)}
                selectedYear={selectedYear} setSelectedYear={setSelectedYear}
                terms={terms} years={years} summary={configSummary}
                isTeacher={user?.userType === 'teacher'} isMobile={isMobile}
                configuredExamTypes={configuredExamTypes}
                onBulkSend={handleBulkSend} isBulkSending={isBulkSending}
              />
              {filteredStudents.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filteredStudents.map(student => (
                    <StudentCard
                      key={student.studentId}
                      student={student}
                      onClick={() => handleViewReport(student.studentId)}
                      onSendSMS={handleSendSMS}
                      isSendingSMS={sendingSMS === student.studentId}
                      smsState={smsResults[student.studentId]}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
                  <FileText size={isMobile ? 24 : 32} className="mx-auto text-gray-400 mb-3" />
                  <h3 className="text-base font-semibold text-gray-900 mb-1">No students found</h3>
                  <p className="text-sm text-gray-600">
                    {searchTerm ? 'No students match your search' : `No progress data available for ${selectedTerm} ${selectedYear}`}
                  </p>
                  {searchTerm && <button onClick={() => setSearchTerm('')} className="mt-3 text-xs text-blue-600 hover:text-blue-800 font-medium">Clear search</button>}
                </div>
              )}
            </>
          )}
        </div>
      </DashboardLayout>

      <ReportModal
        isOpen={showReportModal}
        onClose={() => { setShowReportModal(false); setSelectedStudentId(null); }}
        report={selectedReport}
        studentName={selectedStudent?.studentName || ''}
        loading={isLoadingReport}
        configuredExamTypes={configuredExamTypes}
        onDelete={handleDeleteReport}
        isDeleting={isDeletingReport}
      />

      <BulkSendDialog
        isOpen={showBulkAllDialog}
        onClose={() => setShowBulkAllDialog(false)}
        classes={classOptions}
        term={selectedTerm}
        year={selectedYear}
        onComplete={refetch}
        addToast={addToast}
      />

      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
          {toasts.map(t => <Toast key={t.id} toast={t} onClose={() => removeToast(t.id)} />)}
        </div>
      )}
    </>
  );
}