import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useEffect, useMemo } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import {
  Download,
  Mail,
  Filter,
  MoreVertical,
  Search,
  Printer,
  Eye,
  CheckCircle,
  XCircle,
  FileText,
  User,
  BookOpen,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  X,
  Share2,
  Star,
  AlertCircle,
  Loader2,
  BarChart3,
  Calendar,
  Award,
  Target,
  Clock,
  Edit
} from 'lucide-react';

// ==================== TYPES & INTERFACES ====================
interface SubjectResult {
  name: string;
  marks: number;
  total: number;
  percentage: number;
  grade: string;
  teacher: string;
}

interface StudentRecord {
  id: string;
  studentName: string;
  studentId: string;
  className: string;
  form: string;
  totalMarks: number;
  percentage: number;
  grade: string;
  gradePoints: number;
  status: 'pass' | 'fail';
  position: number;
  improvement: 'improved' | 'declined' | 'stable';
  subjects: SubjectResult[];
  attendance: number;
  remarks: string;
  parentsEmail: string;
  generatedDate: string;
}

// ==================== SKELETON COMPONENTS ====================
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
    <div className="flex gap-2 mt-4">
      <div className="h-6 bg-gray-200 rounded w-16"></div>
      <div className="h-6 bg-gray-200 rounded w-16"></div>
      <div className="h-6 bg-gray-200 rounded w-16"></div>
    </div>
  </div>
);

// ==================== MODAL COMPONENTS ====================
interface ReportDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: StudentRecord | null;
  onAction: (action: 'download' | 'email' | 'print' | 'share', studentId: string) => void;
}

const ReportDetailModal = ({ isOpen, onClose, student, onAction }: ReportDetailModalProps) => {
  if (!isOpen || !student) return null;

  const getGradeColor = (grade: string) => {
    const colors: { [key: string]: string } = {
      'A+': 'bg-gradient-to-r from-green-500 to-emerald-500',
      'A': 'bg-gradient-to-r from-green-400 to-green-500',
      'A-': 'bg-gradient-to-r from-green-300 to-green-400',
      'B+': 'bg-gradient-to-r from-blue-400 to-blue-500',
      'B': 'bg-gradient-to-r from-blue-300 to-blue-400',
      'B-': 'bg-gradient-to-r from-blue-200 to-blue-300',
      'C+': 'bg-gradient-to-r from-yellow-400 to-yellow-500',
      'C': 'bg-gradient-to-r from-yellow-300 to-yellow-400',
      'C-': 'bg-gradient-to-r from-yellow-200 to-yellow-300',
      'D+': 'bg-gradient-to-r from-orange-400 to-orange-500',
      'D': 'bg-gradient-to-r from-orange-300 to-orange-400',
      'D-': 'bg-gradient-to-r from-orange-200 to-orange-300',
      'F': 'bg-gradient-to-r from-red-400 to-red-500',
    };
    return colors[grade] || 'bg-gradient-to-r from-gray-400 to-gray-500';
  };

  const getImprovementIcon = (improvement: StudentRecord['improvement']) => {
    switch (improvement) {
      case 'improved': return <TrendingUp size={20} className="text-green-500" />;
      case 'declined': return <TrendingDown size={20} className="text-red-500" />;
      default: return <Star size={20} className="text-yellow-500" />;
    }
  };

  const getImprovementColor = (improvement: StudentRecord['improvement']) => {
    switch (improvement) {
      case 'improved': return 'bg-green-100 text-green-800 border-green-200';
      case 'declined': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop with touch dismissal */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal Container */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
          {/* Modal Header */}
          <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center text-blue-600 shadow-sm">
                  <Award size={28} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Academic Report Card</h2>
                  <p className="text-gray-600">Term 2, 2024 • Detailed Performance Analysis</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/50 rounded-lg transition-colors"
                aria-label="Close modal"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          {/* Modal Content - Scrollable */}
          <div className="flex-1 overflow-y-auto">
            {/* Student Profile Section */}
            <div className="p-6 border-b border-gray-100">
              <div className="flex flex-col sm:flex-row sm:items-start gap-6">
                {/* Avatar and Basic Info */}
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white shadow-lg">
                    <User size={36} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-2xl font-bold text-gray-900">{student.studentName}</h3>
                    <div className="flex flex-wrap gap-3 mt-2">
                      <div className="flex items-center gap-2">
                        <BookOpen size={16} className="text-gray-400" />
                        <span className="text-gray-600">{student.className}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText size={16} className="text-gray-400" />
                        <span className="text-gray-600">ID: {student.studentId}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar size={16} className="text-gray-400" />
                        <span className="text-gray-600">Generated: {student.generatedDate}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Grade Badge */}
                <div className={`px-6 py-3 rounded-xl text-white font-bold text-2xl shadow-lg ${getGradeColor(student.grade)}`}>
                  {student.grade}
                </div>
              </div>
            </div>

            {/* Performance Summary */}
            <div className="p-6 border-b border-gray-100 bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Performance Summary</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Total Marks</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">
                        {student.totalMarks}<span className="text-lg text-gray-500">/500</span>
                      </p>
                    </div>
                    <Target size={24} className="text-blue-500" />
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Percentage</p>
                      <p className="text-2xl font-bold text-blue-600 mt-1">
                        {student.percentage}%
                      </p>
                    </div>
                    <BarChart3 size={24} className="text-blue-500" />
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Position</p>
                      <p className="text-2xl font-bold text-purple-600 mt-1">
                        #{student.position}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {getImprovementIcon(student.improvement)}
                      <span className={`text-xs px-2 py-1 rounded-full ${getImprovementColor(student.improvement)}`}>
                        {student.improvement}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Attendance</p>
                      <p className="text-2xl font-bold text-green-600 mt-1">
                        {student.attendance}%
                      </p>
                    </div>
                    <Clock size={24} className="text-green-500" />
                  </div>
                </div>
              </div>
            </div>

            {/* Subject Performance Table */}
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900">Subject Performance</h3>
                <span className="text-sm text-gray-600">{student.subjects.length} subjects</span>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Subject</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Teacher</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Marks</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Grade</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Performance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {student.subjects.map((subject, index) => (
                      <tr key={index} className="hover:bg-gray-50/50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{subject.name}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{subject.teacher}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">
                            {subject.marks}<span className="text-gray-500">/{subject.total}</span>
                          </div>
                          <div className="text-sm text-gray-500">{subject.percentage}%</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getGradeColor(subject.grade)} text-white`}>
                            {subject.grade}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="w-32 bg-gray-200 rounded-full h-2">
                            <div
                              className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-blue-600"
                              style={{ width: `${subject.percentage}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Remarks Section */}
            <div className="p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Teacher's Remarks</h3>
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle size={24} className="text-yellow-600 flex-shrink-0 mt-1" />
                  <div>
                    <p className="text-gray-800 leading-relaxed">{student.remarks}</p>
                    <div className="mt-4 flex items-center gap-4">
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Parents Email:</span> {student.parentsEmail}
                      </div>
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Status:</span> 
                        <span className={`ml-2 px-3 py-1 rounded-full text-sm font-semibold ${
                          student.status === 'pass' 
                            ? 'bg-green-100 text-green-800 border border-green-200' 
                            : 'bg-red-100 text-red-800 border border-red-200'
                        }`}>
                          {student.status === 'pass' ? (
                            <>
                              <CheckCircle size={14} className="inline mr-1" />
                              Passed
                            </>
                          ) : (
                            <>
                              <XCircle size={14} className="inline mr-1" />
                              Needs Improvement
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Modal Footer - Fixed Actions */}
          <div className="p-6 border-t border-gray-200 bg-gray-50">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="text-sm text-gray-600">
                <span className="font-medium">Report ID:</span> {student.studentId}-{student.generatedDate.replace(/-/g, '')}
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => onAction('share', student.id)}
                  className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  <Share2 size={18} />
                  Share
                </button>
                <button
                  onClick={() => onAction('print', student.id)}
                  className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  <Printer size={18} />
                  Print
                </button>
                <button
                  onClick={() => onAction('download', student.id)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  <Download size={18} />
                  Download PDF
                </button>
                <button
                  onClick={() => onAction('email', student.id)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  <Mail size={18} />
                  Email to Parents
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== STUDENT CARD COMPONENT ====================
interface StudentCardProps {
  student: StudentRecord;
  onViewDetails: (studentId: string) => void;
}

const StudentCard = ({ student, onViewDetails }: StudentCardProps) => {
  const getGradeColor = (grade: string) => {
    const colors: { [key: string]: string } = {
      'A+': 'bg-gradient-to-br from-green-500 to-emerald-600',
      'A': 'bg-gradient-to-br from-green-400 to-green-500',
      'A-': 'bg-gradient-to-br from-green-300 to-green-400',
      'B+': 'bg-gradient-to-br from-blue-400 to-blue-500',
      'B': 'bg-gradient-to-br from-blue-300 to-blue-400',
      'B-': 'bg-gradient-to-br from-blue-200 to-blue-300',
      'C+': 'bg-gradient-to-br from-yellow-400 to-yellow-500',
      'C': 'bg-gradient-to-br from-yellow-300 to-yellow-400',
      'C-': 'bg-gradient-to-br from-yellow-200 to-yellow-300',
      'D+': 'bg-gradient-to-br from-orange-400 to-orange-500',
      'D': 'bg-gradient-to-br from-orange-300 to-orange-400',
      'D-': 'bg-gradient-to-br from-orange-200 to-orange-300',
      'F': 'bg-gradient-to-br from-red-400 to-red-500',
    };
    return colors[grade] || 'bg-gradient-to-br from-gray-400 to-gray-500';
  };

  const getImprovementIcon = (improvement: StudentRecord['improvement']) => {
    switch (improvement) {
      case 'improved': return <TrendingUp size={14} className="text-green-500" />;
      case 'declined': return <TrendingDown size={14} className="text-red-500" />;
      default: return <Star size={14} className="text-yellow-500" />;
    }
  };

  return (
    <div 
      className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6 hover:shadow-lg transition-all duration-300 hover:border-blue-300 cursor-pointer group"
      onClick={() => onViewDetails(student.id)}
    >
      {/* Card Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white shadow-sm">
            <User size={24} />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 text-base sm:text-lg truncate group-hover:text-blue-600 transition-colors">
              {student.studentName}
            </h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-gray-500">{student.studentId}</span>
              <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded">
                {student.className}
              </span>
            </div>
          </div>
        </div>
        <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-md ${getGradeColor(student.grade)}`}>
          {student.grade}
        </div>
      </div>

      {/* Key Performance Indicators */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs text-gray-500 mb-1">SCORE</p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-gray-900">{student.totalMarks}</span>
            <span className="text-sm text-gray-500">/500</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
            <div
              className={`h-1.5 rounded-full ${
                student.percentage >= 80 ? 'bg-green-500' : 
                student.percentage >= 60 ? 'bg-blue-500' : 'bg-yellow-500'
              }`}
              style={{ width: `${student.percentage}%` }}
            />
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">POSITION</p>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-purple-600">#{student.position}</span>
            <div className="flex items-center gap-1">
              {getImprovementIcon(student.improvement)}
              <span className={`text-xs ${
                student.improvement === 'improved' ? 'text-green-600' :
                student.improvement === 'declined' ? 'text-red-600' : 'text-yellow-600'
              }`}>
                {student.improvement}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`p-2 rounded-lg ${
            student.status === 'pass' 
              ? 'bg-green-100 text-green-600' 
              : 'bg-red-100 text-red-600'
          }`}>
            {student.status === 'pass' ? (
              <CheckCircle size={16} />
            ) : (
              <XCircle size={16} />
            )}
          </div>
          <div>
            <p className="text-xs text-gray-500">STATUS</p>
            <p className={`font-medium ${
              student.status === 'pass' ? 'text-green-700' : 'text-red-700'
            }`}>
              {student.status === 'pass' ? 'Passed' : 'Needs Help'}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">ATTENDANCE</p>
          <p className="font-medium text-gray-900">{student.attendance}%</p>
        </div>
      </div>

      {/* Subjects Preview */}
      <div className="mb-4">
        <p className="text-xs text-gray-500 font-medium mb-2">TOP SUBJECTS</p>
        <div className="flex flex-wrap gap-1.5">
          {student.subjects.slice(0, 3).map((subject, idx) => (
            <div
              key={idx}
              className="px-2.5 py-1.5 bg-gray-50 rounded-lg border border-gray-200"
              title={`${subject.name}: ${subject.grade} (${subject.percentage}%)`}
            >
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  subject.percentage >= 80 ? 'bg-green-500' :
                  subject.percentage >= 60 ? 'bg-blue-500' : 'bg-yellow-500'
                }`} />
                <span className="text-sm font-medium text-gray-900 truncate max-w-[80px]">
                  {subject.name}
                </span>
                <span className="text-xs font-semibold text-gray-600">{subject.grade}</span>
              </div>
            </div>
          ))}
          {student.subjects.length > 3 && (
            <div className="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm rounded-lg">
              +{student.subjects.length - 3} more
            </div>
          )}
        </div>
      </div>

      {/* Action Button */}
      <div className="pt-4 border-t border-gray-100">
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onViewDetails(student.id);
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors font-medium group/btn"
        >
          <Eye size={18} />
          View Full Report
          <ChevronRight size={18} className="group-hover/btn:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
};

// ==================== MAIN COMPONENT ====================
export default function ReportCards() {
  const [isLoading, setIsLoading] = useState(true);
  const [records, setRecords] = useState<StudentRecord[]>([
    { 
      id: '1', 
      studentName: 'Alice Mumba', 
      studentId: 'STU001', 
      className: 'Form 4A',
      form: '4',
      totalMarks: 425, 
      percentage: 85, 
      grade: 'A',
      gradePoints: 4.0,
      status: 'pass',
      position: 1,
      improvement: 'improved',
      attendance: 95,
      remarks: 'Excellent performance across all subjects. Shows exceptional aptitude in Mathematics and Sciences. Demonstrates strong analytical skills and consistent dedication to studies.',
      parentsEmail: 'parents.mumba@email.com',
      generatedDate: '2024-01-15',
      subjects: [
        { name: 'Mathematics', marks: 92, total: 100, percentage: 92, grade: 'A+', teacher: 'Mr. Johnson' },
        { name: 'English', marks: 88, total: 100, percentage: 88, grade: 'A', teacher: 'Mrs. Smith' },
        { name: 'Physics', marks: 85, total: 100, percentage: 85, grade: 'A', teacher: 'Mr. Banda' },
        { name: 'Chemistry', marks: 87, total: 100, percentage: 87, grade: 'A', teacher: 'Mr. Phiri' },
        { name: 'Biology', marks: 83, total: 100, percentage: 83, grade: 'A-', teacher: 'Ms. Chileshe' },
      ]
    },
    { 
      id: '2', 
      studentName: 'Benson Chanda', 
      studentId: 'STU002', 
      className: 'Form 4A',
      form: '4',
      totalMarks: 380, 
      percentage: 76, 
      grade: 'B+',
      gradePoints: 3.5,
      status: 'pass',
      position: 3,
      improvement: 'stable',
      attendance: 88,
      remarks: 'Consistent performer with room for improvement in Mathematics. Shows good understanding of concepts but needs to work on problem-solving speed.',
      parentsEmail: 'chanda.family@email.com',
      generatedDate: '2024-01-15',
      subjects: [
        { name: 'Mathematics', marks: 70, total: 100, percentage: 70, grade: 'B-', teacher: 'Mr. Johnson' },
        { name: 'English', marks: 85, total: 100, percentage: 85, grade: 'A', teacher: 'Mrs. Smith' },
        { name: 'Physics', marks: 78, total: 100, percentage: 78, grade: 'B+', teacher: 'Mr. Banda' },
        { name: 'Chemistry', marks: 75, total: 100, percentage: 75, grade: 'B', teacher: 'Mr. Phiri' },
        { name: 'Biology', marks: 72, total: 100, percentage: 72, grade: 'B-', teacher: 'Ms. Chileshe' },
      ]
    },
    { 
      id: '3', 
      studentName: 'Cecilia Nkosi', 
      studentId: 'STU003', 
      className: 'Form 4A',
      form: '4',
      totalMarks: 350, 
      percentage: 70, 
      grade: 'B',
      gradePoints: 3.0,
      status: 'pass',
      position: 5,
      improvement: 'improved',
      attendance: 92,
      remarks: 'Shows significant improvement this term, particularly in Science subjects. Has become more confident in class participation.',
      parentsEmail: 'nkosi.home@email.com',
      generatedDate: '2024-01-15',
      subjects: [
        { name: 'Mathematics', marks: 68, total: 100, percentage: 68, grade: 'C+', teacher: 'Mr. Johnson' },
        { name: 'English', marks: 72, total: 100, percentage: 72, grade: 'B-', teacher: 'Mrs. Smith' },
        { name: 'Physics', marks: 75, total: 100, percentage: 75, grade: 'B', teacher: 'Mr. Banda' },
        { name: 'Chemistry', marks: 73, total: 100, percentage: 73, grade: 'B-', teacher: 'Mr. Phiri' },
        { name: 'Biology', marks: 62, total: 100, percentage: 62, grade: 'C', teacher: 'Ms. Chileshe' },
      ]
    },
    { 
      id: '4', 
      studentName: 'David Mwale', 
      studentId: 'STU004', 
      className: 'Form 4A',
      form: '4',
      totalMarks: 320, 
      percentage: 64, 
      grade: 'C+',
      gradePoints: 2.5,
      status: 'pass',
      position: 8,
      improvement: 'declined',
      attendance: 85,
      remarks: 'Performance has declined this term. Would benefit from additional tutoring sessions, especially in core subjects.',
      parentsEmail: 'mwale.parents@email.com',
      generatedDate: '2024-01-15',
      subjects: [
        { name: 'Mathematics', marks: 60, total: 100, percentage: 60, grade: 'C', teacher: 'Mr. Johnson' },
        { name: 'English', marks: 65, total: 100, percentage: 65, grade: 'C+', teacher: 'Mrs. Smith' },
        { name: 'Physics', marks: 62, total: 100, percentage: 62, grade: 'C', teacher: 'Mr. Banda' },
        { name: 'Chemistry', marks: 68, total: 100, percentage: 68, grade: 'C+', teacher: 'Mr. Phiri' },
        { name: 'Biology', marks: 65, total: 100, percentage: 65, grade: 'C+', teacher: 'Ms. Chileshe' },
      ]
    },
    { 
      id: '5', 
      studentName: 'Emeline Tembo', 
      studentId: 'STU005', 
      className: 'Form 4B',
      form: '4',
      totalMarks: 410, 
      percentage: 82, 
      grade: 'A-',
      gradePoints: 3.7,
      status: 'pass',
      position: 2,
      improvement: 'improved',
      attendance: 96,
      remarks: 'Top performer in Form 4B. Demonstrates excellent analytical skills and shows leadership qualities in group activities.',
      parentsEmail: 'tembo.family@email.com',
      generatedDate: '2024-01-15',
      subjects: [
        { name: 'Mathematics', marks: 90, total: 100, percentage: 90, grade: 'A+', teacher: 'Mr. Johnson' },
        { name: 'English', marks: 85, total: 100, percentage: 85, grade: 'A', teacher: 'Mrs. Smith' },
        { name: 'Physics', marks: 88, total: 100, percentage: 88, grade: 'A', teacher: 'Mr. Banda' },
        { name: 'Chemistry', marks: 84, total: 100, percentage: 84, grade: 'A-', teacher: 'Mr. Phiri' },
        { name: 'Biology', marks: 83, total: 100, percentage: 83, grade: 'A-', teacher: 'Ms. Chileshe' },
      ]
    },
    { 
      id: '6', 
      studentName: 'Frank Simatende', 
      studentId: 'STU006', 
      className: 'Form 4B',
      form: '4',
      totalMarks: 295, 
      percentage: 59, 
      grade: 'D+',
      gradePoints: 1.5,
      status: 'fail',
      position: 12,
      improvement: 'stable',
      attendance: 78,
      remarks: 'Struggling with core concepts. Requires immediate remedial classes and parental support to improve performance.',
      parentsEmail: 'simatende.home@email.com',
      generatedDate: '2024-01-15',
      subjects: [
        { name: 'Mathematics', marks: 55, total: 100, percentage: 55, grade: 'D', teacher: 'Mr. Johnson' },
        { name: 'English', marks: 58, total: 100, percentage: 58, grade: 'D+', teacher: 'Mrs. Smith' },
        { name: 'Physics', marks: 52, total: 100, percentage: 52, grade: 'D', teacher: 'Mr. Banda' },
        { name: 'Chemistry', marks: 60, total: 100, percentage: 60, grade: 'C', teacher: 'Mr. Phiri' },
        { name: 'Biology', marks: 70, total: 100, percentage: 70, grade: 'B-', teacher: 'Ms. Chileshe' },
      ]
    },
    { 
      id: '7', 
      studentName: 'Grace Mbewe', 
      studentId: 'STU007', 
      className: 'Form 4B',
      form: '4',
      totalMarks: 370, 
      percentage: 74, 
      grade: 'B',
      gradePoints: 3.0,
      status: 'pass',
      position: 4,
      improvement: 'improved',
      attendance: 90,
      remarks: 'Consistent improvement noted. Shows dedication in studies and good participation in class discussions.',
      parentsEmail: 'mbewe.parents@email.com',
      generatedDate: '2024-01-15',
      subjects: [
        { name: 'Mathematics', marks: 75, total: 100, percentage: 75, grade: 'B', teacher: 'Mr. Johnson' },
        { name: 'English', marks: 80, total: 100, percentage: 80, grade: 'A-', teacher: 'Mrs. Smith' },
        { name: 'Physics', marks: 72, total: 100, percentage: 72, grade: 'B-', teacher: 'Mr. Banda' },
        { name: 'Chemistry', marks: 70, total: 100, percentage: 70, grade: 'B-', teacher: 'Mr. Phiri' },
        { name: 'Biology', marks: 73, total: 100, percentage: 73, grade: 'B-', teacher: 'Ms. Chileshe' },
      ]
    },
    { 
      id: '8', 
      studentName: 'Henry Kamwi', 
      studentId: 'STU008', 
      className: 'Form 3A',
      form: '3',
      totalMarks: 440, 
      percentage: 88, 
      grade: 'A',
      gradePoints: 4.0,
      status: 'pass',
      position: 1,
      improvement: 'improved',
      attendance: 98,
      remarks: 'Exceptional student with outstanding performance. Demonstrates leadership and helps peers during study sessions.',
      parentsEmail: 'kamwi.family@email.com',
      generatedDate: '2024-01-15',
      subjects: [
        { name: 'Mathematics', marks: 95, total: 100, percentage: 95, grade: 'A+', teacher: 'Mr. Johnson' },
        { name: 'English', marks: 90, total: 100, percentage: 90, grade: 'A+', teacher: 'Mrs. Smith' },
        { name: 'Physics', marks: 92, total: 100, percentage: 92, grade: 'A+', teacher: 'Mr. Banda' },
        { name: 'Chemistry', marks: 88, total: 100, percentage: 88, grade: 'A', teacher: 'Mr. Phiri' },
        { name: 'Biology', marks: 85, total: 100, percentage: 85, grade: 'A', teacher: 'Ms. Chileshe' },
      ]
    },
  ]);
  
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedForm, setSelectedForm] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  // Simulate loading
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  const debouncedSearch = useDebounce(searchTerm, 300);

  const filteredRecords = useMemo(() => {
    return records.filter(record => {
      const matchesSearch = !debouncedSearch ||
        record.studentName.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        record.studentId.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        record.className.toLowerCase().includes(debouncedSearch.toLowerCase());
      
      const matchesClass = selectedClass === 'all' || record.className === selectedClass;
      const matchesStatus = selectedStatus === 'all' || record.status === selectedStatus;
      const matchesForm = selectedForm === 'all' || record.form === selectedForm;
      
      return matchesSearch && matchesClass && matchesStatus && matchesForm;
    });
  }, [records, debouncedSearch, selectedClass, selectedStatus, selectedForm]);

  const classes = Array.from(new Set(records.map(r => r.className)));
  const forms = Array.from(new Set(records.map(r => r.form))).sort();

  const handleViewDetails = (studentId: string) => {
    setSelectedStudent(studentId);
    setShowReportModal(true);
  };

  const handleModalAction = (action: 'download' | 'email' | 'print' | 'share', studentId: string) => {
    const student = records.find(s => s.id === studentId);
    const actionMap = {
      download: `Downloading report for ${student?.studentName}`,
      email: `Emailing report to ${student?.parentsEmail}`,
      print: `Printing report for ${student?.studentName}`,
      share: `Sharing report for ${student?.studentName}`
    };
    alert(actionMap[action]);
    
    if (action === 'download' || action === 'print') {
      setShowReportModal(false);
    }
  };

  const handleBatchAction = (action: 'download' | 'email' | 'print') => {
    const actionText = action === 'download' ? 'Download' : action === 'email' ? 'Email' : 'Print';
    alert(`${actionText}ing ${filteredRecords.length} reports...`);
  };

  const selectedStudentData = records.find(s => s.id === selectedStudent);

  // Statistics
  const stats = useMemo(() => ({
    totalStudents: filteredRecords.length,
    averagePercentage: filteredRecords.length > 0 
      ? Math.round(filteredRecords.reduce((sum, r) => sum + r.percentage, 0) / filteredRecords.length)
      : 0,
    passRate: filteredRecords.length > 0
      ? Math.round((filteredRecords.filter(r => r.status === 'pass').length / filteredRecords.length) * 100)
      : 0,
    topGrades: filteredRecords.filter(r => ['A+', 'A', 'A-'].includes(r.grade)).length,
  }), [filteredRecords]);

  if (isLoading) {
    return (
      <DashboardLayout activeTab="reports">
        <div className="p-4 sm:p-6 lg:p-8 space-y-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-pulse">
            <div>
              <div className="h-8 bg-gray-200 rounded w-48 mb-2"></div>
              <div className="h-4 bg-gray-100 rounded w-64"></div>
            </div>
            <div className="h-10 bg-gray-200 rounded w-40"></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-24 mb-4"></div>
                <div className="h-8 bg-gray-300 rounded w-20 mb-2"></div>
                <div className="h-3 bg-gray-100 rounded w-32"></div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
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
          <div className="mb-8">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl lg:text-4xl">
                  Report Cards
                </h1>
                <p className="text-gray-600 mt-2 text-sm sm:text-base">
                  Click on any card to view detailed academic report
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleBatchAction('download')}
                  className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  <Download size={18} />
                  <span className="hidden sm:inline">Batch Download</span>
                  <span className="sm:hidden">Download All</span>
                </button>
                <button
                  onClick={() => handleBatchAction('email')}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  <Mail size={18} />
                  <span className="hidden sm:inline">Email All Reports</span>
                  <span className="sm:hidden">Email All</span>
                </button>
              </div>
            </div>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow">
              <p className="text-gray-600 font-medium text-sm">Total Students</p>
              <p className="text-2xl sm:text-3xl font-bold text-gray-900 mt-2">{stats.totalStudents}</p>
              <p className="text-xs text-gray-500 mt-2">Filtered results</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow">
              <p className="text-gray-600 font-medium text-sm">Avg Percentage</p>
              <p className="text-2xl sm:text-3xl font-bold text-blue-600 mt-2">{stats.averagePercentage}%</p>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full" 
                  style={{ width: `${stats.averagePercentage}%` }}
                />
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow">
              <p className="text-gray-600 font-medium text-sm">Pass Rate</p>
              <p className="text-2xl sm:text-3xl font-bold text-green-600 mt-2">{stats.passRate}%</p>
              <div className="flex items-center gap-1 mt-2">
                <CheckCircle size={14} className="text-green-500" />
                <span className="text-xs text-green-600">
                  {filteredRecords.filter(r => r.status === 'pass').length} passed
                </span>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow">
              <p className="text-gray-600 font-medium text-sm">Top Grades</p>
              <p className="text-2xl sm:text-3xl font-bold text-purple-600 mt-2">{stats.topGrades}</p>
              <p className="text-xs text-gray-500 mt-2">A/A+/A- grades</p>
            </div>
          </div>

          {/* Filters */}
          <div className="mb-8 bg-white rounded-2xl border border-gray-200 p-4 sm:p-6 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Search size={16} className="inline mr-2" />
                  Search Students
                </label>
                <input
                  type="text"
                  placeholder="Search by name or ID..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Filter size={16} className="inline mr-2" />
                  Filter by Class
                </label>
                <select
                  value={selectedClass}
                  onChange={e => setSelectedClass(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  <option value="all">All Classes</option>
                  {classes.map(cls => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Filter size={16} className="inline mr-2" />
                  Filter by Status
                </label>
                <select
                  value={selectedStatus}
                  onChange={e => setSelectedStatus(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  <option value="all">All Status</option>
                  <option value="pass">Passed</option>
                  <option value="fail">Needs Improvement</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Filter size={16} className="inline mr-2" />
                  Filter by Form
                </label>
                <select
                  value={selectedForm}
                  onChange={e => setSelectedForm(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  <option value="all">All Forms</option>
                  {forms.map(form => (
                    <option key={form} value={form}>Form {form}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {searchTerm && (
              <p className="text-sm text-gray-600 mt-4">
                Found {filteredRecords.length} students matching "{searchTerm}"
              </p>
            )}
          </div>

          {/* Report Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {filteredRecords.map((student) => (
              <StudentCard
                key={student.id}
                student={student}
                onViewDetails={handleViewDetails}
              />
            ))}
          </div>

          {/* Empty State */}
          {filteredRecords.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <FileText size={48} className="mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No report cards found</h3>
              <p className="text-gray-600 mb-6 max-w-md mx-auto">
                {searchTerm || selectedClass !== 'all' || selectedStatus !== 'all'
                  ? 'Try adjusting your filters to find what you\'re looking for.'
                  : 'No student records available for report generation.'}
              </p>
              {(searchTerm || selectedClass !== 'all' || selectedStatus !== 'all') && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedClass('all');
                    setSelectedStatus('all');
                    setSelectedForm('all');
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}

          {/* Footer Stats */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-sm text-gray-600">
                Showing {filteredRecords.length} of {records.length} report cards
                {(searchTerm || selectedClass !== 'all' || selectedStatus !== 'all' || selectedForm !== 'all') && (
                  <span className="ml-2 px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                    Filtered
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-500">
                Click any card to view detailed report • Reports generated on {new Date().toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>

      {/* Report Detail Modal */}
      {selectedStudentData && (
        <ReportDetailModal
          isOpen={showReportModal}
          onClose={() => {
            setShowReportModal(false);
            setSelectedStudent(null);
          }}
          student={selectedStudentData}
          onAction={handleModalAction}
        />
      )}
    </>
  );
}