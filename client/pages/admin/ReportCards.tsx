// @/pages/admin/ReportCards.tsx - OPTIMIZED TABULAR FORMAT with Mobile Support and PDF Download
import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useEffect, useMemo } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { useStudentProgress, useResults } from '@/hooks/useResults';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import { useTeacherAssignments } from '@/hooks/useTeacherAssignments';
import { useAuth } from '@/hooks/useAuth';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  Search,
  Eye,
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
  ChevronRight
} from 'lucide-react';

// ==================== TYPES ====================
interface SubjectProgress {
  subjectId: string;
  subjectName: string;
  teacherName: string;
  week4: { status: 'complete' | 'missing' | 'absent'; marks?: number };
  week8: { status: 'complete' | 'missing' | 'absent'; marks?: number };
  endOfTerm: { status: 'complete' | 'missing' | 'absent'; marks?: number };
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
          <span className="font-medium text-gray-900">{progress}%</span>
        </div>
      )}
      <div className={`w-full ${heights[size]} bg-gray-200 rounded-full overflow-hidden`}>
        <div className={`h-full ${getProgressColor(progress)} transition-all duration-300`} style={{ width: `${progress}%` }} />
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
          <span className="font-medium text-gray-900">{student.completionPercentage}%</span>
        </div>
        <ProgressBar progress={student.completionPercentage} size="sm" showLabel={false} />
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

// ==================== MOBILE CARD VIEW ====================
const MobileSubjectCard = ({ subject }: { subject: ReportCardSubject }) => {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 mb-2">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium text-gray-900 text-sm">{subject.subjectName}</h4>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs ${getGradeColor(subject.grade)}`}>
          {subject.grade > 0 ? getGradeDisplay(subject.grade) : '—'}
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center p-2 bg-gray-50 rounded-lg">
          <p className="text-[10px] text-gray-500">W4</p>
          <p className="font-medium text-xs">
            {subject.week4 >= 0 ? `${subject.week4}%` : 
             subject.week4 === -1 ? 'ABS' : '—'}
          </p>
        </div>
        <div className="text-center p-2 bg-gray-50 rounded-lg">
          <p className="text-[10px] text-gray-500">W8</p>
          <p className="font-medium text-xs">
            {subject.week8 >= 0 ? `${subject.week8}%` : 
             subject.week8 === -1 ? 'ABS' : '—'}
          </p>
        </div>
        <div className="text-center p-2 bg-blue-50 rounded-lg">
          <p className="text-[10px] text-blue-600">EOT</p>
          <p className="font-medium text-xs text-blue-600">
            {subject.endOfTerm >= 0 ? `${subject.endOfTerm}%` : 
             subject.endOfTerm === -1 ? 'ABS' : '—'}
          </p>
        </div>
      </div>
      
      <div className="mt-2 text-center">
        <span className="text-xs font-medium text-gray-700">
          {getGradeDescription(subject.grade)}
        </span>
      </div>
    </div>
  );
};

// ==================== TABULAR REPORT MODAL ====================
interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: ReportCardData | null;
  studentName: string;
  loading?: boolean;
}

const ReportModal = ({ isOpen, onClose, report, studentName, loading }: ReportModalProps) => {
  const isMobile = useMediaQuery('(max-width: 640px)');

  const handleDownloadPDF = async () => {
    if (!report) return;
    try {
      const { generateReportCardPDF } = await import('@/services/pdf/reportCardPDFLib');
      const pdfBytes = await generateReportCardPDF(report);
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
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

  if (!isOpen) return null;

  // Mobile View
  if (isMobile) {
    return (
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
                    <MobileSubjectCard key={index} subject={subject} />
                  ))}
                </div>

                {/* Teacher's Comment */}
                <div className="bg-gray-50 p-3 rounded-lg mb-4">
                  <p className="text-[10px] text-gray-500 uppercase mb-1">Teacher's Comment</p>
                  <p className="text-xs text-gray-800">"{report.teachersComment}"</p>
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
    );
  }

  // Desktop View
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl">
          
          {/* Modal Header */}
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 rounded-t-2xl px-6 py-3 flex items-center justify-end gap-2">
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

                {/* Results Table - Compact */}
                <table className="w-full border-collapse mb-6 text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border border-gray-300">Subject</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border border-gray-300">W4</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border border-gray-300">W8</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border border-gray-300 bg-blue-50">EOT</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border border-gray-300 bg-blue-50">Grade</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border border-gray-300">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.subjects.map((subject, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-xs font-medium text-gray-900 border border-gray-300">
                          {subject.subjectName}
                        </td>
                        <td className="px-3 py-2 text-center text-xs border border-gray-300">
                          {subject.week4 >= 0 ? (
                            <span className="font-medium text-gray-900">{subject.week4}%</span>
                          ) : subject.week4 === -1 ? (
                            <span className="text-gray-500 italic">ABS</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center text-xs border border-gray-300">
                          {subject.week8 >= 0 ? (
                            <span className="font-medium text-gray-900">{subject.week8}%</span>
                          ) : subject.week8 === -1 ? (
                            <span className="text-gray-500 italic">ABS</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center text-xs border border-gray-300 bg-blue-50">
                          {subject.endOfTerm >= 0 ? (
                            <span className="font-bold text-blue-700">{subject.endOfTerm}%</span>
                          ) : subject.endOfTerm === -1 ? (
                            <span className="text-gray-500 italic">ABS</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center border border-gray-300 bg-blue-50">
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
                      <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold text-gray-700 border border-gray-300">
                        Overall Average:
                      </td>
                      <td colSpan={3} className="px-3 py-2 text-left text-xs font-bold text-blue-600 border border-gray-300">
                        {report.percentage}%
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
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-gray-200 border border-gray-400 rounded-full"></span>
                    <span>— = Not Entered</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-gray-500 rounded-full"></span>
                    <span>ABS = Absent</span>
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
  isMobile
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
  const { assignments, isLoading: loadingAssignments } = useTeacherAssignments(user?.id || '');
  
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedTerm, setSelectedTerm] = useState<string>('Term 1');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  
  // Cache for generated reports
  const [reportCache, setReportCache] = useState<Map<string, ReportCardData>>(new Map());
  const [loadingReports, setLoadingReports] = useState<Set<string>>(new Set());

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

  const { generateReportCard } = useResults();

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

  // Generate reports for all students when data loads
  useEffect(() => {
    const generateAllReports = async () => {
      if (!students.length || !selectedTerm || !selectedYear) return;

      const studentsToGenerate = students.filter((s: StudentProgress) => 
        !reportCache.has(s.studentId) && !loadingReports.has(s.studentId)
      );

      if (studentsToGenerate.length === 0) return;

      setLoadingReports(prev => {
        const newSet = new Set(prev);
        studentsToGenerate.forEach(s => newSet.add(s.studentId));
        return newSet;
      });

      const batchSize = 5;
      for (let i = 0; i < studentsToGenerate.length; i += batchSize) {
        const batch = studentsToGenerate.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (student: StudentProgress) => {
            try {
              const report = await generateReportCard({
                studentId: student.studentId,
                term: selectedTerm,
                year: selectedYear,
                options: {
                  includeIncomplete: true,
                  markMissing: true,
                }
              });

              if (report) {
                // Transform report to remove teacher field and add grade descriptions
                const transformedReport: ReportCardData = {
                  ...report,
                  generatedDate: report.generatedDate || new Date().toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  }),
                  subjects: report.subjects.map(s => ({
                    subjectId: s.subjectId,
                    subjectName: s.subjectName,
                    week4: s.week4,
                    week8: s.week8,
                    endOfTerm: s.endOfTerm,
                    grade: s.grade,
                    gradeDescription: getGradeDescription(s.grade)
                  }))
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
  }, [students, selectedTerm, selectedYear, generateReportCard]);

  // Transform data
  const transformedStudents = useMemo((): StudentProgress[] => {
    if (!students || students.length === 0) return [];
    return students.map((student: any) => ({
      studentId: student.studentId || '',
      studentName: student.studentName || '',
      className: student.className || '',
      classId: student.classId || '',
      form: student.form || '',
      overallPercentage: student.overallPercentage || 0,
      overallGrade: student.overallGrade || 0,
      status: student.status || 'pending',
      isComplete: student.isComplete || false,
      completionPercentage: student.completionPercentage || 0,
      subjects: Array.isArray(student.subjects) ? student.subjects.map((subject: any) => ({
        subjectId: subject.subjectId || '',
        subjectName: subject.subjectName || '',
        teacherName: subject.teacherName || '',
        week4: subject.week4 || { status: 'missing' },
        week8: subject.week8 || { status: 'missing' },
        endOfTerm: subject.endOfTerm || { status: 'missing' },
        subjectProgress: subject.subjectProgress || 0,
        grade: subject.grade
      })) : [],
      missingSubjects: student.missingSubjects || 0,
      totalSubjects: student.totalSubjects || 0
    }));
  }, [students]);

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

  const isLoadingAll = loadingProgress || loadingClasses || loadingAssignments;

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
            
            <button
              onClick={() => refetch()}
              className="p-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all self-end sm:self-auto"
              title="Refresh data"
            >
              <RefreshCw size={isMobile ? 16 : 18} className={isFetching ? 'animate-spin' : ''} />
            </button>
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
      />
    </>
  );
}