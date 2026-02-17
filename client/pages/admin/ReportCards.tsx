// @/pages/admin/ReportCards.tsx - Complete Updated Version
import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useEffect, useMemo } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { useStudentProgress, useResults } from '@/hooks/useResults';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import { useTeacherAssignments } from '@/hooks/useTeacherAssignments';
import { useAuth } from '@/hooks/useAuth';
import {
  Download,
  Mail,
  Search,
  Eye,
  CheckCircle,
  XCircle,
  FileText,
  X,
  BookOpen,
  Calendar,
  AlertTriangle,
  RefreshCw,
  GraduationCap,
  Clock,
  Award,
  TrendingUp,
  TrendingDown,
  Minus,
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

interface StudentProgressSummary {
  total: number;
  complete: number;
  incomplete: number;
  averageCompletion: number;
  passCount: number;
  failCount: number;
  pendingCount: number;
}

const GRADE_SYSTEM: Record<number | 'X', { min: number; max: number; description: string; color: string }> = {
  1: { min: 75, max: 100, description: 'Distinction', color: 'bg-gradient-to-r from-green-500 to-emerald-600' },
  2: { min: 70, max: 74, description: 'Distinction', color: 'bg-gradient-to-r from-green-400 to-green-500' },
  3: { min: 65, max: 69, description: 'Merit', color: 'bg-gradient-to-r from-blue-500 to-blue-600' },
  4: { min: 60, max: 64, description: 'Merit', color: 'bg-gradient-to-r from-blue-400 to-blue-500' },
  5: { min: 55, max: 59, description: 'Credit', color: 'bg-gradient-to-r from-cyan-400 to-cyan-500' },
  6: { min: 50, max: 54, description: 'Credit', color: 'bg-gradient-to-r from-cyan-300 to-cyan-400' },
  7: { min: 45, max: 49, description: 'Satisfactory', color: 'bg-gradient-to-r from-yellow-400 to-yellow-500' },
  8: { min: 40, max: 44, description: 'Satisfactory', color: 'bg-gradient-to-r from-orange-400 to-orange-500' },
  9: { min: 0, max: 39, description: 'Unsatisfactory', color: 'bg-gradient-to-r from-red-400 to-red-500' },
  X: { min: -1, max: -1, description: 'Absent', color: 'bg-gradient-to-r from-gray-400 to-gray-500' },
};

const getGradeDisplay = (grade: number): string => grade === -1 ? 'X' : grade.toString();
const getGradeInfo = (grade: number) => GRADE_SYSTEM[grade === -1 ? 'X' : grade] || GRADE_SYSTEM[9];

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
const ProgressBar = ({ 
  progress, 
  size = 'md',
  showLabel = true,
  color 
}: { 
  progress: number; 
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  color?: string;
}) => {
  const getProgressColor = (p: number) => {
    if (color) return color;
    if (p >= 75) return 'bg-green-500';
    if (p >= 50) return 'bg-blue-500';
    if (p >= 25) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const heights = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3',
  };

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-gray-600">Progress</span>
          <span className="font-medium text-gray-900">{progress}%</span>
        </div>
      )}
      <div className={`w-full ${heights[size]} bg-gray-200 rounded-full overflow-hidden`}>
        <div 
          className={`h-full ${getProgressColor(progress)} transition-all duration-300`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

// ==================== SUBJECT PROGRESS ROW ====================
const SubjectProgressRow = ({ subject }: { subject: SubjectProgress }) => {
  const getExamStatusColor = (status: string) => {
    switch(status) {
      case 'complete': return 'text-green-600 bg-green-50';
      case 'absent': return 'text-gray-600 bg-gray-50';
      default: return 'text-red-600 bg-red-50';
    }
  };

  const getExamStatusIcon = (status: string) => {
    switch(status) {
      case 'complete': return <CheckCircle size={12} className="text-green-600" />;
      case 'absent': return <XCircle size={12} className="text-gray-600" />;
      default: return <AlertTriangle size={12} className="text-red-600" />;
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <span className="text-sm font-medium text-gray-900">{subject.subjectName}</span>
          <span className="ml-2 text-xs text-gray-500">({subject.teacherName})</span>
        </div>
        <span className="text-xs font-medium text-gray-900">{subject.subjectProgress}%</span>
      </div>
      
      {/* Subject Progress Bar */}
      <ProgressBar progress={subject.subjectProgress} size="sm" showLabel={false} />
      
      {/* Exam Status Icons */}
      <div className="flex items-center gap-3 mt-1">
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${getExamStatusColor(subject.week4.status)}`}>
          {getExamStatusIcon(subject.week4.status)}
          <span>W4</span>
          {subject.week4.marks && <span className="ml-1 font-medium">{subject.week4.marks}%</span>}
        </div>
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${getExamStatusColor(subject.week8.status)}`}>
          {getExamStatusIcon(subject.week8.status)}
          <span>W8</span>
          {subject.week8.marks && <span className="ml-1 font-medium">{subject.week8.marks}%</span>}
        </div>
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${getExamStatusColor(subject.endOfTerm.status)}`}>
          {getExamStatusIcon(subject.endOfTerm.status)}
          <span>EOT</span>
          {subject.endOfTerm.marks && <span className="ml-1 font-medium">{subject.endOfTerm.marks}%</span>}
        </div>
      </div>
    </div>
  );
};

// ==================== CARD SKELETON ====================
const CardSkeleton = () => (
  <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
    <div className="flex items-start justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded w-32"></div>
          <div className="h-3 bg-gray-100 rounded w-24"></div>
        </div>
      </div>
      <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
    </div>
    <div className="space-y-4">
      <div className="h-4 bg-gray-200 rounded w-full"></div>
      <div className="h-2 bg-gray-200 rounded w-full"></div>
      <div className="space-y-2">
        <div className="h-3 bg-gray-100 rounded w-3/4"></div>
        <div className="h-3 bg-gray-100 rounded w-2/3"></div>
      </div>
    </div>
  </div>
);

// ==================== STUDENT CARD COMPONENT ====================
interface StudentCardProps {
  student: StudentProgress;
  onViewDetails: (studentId: string) => void;
}

const StudentCard = ({ student, onViewDetails }: StudentCardProps) => {
  const gradeInfo = getGradeInfo(student.overallGrade);
  
  // Get top 3 subjects for display
  const topSubjects = useMemo(() => {
    return [...student.subjects]
      .sort((a, b) => b.subjectProgress - a.subjectProgress)
      .slice(0, 3);
  }, [student.subjects]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all duration-300 hover:border-gray-300 hover:-translate-y-0.5">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
            <GraduationCap size={20} className="text-blue-600" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 truncate">{student.studentName}</h3>
            <p className="text-xs text-gray-500 truncate">{student.studentId}</p>
          </div>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold ${gradeInfo.color}`}>
          {student.overallGrade > 0 ? getGradeDisplay(student.overallGrade) : '—'}
        </div>
      </div>
      
      {/* Class and Status */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-gray-500">Class</p>
          <p className="font-medium text-gray-900 text-sm">{student.className}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Overall</p>
          <p className="font-bold text-blue-600">
            {student.overallPercentage > 0 ? `${student.overallPercentage}%` : '—'}
          </p>
        </div>
      </div>
      
      {/* Overall Progress Bar */}
      <div className="mb-4">
        <ProgressBar progress={student.completionPercentage} size="md" />
      </div>
      
      {/* Status Badge */}
      <div className="mb-4">
        <StatusBadge status={student.status} />
      </div>
      
      {/* Subject Progress - Top 3 */}
      <div className="space-y-4 mb-4">
        <p className="text-xs font-medium text-gray-600 flex items-center gap-1">
          <BookOpen size={14} />
          Subject Progress
        </p>
        {topSubjects.map((subject, idx) => (
          <div key={idx} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-700 truncate max-w-[150px]">{subject.subjectName}</span>
              <span className="font-medium text-gray-900">{subject.subjectProgress}%</span>
            </div>
            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full ${
                  subject.subjectProgress === 100 ? 'bg-green-500' :
                  subject.subjectProgress >= 66 ? 'bg-blue-500' :
                  subject.subjectProgress >= 33 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${subject.subjectProgress}%` }}
              />
            </div>
          </div>
        ))}
        {student.subjects.length > 3 && (
          <p className="text-xs text-gray-500 mt-1">
            +{student.subjects.length - 3} more subjects
          </p>
        )}
      </div>
      
      {/* Missing Subjects Indicator */}
      {student.missingSubjects > 0 && (
        <div className="mb-4 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
          <AlertTriangle size={14} className="text-yellow-600" />
          <span className="text-xs text-yellow-700">
            {student.missingSubjects} subject{student.missingSubjects > 1 ? 's' : ''} incomplete
          </span>
        </div>
      )}
      
      {/* Action Button */}
      <button
        onClick={() => onViewDetails(student.studentId)}
        className="w-full py-2.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
      >
        <Eye size={16} />
        View Details
      </button>
    </div>
  );
};

// ==================== REPORT DETAIL MODAL ====================
interface ReportDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: StudentProgress | null;
  term: string;
  year: number;
  totalLearners?: number; // Total learners in class for position
}

const ReportDetailModal = ({ 
  isOpen, 
  onClose, 
  student, 
  term, 
  year,
  totalLearners = 0
}: ReportDetailModalProps) => {
  const { generateReportCard } = useResults();
  const [fullReport, setFullReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && student) {
      setLoading(true);
      generateReportCard({
        studentId: student.studentId,
        term: term,
        year: year,
        options: {
          includeIncomplete: true,
          markMissing: true,
        }
      })
        .then(report => {
          setFullReport(report);
        })
        .catch(error => {
          console.error('Error generating report:', error);
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, student, term, year, generateReportCard]);

  if (!isOpen || !student) return null;

  // Format position text (e.g., "5 out of 30")
  const positionText = fullReport?.position 
    ? `${fullReport.position} out of ${totalLearners || '—'}`
    : '—';

  // Determine gender from student ID (assuming pattern: B for boys, G for girls)
  const gender = student.studentId?.startsWith('B') ? 'Male' : 
                 student.studentId?.startsWith('G') ? 'Female' : '—';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
          
          {/* Loading State */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {/* 1. CENTERED HEADING */}
              <div className="text-center py-6 border-b border-gray-200 bg-gradient-to-b from-gray-50 to-white">
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                  MINISTRY OF EDUCATION
                </h1>
                <h2 className="text-xl font-semibold text-gray-800 mt-1">
                  KALABO BOARDING SECONDARY SCHOOL
                </h2>
                <h3 className="text-lg font-medium text-blue-600 mt-2 uppercase tracking-wider">
                  LEARNER REPORT CARD
                </h3>
              </div>

              {/* 2. STUDENT INFO DIV */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-6 bg-gray-50 border-b border-gray-200">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Name</p>
                  <p className="font-semibold text-gray-900">{student.studentName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Class</p>
                  <p className="font-semibold text-gray-900">{student.className}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Position</p>
                  <p className="font-semibold text-blue-600">{positionText}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Gender</p>
                  <p className="font-semibold text-gray-900">{gender}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Term/Year</p>
                  <p className="font-semibold text-gray-900">{term} {year}</p>
                </div>
              </div>

              {/* 3. SUBJECTS TABLE */}
              <div className="p-6 overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border border-gray-300">
                        Subject
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 border border-gray-300">
                        Week 4
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 border border-gray-300">
                        Week 8
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 border border-gray-300">
                        End of Term
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 border border-gray-300 bg-blue-50">
                        Grade
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {student.subjects.map((subject, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 border border-gray-300">
                          {subject.subjectName}
                        </td>
                        <td className="px-4 py-3 text-center text-sm border border-gray-300">
                          {subject.week4.marks ? (
                            <span className="font-medium text-gray-900">{subject.week4.marks}%</span>
                          ) : (
                            <span className="text-gray-400 italic">
                              {subject.week4.status === 'absent' ? 'ABS' : '—'}
                            </span>
                          )}
                          {subject.week4.status !== 'complete' && subject.week4.status !== 'absent' && (
                            <span className="ml-1 text-xs text-red-500">(M)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-sm border border-gray-300">
                          {subject.week8.marks ? (
                            <span className="font-medium text-gray-900">{subject.week8.marks}%</span>
                          ) : (
                            <span className="text-gray-400 italic">
                              {subject.week8.status === 'absent' ? 'ABS' : '—'}
                            </span>
                          )}
                          {subject.week8.status !== 'complete' && subject.week8.status !== 'absent' && (
                            <span className="ml-1 text-xs text-red-500">(M)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center text-sm border border-gray-300">
                          {subject.endOfTerm.marks ? (
                            <span className="font-medium text-gray-900">{subject.endOfTerm.marks}%</span>
                          ) : (
                            <span className="text-gray-400 italic">
                              {subject.endOfTerm.status === 'absent' ? 'ABS' : '—'}
                            </span>
                          )}
                          {subject.endOfTerm.status !== 'complete' && subject.endOfTerm.status !== 'absent' && (
                            <span className="ml-1 text-xs text-red-500">(M)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center border border-gray-300 bg-blue-50">
                          {subject.grade ? (
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-white font-bold ${
                              subject.grade <= 2 ? 'bg-green-600' :
                              subject.grade <= 4 ? 'bg-blue-600' :
                              subject.grade <= 6 ? 'bg-cyan-600' :
                              subject.grade <= 8 ? 'bg-yellow-600' : 'bg-red-600'
                            }`}>
                              {getGradeDisplay(subject.grade)}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  
                  {/* Summary Row */}
                  <tfoot>
                    <tr className="bg-gray-50">
                      <td className="px-4 py-3 text-sm font-semibold text-gray-700 border border-gray-300" colSpan={4}>
                        Overall Average
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-blue-600 border border-gray-300">
                        {student.overallPercentage > 0 ? `${student.overallPercentage}%` : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>

                {/* Status Indicators Legend */}
                <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                    <span>M = Missing</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-gray-500 rounded-full"></span>
                    <span>ABS = Absent</span>
                  </span>
                </div>
              </div>

              {/* Teacher's Comment Section (Optional) */}
              {fullReport?.teachersComment && (
                <div className="px-6 pb-6">
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Teacher's Comment</p>
                    <p className="text-sm text-gray-800 italic">"{fullReport.teachersComment}"</p>
                  </div>
                </div>
              )}

              {/* Footer with generation date */}
              <div className="px-6 py-4 border-t border-gray-200 text-xs text-gray-400 text-right">
                Generated: {new Date().toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ==================== MAIN COMPONENT ====================
export default function ReportCards() {
  const { user } = useAuth();
  const { classes, isLoading: loadingClasses } = useSchoolClasses();
  const { learners, isLoading: loadingLearners } = useSchoolLearners();
  const { assignments, isLoading: loadingAssignments } = useTeacherAssignments(user?.id || '');
  
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedTerm, setSelectedTerm] = useState<string>('Term 1');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  
  // Use the student progress hook - FIXED: No 'data' property, returns students and summary directly
  const {
    students = [],
    summary,
    isLoading: loadingProgress,
    isFetching,
    isError,
    error,
    refetch
  } = useStudentProgress({
    classId: selectedClass,
    term: selectedTerm,
    year: selectedYear,
  });

  // Log the data for debugging
  useEffect(() => {
    console.log('Student Progress Students:', students);
    console.log('Student Progress Summary:', summary);
    if (isError) {
      console.error('Error fetching student progress:', error);
    }
  }, [students, summary, isError, error]);

  const debouncedSearch = useDebounce(searchTerm, 300);

  // Automatically select class for teachers
  useEffect(() => {
    if (user?.userType === 'teacher' && classes.length > 0 && !selectedClass) {
      // Get teacher's assigned classes
      if (assignments && assignments.length > 0) {
        // Get unique class IDs from assignments
        const teacherClassIds = [...new Set(assignments.map(a => a.classId))];
        // Find the first class that matches
        const teacherClass = classes.find(cls => teacherClassIds.includes(cls.id));
        if (teacherClass) {
          setSelectedClass(teacherClass.id);
        }
      }
    }
  }, [classes, user, assignments, selectedClass]);

  // Transform the data from the hook into our expected format
  const transformedStudents = useMemo((): StudentProgress[] => {
    if (!students || students.length === 0) {
      return [];
    }

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

  // Filter students by search
  const filteredStudents = useMemo(() => {
    if (!transformedStudents || transformedStudents.length === 0) return [];
    if (!debouncedSearch) return transformedStudents;
    
    return transformedStudents.filter(student =>
      student.studentName?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      student.studentId?.toLowerCase().includes(debouncedSearch.toLowerCase())
    );
  }, [transformedStudents, debouncedSearch]);

  // Class options for filter
  const classOptions = useMemo(() => {
    // For teachers, only show classes they're assigned to
    if (user?.userType === 'teacher' && assignments) {
      const teacherClassIds = [...new Set(assignments.map(a => a.classId))];
      return classes
        .filter(cls => teacherClassIds.includes(cls.id))
        .map(cls => ({
          id: cls.id,
          name: cls.name
        }));
    }
    
    // For admin, show all classes
    return classes.map(cls => ({
      id: cls.id,
      name: cls.name
    }));
  }, [classes, user, assignments]);

  const handleViewDetails = (studentId: string) => {
    setSelectedStudent(studentId);
    setShowReportModal(true);
  };

  const selectedStudentData = transformedStudents.find(s => s.studentId === selectedStudent);

  const terms = ['Term 1', 'Term 2', 'Term 3'];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const isLoadingAll = loadingProgress || loadingClasses || loadingLearners || loadingAssignments;

  if (isLoadingAll) {
    return (
      <DashboardLayout activeTab="reports">
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-pulse mb-8">
            <div>
              <div className="h-8 bg-gray-200 rounded w-48 mb-2"></div>
              <div className="h-4 bg-gray-100 rounded w-64"></div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-gray-200 rounded-lg"></div>
              <div className="h-10 w-10 bg-gray-200 rounded-lg"></div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <>
      <DashboardLayout activeTab="reports">
        <div className="min-h-screen bg-gray-50 p-4 sm:p-6 lg:p-8">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                Student Progress
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {selectedTerm}, {selectedYear}
              </p>
            </div>
            
            {/* Refresh button */}
            <button
              onClick={() => refetch()}
              className="p-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all self-end sm:self-auto"
              title="Refresh data"
            >
              <RefreshCw size={18} className={isFetching ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Class Selection - MUST select a class first */}
          {!selectedClass ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 rounded-full mb-4">
                <BookOpen className="text-blue-600" size={32} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Select a Class
              </h3>
              <p className="text-gray-600 max-w-md mx-auto mb-6">
                Choose a class to view student progress and report cards
              </p>
              <select
                value=""
                onChange={e => setSelectedClass(e.target.value)}
                className="mx-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="" disabled>Select a class</option>
                {classOptions.map(cls => (
                  <option key={cls.id} value={cls.id}>{cls.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <>
              {/* Filters Bar */}
              <div className="mb-6 bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Class selector (if admin) - show but disable if teacher */}
                  <select
                    value={selectedClass}
                    onChange={e => setSelectedClass(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    disabled={user?.userType === 'teacher'}
                  >
                    {classOptions.map(cls => (
                      <option key={cls.id} value={cls.id}>{cls.name}</option>
                    ))}
                  </select>
                  
                  {/* Search */}
                  <div className="flex-1 relative">
                    <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search students by name or ID..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  
                  {/* Term selector */}
                  <select
                    value={selectedTerm}
                    onChange={e => setSelectedTerm(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    {terms.map(term => (
                      <option key={term} value={term}>{term}</option>
                    ))}
                  </select>
                  
                  {/* Year selector */}
                  <select
                    value={selectedYear}
                    onChange={e => setSelectedYear(Number(e.target.value))}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    {years.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
                
                {/* Summary stats */}
                {summary && summary.total > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Total Students:</span>
                      <span className="ml-2 font-medium text-gray-900">{summary.total}</span>
                    </div>
                    <div>
                      <span className="text-green-600">Complete:</span>
                      <span className="ml-2 font-medium text-gray-900">{summary.complete}</span>
                    </div>
                    <div>
                      <span className="text-yellow-600">In Progress:</span>
                      <span className="ml-2 font-medium text-gray-900">{summary.incomplete}</span>
                    </div>
                    <div>
                      <span className="text-blue-600">Avg Completion:</span>
                      <span className="ml-2 font-medium text-gray-900">{summary.averageCompletion}%</span>
                    </div>
                    <div>
                      <span className="text-green-600">Pass:</span>
                      <span className="ml-2 font-medium text-gray-900">{summary.passCount}</span>
                    </div>
                    <div>
                      <span className="text-red-600">Fail:</span>
                      <span className="ml-2 font-medium text-gray-900">{summary.failCount}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Students Grid */}
              {filteredStudents.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredStudents.map(student => (
                    <StudentCard
                      key={student.studentId}
                      student={student}
                      onViewDetails={handleViewDetails}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
                  <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-4">
                    <FileText className="text-gray-400" size={32} />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    No students found
                  </h3>
                  <p className="text-gray-600">
                    {searchTerm 
                      ? 'No students match your search criteria'
                      : students?.length === 0 
                        ? 'No progress data available for this class'
                        : 'No students are enrolled in this class'}
                  </p>
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="mt-4 px-4 py-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
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
      
      {/* Detail Modal */}
      {selectedStudentData && (
        <ReportDetailModal
          isOpen={showReportModal}
          onClose={() => {
            setShowReportModal(false);
            setSelectedStudent(null);
          }}
          student={selectedStudentData}
          term={selectedTerm}
          year={selectedYear}
          totalLearners={transformedStudents.length}
        />
      )}
    </>
  );
}