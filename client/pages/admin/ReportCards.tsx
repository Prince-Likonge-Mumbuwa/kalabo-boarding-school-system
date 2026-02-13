// @/pages/admin/ReportCards.tsx - CLEANED, PURIFIED, PERFECTED
import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useEffect, useMemo } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { useReportCards, useTeacherAssignmentsForClass } from '@/hooks/useResults';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import { useAuth } from '@/hooks/useAuth';
import {
  Download,
  Mail,
  Filter,
  Search,
  Eye,
  CheckCircle,
  XCircle,
  FileText,
  X,
  ChevronRight,
  Loader2,
  BookOpen,
  Calendar,
  AlertTriangle,
  RefreshCw,
  GraduationCap
} from 'lucide-react';

// ==================== TYPES ====================
interface SubjectResult {
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  week4: number;
  week8: number;
  endOfTerm: number;
  grade: number;
  comment: string;
  isComplete: boolean;
  missingExams: string[];
}

interface StudentReportCard {
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
  subjects: SubjectResult[];
  attendance: number;
  teachersComment: string;
  parentsEmail: string;
  generatedDate: string;
  term: string;
  year: number;
  isComplete: boolean;
  completionPercentage: number;
}

const GRADE_SYSTEM = {
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
const getGradeComment = (grade: number): string => {
  const comments: { [key: string]: string } = {
    1: 'Outstanding performance. Exceptional understanding and application of concepts.',
    2: 'Excellent work. Strong grasp of subject matter with consistent high performance.',
    3: 'Very good performance. Demonstrates thorough understanding and good application.',
    4: 'Good performance. Shows solid understanding with room for minor improvements.',
    5: 'Commendable effort. Satisfactory understanding with consistent performance.',
    6: 'Acceptable performance. Meets expectations with adequate understanding.',
    7: 'Fair performance. Basic understanding shown; needs more practice and effort.',
    8: 'Below expectations. Requires additional support and consistent effort.',
    9: 'Unsatisfactory performance. Needs immediate intervention and intensive support.',
    X: 'Student was absent for this assessment.',
  };
  return comments[grade === -1 ? 'X' : grade] || 'Performance assessment pending.';
};

const CardSkeleton = () => (
  <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
    <div className="flex items-start justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded w-32"></div>
          <div className="h-3 bg-gray-100 rounded w-24"></div>
        </div>
      </div>
      <div className="h-6 bg-gray-200 rounded w-16"></div>
    </div>
    <div className="space-y-3">
      <div className="h-4 bg-gray-200 rounded w-full"></div>
      <div className="h-3 bg-gray-100 rounded w-3/4"></div>
    </div>
  </div>
);

// ==================== REPORT DETAIL MODAL ====================
interface ReportDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportCard: StudentReportCard | null;
}

const ReportDetailModal = ({ isOpen, onClose, reportCard }: ReportDetailModalProps) => {
  if (!isOpen || !reportCard) return null;
  const gradeInfo = getGradeInfo(reportCard.grade);
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Academic Report Card</h2>
                <p className="text-gray-600 mt-1">{reportCard.term}, {reportCard.year}</p>
                {!reportCard.isComplete && (
                  <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-yellow-100 text-yellow-800 rounded-lg text-sm">
                    <AlertTriangle size={16} />
                    Incomplete Data ({reportCard.completionPercentage}% complete)
                  </div>
                )}
              </div>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6">
            <div className="text-center mb-8 border-b pb-6">
              <h1 className="text-xl font-bold uppercase">Republic of Zambia</h1>
              <h2 className="text-lg font-semibold">Ministry of Education</h2>
              <h3 className="text-lg font-semibold text-blue-600">Kalabo Boarding Secondary School</h3>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div>
                <p className="text-xs text-gray-500">Student Name</p>
                <p className="font-semibold text-gray-900">{reportCard.studentName}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Grade</p>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-white text-sm font-bold ${gradeInfo.color}`}>
                    {getGradeDisplay(reportCard.grade)}
                  </span>
                  <span className="text-sm text-gray-600">{gradeInfo.description}</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500">Class</p>
                <p className="font-semibold text-gray-900">{reportCard.className}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Position</p>
                <p className="font-semibold text-gray-900">{reportCard.position}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Student ID</p>
                <p className="font-mono text-sm text-gray-900">{reportCard.studentId}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Attendance</p>
                <p className="font-semibold text-gray-900">{reportCard.attendance}%</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Overall</p>
                <p className="text-xl font-bold text-blue-600">{reportCard.percentage}%</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Status</p>
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold ${
                  reportCard.status === 'pass' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {reportCard.status === 'pass' ? <CheckCircle size={14} /> : <XCircle size={14} />}
                  {reportCard.status === 'pass' ? 'Passed' : 'Needs Improvement'}
                </span>
              </div>
            </div>
            
            <h3 className="text-lg font-bold text-gray-900 mb-4">Academic Performance</h3>
            <div className="overflow-x-auto mb-8">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-4 py-3 text-left text-xs font-semibold text-gray-700">Subject</th>
                    <th className="border border-gray-200 px-4 py-3 text-left text-xs font-semibold text-gray-700">Teacher</th>
                    <th className="border border-gray-200 px-4 py-3 text-left text-xs font-semibold text-gray-700">Wk4</th>
                    <th className="border border-gray-200 px-4 py-3 text-left text-xs font-semibold text-gray-700">Wk8</th>
                    <th className="border border-gray-200 px-4 py-3 text-left text-xs font-semibold text-gray-700">Final</th>
                    <th className="border border-gray-200 px-4 py-3 text-left text-xs font-semibold text-gray-700">Grade</th>
                    <th className="border border-gray-200 px-4 py-3 text-left text-xs font-semibold text-gray-700">Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {reportCard.subjects.map((subject, index) => {
                    const subjectGradeInfo = getGradeInfo(subject.grade);
                    return (
                      <tr key={index} className={!subject.isComplete ? 'bg-yellow-50/50' : ''}>
                        <td className="border border-gray-200 px-4 py-3 text-sm font-medium">
                          {subject.subjectName}
                          {!subject.isComplete && (
                            <span className="ml-2 text-xs text-yellow-700">⚠️</span>
                          )}
                        </td>
                        <td className="border border-gray-200 px-4 py-3 text-sm text-gray-600">{subject.teacherName}</td>
                        <td className="border border-gray-200 px-4 py-3 text-sm">
                          {subject.week4 >= 0 ? `${subject.week4}%` : '—'}
                        </td>
                        <td className="border border-gray-200 px-4 py-3 text-sm">
                          {subject.week8 >= 0 ? `${subject.week8}%` : '—'}
                        </td>
                        <td className="border border-gray-200 px-4 py-3 text-sm font-semibold">
                          {subject.endOfTerm >= 0 ? `${subject.endOfTerm}%` : '—'}
                        </td>
                        <td className="border border-gray-200 px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-white text-xs font-bold ${subjectGradeInfo.color}`}>
                            {getGradeDisplay(subject.grade)}
                          </span>
                        </td>
                        <td className="border border-gray-200 px-4 py-3 text-xs text-gray-600">
                          {subject.comment || getGradeComment(subject.grade)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            
            <div className="mb-8">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Class Teacher's Comment</h3>
              <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r">
                <p className="text-gray-800 leading-relaxed">{reportCard.teachersComment}</p>
                <div className="mt-4 flex justify-end">
                  <div className="text-right">
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Teacher's Signature:</span>
                      <span className="border-b border-gray-400 px-8 ml-2">_________</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
              <h4 className="font-bold text-blue-900 mb-3">Grading System</h4>
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-green-600 text-white rounded font-bold">1-2</span>
                  <span className="text-blue-800">Distinction</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-blue-600 text-white rounded font-bold">3-4</span>
                  <span className="text-blue-800">Merit</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-cyan-600 text-white rounded font-bold">5-6</span>
                  <span className="text-blue-800">Credit</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-yellow-600 text-white rounded font-bold">7-8</span>
                  <span className="text-blue-800">Satisfactory</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-red-600 text-white rounded font-bold">9</span>
                  <span className="text-blue-800">Fail</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-gray-600 text-white rounded font-bold">X</span>
                  <span className="text-blue-800">Absent</span>
                </div>
              </div>
            </div>
            
            <div className="mt-8 bg-gray-50 p-4 rounded-xl border border-gray-200">
              <p className="text-xs text-gray-600">
                Report generated: {reportCard.generatedDate}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== STUDENT CARD COMPONENT ====================
interface StudentCardProps {
  reportCard: StudentReportCard;
  onViewDetails: (studentId: string) => void;
  onDownload: (studentId: string) => void;
  onEmail: (studentId: string) => void;
}

const StudentCard = ({ reportCard, onViewDetails, onDownload, onEmail }: StudentCardProps) => {
  const gradeInfo = getGradeInfo(reportCard.grade);
  
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all duration-300 hover:border-gray-300 hover:-translate-y-0.5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
            <GraduationCap size={20} className="text-blue-600" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 truncate">{reportCard.studentName}</h3>
            <p className="text-xs text-gray-500 truncate">{reportCard.studentId}</p>
          </div>
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold ${gradeInfo.color}`}>
          {getGradeDisplay(reportCard.grade)}
        </div>
      </div>
      
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-gray-500">Class</p>
          <p className="font-medium text-gray-900 text-sm">{reportCard.className}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Overall</p>
          <p className="font-bold text-blue-600">{reportCard.percentage}%</p>
        </div>
      </div>
      
      {!reportCard.isComplete && (
        <div className="mb-3 px-2 py-1.5 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
          <AlertTriangle size={14} className="text-yellow-600" />
          <span className="text-xs text-yellow-700">{reportCard.completionPercentage}% complete</span>
        </div>
      )}
      
      <div className="flex items-center gap-2">
        <button
          onClick={() => onViewDetails(reportCard.studentId)}
          className="flex-1 py-2.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-2 text-sm font-medium"
        >
          <Eye size={16} />
          View
        </button>
        <button
          onClick={() => onDownload(reportCard.studentId)}
          className="p-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          title="Download report"
        >
          <Download size={16} />
        </button>
        <button
          onClick={() => onEmail(reportCard.studentId)}
          className="p-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          title="Email to parents"
        >
          <Mail size={16} />
        </button>
      </div>
    </div>
  );
};

// ==================== MAIN COMPONENT ====================
export default function ReportCards() {
  const { user } = useAuth();
  const { classes, isLoading: loadingClasses } = useSchoolClasses();
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedTerm, setSelectedTerm] = useState<string>('Term 1');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const debouncedSearch = useDebounce(searchTerm, 300);

  // Get teacher assignments for selected class
  const { assignments: classTeacherAssignments } = useTeacherAssignmentsForClass(
    selectedClass !== 'all' ? selectedClass : undefined
  );

  // Get learners for selected class
  const { learners } = useSchoolLearners(selectedClass !== 'all' ? selectedClass : undefined);

  // Automatically select class for teachers
  useEffect(() => {
    if (user?.userType === 'teacher' && classes.length > 0 && selectedClass === 'all') {
      const teacherClass = classes.find(cls =>
        cls.teachers?.includes(user.id) || cls.formTeacherId === user.id
      );
      if (teacherClass) {
        setSelectedClass(teacherClass.id);
      }
    }
  }, [classes, user, selectedClass]);

  // Get unique subjects for selected class
  const subjectsInClass = useMemo(() => {
    if (!classTeacherAssignments.length) return [];
    const subjectMap = new Map();
    classTeacherAssignments.forEach(a => {
      subjectMap.set(a.subjectId || a.subject, {
        name: a.subject,
        id: a.subjectId || a.subject
      });
    });
    return Array.from(subjectMap.values());
  }, [classTeacherAssignments]);

  // Fetch report cards - AUTOMATICALLY GENERATED, NO GENERATE BUTTON NEEDED
  const {
    reportCards = [],
    isLoading,
    refetch,
  } = useReportCards({
    classId: selectedClass !== 'all' ? selectedClass : undefined,
    term: selectedTerm,
    year: selectedYear,
    includeIncomplete: true, // Always include incomplete
    markMissing: true, // Always mark missing data
  });

  // Filter report cards - ONLY SEARCH, CLASS, TERM, YEAR
  const filteredRecords = useMemo(() => {
    if (!reportCards || reportCards.length === 0) return [];
    return reportCards.filter(record => {
      const matchesSearch = !debouncedSearch ||
        record.studentName.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        record.studentId.toLowerCase().includes(debouncedSearch.toLowerCase());
      const matchesClass = selectedClass === 'all' || record.classId === selectedClass;
      return matchesSearch && matchesClass;
    });
  }, [reportCards, debouncedSearch, selectedClass]);

  // Class options for filter
  const classOptions = useMemo(() => {
    const uniqueClasses = Array.from(new Set(
      (reportCards || []).map(r => ({ id: r.classId, name: r.className }))
    ));
    const allClasses = [...uniqueClasses];
    classes.forEach(cls => {
      if (!allClasses.some(c => c.id === cls.id)) {
        allClasses.push({ id: cls.id, name: cls.name });
      }
    });
    return allClasses;
  }, [reportCards, classes]);

  // Handle actions
  const handleViewDetails = (studentId: string) => {
    setSelectedStudent(studentId);
    setShowReportModal(true);
  };

  const handleDownload = (studentId: string) => {
    const student = reportCards?.find(s => s.studentId === studentId);
    // In a real implementation, this would trigger PDF download
    console.log(`Downloading report for ${student?.studentName}`);
  };

  const handleEmail = (studentId: string) => {
    const student = reportCards?.find(s => s.studentId === studentId);
    // In a real implementation, this would send email
    console.log(`Emailing report to ${student?.parentsEmail}`);
  };

  const handleBatchDownload = () => {
    console.log(`Downloading ${filteredRecords.length} reports...`);
  };

  const handleBatchEmail = () => {
    console.log(`Emailing ${filteredRecords.length} reports...`);
  };

  const selectedReportCard = reportCards?.find(s => s.studentId === selectedStudent);

  const terms = ['Term 1', 'Term 2', 'Term 3'];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const isLoadingAll = isLoading || loadingClasses;

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
          
          {/* ===== HEADER - Clean, minimal ===== */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                Report Cards
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                {selectedTerm}, {selectedYear} • {filteredRecords.length} reports available
              </p>
            </div>
            
            {/* ===== ACTION BUTTONS - Icon only, perfectly crafted ===== */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleBatchDownload}
                disabled={filteredRecords.length === 0}
                className="p-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title="Download all reports"
              >
                <Download size={18} />
                <span className="sr-only">Download all</span>
              </button>
              <button
                onClick={handleBatchEmail}
                disabled={filteredRecords.length === 0}
                className="p-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title="Email all reports"
              >
                <Mail size={18} />
                <span className="sr-only">Email all</span>
              </button>
              <button
                onClick={() => refetch()}
                className="p-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all"
                title="Refresh data"
              >
                <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
                <span className="sr-only">Refresh</span>
              </button>
            </div>
          </div>

          {/* ===== FILTERS - ONLY Search, Class, Term, Year ===== */}
          <div className="mb-8 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              
              {/* Search */}
              <div className="md:col-span-1">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Search students
                </label>
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Name or ID..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                </div>
              </div>
              
              {/* Class Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  <BookOpen size={14} className="inline mr-1" />
                  Class
                </label>
                <select
                  value={selectedClass}
                  onChange={e => setSelectedClass(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                >
                  <option value="all">All Classes</option>
                  {classOptions.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>
              </div>
              
              {/* Term Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Term
                </label>
                <select
                  value={selectedTerm}
                  onChange={e => setSelectedTerm(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                >
                  {terms.map(term => (
                    <option key={term} value={term}>{term}</option>
                  ))}
                </select>
              </div>
              
              {/* Year Filter */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  <Calendar size={14} className="inline mr-1" />
                  Year
                </label>
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(Number(e.target.value))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                >
                  {years.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {/* Active filter indicator */}
            {(searchTerm || selectedClass !== 'all') && (
              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2 text-xs">
                <span className="text-gray-500">Active filters:</span>
                {searchTerm && (
                  <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-md">
                    Search: "{searchTerm}"
                  </span>
                )}
                {selectedClass !== 'all' && (
                  <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded-md">
                    Class: {classOptions.find(c => c.id === selectedClass)?.name || selectedClass}
                  </span>
                )}
                {(searchTerm || selectedClass !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setSelectedClass('all');
                    }}
                    className="text-blue-600 hover:text-blue-800 font-medium ml-1"
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ===== REPORT CARDS GRID - Automatically appears, no generate button ===== */}
          {filteredRecords.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredRecords.map((reportCard) => (
                <StudentCard
                  key={reportCard.studentId}
                  reportCard={reportCard}
                  onViewDetails={handleViewDetails}
                  onDownload={handleDownload}
                  onEmail={handleEmail}
                />
              ))}
            </div>
          ) : (
            /* ===== EMPTY STATE - Clean, informative ===== */
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-200 shadow-sm">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-gray-100 rounded-full mb-4">
                <FileText className="text-gray-400" size={32} />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No report cards available
              </h3>
              <p className="text-gray-600 max-w-md mx-auto text-sm">
                {reportCards.length === 0
                  ? `No results have been entered for ${selectedTerm} ${selectedYear}.`
                  : 'No reports match your current search or filter criteria.'}
              </p>
              {reportCards.length === 0 && selectedClass !== 'all' && (
                <div className="mt-4 text-sm text-gray-500">
                  <p>Teachers need to enter results before reports can be generated.</p>
                </div>
              )}
              {reportCards.length > 0 && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedClass('all');
                  }}
                  className="mt-4 px-4 py-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* ===== FOOTER - Minimal ===== */}
          {filteredRecords.length > 0 && (
            <div className="mt-6 text-xs text-gray-500 text-center sm:text-left">
              Showing {filteredRecords.length} of {reportCards.length} reports
              {filteredRecords.filter(r => !r.isComplete).length > 0 && (
                <span className="ml-2 text-yellow-600">
                  • {filteredRecords.filter(r => !r.isComplete).length} incomplete
                </span>
              )}
            </div>
          )}
        </div>
      </DashboardLayout>
      
      {/* ===== MODALS ===== */}
      {selectedReportCard && (
        <ReportDetailModal
          isOpen={showReportModal}
          onClose={() => {
            setShowReportModal(false);
            setSelectedStudent(null);
          }}
          reportCard={selectedReportCard}
        />
      )}
    </>
  );
}