// @/pages/teacher/ResultsEntry.tsx - COMPLETE FIXED VERSION
import { DashboardLayout } from '@/components/DashboardLayout';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  Save, 
  Loader2, 
  Users, 
  BookOpen, 
  AlertCircle, 
  CheckCircle, 
  XCircle, 
  GraduationCap, 
  Lock,
  Download,
  Edit3,
  Trash2,
  History,
  UserX
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useResults, useSubjectCompletion } from '@/hooks/useResults';
import { useExamConfig } from '@/hooks/useExamConfig';
import { learnerService } from '@/services/schoolService';
import { useSchoolClasses } from '@/hooks/useSchoolClasses';
import { useTeacherAssignments } from '@/hooks/useTeacherAssignments';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { calculateGrade } from '@/services/resultsService';

// ==================== INTERFACES ====================
interface StudentResultInput {
  id: string;
  studentId: string;
  name: string;
  marks: string;
}

interface SavedDraft {
  id: string;
  classId: string;
  className: string;
  subject: string;
  examType: 'week4' | 'week8' | 'endOfTerm';
  term: string;
  year: number;
  totalMarks: number;
  results: StudentResultInput[];
  lastModified: string;
  completedCount: number;
  totalStudents: number;
}

interface ExtendedSubjectCompletion {
  subjectName: string;
  totalStudents: number;
  percentComplete: number;
  week4Complete: boolean;
  week8Complete: boolean;
  endOfTermComplete: boolean;
  enteredStudents: {
    week4: number;
    week8: number;
    endOfTerm: number;
  };
  enteredStudentIds?: {
    week4: string[];
    week8: string[];
    endOfTerm: string[];
  };
  savedMarks?: Record<string, number>;
}

interface ClassInfo {
  id: string;
  name: string;
  students?: number;
  teachers?: string[];
  formTeacherId?: string;
}

interface ExamDataItem {
  studentId: string;
  studentName: string;
  marks: number;
  student_id?: string;
}

interface ExamData {
  week4: ExamDataItem[];
  week8: ExamDataItem[];
  endOfTerm: ExamDataItem[];
}

// ==================== AVAILABLE EXAM TYPES BASED ON CONFIG ====================
const getAvailableExamTypes = (config: any) => {
  if (!config?.examTypes) return [];
  
  const types = [];
  if (config.examTypes.week4) types.push({ id: 'week4', label: 'Week 4', shortLabel: 'W4' });
  if (config.examTypes.week8) types.push({ id: 'week8', label: 'Week 8', shortLabel: 'W8' });
  if (config.examTypes.endOfTerm) types.push({ id: 'endOfTerm', label: 'End of Term', shortLabel: 'EOT' });
  return types;
};

// ==================== GRADE BADGE ====================
const GradeBadge = ({ grade }: { grade: number | null }) => {
  if (grade === null) return <span className="text-gray-300 text-xs">—</span>;
  if (grade === -1) return <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md text-xs font-mono">X</span>;
  
  const colors: Record<number, string> = {
    1: 'bg-green-600 text-white',
    2: 'bg-green-500 text-white',
    3: 'bg-blue-500 text-white',
    4: 'bg-blue-400 text-white',
    5: 'bg-cyan-500 text-white',
    6: 'bg-cyan-400 text-white',
    7: 'bg-yellow-500 text-white',
    8: 'bg-orange-500 text-white',
    9: 'bg-red-500 text-white',
  };
  
  return (
    <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${colors[grade] || 'bg-gray-500 text-white'}`}>
      {grade}
    </span>
  );
};

// ==================== STUDENT ROW ====================
interface StudentRowProps {
  student: StudentResultInput;
  index: number;
  totalMarks: number;
  onMarksChange: (studentId: string, marks: string) => void;
  inputRef?: React.RefObject<HTMLInputElement>;
  onEnterPress?: () => void;
  isMobile: boolean;
  disabled?: boolean;
  showExistingMark?: number | null;
  onMarkAbsent?: (studentId: string) => void;
}

const StudentRow = ({ 
  student, 
  index, 
  totalMarks, 
  onMarksChange, 
  inputRef, 
  onEnterPress,
  isMobile,
  disabled = false,
  showExistingMark,
  onMarkAbsent
}: StudentRowProps) => {
  const marks = student.marks || '';
  const isAbsent = marks.toLowerCase() === 'x';
  const marksNum = marks && !isAbsent ? parseInt(marks) : null;
  const percentage = marksNum !== null ? ((marksNum / totalMarks) * 100).toFixed(0) : null;
  const grade = marksNum !== null 
    ? calculateGrade(parseFloat(percentage || '0'))
    : isAbsent ? -1 : null;

  const hasExistingMark = showExistingMark !== undefined && showExistingMark !== null && marks === '';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' && onEnterPress) {
      e.preventDefault();
      onEnterPress();
    }
    if (e.key === 'ArrowDown' && onEnterPress) {
      e.preventDefault();
      onEnterPress();
    }
  };

  const handleMarkAbsent = () => {
    if (onMarkAbsent) {
      onMarkAbsent(student.id);
    }
  };

  if (isMobile) {
    return (
      <div className="bg-white border-b border-gray-100 p-3 last:border-b-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-xs font-medium text-gray-400 w-5">{index + 1}</span>
            <span className="font-medium text-gray-900 text-sm truncate">{student.name}</span>
          </div>
          <GradeBadge grade={grade} />
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={marks}
              onChange={e => onMarksChange(student.id, e.target.value)}
              onKeyDown={handleKeyDown}
              ref={inputRef}
              placeholder={disabled ? "Locked" : hasExistingMark ? `${showExistingMark}` : "0"}
              className={`
                w-full px-3 py-2.5 border rounded-lg text-base font-medium
                focus:ring-2 focus:ring-blue-500 focus:border-transparent
                ${disabled 
                  ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed' 
                  : hasExistingMark
                    ? 'bg-green-50 border-green-300 text-green-700'
                    : 'border-gray-300'
                }
              `}
              inputMode="numeric"
              disabled={disabled}
            />
            {!disabled && marks && !isAbsent && marksNum !== null && (
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 text-xs text-gray-500">
                {marksNum}/{totalMarks}
              </div>
            )}
          </div>
          {!disabled && (
            <button
              onClick={handleMarkAbsent}
              className={`p-2 rounded-lg transition-colors ${
                isAbsent 
                  ? 'bg-gray-700 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title="Mark as absent"
            >
              <UserX size={16} />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <tr className={`hover:bg-gray-50/50 transition-colors group ${disabled ? 'opacity-75' : ''}`}>
      <td className="px-3 py-2.5 text-xs text-gray-500 font-mono">{index + 1}</td>
      <td className="px-3 py-2.5">
        <div className="font-medium text-gray-900 text-sm truncate max-w-[180px]" title={student.name}>
          {student.name}
        </div>
        <div className="text-xs text-gray-400 font-mono">{student.studentId.slice(-6)}</div>
      </td>
      <td className="px-3 py-2.5">
        <div className="relative w-24">
          <input
            type="text"
            value={marks}
            onChange={e => onMarksChange(student.id, e.target.value)}
            onKeyDown={handleKeyDown}
            ref={inputRef}
            placeholder={disabled ? "—" : hasExistingMark ? `${showExistingMark}` : "0"}
            className={`
              w-full px-2 py-1.5 border rounded-lg text-sm font-medium text-center
              focus:ring-2 focus:ring-blue-500 focus:border-transparent
              ${disabled 
                ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed' 
                : hasExistingMark
                  ? 'bg-green-50 border-green-300 text-green-700'
                  : 'border-gray-300'
              }
            `}
            inputMode="numeric"
            disabled={disabled}
          />
          {!disabled && marks && !isAbsent && marksNum !== null && (
            <div className="absolute right-1 top-1/2 transform -translate-y-1/2 text-[10px] text-gray-400">
              /{totalMarks}
            </div>
          )}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <GradeBadge grade={grade} />
      </td>
      <td className="px-3 py-2.5">
        {!disabled && (
          <button
            onClick={handleMarkAbsent}
            className={`p-1.5 rounded-lg transition-colors ${
              isAbsent 
                ? 'bg-gray-700 text-white' 
                : 'text-gray-500 hover:bg-gray-100'
            }`}
            title="Mark as absent"
          >
            <UserX size={16} />
          </button>
        )}
      </td>
    </tr>
  );
};

// ==================== SUBJECT PROGRESS BAR ====================
interface SubjectProgressProps {
  completion: ExtendedSubjectCompletion;
  selectedExamType: string;
  onExamTypeChange: (type: 'week4' | 'week8' | 'endOfTerm') => void;
  hasDraft?: boolean;
  availableExamTypes: Array<{ id: string; label: string; shortLabel: string }>;
  examConfig: any;
}

const SubjectProgress = ({ 
  completion, 
  selectedExamType,
  onExamTypeChange,
  hasDraft,
  availableExamTypes,
  examConfig
}: SubjectProgressProps) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  if (!completion) return null;
  
  const examTypes = availableExamTypes.map(type => {
    const isComplete = completion[`${type.id}Complete` as keyof ExtendedSubjectCompletion] as boolean || false;
    const count = completion.enteredStudents[type.id as keyof typeof completion.enteredStudents] || 0;
    const totalMarks = examConfig?.[`${type.id}TotalMarks`] || 100;
    
    return {
      id: type.id,
      label: type.shortLabel,
      fullLabel: type.label,
      isComplete,
      count,
      totalMarks
    };
  });

  // Determine which exams are enabled (sequential unlocking)
  const enabledStates = useMemo(() => {
    const states: Record<string, boolean> = {};
    
    examTypes.forEach((exam, index) => {
      if (index === 0) {
        states[exam.id] = true; // First exam always enabled
      } else {
        const previousExam = examTypes[index - 1];
        states[exam.id] = previousExam.isComplete;
      }
    });
    
    return states;
  }, [examTypes]);

  // FIXED: Calculate overall progress based on configured exams only
  const totalConfiguredExams = examTypes.length;
  const completedExams = examTypes.filter(exam => exam.isComplete).length;
  const progressPercentage = totalConfiguredExams > 0 
    ? Math.round((completedExams / totalConfiguredExams) * 100) 
    : 0;

  // Grid columns based on number of exam types
  const gridCols = examTypes.length === 3 ? 'grid-cols-3' : examTypes.length === 2 ? 'grid-cols-2' : 'grid-cols-1';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <GraduationCap size={16} className="text-gray-500 flex-shrink-0" />
          <span className="text-sm font-medium text-gray-700">
            {completion.subjectName}
          </span>
          {hasDraft && (
            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
              Draft
            </span>
          )}
        </div>
        <span className="text-xs text-gray-500">
          {progressPercentage}% complete ({completedExams}/{totalConfiguredExams} exams)
        </span>
      </div>
      
      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden mb-4">
        <div 
          className="h-full bg-blue-500 rounded-full transition-all duration-500"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
      
      <div className={`grid ${gridCols} gap-1.5 sm:gap-2`}>
        {examTypes.map((exam) => {
          const isSelected = selectedExamType === exam.id;
          const isEnabled = enabledStates[exam.id];
          
          return (
            <button
              key={exam.id}
              onClick={() => isEnabled && onExamTypeChange(exam.id as any)}
              disabled={!isEnabled}
              className={`
                relative flex flex-col items-center p-1.5 sm:p-2 rounded-lg transition-all
                ${isSelected 
                  ? 'bg-blue-50 border-2 border-blue-500' 
                  : 'border-2 border-transparent'
                }
                ${!isEnabled 
                  ? 'opacity-50 cursor-not-allowed bg-gray-50' 
                  : 'hover:bg-gray-50 cursor-pointer'
                }
              `}
            >
              <div className="flex items-center gap-1 mb-0.5 sm:mb-1">
                <span className={`text-xs font-semibold ${
                  exam.isComplete ? 'text-green-600' : isSelected ? 'text-blue-600' : 'text-gray-600'
                }`}>
                  {exam.label}
                </span>
                {exam.isComplete ? (
                  <CheckCircle size={10} className="text-green-500 flex-shrink-0" />
                ) : !isEnabled && !exam.isComplete ? (
                  <Lock size={8} className="text-gray-400 flex-shrink-0" />
                ) : null}
              </div>
              <span className="text-[10px] text-gray-500">
                {exam.count}/{completion.totalStudents}
              </span>
              <span className="text-[8px] text-gray-400 mt-0.5">
                {exam.totalMarks} marks
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ==================== DRAFT CARD ====================
interface DraftCardProps {
  draft: SavedDraft;
  onLoad: () => void;
  onDelete: () => void;
}

const DraftCard = ({ draft, onLoad, onDelete }: DraftCardProps) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md transition-all">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <h4 className="font-medium text-gray-900 text-sm truncate">
            {draft.className} • {draft.subject}
          </h4>
          <p className="text-xs text-gray-500 truncate">
            {draft.examType} • {draft.term} {draft.year}
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onLoad}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Load draft"
          >
            <Edit3 size={14} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete draft"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-600">
          {draft.completedCount}/{draft.totalStudents} entered
        </span>
        <span className="text-gray-400">
          {new Date(draft.lastModified).toLocaleTimeString()}
        </span>
      </div>
      <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div 
          className="h-full bg-yellow-500 rounded-full"
          style={{ width: `${(draft.completedCount / draft.totalStudents) * 100}%` }}
        />
      </div>
    </div>
  );
};

// ==================== MARK SCHEDULE PDF PREVIEW ====================
interface MarksPDFPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  students: StudentResultInput[];
  classInfo: ClassInfo | null;
  subject: string;
  examType: 'week4' | 'week8' | 'endOfTerm';
  term: string;
  year: number;
  totalMarks: number;
  onDownload: () => void;
  allExamData: ExamData | null;
  loadingAllData: boolean;
}

const MarksPDFPreview = ({ 
  isOpen, 
  onClose, 
  students, 
  classInfo, 
  subject, 
  examType, 
  term, 
  year, 
  totalMarks,
  onDownload,
  allExamData,
  loadingAllData
}: MarksPDFPreviewProps) => {
  const isMobile = useMediaQuery('(max-width: 640px)');

  const savedMarksMap = useMemo(() => {
    const map = new Map();
    
    if (allExamData) {
      const currentExamData = allExamData[examType] || [];
      currentExamData.forEach((item: ExamDataItem) => {
        if (item.studentId) {
          map.set(item.studentId, {
            marks: item.marks,
            isSaved: true
          });
        }
        if (item.student_id) {
          map.set(item.student_id, {
            marks: item.marks,
            isSaved: true
          });
        }
      });
    }
    
    return map;
  }, [allExamData, examType]);

  const displayStudents = useMemo(() => {
    return students.map((student: StudentResultInput) => {
      let saved = savedMarksMap.get(student.studentId);
      if (!saved) {
        saved = savedMarksMap.get(student.id);
      }
      
      let displayMarks = student.marks;
      let isFromSaved = false;
      
      if ((!displayMarks || displayMarks === '') && saved) {
        if (saved.marks === -1) {
          displayMarks = 'X';
        } else if (saved.marks >= 0) {
          displayMarks = saved.marks.toString();
        }
        isFromSaved = true;
      }
      
      // Calculate percentage and grade for display
      let percentage = null;
      let grade = null;
      const marksNum = displayMarks && displayMarks.toLowerCase() !== 'x' ? parseInt(displayMarks) : null;
      
      if (marksNum !== null) {
        percentage = ((marksNum / totalMarks) * 100).toFixed(1);
        grade = calculateGrade(parseFloat(percentage));
      } else if (displayMarks?.toLowerCase() === 'x') {
        grade = -1;
      }
      
      return {
        ...student,
        displayMarks,
        isFromSaved,
        percentage,
        grade
      };
    });
  }, [students, savedMarksMap, totalMarks]);

  if (!isOpen) return null;

  const completedCount = displayStudents.filter((s: any) => 
    s.displayMarks && s.displayMarks !== ''
  ).length;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="flex min-h-full items-center justify-center p-2 sm:p-4">
        <div className="relative bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
          
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 rounded-t-2xl px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">Mark Schedule Preview</h2>
              <p className="text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1 truncate">
                {classInfo?.name} • {subject} • {examType === 'week4' ? 'Week 4' : examType === 'week8' ? 'Week 8' : 'End of Term'} • {term} {year}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={onDownload}
                disabled={loadingAllData}
                className="inline-flex items-center justify-center gap-1 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm sm:text-base"
              >
                {loadingAllData ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Download size={14} />
                )}
                <span className="hidden xs:inline">{loadingAllData ? 'Loading...' : 'Download'}</span>
              </button>
              <button
                onClick={onClose}
                className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <XCircle size={18} className="text-gray-500" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-3 sm:p-6">
            <div className="min-w-[300px] sm:min-w-[600px]">
              {/* School Header */}
              <div className="text-center mb-4 sm:mb-6">
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900">MINISTRY OF EDUCATION</h1>
                <h2 className="text-base sm:text-xl font-semibold text-gray-800 mt-0.5 sm:mt-1">KALABO BOARDING SECONDARY SCHOOL</h2>
                <h3 className="text-sm sm:text-lg font-medium text-blue-600 mt-1 sm:mt-2">MARK SCHEDULE</h3>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-50 rounded-lg text-xs sm:text-sm">
                <div className="min-w-0">
                  <p className="text-gray-500">Class</p>
                  <p className="font-medium truncate">{classInfo?.name}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-gray-500">Subject</p>
                  <p className="font-medium truncate">{subject}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-gray-500">Exam</p>
                  <p className="font-medium truncate">{examType === 'week4' ? 'Week 4' : examType === 'week8' ? 'Week 8' : 'End of Term'}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-gray-500">Marks</p>
                  <p className="font-medium">{totalMarks}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-gray-500">Term</p>
                  <p className="font-medium truncate">{term} {year}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-gray-500">Students</p>
                  <p className="font-medium">{students.length}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-gray-500">Entered</p>
                  <p className="font-medium text-green-600">{completedCount}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-gray-500">Teacher</p>
                  <p className="font-medium truncate">—</p>
                </div>
              </div>

              {loadingAllData && (
                <div className="text-center py-6 sm:py-8">
                  <Loader2 className="animate-spin text-blue-600 mx-auto mb-2" size={24} />
                  <p className="text-sm text-gray-600">Fetching exam data...</p>
                </div>
              )}

              {/* Table */}
              {!loadingAllData && (
                <div className="overflow-x-auto -mx-3 sm:-mx-6">
                  <div className="inline-block min-w-full align-middle px-3 sm:px-6">
                    <table className="w-full border-collapse text-xs sm:text-sm">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="px-2 sm:px-3 py-2 text-left font-semibold text-gray-700 border border-gray-300 w-10 sm:w-12">#</th>
                          <th className="px-2 sm:px-3 py-2 text-left font-semibold text-gray-700 border border-gray-300">Student Name</th>
                          <th className="px-2 sm:px-3 py-2 text-left font-semibold text-gray-700 border border-gray-300 hidden sm:table-cell">Student ID</th>
                          <th className="px-2 sm:px-3 py-2 text-center font-semibold text-gray-700 border border-gray-300 w-16 sm:w-20">Marks</th>
                          <th className="px-2 sm:px-3 py-2 text-center font-semibold text-gray-700 border border-gray-300 w-16 sm:w-20">%</th>
                          <th className="px-2 sm:px-3 py-2 text-center font-semibold text-gray-700 border border-gray-300 w-12 sm:w-16">Grade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayStudents.map((student: any, index: number) => {
                          const marks = student.displayMarks;
                          const isAbsent = marks?.toLowerCase() === 'x';
                          
                          let marksNum = null;
                          if (!isAbsent && marks && marks !== '') {
                            marksNum = parseInt(marks);
                          }
                          
                          const percentage = marksNum !== null ? ((marksNum / totalMarks) * 100).toFixed(1) : null;
                          const grade = marksNum !== null 
                            ? calculateGrade(parseFloat(percentage || '0'))
                            : isAbsent ? -1 : null;

                          return (
                            <tr key={student.id} className={`hover:bg-gray-50 ${student.isFromSaved ? 'bg-green-50/30' : ''}`}>
                              <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-gray-500 border border-gray-300">{index + 1}</td>
                              <td className="px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300">
                                <div className="truncate max-w-[120px] sm:max-w-none" title={student.name}>
                                  {student.name}
                                </div>
                                <div className="text-xs text-gray-500 sm:hidden">{student.studentId.slice(-6)}</div>
                              </td>
                              <td className="px-2 sm:px-3 py-1.5 sm:py-2 font-mono text-gray-600 border border-gray-300 hidden sm:table-cell">{student.studentId}</td>
                              <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-center border border-gray-300">
                                {marks ? (
                                  <span className={`font-medium ${isAbsent ? 'text-gray-500 italic' : student.isFromSaved ? 'text-green-700' : ''}`}>
                                    {isAbsent ? 'ABS' : marks}
                                  </span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                              <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-center border border-gray-300">
                                {percentage ? (
                                  <span className="font-medium text-gray-700">{percentage}%</span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                              <td className="px-2 sm:px-3 py-1.5 sm:py-2 text-center border border-gray-300">
                                {grade !== null ? (
                                  <GradeBadge grade={grade} />
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="mt-3 sm:mt-4 text-[10px] sm:text-xs text-gray-500 text-right">
                Generated: {new Date().toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== SKELETON ====================
const TableSkeleton = () => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="h-5 bg-gray-200 rounded w-32 sm:w-48"></div>
      </div>
      <div className="divide-y divide-gray-100">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="p-3 sm:p-4 flex flex-wrap items-center gap-2 sm:gap-4">
            <div className="w-5 h-4 bg-gray-200 rounded"></div>
            <div className="flex-1 h-4 bg-gray-200 rounded min-w-[120px]"></div>
            <div className="w-16 sm:w-20 h-8 bg-gray-200 rounded"></div>
            <div className="w-10 h-6 bg-gray-200 rounded"></div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ==================== EMPTY STATE ====================
interface EmptyStateProps {
  hasClass: boolean;
  hasSubject: boolean;
  hasStudents: boolean;
  noExamsConfigured?: boolean;
}

const EmptyState = ({ 
  hasClass, 
  hasSubject, 
  hasStudents,
  noExamsConfigured
}: EmptyStateProps) => {
  const isMobile = useMediaQuery('(max-width: 640px)');
  
  if (noExamsConfigured) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-yellow-100 rounded-full mb-3 sm:mb-4">
          <AlertCircle className="text-yellow-600" size={isMobile ? 24 : 32} />
        </div>
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1 sm:mb-2">No Exams Configured</h3>
        <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto">
          No exams have been configured for this term. Please contact the administrator to set up exam configurations.
        </p>
      </div>
    );
  }
  
  if (!hasClass) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-gray-100 rounded-full mb-3 sm:mb-4">
          <BookOpen className="text-gray-400" size={isMobile ? 24 : 32} />
        </div>
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1 sm:mb-2">Select a class to begin</h3>
        <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto">
          Choose a class from the dropdown above. Your assigned classes will appear based on your teaching assignments.
        </p>
      </div>
    );
  }
  
  if (!hasSubject) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-yellow-100 rounded-full mb-3 sm:mb-4">
          <AlertCircle className="text-yellow-600" size={isMobile ? 24 : 32} />
        </div>
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1 sm:mb-2">No subject selected</h3>
        <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto">
          {hasClass ? 
            "You don't teach any subjects in this class. If you're the form teacher but not a subject teacher, you cannot enter results." :
            "Please select a subject you're assigned to teach for this class."
          }
        </p>
      </div>
    );
  }
  
  if (!hasStudents) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-gray-100 rounded-full mb-3 sm:mb-4">
          <Users className="text-gray-400" size={isMobile ? 24 : 32} />
        </div>
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1 sm:mb-2">No students enrolled</h3>
        <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto">
          This class doesn't have any enrolled students yet. Contact the administrator to add students.
        </p>
      </div>
    );
  }
  
  return null;
};

// ==================== EDIT MODE INDICATOR ====================
interface EditModeIndicatorProps {
  isEditing: boolean;
  onCancelEdit: () => void;
}

const EditModeIndicator = ({ isEditing, onCancelEdit }: EditModeIndicatorProps) => {
  if (!isEditing) return null;
  
  return (
    <div className="bg-amber-50 border-l-4 border-amber-500 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div className="flex items-center gap-2 sm:gap-3">
        <Edit3 size={18} className="text-amber-600 flex-shrink-0" />
        <div className="min-w-0">
          <p className="font-medium text-amber-800 text-sm sm:text-base">Edit Mode Active</p>
          <p className="text-xs sm:text-sm text-amber-700 truncate">Changes will overwrite saved data.</p>
        </div>
      </div>
      <button
        onClick={onCancelEdit}
        className="px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 text-xs sm:text-sm font-medium self-start sm:self-center"
      >
        Cancel Edit
      </button>
    </div>
  );
};

// ==================== MAIN COMPONENT ====================
export default function ResultsEntry() {
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 640px)');
  const isSmallMobile = useMediaQuery('(max-width: 380px)');
  
  const inputElements = useRef<Map<string, HTMLInputElement>>(new Map());
  const tableContainerRef = useRef<HTMLDivElement>(null);
  
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [examType, setExamType] = useState<'week4' | 'week8' | 'endOfTerm'>('week4');
  const [term, setTerm] = useState('Term 1');
  const [year, setYear] = useState(new Date().getFullYear());
  
  const [students, setStudents] = useState<StudentResultInput[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selectedClassData, setSelectedClassData] = useState<ClassInfo | null>(null);
  
  const [drafts, setDrafts] = useState<SavedDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  
  const [showPDFPreview, setShowPDFPreview] = useState(false);
  const [allExamData, setAllExamData] = useState<ExamData | null>(null);
  const [loadingAllData, setLoadingAllData] = useState(false);

  const [isEditMode, setIsEditMode] = useState(false);
  const [originalResults, setOriginalResults] = useState<Map<string, number>>(new Map());

  const { classes, isLoading: loadingClasses } = useSchoolClasses({ isActive: true });
  
  // Get exam configuration for the selected term and year
  const { 
    configs: examConfigs, 
    isLoading: loadingExamConfig 
  } = useExamConfig({ year, term });
  
  const currentExamConfig = examConfigs?.[0];
  
  // Determine available exam types based on config
  const availableExamTypes = useMemo(() => {
    return getAvailableExamTypes(currentExamConfig);
  }, [currentExamConfig]);
  
  // Get total marks from config
  const totalMarks = useMemo(() => {
    if (!currentExamConfig || !examType) return 100;
    return currentExamConfig[`${examType}TotalMarks`] || 100;
  }, [currentExamConfig, examType]);
  
  const { assignments, getSubjectsForClass, isLoading: loadingAssignments } = useTeacherAssignments(user?.uid);
  
  const { saveResults, isSaving, checkExisting, editResults, isEditing } = useResults();
  
  const {
    completionStatus,
    isLoading: loadingCompletion,
    refetch: refetchCompletion
  } = useSubjectCompletion({
    classId: selectedClass,
    term,
    year,
  });

  // Debug effect to verify assignments
  useEffect(() => {
    if (user?.uid) {
      console.log('👤 Teacher UID:', user.uid);
      console.log('📚 Teacher assignments:', assignments);
      console.log('🎯 getSubjectsForClass function available:', !!getSubjectsForClass);
    }
  }, [user, assignments, getSubjectsForClass]);

  // Load drafts from localStorage
  useEffect(() => {
    const savedDrafts = localStorage.getItem('results_drafts');
    if (savedDrafts) {
      try {
        setDrafts(JSON.parse(savedDrafts));
      } catch (e) {
        console.error('Failed to load drafts:', e);
      }
    }
  }, []);

  const saveDrafts = useCallback((newDrafts: SavedDraft[]) => {
    setDrafts(newDrafts);
    localStorage.setItem('results_drafts', JSON.stringify(newDrafts));
  }, []);

  // Get all classes the teacher is assigned to
  const assignedClasses = useMemo(() => {
    if (!user?.uid || !classes.length) return [];
    return classes.filter((cls: ClassInfo) => 
      cls.teachers?.includes(user.uid) || 
      cls.formTeacherId === user.uid
    );
  }, [classes, user?.uid]);

  // Get subjects the teacher actually teaches in the selected class
  const availableSubjects = useMemo(() => {
    if (!selectedClass || !user?.uid) return [];
    return getSubjectsForClass(selectedClass);
  }, [selectedClass, user?.uid, getSubjectsForClass]);

  // Check if teacher is ONLY a form teacher (no subjects) in this class
  const isOnlyFormTeacher = useMemo(() => {
    if (!selectedClass || !user?.uid) return false;
    const subjects = getSubjectsForClass(selectedClass);
    return subjects.length === 0;
  }, [selectedClass, user?.uid, getSubjectsForClass]);

  const currentSubjectCompletion = useMemo(() => {
    if (!selectedSubject || !completionStatus.length) return null;
    return completionStatus.find((s: any) => s.subjectName === selectedSubject) as ExtendedSubjectCompletion | null;
  }, [selectedSubject, completionStatus]);

  const currentDraft = useMemo(() => {
    return drafts.find(d => 
      d.classId === selectedClass &&
      d.subject === selectedSubject &&
      d.examType === examType &&
      d.term === term &&
      d.year === year
    );
  }, [drafts, selectedClass, selectedSubject, examType, term, year]);

  // Load draft data
  useEffect(() => {
    if (currentDraft && currentDraft.id !== activeDraftId) {
      setStudents(currentDraft.results);
      setActiveDraftId(currentDraft.id);
    } else if (!currentDraft && activeDraftId) {
      setActiveDraftId(null);
      setStudents(prev => prev.map(s => ({ ...s, marks: '' })));
    }
  }, [currentDraft, activeDraftId]);

  // Check if current exam type is completed
  const isExamCompleted = useMemo(() => {
    if (!currentSubjectCompletion || !examType) return false;
    return currentSubjectCompletion[`${examType}Complete` as keyof ExtendedSubjectCompletion] as boolean || false;
  }, [currentSubjectCompletion, examType]);

  // Check if exam type is enabled (based on previous exams completion)
  const isExamTypeEnabled = useCallback((type: 'week4' | 'week8' | 'endOfTerm') => {
    if (!currentSubjectCompletion || !availableExamTypes.length) return type === availableExamTypes[0]?.id;
    
    const examIndex = availableExamTypes.findIndex(t => t.id === type);
    if (examIndex === 0) return true;
    if (examIndex === -1) return false;
    
    const previousExam = availableExamTypes[examIndex - 1];
    return currentSubjectCompletion[`${previousExam.id}Complete` as keyof ExtendedSubjectCompletion] as boolean || false;
  }, [currentSubjectCompletion, availableExamTypes]);

  // Auto-select first available exam type
  useEffect(() => {
    if (availableExamTypes.length > 0) {
      const firstType = availableExamTypes[0].id as 'week4' | 'week8' | 'endOfTerm';
      if (!availableExamTypes.some(t => t.id === examType)) {
        setExamType(firstType);
      }
    }
  }, [availableExamTypes, examType]);

  // Auto-select subject if there's exactly one
  useEffect(() => {
    if (availableSubjects.length === 1 && !selectedSubject) {
      setSelectedSubject(availableSubjects[0]);
    }
  }, [availableSubjects, selectedSubject]);

  // Load students
  useEffect(() => {
    const loadStudents = async () => {
      if (!selectedClass) {
        setStudents([]);
        setSelectedClassData(null);
        return;
      }

      setLoadingStudents(true);
      try {
        const classInfo = assignedClasses.find(c => c.id === selectedClass);
        setSelectedClassData(classInfo || null);
        
        if (!classInfo) {
          setSelectedClass('');
          setStudents([]);
          return;
        }
        
        const learners = await learnerService.getLearnersByClass(selectedClass);
        learners.sort((a, b) => a.name.localeCompare(b.name));
        
        setStudents(
          learners.map(learner => ({
            id: learner.id,
            studentId: learner.studentId,
            name: learner.name,
            marks: '',
          }))
        );
      } catch (error) {
        console.error('Error loading students:', error);
        setStudents([]);
        setSelectedClassData(null);
      } finally {
        setLoadingStudents(false);
      }
    };

    loadStudents();
  }, [selectedClass, assignedClasses]);

  // Auto-save draft
  useEffect(() => {
    if (!selectedClass || !selectedSubject || !students.length || !selectedClassData || isEditMode) return;

    const filledCount = students.filter(s => s.marks && s.marks !== '').length;
    if (filledCount === 0) {
      if (currentDraft) {
        const newDrafts = drafts.filter(d => d.id !== currentDraft.id);
        saveDrafts(newDrafts);
      }
      return;
    }

    const timer = setTimeout(() => {
      const draftId = currentDraft?.id || `draft_${Date.now()}`;
      const newDraft: SavedDraft = {
        id: draftId,
        classId: selectedClass,
        className: selectedClassData.name,
        subject: selectedSubject,
        examType,
        term,
        year,
        totalMarks,
        results: students.map(s => ({ ...s })),
        lastModified: new Date().toISOString(),
        completedCount: filledCount,
        totalStudents: students.length
      };

      const existingIndex = drafts.findIndex(d => d.id === draftId);
      let newDrafts: SavedDraft[];
      
      if (existingIndex >= 0) {
        newDrafts = [...drafts];
        newDrafts[existingIndex] = newDraft;
      } else {
        newDrafts = [newDraft, ...drafts].slice(0, 10);
      }
      
      saveDrafts(newDrafts);
      setActiveDraftId(draftId);
    }, 2000);

    return () => clearTimeout(timer);
  }, [students, selectedClass, selectedSubject, examType, term, year, totalMarks, selectedClassData, isEditMode, drafts, currentDraft, saveDrafts]);

  const focusNextInput = useCallback((currentStudentId: string) => {
    const currentIndex = students.findIndex(s => s.id === currentStudentId);
    if (currentIndex < students.length - 1) {
      const nextStudent = students[currentIndex + 1];
      const nextInput = inputElements.current.get(nextStudent.id);
      nextInput?.focus();
    }
  }, [students]);

  // Fetch all exam data for PDF preview
  useEffect(() => {
    const fetchAllExamData = async () => {
      if (!showPDFPreview || !selectedClass || !selectedSubject || !checkExisting || !availableExamTypes.length) return;
      
      setLoadingAllData(true);
      
      try {
        const promises = availableExamTypes.map(type => 
          checkExisting({
            classId: selectedClass,
            subjectId: selectedSubject,
            examType: type.id as any,
            term,
            year,
          })
        );
        
        const responses = await Promise.all(promises);
        
        const transformedData: ExamData = {
          week4: [],
          week8: [],
          endOfTerm: []
        };
        
        responses.forEach((response, index) => {
          const examTypeId = availableExamTypes[index].id;
          transformedData[examTypeId as keyof ExamData] = (response?.results || []).map((item: any) => ({
            studentId: item.studentId || item.student_id,
            studentName: item.studentName || item.student_name,
            marks: item.marks,
            student_id: item.student_id
          }));
        });
        
        setAllExamData(transformedData);
        
      } catch (error) {
        console.error('Error fetching exam data:', error);
      } finally {
        setLoadingAllData(false);
      }
    };
    
    fetchAllExamData();
  }, [showPDFPreview, selectedClass, selectedSubject, term, year, checkExisting, availableExamTypes]);

  const handleMarksChange = useCallback((studentId: string, marks: string) => {
    if (marks && marks.toLowerCase() !== 'x' && !/^\d*$/.test(marks)) return;
    
    const marksNum = parseInt(marks);
    if (marks && marks.toLowerCase() !== 'x' && marksNum > totalMarks) return;

    setStudents(prev => prev.map(s =>
      s.id === studentId ? { ...s, marks } : s
    ));
  }, [totalMarks]);

  const handleMarkAbsent = useCallback((studentId: string) => {
    setStudents(prev => prev.map(s =>
      s.id === studentId ? { ...s, marks: s.marks.toLowerCase() === 'x' ? '' : 'x' } : s
    ));
  }, []);

  const handleExamTypeChange = useCallback((type: 'week4' | 'week8' | 'endOfTerm') => {
    if (isExamTypeEnabled(type)) {
      setExamType(type);
      setIsEditMode(false);
    }
  }, [isExamTypeEnabled]);

  const handleEditResults = async () => {
    if (!selectedClass || !selectedSubject || !selectedClassData || !user || !currentSubjectCompletion) return;

    const hasExistingResults = currentSubjectCompletion[`${examType}Complete` as keyof ExtendedSubjectCompletion] as boolean || false;

    if (!hasExistingResults) {
      alert('No results to edit for this exam type.');
      return;
    }

    try {
      const existingResponse = await checkExisting({
        classId: selectedClass,
        subjectId: selectedSubject,
        examType,
        term,
        year,
      });

      if (existingResponse && existingResponse.results && existingResponse.results.length > 0) {
        const originalMap = new Map<string, number>();
        existingResponse.results.forEach((r: any) => {
          originalMap.set(r.studentId || r.student_id, r.marks);
        });
        setOriginalResults(originalMap);

        setStudents(prevStudents => 
          prevStudents.map(student => {
            const existing = existingResponse.results.find((r: any) => 
              (r.studentId === student.studentId || r.student_id === student.studentId)
            );
            return {
              ...student,
              marks: existing ? (existing.marks === -1 ? 'X' : existing.marks.toString()) : '',
            };
          })
        );
      }

      await editResults({
        classId: selectedClass,
        subjectId: selectedSubject,
        examType,
        term,
        year,
      });

      setIsEditMode(true);
      await refetchCompletion();
      
    } catch (error: any) {
      console.error('Error editing results:', error);
      alert(`Failed to unlock: ${error.message || 'Please try again'}`);
    }
  };

  const handleCancelEdit = useCallback(() => {
    if (confirm('Cancel editing? Any unsaved changes will be lost.')) {
      setStudents(prevStudents => 
        prevStudents.map(student => {
          const originalMark = originalResults.get(student.studentId);
          return {
            ...student,
            marks: originalMark !== undefined ? (originalMark === -1 ? 'X' : originalMark.toString()) : '',
          };
        })
      );
      setIsEditMode(false);
      setOriginalResults(new Map());
    }
  }, [originalResults]);

  const handleSaveResults = async () => {
    if (!selectedClass || !selectedSubject || !selectedClassData || !user) return;

    const results = students
      .filter(s => s.marks !== '')
      .map(s => ({
        studentId: s.studentId,
        studentName: s.name,
        marks: s.marks.toLowerCase() === 'x' ? -1 : parseInt(s.marks),
      }));

    if (results.length === 0) {
      alert('Please enter marks for at least one student');
      return;
    }

    try {
      await saveResults({
        classId: selectedClass,
        className: selectedClassData.name,
        subjectId: selectedSubject,
        subjectName: selectedSubject,
        teacherId: user.uid,
        teacherName: user.fullName|| user.email || 'Unknown',
        examType,
        examName: `${examType === 'week4' ? 'Week 4' : examType === 'week8' ? 'Week 8' : 'End of Term'} - ${selectedSubject}`,
        term,
        year,
        totalMarks,
        results,
        overwrite: isEditMode,
      });

      setStudents(prev => prev.map(s => ({ ...s, marks: '' })));
      
      if (currentDraft) {
        const newDrafts = drafts.filter(d => d.id !== currentDraft.id);
        saveDrafts(newDrafts);
      }
      
      setIsEditMode(false);
      setOriginalResults(new Map());
      
      await refetchCompletion();
      
      alert('Results saved successfully!');
      
    } catch (error: any) {
      console.error('Error saving results:', error);
      alert(`Failed to save: ${error.message || 'Please try again'}`);
    }
  };

  const handleLoadDraft = useCallback((draft: SavedDraft) => {
    setSelectedClass(draft.classId);
    setSelectedSubject(draft.subject);
    setExamType(draft.examType);
    setTerm(draft.term);
    setYear(draft.year);
    setStudents(draft.results);
    setActiveDraftId(draft.id);
    setIsEditMode(false);
  }, []);

  const handleDeleteDraft = useCallback((draftId: string) => {
    if (confirm('Delete this draft?')) {
      const newDrafts = drafts.filter(d => d.id !== draftId);
      saveDrafts(newDrafts);
      if (activeDraftId === draftId) {
        setActiveDraftId(null);
      }
    }
  }, [drafts, activeDraftId, saveDrafts]);

  const handleDownloadMarks = useCallback(() => {
    setShowPDFPreview(true);
  }, []);

  // FIXED: PDF Generation with complete data
  const handleGeneratePDF = async () => {
    try {
      const { generateMarkSchedulePDF } = await import('@/services/pdf/markSchedulePDF');
      
      const teacherDisplayName = user?.fullName || user?.email || 'Teacher';
      
      // Create a map of saved marks for quick lookup
      const savedMarksMap = new Map();
      if (allExamData && allExamData[examType]) {
        allExamData[examType].forEach((item: ExamDataItem) => {
          if (item.studentId) savedMarksMap.set(item.studentId, item.marks);
          if (item.student_id) savedMarksMap.set(item.student_id, item.marks);
        });
      }
      
      const studentsForPDF = students.map(student => {
        // Get marks from current input or saved data
        let marksValue = student.marks || '';
        let marksNum = null;
        let percentage = null;
        let grade = null;
        
        // If no current marks, try to get from saved data
        if (marksValue === '' && savedMarksMap.has(student.studentId)) {
          const savedMark = savedMarksMap.get(student.studentId);
          marksValue = savedMark === -1 ? 'X' : savedMark.toString();
        }
        
        // Calculate numeric values if not absent
        const isAbsent = marksValue.toLowerCase() === 'x';
        if (!isAbsent && marksValue && marksValue !== '') {
          marksNum = parseInt(marksValue);
          percentage = ((marksNum / totalMarks) * 100).toFixed(1);
          grade = calculateGrade(parseFloat(percentage || '0'));
        }
        
        return {
          name: student.name,
          studentId: student.studentId,
          marks: marksValue,
          marksNum: marksNum,
          percentage: percentage,
          grade: grade,
          isAbsent: isAbsent
        };
      });

      await generateMarkSchedulePDF({
        className: selectedClassData?.name || '',
        subject: selectedSubject,
        examType,
        term,
        year,
        totalMarks,
        students: studentsForPDF,
        teacherName: teacherDisplayName,
        schoolName: 'KALABO BOARDING SECONDARY SCHOOL',
        allExamData: allExamData || undefined
      });
      
      setShowPDFPreview(false);
    } catch (error) {
      console.error('PDF generation error:', error);
      alert('Failed to generate PDF. Please check console for details.');
    }
  };

  const filledCount = students.filter(s => s.marks && s.marks !== '').length;
  const totalStudents = students.length;
  const completionPercentage = totalStudents > 0 ? Math.round((filledCount / totalStudents) * 100) : 0;
  
  const isCurrentExamLocked = examType && availableExamTypes.length > 0 ? !isExamTypeEnabled(examType) : false;

  // Check if any results exist for this exam type
  const hasExistingResults = currentSubjectCompletion
    ? currentSubjectCompletion[`${examType}Complete` as keyof ExtendedSubjectCompletion] as boolean || false
    : false;

  if (loadingClasses || loadingAssignments || loadingExamConfig) {
    return (
      <DashboardLayout activeTab="results">
        <div className="p-3 sm:p-4 lg:p-6">
          <div className="flex flex-col items-center justify-center min-h-[50vh] sm:min-h-[60vh]">
            <Loader2 className="animate-spin text-blue-600 mb-3 sm:mb-4" size={32} />
            <p className="text-sm sm:text-base text-gray-600">Loading...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Check if exams are configured for this term
  const noExamsConfigured = selectedClass && selectedSubject && availableExamTypes.length === 0;

  return (
    <DashboardLayout activeTab="results">
      <div className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 tracking-tight truncate">
              Results Entry
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 mt-0.5 sm:mt-1 truncate">
              {selectedClassData?.name || 'Select a class'} • {term} {year}
            </p>
            {selectedClass && isOnlyFormTeacher && (
              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                <AlertCircle size={12} />
                You're the form teacher but don't teach any subjects in this class. You cannot enter results.
              </p>
            )}
          </div>
          
          {/* Action Buttons */}
          {selectedClass && selectedSubject && students.length > 0 && availableExamTypes.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              
              {/* Download Button */}
              <button
                onClick={handleDownloadMarks}
                className={`
                  inline-flex items-center justify-center gap-1 sm:gap-2
                  bg-green-600 text-white rounded-xl hover:bg-green-700
                  font-medium transition-all active:scale-[0.98]
                  focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2
                  px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base
                  ${isSmallMobile ? 'flex-1' : ''}
                `}
              >
                <Download size={16} />
                <span className="hidden xs:inline">Download</span>
              </button>

              {/* Edit Button */}
              {hasExistingResults && !isEditMode && (
                <button
                  onClick={handleEditResults}
                  disabled={isEditing}
                  className={`
                    inline-flex items-center justify-center gap-1 sm:gap-2
                    bg-amber-600 text-white rounded-xl hover:bg-amber-700
                    font-medium transition-all active:scale-[0.98]
                    focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2
                    disabled:opacity-50 disabled:cursor-not-allowed
                    px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base
                    ${isSmallMobile ? 'flex-1' : ''}
                  `}
                >
                  {isEditing ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Edit3 size={16} />
                  )}
                  <span className="hidden xs:inline">Edit</span>
                </button>
              )}

              {/* Save Button */}
              {(!isExamCompleted || isEditMode) && (
                <button
                  onClick={handleSaveResults}
                  disabled={isSaving || filledCount === 0 || isCurrentExamLocked}
                  className={`
                    inline-flex items-center justify-center gap-1 sm:gap-2
                    ${isEditMode ? 'bg-amber-600' : 'bg-blue-600'} 
                    text-white rounded-xl hover:bg-opacity-90
                    font-medium transition-all active:scale-[0.98]
                    focus:outline-none focus:ring-2 focus:ring-offset-2
                    ${isEditMode ? 'focus:ring-amber-500' : 'focus:ring-blue-500'}
                    disabled:opacity-50 disabled:cursor-not-allowed
                    px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base
                    ${isSmallMobile ? 'flex-1' : ''}
                  `}
                >
                  {isSaving ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                  <span className="hidden xs:inline">
                    {isEditMode ? 'Update' : 'Save'}
                  </span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Edit Mode Indicator */}
        <EditModeIndicator isEditing={isEditMode} onCancelEdit={handleCancelEdit} />

        {/* Drafts Section */}
        {drafts.length > 0 && !isEditMode && selectedSubject && (
          <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4">
            <div className="flex items-center gap-1 sm:gap-2 mb-2 sm:mb-3">
              <History size={14} className="text-gray-500 flex-shrink-0" />
              <h3 className="text-xs sm:text-sm font-medium text-gray-700">Your Drafts</h3>
              <span className="text-[10px] sm:text-xs text-gray-500">(Auto-saved)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
              {drafts.map(draft => (
                <DraftCard
                  key={draft.id}
                  draft={draft}
                  onLoad={() => handleLoadDraft(draft)}
                  onDelete={() => handleDeleteDraft(draft.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            
            {/* Class Select */}
            <div className="min-w-0">
              <label className="block text-[10px] sm:text-xs font-medium text-gray-600 mb-0.5 sm:mb-1">
                Class <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedClass}
                onChange={e => {
                  setSelectedClass(e.target.value);
                  setSelectedSubject('');
                  setIsEditMode(false);
                }}
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs sm:text-sm bg-white truncate"
                disabled={assignedClasses.length === 0 || isEditMode}
              >
                <option value="">Select class...</option>
                {assignedClasses.map(cls => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} ({cls.students || 0})
                  </option>
                ))}
              </select>
            </div>
            
            {/* Subject Select */}
            <div className="min-w-0">
              <label className="block text-[10px] sm:text-xs font-medium text-gray-600 mb-0.5 sm:mb-1">
                Subject <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedSubject}
                onChange={e => {
                  setSelectedSubject(e.target.value);
                  setIsEditMode(false);
                }}
                className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs sm:text-sm bg-white truncate"
                disabled={!selectedClass || availableSubjects.length === 0 || isEditMode}
              >
                <option value="">
                  {!selectedClass ? 'Select class first' : 
                   availableSubjects.length === 0 ? 'No subjects (form teacher only)' : 'Select subject...'}
                </option>
                {availableSubjects.map(subject => (
                  <option key={subject} value={subject} className="truncate">{subject}</option>
                ))}
              </select>
              {selectedClass && availableSubjects.length === 0 && (
                <p className="text-[10px] text-amber-600 mt-1">
                  You're the form teacher but don't teach any subjects in this class.
                </p>
              )}
            </div>
            
            {/* Term & Year */}
            <div className="grid grid-cols-2 gap-1 sm:gap-2">
              <div className="min-w-0">
                <label className="block text-[10px] sm:text-xs font-medium text-gray-600 mb-0.5 sm:mb-1">
                  Term
                </label>
                <select
                  value={term}
                  onChange={e => {
                    setTerm(e.target.value);
                    setIsEditMode(false);
                  }}
                  className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs sm:text-sm bg-white"
                  disabled={isEditMode}
                >
                  <option value="Term 1">T1</option>
                  <option value="Term 2">T2</option>
                  <option value="Term 3">T3</option>
                </select>
              </div>
              <div className="min-w-0">
                <label className="block text-[10px] sm:text-xs font-medium text-gray-600 mb-0.5 sm:mb-1">
                  Year
                </label>
                <input
                  type="number"
                  value={year}
                  onChange={e => {
                    setYear(parseInt(e.target.value) || new Date().getFullYear());
                    setIsEditMode(false);
                  }}
                  className="w-full px-2 sm:px-3 py-1.5 sm:py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs sm:text-sm"
                  min="2020"
                  max="2030"
                  disabled={isEditMode}
                />
              </div>
            </div>
            
            {/* Exam Config Summary */}
            {currentExamConfig && (
              <div className="min-w-0 bg-blue-50 rounded-lg p-2 flex items-center gap-2">
                <GraduationCap size={14} className="text-blue-600 flex-shrink-0" />
                <span className="text-xs text-blue-700">
                  {availableExamTypes.length} of 3 exams configured
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Subject Progress - FIXED: Now shows correct percentage based on configured exams */}
        {selectedClass && selectedSubject && currentSubjectCompletion && availableExamTypes.length > 0 && (
          <SubjectProgress 
            completion={currentSubjectCompletion}
            selectedExamType={examType}
            onExamTypeChange={handleExamTypeChange}
            hasDraft={!!currentDraft}
            availableExamTypes={availableExamTypes}
            examConfig={currentExamConfig}
          />
        )}

        {/* Results Entry */}
        {loadingStudents ? (
          <TableSkeleton />
        ) : (
          <>
            <EmptyState 
              hasClass={!!selectedClass}
              hasSubject={!!selectedSubject}
              hasStudents={students.length > 0}
              noExamsConfigured={noExamsConfigured}
            />
            
            {selectedClass && selectedSubject && students.length > 0 && availableExamTypes.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                
                {/* Header */}
                <div className="px-3 sm:px-4 py-2 sm:py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                    <Users size={14} className="text-gray-500 flex-shrink-0" />
                    <span className="font-medium text-gray-900 text-xs sm:text-sm truncate">
                      {selectedClassData?.name} • {selectedSubject}
                    </span>
                    {currentDraft && !isEditMode && (
                      <span className="text-[10px] sm:text-xs bg-yellow-100 text-yellow-700 px-1.5 sm:px-2 py-0.5 rounded-full whitespace-nowrap">
                        Draft
                      </span>
                    )}
                    {isEditMode && (
                      <span className="text-[10px] sm:text-xs bg-amber-100 text-amber-700 px-1.5 sm:px-2 py-0.5 rounded-full whitespace-nowrap">
                        Edit Mode
                      </span>
                    )}
                  </div>
                  
                  {/* Progress - This shows marks entry progress, not exam completion */}
                  <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                    <span className="text-[10px] sm:text-xs text-gray-500">
                      {filledCount}/{totalStudents}
                    </span>
                    <div className="w-16 sm:w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full transition-all duration-300"
                        style={{ width: `${completionPercentage}%` }}
                      />
                    </div>
                    {filledCount > 0 && !isExamCompleted && !isEditMode && (
                      <button
                        onClick={() => {
                          if (confirm('Clear all entered marks?')) {
                            setStudents(students.map(s => ({ ...s, marks: '' })));
                          }
                        }}
                        className="text-[10px] sm:text-xs text-gray-500 hover:text-gray-700 hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Mobile-Optimized Card List */}
                {isMobile ? (
                  <div className="divide-y divide-gray-100">
                    {students.map((student, index) => {
                      const existingMark = currentSubjectCompletion?.enteredStudentIds?.[examType]?.includes(student.studentId)
                        ? currentSubjectCompletion?.savedMarks?.[student.studentId]
                        : null;

                      return (
                        <StudentRow
                          key={student.id}
                          student={student}
                          index={index}
                          totalMarks={totalMarks}
                          onMarksChange={handleMarksChange}
                          inputRef={{
                            current: inputElements.current.get(student.id) || null
                          }}
                          onEnterPress={() => focusNextInput(student.id)}
                          isMobile={true}
                          disabled={isExamCompleted && !isEditMode}
                          showExistingMark={existingMark}
                          onMarkAbsent={handleMarkAbsent}
                        />
                      );
                    })}
                  </div>
                ) : (
                  /* Desktop Table */
                  <div className="overflow-x-auto" ref={tableContainerRef}>
                    <table className="w-full">
                      <thead className="bg-gray-50 text-xs">
                        <tr>
                          <th className="px-3 py-2 sm:py-3 text-left font-medium text-gray-600 w-10 sm:w-12">#</th>
                          <th className="px-3 py-2 sm:py-3 text-left font-medium text-gray-600">Student</th>
                          <th className="px-3 py-2 sm:py-3 text-left font-medium text-gray-600">Marks</th>
                          <th className="px-3 py-2 sm:py-3 text-left font-medium text-gray-600">Grade</th>
                          <th className="px-3 py-2 sm:py-3 text-left font-medium text-gray-600 w-16">Absent</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {students.map((student, index) => {
                          const existingMark = currentSubjectCompletion?.enteredStudentIds?.[examType]?.includes(student.studentId)
                            ? currentSubjectCompletion?.savedMarks?.[student.studentId]
                            : null;

                          return (
                            <StudentRow
                              key={student.id}
                              student={student}
                              index={index}
                              totalMarks={totalMarks}
                              onMarksChange={handleMarksChange}
                              inputRef={{
                                current: inputElements.current.get(student.id) || null
                              }}
                              onEnterPress={() => focusNextInput(student.id)}
                              isMobile={false}
                              disabled={isExamCompleted && !isEditMode}
                              showExistingMark={existingMark}
                              onMarkAbsent={handleMarkAbsent}
                            />
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                
                {/* Status Messages */}
                {!isExamCompleted && !isCurrentExamLocked && !isEditMode && (
                  <div className="px-3 sm:px-4 py-2 bg-gray-50 border-t border-gray-200 text-[10px] sm:text-xs text-gray-500 flex flex-wrap items-center gap-2 sm:gap-4">
                    <span>⏎ Enter: next</span>
                    <span>X: absent (click absent button)</span>
                    <span>0-{totalMarks}: marks</span>
                    <span className="ml-auto">Auto-saved</span>
                  </div>
                )}
                
                {isEditMode && (
                  <div className="px-3 sm:px-4 py-3 bg-amber-50 border-t border-amber-200 text-xs sm:text-sm text-amber-700 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Edit3 size={16} />
                      <span>✎ Editing existing results.</span>
                    </div>
                  </div>
                )}
                
                {isExamCompleted && !isEditMode && (
                  <div className="px-3 sm:px-4 py-3 bg-green-50 border-t border-green-200 text-xs sm:text-sm text-green-700 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle size={16} />
                      <span>✓ Results are complete</span>
                    </div>
                    <button
                      onClick={handleEditResults}
                      disabled={isEditing}
                      className="text-xs bg-green-100 hover:bg-green-200 px-2 sm:px-3 py-1 rounded-full transition-colors flex items-center gap-1"
                    >
                      <Edit3 size={12} />
                      <span>Edit</span>
                    </button>
                  </div>
                )}
                
                {isCurrentExamLocked && !isExamCompleted && (
                  <div className="px-3 sm:px-4 py-3 bg-yellow-50 border-t border-yellow-200 text-xs sm:text-sm text-yellow-700 flex items-center gap-2">
                    <Lock size={16} />
                    <span>🔒 Complete previous exam type to unlock</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* No Classes State */}
        {!loadingClasses && assignedClasses.length === 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-yellow-100 rounded-full mb-3 sm:mb-4">
              <BookOpen className="text-yellow-600" size={isMobile ? 24 : 32} />
            </div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1 sm:mb-2">No Classes Assigned</h3>
            <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto">
              You haven't been assigned to any classes yet. Contact your administrator to get teaching assignments.
            </p>
          </div>
        )}

        {/* Form Teacher Only State */}
        {selectedClass && isOnlyFormTeacher && !selectedSubject && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-amber-100 rounded-full mb-3 sm:mb-4">
              <AlertCircle className="text-amber-600" size={isMobile ? 24 : 32} />
            </div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-1 sm:mb-2">Form Teacher Only</h3>
            <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto">
              You're the form teacher for this class but don't teach any subjects. Form teachers cannot enter results. Only subject teachers can enter marks.
            </p>
          </div>
        )}
      </div>

      {/* PDF Preview Modal */}
      {selectedSubject && (
        <MarksPDFPreview
          isOpen={showPDFPreview}
          onClose={() => setShowPDFPreview(false)}
          students={students}
          classInfo={selectedClassData}
          subject={selectedSubject}
          examType={examType}
          term={term}
          year={year}
          totalMarks={totalMarks}
          onDownload={handleGeneratePDF}
          allExamData={allExamData}
          loadingAllData={loadingAllData}
        />
      )}
    </DashboardLayout>
  );
}