// @/pages/admin/ReportCards.tsx
// Version 3.0.2 - Per-subject average score now surfaced on report cards
//                  (mobile card, desktop table, and PDF via ReportCardSubject.average)

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
} from 'lucide-react';

import { ConfirmationModal } from '@/components/ConfirmationModal';
import { smsService } from '@/services/smsService';

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
}

interface ReportCardSubject {
  subjectId: string;
  subjectName: string;
  week4: number;
  week8: number;
  endOfTerm: number;
  average: number;
  grade: number;
  gradeDescription: string;
}

export interface ReportCardData {
  id: string;
  studentId: string;
  studentName: string;
  className: string;
  classId: string;
  form: string;
  grade: number;
  position: string;
  gender: string;
  totalMarks: number;
  percentage: number;
  status: 'pass' | 'fail';
  improvement: 'improved' | 'declined' | 'stable';
  subjects: ReportCardSubject[];
  attendance: number;
  teachersComment: string;
  parentsEmail: string;
  parentsPhone?: string;
  generatedDate: string;
  term: string;
  year: number;
  isComplete: boolean;
  completionPercentage: number;
  examConfigSummary?: string;
}

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

const getConfiguredExamTypes = (examConfig: any): string[] => {
  if (!examConfig?.examTypes) return [];
  const types: string[] = [];
  if (examConfig.examTypes.week4) types.push('week4');
  if (examConfig.examTypes.week8) types.push('week8');
  if (examConfig.examTypes.endOfTerm) types.push('endOfTerm');
  return types;
};

const getExamDisplayName = (examType: string): string => {
  switch (examType) {
    case 'week4': return 'Week 4';
    case 'week8': return 'Week 8';
    case 'endOfTerm': return 'End of Term';
    default: return examType;
  }
};

// Client-side grade calculation matching the service
const calculateGrade = (percentage: number): number => {
  if (percentage < 0) return -1;
  if (percentage >= 75) return 1;
  if (percentage >= 70) return 2;
  if (percentage >= 65) return 3;
  if (percentage >= 60) return 4;
  if (percentage >= 55) return 5;
  if (percentage >= 50) return 6;
  if (percentage >= 45) return 7;
  if (percentage >= 40) return 8;
  return 9;
};

// ==================== REPORT POST-PROCESSOR ====================
// The service ignores `configuredExamTypes`. We recompute everything that depends
// on which exams are actually configured so reports reflect reality.
interface StudentConfigStats {
  completionPercentage: number;
  isComplete: boolean;
  missingSubjects: number;
  totalSubjects: number;
  overallPercentage: number;
  overallGrade: number;
  status: 'pass' | 'fail' | 'pending';
}

// The service's `subjectProgress` field always divides by 3 (week4 + week8 +
// endOfTerm), regardless of which exams are actually configured for the term.
// A school running only "endOfTerm" would see every subject stuck at 33% even
// when it's fully entered. Recompute it here against configuredExamTypes only,
// the same way computeStudentConfigStats does for the student-level number.
const computeSubjectProgress = (subject: any, configuredExamTypes: string[]): number => {
  if (configuredExamTypes.length === 0) return 0;
  let present = 0;
  configuredExamTypes.forEach(examType => {
    const examData = subject[examType];
    if (examData && examData.status !== 'missing') present++;
  });
  return Math.round((present / configuredExamTypes.length) * 100);
};

const computeStudentConfigStats = (
  student: any,
  configuredExamTypes: string[]
): StudentConfigStats => {
  const subjects: any[] = Array.isArray(student.subjects) ? student.subjects : [];
  const totalSubjects = subjects.length;

  if (totalSubjects === 0 || configuredExamTypes.length === 0) {
    return {
      completionPercentage: 0,
      isComplete: false,
      missingSubjects: totalSubjects,
      totalSubjects,
      overallPercentage: 0,
      overallGrade: -1,
      status: 'pending',
    };
  }

  let completeSubjects = 0;
  const subjectAverages: number[] = [];

  subjects.forEach(subject => {
    let allPresent = true;
    const scores: number[] = [];

    configuredExamTypes.forEach(examType => {
      const examData = subject[examType];
      if (!examData || examData.status === 'missing') {
        allPresent = false;
        return;
      }
      // 'complete', 'absent', 'not_conducted' all count as "present"
      // Only real positive scores contribute to the average
      if (typeof examData.marks === 'number' && examData.marks >= 0) {
        scores.push(examData.marks);
      }
    });

    if (allPresent) completeSubjects++;

    if (scores.length > 0) {
      subjectAverages.push(Math.round(scores.reduce((a, b) => a + b, 0) / scores.length));
    }
  });

  const completionPercentage = Math.round((completeSubjects / totalSubjects) * 100);
  const missingSubjects = totalSubjects - completeSubjects;
  const isComplete = completeSubjects === totalSubjects;

  const overallPercentage = subjectAverages.length > 0
    ? Math.round(subjectAverages.reduce((a, b) => a + b, 0) / subjectAverages.length)
    : 0;

  const overallGrade = overallPercentage > 0 ? calculateGrade(overallPercentage) : -1;
  const status: 'pass' | 'fail' | 'pending' =
    overallPercentage >= 50 ? 'pass' : overallPercentage > 0 ? 'fail' : 'pending';

  return {
    completionPercentage,
    isComplete,
    missingSubjects,
    totalSubjects,
    overallPercentage,
    overallGrade,
    status,
  };
};

const processReportForConfig = (
  rawReport: any,
  configuredExamTypes: string[],
  studentStats: StudentConfigStats
): ReportCardData => {
  const subjects: ReportCardSubject[] = [];
  const subjectAverages: number[] = [];

  (rawReport.subjects || []).forEach((s: any) => {
    const scores: number[] = [];

    configuredExamTypes.forEach(examType => {
      const marks = s[examType];
      if (typeof marks === 'number' && marks >= 0) {
        scores.push(marks);
      }
    });

    const subjectAvg = scores.length > 0
      ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length)
      : -1;

    const grade = subjectAvg >= 0 ? calculateGrade(subjectAvg) : -1;

    if (subjectAvg >= 0) subjectAverages.push(subjectAvg);

    subjects.push({
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      week4: s.week4,
      week8: s.week8,
      endOfTerm: s.endOfTerm,
      average: subjectAvg,
      grade,
      gradeDescription: getGradeDescription(grade),
    });
  });

  const overallPercentage = subjectAverages.length > 0
    ? Math.round(subjectAverages.reduce((a, b) => a + b, 0) / subjectAverages.length)
    : 0;

  const overallGrade = overallPercentage > 0 ? calculateGrade(overallPercentage) : -1;

  return {
    id: rawReport.id,
    studentId: rawReport.studentId,
    studentName: rawReport.studentName,
    className: rawReport.className,
    classId: rawReport.classId,
    form: rawReport.form,
    grade: overallGrade,
    position: rawReport.position,
    gender: rawReport.gender,
    totalMarks: rawReport.totalMarks,
    percentage: overallPercentage,
    status: overallPercentage >= 50 ? 'pass' : 'fail',
    improvement: rawReport.improvement,
    subjects,
    attendance: rawReport.attendance,
    teachersComment: rawReport.teachersComment,
    parentsEmail: rawReport.parentsEmail,
    parentsPhone: rawReport.parentsPhone,
    generatedDate: rawReport.generatedDate,
    term: rawReport.term,
    year: rawReport.year,
    isComplete: studentStats.isComplete,
    completionPercentage: studentStats.completionPercentage,
    examConfigSummary: configuredExamTypes.length
      ? `Based on: ${configuredExamTypes.map(getExamDisplayName).join(' + ')}`
      : undefined,
  };
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
    const timer = setTimeout(onClose, 5000);
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
      // Pass configuredExamTypes through so the PDF's W4/W8/EOT columns match
      // what's actually configured for this term, instead of always showing all three.
      const pdfBytes = await generateReportCardPDF(report, configuredExamTypes);
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
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
  const [selectedTerm, setSelectedTerm] = useState<string>('Term 1');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [isDownloadingMatrix, setIsDownloadingMatrix] = useState(false);
  const [isDeletingReport, setIsDeletingReport] = useState(false);

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

  // Prefer the active config; fall back to the first one.
  // HARDENED: Don't just trust that useExamConfig already filtered correctly —
  // explicitly verify each candidate matches the currently selected term/year
  // before using it. If the hook ever returns a stale/broader list (e.g. during
  // a refetch, or a caching quirk), this stops us from silently picking up a
  // different term's exam configuration and mis-computing every completion
  // percentage and progress bar downstream.
  const currentExamConfig = useMemo(() => {
    if (!examConfigs?.length) return null;

    const matchingConfigs = examConfigs.filter(
      (c: any) => c.term === selectedTerm && c.year === selectedYear
    );

    if (matchingConfigs.length === 0) {
      console.warn(
        `⚠️ useExamConfig returned ${examConfigs.length} config(s) but none match ${selectedTerm} ${selectedYear}. ` +
        `Treating as "no exam config" rather than falling back to a mismatched term/year.`
      );
      return null;
    }

    const active = matchingConfigs.find((c: any) => c.isActive !== false);
    return active || matchingConfigs[0];
  }, [examConfigs, selectedTerm, selectedYear]);

  const configuredExamTypes = useMemo(
    () => getConfiguredExamTypes(currentExamConfig),
    [currentExamConfig]
  );

  // ---------- Data Fetch (query keyed by class/term/year so it refetches) ----------
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

  const { generateReportCard, generateClassReportCards } = useResults();
  const debouncedSearch = useDebounce(searchTerm, 300);

  // ---------- Report Cache (keyed by classId+term+year+studentId) ----------
  const [reportCache, setReportCache] = useState<Map<string, ReportCardData>>(new Map());
  const [loadingReports, setLoadingReports] = useState<Set<string>>(new Set());
  const inFlightRef = useRef<Set<string>>(new Set());

  // Composite key so switching filters cannot serve stale reports
  const cacheKeyFor = useCallback(
    (studentId: string) => `${selectedClass}|${selectedTerm}|${selectedYear}|${studentId}`,
    [selectedClass, selectedTerm, selectedYear]
  );

  // Clear cache + in-flight set when the filter context changes
  useEffect(() => {
    setReportCache(new Map());
    setLoadingReports(new Set());
    inFlightRef.current = new Set();
    // Modal state also refers to the old context
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

  // ---------- Transform students using configured exams ----------
  // This is the source of truth for the UI. Every stat is recomputed against
  // the currently configured exam types so switching a config immediately
  // updates completion/overall/status.
  const transformedStudents = useMemo((): StudentProgress[] => {
    if (!students?.length) return [];
    return students.map((student: any) => {
      const stats = computeStudentConfigStats(student, configuredExamTypes);
      return {
        studentId: student.studentId || '',
        studentName: student.studentName || '',
        className: student.className || '',
        classId: student.classId || '',
        form: student.form || '',
        overallPercentage: stats.overallPercentage,
        overallGrade: stats.overallGrade,
        status: stats.status,
        isComplete: stats.isComplete,
        completionPercentage: stats.completionPercentage,
        subjects: Array.isArray(student.subjects)
          ? student.subjects.map((s: any) => ({
              subjectId: s.subjectId || '',
              subjectName: s.subjectName || '',
              teacherName: s.teacherName || '',
              week4: { status: s.week4?.status || 'missing', marks: s.week4?.marks },
              week8: { status: s.week8?.status || 'missing', marks: s.week8?.marks },
              endOfTerm: { status: s.endOfTerm?.status || 'missing', marks: s.endOfTerm?.marks },
              subjectProgress: computeSubjectProgress(s, configuredExamTypes),
              grade: s.grade,
            }))
          : [],
        missingSubjects: stats.missingSubjects,
        totalSubjects: stats.totalSubjects,
        gender: studentGenderMap.get(student.studentId) || 'Not specified',
      };
    });
  }, [students, studentGenderMap, configuredExamTypes]);

  // Summary derived from the *transformed* students (respects config)
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

  // ---------- Report Generation (config-aware, filter-aware) ----------
  useEffect(() => {
    let cancelled = false;

    const generate = async () => {
      if (!students.length || !selectedTerm || !selectedYear) return;

      // Only attempt students we have not cached yet and are not already generating
      const toGen = transformedStudents.filter(s => {
        const key = cacheKeyFor(s.studentId);
        return !reportCache.has(key) && !inFlightRef.current.has(key);
      });
      if (!toGen.length) return;

      toGen.forEach(s => inFlightRef.current.add(cacheKeyFor(s.studentId)));
      setLoadingReports(new Set(inFlightRef.current));

      // Process in batches of 5
      for (let i = 0; i < toGen.length; i += 5) {
        if (cancelled) break;
        const batch = toGen.slice(i, i + 5);

        await Promise.all(
          batch.map(async student => {
            const key = cacheKeyFor(student.studentId);
            try {
              const raw = await generateReportCard({
                studentId: student.studentId,
                term: selectedTerm,
                year: selectedYear,
                options: {
                  includeIncomplete: true,
                  markMissing: true,
                  configuredExamTypes,
                },
              });

              if (cancelled || !raw) return;

              const stats = computeStudentConfigStats(student, configuredExamTypes);
              const processed = processReportForConfig(raw, configuredExamTypes, stats);

              // Ensure gender comes through even if service didn't provide it
              processed.gender = processed.gender || studentGenderMap.get(student.studentId) || 'Not specified';

              setReportCache(prev => {
                const next = new Map(prev);
                next.set(key, processed);
                return next;
              });
            } catch (err) {
              console.error(`Report failed for ${student.studentName}:`, err);
            } finally {
              inFlightRef.current.delete(key);
            }
          })
        );
      }

      if (!cancelled) {
        setLoadingReports(new Set(inFlightRef.current));
      }
    };

    generate();
    return () => { cancelled = true; };
    // Intentionally NOT including reportCache/loadingReports to avoid re-trigger loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transformedStudents, selectedTerm, selectedYear, configuredExamTypes, cacheKeyFor, generateReportCard, studentGenderMap]);

  // ---------- Delete report (local cache only, matches original UX) ----------
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
    if (!student || student.overallPercentage <= 0) {
      addToast('warning', 'No Results', `${studentName} has no results for this term`);
      setSmsResults(prev => ({ ...prev, [studentId]: { status: 'error', message: 'No results' } }));
      setTimeout(() => setSmsResults(prev => { const n = { ...prev }; delete n[studentId]; return n; }), 3000);
      return;
    }
    setSendingSMS(studentId);
    try {
      const result = await smsService.sendStudentResults(studentId, selectedTerm, selectedYear);
      if (result.success) {
        setSmsResults(prev => ({ ...prev, [studentId]: { status: 'success', message: 'SMS sent!' } }));
        addToast('success', 'SMS Sent!', `Results sent to ${studentName}'s guardian${result.carrier ? ` (${result.carrier})` : ''}`);
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

  const handleBulkSend = async () => {
    if (!selectedClass || !selectedTerm || !selectedYear) { addToast('warning', 'Missing Info', 'Select class, term, and year'); return; }
    if (configuredExamTypes.length === 0) { addToast('warning', 'No Exams', 'No exams configured'); return; }
    const withResults = filteredStudents.filter(s => s.overallPercentage > 0).length;
    if (withResults === 0) { addToast('warning', 'No Results', 'No students have results'); return; }
    if (!confirm(`Send results via SMS to guardians?\n\nStudents with results: ${withResults}\n\nThis may take a few moments.`)) return;
    setIsBulkSending(true);
    addToast('info', 'Sending...', 'Sending results to class guardians...');
    try {
      const result = await smsService.bulkSendClass(selectedClass, selectedTerm, selectedYear);
      let title = '✅ Bulk SMS Complete'; let type: ToastMessage['type'] = 'success';
      if (result.failed > 0 && result.sent === 0) { title = '❌ Bulk Failed'; type = 'error'; }
      else if (result.failed > 0) { title = '⚠️ Partial Success'; type = 'warning'; }
      let msg = `Sent: ${result.sent} | Failed: ${result.failed} | Total: ${result.total}`;
      if (result.failedList?.length) { msg += '\n\nFailed:'; result.failedList.slice(0, 3).forEach(f => msg += `\n• ${f.studentId}: ${f.reason}`); }
      addToast(type, title, msg);
      refetch();
    } catch (error: any) { addToast('error', 'Bulk Failed', error.message); }
    finally { setIsBulkSending(false); }
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
        options: { includeIncomplete: true, markMissing: true, configuredExamTypes },
      });
      if (!result.reportCards.length) { addToast('warning', 'Empty', 'No reports generated'); return; }

      // Post-process each report using its matching student so completion/percentages
      // reflect the configured exams.
      const studentByCustomId = new Map(transformedStudents.map(s => [s.studentId, s]));
      const reports = result.reportCards.map(r => {
        const student = studentByCustomId.get(r.studentId);
        const stats = student
          ? computeStudentConfigStats(student, configuredExamTypes)
          : {
              completionPercentage: 0,
              isComplete: false,
              missingSubjects: 0,
              totalSubjects: 0,
              overallPercentage: 0,
              overallGrade: -1,
              status: 'pending' as const,
            };
        const processed = processReportForConfig(r, configuredExamTypes, stats);
        processed.gender = processed.gender || studentGenderMap.get(r.studentId) || 'Not specified';
        return processed;
      });

      const { generateReportCardPDF } = await import('@/services/pdf/reportCardPDFLib');
      // Pass configuredExamTypes through so batch-exported PDFs show only the
      // W4/W8/EOT columns that are actually configured for this term.
      const pdfBytes = await generateReportCardPDF(reports, configuredExamTypes);
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
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

      const calcAvg = (sub: SubjectProgress) => {
        const sc: number[] = [];
        if (configuredExamTypes.includes('week4') && sub.week4?.marks !== undefined && sub.week4.marks >= 0) sc.push(sub.week4.marks);
        if (configuredExamTypes.includes('week8') && sub.week8?.marks !== undefined && sub.week8.marks >= 0) sc.push(sub.week8.marks);
        if (configuredExamTypes.includes('endOfTerm') && sub.endOfTerm?.marks !== undefined && sub.endOfTerm.marks >= 0) sc.push(sub.endOfTerm.marks);
        if (!sc.length) return -1;
        const a = sc.reduce((a, b) => a + b, 0) / sc.length;
        if (a >= 75) return 1; if (a >= 70) return 2; if (a >= 65) return 3; if (a >= 60) return 4;
        if (a >= 55) return 5; if (a >= 50) return 6; if (a >= 45) return 7; if (a >= 40) return 8; return 9;
      };

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
              endOfTerm: { marks: sub?.endOfTerm?.marks ?? -3, status: sub?.endOfTerm?.status || 'missing', grade: sub?.grade || -1 },
              average: sub ? calcAvg(sub) : -1,
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
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
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
              <button onClick={() => refetch()} className="p-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"><RefreshCw size={isMobile ? 16 : 18} className={isFetching ? 'animate-spin' : ''} /></button>
            </div>
          </div>

          {!selectedClass ? (
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
                selectedTerm={selectedTerm} setSelectedTerm={setSelectedTerm}
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

      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
          {toasts.map(t => <Toast key={t.id} toast={t} onClose={() => removeToast(t.id)} />)}
        </div>
      )}
    </>
  );
}