// @/pages/admin/ReportCards.tsx - FULLY REWRITTEN WITH PROPER INTEGRATION
import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useEffect, useMemo } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import { useReportCards, useReportReadiness } from '@/hooks/useResults';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useSchoolLearners } from '@/hooks/useSchoolLearners';
import { useTeacherAssignments } from '@/hooks/useTeacherAssignments';
import { useAuth } from '@/hooks/useAuth';
import {
  Download,
  Mail,
  Filter,
  Search,
  Printer,
  Eye,
  CheckCircle,
  XCircle,
  FileText,
  X,
  Share2,
  TrendingUp,
  TrendingDown,
  ChevronRight,
  Loader2,
  BookOpen,
  Calendar,
  Users,
  Award,
  AlertTriangle,
  Info,
  RefreshCw,
  User,
  GraduationCap
} from 'lucide-react';

// ==================== TYPES & INTERFACES ====================
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
  1: { min: 75, max: 100, description: 'Distinction', color: 'bg-gradient-to-r from-green-500 to-emerald-600', textColor: 'text-green-600' },
  2: { min: 70, max: 74, description: 'Distinction', color: 'bg-gradient-to-r from-green-400 to-green-500', textColor: 'text-green-600' },
  3: { min: 65, max: 69, description: 'Merit', color: 'bg-gradient-to-r from-blue-500 to-blue-600', textColor: 'text-blue-600' },
  4: { min: 60, max: 64, description: 'Merit', color: 'bg-gradient-to-r from-blue-400 to-blue-500', textColor: 'text-blue-600' },
  5: { min: 55, max: 59, description: 'Credit', color: 'bg-gradient-to-r from-cyan-400 to-cyan-500', textColor: 'text-cyan-600' },
  6: { min: 50, max: 54, description: 'Credit', color: 'bg-gradient-to-r from-cyan-300 to-cyan-400', textColor: 'text-cyan-600' },
  7: { min: 45, max: 49, description: 'Satisfactory', color: 'bg-gradient-to-r from-yellow-400 to-yellow-500', textColor: 'text-yellow-600' },
  8: { min: 40, max: 44, description: 'Satisfactory', color: 'bg-gradient-to-r from-orange-400 to-orange-500', textColor: 'text-orange-600' },
  9: { min: 0, max: 39, description: 'Unsatisfactory (Fail)', color: 'bg-gradient-to-r from-red-400 to-red-500', textColor: 'text-red-600' },
  X: { min: -1, max: -1, description: 'Absent', color: 'bg-gradient-to-r from-gray-400 to-gray-500', textColor: 'text-gray-600' },
};

const getGradeDisplay = (grade: number): string => {
  return grade === -1 ? 'X' : grade.toString();
};

const getGradeInfo = (grade: number) => {
  const gradeKey = grade === -1 ? 'X' : grade;
  return GRADE_SYSTEM[gradeKey] || GRADE_SYSTEM[9];
};

const getGradeComment = (grade: number): string => {
  const gradeKey = grade === -1 ? 'X' : grade;
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
  return comments[gradeKey] || 'Performance assessment pending.';
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

// ==================== MISSING DATA MODAL ====================
interface MissingDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  classReadiness: any;
  teacherAssignments: any[];
}

const MissingDataModal = ({ isOpen, onClose, classReadiness, teacherAssignments }: MissingDataModalProps) => {
  if (!isOpen || !classReadiness) return null;
  
  const incompleteStudents = classReadiness.studentDetails.filter((s: any) => !s.isReady);
  
  // Create a map of subject to teacher for quick lookup
  const subjectTeacherMap = new Map<string, string>();
  teacherAssignments.forEach(assignment => {
    subjectTeacherMap.set(assignment.subject, assignment.teacherName || 'Assigned Teacher');
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Missing Results Data</h2>
                <p className="text-gray-600 mt-1">
                  {incompleteStudents.length} student{incompleteStudents.length !== 1 ? 's' : ''} have incomplete data
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={24} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-4">
              {incompleteStudents.map((student: any) => (
                <div key={student.studentId} className="bg-yellow-50 border-l-4 border-yellow-500 rounded-r-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{student.studentName}</h3>
                      <p className="text-sm text-gray-600">ID: {student.studentId}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-yellow-700">
                        {Math.round((student.completeSubjects / student.totalSubjects) * 100)}%
                      </div>
                      <div className="text-xs text-gray-600">
                        {student.completeSubjects}/{student.totalSubjects} subjects
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700">Missing Data:</p>
                    {student.missingData.map((missing: any, idx: number) => (
                      <div key={idx} className="ml-4 p-2 bg-white rounded border border-yellow-200">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-gray-900">{missing.subject}</p>
                            <p className="text-sm text-gray-600">
                              Teacher: {subjectTeacherMap.get(missing.subject) || missing.teacherName || 'Not assigned'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-red-600 font-medium">
                              Missing: {missing.missingExamTypes.join(', ')}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="p-6 border-t border-gray-200 bg-gray-50">
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-600">
                These students need teachers to complete results entry before accurate reports can be generated.
              </p>
              <button
                onClick={onClose}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== REPORT DETAIL MODAL ====================
interface ReportDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportCard: StudentReportCard | null;
  onAction: (action: 'download' | 'email' | 'print' | 'share', studentId: string) => void;
}

const ReportDetailModal = ({ isOpen, onClose, reportCard, onAction }: ReportDetailModalProps) => {
  if (!isOpen || !reportCard) return null;
  const gradeInfo = getGradeInfo(reportCard.grade);
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Academic Report Card</h2>
                <p className="text-gray-600">{reportCard.term}, {reportCard.year} • Detailed Performance Report</p>
                {!reportCard.isComplete && (
                  <div className="mt-2 flex items-center gap-2 text-yellow-700">
                    <AlertTriangle size={16} />
                    <span className="text-sm font-medium">
                      Incomplete Data ({reportCard.completionPercentage}% complete)
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={24} />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="text-center mb-8 border-b pb-6">
              <h1 className="text-xl font-bold uppercase">Republic of Zambia</h1>
              <h2 className="text-lg font-semibold">Ministry of Education</h2>
              <h3 className="text-lg font-semibold text-blue-600">Kalabo Boarding Secondary School</h3>
              <p className="text-gray-600 mt-2">P.O. Box 110, Kalabo, Zambia</p>
            </div>
            
            <div className="mb-8">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-sm text-gray-500">Name</p>
                  <p className="font-semibold">{reportCard.studentName}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Grade</p>
                  <p className={`font-bold ${gradeInfo.textColor}`}>
                    {getGradeDisplay(reportCard.grade)} - {gradeInfo.description}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Class</p>
                  <p className="font-semibold">{reportCard.className}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Position</p>
                  <p className="font-semibold">{reportCard.position}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Gender</p>
                  <p className="font-semibold">{reportCard.gender}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Student ID</p>
                  <p className="font-semibold">{reportCard.studentId}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Attendance</p>
                  <p className="font-semibold">{reportCard.attendance}%</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Term</p>
                  <p className="font-semibold">{reportCard.term}, {reportCard.year}</p>
                </div>
              </div>
            </div>
            
            <div className="mb-8">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Academic Performance</h3>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">Subject</th>
                      <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">Teacher</th>
                      <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">Week 4</th>
                      <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">Week 8</th>
                      <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">End of Term</th>
                      <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">Grade</th>
                      <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">Comment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportCard.subjects.map((subject, index) => {
                      const subjectGradeInfo = getGradeInfo(subject.grade);
                      return (
                        <tr key={index} className={`hover:bg-gray-50 ${!subject.isComplete ? 'bg-yellow-50' : ''}`}>
                          <td className="border border-gray-300 px-4 py-3 font-medium">
                            {subject.subjectName}
                            {!subject.isComplete && (
                              <span className="ml-2 text-xs text-yellow-700">⚠️ Incomplete</span>
                            )}
                          </td>
                          <td className="border border-gray-300 px-4 py-3 text-sm text-gray-600">{subject.teacherName}</td>
                          <td className="border border-gray-300 px-4 py-3">
                            {subject.week4 >= 0 ? `${subject.week4}%` : (
                              <span className="text-yellow-600">—</span>
                            )}
                          </td>
                          <td className="border border-gray-300 px-4 py-3">
                            {subject.week8 >= 0 ? `${subject.week8}%` : (
                              <span className="text-yellow-600">—</span>
                            )}
                          </td>
                          <td className="border border-gray-300 px-4 py-3 font-semibold">
                            {subject.endOfTerm >= 0 ? `${subject.endOfTerm}%` : (
                              <span className="text-yellow-600">—</span>
                            )}
                          </td>
                          <td className="border border-gray-300 px-4 py-3">
                            <span className={`px-3 py-1 rounded-full text-white font-bold ${subjectGradeInfo.color}`}>
                              {getGradeDisplay(subject.grade)}
                            </span>
                          </td>
                          <td className="border border-gray-300 px-4 py-3 text-sm">
                            {subject.comment || getGradeComment(subject.grade)}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="bg-gray-50 font-semibold">
                      <td className="border border-gray-300 px-4 py-3" colSpan={2}>Overall Average</td>
                      <td className="border border-gray-300 px-4 py-3">
                        {Math.round(
                          reportCard.subjects
                            .filter(s => s.week4 >= 0)
                            .reduce((sum, s) => sum + s.week4, 0) /
                          (reportCard.subjects.filter(s => s.week4 >= 0).length || 1)
                        )}%
                      </td>
                      <td className="border border-gray-300 px-4 py-3">
                        {Math.round(
                          reportCard.subjects
                            .filter(s => s.week8 >= 0)
                            .reduce((sum, s) => sum + s.week8, 0) /
                          (reportCard.subjects.filter(s => s.week8 >= 0).length || 1)
                        )}%
                      </td>
                      <td className="border border-gray-300 px-4 py-3">{reportCard.percentage}%</td>
                      <td className="border border-gray-300 px-4 py-3">
                        <span className={`px-3 py-1 rounded-full text-white font-bold ${gradeInfo.color}`}>
                          {getGradeDisplay(reportCard.grade)}
                        </span>
                      </td>
                      <td className="border border-gray-300 px-4 py-3 text-sm">
                        {gradeInfo.description}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="mb-8">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Class Teacher's Comment</h3>
              <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r">
                <p className="text-gray-800 leading-relaxed">{reportCard.teachersComment}</p>
                <div className="mt-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Status:</span>{' '}
                      <span className={`ml-2 px-3 py-1 rounded-full text-sm font-semibold ${
                        reportCard.status === 'pass'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {reportCard.status === 'pass' ? (
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
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Teacher's Signature:</span>{' '}
                      <span className="border-b border-gray-400 px-8">_________</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="mb-8 bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h4 className="font-bold text-blue-900 mb-3">Grading System Reference</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-green-600 text-white rounded font-bold">1-2</span>
                  <span className="text-blue-800">Distinction (70-100%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-blue-600 text-white rounded font-bold">3-4</span>
                  <span className="text-blue-800">Merit (60-69%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-cyan-600 text-white rounded font-bold">5-6</span>
                  <span className="text-blue-800">Credit (50-59%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-yellow-600 text-white rounded font-bold">7-8</span>
                  <span className="text-blue-800">Satisfactory (40-49%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-red-600 text-white rounded font-bold">9</span>
                  <span className="text-blue-800">Fail (0-39%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-gray-600 text-white rounded font-bold">X</span>
                  <span className="text-blue-800">Absent</span>
                </div>
              </div>
            </div>
            
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <h4 className="font-bold text-blue-900 mb-2">To Parents/Guardians:</h4>
              <p className="text-blue-800 text-sm mb-3">
                This report should be discussed with your child. Please sign below to acknowledge receipt and return to school.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-blue-700">Parent's/Guardian's Signature:</p>
                  <div className="border-b border-blue-300 mt-1 h-8"></div>
                </div>
                <div>
                  <p className="text-sm text-blue-700">Date:</p>
                  <div className="border-b border-blue-300 mt-1 h-8"></div>
                </div>
              </div>
            </div>
          </div>
          <div className="p-6 border-t border-gray-200 bg-gray-50">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="text-sm text-gray-600">
                Report generated: {reportCard.generatedDate}
                {!reportCard.isComplete && (
                  <span className="ml-2 text-yellow-700">• Incomplete ({reportCard.completionPercentage}%)</span>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => onAction('share', reportCard.studentId)}
                  className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Share2 size={18} />
                  Share
                </button>
                <button
                  onClick={() => onAction('print', reportCard.studentId)}
                  className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Printer size={18} />
                  Print
                </button>
                <button
                  onClick={() => onAction('email', reportCard.studentId)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
  reportCard: StudentReportCard;
  onViewDetails: (studentId: string) => void;
}

const StudentCard = ({ reportCard, onViewDetails }: StudentCardProps) => {
  const gradeInfo = getGradeInfo(reportCard.grade);
  
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-all cursor-pointer relative"
      onClick={() => onViewDetails(reportCard.studentId)}>
      {!reportCard.isComplete && (
        <div className="absolute top-3 right-3">
          <div className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-semibold rounded-full flex items-center gap-1">
            <AlertTriangle size={12} />
            {reportCard.completionPercentage}%
          </div>
        </div>
      )}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-bold text-gray-900 text-lg mb-1">{reportCard.studentName}</h3>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>{reportCard.studentId}</span>
            <span>•</span>
            <span>{reportCard.className}</span>
          </div>
        </div>
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-white font-bold ${gradeInfo.color}`}>
          {getGradeDisplay(reportCard.grade)}
        </div>
      </div>
      <div className="space-y-3 mb-4">
        <div>
          <p className="text-xs text-gray-500">Grade & Position</p>
          <p className="font-semibold">{gradeInfo.description} • {reportCard.position}</p>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">Overall</p>
            <p className="font-semibold">{reportCard.percentage}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Status</p>
            <div className="flex items-center gap-1">
              {reportCard.status === 'pass' ? (
                <CheckCircle size={14} className="text-green-500" />
              ) : (
                <XCircle size={14} className="text-red-500" />
              )}
              <span className={`text-sm ${reportCard.status === 'pass' ? 'text-green-600' : 'text-red-600'}`}>
                {reportCard.status === 'pass' ? 'Pass' : 'Fail'}
              </span>
            </div>
          </div>
        </div>
      </div>
      <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors font-medium">
        <Eye size={18} />
        View Report
        <ChevronRight size={18} />
      </button>
    </div>
  );
};

// ==================== MAIN COMPONENT ====================
export default function ReportCards() {
  const { user } = useAuth();
  const { classes, isLoading: loadingClasses } = useSchoolClasses();
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedForm, setSelectedForm] = useState<string>('all');
  const [selectedTerm, setSelectedTerm] = useState<string>('Term 1');
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showMissingDataModal, setShowMissingDataModal] = useState(false);
  const [includeIncomplete, setIncludeIncomplete] = useState(true);
  const [markMissing, setMarkMissing] = useState(true);
  const debouncedSearch = useDebounce(searchTerm, 300);

  // Get teacher assignments for all teachers (admin view)
  const { 
    assignments: allTeacherAssignments, 
    isLoading: loadingAssignments,
    refetch: refetchAssignments
  } = useTeacherAssignments();

  // Get learners for selected class
  const { 
    learners, 
    isLoading: loadingLearners 
  } = useSchoolLearners(selectedClass !== 'all' ? selectedClass : undefined);

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

  // Get teacher assignments filtered by selected class
  const classTeacherAssignments = useMemo(() => {
    if (!selectedClass || selectedClass === 'all' || !allTeacherAssignments) return [];
    return allTeacherAssignments.filter(a => a.classId === selectedClass);
  }, [selectedClass, allTeacherAssignments]);

  // Get unique subjects for selected class
  const subjectsInClass = useMemo(() => {
    if (!classTeacherAssignments.length) return [];
    return Array.from(new Set(classTeacherAssignments.map(a => a.subject)));
  }, [classTeacherAssignments]);

  // Use report readiness hook
  const {
    classReadiness,
    isLoading: loadingReadiness,
    refetch: refetchReadiness,
  } = useReportReadiness({
    classId: selectedClass !== 'all' ? selectedClass : undefined,
    term: selectedTerm,
    year: selectedYear,
  });

  // Fetch report cards
  const {
    reportCards = [],
    isLoading,
    refetch,
    bulkSummary,
  } = useReportCards({
    classId: selectedClass !== 'all' ? selectedClass : undefined,
    term: selectedTerm,
    year: selectedYear,
    includeIncomplete,
    markMissing,
  });

  // Filter report cards
  const filteredRecords = useMemo(() => {
    if (!reportCards || reportCards.length === 0) return [];
    return reportCards.filter(record => {
      const matchesSearch = !debouncedSearch ||
        record.studentName.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        record.studentId.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        record.className.toLowerCase().includes(debouncedSearch.toLowerCase());
      const matchesClass = selectedClass === 'all' || record.classId === selectedClass;
      const matchesStatus = selectedStatus === 'all' || record.status === selectedStatus;
      const matchesForm = selectedForm === 'all' || record.form === selectedForm;
      return matchesSearch && matchesClass && matchesStatus && matchesForm;
    });
  }, [reportCards, debouncedSearch, selectedClass, selectedStatus, selectedForm]);

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

  const formOptions = useMemo(() =>
    Array.from(new Set((reportCards || []).map(r => r.form))).sort(),
    [reportCards]
  );

  const handleViewDetails = (studentId: string) => {
    setSelectedStudent(studentId);
    setShowReportModal(true);
  };

  const handleModalAction = (action: 'download' | 'email' | 'print' | 'share', studentId: string) => {
    const student = reportCards?.find(s => s.studentId === studentId);
    const actionMap = {
      download: `Downloading report for ${student?.studentName}`,
      email: `Emailing report to ${student?.parentsEmail}`,
      print: `Printing report for ${student?.studentName}`,
      share: `Sharing report for ${student?.studentName}`
    };
    alert(actionMap[action]);
  };

  const handleBatchAction = (action: 'download' | 'email') => {
    const actionText = action === 'download' ? 'Download' : 'Email';
    alert(`${actionText}ing ${filteredRecords.length} reports...`);
  };

  const selectedReportCard = reportCards?.find(s => s.studentId === selectedStudent);

  const stats = useMemo(() => ({
    totalStudents: filteredRecords.length,
    averagePercentage: filteredRecords.length > 0
      ? Math.round(filteredRecords.reduce((sum, r) => sum + r.percentage, 0) / filteredRecords.length)
      : 0,
    passRate: filteredRecords.length > 0
      ? Math.round((filteredRecords.filter(r => r.status === 'pass').length / filteredRecords.length) * 100)
      : 0,
    topGrades: filteredRecords.filter(r => r.grade <= 2).length,
    completeReports: filteredRecords.filter(r => r.isComplete).length,
    incompleteReports: filteredRecords.filter(r => !r.isComplete).length,
  }), [filteredRecords]);

  const terms = ['Term 1', 'Term 2', 'Term 3'];
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const isLoadingAll = isLoading || loadingClasses || loadingReadiness || loadingAssignments;

  if (isLoadingAll) {
    return (
      <DashboardLayout activeTab="reports">
        <div className="p-6 space-y-8">
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
            {[1, 2, 3, 4].map((i) => (
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
        <div className="min-h-screen bg-gray-50 p-6">
          <div className="mb-8">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Report Cards</h1>
                <p className="text-gray-600 mt-2">
                  Manage and view student academic reports • {selectedTerm}, {selectedYear}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    refetchReadiness();
                    refetchAssignments();
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  title="Refresh readiness status"
                >
                  <RefreshCw size={18} />
                  Refresh
                </button>
                <button
                  onClick={() => handleBatchAction('download')}
                  className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={filteredRecords.length === 0}
                >
                  <Download size={18} />
                  Download All
                </button>
                <button
                  onClick={() => handleBatchAction('email')}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  disabled={filteredRecords.length === 0}
                >
                  <Mail size={18} />
                  Email All
                </button>
              </div>
            </div>
          </div>

          {/* Class Readiness Alert with proper integration */}
          {classReadiness && selectedClass !== 'all' && (
            <div className={`mb-8 p-6 rounded-xl border-2 ${
              classReadiness.completionPercentage === 100
                ? 'bg-green-50 border-green-200'
                : 'bg-yellow-50 border-yellow-300'
            }`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    {classReadiness.completionPercentage === 100 ? (
                      <CheckCircle className="text-green-600" size={24} />
                    ) : (
                      <AlertTriangle className="text-yellow-600" size={24} />
                    )}
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">
                        {classReadiness.className} Readiness Status
                      </h3>
                      <p className="text-sm text-gray-600">
                        {classReadiness.readyStudents} of {classReadiness.totalStudents} students have complete data
                      </p>
                      {/* Show subjects taught in this class */}
                      {subjectsInClass.length > 0 && (
                        <p className="text-xs text-gray-500 mt-1">
                          Subjects: {subjectsInClass.join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* Teachers assigned to this class */}
                  {classTeacherAssignments.length > 0 && (
                    <div className="mb-4 p-3 bg-white rounded-lg border border-gray-200">
                      <div className="flex items-center gap-2 mb-2">
                        <GraduationCap size={16} className="text-blue-600" />
                        <span className="text-sm font-medium text-gray-700">Teachers:</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {Array.from(new Set(classTeacherAssignments.map(a => a.teacherName))).map((teacher, idx) => (
                          <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                            {teacher}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="grid grid-cols-3 gap-4 mb-3">
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="text-2xl font-bold text-green-600">{classReadiness.readyStudents}</div>
                      <div className="text-sm text-gray-600">Complete</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="text-2xl font-bold text-yellow-600">{classReadiness.incompleteStudents}</div>
                      <div className="text-sm text-gray-600">Incomplete</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-200">
                      <div className="text-2xl font-bold text-blue-600">{classReadiness.completionPercentage}%</div>
                      <div className="text-sm text-gray-600">Ready</div>
                    </div>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all ${
                        classReadiness.completionPercentage === 100 ? 'bg-green-500' : 'bg-yellow-500'
                      }`}
                      style={{ width: `${classReadiness.completionPercentage}%` }}
                    />
                  </div>
                </div>
                {classReadiness.incompleteStudents > 0 && (
                  <button
                    onClick={() => setShowMissingDataModal(true)}
                    className="ml-4 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm font-medium"
                  >
                    View Missing Data →
                  </button>
                )}
              </div>
              {classReadiness.completionPercentage < 100 && (
                <div className="mt-4 p-3 bg-yellow-100 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    <Info size={14} className="inline mr-1" />
                    {classReadiness.incompleteStudents} student{classReadiness.incompleteStudents !== 1 ? 's' : ''} missing results.
                    Reports can still be generated but will be marked as incomplete.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <p className="text-gray-600 text-sm">Total Students</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalStudents}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <p className="text-gray-600 text-sm">Avg Percentage</p>
              <p className="text-3xl font-bold text-blue-600 mt-2">{stats.averagePercentage}%</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <p className="text-gray-600 text-sm">Pass Rate</p>
              <p className="text-3xl font-bold text-green-600 mt-2">{stats.passRate}%</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <p className="text-gray-600 text-sm">Distinctions</p>
              <p className="text-3xl font-bold text-purple-600 mt-2">{stats.topGrades}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <p className="text-gray-600 text-sm">Complete</p>
              <p className="text-3xl font-bold text-green-600 mt-2">{stats.completeReports}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <p className="text-gray-600 text-sm">Incomplete</p>
              <p className="text-3xl font-bold text-yellow-600 mt-2">{stats.incompleteReports}</p>
            </div>
          </div>

          <div className="mb-8 bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-4">
              <Filter size={20} className="text-gray-500" />
              <h3 className="font-semibold text-gray-900">Filter Report Cards</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Search size={16} className="inline mr-1" />
                  Search Students
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Name or ID..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2.5 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <BookOpen size={16} className="inline mr-1" />
                  Class
                </label>
                <select
                  value={selectedClass}
                  onChange={e => setSelectedClass(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Classes</option>
                  {classOptions.map(cls => (
                    <option key={cls.id} value={cls.id}>{cls.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Award size={16} className="inline mr-1" />
                  Status
                </label>
                <select
                  value={selectedStatus}
                  onChange={e => setSelectedStatus(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Status</option>
                  <option value="pass">Passed</option>
                  <option value="fail">Needs Help</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Users size={16} className="inline mr-1" />
                  Form
                </label>
                <select
                  value={selectedForm}
                  onChange={e => setSelectedForm(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Forms</option>
                  {formOptions.map(form => (
                    <option key={form} value={form}>Form {form}</option>
                  ))}
                </select>
              </div>
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar size={16} className="inline mr-1" />
                  Term & Year
                </label>
                <div className="flex gap-2">
                  <select
                    value={selectedTerm}
                    onChange={e => setSelectedTerm(e.target.value)}
                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {terms.map(term => (
                      <option key={term} value={term}>{term}</option>
                    ))}
                  </select>
                  <select
                    value={selectedYear}
                    onChange={e => setSelectedYear(Number(e.target.value))}
                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {years.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            
            <div className="mt-4 flex items-center gap-6 p-3 bg-gray-50 rounded-lg">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeIncomplete}
                  onChange={e => setIncludeIncomplete(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Include incomplete reports</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={markMissing}
                  onChange={e => setMarkMissing(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Mark missing data in reports</span>
              </label>
            </div>
            
            <div className="mt-4 flex justify-between items-center">
              <p className="text-sm text-gray-600">
                Showing {filteredRecords.length} of {reportCards.length} report cards
                {stats.incompleteReports > 0 && (
                  <span className="ml-2 text-yellow-700">
                    ({stats.incompleteReports} incomplete)
                  </span>
                )}
              </p>
              <button
                onClick={() => refetch()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                Refresh Data
              </button>
            </div>
          </div>

          {filteredRecords.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredRecords.map((reportCard) => (
                <StudentCard
                  key={reportCard.studentId}
                  reportCard={reportCard}
                  onViewDetails={handleViewDetails}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <FileText size={48} className="mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No report cards found</h3>
              <p className="text-gray-600 mb-4">
                {reportCards.length === 0
                  ? `No report cards have been generated for ${selectedTerm} ${selectedYear}. Generate results first.`
                  : 'Try adjusting your filters to find what you\'re looking for.'
                }
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedClass('all');
                    setSelectedStatus('all');
                    setSelectedForm('all');
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Clear all filters
                </button>
                {reportCards.length === 0 && (
                  <button
                    onClick={() => refetch()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Generate Reports
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </DashboardLayout>
      
      {selectedReportCard && (
        <ReportDetailModal
          isOpen={showReportModal}
          onClose={() => {
            setShowReportModal(false);
            setSelectedStudent(null);
          }}
          reportCard={selectedReportCard}
          onAction={handleModalAction}
        />
      )}
      
      {classReadiness && (
        <MissingDataModal
          isOpen={showMissingDataModal}
          onClose={() => setShowMissingDataModal(false)}
          classReadiness={classReadiness}
          teacherAssignments={classTeacherAssignments}
        />
      )}
    </>
  );
}