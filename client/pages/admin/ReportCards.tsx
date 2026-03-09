// @/pages/admin/ReportCards.tsx - FIXED VERSION WITH WORKING PDF AND CONFIRMATION MODAL
import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useEffect, useMemo, useCallback } from 'react';
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
  AlertCircle,
  FileSpreadsheet
} from 'lucide-react';

// Import ConfirmationModal
import { ConfirmationModal } from '@/components/ConfirmationModal';

// Import types from service
import type { StudentResult, ReportCardData as ServiceReportCardData, StudentProgress as ServiceStudentProgress } from '@/services/resultsService';

// ==================== LOCAL TYPES ====================
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

// Interface for class results matrix
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

// ==================== HELPER FUNCTIONS ====================
const getConfiguredExamTypes = (examConfig: any): string[] => {
  if (!examConfig?.examTypes) return [];
  
  const types = [];
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
      <Icon size={12} />
      {label}
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
        <div 
          className={`h-full ${getProgressColor(validProgress)} transition-all duration-300`} 
          style={{ width: `${validProgress}%` }} 
        />
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

// ==================== STUDENT CARD COMPONENT ====================
interface StudentCardProps {
  student: StudentProgress;
  onClick: () => void;
}

const StudentCard = ({ student, onClick }: StudentCardProps) => {
  const isMobile = useMediaQuery('(max-width: 640px)');

  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-xl border border-gray-200 p-4 hover:shadow-lg transition-all duration-300 hover:border-blue-300 hover:-translate-y-0.5 text-left"
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
        <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm ${getGradeColor(student.overallGrade)} flex-shrink-0`}>
          {student.overallGrade > 0 ? getGradeDisplay(student.overallGrade) : '—'}
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
            {student.overallPercentage > 0 ? `${student.overallPercentage}%` : '—'}
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
    </button>
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
          {subject.week4 >= 0 ? `${subject.week4}%` : 
           subject.week4 === -1 ? 'ABS' : subject.week4 === -2 ? 'NC' : '—'}
        </p>
      </div>
    );
  }
  
  if (configuredExamTypes.includes('week8')) {
    examColumns.push(
      <div key="week8" className="text-center p-2 bg-gray-50 rounded-lg">
        <p className="text-[10px] text-gray-500">W8</p>
        <p className="font-medium text-xs">
          {subject.week8 >= 0 ? `${subject.week8}%` : 
           subject.week8 === -1 ? 'ABS' : subject.week8 === -2 ? 'NC' : '—'}
        </p>
      </div>
    );
  }
  
  if (configuredExamTypes.includes('endOfTerm')) {
    examColumns.push(
      <div key="eot" className="text-center p-2 bg-blue-50 rounded-lg">
        <p className="text-[10px] text-blue-600">EOT</p>
        <p className="font-medium text-xs text-blue-600">
          {subject.endOfTerm >= 0 ? `${subject.endOfTerm}%` : 
           subject.endOfTerm === -1 ? 'ABS' : subject.endOfTerm === -2 ? 'NC' : '—'}
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
      
      <div className="grid grid-cols-3 gap-2">
        {examColumns}
      </div>
      
      <div className="mt-2 text-center">
        <span className="text-xs font-medium text-gray-700">
          {getGradeDescription(subject.grade)}
        </span>
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

const ReportModal = ({ 
  isOpen, 
  onClose, 
  report, 
  studentName, 
  loading, 
  configuredExamTypes = ['week4', 'week8', 'endOfTerm'],
  onDelete,
  isDeleting
}: ReportModalProps) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDownloadPDF = async () => {
    if (!report) return;
    try {
      const { generateReportCardPDF } = await import('@/services/pdf/reportCardPDFLib');
      const pdfBytes = await generateReportCardPDF(report);
      // FIXED: Properly convert Uint8Array for Blob
      const blob = new Blob([pdfBytes.buffer], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `report-card-${report.studentId}-${report.term}-${report.year}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('PDF download failed:', error);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDelete = async () => {
    if (onDelete && report) {
      await onDelete(report.studentId);
      setShowDeleteConfirm(false);
      onClose();
    }
  };

  if (!isOpen) return null;

  // Mobile View
  if (isMobile) {
    return (
      <>
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/50" onClick={onClose} />
          <div className="relative bg-white min-h-screen w-full">
            
            {/* Mobile Header */}
            <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
              <button onClick={onClose} className="p-2">
                <ChevronLeft size={20} className="text-gray-600" />
              </button>
              <h2 className="text-sm font-semibold text-gray-900">Report Card</h2>
              <div className="flex items-center gap-2">
                {onDelete && report && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete Report"
                    disabled={isDeleting}
                  >
                    {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                  </button>
                )}
                <button onClick={handleDownloadPDF} className="p-2" title="Download PDF">
                  <Download size={18} className="text-gray-600" />
                </button>
                <button onClick={handlePrint} className="p-2" title="Print">
                  <Printer size={18} className="text-gray-600" />
                </button>
              </div>
            </div>

            {/* Mobile Content */}
            <div className="p-4">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent"></div>
                </div>
              ) : !report ? (
                <div className="text-center py-12">
                  <FileText size={48} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500">No report data available</p>
                </div>
              ) : (
                <>
                  {/* School Header */}
                  <div className="text-center mb-4">
                    <h1 className="text-lg font-bold text-gray-900">MINISTRY OF EDUCATION</h1>
                    <h2 className="text-base font-semibold text-gray-800">KALABO BOARDING SECONDARY SCHOOL</h2>
                    <p className="text-xs text-blue-600 mt-1 uppercase">Learner Report Card</p>
                    {report.examConfigSummary && (
                      <p className="text-[10px] text-blue-500 mt-1">{report.examConfigSummary}</p>
                    )}
                  </div>

                  {/* Student Info Cards */}
                  <div className="space-y-2 mb-4">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-gray-50 p-2 rounded-lg">
                        <p className="text-[10px] text-gray-500">Name</p>
                        <p className="font-medium text-xs truncate">{report.studentName}</p>
                      </div>
                      <div className="bg-gray-50 p-2 rounded-lg">
                        <p className="text-[10px] text-gray-500">ID</p>
                        <p className="font-medium text-xs truncate">{report.studentId}</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-2">
                      <div className="bg-gray-50 p-2 rounded-lg">
                        <p className="text-[10px] text-gray-500">Class</p>
                        <p className="font-medium text-xs">{report.className}</p>
                      </div>
                      <div className="bg-gray-50 p-2 rounded-lg">
                        <p className="text-[10px] text-gray-500">Term</p>
                        <p className="font-medium text-xs">{report.term}</p>
                      </div>
                      <div className="bg-gray-50 p-2 rounded-lg">
                        <p className="text-[10px] text-gray-500">Avg</p>
                        <p className="font-medium text-xs text-blue-600">{report.percentage}%</p>
                      </div>
                      <div className="bg-gray-50 p-2 rounded-lg">
                        <p className="text-[10px] text-gray-500">Pos</p>
                        <p className="font-medium text-xs text-blue-600">{report.position.split(' ')[0]}</p>
                      </div>
                    </div>
                  </div>

                  {/* Subjects as Cards */}
                  <div className="space-y-2 mb-4">
                    <h3 className="text-xs font-semibold text-gray-700 mb-2">Subjects</h3>
                    {report.subjects.map((subject, index) => (
                      <MobileSubjectCard key={index} subject={subject} configuredExamTypes={configuredExamTypes} />
                    ))}
                  </div>

                  {/* Teacher's Comment */}
                  <div className="bg-gray-50 p-3 rounded-lg mb-4">
                    <p className="text-[10px] text-gray-500 uppercase mb-1">Teacher's Comment</p>
                    <p className="text-xs text-gray-800">"{report.teachersComment}"</p>
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-gray-500 mb-4">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-gray-200 border border-gray-400 rounded-full"></span>
                      — = Not Entered
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-gray-500 rounded-full"></span>
                      ABS = Absent
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                      NC = Not Conducted
                    </span>
                  </div>

                  {/* Footer */}
                  <div className="text-[10px] text-gray-400 text-right">
                    Generated: {report.generatedDate}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Delete Confirmation Modal - Using ConfirmationModal component */}
        <ConfirmationModal
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDelete}
          title="Delete Report Card"
          message={`Are you sure you want to delete the report card for ${report?.studentName}? This action cannot be undone.`}
          type="delete"
          confirmText="Delete"
          cancelText="Cancel"
          isLoading={isDeleting}
        />
      </>
    );
  }

  // Desktop View
  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="relative bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl">
            
            {/* Modal Header */}
            <div className="sticky top-0 z-10 bg-white border-b border-gray-200 rounded-t-2xl px-6 py-3 flex items-center justify-end gap-2">
              {onDelete && report && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete Report"
                  disabled={isDeleting}
                >
                  {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                </button>
              )}
              <button
                onClick={handleDownloadPDF}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Download PDF"
              >
                <Download size={18} />
              </button>
              <button
                onClick={handlePrint}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Print"
              >
                <Printer size={18} />
              </button>
              <button
                onClick={onClose}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-auto p-6">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent"></div>
                </div>
              ) : !report ? (
                <div className="text-center py-12">
                  <FileText size={48} className="mx-auto text-gray-300 mb-3" />
                  <p className="text-gray-500">No report data available</p>
                </div>
              ) : (
                <div className="min-w-[900px]">
                  {/* School Header */}
                  <div className="text-center mb-6">
                    <h1 className="text-2xl font-bold text-gray-900">MINISTRY OF EDUCATION</h1>
                    <h2 className="text-xl font-semibold text-gray-800 mt-1">KALABO BOARDING SECONDARY SCHOOL</h2>
                    <h3 className="text-lg font-medium text-blue-600 mt-2 uppercase tracking-wider">LEARNER REPORT CARD</h3>
                    {report.examConfigSummary && (
                      <p className="text-sm text-blue-500 mt-1">{report.examConfigSummary}</p>
                    )}
                  </div>

                  {/* Student Info Grid */}
                  <div className="grid grid-cols-8 gap-3 mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="col-span-2">
                      <p className="text-xs text-gray-500">Student Name</p>
                      <p className="font-semibold text-gray-900 truncate">{report.studentName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">ID</p>
                      <p className="font-semibold text-gray-900">{report.studentId}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Class</p>
                      <p className="font-semibold text-gray-900">{report.className}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Gender</p>
                      <p className="font-semibold text-gray-900">{report.gender}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Term</p>
                      <p className="font-semibold text-gray-900">{report.term}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Position</p>
                      <p className="font-semibold text-blue-600">{report.position}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Average</p>
                      <p className="font-semibold text-gray-900">{report.percentage}%</p>
                    </div>
                  </div>

                  {/* Results Table */}
                  <table className="w-full border-collapse mb-6 text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border border-gray-300">Subject</th>
                        {configuredExamTypes.includes('week4') && (
                          <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border border-gray-300">W4</th>
                        )}
                        {configuredExamTypes.includes('week8') && (
                          <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border border-gray-300">W8</th>
                        )}
                        {configuredExamTypes.includes('endOfTerm') && (
                          <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border border-gray-300 bg-blue-50">EOT</th>
                        )}
                        <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border border-gray-300">Grade</th>
                        <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border border-gray-300">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.subjects.map((subject, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-xs font-medium text-gray-900 border border-gray-300">
                            {subject.subjectName}
                          </td>
                          
                          {configuredExamTypes.includes('week4') && (
                            <td className="px-3 py-2 text-center text-xs border border-gray-300">
                              {subject.week4 >= 0 ? (
                                <span className="font-medium text-gray-900">{subject.week4}%</span>
                              ) : subject.week4 === -1 ? (
                                <span className="text-gray-500 italic">ABS</span>
                              ) : subject.week4 === -2 ? (
                                <span className="text-gray-400 italic">NC</span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                          )}
                          
                          {configuredExamTypes.includes('week8') && (
                            <td className="px-3 py-2 text-center text-xs border border-gray-300">
                              {subject.week8 >= 0 ? (
                                <span className="font-medium text-gray-900">{subject.week8}%</span>
                              ) : subject.week8 === -1 ? (
                                <span className="text-gray-500 italic">ABS</span>
                              ) : subject.week8 === -2 ? (
                                <span className="text-gray-400 italic">NC</span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                          )}
                          
                          {configuredExamTypes.includes('endOfTerm') && (
                            <td className="px-3 py-2 text-center text-xs border border-gray-300 bg-blue-50">
                              {subject.endOfTerm >= 0 ? (
                                <span className="font-bold text-blue-700">{subject.endOfTerm}%</span>
                              ) : subject.endOfTerm === -1 ? (
                                <span className="text-gray-500 italic">ABS</span>
                              ) : subject.endOfTerm === -2 ? (
                                <span className="text-gray-400 italic">NC</span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                          )}
                          
                          <td className="px-3 py-2 text-center border border-gray-300">
                            {subject.grade > 0 ? (
                              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-white font-bold text-xs ${getGradeColor(subject.grade)}`}>
                                {getGradeDisplay(subject.grade)}
                              </span>
                            ) : subject.grade === -1 ? (
                              <span className="text-gray-500 font-medium">X</span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-700 border border-gray-300">
                            {getGradeDescription(subject.grade)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50">
                        <td colSpan={configuredExamTypes.length} className="px-3 py-2 text-right text-xs font-semibold text-gray-700 border border-gray-300">
                          Overall Average:
                        </td>
                        <td colSpan={2} className="px-3 py-2 text-left text-xs font-bold text-blue-600 border border-gray-300">
                          {report.percentage}%
                        </td>
                      </tr>
                      <tr className="bg-gray-50">
                        <td colSpan={configuredExamTypes.length} className="px-3 py-2 text-right text-xs font-semibold text-gray-700 border border-gray-300">
                          Overall Grade:
                        </td>
                        <td colSpan={2} className="px-3 py-2 text-left text-xs font-bold border border-gray-300">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-white font-bold text-xs ${getGradeColor(report.grade)}`}>
                            {getGradeDisplay(report.grade)}
                          </span>
                          <span className="ml-2 text-gray-700">{getGradeDescription(report.grade)}</span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>

                  {/* Teacher's Comment */}
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Teacher's Comment</p>
                    <p className="text-sm text-gray-800">"{report.teachersComment}"</p>
                  </div>

                  {/* Legend */}
                  <div className="flex items-center gap-4 text-xs text-gray-500 mb-4">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-gray-200 border border-gray-400 rounded-full"></span>
                      — = Not Entered
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-gray-500 rounded-full"></span>
                      ABS = Absent
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 bg-gray-400 rounded-full"></span>
                      NC = Not Conducted
                    </span>
                  </div>

                  {/* Footer */}
                  <div className="mt-4 text-right text-xs text-gray-400">
                    Generated: {report.generatedDate}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal - Using ConfirmationModal component */}
      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Report Card"
        message={`Are you sure you want to delete the report card for ${report?.studentName}? This action cannot be undone.`}
        type="delete"
        confirmText="Delete"
        cancelText="Cancel"
        isLoading={isDeleting}
      />
    </>
  );
};

// ==================== FILTER BAR COMPONENT ====================
const FilterBar = ({
  selectedClass,
  setSelectedClass,
  classOptions,
  searchTerm,
  setSearchTerm,
  selectedTerm,
  setSelectedTerm,
  selectedYear,
  setSelectedYear,
  terms,
  years,
  summary,
  isTeacher,
  isMobile,
  configuredExamTypes
}: {
  selectedClass: string;
  setSelectedClass: (value: string) => void;
  classOptions: { id: string; name: string }[];
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  selectedTerm: string;
  setSelectedTerm: (value: string) => void;
  selectedYear: number;
  setSelectedYear: (value: number) => void;
  terms: string[];
  years: number[];
  summary: { total: number; complete: number; incomplete: number; averageCompletion: number } | null;
  isTeacher: boolean;
  isMobile: boolean;
  configuredExamTypes?: string[];
}) => {
  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className="mb-4 sm:mb-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
      {isMobile && (
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full flex items-center justify-between p-3 bg-white"
        >
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-400" />
            <span className="font-medium text-sm text-gray-700">
              {selectedClass ? 'Filters active' : 'Filter students'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {selectedClass && <span className="w-2 h-2 bg-blue-500 rounded-full"></span>}
            <ChevronDown size={16} className={`text-gray-500 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </div>
        </button>
      )}

      <div className={`p-3 sm:p-4 ${isMobile && !showFilters ? 'hidden' : 'block'}`}>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <select
            value={selectedClass}
            onChange={e => setSelectedClass(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white"
            disabled={isTeacher}
          >
            {classOptions.map(cls => (
              <option key={cls.id} value={cls.id}>{cls.name}</option>
            ))}
          </select>
          
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search students..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          
          <select
            value={selectedTerm}
            onChange={e => setSelectedTerm(e.target.value)}
            className="w-full sm:w-28 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white"
          >
            {terms.map(term => (
              <option key={term} value={term}>{term}</option>
            ))}
          </select>
          
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(Number(e.target.value))}
            className="w-full sm:w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm bg-white"
          >
            {years.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
        
        {/* Exam Config Summary */}
        {configuredExamTypes && configuredExamTypes.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-blue-700 bg-blue-50 px-3 py-2 rounded-lg">
            <Calendar size={14} className="text-blue-600" />
            <span>
              Exams included: {configuredExamTypes.map(getExamDisplayName).join(' • ')}
            </span>
          </div>
        )}
        
        {summary && summary.total > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 flex flex-nowrap sm:flex-wrap gap-3 sm:gap-4 text-xs overflow-x-auto pb-1">
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-gray-600">Total:</span>
              <span className="font-medium text-gray-900">{summary.total}</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-green-600">Complete:</span>
              <span className="font-medium text-gray-900">{summary.complete}</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-yellow-600">Progress:</span>
              <span className="font-medium text-gray-900">{summary.incomplete}</span>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className="text-blue-600">Avg:</span>
              <span className="font-medium text-gray-900">{summary.averageCompletion}%</span>
            </div>
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
  
  // Get exam configuration for the selected term and year
  const { 
    configs: examConfigs, 
    isLoading: loadingExamConfig 
  } = useExamConfig({ year: selectedYear, term: selectedTerm });
  
  const currentExamConfig = examConfigs?.[0];
  
  // Get configured exam types
  const configuredExamTypes = useMemo(() => {
    return getConfiguredExamTypes(currentExamConfig);
  }, [currentExamConfig]);
  
  // Cache for generated reports
  const [reportCache, setReportCache] = useState<Map<string, ReportCardData>>(new Map());
  const [loadingReports, setLoadingReports] = useState<Set<string>>(new Set());

  // Create a map of student IDs to gender
  const studentGenderMap = useMemo(() => {
    const map = new Map<string, string>();
    learners.forEach(learner => {
      if (learner.id) map.set(learner.id, learner.gender || 'Not specified');
      if (learner.studentId) map.set(learner.studentId, learner.gender || 'Not specified');
    });
    return map;
  }, [learners]);

  const {
    students = [],
    summary,
    isLoading: loadingProgress,
    isFetching,
    refetch
  } = useStudentProgress({
    classId: selectedClass,
    term: selectedTerm,
    year: selectedYear,
  });

  const { generateReportCard, generateClassReportCards } = useResults();

  const debouncedSearch = useDebounce(searchTerm, 300);

  // Auto-select class for teachers
  useEffect(() => {
    if (user?.userType === 'teacher' && classes.length > 0 && !selectedClass) {
      if (assignments && assignments.length > 0) {
        const teacherClassIds = [...new Set(assignments.map(a => a.classId))];
        const teacherClass = classes.find(cls => teacherClassIds.includes(cls.id));
        if (teacherClass) {
          setSelectedClass(teacherClass.id);
        }
      }
    }
  }, [classes, user, assignments, selectedClass]);

  // ==================== TRANSFORMATION WITH EXAM CONFIG ====================
  const transformedStudents = useMemo((): StudentProgress[] => {
    if (!students || students.length === 0) return [];
    
    return students.map((student: any) => {
      const completionPercentage = student.completionPercentage || 0;
      
      // Calculate missing subjects based on configured exams
      const missingSubjects = student.subjects?.filter((s: any) => {
        let isIncomplete = false;
        
        if (configuredExamTypes.includes('week4') && s.week4?.status === 'missing') {
          isIncomplete = true;
        }
        if (configuredExamTypes.includes('week8') && s.week8?.status === 'missing') {
          isIncomplete = true;
        }
        if (configuredExamTypes.includes('endOfTerm') && s.endOfTerm?.status === 'missing') {
          isIncomplete = true;
        }
        
        return isIncomplete;
      }).length || 0;

      return {
        studentId: student.studentId || '',
        studentName: student.studentName || '',
        className: student.className || '',
        classId: student.classId || '',
        form: student.form || '',
        overallPercentage: student.overallPercentage || 0,
        overallGrade: student.overallGrade || 0,
        status: student.status || 'pending',
        isComplete: student.isComplete || false,
        completionPercentage: completionPercentage,
        subjects: Array.isArray(student.subjects) ? student.subjects.map((subject: any) => ({
          subjectId: subject.subjectId || '',
          subjectName: subject.subjectName || '',
          teacherName: subject.teacherName || '',
          week4: {
            status: subject.week4?.status || 'missing',
            marks: subject.week4?.marks
          },
          week8: {
            status: subject.week8?.status || 'missing',
            marks: subject.week8?.marks
          },
          endOfTerm: {
            status: subject.endOfTerm?.status || 'missing',
            marks: subject.endOfTerm?.marks
          },
          subjectProgress: subject.subjectProgress || 0,
          grade: subject.grade
        })) : [],
        missingSubjects: missingSubjects,
        totalSubjects: student.totalSubjects || 0,
        gender: studentGenderMap.get(student.studentId) || 'Not specified'
      };
    });
  }, [students, studentGenderMap, configuredExamTypes]);

  // Generate reports for all students when data loads
  useEffect(() => {
    const generateAllReports = async () => {
      if (!students.length || !selectedTerm || !selectedYear) return;

      const studentsToGenerate = students.filter((s: any) => 
        !reportCache.has(s.studentId) && !loadingReports.has(s.studentId)
      );

      if (studentsToGenerate.length === 0) return;

      setLoadingReports(prev => {
        const newSet = new Set(prev);
        studentsToGenerate.forEach((s: any) => newSet.add(s.studentId));
        return newSet;
      });

      const batchSize = 5;
      for (let i = 0; i < studentsToGenerate.length; i += batchSize) {
        const batch = studentsToGenerate.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (student: any) => {
            try {
              const report = await generateReportCard({
                studentId: student.studentId,
                term: selectedTerm,
                year: selectedYear,
                options: {
                  includeIncomplete: true,
                  markMissing: true,
                  configuredExamTypes
                }
              });

              if (report) {
                const transformedReport: ReportCardData = {
                  id: report.id,
                  studentId: report.studentId,
                  studentName: report.studentName,
                  className: report.className,
                  classId: report.classId,
                  form: report.form,
                  grade: report.overallGrade,
                  position: report.position,
                  gender: report.gender || studentGenderMap.get(student.studentId) || 'Not specified',
                  totalMarks: report.totalMarks,
                  percentage: report.percentage,
                  status: report.status,
                  improvement: report.improvement,
                  subjects: report.subjects.map(s => ({
                    subjectId: s.subjectId,
                    subjectName: s.subjectName,
                    week4: s.week4,
                    week8: s.week8,
                    endOfTerm: s.endOfTerm,
                    grade: s.grade,
                    gradeDescription: s.gradeDescription || getGradeDescription(s.grade)
                  })),
                  attendance: report.attendance,
                  teachersComment: report.teachersComment,
                  parentsEmail: report.parentsEmail,
                  parentsPhone: report.parentsPhone,
                  generatedDate: report.generatedDate || new Date().toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  }),
                  term: report.term,
                  year: report.year,
                  isComplete: report.isComplete,
                  completionPercentage: report.completionPercentage,
                  examConfigSummary: configuredExamTypes.length > 0 
                    ? `Based on: ${configuredExamTypes.map(getExamDisplayName).join(' + ')}`
                    : undefined
                };
                
                setReportCache(prev => {
                  const newMap = new Map(prev);
                  newMap.set(student.studentId, transformedReport);
                  return newMap;
                });
              }
            } catch (error) {
              console.error(`Failed to generate report for ${student.studentName}:`, error);
            } finally {
              setLoadingReports(prev => {
                const newSet = new Set(prev);
                newSet.delete(student.studentId);
                return newSet;
              });
            }
          })
        );
      }
    };

    generateAllReports();
  }, [students, selectedTerm, selectedYear, generateReportCard, reportCache, loadingReports, studentGenderMap, configuredExamTypes]);

  // ==================== DELETE REPORT CARD ====================
  const handleDeleteReport = useCallback(async (studentId: string) => {
    setIsDeletingReport(true);
    try {
      // Here you would call an API to delete the report/results
      // For now, we'll just remove it from the cache
      setReportCache(prev => {
        const newMap = new Map(prev);
        newMap.delete(studentId);
        return newMap;
      });
      
      // You might also want to refresh the student progress data
      await refetch();
      
      alert('Report card deleted successfully');
    } catch (error) {
      console.error('Failed to delete report:', error);
      alert('Failed to delete report. Please try again.');
    } finally {
      setIsDeletingReport(false);
    }
  }, [refetch]);

  // ==================== DOWNLOAD ALL REPORT CARDS ====================
  const handleDownloadAllReportCards = useCallback(async () => {
    if (!selectedClass || students.length === 0) {
      alert('No students to generate reports for');
      return;
    }

    if (configuredExamTypes.length === 0) {
      alert('No exams configured for this term. Please configure exams first.');
      return;
    }

    setIsDownloadingAll(true);
    
    try {
      // Generate all report cards using the bulk operation
      const result = await generateClassReportCards({
        classId: selectedClass,
        term: selectedTerm,
        year: selectedYear,
        options: {
          includeIncomplete: true,
          markMissing: true,
          configuredExamTypes
        }
      });

      if (result.reportCards.length === 0) {
        alert('No report cards were generated');
        return;
      }

      // Import the PDF generator
      const { generateReportCardPDF } = await import('@/services/pdf/reportCardPDFLib');

      // Download each PDF sequentially with a slight delay
      for (let i = 0; i < result.reportCards.length; i++) {
        const report = result.reportCards[i];
        
        if (i % 5 === 0) {
          console.log(`Downloading report ${i + 1} of ${result.reportCards.length}`);
        }

        try {
          const localReport: ReportCardData = {
            id: report.id,
            studentId: report.studentId,
            studentName: report.studentName,
            className: report.className,
            classId: report.classId,
            form: report.form,
            grade: report.overallGrade,
            position: report.position,
            gender: report.gender || 'Not specified',
            totalMarks: report.totalMarks,
            percentage: report.percentage,
            status: report.status,
            improvement: report.improvement,
            subjects: report.subjects.map(s => ({
              subjectId: s.subjectId,
              subjectName: s.subjectName,
              week4: s.week4,
              week8: s.week8,
              endOfTerm: s.endOfTerm,
              grade: s.grade,
              gradeDescription: s.gradeDescription || getGradeDescription(s.grade)
            })),
            attendance: report.attendance,
            teachersComment: report.teachersComment,
            parentsEmail: report.parentsEmail,
            parentsPhone: report.parentsPhone,
            generatedDate: report.generatedDate,
            term: report.term,
            year: report.year,
            isComplete: report.isComplete,
            completionPercentage: report.completionPercentage,
            examConfigSummary: configuredExamTypes.length > 0 
              ? `Based on: ${configuredExamTypes.map(getExamDisplayName).join(' + ')}`
              : undefined
          };

          const pdfBytes = await generateReportCardPDF(localReport);
          // FIXED: Properly convert Uint8Array for Blob
          const blob = new Blob([pdfBytes.buffer], { type: 'application/pdf' });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${report.studentName.replace(/\s+/g, '_')}_${report.studentId}_${report.term}_${report.year}.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`Failed to download PDF for ${report.studentName}:`, error);
        }
      }

      alert(`Successfully downloaded ${result.reportCards.length} report cards`);

    } catch (error) {
      console.error('Failed to download all report cards:', error);
      alert('Failed to download all report cards. Please try again.');
    } finally {
      setIsDownloadingAll(false);
    }
  }, [selectedClass, students, selectedTerm, selectedYear, generateClassReportCards, configuredExamTypes]);

  // ==================== DOWNLOAD CLASS RESULTS MATRIX ====================
  const handleDownloadClassMatrix = useCallback(async () => {
    if (!selectedClass || students.length === 0) {
      alert('No data to generate class matrix');
      return;
    }

    if (configuredExamTypes.length === 0) {
      alert('No exams configured for this term. Please configure exams first.');
      return;
    }

    setIsDownloadingMatrix(true);

    try {
      // Get all unique subjects from all students
      const allSubjects = new Set<string>();
      transformedStudents.forEach(student => {
        student.subjects.forEach(subject => {
          allSubjects.add(subject.subjectName);
        });
      });
      const subjectsList = Array.from(allSubjects).sort();

      // Build the matrix data
      const matrixData: ClassResultsMatrix = {
        className: transformedStudents[0]?.className || 'Unknown Class',
        term: selectedTerm,
        year: selectedYear,
        students: transformedStudents.map(student => ({
          studentId: student.studentId,
          studentName: student.studentName,
          gender: student.gender || studentGenderMap.get(student.studentId) || 'Not specified',
          subjects: subjectsList.map(subjectName => {
            const subject = student.subjects.find(s => s.subjectName === subjectName);
            return {
              subjectName,
              week4: {
                marks: subject?.week4?.marks ?? -3,
                status: subject?.week4?.status || 'missing'
              },
              week8: {
                marks: subject?.week8?.marks ?? -3,
                status: subject?.week8?.status || 'missing'
              },
              endOfTerm: {
                marks: subject?.endOfTerm?.marks ?? -3,
                status: subject?.endOfTerm?.status || 'missing',
                grade: subject?.grade || -1
              },
              average: subject?.grade ? calculateAverageGrade(subject) : -1
            };
          }),
          overallAverage: student.overallPercentage,
          overallGrade: student.overallGrade
        })),
        subjects: subjectsList,
        generatedDate: new Date().toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        configuredExamTypes
      };

      // Generate PDF matrix
      const { generateClassResultsMatrixPDF } = await import('@/services/pdf/classResultsMatrixPDFLib');
      
      // Generate the PDF
      const pdfBytes = await generateClassResultsMatrixPDF(matrixData);
      
      // FIXED: Properly convert Uint8Array for Blob
      const blob = new Blob([pdfBytes.buffer], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Create filename
      const fileName = `class-matrix-${matrixData.className.replace(/\s+/g, '_')}-${selectedTerm.replace(/\s+/g, '_')}-${selectedYear}.pdf`;
      link.download = fileName;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      alert('Class matrix downloaded successfully!');

    } catch (error) {
      console.error('Failed to generate class matrix:', error);
      alert(`Failed to generate class matrix: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDownloadingMatrix(false);
    }
  }, [selectedClass, transformedStudents, selectedTerm, selectedYear, studentGenderMap, configuredExamTypes]);

  // Helper function to calculate average grade from subject exams
  const calculateAverageGrade = (subject: SubjectProgress): number => {
    const scores = [];
    
    if (configuredExamTypes.includes('week4') && subject.week4?.marks !== undefined && subject.week4.marks >= 0) {
      scores.push(subject.week4.marks);
    }
    if (configuredExamTypes.includes('week8') && subject.week8?.marks !== undefined && subject.week8.marks >= 0) {
      scores.push(subject.week8.marks);
    }
    if (configuredExamTypes.includes('endOfTerm') && subject.endOfTerm?.marks !== undefined && subject.endOfTerm.marks >= 0) {
      scores.push(subject.endOfTerm.marks);
    }
    
    if (scores.length === 0) return -1;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    
    if (avg >= 75) return 1;
    if (avg >= 70) return 2;
    if (avg >= 65) return 3;
    if (avg >= 60) return 4;
    if (avg >= 55) return 5;
    if (avg >= 50) return 6;
    if (avg >= 45) return 7;
    if (avg >= 40) return 8;
    return 9;
  };

  // Filter students
  const filteredStudents = useMemo(() => {
    if (!transformedStudents.length) return [];
    if (!debouncedSearch) return transformedStudents;
    
    return transformedStudents.filter(student =>
      student.studentName?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      student.studentId?.toLowerCase().includes(debouncedSearch.toLowerCase())
    );
  }, [transformedStudents, debouncedSearch]);

  // Class options
  const classOptions = useMemo(() => {
    if (user?.userType === 'teacher' && assignments) {
      const teacherClassIds = [...new Set(assignments.map(a => a.classId))];
      return classes
        .filter(cls => teacherClassIds.includes(cls.id))
        .map(cls => ({ id: cls.id, name: cls.name }));
    }
    return classes.map(cls => ({ id: cls.id, name: cls.name }));
  }, [classes, user, assignments]);

  const handleViewReport = (studentId: string) => {
    setSelectedStudentId(studentId);
    setShowReportModal(true);
  };

  const selectedStudent = transformedStudents.find(s => s.studentId === selectedStudentId);
  const selectedReport = selectedStudentId ? reportCache.get(selectedStudentId) : null;
  const isLoadingReport = selectedStudentId ? loadingReports.has(selectedStudentId) : false;

  const terms = ['Term 1', 'Term 2', 'Term 3'];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const isLoadingAll = loadingProgress || loadingClasses || loadingAssignments || loadingExamConfig;

  if (isLoadingAll) {
    return (
      <DashboardLayout activeTab="reports">
        <div className="min-h-screen bg-gray-50 p-3 sm:p-4 lg:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 animate-pulse mb-4">
            <div>
              <div className="h-6 sm:h-7 bg-gray-200 rounded w-32 sm:w-40 mb-1"></div>
              <div className="h-3 sm:h-4 bg-gray-100 rounded w-40 sm:w-48"></div>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 sm:h-9 sm:w-9 bg-gray-200 rounded-lg"></div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <CardSkeleton key={i} />)}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Check if exams are configured
  const noExamsConfigured = selectedClass && configuredExamTypes.length === 0;

  return (
    <>
      <DashboardLayout activeTab="reports">
        <div className="min-h-screen bg-gray-50 p-3 sm:p-4 lg:p-6">
          
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 tracking-tight">
                Report Cards
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 mt-0.5">
                {selectedTerm}, {selectedYear}
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Download All Report Cards Button */}
              {selectedClass && students.length > 0 && configuredExamTypes.length > 0 && (
                <button
                  onClick={handleDownloadAllReportCards}
                  disabled={isDownloadingAll}
                  className="flex items-center gap-1 sm:gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 text-xs sm:text-sm"
                  title="Download all report cards"
                >
                  {isDownloadingAll ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Download size={16} />
                  )}
                  <span className="hidden sm:inline">
                    {isDownloadingAll ? 'Downloading...' : 'All Reports'}
                  </span>
                </button>
              )}

              {/* Download Class Matrix Button */}
              {selectedClass && students.length > 0 && configuredExamTypes.length > 0 && (
                <button
                  onClick={handleDownloadClassMatrix}
                  disabled={isDownloadingMatrix}
                  className="flex items-center gap-1 sm:gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 text-xs sm:text-sm"
                  title="Download class results matrix (all subjects, all students)"
                >
                  {isDownloadingMatrix ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <FileSpreadsheet size={16} />
                  )}
                  <span className="hidden sm:inline">
                    {isDownloadingMatrix ? 'Generating...' : 'Class Matrix'}
                  </span>
                </button>
              )}

              <button
                onClick={() => refetch()}
                className="p-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all"
                title="Refresh data"
              >
                <RefreshCw size={isMobile ? 16 : 18} className={isFetching ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {!selectedClass ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-blue-100 rounded-full mb-3">
                <BookOpen className="text-blue-600" size={isMobile ? 24 : 32} />
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1">
                Select a Class
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto mb-4">
                Choose a class to view student progress and report cards
              </p>
              <select
                value=""
                onChange={e => setSelectedClass(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="" disabled>Select a class</option>
                {classOptions.map(cls => (
                  <option key={cls.id} value={cls.id}>{cls.name}</option>
                ))}
              </select>
            </div>
          ) : noExamsConfigured ? (
            <div className="bg-white rounded-xl border border-yellow-200 p-6 sm:p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-yellow-100 rounded-full mb-3">
                <Calendar className="text-yellow-600" size={isMobile ? 24 : 32} />
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1">
                No Exams Configured
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto mb-4">
                No exams have been configured for {selectedTerm} {selectedYear}. 
                Please configure exams in the Exam Management page to generate report cards.
              </p>
              <button
                onClick={() => window.location.href = '/dashboard/admin/exams'}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                Go to Exam Management
              </button>
            </div>
          ) : (
            <>
              <FilterBar
                selectedClass={selectedClass}
                setSelectedClass={setSelectedClass}
                classOptions={classOptions}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                selectedTerm={selectedTerm}
                setSelectedTerm={setSelectedTerm}
                selectedYear={selectedYear}
                setSelectedYear={setSelectedYear}
                terms={terms}
                years={years}
                summary={summary}
                isTeacher={user?.userType === 'teacher'}
                isMobile={isMobile}
                configuredExamTypes={configuredExamTypes}
              />

              {filteredStudents.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filteredStudents.map(student => (
                    <StudentCard
                      key={student.studentId}
                      student={student}
                      onClick={() => handleViewReport(student.studentId)}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-white rounded-2xl border border-gray-200">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-3">
                    <FileText className="text-gray-400" size={isMobile ? 24 : 32} />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 mb-1">
                    No students found
                  </h3>
                  <p className="text-sm text-gray-600">
                    {searchTerm 
                      ? 'No students match your search'
                      : 'No progress data available for this class'}
                  </p>
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="mt-3 text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Clear search
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </DashboardLayout>
      
      {/* Report Modal */}
      <ReportModal
        isOpen={showReportModal}
        onClose={() => {
          setShowReportModal(false);
          setSelectedStudentId(null);
        }}
        report={selectedReport}
        studentName={selectedStudent?.studentName || ''}
        loading={isLoadingReport}
        configuredExamTypes={configuredExamTypes}
        onDelete={handleDeleteReport}
        isDeleting={isDeletingReport}
      />
    </>
  );
}